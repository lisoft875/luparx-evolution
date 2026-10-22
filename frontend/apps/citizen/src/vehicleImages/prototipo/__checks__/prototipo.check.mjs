/**
 * El emparejamiento de la biblioteca de prototipo, comprobado sin navegador y sin empaquetador.
 *
 * <p>Lo que se mide es la regla que no puede equivocarse: que a nadie se le muestre un vehículo
 * que no es el suyo. Una moto dibujada como sedán, un color inventado para quien no lo declaró, o
 * una de las tres carrocerías mal recoloreadas colándose en la pantalla, son los tres errores que
 * esta integración podía cometer y los tres se comprueban acá.</p>
 *
 *   node apps/citizen/src/vehicleImages/prototipo/__checks__/prototipo.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'prototipo-'));
try {
  // Se compila el TS real y no una copia: una prueba contra una transcripción comprueba la
  // transcripción, no el código que se despliega.
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir, '--rootDir', join(raiz, 'apps/citizen/src'),
      join(raiz, 'apps/citizen/src/vehicleImages/prototipo/catalogoPrototipo.ts')],
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

/*
  `tsc` deja los imports relativos tal y como están escritos —`from '../catalogo'`— y Node, al
  cargar módulos ES desde el disco, exige la extensión. Se la agrega acá, sobre lo emitido, en vez
  de escribirla en el código fuente: el empaquetador no la quiere y el resto del proyecto no la
  usa, así que ponerla en el `.ts` sería deformar el código para que la prueba funcione.
*/
for (const archivo of ['vehicleImages/prototipo/catalogoPrototipo.js', 'vehicleImages/catalogo.js']) {
  const ruta = join(dir, archivo);
  if (!existsSync(ruta)) continue;
  writeFileSync(ruta, readFileSync(ruta, 'utf8')
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]*?)(['"])/g, (_, a, ruta_, c) =>
      /\.[a-z]+$/.test(ruta_) ? `${a}${ruta_}${c}` : `${a}${ruta_}.js${c}`));
}

const mod = await import(join(dir, 'vehicleImages/prototipo/catalogoPrototipo.js'));
const { carroceriaDe, colorDe, elegirPrototipo, claveDeArchivo, esCarroceriaOfrecida,
  CARROCERIAS, CARROCERIAS_ENTREGADAS, COLORES_PROTOTIPO, EQUIVALENCIAS,
  CARROCERIAS_OFRECIDAS, ETIQUETA_DE_CARROCERIA } = mod;

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos += 1; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

console.log('\n-- la carrocería, a partir de lo que el servidor dice --');

/*
  EL CATÁLOGO REAL TIENE DOS TIPOS, no cinco. `V16_0__vehicle_type_car_or_motorcycle` retiró
  PICKUP, VAN y OTHER. La primera versión de este archivo probaba las cinco del transporte
  simulado, que llevaba dieciocho versiones desactualizado, y por eso no vio que las veinte
  imágenes de pick-up y furgoneta eran inalcanzables desde un dato real.
*/
const TIPOS_DEL_SERVIDOR = ['CAR', 'MOTORCYCLE'];

check('un automóvil sin marca conocida es un sedán',
  carroceriaDe({ type: 'CAR' }) === 'sedan', String(carroceriaDe({ type: 'CAR' })));
check('el catálogo del servidor tiene DOS tipos y los dos están contemplados',
  TIPOS_DEL_SERVIDOR.every((t) => carroceriaDe({ type: t }) !== undefined));
check('los tipos que V16_0 retiró ya NO se emparejan por tipo',
  carroceriaDe({ type: 'PICKUP' }) === null && carroceriaDe({ type: 'VAN' }) === null,
  `${carroceriaDe({ type: 'PICKUP' })} / ${carroceriaDe({ type: 'VAN' })}`);

/*
  La comprobación que más importa de esta sección. Entre las diez carrocerías NO hay moto; el
  componente del paquete caía a «sedán» por omisión, y eso le habría puesto un automóvil a cada
  motociclista de la aplicación. Acá no hay imagen y manda el dibujo, que sí tiene silueta de moto.
*/
/*
  La moto apunta a su propia carrocería, `moto`, que desde la noche del 22-10-2026 tiene nueve
  archivos. Lo que importa comprobar sigue siendo lo mismo: que la clave que produce sólo la puede
  satisfacer un archivo `moto-…`: una moto nunca puede terminar con la foto de un automóvil.
*/
check('una MOTOCICLETA pide la carrocería «moto» y ninguna otra',
  carroceriaDe({ type: 'MOTORCYCLE' }) === 'moto',
  String(carroceriaDe({ type: 'MOTORCYCLE' })));
