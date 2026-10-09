/**
 * El contraste de la paleta, medido sin navegador y sin red.
 *
 * <h2>Por qué este arnés es distinto de todos los demás</h2>
 *
 * <p>Los otros siete arcos de `tests/responsive` necesitan Playwright y una instancia de staging
 * contra la que apuntar. Este no: lee `packages/ui/src/tokens.css`, resuelve las cadenas de
 * `var()` a mano y hace la cuenta de luminancia relativa. Corre en cualquier sitio, en menos de un
 * segundo, sin instalar nada. Es por tanto el único que puede correr en una máquina sin salida a
 * la red —que es exactamente la situación en la que se escribió, el 08-10-2026—.</p>
 *
 * <h2>Qué puede y qué no puede ver</h2>
 *
 * <p>Ve lo que un token vale y, por lo tanto, si DOS tokens puestos uno sobre otro alcanzan el
 * mínimo. No ve qué regla usa qué token: ésa es la grieta por la que se colaron cinco reglas que
 * usaban `--lx-danger` —un color de RELLENO— como color de TEXTO, y que el comprobador de paleta
 * no podía ver porque el token estaba bien y el uso estaba mal. Por eso acá los pares se escriben
 * a mano con el nombre de la pieza: la lista ES la afirmación de qué va sobre qué, y revisarla es
 * revisar los usos.</p>
 *
 * <p>Tampoco resuelve `color-mix()`: los pares que dependen de una mezcla se reportan como «no se
 * pudo resolver» en vez de aprobarse en silencio, que es lo honesto.</p>
 *
 * <h2>Los mínimos</h2>
 *
 * <p>4.5 para texto normal, 3.0 para texto grande (desde 24px, o 18.66px en negrita) y para
 * elementos gráficos como el arco de un dónut o una barra. 1.1 cuando lo que se mide es que dos
 * superficies se distingan entre sí, que no es un criterio de accesibilidad sino la afirmación de
 * que el plano de abajo se ve.</p>
 *
 *   node tests/contraste-tokens.cjs
 */
