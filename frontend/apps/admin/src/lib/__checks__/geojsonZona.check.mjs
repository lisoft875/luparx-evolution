/**
 * El validador de GeoJSON de perímetros, comprobado sin navegador.
 *   node apps/admin/src/lib/__checks__/geojsonZona.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'geojson-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir, join(raiz, 'apps/admin/src/lib/geojsonZona.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  const salida = String(e.stdout || '') + String(e.stderr || '');
  if (!salida.includes('Cannot find module') && !salida.includes('TS2307')) {
    console.error(salida); rmSync(dir, { recursive: true, force: true }); process.exit(1);
  }
}
const { validarGeoJsonZona } = await import(join(dir, 'geojsonZona.js'));

let fallos = 0;
const ok = (cond, msg, det) => { if (cond) console.log('  \x1b[32m✓\x1b[0m ' + msg); else { fallos++; console.log('  \x1b[31m✗\x1b[0m ' + msg + (det ? ' — ' + det : '')); } };

// Un cuadrado en San José (lon/lat correctos)
const amon = JSON.stringify({ type: 'Polygon', coordinates: [[[-84.079, 9.9345], [-84.073, 9.9345], [-84.073, 9.9385], [-84.079, 9.9385], [-84.079, 9.9345]]] });
let r = validarGeoJsonZona(amon);
ok(r.ok, 'un polígono válido de San José pasa');
ok(r.ok && r.resumen.tipo === 'Polygon' && r.resumen.anillos === 1 && r.resumen.vertices === 5, 'resume tipo/anillos/vértices', r.ok ? JSON.stringify(r.resumen) : r.error);
ok(r.ok && r.resumen.dentroDeCostaRica === true, 'y lo reconoce dentro de Costa Rica');

// Feature wrapper
ok(validarGeoJsonZona(JSON.stringify({ type: 'Feature', properties: {}, geometry: JSON.parse(amon) })).ok, 'acepta un Feature con la geometría adentro');

// lon/lat invertidos → cae fuera de CR (aviso, no bloqueo: valida pero avisa)
const invertido = JSON.stringify({ type: 'Polygon', coordinates: [[[9.9345, -84.079], [9.9345, -84.073], [9.9385, -84.073], [9.9345, -84.079]]] });
const ri = validarGeoJsonZona(invertido);
ok(ri.ok && ri.resumen.dentroDeCostaRica === false, 'lon/lat invertidos: válido pero FUERA de Costa Rica (el aviso que atrapa el error más común)');

// anillo que no cierra
ok(validarGeoJsonZona(JSON.stringify({ type: 'Polygon', coordinates: [[[-84.07, 9.93], [-84.06, 9.93], [-84.06, 9.94]]] })).ok === false, 'un anillo que no cierra se rechaza');
// no es polígono
ok(validarGeoJsonZona(JSON.stringify({ type: 'Point', coordinates: [-84, 9.9] })).ok === false, 'un Point se rechaza');
// json inválido
ok(validarGeoJsonZona('{no json').ok === false, 'JSON inválido se rechaza');
// longitud fuera de rango
ok(validarGeoJsonZona(JSON.stringify({ type: 'Polygon', coordinates: [[[-999, 9.9], [-84, 9.9], [-84, 10], [-999, 9.9]]] })).ok === false, 'una longitud fuera de rango se rechaza');

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
