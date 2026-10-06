/**
 * El contraste de la paleta, leído del CSS que de verdad se despliega.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>La guía visual del 05-10-2026 pide «comprobar contraste de texto principal/secundario sobre
 * cada superficie y de texto sobre botones». Comprobarlo una vez, a mano, el día del cambio, sirve
 * ese día. Lo que hace falta es que el número salte la PRÓXIMA vez que alguien ajuste un tono —
 * porque el que lo ajuste va a estar mirando si le gusta, no si pasa 4.5.</p>
 *
 * <p>Ya pasó dos veces y las dos se arreglaron midiendo, no mirando: el violeta `#8B5CF6` de la
 * guía de auditoría daba 3.55 sobre su propio fondo y se subió a `#A78BFA`; el azul `#3B82F6` de
 * esta guía da 3.68 con texto blanco encima y el relleno de los botones se bajó a `#2563EB`. Las
 * dos veces el valor propuesto se veía bien y no pasaba.</p>
 *
 * <h2>Por qué lee el CSS y no una copia de los valores</h2>
 *
 * <p>Una prueba contra una lista de hexadecimales escrita a mano comprueba la lista, no el tema. Si
 * mañana alguien cambia `--lx-surface-2` en `tokens.css` y no acá, la prueba sigue en verde sobre
 * una paleta que ya no existe. Así que se parsea el archivo real, se resuelven los `var()` y los
 * `color-mix(... N%, transparent)` sobre la superficie donde de verdad se dibujan, y se mide eso.</p>
 *
 *   node packages/ui/src/__checks__/paleta.check.mjs
 */
import { readFileSync } from 'node:fs';

const tokensCss = new URL('../tokens.css', import.meta.url).pathname;
const css = readFileSync(tokensCss, 'utf8');

// -------------------------------------------------------------------------------------------------
// Leer los tokens de un bloque de reglas
// -------------------------------------------------------------------------------------------------

/** El cuerpo del PRIMER bloque cuyo selector es exactamente éste. */
function bloque(selector) {
  const inicio = css.indexOf(`\n${selector} {`);
  if (inicio < 0) throw new Error(`No encontré el bloque ${selector} en tokens.css`);
  const abre = css.indexOf('{', inicio);
  // Los bloques de tokens no anidan, así que la primera llave de cierre a nivel de línea es la suya.
  const cierra = css.indexOf('\n}', abre);
  return css.slice(abre + 1, cierra);
}

function tokensDe(selector) {
  const mapa = new Map();
  // Se quitan los comentarios antes de leer: dentro hay ejemplos con `--lx-...: #xxxxxx` que son
  // documentación, no declaraciones, y tomarlos por valores sería medir un comentario.
  const cuerpo = bloque(selector).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const linea of cuerpo.split('\n')) {
    const m = linea.match(/^\s*(--lx-[a-z0-9-]+)\s*:\s*(.+?);\s*$/i);
    if (m) mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

const OSCURO = tokensDe(':root');
const CLARO = new Map([...OSCURO, ...tokensDe(":root[data-theme='light']")]);
/*
  El portal de plataforma cambia su acento sobre la misma paleta. Se revisa como un tema más y no
  «por encima» del oscuro: es exactamente donde una deriva se esconde, porque nadie abre ese portal
  para mirar colores y su override redefine `--lx-primary` y `--lx-primary-soft` de una vez.
*/
const PLATAFORMA = new Map([...OSCURO, ...tokensDe(":root[data-portal='platform']")]);
const PLATAFORMA_CLARA = new Map([
  ...CLARO,
  ...tokensDe(":root[data-portal='platform']"),
  ...tokensDe(":root[data-portal='platform'][data-theme='light']"),
]);

// -------------------------------------------------------------------------------------------------
// Color
// -------------------------------------------------------------------------------------------------

function hexARgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbaAPartes(valor) {
  const m = valor.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const partes = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { rgb: partes.slice(0, 3), alfa: partes.length > 3 ? partes[3] : 1 };
}

/**
 * Resuelve un valor de token hasta un color con alfa, siguiendo `var()` y `color-mix`.
 *
 * <p>`color-mix(in srgb, X N%, transparent)` es exactamente «X con alfa N», que es como el sistema
 * construye los fondos suaves de cada estado. Resolverlo acá es lo que permite medir el texto de
 * una insignia sobre su propio fondo, que es donde el contraste de verdad se pierde.</p>
 */
function resolver(mapa, valor, profundidad = 0) {
  if (profundidad > 10) throw new Error(`Demasiadas indirecciones en ${valor}`);
  const v = String(valor).trim();

  const varM = v.match(/^var\((--lx-[a-z0-9-]+)(?:\s*,\s*(.+))?\)$/i);
  if (varM) {
    const referido = mapa.get(varM[1]);
    if (referido !== undefined) return resolver(mapa, referido, profundidad + 1);
    if (varM[2]) return resolver(mapa, varM[2], profundidad + 1);
    throw new Error(`Token sin definir: ${varM[1]}`);
  }

  const mezcla = v.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i);
  if (mezcla) {
    const base = resolver(mapa, mezcla[1], profundidad + 1);
    return { rgb: base.rgb, alfa: base.alfa * (Number(mezcla[2]) / 100) };
  }

  if (v.startsWith('#')) return { rgb: hexARgb(v), alfa: 1 };
  const rgba = rgbaAPartes(v);
  if (rgba) return rgba;
  throw new Error(`No sé resolver el color: ${v}`);
}

