// La fuga de bytes del borrador, comprobada sin navegador y sin IndexedDB.
//
//   cd ~/Development/Proyectos/luparx-evolution/frontend
//   node apps/inspector/src/lib/__checks__/fugaBlobsBorrador.check.mjs
//
// Por qué existe. Las claves de foto son `draft:<inquilino>:<índice>:<capturedAt>`: el índice es
// parte del nombre, así que cambiar el ORDEN de la lista ya deja claves sin dueño. `guardarBorrador`
// pisaba el registro de `localStorage` sin tocar esos bytes y nadie volvía a nombrarlos: hasta
// 60 MB por borrador abandonado (6 fotos × 10 MB), dentro de un almacenamiento que iPadOS desaloja
// cuando se llena. Lo que esa fuga termina disparando es el aviso de almacenamiento degradado que
// la Fase 1A acaba de enseñar a dar — la aplicación acusándose a sí misma.
//
// Acá se EJECUTA la regla (no se mira con una expresión regular): `clavesHuerfanas` se compila y se
// corre. Lo que sí se comprueba leyendo el fuente es el ORDEN de las operaciones, que no se puede
// observar desde fuera y es donde está el riesgo de perder evidencia.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(AQUI, '../../../../..');
const MODULO = readFileSync(resolve(AQUI, '../citationDraft.ts'), 'utf8');
const PAGINA = readFileSync(resolve(AQUI, '../../pages/NewCitationPage.tsx'), 'utf8');

let fallos = 0;
const ok = (c, m, d = '') => {
  if (c) console.log('  ok  ', m);
  else { fallos += 1; console.log('  FALLA:', m, d ? `— ${d}` : ''); }
};

