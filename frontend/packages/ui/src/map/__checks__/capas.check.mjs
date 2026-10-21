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

const { VERIFICADA, FUENTE, PROP_ETIQUETA, capasDeZonas } = await import(join(dir, 'capas.js'));

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos++; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const OFICIAL = '#0079FB';
const NO_OFICIAL = '#8B5CF6';
const TEXTO = '#D7E2F0';
const BORDE_TEXTO = '#06101C';
const FUENTE_TIPOGRAFICA = ['Noto Sans Bold'];

const base = { colorOficial: OFICIAL, colorNoOficial: NO_OFICIAL, colorTexto: TEXTO, colorBordeTexto: BORDE_TEXTO };
const capas = capasDeZonas({ ...base, fuenteTexto: FUENTE_TIPOGRAFICA });
const sinTipografia = capasDeZonas(base);
const porId = Object.fromEntries(capas.map((c) => [c.id, c]));
const texto = JSON.stringify(capas);

check('VERIFIED es lo único que cuenta como oficial', VERIFICADA === 'VERIFIED', VERIFICADA);
check('todas las capas salen de la misma fuente',
  capas.every((c) => c.source === FUENTE), texto);
check('están las cinco: relleno, resplandor, borde oficial, borde no oficial y rótulo',
  capas.length === 5 && porId['zonas-relleno'] && porId['zonas-resplandor']
  && porId['zonas-borde'] && porId['zonas-borde-no-oficial'] && porId['zonas-etiqueta'],
  capas.map((c) => c.id).join(', '));

/*
  El resplandor va DEBAJO del contorno nítido: si se añadiera encima, lo difuminaría en vez de
  rodearlo. El orden del arreglo es el orden en que se añaden al mapa.
*/
check('el resplandor se dibuja antes que los contornos',
  capas.findIndex((c) => c.id === 'zonas-resplandor') < capas.findIndex((c) => c.id === 'zonas-borde'),
  capas.map((c) => c.id).join(' → '));
check('el resplandor es ancho y difuminado, no un borde más',
  porId['zonas-resplandor'].paint['line-width'] >= 6 && porId['zonas-resplandor'].paint['line-blur'] > 0,
  JSON.stringify(porId['zonas-resplandor'].paint));

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
/*
  Esta comprobación decía antes «ninguna capa que no sea relleno o línea», y con eso bastaba
  mientras no hubiera rótulos. Lo que de verdad protege es otra cosa: que no se dibuje un PUNTO
  sobre el mapa, porque `parking_spaces` no tiene coordenadas y un pin inventado sobre una cuadra
  es peor que no tener mapa. Un rótulo de texto centrado en el polígono de la zona no es un punto:
  no dice dónde está ninguna bahía, dice cómo se llama la zona que ya está dibujada.

  Así que ahora se exige lo que importa: ni capas de círculo, ni iconos, ni nada anclado a una
  coordenada propia.
*/
check('no se marca ninguna bahía: sin capas de punto y sin iconos',
  capas.every((c) => c.type === 'fill' || c.type === 'line' || c.type === 'symbol')
  && capas.every((c) => c.type !== 'circle')
  && !/icon-image|circle-radius/.test(texto),
  capas.map((c) => `${c.id}:${c.type}`).join(', '));
check('no se lee ninguna propiedad que el servidor no envía',
  !/\['get', '(?!status'|code'|name'|source'|verifiedAt'|lxEtiqueta')/.test(texto));

// --- el rótulo ---------------------------------------------------------------------------------
/*
  El rótulo se compone fuera —nombre y tarifa— y entra por una propiedad añadida por nosotros.
  `lxEtiqueta` no viene del servidor, y por eso está en la lista de arriba: es la única excepción
  y conviene que se vea.
*/
check('el rótulo usa la propiedad compuesta, no una del servidor',
  JSON.stringify(porId['zonas-etiqueta'].layout['text-field']) === JSON.stringify(['get', PROP_ETIQUETA]),
  JSON.stringify(porId['zonas-etiqueta'].layout['text-field']));
check('el rótulo usa la tipografía que le pasan y no una escrita a mano',
  JSON.stringify(porId['zonas-etiqueta'].layout['text-font']) === JSON.stringify(FUENTE_TIPOGRAFICA),
  JSON.stringify(porId['zonas-etiqueta'].layout['text-font']));
check('el rótulo lleva borde para leerse sobre cualquier calle',
  porId['zonas-etiqueta'].paint['text-halo-width'] > 0
  && porId['zonas-etiqueta'].paint['text-halo-color'] === BORDE_TEXTO);
/*
  Sin tipografía disponible NO se añade la capa. Es la diferencia entre un mapa con zonas y un mapa
  caído: si la familia no está en el juego de glifos del proveedor, MapLibre lanza un error, el
  componente lo recoge y la pantalla entera muestra el aviso de fallo.
*/
check('sin tipografía del proveedor, no se añade la capa de rótulos',
  sinTipografia.length === 4 && sinTipografia.every((c) => c.id !== 'zonas-etiqueta'),
  sinTipografia.map((c) => c.id).join(', '));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
