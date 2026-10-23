// La cola: el reintento que una PERSONA pide, y las fotografías que no deben quedar huérfanas.
//
//   cd ~/Development/Proyectos/luparx-evolution/frontend
//   node apps/inspector/src/lib/__checks__/colaForzadaYHuerfanas.check.mjs
//
// Por qué existe (22-10-2026, Fase 3). Dos defectos distintos, los dos de pérdida de datos:
//
//   1. `flushQueue` se rendía ante `navigator.onLine === false` sin decir nada, y el botón
//      «Reintentar ahora» se deshabilitaba con la misma señal. El navegador documenta `onLine` como
//      no confiable en positivo, y en la práctica también se queda pegado en `false` al despertar de
//      suspensión o con algunas VPN. Las dos cosas juntas dejaban un callejón sin salida: la cola
//      congelada, el botón muerto y ninguna explicación. Un turno de boletas atrapado en el aparato.
//
//   2. `enqueueCitation` escribía las fotografías en IndexedDB una por una y, si una fallaba a mitad
//      del bucle, la excepción salía de la función: la fila NO se comprometía y las ya escritas
//      quedaban sin dueño. El fiscalizador perdía la boleta y el aparato quedaba más lleno, de modo
//      que el intento siguiente fallaba más temprano.
//
// Qué prueba y qué no. Se LEE el archivo real para exigir que las piezas sigan donde están, y la
// decisión de la compuerta se transcribe en JavaScript plano —la convención de `__checks__` en este
// repositorio, que corre con `node` y sin empaquetador—. Lo que no prueba es IndexedDB de verdad
// fallando en un navegador: eso le toca a un arnés de Playwright o a un aparato.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const COLA = readFileSync(resolve(AQUI, '../citationQueue.ts'), 'utf8');
const CONSULTAS = readFileSync(resolve(AQUI, '../queries.ts'), 'utf8');
const PANTALLA = readFileSync(resolve(AQUI, '../../pages/QueuePage.tsx'), 'utf8');
const ERRORES = readFileSync(resolve(AQUI, '../apiErrors.ts'), 'utf8');

let fallos = 0;
const ok = (c, m, d) => {
  if (!c) { console.log('  FALLA:', m, d ? `— ${d}` : ''); fallos += 1; } else console.log('  ok  ', m);
};

// ── 1. El reintento forzado existe y llega de punta a punta ───────────────────────────────────
console.log('el reintento que pide una persona');
ok(/opciones\?: \{ forzado\?: boolean \}/.test(COLA),
  'flushQueue acepta `forzado`');
ok(/if \(!forzado && typeof navigator !== 'undefined' && navigator\.onLine === false\) return 'sin-red';/.test(COLA),
  'y la compuerta de `onLine` sólo se aplica cuando NO es forzado');
ok(/export type ResultadoEnvio/.test(COLA),
  'flushQueue devuelve un resultado con nombre, en vez de no devolver nada');
ok(/retryAll: async \(\) => \{[\s\S]{0,120}return enviar\(true\);/.test(CONSULTAS),
  'retryAll fuerza el envío');
ok(/const flush = useCallback\(async \(\) => \{\s*await enviar\(false\);/.test(CONSULTAS),
  'y el barrido automático NO lo fuerza: ahí `onLine` sigue siendo un atajo barato');
ok(/retryAll: \(\) => Promise<ResultadoEnvio>/.test(CONSULTAS),
  'el tipo de retryAll obliga a quien lo llame a recibir el resultado');

console.log('\nla pantalla cuenta qué pasó');
ok(/disabled=\{queue\.pending === 0\}/.test(PANTALLA),
  'el botón ya no se deshabilita por falta de red, sólo si no hay nada que enviar');
ok(!/disabled=\{!online \|\| queue\.pending === 0\}/.test(PANTALLA),
  'y la condición vieja —la que creaba el callejón sin salida— ya no está');
ok(/setResultadoReintento/.test(PANTALLA) && /RESULTADO_CLAVE\[resultadoReintento\]/.test(PANTALLA),
  'el resultado del intento se guarda y se dibuja');
for (const clave of ['intentado', "'sin-red'", "'en-curso'", "'nada-pendiente'"]) {
  ok(new RegExp(`${clave.replace(/[']/g, "'")}: 'inspector\\.queue\\.retry\\.`).test(PANTALLA),
    `y hay una frase para el resultado ${clave}`);
}

// ── 2. Las fotografías huérfanas ──────────────────────────────────────────────────────────────
console.log('\nlas fotografías que no se pudieron guardar');
ok(/const escritas: string\[\] = \[\];/.test(COLA),
  'enqueueCitation recuerda qué claves ya escribió');
ok(/\} catch \{[\s\S]{0,400}await deletePhotos\(escritas\)/.test(COLA),
  'y si una falla, borra las anteriores en vez de dejarlas sin dueño');
ok(/marcarEscrituraFallida\('fotos'\)/.test(COLA),
  'enciende el aviso de almacenamiento, para que la pantalla lo diga');
ok(/throw new Error\('EVIDENCE_STORE_FAILED'\)/.test(COLA),
  'y lanza un código propio en vez del error crudo de IndexedDB');
ok(/EVIDENCE_STORE_FAILED: 'inspector\.queue\.error\.EVIDENCE_STORE_FAILED'/.test(ERRORES),
  'que apiErrors sabe traducir a una frase');
ok(/const codigoPropio = error instanceof Error && !\(error instanceof ApiError\)/.test(ERRORES),
  'y apiErrorMessage reconoce los códigos propios antes de rendirse a «algo salió mal»');
ok(/EVIDENCE_STORE_FAILED/.test(COLA) && !/'EVIDENCE_STORE_FAILED',\s*\n\]\)/.test(COLA),
  'no se metió en TERMINAL_CODES: ese código se lanza al capturar, no al enviar, y nunca pasa por describe()');

// ── 3. La decisión de la compuerta, transcrita ────────────────────────────────────────────────
console.log('\nla compuerta, caso por caso');
function compuerta({ tenantId, enCurso, onLine, forzado, vencidas }) {
  if (!tenantId) return 'nada-pendiente';
  if (enCurso) return 'en-curso';
  if (!forzado && onLine === false) return 'sin-red';
  if (vencidas === 0) return 'nada-pendiente';
  return 'intentado';
}
const base = { tenantId: 't1', enCurso: false, onLine: true, forzado: false, vencidas: 2 };
ok(compuerta(base) === 'intentado', 'con red y filas vencidas, se intenta');
ok(compuerta({ ...base, onLine: false }) === 'sin-red',
  'sin red y sin forzar, no se toca nada y se dice');
ok(compuerta({ ...base, onLine: false, forzado: true }) === 'intentado',
  'sin red PERO forzado, se intenta igual — es el callejón que esto abre');
ok(compuerta({ ...base, enCurso: true, forzado: true }) === 'en-curso',
  'forzar no atropella una tanda en curso: eso enviaría dos veces');
ok(compuerta({ ...base, vencidas: 0 }) === 'nada-pendiente',
  'sin filas vencidas se dice «nada», no «intentado»');
ok(compuerta({ ...base, tenantId: null }) === 'nada-pendiente',
  'sin municipalidad activa no hay cola que vaciar');

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