/** El color que se VE cuando `color` se dibuja sobre `fondo`. Los dos ya resueltos. */
function componer(color, fondo) {
  if (color.alfa >= 1) return color.rgb;
  return color.rgb.map((c, i) => Math.round(c * color.alfa + fondo.rgb[i] * (1 - color.alfa)));
}

function canal(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminancia([r, g, b]) {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
function contraste(rgbA, rgbB) {
  const a = luminancia(rgbA) + 0.05;
  const b = luminancia(rgbB) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

// -------------------------------------------------------------------------------------------------
// Las comprobaciones
// -------------------------------------------------------------------------------------------------

let fallos = 0;
function medir(etiqueta, valor, minimo) {
  const ok = valor >= minimo - 0.005;
  if (ok) {
    console.log(`  ok  ${etiqueta.padEnd(58)} ${valor.toFixed(2)} ≥ ${minimo}`);
  } else {
    fallos++;
    console.log(`  ✗   ${etiqueta.padEnd(58)} ${valor.toFixed(2)} < ${minimo}`);
  }
}

/** Contraste de un token de texto sobre un token de superficie, componiendo si hace falta. */
function textoSobre(mapa, textoTk, fondoTk, fondoDebajoTk) {
  const fondoDebajo = { rgb: resolver(mapa, mapa.get(fondoDebajoTk)).rgb, alfa: 1 };
  const fondo = { rgb: componer(resolver(mapa, mapa.get(fondoTk)), fondoDebajo), alfa: 1 };
  const texto = componer(resolver(mapa, mapa.get(textoTk)), fondo);
  return contraste(texto, fondo.rgb);
}

/**
 * Cuánto se distingue una capa de la que tiene debajo. 1.0 = idénticas.
 *
 * <p>Compone antes de medir. El borde del tema claro está definido como `rgba(15,23,42,.09)`, y
 * medir su rgb crudo —un azul casi negro— contra la tarjeta daba 15.79: un número enorme para una
 * línea que apenas se ve. Lo que hay que medir es el color que QUEDA cuando se dibuja encima.</p>
 */
function escalon(mapa, encimaTk, debajoTk) {
  const debajo = { rgb: resolver(mapa, mapa.get(debajoTk)).rgb, alfa: 1 };
  const encima = componer(resolver(mapa, mapa.get(encimaTk)), debajo);
  const a = luminancia(encima) + 0.05;
  const b = luminancia(debajo.rgb) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

const SUPERFICIES = ['--lx-bg', '--lx-surface', '--lx-surface-2'];

function revisarTema(nombre, mapa, oscuro) {
  console.log(`\n═══ ${nombre} ═══`);

  console.log('\n-- texto sobre cada superficie (AA, texto corrido: 4.5) --');
  for (const superficie of SUPERFICIES) {
    for (const texto of ['--lx-text', '--lx-text-muted']) {
      medir(`${texto} sobre ${superficie}`, textoSobre(mapa, texto, superficie, superficie), 4.5);
    }
  }

  // El terciario es texto auxiliar de 11–13px; el mínimo sigue siendo 4.5, y la guía pide
  // expresamente «no bajar demasiado el contraste del texto auxiliar».
  console.log('\n-- texto auxiliar --');
  for (const superficie of SUPERFICIES) {
    medir(`--lx-text-subtle sobre ${superficie}`, textoSobre(mapa, '--lx-text-subtle', superficie, superficie), 4.5);
  }

  console.log('\n-- el acento como texto (enlaces, botones fantasma) --');
  for (const superficie of SUPERFICIES) {
    medir(`--lx-primary sobre ${superficie}`, textoSobre(mapa, '--lx-primary', superficie, superficie), 4.5);
  }

  console.log('\n-- texto sobre un control relleno --');
  medir(
    '--lx-primary-contrast sobre --lx-primary-fill',
    textoSobre(mapa, '--lx-primary-contrast', '--lx-primary-fill', '--lx-surface-2'),
    4.5,
  );
  medir(
    '--lx-primary-contrast sobre --lx-primary-fill-hover',
    textoSobre(mapa, '--lx-primary-contrast', '--lx-primary-fill-hover', '--lx-surface-2'),
    4.5,
  );
  medir(
    '--lx-danger-ink sobre --lx-danger',
    textoSobre(mapa, '--lx-danger-ink', '--lx-danger', '--lx-surface-2'),
    4.5,
  );

  /*
    Donde el contraste de verdad se pierde: una insignia dibuja su texto sobre SU PROPIO fondo
    suave, que es el mismo color al 14–16% sobre la tarjeta. Medirlo contra la tarjeta lisa da un
    número bonito y equivocado — es el error que dejó pasar el violeta a 3.55.
  */
  console.log('\n-- estados: el texto sobre su propio fondo suave, encima de la tarjeta --');
  const PARES = [
    ['--lx-success', '--lx-success-soft'],
    ['--lx-warning', '--lx-warning-soft'],
    ['--lx-danger-text', '--lx-danger-soft'],
    ['--lx-info', '--lx-info-soft'],
    ['--lx-primary-text', '--lx-primary-soft'],
    ['--lx-accent-violet', '--lx-accent-violet-soft'],
    ['--lx-accent-amber', '--lx-accent-amber-soft'],
    ['--lx-accent-teal', '--lx-accent-teal-soft'],
  ];
  for (const [texto, suave] of PARES) {
    if (!mapa.has(texto) || !mapa.has(suave)) continue;
    medir(`${texto} sobre ${suave}`, textoSobre(mapa, texto, suave, '--lx-surface-2'), 4.5);
  }

  // Un elemento de interfaz que no es texto —un anillo de foco, un borde de input— necesita 3:1
  // contra lo que lo rodea (WCAG 1.4.11).
  console.log('\n-- elementos que no son texto (3.0) --');
  medir('--lx-focus-ring sobre --lx-surface-2', textoSobre(mapa, '--lx-focus-ring', '--lx-surface-2', '--lx-surface-2'), 3);
  medir('--lx-focus-ring sobre --lx-bg', textoSobre(mapa, '--lx-focus-ring', '--lx-bg', '--lx-bg'), 3);

  /*
    La escalera de superficies. No es una regla de WCAG: es el defecto que se reportó el 25-09-2026
    como «toda la interfaz se ve como un solo bloque azul», y que resultó no venir de los tonos sino
    de que las capas estaban a 1.05 unas de otras. 1.10 es el piso que separó aquello.

    Se mide el par que DE VERDAD se toca, y ése no es el mismo en los dos temas:

      · en oscuro la tarjeta es `surface-2` y se dibuja sobre el FONDO de la página, no sobre la
        barra lateral. Comparar dos capas que casi nunca se tocan es inventarse un problema.
      · en claro la relación se invierte y está escrito en el propio tema: la tarjeta es lo MÁS
        claro que hay (`surface`, blanco) y `surface-2` es el tono hundido de los campos y los
        botones secundarios. Medir «fondo → surface-2» ahí es medir un par que no existe.

    Y el piso tampoco es el mismo. El 1.10 sale de un incidente del tema oscuro; en claro no hubo
    tal incidente, así que lo que se pone no es un objetivo de diseño sino un trinquete: no bajar
    de lo que hay hoy. Está dicho acá para que nadie lo lea como una regla general.
  */
  console.log('\n-- escalonado entre capas --');
  medir('fondo → barra lateral/cabecera', escalon(mapa, '--lx-surface', '--lx-bg'), 1.05);
  if (oscuro) {
    medir('fondo → tarjeta (piso del incidente 25-09)', escalon(mapa, '--lx-surface-2', '--lx-bg'), 1.1);
    medir('tarjeta → hover', escalon(mapa, '--lx-surface-hover', '--lx-surface-2'), 1.1);
    medir('tarjeta → borde', escalon(mapa, '--lx-border', '--lx-surface-2'), 1.1);
  } else {
    medir('tarjeta → tono hundido (trinquete)', escalon(mapa, '--lx-surface-2', '--lx-surface'), 1.04);
    medir('tarjeta → hover (trinquete)', escalon(mapa, '--lx-surface-hover', '--lx-surface-2'), 1.04);
    medir('tarjeta → borde (trinquete)', escalon(mapa, '--lx-border', '--lx-surface'), 1.1);
  }
}

revisarTema('TEMA OSCURO', OSCURO, true);
revisarTema('TEMA CLARO', CLARO, false);
revisarTema('PLATAFORMA · OSCURO', PLATAFORMA, true);
revisarTema('PLATAFORMA · CLARO', PLATAFORMA_CLARA, false);

console.log(`\n${fallos === 0 ? 'Toda la paleta pasa.' : `${fallos} combinación(es) por debajo del mínimo.`}\n`);
process.exit(fallos > 0 ? 1 : 0);
