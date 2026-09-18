/**
 * Comprobaciones del cálculo de geometría de zonas. Sin navegador y sin librería de mapas: por eso
 * el cálculo vive aparte del componente.
 *
 *   node packages/ui/src/map/__checks__/zoneGeometry.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'zonegeom-'));
try {
  // Se compila el TS real, no una copia: una prueba contra una transcripción a mano comprueba la
  // transcripción, no el código que se despliega.
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--skipLibCheck', '--outDir', dir,
     join(raiz, 'packages/ui/src/map/zoneGeometry.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  // El import de tipos de @luparx/api-client no resuelve fuera del workspace; los tipos se borran
  // al compilar, así que el .js sale igual y sólo interesa el error si NO salió.
  const salida = String(e.stdout || '') + String(e.stderr || '');
  if (!salida.includes('Cannot find module') && !salida.includes('TS2307')) {
    console.error(salida);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
}

const { centroide, puntosDeZonas, encuadreDe } = await import(join(dir, 'zoneGeometry.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos++; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};
const cerca = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Un cuadrado de lado 1 centrado en (0.5, 0.5).
const cuadrado = {
  type: 'Polygon',
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

const c = centroide(cuadrado);
check('centroide de un cuadrado cae en su centro', c && cerca(c.lon, 0.5) && cerca(c.lat, 0.5), JSON.stringify(c));

// El vértice repetido del cierre NO debe sesgar el promedio: si se contara dos veces, el centroide
// se correría hacia (0,0).
check('el vértice de cierre no sesga el centroide', c && cerca(c.lon, 0.5) && cerca(c.lat, 0.5));

const multi = {
  type: 'MultiPolygon',
  coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]],
};
const cm = centroide(multi);
check('MultiPolygon se aplana bien', cm && cerca(cm.lon, 1) && cerca(cm.lat, 1), JSON.stringify(cm));

check('geometría vacía devuelve null', centroide({ type: 'Polygon', coordinates: [] }) === null);

// puntosDeZonas
const fc = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'a', geometry: cuadrado, properties: { code: 'SJ-A', name: 'Zona A' } },
    { type: 'Feature', id: 'b', geometry: null, properties: { code: 'SJ-B', name: 'Sin dibujar' } },
  ],
};
const pts = puntosDeZonas(fc);
check('una zona sin geometría se omite, no se inventa', pts.length === 1 && pts[0].code === 'SJ-A');
check('sin features devuelve lista vacía', puntosDeZonas(undefined).length === 0);

// encuadre
const e = encuadreDe(fc);
check('el encuadre contiene el polígono', e && e.minLon < 0 && e.maxLon > 1 && e.minLat < 0 && e.maxLat > 1);
check('sin geometría el encuadre es null', encuadreDe({ type: 'FeatureCollection', features: [] }) === null);

// Una sola zona: el margen relativo sería 0 y el zoom quedaría infinito.
const punto = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', id: 'p', geometry: { type: 'Polygon', coordinates: [[[5, 5], [5, 5], [5, 5]]] }, properties: { code: 'X', name: 'X' } }],
};
const ep = encuadreDe(punto);
// `>= 0.004` exacto falla por coma flotante (4.998→5.002 da 0.0039999...), así que se compara
// contra el mínimo con una tolerancia: lo que importa es que el encuadre NO sea de ancho cero.
check(
  'una zona degenerada igual produce un encuadre usable',
  ep && ep.maxLon - ep.minLon > 0.0039 && ep.maxLat - ep.minLat > 0.0039,
  JSON.stringify(ep),
);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${fallos === 0 ? 'todas las comprobaciones pasaron' : fallos + ' fallo(s)'}`);
process.exit(fallos > 0 ? 1 : 0);
