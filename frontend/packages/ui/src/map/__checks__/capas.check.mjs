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

const {
  VERIFICADA, FUENTE, PROP_ETIQUETA, PROP_TONO, TONOS_DE_ZONA, capasDeZonas, tonoDeZona,
} = await import(join(dir, 'capas.js'));

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
/* Varias propiedades pasaron a ser expresiones el 23-10-2026; esto saca sus ramas numéricas
   para poder exigirlas TODAS. Una rama olvidada en 0 apaga el neón sin dar error. */
const numerosDe = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [v]);
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

// --- el anillo de la zona elegida (22-10-2026) -------------------------------------------------
/*
  Sin zona elegida el mapa tiene que quedar EXACTAMENTE como estaba. Es la mitad que se olvida de
  una capa condicional: se comprueba que aparece cuando toca, y no que desaparece cuando no toca.
*/
const ELEGIDA = '#F2F7FF';
const conElegida = capasDeZonas({
  ...base, fuenteTexto: FUENTE_TIPOGRAFICA, codigoElegido: 'SJ-AMON', colorElegida: ELEGIDA,
});
const elegida = conElegida.find((c) => c.id === 'zonas-elegida');
check('sin zona elegida no se añade ninguna capa más',
  capas.some((c) => c.id === 'zonas-elegida') === false, capas.map((c) => c.id).join(', '));
/*
  DOS capas, no una, desde el 24-10-2026. Era una sola, sólida, y con una zona NO oficial elegida
  ese anillo se dibujaba encima del contorno punteado y lo tapaba: la elegida se veía igual que una
  verificada. Cazado en una captura con los rectángulos DEMO de San José. `line-dasharray` no se
  puede decidir por los datos, así que separar el trazo exige separar la capa.
*/
const elegidaNoOficial = conElegida.find((c) => c.id === 'zonas-elegida-no-oficial');
check('con zona elegida se añaden DOS anillos: el sólido y el punteado',
  conElegida.length === capas.length + 2 && Boolean(elegida) && Boolean(elegidaNoOficial),
  conElegida.map((c) => c.id).join(', '));
check('el anillo sólido es sólo para la elegida que ADEMÁS es oficial',
  JSON.stringify(elegida.filter)
    === JSON.stringify(['all', ['==', ['get', 'code'], 'SJ-AMON'], ['==', ['get', 'status'], 'VERIFIED']]),
  JSON.stringify(elegida.filter));
check('y el punteado, sólo para la elegida que NO lo es',
  JSON.stringify(elegidaNoOficial.filter)
    === JSON.stringify(['all', ['==', ['get', 'code'], 'SJ-AMON'],
      ['!', ['==', ['get', 'status'], 'VERIFIED']]]),
  JSON.stringify(elegidaNoOficial.filter));
/*
  Y que el punteado sea punteado de verdad. Sin esto, alguien «simplifica» las dos capas en una el
  día que no recuerde por qué estaban separadas, y el defecto vuelve exactamente igual.
*/
check('el anillo de la no oficial lleva trazo discontinuo',
  Array.isArray(elegidaNoOficial.paint['line-dasharray'])
    && elegidaNoOficial.paint['line-dasharray'].length >= 2,
  JSON.stringify(elegidaNoOficial.paint['line-dasharray']));
check('y el sólido NO lo lleva: una verificada se dibuja de un trazo',
  elegida.paint['line-dasharray'] === undefined,
  JSON.stringify(elegida.paint['line-dasharray']));
check('el anillo va encima de los dos contornos y debajo del rótulo',
  conElegida.findIndex((c) => c.id === 'zonas-elegida')
    > conElegida.findIndex((c) => c.id === 'zonas-borde-no-oficial')
  && conElegida.findIndex((c) => c.id === 'zonas-elegida')
    < conElegida.findIndex((c) => c.id === 'zonas-etiqueta'),
  conElegida.map((c) => c.id).join(' → '));
/*
  Lo que de verdad protege esta: que «cuál elegí» no se diga sólo con un color. Quien no distingue
  el blanco del azul tiene que poder verlo igual, y lo que le queda es el ancho.
*/
const anchoBorde = Math.max(...numerosDe(porId['zonas-borde'].paint['line-width']));
check('el anillo se distingue también por el ancho, no sólo por el color',
  elegida.paint['line-width'] >= anchoBorde * 1.3,
  `${elegida.paint['line-width']} contra ${anchoBorde}`);
check('un color explícito, si se pasa, se respeta',
  elegida.paint['line-color'] === ELEGIDA, String(elegida.paint['line-color']));