check('un tipo que esta tabla no conoce NO cae en «sedán»',
  carroceriaDe({ type: 'BICYCLE' }) === null && carroceriaDe({ type: 'BUS' }) === null
  && carroceriaDe({ type: 'OTHER' }) === null,
  `${carroceriaDe({ type: 'BICYCLE' })} / ${carroceriaDe({ type: 'BUS' })}`);
check('sin tipo no se adivina', carroceriaDe({}) === null);

console.log('\n-- marca y modelo afinan, pero no contradicen al servidor --');

check('un RAV4 es una SUV compacta',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'RAV4' }) === 'suv-compacta');
check('la escritura no importa: «rav-4», «Rav 4» y «RAV4» son el mismo',
  carroceriaDe({ type: 'CAR', brand: 'toyota', model: 'rav-4' }) === 'suv-compacta'
  && carroceriaDe({ type: 'CAR', brand: 'TOYOTA', model: 'Rav 4' }) === 'suv-compacta');
check('un Swift es un hatchback',
  carroceriaDe({ type: 'CAR', brand: 'Suzuki', model: 'Swift' }) === 'hatchback');
check('un modelo desconocido se queda en sedán',
  carroceriaDe({ type: 'CAR', brand: 'Marca', model: 'Inventado' }) === 'sedan');

