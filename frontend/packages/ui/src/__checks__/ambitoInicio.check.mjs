/**
 * El ámbito del rediseño visual del Inicio: que no se escape de su pantalla.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>La guía de implementación visual del 14-10-2026 pide el rediseño cromático del Inicio del
 * administrador y prohíbe por escrito lo contrario: «no cambiar colores globales de tablas,
 * formularios, modales ni otras pantallas». La forma de cumplirlo es que CADA regla del bloque
 * cuelgue de `:root[data-portal='admin']:has(.lx-home)` — verdadero en una pantalla y en una
 * sola.</p>
 *
 * <p>Eso se puede comprobar leyendo. El problema es la próxima vez: dentro de seis semanas alguien
 * va a añadir una regla al final del archivo, debajo del comentario, y va a quedar global sin que
 * nadie lo note hasta que el Panel aparezca con el fondo del Inicio. Esta comprobación lee el
 * bloque del archivo que de verdad se despliega y falla si aparece un selector sin el prefijo.</p>
 *
 * <p>También vigila los dos tokens del degradado del anillo. `OccupancyDonut` publica siempre su
 * `url(#…)` en `--lx-donut-gradiente`, pero el degradado sólo se dibuja donde alguien defina
 * `--lx-donut-de` y `--lx-donut-a`; si esos dos aparecieran fuera del ámbito, el anillo de
 * fiscalización y el del Panel cambiarían de color sin que nadie lo hubiera pedido.</p>
 *
 *   node packages/ui/src/__checks__/ambitoInicio.check.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../tokens.css', import.meta.url).pathname, 'utf8');

const MARCA = 'GUÍA DE IMPLEMENTACIÓN VISUAL — INICIO DEL ADMINISTRADOR';
const AMBITO = ":root[data-portal='admin']:has(.lx-home)";

let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  ✗   ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

console.log('\n-- el bloque de la guía visual no sale del Inicio --');

const inicio = css.indexOf(MARCA);
comprobar('el bloque sigue en tokens.css', inicio >= 0);
if (inicio < 0) process.exit(1);

/*
  Desde la apertura del comentario que encabeza el bloque hasta el final del archivo: el bloque es
  lo último que hay. Se empieza en el `/*` y no en la marca porque si no el comentario de cabecera
  entra en el recorte ya empezado, sin su apertura, y el barrido de comentarios de abajo no lo
  reconoce — leería la prosa como si fuera un selector.
*/
const bloque = css.slice(css.lastIndexOf('/*', inicio));

/*
  Los selectores del bloque. Se quitan primero los comentarios —adentro hay selectores citados como
  documentación— y después se toma lo que hay delante de cada `{` que abre una regla.
*/
const sinComentarios = bloque.replace(/\/\*[\s\S]*?\*\//g, '');
const selectores = [];
for (const trozo of sinComentarios.split('}')) {
  const llave = trozo.indexOf('{');
  if (llave < 0) continue;
  for (const sel of trozo.slice(0, llave).split(',')) {
    const limpio = sel.trim();
    if (limpio) selectores.push(limpio);
  }
}

comprobar('el bloque declara al menos una regla', selectores.length > 0);
const fugados = selectores.filter((s) => !s.startsWith(AMBITO));
comprobar(
  `los ${selectores.length} selectores del bloque empiezan por el ámbito del Inicio`,
  fugados.length === 0,
  fugados.length ? `sin el prefijo «${AMBITO}»: ${fugados.join(' | ')}` : '',
);

/*
  Nadie debería poder declarar el ámbito dentro de una media query sin darse cuenta de que entonces
  la regla sólo vale a ciertos anchos. No es un error, pero sí algo que esta comprobación tiene que
  dejar de pasar en silencio: si llega el día, que alguien lo decida a propósito.
*/
comprobar('el bloque no esconde reglas dentro de un @media', !/@media/.test(sinComentarios));

console.log('\n-- el degradado del anillo no se derrama a los otros anillos --');

/*
  `OccupancyDonut` dibuja siempre el degradado y siempre publica su url, pero con los dos extremos
  en `--lx-primary`: un anillo que no opte por él se ve igual que antes. Optar es definir estos dos
  tokens, y eso sólo puede pasar dentro del ámbito.
*/
for (const token of ['--lx-donut-de', '--lx-donut-a']) {
  const total = (css.match(new RegExp(`^\\s*${token}\\s*:`, 'gm')) ?? []).length;
  const dentro = (bloque.match(new RegExp(`^\\s*${token}\\s*:`, 'gm')) ?? []).length;
  comprobar(
    `${token} se declara sólo dentro del bloque (${dentro} de ${total})`,
    total > 0 && total === dentro,
    total === 0 ? 'no se declara en ninguna parte' : '',
  );
}

/*
  Y el consumidor: la regla que usa el degradado tiene que llevar su reserva. Sin el segundo
  argumento de `var()`, un anillo dentro del ámbito pero sin `--lx-donut-gradiente` —porque el
  componente cambió— se quedaría sin trazo, o sea invisible, en vez de volver al azul plano.
*/
comprobar(
  'la regla que usa el degradado conserva su valor de reserva',
  /stroke:\s*var\(--lx-donut-gradiente,\s*var\(--lx-primary\)\)/.test(bloque),
);

console.log(
  `\n${fallos === 0 ? 'El rediseño visual no sale del Inicio del administrador.' : `${fallos} comprobación(es) fallaron.`}\n`,
);
process.exit(fallos > 0 ? 1 : 0);