check('el anillo es continuo: el punteado sigue queriendo decir «no oficial»',
  elegida.paint['line-dasharray'] === undefined);
/*
  Desde el 23-10-2026 el anillo toma el tono de la zona, así que un código BASTA: el color dejó de
  ser obligatorio. Lo que sigue siendo cierto —y es lo que protege de una capa a medias, que en
  MapLibre es un estilo que no valida y una pantalla caída al aviso de fallo— es que sin código no
  hay anillo.
*/
check('un código sin color ya alcanza: el anillo toma el tono de la zona',
  capasDeZonas({ ...base, codigoElegido: 'SJ-AMON' }).some((c) => c.id === 'zonas-elegida'));
check('y ese anillo lee el tono del rasgo',
  JSON.stringify(capasDeZonas({ ...base, codigoElegido: 'SJ-AMON' })
    .find((c) => c.id === 'zonas-elegida').paint['line-color'])
    === JSON.stringify(['coalesce', ['get', 'lxTono'], OFICIAL]));
check('un color sin código no añade nada: sin zona elegida no hay anillo',
  capasDeZonas({ ...base, colorElegida: ELEGIDA }).some((c) => c.id === 'zonas-elegida') === false);

/*
  El resplandor va DEBAJO del contorno nítido: si se añadiera encima, lo difuminaría en vez de
  rodearlo. El orden del arreglo es el orden en que se añaden al mapa.
*/
check('el resplandor se dibuja antes que los contornos',
  capas.findIndex((c) => c.id === 'zonas-resplandor') < capas.findIndex((c) => c.id === 'zonas-borde'),
  capas.map((c) => c.id).join(' → '));
/*
  El ancho y el desenfoque pasaron a ser expresiones el 23-10-2026 —la zona elegida resplandece
  más— así que se comprueban TODAS sus ramas: una rama olvidada en 0 apaga el neón de media lista
  y el estilo sigue siendo válido, que es la clase de defecto que no da error.
*/
check('el resplandor es ancho y difuminado en todas sus ramas',
  numerosDe(porId['zonas-resplandor'].paint['line-width']).every((n) => n >= 6)
  && numerosDe(porId['zonas-resplandor'].paint['line-blur']).every((n) => n > 0),
  JSON.stringify(porId['zonas-resplandor'].paint));

// --- el reparto entre oficial y no oficial ----------------------------------------------------
/*
  EL COLOR CAMBIÓ DE SIGNIFICADO EL 23-10-2026, Y ESTA COMPROBACIÓN CAMBIÓ CON ÉL.

  Decía «el relleno decide el color por el ESTADO»: azul verificado, violeta no verificado. Ahora
  el color dice QUÉ ZONA es —tres tonos neón, como el boceto— y lo que distingue una geometría de
  demostración es el trazo punteado, el relleno más tenue y la palabra del rótulo. Lo que se exige
  acá es que el tono venga del propio rasgo y no de una decisión escrita en el estilo.
*/
check('el relleno toma el tono del rasgo, no del estado',
  JSON.stringify(porId['zonas-relleno'].paint['fill-color'])
    === JSON.stringify(['coalesce', ['get', 'lxTono'], OFICIAL]),
  JSON.stringify(porId['zonas-relleno'].paint['fill-color']));
check('y hay un color de reserva: un rasgo sin tono se pinta, no desaparece',
  porId['zonas-relleno'].paint['fill-color'][2] === OFICIAL);
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
/*
  Lo que sustituye a la regla del color: una geometría no oficial tiene que distinguirse SIN
  depender de él. Tres señales, y las tres se comprueban: el trazo punteado (más abajo), el relleno
  más tenue, y la palabra en el rótulo (al final de este archivo).
*/
const relleno = porId['zonas-relleno'].paint['fill-opacity'];
check('lo no oficial se rellena más tenue que lo oficial',
  relleno[0] === 'case' && relleno[relleno.length - 1] < relleno[relleno.length - 2],
  JSON.stringify(relleno));
const brillo = porId['zonas-resplandor'].paint['line-opacity'];
check('y resplandece menos',
  brillo[brillo.length - 1] < brillo[brillo.length - 2], JSON.stringify(brillo));

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
/*
  Translúcido en TODAS sus ramas, incluida la de la zona elegida: tapar las calles de abajo deja al
  ciudadano sin la referencia que vino a buscar, y la zona elegida es justo la que más va a mirar.
*/
const opacidades = numerosDe(porId['zonas-relleno'].paint['fill-opacity']);
check('el relleno es translúcido en todas sus ramas',
  opacidades.length >= 3 && opacidades.every((o) => o > 0 && o <= 0.5),
  JSON.stringify(opacidades));

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