const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'packages', 'ui', 'src', 'tokens.css');
const css = fs.readFileSync(RUTA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Los tokens de un bloque, por selector exacto. */
function tokensDe(selector) {
  const i = css.indexOf(`${selector} {`);
  if (i === -1) throw new Error(`No encontré el bloque «${selector}» en tokens.css`);
  const fin = css.indexOf('\n}', i);
  return Object.fromEntries(
    [...css.slice(i, fin).matchAll(/(--lx-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

/* `:root` aparece varias veces —los bloques que se fueron añadiendo al final de la hoja— y todas
   cuentan, en orden, porque la última gana. */
const oscuro = {};
for (const m of css.matchAll(/(?:^|\n):root \{/g)) {
  const fin = css.indexOf('\n}', m.index);
  for (const t of css.slice(m.index, fin).matchAll(/(--lx-[\w-]+)\s*:\s*([^;]+);/g)) {
    oscuro[t[1]] = t[2].trim();
  }
}
const claro = { ...oscuro, ...tokensDe(":root[data-theme='light']") };
/*
  El ciudadano tiene su propia paleta desde el 09-10-2026, por el mismo gancho `data-portal` con
  el que la plataforma tiene la suya. Una paleta nueva sin medir es exactamente lo que este arnés
  existe para no dejar pasar: su CTA, con el azul que daba la especificación, tenía 3.51.
*/
const ciudadano = { ...oscuro, ...tokensDe(":root[data-portal='citizen']") };

/** Sigue la cadena de `var()`, con respaldo, hasta un hexadecimal. `null` si no llega. */
function resolver(valor, tabla, profundidad = 0) {
  if (profundidad > 8) return null;
  const v = String(valor).trim();
  const m = /^var\((--lx-[\w-]+)(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (m) {
    const [, nombre, respaldo] = m;
    if (tabla[nombre] !== undefined) return resolver(tabla[nombre], tabla, profundidad + 1);
    return respaldo ? resolver(respaldo, tabla, profundidad + 1) : null;
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`;
  return null; // color-mix() y demás: fuera del alcance, y se reporta como tal
}

function luminancia(hex) {
  const canal = (par) => {
    const x = parseInt(par, 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const h = hex.slice(1);
  return 0.2126 * canal(h.slice(0, 2)) + 0.7152 * canal(h.slice(2, 4)) + 0.0722 * canal(h.slice(4, 6));
}

function razon(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/*
  Los pares, por la pieza de pantalla que los pone uno sobre el otro.

  La lista es la parte importante del archivo: es la afirmación explícita de qué color va sobre qué
  fondo en cada sitio. Si una regla cambia de token, acá hay que cambiarla también — y eso es
  deliberado, porque es el único momento en que alguien vuelve a mirar si la pareja se sostiene.
*/
const PARES = [
  // --- Fiscalización: lanzador 2×2 y consulta rápida (07-10-2026) ---
  ['tile azul · título', '--lx-primary-contrast', '--lx-primary-fill', 4.5],
  ['tile azul · hover', '--lx-primary-contrast', '--lx-primary-fill-hover', 4.5],
  ['botón cuadrado de búsqueda', '--lx-primary-contrast', '--lx-primary-fill', 3.0],
  ['tile: título sobre superficie', '--lx-text', '--lx-surface-2', 4.5],
  ['tile: ayuda sobre superficie', '--lx-text-muted', '--lx-surface-2', 4.5],
  ['tile: chevron', '--lx-text-subtle', '--lx-surface-2', 3.0],
  ['tile: insignia de pendientes', '--lx-danger-ink', '--lx-danger', 4.5],
  ['saludo del fiscalizador', '--lx-text', '--lx-bg', 4.5],
  ['«Fiscalización · municipalidad»', '--lx-text-muted', '--lx-bg', 4.5],
  ['última consulta: la placa', '--lx-text', '--lx-surface', 4.5],
  ['última consulta: los datos', '--lx-text-muted', '--lx-surface', 4.5],
  ['veredicto: la placa', '--lx-text', '--lx-surface', 4.5],

  // --- Fiscalización: barra inferior (07-10-2026) ---
  ['barra inferior: etiqueta inactiva', '--lx-text-subtle', '--lx-chrome', 4.5],
  ['barra inferior: destino activo', '--lx-primary', '--lx-chrome', 4.5],

  // --- Fiscalización: riel de la boleta y cola (08-10-2026) ---
  ['riel: paso hecho', '--lx-primary-contrast', '--lx-primary-fill', 4.5],
  ['riel: paso actual', '--lx-primary', '--lx-surface-2', 4.5],
  ['riel: paso pendiente', '--lx-text-muted', '--lx-surface-2', 4.5],
  ['riel: etiqueta', '--lx-text-muted', '--lx-surface', 4.5],
  ['riel compacto «Paso X de 4»', '--lx-primary', '--lx-surface', 4.5],
  ['cola: la placa', '--lx-text', '--lx-surface', 4.5],
  ['cola: hora y metadatos', '--lx-text-muted', '--lx-surface', 4.5],
  ['cola: «Detalles técnicos»', '--lx-primary', '--lx-surface', 4.5],

  // --- Inicio del admin: saludo, dónut y ranking (08-10-2026) ---
  ['hora del tablero', '--lx-text', '--lx-bg', 4.5],
  ['fecha del tablero', '--lx-text-muted', '--lx-bg', 4.5],
  ['dónut: el arco sobre su pista', '--lx-primary', '--lx-surface-2', 3.0],
  ['dónut: la pista sobre la tarjeta', '--lx-surface-2', '--lx-surface', 1.1],
  ['dónut: el número', '--lx-text', '--lx-surface', 4.5],
  ['dónut: «Ocupación total»', '--lx-text-muted', '--lx-surface', 4.5],
  ['ranking: el puesto', '--lx-text-muted', '--lx-surface-2', 4.5],
  ['ranking: nombre de zona', '--lx-text', '--lx-surface', 4.5],
  ['ranking: el porcentaje', '--lx-text-muted', '--lx-surface', 4.5],
  ['ranking: la barra sobre su pista', '--lx-primary', '--lx-surface-2', 3.0],
  ['«Ver detalle ›»', '--lx-primary', '--lx-surface', 4.5],
  ['«ESTADO DE LOS SERVICIOS»', '--lx-text-subtle', '--lx-bg', 4.5],
  ['franja de servicios', '--lx-text-muted', '--lx-bg', 4.5],
];

/* Los pares propios de la fachada del ciudadano. Se escriben aparte y no se reutilizan los de
   arriba: aquellos nombran piezas del fiscalizador y del admin —el riel de la boleta, el dónut—
   que en este portal no existen, y una prueba que mide parejas inexistentes informa de nada. */
const PARES_CIUDADANO = [
  ['héroe: el saludo sobre el fondo', '--lx-text', '--lx-bg', 4.5],
  ['héroe: el subtítulo', '--lx-text-muted', '--lx-bg', 4.5],
  ['CTA: el texto sobre el relleno azul', '--lx-primary-contrast', '--lx-primary-fill', 4.5],
  ['CTA: el extremo claro del degradado (icono)', '--lx-primary-contrast', '--lx-cta-bright', 3.0],
  ['saldo y placa sobre la tarjeta', '--lx-text', '--lx-surface', 4.5],
  ['etiquetas de tarjeta', '--lx-text-muted', '--lx-surface', 4.5],
  ['«Editar» y «Ver todas»', '--lx-primary', '--lx-surface', 4.5],
  ['icono en su cuadrado', '--lx-primary', '--lx-surface', 3.0],
  ['multas: el ámbar sobre la tarjeta', '--lx-warning', '--lx-surface', 4.5],
  ['multas: el monto en rojo', '--lx-danger-text', '--lx-surface', 4.5],
  ['«En línea» en verde', '--lx-success', '--lx-surface', 4.5],
  ['barra inferior: destino activo', '--lx-primary', '--lx-chrome', 4.5],
  ['barra inferior: destino inactivo', '--lx-text-muted', '--lx-chrome', 4.5],
  ['la tarjeta se distingue del fondo', '--lx-surface', '--lx-bg', 1.1],
  ['la superficie elevada también', '--lx-surface-2', '--lx-bg', 1.1],
  ['el borde sobre la tarjeta', '--lx-border', '--lx-surface', 1.1],
];

let fallos = 0;
let sinResolver = 0;
for (const [nombreTema, tabla, lista] of [
  ['oscuro', oscuro, PARES],
  ['claro', claro, PARES],
  ['ciudadano', ciudadano, PARES_CIUDADANO],
]) {
  console.log(`\n===== tema ${nombreTema} =====`);
  for (const [pieza, tinta, fondo, minimo] of lista) {
    const a = resolver(`var(${tinta})`, tabla);
    const b = resolver(`var(${fondo})`, tabla);
    if (!a || !b) {
      sinResolver++;
      console.log(`  ??  ${pieza}: sin resolver (${tinta}=${a}, ${fondo}=${b})`);
      continue;
    }
    const r = razon(a, b);
    if (r >= minimo) {
      console.log(`  ok  ${pieza}: ${r}`);
    } else {
      fallos++;
      console.log(`  ✗   ${pieza}: ${r} < ${minimo}   ${tinta}=${a} sobre ${fondo}=${b}`);
    }
  }
}

/* Un par que no se pudo resolver NO aprueba: o el token dejó de existir —que es un defecto, y de
   los silenciosos, porque `var()` sin valor hace que la declaración se descarte y el color lo
   herede del padre— o depende de un `color-mix` y hay que medirlo en el navegador. */
console.log(
  `\n${fallos === 0 && sinResolver === 0 ? 'Sin fallos de contraste.' : `${fallos} por debajo del mínimo, ${sinResolver} sin resolver.`}`,
);
process.exit(fallos > 0 || sinResolver > 0 ? 1 : 0);
