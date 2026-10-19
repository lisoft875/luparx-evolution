/**
 * Las capas con que se dibujan los perímetros, comprobadas sin navegador.
 *
 * <p>Lo que se mide acá es la regla que no puede equivocarse: una geometría que el servidor no
 * declara VERIFIED no puede pintarse como si fuera un límite oficial. Y, de paso, la trampa que
 * ya costó una corrida: `line-dasharray` con una expresión hace que MapLibre rechace el estilo
 * entero y el mapa caiga al aviso de error.</p>
 *
 *   node packages/ui/src/map/__checks__/capas.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'capas-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir,
      join(raiz, 'packages/ui/src/map/capas.ts')],
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

const { VERIFICADA, FUENTE, capasDeZonas } = await import(join(dir, 'capas.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos++; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const OFICIAL = '#0079FB';
const NO_OFICIAL = '#8B5CF6';
const capas = capasDeZonas(OFICIAL, NO_OFICIAL);
const porId = Object.fromEntries(capas.map((c) => [c.id, c]));
const texto = JSON.stringify(capas);

check('VERIFIED es lo único que cuenta como oficial', VERIFICADA === 'VERIFIED', VERIFICADA);
check('las tres capas salen de la misma fuente',
  capas.every((c) => c.source === FUENTE), texto);
check('son exactamente tres: relleno, borde oficial y borde no oficial',
  capas.length === 3 && porId['zonas-relleno'] && porId['zonas-borde'] && porId['zonas-borde-no-oficial'],
  capas.map((c) => c.id).join(', '));

// --- el reparto entre oficial y no oficial ----------------------------------------------------
check('el relleno decide el color por el estado, no por el orden de llegada',
  JSON.stringify(porId['zonas-relleno'].paint['fill-color'])
    === JSON.stringify(['case', ['==', ['get', 'status'], 'VERIFIED'], OFICIAL, NO_OFICIAL]),
  JSON.stringify(porId['zonas-relleno'].paint['fill-color']));
check('el borde sólido sólo acepta VERIFIED',
  JSON.stringify(porId['zonas-borde'].filter) === JSON.stringify(['==', ['get', 'status'], 'VERIFIED']),
  JSON.stringify(porId['zonas-borde'].filter));
check('el borde punteado acepta todo lo demás',
  JSON.stringify(porId['zonas-borde-no-oficial'].filter) === JSON.stringify(['!=', ['get', 'status'], 'VERIFIED']),
  JSON.stringify(porId['zonas-borde-no-oficial'].filter));
check('los dos filtros son complementarios: ninguna geometría queda sin borde ni con dos',
  porId['zonas-borde'].filter[0] === '==' && porId['zonas-borde-no-oficial'].filter[0] === '!='
  && JSON.stringify(porId['zonas-borde'].filter.slice(1))
    === JSON.stringify(porId['zonas-borde-no-oficial'].filter.slice(1)));
check('una geometría no oficial nunca lleva el color del límite oficial',
  porId['zonas-borde-no-oficial'].paint['line-color'] === NO_OFICIAL
  && porId['zonas-borde'].paint['line-color'] === OFICIAL);

// --- lo que distingue sin depender del color --------------------------------------------------
check('lo no oficial se distingue también por el trazo',
  Array.isArray(porId['zonas-borde-no-oficial'].paint['line-dasharray'])
  && porId['zonas-borde-no-oficial'].paint['line-dasharray'].every((n) => typeof n === 'number'),
  JSON.stringify(porId['zonas-borde-no-oficial'].paint['line-dasharray']));
check('lo oficial va con trazo continuo',
  porId['zonas-borde'].paint['line-dasharray'] === undefined);

// --- la trampa de MapLibre --------------------------------------------------------------------
// `line-dasharray` no es una propiedad controlable por los datos: una expresión ahí hace que el
// estilo no valide y el mapa entero caiga al aviso de error, sin que TypeScript diga nada.
const conExpresion = capas.filter((c) => {
  const d = c.paint['line-dasharray'];
  return Array.isArray(d) && d.some((v) => typeof v === 'string' || Array.isArray(v));
});
check('ninguna capa pone una expresión en line-dasharray', conExpresion.length === 0,
  JSON.stringify(conExpresion));

// --- el relleno deja ver la calle -------------------------------------------------------------
const opacidad = porId['zonas-relleno'].paint['fill-opacity'];
check('el relleno es translúcido: no tapa las calles de referencia',
  typeof opacidad === 'number' && opacidad > 0 && opacidad <= 0.4, String(opacidad));

// --- nada inventado ---------------------------------------------------------------------------
check('no hay ninguna capa de puntos: no se marca ninguna bahía',
  capas.every((c) => c.type === 'fill' || c.type === 'line'),
  capas.map((c) => `${c.id}:${c.type}`).join(', '));
check('no se lee ninguna propiedad que el servidor no envía',
  !/\['get', '(?!status'|code'|name'|source'|verifiedAt')/.test(texto));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