/*
  Lo que la tabla de modelos tiene que recuperar, porque el tipo ya no lo puede decir: una pick-up
  y una furgoneta llegan como CAR, igual que un sedán. Sin esta tabla, las veinte imágenes de
  `pickup` y `van-comercial` no las alcanzaría ningún vehículo real.
*/
check('una Hilux declarada CAR es una pick-up, por su modelo',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hilux' }) === 'pickup',
  String(carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hilux' })));
check('un Ranger y una L200 también',
  carroceriaDe({ type: 'CAR', brand: 'Ford', model: 'Ranger' }) === 'pickup'
  && carroceriaDe({ type: 'CAR', brand: 'Mitsubishi', model: 'L200' }) === 'pickup');
check('una Hiace declarada CAR es una van comercial',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hiace' }) === 'van-comercial',
  String(carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hiace' })));
check('una Sienna es un monovolumen',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Sienna' }) === 'minivan');

/* El servidor sabe más que una tabla escrita a mano: una moto no deja de serlo por su modelo. */
check('una moto con modelo de automóvil NO se vuelve automóvil',
  carroceriaDe({ type: 'MOTORCYCLE', brand: 'Toyota', model: 'Corolla' }) === 'moto');
check('y una moto con modelo de pick-up tampoco',
  carroceriaDe({ type: 'MOTORCYCLE', brand: 'Toyota', model: 'Hilux' }) === 'moto');

/*
  La propulsión NO decide la forma: la orden del paquete lo prohíbe en letra. La carrocería
  `electrico` de la biblioteca es una forma —un crossover— y se usa modelo por modelo.
*/
check('un Leaf es un hatchback, no «un eléctrico»',
  carroceriaDe({ type: 'CAR', brand: 'Nissan', model: 'Leaf' }) === 'hatchback',
  String(carroceriaDe({ type: 'CAR', brand: 'Nissan', model: 'Leaf' })));
check('un Model 3 es un sedán, no «un eléctrico»',
  carroceriaDe({ type: 'CAR', brand: 'Tesla', model: 'Model 3' }) === 'sedan');

console.log('\n-- sufijos de versión, motorización y acabado --');

/*
  El defecto del Paso 3: «Mercedes-Benz Sprinter 519 CDI Furgón Largo» salía SEDÁN porque la
  comparación era igualdad exacta. La gente escribe el modelo con su nivel de equipamiento, y
  exigir la cadena exacta es exigir que no lo haga.
*/
const POSITIVOS = [
  ['Mercedes-Benz', 'Sprinter 519 CDI Furgón Largo', 'van-comercial', 'el caso que falló en el Paso 3'],
  ['Mercedes Benz', 'Sprinter', 'van-comercial', 'el guion de la marca no cuenta'],
  ['Toyota', 'Hilux 2.8 SRV 4x4', 'pickup', 'motorización y tracción'],
  ['Toyota', 'RAV4 Hybrid Limited', 'suv-compacta', 'acabado'],
  ['Toyota', 'Rav-4', 'suv-compacta', 'el separador no cuenta'],
  ['Toyota', 'rav 4', 'suv-compacta', 'el espacio tampoco'],
  ['TOYOTA', 'RAV4', 'suv-compacta', 'las mayúsculas tampoco'],
  ['Suzuki', 'Swift GL Sport', 'hatchback', 'acabado en un hatchback'],
  ['Ford', 'Ranger Raptor', 'pickup', 'versión'],
  ['Hyundai', 'H-1 Van 12 pasajeros', 'van-comercial', 'número pegado al modelo'],
  ['Toyota', 'Land Cruiser Prado TX', 'suv-compacta', 'gana la entrada más específica, y suv-grande se sustituye'],
  ['Kia', 'Río 5 EX', 'hatchback', 'tilde en el modelo'],
];
for (const [marca, modelo, esperado, porque] of POSITIVOS) {
  const real = carroceriaDe({ type: 'CAR', brand: marca, model: modelo });
  check(`«${marca} ${modelo}» → ${esperado} (${porque})`, real === esperado, String(real));
}

console.log('\n-- la tabla entera, entrada por entrada --');

/*
  Se lee la tabla del propio archivo y se comprueba CADA entrada a través de la función pública.
  Dos cosas que una lista escrita a mano se gana sola con el tiempo: una clave con un error de
  dedo que no coincide con nada, y una carrocería mal escrita. Ninguna de las dos se nota mirando.
*/
const fuente = readFileSync(
  join(raiz, 'apps/citizen/src/vehicleImages/prototipo/catalogoPrototipo.ts'), 'utf8');
const bloque = fuente.slice(
  fuente.indexOf('const POR_MODELO'), fuente.indexOf('\n};', fuente.indexOf('const POR_MODELO')));
const TABLA = [...bloque.matchAll(/(\w+):\s*'([a-z-]+)'/g)].map(([, k, v]) => [k, v]);

const porCarroceria = {};
for (const [, v] of TABLA) porCarroceria[v] = (porCarroceria[v] ?? 0) + 1;
console.log(`  ··  ${TABLA.length} modelos: `
  + Object.entries(porCarroceria).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} ${n}`).join(' · '));

check('no hay claves repetidas', new Set(TABLA.map(([k]) => k)).size === TABLA.length);
check('todas las carrocerías de la tabla existen',
  TABLA.every(([, v]) => CARROCERIAS.includes(v)),
  TABLA.filter(([, v]) => !CARROCERIAS.includes(v)).map(([k, v]) => `${k}:${v}`).join(', '));

const fallidas = TABLA.filter(([clave, carroceria]) => {
  const esperada = EQUIVALENCIAS[carroceria] ?? carroceria;
  return carroceriaDe({ type: 'CAR', model: clave }) !== esperada;
});
check(`las ${TABLA.length} entradas se resuelven a su carrocería`,
  fallidas.length === 0, fallidas.map(([k, v]) => `${k}→${v}`).join(', '));

/*
  Las entradas que son prefijo de otra. No son un error —«toyotacorolla» tiene que convivir con
  «toyotacorollacross»— pero SÍ lo sería que ganara la corta: un Corolla Cross es una SUV y un
  Corolla es un sedán. Se listan y se comprueba que gane siempre la más específica.
*/
const solapes = [];
for (const [corta, cCorta] of TABLA) {
  for (const [larga, cLarga] of TABLA) {
    if (larga !== corta && larga.startsWith(corta) && cCorta !== cLarga) {
      solapes.push([corta, cCorta, larga, cLarga]);
    }
  }
}
console.log(`  ··  ${solapes.length} pares donde una entrada es prefijo de otra con carrocería distinta`);
for (const [corta, cCorta, larga, cLarga] of solapes) {
  console.log(`      ${corta} (${cCorta})  ⊂  ${larga} (${cLarga})`);
}
const ganaLaCorta = solapes.filter(([, , larga, cLarga]) =>
  carroceriaDe({ type: 'CAR', model: larga }) !== (EQUIVALENCIAS[cLarga] ?? cLarga));
check('en todos esos pares gana la entrada MÁS específica',
  ganaLaCorta.length === 0, ganaLaCorta.map(([, , l]) => l).join(', '));

console.log('\n-- un modelo de cada carrocería, escrito como lo escribiría una persona --');

const MUESTRA = [
  ['Ford', 'F-150 Lariat', 'pickup'],
  ['RAM', '1500 Laramie', 'pickup'],
  ['Hyundai', 'H-100 caja seca', 'van-comercial'],
  ['Iveco', 'Daily 35S14', 'van-comercial'],
  ['Toyota', 'Innova 2.8 GX', 'minivan'],
  ['Suzuki', 'Ertiga GLX', 'minivan'],
  ['Toyota', 'C-HR Hybrid', 'suv-compacta'],
  ['Renault', 'Duster Intens', 'suv-compacta'],
  ['Haval', 'Jolion Pro', 'suv-compacta'],
  ['Jeep', 'Grand Cherokee Limited', 'suv-compacta'],
  ['Mazda', 'CX-90 Signature', 'suv-compacta'],
  ['Suzuki', 'Baleno GLX', 'hatchback'],
  ['Renault', 'Kwid Iconic', 'hatchback'],
  ['Peugeot', '208 Allure', 'hatchback'],
  ['BYD', 'Seagull', 'hatchback'],
  ['Honda', 'City EX', 'sedan'],
  ['BYD', 'Song Plus Champion', 'electrico'],
  ['Hyundai', 'Ioniq 5 Long Range', 'electrico'],
  ['BYD', 'Sealion 6', 'electrico'],
  ['BYD', 'Seal Design', 'sedan'],
];
for (const [marca, modelo, esperada] of MUESTRA) {
  const real = carroceriaDe({ type: 'CAR', brand: marca, model: modelo });
  check(`«${marca} ${modelo}» → ${esperada}`, real === esperada, String(real));
}

console.log('\n-- y lo que NO debe coincidir, que es la mitad que importa --');

/*
  La solución fácil habría sido buscar la entrada como subcadena. Estos son los casos que esa
  solución rompe: le pondrían a alguien la imagen del carro de otra persona.
*/
const NEGATIVOS = [
  ['Kia', 'Riojana', 'sedan', '«kiario» está dentro, pero no termina en palabra'],
  ['Mazda', '323', 'sedan', '«mazda3» está dentro de «mazda323»'],
  ['Toyota', 'Hiluxe', 'sedan', 'una letra de más no es una Hilux'],
  ['Ford', 'Tucson', 'sedan', 'el Tucson es de Hyundai: marca distinta, nombre parecido'],
  ['Honda', 'Ranger', 'sedan', 'Ranger es de Ford'],
  ['Toyota', '', 'sedan', 'sólo la marca no decide la forma'],
  ['', '', 'sedan', 'cadenas vacías'],
  ['', 'Sprinter', 'sedan', 'el modelo solo, sin marca, no alcanza'],
  ['Marca', 'Inventada', 'sedan', 'desconocido'],
  ['   ', '  -- ', 'sedan', 'sólo separadores'],
];
for (const [marca, modelo, esperado, porque] of NEGATIVOS) {
  const real = carroceriaDe({ type: 'CAR', brand: marca, model: modelo });
  check(`«${marca || '∅'} ${modelo || '∅'}» → ${esperado} (${porque})`, real === esperado, String(real));
}

/*
  El Yaris ambiguo: existe como sedán y como hatchback según el mercado, y la tabla lo tiene como
  sedán. Lo que se fija acá no es cuál es «el correcto» sino que la respuesta sea ESTABLE: una
  tabla con dos entradas que compiten daría una u otra según el orden de las claves.
*/
const yaris = ['Yaris', 'Yaris Sport', 'Yaris XLS', 'yaris  hatchback']
  .map((m) => carroceriaDe({ type: 'CAR', brand: 'Toyota', model: m }));
check('el Yaris ambiguo da SIEMPRE la misma respuesta', new Set(yaris).size === 1,
  yaris.join(', '));

console.log('\n-- las tres carrocerías mal recoloreadas no llegan a la pantalla --');

check('las tres que se sabe que están mal están declaradas como excluidas',
  ['coupe', 'suv-grande', 'suv-premium'].every((c) => EQUIVALENCIAS[c]),
  JSON.stringify(EQUIVALENCIAS));
check('ninguna sustitución apunta a otra carrocería excluida',
  Object.values(EQUIVALENCIAS).every((destino) => !EQUIVALENCIAS[destino]),
  JSON.stringify(EQUIVALENCIAS));
check('un Prado (suv-grande) termina en suv-compacta',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Prado' }) === 'suv-compacta',
  String(carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Prado' })));
check('un Tiggo 8 Pro (suv-grande) también',
  carroceriaDe({ type: 'CAR', brand: 'Chery', model: 'Tiggo 8 Pro' }) === 'suv-compacta');

// La red de seguridad: NINGUNA entrada del dominio puede terminar en una carrocería excluida.
const TIPOS = TIPOS_DEL_SERVIDOR;
const MODELOS = [
  {}, { brand: 'Toyota', model: 'RAV4' }, { brand: 'Toyota', model: 'Prado' },
  { brand: 'Toyota', model: 'Land Cruiser' }, { brand: 'Chery', model: 'Tiggo 8 Pro' },
  { brand: 'Suzuki', model: 'Swift' }, { brand: 'Tesla', model: 'Model 3' },
  { brand: 'Ford', model: 'Ranger' }, { brand: 'Qué', model: 'Sea' },
];
const excluidas = Object.keys(EQUIVALENCIAS);
const coladas = [];
for (const type of TIPOS) {
  for (const m of MODELOS) {
    const c = carroceriaDe({ type, ...m });
    if (c && excluidas.includes(c)) coladas.push(`${type} ${m.brand ?? ''} ${m.model ?? ''} → ${c}`);
  }
}
check(`ninguna de las ${TIPOS.length * MODELOS.length} entradas termina en una carrocería excluida`,
  coladas.length === 0, coladas.join('; '));

console.log('\n-- el color, sin inventar ninguno --');

/*
  LOS DOCE DEL SERVIDOR, escritos en el mismo orden que el enum `VehicleColor` los declara. La
  primera versión de este archivo conocía ocho —los del transporte simulado— y por eso un carro
  beige o naranja caía al dibujo teniendo su imagen disponible.
*/
const COLORES_DEL_SERVIDOR = {
  WHITE: 'blanco', BLACK: 'negro', GRAY: 'gris', SILVER: 'plata',
  RED: 'rojo', BLUE: 'azul', GREEN: 'verde',
  YELLOW: null, ORANGE: 'naranja', BROWN: null, BEIGE: 'beige', OTHER: null,
};

for (const [clave, esperado] of Object.entries(COLORES_DEL_SERVIDOR)) {
  const real = colorDe({ color: clave });
  check(`${clave} → ${esperado ?? 'sin imagen'}`, real === esperado, String(real));
}

check('los doce colores del servidor están contemplados, ni uno de más ni uno de menos',
  Object.keys(COLORES_DEL_SERVIDOR).length === 12);

/*
  El componente del paquete caía a gris con `?? 'gris'`. Un carro de color desconocido pintado de
  gris es una afirmación falsa sobre el carro de esa persona: acá no hay imagen y el dibujo usa un
  gris de interfaz, que no afirma nada.
*/
check('un color OTHER no se pinta de gris: no hay imagen',
  colorDe({ color: 'OTHER' }) === null, String(colorDe({ color: 'OTHER' })));
check('sin color declarado tampoco', colorDe({}) === null);
check('un color que el servidor no tiene tampoco',
  colorDe({ color: 'FUCSIA' }) === null);

/*
  Y la otra mitad del respaldo: el color que NO tiene imagen tiene que poder dibujarse. Un carro
  café que cae al dibujo y se pinta del gris de «no lo dijo» le estaría dando a esa persona la
  misma respuesta que a quien no declaró color, que es una respuesta distinta.
*/
const dibujo = readFileSync(join(raiz, 'packages/ui/src/VehicleThumb.tsx'), 'utf8');
const sinImagen = Object.entries(COLORES_DEL_SERVIDOR)
  .filter(([clave, img]) => img === null && clave !== 'OTHER')
  .map(([clave]) => clave);
const sinPintura = sinImagen.filter((clave) => !new RegExp(`\\b${clave}:\\s*\\{`).test(dibujo));
check(`los colores sin imagen (${sinImagen.join(', ')}) sí tienen pintura en el dibujo`,
  sinPintura.length === 0, `faltan: ${sinPintura.join(', ')}`);

console.log('\n-- la elección completa --');

check('un RAV4 blanco da la clave suv-compacta-blanco',
  elegirPrototipo({ type: 'CAR', brand: 'Toyota', model: 'RAV4', color: 'WHITE' })?.clave
  === 'suv-compacta-blanco');
check('hacen falta carrocería Y color: un RAV4 sin color no da nada',
  elegirPrototipo({ type: 'CAR', brand: 'Toyota', model: 'RAV4' }) === null);
check('una moto blanca pide moto-blanco, una clave que ningún automóvil puede satisfacer',
  elegirPrototipo({ type: 'MOTORCYCLE', color: 'WHITE' })?.clave === 'moto-blanco',
  String(elegirPrototipo({ type: 'MOTORCYCLE', color: 'WHITE' })?.clave));

console.log('\n-- la cobertura real, contada y no afirmada --');

/*
  Cuántas de las combinaciones que el servidor PUEDE producir terminan mostrando una imagen. Se
  cuenta acá para que el número del informe salga de una medición y no de la memoria de nadie, y
  para que si alguien rompe una tabla, el número baje y se vea.
*/
const MODELOS_REPRESENTATIVOS = [
  {}, { brand: 'Toyota', model: 'RAV4' }, { brand: 'Toyota', model: 'Hilux' },
  { brand: 'Toyota', model: 'Hiace' }, { brand: 'Suzuki', model: 'Swift' },
  { brand: 'Toyota', model: 'Sienna' }, { brand: 'Tesla', model: 'Model Y' },
];
/*
  «Tiene imagen» se mide contra los ARCHIVOS que existen, no contra la clave que la regla produce.
  Cuando `moto` estaba declarada sin activos, una moto devolvía `moto-rojo` y eso NO era una
  imagen: era una promesa. Contarlo como cobertura habría sido el mismo autoengaño que una prueba
  que se salta sola y termina en verde. La medición se queda tal cual ahora que los archivos
  llegaron, porque es justo lo que distingue nueve motos con foto de diez prometidas.
*/
const hayArchivo = (clave) => existsSync(join(
  raiz, 'apps/citizen/src/vehicleImages/prototipo/assets', `${clave}.webp`));

let conImagen = 0;
let sinImagenTotal = 0;
const huecos = [];
for (const type of TIPOS_DEL_SERVIDOR) {
  for (const color of Object.keys(COLORES_DEL_SERVIDOR)) {
    const hay = MODELOS_REPRESENTATIVOS.some((m) => {
      const e = elegirPrototipo({ type, color, ...m });
      return e !== null && hayArchivo(e.clave);
    });
    if (hay) conImagen += 1;
    else { sinImagenTotal += 1; huecos.push(`${type}/${color}`); }
  }
}
const total = TIPOS_DEL_SERVIDOR.length * Object.keys(COLORES_DEL_SERVIDOR).length;
console.log(`  ··  ${conImagen} de ${total} combinaciones tipo×color muestran imagen`);
console.log(`  ··  sin imagen (${sinImagenTotal}): ${huecos.join(', ')}`);

check('todo automóvil de un color con imagen recibe imagen',
  conImagen === 9, `${conImagen}, se esperaban 9 (CAR × los 9 colores con imagen)`);
/*
  Lo que queda sin foto, dicho por su nombre y no como un número.

  Esta comprobación ya cambió dos veces en un día y las dos veces estuvo bien que cambiara:
  exigía doce huecos de moto, pasó a exigir tres cuando llegaron las nueve fotografías, y vuelve a
  exigir doce ahora que esas fotografías se retiraron. La razón de retirarlas está en el LEEME:
  son recortes de tres cuartos frontal y en un hueco 2:1 la moto ocupaba el 40% del ancho dentro de
  un recuadro visible. El dibujo llena su casilla y no tiene fondo, así que es mejor activo
  mientras no lleguen fotografías de perfil o con fondo transparente.
*/
const huecosMoto = huecos.filter((h) => h.startsWith('MOTORCYCLE'));
check('ninguna MOTOCICLETA recibe fotografía: se retiraron por no caber en la casilla',
  huecosMoto.length === 12, huecosMoto.join(', '));
/*
  La otra mitad de la misma garantía, y la que de verdad importa: pase lo que pase con las tablas,
  una moto NUNCA puede terminar pidiendo la imagen de un automóvil.
*/
const clavesDeMoto = Object.keys(COLORES_DEL_SERVIDOR)
  .map((color) => elegirPrototipo({ type: 'MOTORCYCLE', color }))
  .filter(Boolean)
  .map((e) => e.clave);
check('todas las claves de una moto empiezan por «moto-»',
  clavesDeMoto.length > 0 && clavesDeMoto.every((c) => c.startsWith('moto-')),
  clavesDeMoto.join(', '));

console.log('\n-- la carrocería que elige la persona --');

/*
  La clasificación del 22-10-2026. El servidor no tiene dónde guardar una carrocería —`VehicleType`
  son dos valores y `V16_0` retiró el resto— así que la elección vive en el dispositivo y entra acá
  como un campo más. Lo que se comprueba es el ORDEN de mando, que es donde está el riesgo.
*/
check('las carrocerías ofrecidas existen todas en el catálogo',
  CARROCERIAS_OFRECIDAS.every((c) => CARROCERIAS.includes(c)),
  CARROCERIAS_OFRECIDAS.filter((c) => !CARROCERIAS.includes(c)).join(', '));
/*
  Ninguna ofrecida puede estar en EQUIVALENCIAS: si lo estuviera, la persona elegiría «coupé» y
  recibiría un sedán sin enterarse. Es la comprobación que dejó al coupé fuera de la lista.
*/
check('ninguna carrocería ofrecida se sustituye por otra a la espalda de quien la elige',
  CARROCERIAS_OFRECIDAS.every((c) => !EQUIVALENCIAS[c]),
  CARROCERIAS_OFRECIDAS.filter((c) => EQUIVALENCIAS[c]).map((c) => `${c}→${EQUIVALENCIAS[c]}`).join(', '));
check('cada carrocería ofrecida tiene clave de traducción',
  CARROCERIAS_OFRECIDAS.every((c) => typeof ETIQUETA_DE_CARROCERIA[c] === 'string'),
  CARROCERIAS_OFRECIDAS.filter((c) => !ETIQUETA_DE_CARROCERIA[c]).join(', '));
check('las carrocerías ofrecidas tienen sus diez archivos',
  CARROCERIAS_OFRECIDAS.every((c) => COLORES_PROTOTIPO.every((col) => existsSync(join(
    raiz, 'apps/citizen/src/vehicleImages/prototipo/assets', `${c}-${col}.webp`)))));

check('elegir pick-up da una pick-up aunque no haya marca ni modelo',
  carroceriaDe({ type: 'CAR', carroceria: 'pickup' }) === 'pickup',
  String(carroceriaDe({ type: 'CAR', carroceria: 'pickup' })));
check('y la clave del archivo es la de la pick-up',
  elegirPrototipo({ type: 'CAR', color: 'RED', carroceria: 'pickup' })?.clave === 'pickup-rojo',
  String(elegirPrototipo({ type: 'CAR', color: 'RED', carroceria: 'pickup' })?.clave));

/* Lo elegido manda sobre la tabla: quien dice que su Corolla es una SUV, recibe una SUV. */
check('la elección de la persona gana a la tabla de modelos',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Corolla', carroceria: 'suv-compacta' }) === 'suv-compacta',
  String(carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Corolla', carroceria: 'suv-compacta' })));
/* Y sin elección, la tabla sigue mandando: lo de antes no se rompió. */
check('sin elección, la tabla de modelos sigue decidiendo',
  carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hilux' }) === 'pickup');

/*
  LA COMPROBACIÓN QUE MÁS IMPORTA DE ESTA SECCIÓN.

  Una carrocería guardada en un navegador no puede convertir una moto en automóvil. El tipo es lo
  que resuelve una tarifa y lo que lee un inspector; la elección es una preferencia visual. Si esto
  alguna vez se invierte, un motociclista ve la foto de un sedán en su propia tarjeta.
*/
for (const c of CARROCERIAS_OFRECIDAS) {
  check(`una MOTOCICLETA con «${c}» guardado sigue siendo moto`,
    carroceriaDe({ type: 'MOTORCYCLE', carroceria: c }) === 'moto',
    String(carroceriaDe({ type: 'MOTORCYCLE', carroceria: c })));
}
check('y su archivo sigue siendo un moto-',
  elegirPrototipo({ type: 'MOTORCYCLE', color: 'RED', carroceria: 'pickup' })?.clave === 'moto-rojo',
  String(elegirPrototipo({ type: 'MOTORCYCLE', color: 'RED', carroceria: 'pickup' })?.clave));

/* Una carrocería inventada —almacenamiento editado a mano, versión futura— se ignora, no rompe. */
for (const basura of ['', 'tanque', 'coupe', 'SEDAN', 'suv-grande', '../../etc', null, undefined]) {
  const r = carroceriaDe({ type: 'CAR', brand: 'Toyota', model: 'Hilux', carroceria: basura });
  check(`una carrocería inválida (${JSON.stringify(basura)}) se ignora y manda la tabla`,
    r === 'pickup', String(r));
}
check('esCarroceriaOfrecida acepta sólo las de la lista',
  CARROCERIAS_OFRECIDAS.every((c) => esCarroceriaOfrecida(c))
  && !esCarroceriaOfrecida('coupe') && !esCarroceriaOfrecida('moto') && !esCarroceriaOfrecida(''));

/*
  Las carrocerías que SÍ se alcanzan desde un dato real. Sirve para que nadie vuelva a escribir en
  un informe que una imagen se usa cuando no hay forma de llegar a ella.
*/
const alcanzadas = new Set();
for (const m of MODELOS_REPRESENTATIVOS) {
  const c = carroceriaDe({ type: 'CAR', ...m });
  if (c) alcanzadas.add(c);
}
console.log(`  ··  carrocerías alcanzadas por estos modelos: ${[...alcanzadas].sort().join(', ')}`);
check('pick-up y van-comercial vuelven a ser alcanzables',
  alcanzadas.has('pickup') && alcanzadas.has('van-comercial'),
  [...alcanzadas].join(', '));

console.log('\n-- cómo se lee el nombre de un archivo --');

check('se lee una carrocería y un color simples',
  claveDeArchivo('./assets/sedan-blanco.webp') === 'sedan-blanco');
/*
  El guion dentro de los nombres. Partir por el último daría «suv-compacta-azul» + «oscuro», que
  no es ni una carrocería ni un color: el archivo se perdería en silencio.
*/
check('se lee aunque carrocería y color lleven guion dentro',
  claveDeArchivo('./assets/suv-compacta-azul-oscuro.webp') === 'suv-compacta-azul-oscuro',
  String(claveDeArchivo('./assets/suv-compacta-azul-oscuro.webp')));
check('van-comercial-verde se lee entero',
  claveDeArchivo('./assets/van-comercial-verde.webp') === 'van-comercial-verde');
check('una carrocería que no existe se ignora',
  claveDeArchivo('./assets/tanque-blanco.webp') === null);
check('un color que no existe se ignora',
  claveDeArchivo('./assets/sedan-fucsia.webp') === null);

console.log('\n-- la carpeta de imágenes --');

const carpeta = join(raiz, 'apps/citizen/src/vehicleImages/prototipo/assets');
const archivos = existsSync(carpeta)
  ? readdirSync(carpeta).filter((f) => /\.webp$/i.test(f)) : [];
const malos = archivos.filter((f) => claveDeArchivo(f) === null);
check(`los ${archivos.length} archivos siguen la convención`, malos.length === 0, malos.join(', '));
check('están las 100 combinaciones del paquete de automóviles',
  archivos.length === 100, `hay ${archivos.length}`);

const faltan = [];
for (const c of CARROCERIAS_ENTREGADAS) {
  for (const col of COLORES_PROTOTIPO) {
    if (!archivos.includes(`${c}-${col}.webp`)) faltan.push(`${c}-${col}`);
  }
}
check('no falta ninguna de las carrocerías ENTREGADAS', faltan.length === 0, faltan.join(', '));

/*
  Y lo que falta, dicho como lista y no como silencio. Esta comprobación NO falla: su trabajo es
  que el hueco esté escrito en la salida de cada corrida, para que nadie dé por entregado lo que
  no llegó. De los diez nombres, moto tiene nueve.
*/
const motoFaltantes = COLORES_PROTOTIPO
  .filter((col) => !archivos.includes(`moto-${col}.webp`))
  .map((col) => `moto-${col}.webp`);
console.log(motoFaltantes.length === COLORES_PROTOTIPO.length
  ? '  ··  la carrocería «moto» no tiene archivos: manda el dibujo, por decisión del 22-10-2026'
  : `  ··  hay ${COLORES_PROTOTIPO.length - motoFaltantes.length} activos de moto en la carpeta`);
/*
  Y que la carpeta esté limpia de verdad. Dejar media docena de `moto-*` sueltos sería peor que
  tenerlos todos: unas motos saldrían en fotografía y otras dibujadas, en la misma lista.
*/
check('no queda ningún activo de moto a medias en la carpeta',
  motoFaltantes.length === COLORES_PROTOTIPO.length,
  `presentes: ${COLORES_PROTOTIPO.filter((c) => !motoFaltantes.includes(`moto-${c}.webp`)).join(', ')}`);

// Una imagen de prototipo sin su procedencia escrita es una imagen que no se puede publicar.
const licencias = readFileSync(
  join(raiz, 'apps/citizen/src/vehicleImages/assets/LICENCIAS.md'), 'utf8');
check('la procedencia de la biblioteca de prototipo está escrita en LICENCIAS.md',
  licencias.includes('prototipo/assets') && /prototipo/i.test(licencias));
check('LICENCIAS.md dice que NO son fotografías oficiales de fabricantes',
  /no\s+(son\s+)?.*fotograf/i.test(licencias) && /fabricante/i.test(licencias));

console.log('\n-- el descubrimiento de archivos --');

const galeria = readFileSync(
  join(raiz, 'apps/citizen/src/vehicleImages/prototipo/galeriaPrototipo.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('la llamada a import.meta.glob está escrita literal (Vite no reconoce otra forma)',
  /(^|[^.\w])import\.meta\.glob\(/m.test(galeria));
check('no quedó una variante con cast u optional chaining',
  !/import\.meta\s+as\b/.test(galeria) && !/\.glob\s*\?\./.test(galeria));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
