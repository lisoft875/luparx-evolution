/**
 * El catálogo de imágenes de vehículos, comprobado sin navegador y sin empaquetador.
 *
 * <p>Lo que se mide acá es la regla que no puede equivocarse: que a nadie se le muestre la foto de
 * un carro que no es el suyo. Un modelo distinto, o el mismo modelo en otro color, es exactamente
 * el error que la orden del 22-10-2026 prohíbe —«no presentar modelo incorrecto como exacto»— y la
 * clase de cosa que se cuela sola cuando el catálogo crece.</p>
 *
 *   node apps/citizen/src/vehicleImages/__checks__/catalogo.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'catalogo-'));
try {
  // Se compila el TS real y no una copia: una prueba contra una transcripción a mano comprueba la
  // transcripción, no el código que se despliega.
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir,
      join(raiz, 'apps/citizen/src/vehicleImages/catalogo.ts')],
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

const { analizarNombre, elegirImagen, normalizar } = await import(join(dir, 'catalogo.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos += 1; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

console.log('\n-- cómo se lee un nombre de archivo --');

const rav4 = analizarNombre('./assets/toyota__rav4__2019-2024__white.webp', '/x/rav4.webp');
check('se leen los cuatro campos',
  rav4 && rav4.marca === 'toyota' && rav4.modelo === 'rav4'
  && rav4.desde === 2019 && rav4.hasta === 2024 && rav4.color === 'white',
  JSON.stringify(rav4));

const cualquiera = analizarNombre('./assets/hyundai__tucson__cualquiera__cualquiera.avif', '/x/t.avif');
check('«cualquiera» vale en años y en color',
  cualquiera && cualquiera.desde === null && cualquiera.color === null,
  JSON.stringify(cualquiera));

check('un nombre con campos de menos se ignora',
  analizarNombre('./assets/toyota__rav4__white.webp', '/x') === null);
check('un rango de años al revés se ignora',
  analizarNombre('./assets/toyota__rav4__2024-2019__white.webp', '/x') === null);
check('un año que no son cuatro cifras se ignora',
  analizarNombre('./assets/toyota__rav4__19-24__white.webp', '/x') === null);
check('las tildes y los separadores no cuentan',
  normalizar('Citroën C-4') === 'citroenc4', normalizar('Citroën C-4'));

console.log('\n-- qué imagen se elige --');

const u = (n) => `/img/${n}.webp`;
const catalogo = [
  analizarNombre('toyota__rav4__2019-2024__white.webp', u('rav4-blanco')),
  analizarNombre('toyota__rav4__2019-2024__gray.webp', u('rav4-gris')),
  analizarNombre('toyota__corolla__cualquiera__cualquiera.webp', u('corolla')),
  analizarNombre('hyundai__tucson__2016-2020__cualquiera.webp', u('tucson')),
];

check('el color exacto gana',
  elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', year: 2021, color: 'GRAY' }) === u('rav4-gris'),
  String(elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', year: 2021, color: 'GRAY' })));

check('la marca y el modelo se comparan normalizados',
  elegirImagen(catalogo, { brand: 'toyota', model: 'rav-4', year: 2020, color: 'white' }) === u('rav4-blanco'));

check('una imagen sirve para todos los años de su generación',
  elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', year: 2024, color: 'WHITE' }) === u('rav4-blanco'));

/*
  La comprobación que justifica todo el archivo: un RAV4 rojo NO se muestra con la foto del
  blanco ni con la del gris. Se cae al dibujo, que sí se tiñe de rojo.
*/
check('un color que el catálogo no tiene NO usa la foto de otro color',
  elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', year: 2021, color: 'RED' }) === null,
  String(elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', year: 2021, color: 'RED' })));

check('pero una imagen marcada «cualquiera» sí se usa para cualquier color',
  elegirImagen(catalogo, { brand: 'Hyundai', model: 'Tucson', year: 2018, color: 'RED' }) === u('tucson'));

check('fuera de la generación no se usa la imagen de esa generación',
  elegirImagen(catalogo, { brand: 'Hyundai', model: 'Tucson', year: 2023, color: 'RED' }) === null);

check('sin año declarado no se entra en una imagen acotada a una generación',
  elegirImagen(catalogo, { brand: 'Toyota', model: 'RAV4', color: 'WHITE' }) === null);

check('una imagen sin año acotado sirve aunque no se declare el año',
  elegirImagen(catalogo, { brand: 'Toyota', model: 'Corolla' }) === u('corolla'));

check('un modelo que no está en el catálogo no devuelve nada',
  elegirImagen(catalogo, { brand: 'Kia', model: 'Picanto', year: 2020, color: 'RED' }) === null);

check('sin marca o sin modelo no se adivina',
  elegirImagen(catalogo, { year: 2020, color: 'WHITE' }) === null
  && elegirImagen(catalogo, { brand: 'Toyota', color: 'WHITE' }) === null);

check('un catálogo vacío no rompe nada: devuelve null y manda el dibujo',
  elegirImagen([], { brand: 'Toyota', model: 'RAV4', year: 2021, color: 'WHITE' }) === null);

console.log('\n-- la carpeta de imágenes --');

const carpeta = join(raiz, 'apps/citizen/src/vehicleImages/assets');
const archivos = existsSync(carpeta)
  ? readdirSync(carpeta).filter((f) => /\.(webp|avif|png|jpg)$/i.test(f))
  : [];
const malNombrados = archivos.filter((f) => analizarNombre(f, '/x') === null);
check(`los ${archivos.length} archivos de la carpeta siguen la convención`,
  malNombrados.length === 0,
  malNombrados.join(', '));

// Una imagen sin su fila en LICENCIAS.md es una imagen que no se puede publicar. Se comprueba por
// nombre de archivo, que es lo que se puede comprobar sin leer la licencia misma.
if (archivos.length > 0) {
  const licencias = await import('node:fs').then((fs) =>
    fs.readFileSync(join(carpeta, 'LICENCIAS.md'), 'utf8'));
  const sinLicencia = archivos.filter((f) => !licencias.includes(f));
  check('cada imagen tiene su fila en LICENCIAS.md', sinLicencia.length === 0, sinLicencia.join(', '));
} else {
  console.log('  ··  la carpeta está vacía: no hay licencias que comprobar todavía');
}

console.log('\n-- el descubrimiento de archivos y su empaquetado --');

/*
  Estas dos comprobaciones existen por un fallo real, encontrado el 22-10-2026 y que no da ningún
  error: con la llamada escrita como `(import.meta as X).glob?.(…)` el proyecto compila, el catálogo
  queda vacío y la imagen jamás llega al paquete. Nadie se entera hasta que un usuario no ve su
  carro. Son de texto a propósito: lo que se vigila es la FORMA de la llamada, que es lo que Vite
  mira, y eso no se puede comprobar ejecutando el módulo.
*/
const galeria = readFileSync(join(raiz, 'apps/citizen/src/vehicleImages/galeria.ts'), 'utf8')
  // Se quitan los comentarios: el archivo EXPLICA la forma mala para que nadie la repita, y esa
  // explicación no debe hacer fallar la comprobación. Lo que se mide es el código.
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('la llamada a import.meta.glob está escrita literal (Vite no reconoce otra forma)',
  /(^|[^.\w])import\.meta\.glob\(/m.test(galeria));
check('no quedó una variante con cast u optional chaining',
  !/import\.meta\s+as\b/.test(galeria) && !/\.glob\s*\?\./.test(galeria));

const vite = readFileSync(join(raiz, 'apps/citizen/vite.config.ts'), 'utf8');
check('el build tiene prohibido incrustar las imágenes de vehículos en el JavaScript',
  /assetsInlineLimit/.test(vite) && /vehicleImages\//.test(vite));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