// ── se compila de verdad y se ejecuta ─────────────────────────────────────────────────────────
// CommonJS a propósito: resuelve `./photoStore` sin extensión, que es como está escrito el import.
const dir = mkdtempSync(join(tmpdir(), 'fuga-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node',
      '--skipLibCheck', '--outDir', dir,
      resolve(AQUI, '../citationDraft.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  const salida = String(e.stdout || '') + String(e.stderr || '');
  if (!salida.includes('Cannot find module') && !salida.includes('TS2307')) {
    console.error(salida);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
}
const requerir = createRequire(import.meta.url);
const { clavesHuerfanas, fotosPerdidasDe } = requerir(join(dir, 'citationDraft.js'));
const { deletePhoto, deletePhotos } = requerir(join(dir, 'photoStore.js'));
const FOTOS = readFileSync(resolve(AQUI, '../photoStore.ts'), 'utf8');

console.log('clavesHuerfanas · la diferencia contra el registro anterior');
const k = (i, t) => `draft:tenant-sanjose:${i}:${t}`;

ok(typeof clavesHuerfanas === 'function', 'la regla está exportada y se puede ejecutar');
ok(clavesHuerfanas([], []).length === 0, 'sin fotos antes ni después no hay nada que borrar');
ok(clavesHuerfanas([], [k(0, 'T1')]).length === 0, 'la primera foto de un borrador nuevo no deja huérfanas');

// El caso que nombra el diagnóstico: se borra la foto 0 y la 1 pasa a 0 con otro capturedAt.
const antes = [k(0, 'T1'), k(1, 'T2')];
const despues = [k(0, 'T2')];
const huerfanas = clavesHuerfanas(antes, despues);
ok(huerfanas.length === 2, 'al borrar la foto 0, las DOS claves viejas quedan huérfanas', JSON.stringify(huerfanas));
ok(huerfanas.includes(k(0, 'T1')), '  la de la foto borrada');
ok(huerfanas.includes(k(1, 'T2')), '  y la de la que se desplazó, que es la que nadie veía');

// Lo contrario importa igual: no borrar bytes que el registro nuevo sigue nombrando.
ok(clavesHuerfanas([k(0, 'T1')], [k(0, 'T1')]).length === 0, 'una clave que se conserva NO se borra');
ok(
  clavesHuerfanas([k(0, 'T1'), k(1, 'T2')], [k(0, 'T1'), k(1, 'T2'), k(2, 'T3')]).length === 0,
  'agregar una tercera foto no toca las dos que ya estaban',
);
ok(
  clavesHuerfanas([k(0, 'T1'), k(1, 'T2'), k(2, 'T3')], []).length === 3,
  'descartar todas las fotos deja las tres para borrar',
);
/*
  Sólo del borrador. En la MISMA base viven las fotos de la cola —boletas ya emitidas esperando
  señal—, y su clave real es `<idBoleta>:<uuid>` (`citationQueue.ts:248`): **sin prefijo alguno**.
  Eso es lo que vuelve inviable el barrido por prefijo que proponía el diagnóstico: no hay forma de
  mirar un nombre y decidir que es basura, y equivocarse ahí borra evidencia de una boleta emitida.
  La diferencia contra el registro anterior no necesita adivinar nada.
*/
const deLaCola = '4f1c9e02-7a55-4c31-9d8e-2b6a0c1f3d44:8e2b-foto';
ok(
  !clavesHuerfanas([k(0, 'T1')], [k(0, 'T1')]).includes(deLaCola) &&
    clavesHuerfanas([deLaCola], [k(0, 'T1')]).includes(deLaCola) === true,
  'la diferencia sólo mira lo que el registro anterior nombraba, no barre la base por prefijo',
);

console.log('\nel orden de las operaciones, que es donde se pierde evidencia');
const cuerpo = MODULO.slice(MODULO.indexOf('export async function guardarBorrador'));
const iLee = cuerpo.indexOf('leerBorradorSinCaducar');
const iEscribe = cuerpo.indexOf('localStorage.setItem');
const iBorra = cuerpo.indexOf('deletePhotos(huerfanas)');
ok(iLee >= 0 && iEscribe >= 0 && iBorra >= 0, 'guardarBorrador lee lo anterior, escribe y borra');
ok(iLee < iEscribe, 'lee las claves anteriores ANTES de pisar el registro', `${iLee} < ${iEscribe}`);
ok(
  iEscribe < iBorra,
  'y borra los bytes DESPUÉS de que el registro nuevo quedó escrito — al revés, una escritura fallida dejaría un borrador que se ofrece y no puede restaurar nada',
  `${iEscribe} < ${iBorra}`,
);
ok(
  /if \(huerfanas\.length > 0\) void deletePhotos\(huerfanas\);/.test(MODULO),
  'el borrado no se espera: son bytes que ya nadie nombra y el autoguardado corre cada 800 ms',
);

console.log('\nel borrador caducado que nadie volvía a tocar');
ok(/export async function limpiarSiCaduco/.test(MODULO), 'existe la limpieza de entrada');
/*
  Acá vivía una aserción que exigía la condición de una sola línea
  `if (leerBorradorSinCaducar(tenantId) && !leerBorrador(tenantId))`. El 17-10-2026 falló, y lo que
  estaba viejo era ella: `limpiarSiCaduco` pasó a distinguir tres casos —vigente, caducado legible,
  caducado ilegible— porque el tercero no estaba cubierto y su comentario decía que sí.

  NO se ablandó: se reemplaza por las tres aserciones de (c) más abajo, que exigen MÁS que ésta.
  La invariante que importaba —un borrador vigente no se toca— sigue comprobada, ahora por su
  propia línea en vez de por una expresión regular que miraba la forma del `if`.
*/
ok(/void limpiarSiCaduco\(activeTenant\?\.id \?\? null\);/.test(PAGINA), 'la pantalla la llama al entrar');
const efecto = PAGINA.slice(PAGINA.indexOf('setBorradorPrevio(leerBorrador('));
ok(
  efecto.indexOf('limpiarSiCaduco') < efecto.indexOf('}, [activeTenant?.id, submitted]);'),
  'dentro del mismo efecto de entrada, no en uno suelto que pueda correr en otro momento',
);
ok(
  MODULO.indexOf('deletePhotos') > 0 && /import \{[^}]*deletePhotos[^}]*\} from '\.\/photoStore'/.test(MODULO),
  'deletePhotos se importa del almacén de fotos y no se reimplementa acá',
);


// ══ Integridad de la evidencia · las cinco condiciones del §3.4 de la orden ═══════════════════
console.log('\nintegridad de la evidencia (§3.4)');

// (a) Lo vigente conserva sus fotos. Una lista sin cambios no produce ni una sola baja.
const vigentes = [k(0, 'T1'), k(1, 'T2'), k(2, 'T3')];
ok(clavesHuerfanas(vigentes, vigentes).length === 0, 'a · un borrador vigente no pierde ninguna foto');

// (a-bis) Las boletas ENCOLADAS viven en el mismo almacén y nunca entran en el cálculo: sólo se
// comparan las claves que el registro del borrador nombraba.
const cola = ['4f1c9e02-7a55-4c31-9d8e-2b6a0c1f3d44:8e2b-foto', '7b0d-otra-boleta:1a9f-foto'];
ok(
  clavesHuerfanas(vigentes, []).every((c) => !cola.includes(c)),
  'a · las fotos de boletas encoladas nunca aparecen entre las bajas',
);

// (b) Aislamiento por municipalidad: el registro de un inquilino sólo nombra claves suyas, y la
// diferencia no puede inventar una de otro.
const otroInquilino = 'draft:tenant-cartago:0:T1';
ok(
  !clavesHuerfanas([k(0, 'T1')], []).includes(otroInquilino),
  'b · la limpieza de una municipalidad no alcanza a los datos de otra',
);
ok(
  clavesHuerfanas([otroInquilino], [otroInquilino]).length === 0,
  'b · y una clave de otra municipalidad que sigue vigente tampoco se toca',
);

// (c) Registro ilegible: se retira el registro, NO sus bytes — no se sabe qué claves nombraba.
const limpiarSiCaducoFuente = MODULO.slice(MODULO.indexOf('export async function limpiarSiCaduco'));
const finLimpiarSiCaduco = limpiarSiCaducoFuente.indexOf('\n}\n');
const cuerpoCaduco = limpiarSiCaducoFuente.slice(0, finLimpiarSiCaduco);
ok(/if \(leerBorrador\(tenantId\)\) return;/.test(cuerpoCaduco), 'c · un borrador vigente sale antes de tocar nada');
ok(
  /const legible = leerBorradorSinCaducar\(tenantId\);/.test(cuerpoCaduco) &&
    /if \(legible\) \{[\s\S]*?await limpiarBorrador\(tenantId\);/.test(cuerpoCaduco),
  'c · caducado y LEGIBLE: se va con sus bytes, que se saben cuáles son',
);
ok(
  /hayRegistro/.test(cuerpoCaduco) && !/deletePhoto/.test(cuerpoCaduco),
  'c · caducado e ILEGIBLE: se retira el registro y NO se borra ningún byte',
);

// (d) Un borrado que el almacén rechaza no se cuenta como hecho. Se EJECUTA: en Node no hay
// IndexedDB, así que `openDb` rechaza y es exactamente el caso «el almacén se negó».
ok(typeof globalThis.indexedDB === 'undefined', 'd · el entorno de la prueba no tiene IndexedDB, que es el caso a medir');
const unaSola = await deletePhoto('draft:tenant-sanjose:0:T1');
ok(unaSola === false, 'd · deletePhoto devuelve false cuando el almacén se niega', String(unaSola));
const varias = await deletePhotos([k(0, 'T1'), k(1, 'T2')]);
ok(
  varias.borradas === 0 && varias.fallidas === 2,
  'd · deletePhotos no cuenta como borradas las que fallaron',
  JSON.stringify(varias),
);
ok(
  /const \{ fallidas \} = await deletePhotos\(/.test(MODULO) && /if \(fallidas > 0\) marcarEscrituraFallida\('fotos'\);/.test(MODULO),
  'd · y el fallo se INFORMA por el aviso de almacenamiento degradado que ya existe',
);
ok(
  /return true;/.test(FOTOS) && /return false;/.test(FOTOS),
  'd · photoStore devuelve el resultado en vez de tragarse la excepción',
);

// (e) Ninguna de estas comprobaciones toca datos reales: no hay IndexedDB ni localStorage acá, y
// lo que se ejecuta son funciones puras. Si alguien agrega un `window` a este archivo, esto lo dice.
ok(typeof globalThis.window === 'undefined', 'e · la prueba corre sin `window`: no hay datos reales que tocar');
ok(typeof globalThis.localStorage === 'undefined', 'e · ni `localStorage`');


// ══ Fase 2 · la pérdida de fotografías se cuenta contra las que el fiscalizador TENÍA ═════════
console.log('\nfotosPerdidasDe · incremento de Fase 2 (17-10-2026)');

const reg = (guardadas, intentadas) => ({
  fotos: Array.from({ length: guardadas }, (_, i) => ({ claveFoto: k(i, `T${i}`) })),
  ...(intentadas === undefined ? {} : { fotosIntentadas: intentadas }),
});

ok(typeof fotosPerdidasDe === 'function', 'la regla está exportada y se ejecuta');
ok(fotosPerdidasDe(reg(3, 3), 3) === 0, 'nada se perdió: tres guardadas, tres restauradas');
ok(fotosPerdidasDe(reg(3, 3), 1) === 2, 'dos desaparecieron entre sesiones (almacenamiento desalojado)');

// El defecto que este incremento corrige: el fiscalizador tenía 5 y sólo 3 se pudieron guardar.
// Antes la cuenta era `b.fotos.length - restauradas` = 3 − 3 = 0, y la pantalla callaba.
ok(
  fotosPerdidasDe(reg(3, 5), 3) === 2,
  'dos NUNCA se guardaron y la pantalla lo dice, aunque las tres del registro estén intactas',
  String(fotosPerdidasDe(reg(3, 5), 3)),
);
ok(
  fotosPerdidasDe(reg(3, 5), 1) === 4,
  'y las dos pérdidas se suman: dos que no se guardaron + dos que ya no están',
  String(fotosPerdidasDe(reg(3, 5), 1)),
);

// Compatibilidad: un borrador escrito por la versión anterior no trae el campo.
ok(
  fotosPerdidasDe(reg(3, undefined), 2) === 1,
  'un borrador de la versión anterior se cuenta como antes y no empeora',
);
ok(fotosPerdidasDe(reg(0, 0), 0) === 0, 'un borrador sin fotos no inventa pérdidas');
ok(fotosPerdidasDe(reg(2, 2), 5) === 0, 'la cuenta nunca es negativa');

ok(/fotosIntentadas: b\.fotos\.length,/.test(MODULO), 'guardarBorrador registra cuántas tenía, que es el dato que faltaba');
ok(
  /setFotosPerdidas\(fotosPerdidasDe\(b, fotos\.length\)\);/.test(PAGINA),
  'y la pantalla usa la regla única en vez de restar por su cuenta',
);
ok(/fotosIntentadas\?: number;/.test(MODULO), 'el campo es opcional: un registro viejo sigue siendo legible');

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
