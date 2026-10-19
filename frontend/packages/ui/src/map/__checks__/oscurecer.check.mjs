/**
 * El recoloreado, comprobado contra las capas REALES del proveedor y sin navegador.
 *
 * <p>Lo que se mide acá es lo que el arnés de navegador NO puede medir: ése intercepta la URL del
 * estilo y responde uno mínimo local, así que `oscurecer` nunca había visto el estilo que el
 * ciudadano ve. Al pasarlo por el real aparecieron diez capas que seguían claras sobre el lienzo
 * oscuro, en cuatro formas distintas, y cada una tiene su comprobación abajo.</p>
 *
 * <p>La regla de fondo, y la única que de verdad importa: <b>después de `oscurecer` no puede quedar
 * ningún color claro</b>, salvo el texto, que es claro a propósito.</p>
 *
 *   node packages/ui/src/map/__checks__/oscurecer.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAPAS_REALES_LIBERTY, CAPAS_DEL_ESTILO_COMPLETO } from './estiloRealLiberty.fixture.mjs';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'oscurecer-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir,
      join(raiz, 'packages/ui/src/map/estiloOscuro.ts')],
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

const { PALETA_MAPA, oscurecer } = await import(join(dir, 'estiloOscuro.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos++; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

/** Luminancia relativa de un color CSS. Sin navegador, así que se parsea a mano. */
function luminancia(v) {
  if (typeof v !== 'string') return null;   // una expresión no es un color fijo
  let r, g, b;
  const t = v.trim().toLowerCase();
  if (t.startsWith('#')) {
    const h = t.slice(1);
    const x = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  } else if (t.startsWith('rgb')) {
    const n = t.match(/[\d.]+/g);
    if (!n) return null;
    [r, g, b] = n.slice(0, 3).map(Number);
  } else if (t.startsWith('hsl')) {
    const n = t.match(/[\d.]+/g);
    if (!n) return null;
    const [h, s, l] = [Number(n[0]) / 360, Number(n[1]) / 100, Number(n[2]) / 100];
    const q = (p, q2, u) => {
      if (u < 0) u += 1;
      if (u > 1) u -= 1;
      if (u < 1 / 6) return p + (q2 - p) * 6 * u;
      if (u < 1 / 2) return q2;
      if (u < 2 / 3) return p + (q2 - p) * (2 / 3 - u) * 6;
      return p;
    };
    if (s === 0) { r = g = b = l * 255; }
    else {
      const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q2;
      [r, g, b] = [q(p, q2, h + 1 / 3), q(p, q2, h), q(p, q2, h - 1 / 3)].map((c) => c * 255);
    }
  } else { return null; }
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const CLARO = 0.45;
const oscuro = oscurecer({ version: 8, layers: CAPAS_REALES_LIBERTY });
const de = (id) => oscuro.layers.find((c) => c.id === id)?.paint ?? {};

console.log(`\n── oscurecer() sobre ${CAPAS_REALES_LIBERTY.length} capas reales de liberty (el estilo completo tenía ${CAPAS_DEL_ESTILO_COMPLETO}) ──`);

// ── la regla de fondo ─────────────────────────────────────────────────────────────────────────
const PROPS = ['background-color', 'fill-color', 'line-color', 'fill-outline-color', 'fill-extrusion-color', 'circle-color'];
const claras = [];
for (const capa of oscuro.layers) {
  for (const p of PROPS) {
    const L = luminancia(capa.paint?.[p]);
    if (L !== null && L > CLARO) claras.push(`${capa.id}.${p}=${capa.paint[p]} (L=${L.toFixed(2)})`);
  }
}
check('ninguna capa conserva un color claro (el texto va aparte)', claras.length === 0, claras.join(' · '));
check(
  'el texto SÍ es claro, que es su trabajo',
  luminancia(de('highway-name-major')['text-color']) > CLARO,
  String(de('highway-name-major')['text-color']),
);

// ── defecto 1 · el agua que es una LÍNEA ──────────────────────────────────────────────────────
for (const id of ['waterway_river', 'waterway_tunnel']) {
  check(`${id}: el agua se pinta en line-color, no en fill-color`, de(id)['line-color'] === PALETA_MAPA.agua, JSON.stringify(de(id)['line-color']));
  check(`${id}: y NO se le inventa un fill-color a una línea`, de(id)['fill-color'] === undefined, JSON.stringify(de(id)['fill-color']));
}
check('water: el agua que SÍ es relleno sigue bien', de('water')['fill-color'] === PALETA_MAPA.agua);

// ── defecto 2 · la línea que no es calle ni agua ──────────────────────────────────────────────
for (const id of ['park_outline', 'aeroway_runway', 'aeroway_taxiway', 'boundary_3']) {
  check(`${id}: la línea sin clasificar se apaga`, de(id)['line-color'] === PALETA_MAPA.lineaApagada, JSON.stringify(de(id)['line-color']));
}
check(
  'y el gris apagado se distingue de una calle (no son el mismo color)',
  PALETA_MAPA.lineaApagada !== PALETA_MAPA.calleMenor && PALETA_MAPA.lineaApagada !== PALETA_MAPA.calleMayor,
);

// ── defecto 3 · el contorno de un relleno ─────────────────────────────────────────────────────
check('park: el contorno deja de ser verde y sigue al relleno', de('park')['fill-outline-color'] === PALETA_MAPA.fondo, String(de('park')['fill-outline-color']));
check('park: el relleno se apaga hacia el lienzo', de('park')['fill-color'] === PALETA_MAPA.fondo);
check('landuse_hospital: un relleno sin clasificar también', de('landuse_hospital')['fill-color'] === PALETA_MAPA.fondo);

// ── defecto 4 · el relieve y los patrones, que son imágenes ───────────────────────────────────
check('natural_earth: el relieve ráster se apaga', de('natural_earth')['raster-opacity'] === 0, JSON.stringify(de('natural_earth')['raster-opacity']));
for (const id of ['landcover_wetland', 'road_area_pattern']) {
  check(`${id}: el patrón del proveedor se retira`, de(id)['fill-pattern'] === undefined, String(de(id)['fill-pattern']));
}
check('landcover_wetland: debajo del patrón queda el lienzo', de('landcover_wetland')['fill-color'] === PALETA_MAPA.fondo, String(de('landcover_wetland')['fill-color']));
/*
  `road_area_pattern` queda en el gris de CALLE y no en el lienzo, y está bien: su `source-layer`
  es `transportation`, así que `clase()` lo manda a la familia de las calles — y lo es, es la
  superficie peatonal de una plaza o un bulevar. Pintarla del color del lienzo la borraría del
  mapa; pintarla del gris de calle es decir lo que es.

  Esta comprobación nació esperando el lienzo y falló en su primera corrida. Lo que estaba mal era
  la expectativa, no el recoloreado: queda escrita así para que nadie la «arregle» al revés.
*/
check('road_area_pattern: la superficie peatonal queda en el gris de calle', de('road_area_pattern')['fill-color'] === PALETA_MAPA.calleMenor, String(de('road_area_pattern')['fill-color']));

// ── y lo que no se puede romper ───────────────────────────────────────────────────────────────
check('el lienzo es el del diseño aprobado', de('background')['background-color'] === PALETA_MAPA.fondo);
check('oscurecer no muta el estilo que recibe', CAPAS_REALES_LIBERTY.find((c) => c.id === 'background').paint['background-color'] === '#f8f4f0');
check('un estilo que no es objeto se devuelve tal cual', oscurecer(null) === null && oscurecer('x') === 'x');
check('un estilo sin capas no revienta', JSON.stringify(oscurecer({ version: 8 })) === JSON.stringify({ version: 8 }));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\nSin fallos.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
