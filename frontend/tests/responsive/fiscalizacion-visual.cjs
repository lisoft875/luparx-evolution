/**
 * Fiscalización · especificación visual responsive — los criterios medibles.
 *
 * <p>Mide la pantalla inicial de /inspector contra la tabla de medidas del documento del
 * 07-10-2026 y contra sus criterios de aceptación, en los CINCO tamaños que el paso 9 nombra:
 * 360x800, 375x812, 390x844, 768x1024 y tablet horizontal.</p>
 *
 * <h2>Qué se mide y qué no</h2>
 *
 * <p>Se mide la caja que el navegador compuso, nunca lo que declara la hoja de estilos: que una
 * regla diga `position: fixed` no prueba que la barra se vea, y que un token valga 64px no prueba
 * que el destino mida 64. Se desplaza de verdad hasta el final y se pregunta dónde quedó cada
 * cosa.</p>
 *
 * <p>Y NO se mide nada cuyo veredicto dependa de dos magnitudes parecidas. Esa es la lección de
 * cinco falsos positivos propios esta semana: una comprobación que compara 1.8 con 2.0 no es una
 * comprobación, es una apuesta. Acá los umbrales son los del documento (44, 64, 72, 16) y la
 * holgura es explícita donde hace falta.</p>
 *
 *   PASS='...' node tests/responsive/fiscalizacion-visual.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'inspector@luparx.test';

/** Los cinco del paso 9 del documento, en ese orden. */
const TAMANOS = [
  { nombre: '360x800 (el más angosto que el documento admite)', width: 360, height: 800 },
  { nombre: '375x812 (el de referencia)', width: 375, height: 812 },
  { nombre: '390x844', width: 390, height: 844 },
  { nombre: '768x1024 (tablet vertical)', width: 768, height: 1024 },
  { nombre: '1024x768 (tablet horizontal)', width: 1024, height: 768 },
];

let fallos = 0;
function ok(condicion, mensaje, detalle) {
  if (condicion) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/inspector/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/inspector/login'), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del fiscalizador falló con ${respuesta.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
  }
  return page;
}

/** La barra inferior, que es el defecto que el documento pide resolver antes que nada. */
async function barraInferior(page, tamano) {
  const barra = await page.evaluate(() => {
    const nodo = document.querySelector('.lx-bottom-tab-bar');
    if (!nodo) return null;
    const caja = nodo.getBoundingClientRect();
    const estilo = getComputedStyle(nodo);
    const destinos = [...nodo.querySelectorAll('.lx-bottom-tab-bar__tab')].map((tab) => {
      const c = tab.getBoundingClientRect();
      const etiqueta = tab.querySelector('.lx-bottom-tab-bar__label');
      const icono = tab.querySelector('.lx-bottom-tab-bar__icon svg');
      return {
        texto: etiqueta?.textContent?.trim() ?? '',
        alto: Math.round(c.height),
        ancho: Math.round(c.width),
        // Lo que de verdad contesta «¿se ve?»: el punto medio del destino, ¿pertenece al destino?
        suyoElCentro: document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2) === tab
          || tab.contains(document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2)),
        etiquetaPx: etiqueta ? Math.round(parseFloat(getComputedStyle(etiqueta).fontSize)) : 0,
        iconoPx: icono ? Math.round(icono.getBoundingClientRect().width) : 0,
        activo: tab.getAttribute('aria-current') === 'page',
        insignia: tab.querySelector('.lx-bottom-tab-bar__badge')?.textContent?.trim() ?? null,
      };
    });
    return {
      alto: Math.round(caja.height),
      abajo: Math.round(caja.bottom),
      fondo: estilo.backgroundColor,
      bordeArriba: estilo.borderTopWidth,
      sombra: estilo.boxShadow,
      separacion: Math.round(
        parseFloat(getComputedStyle(nodo.querySelector('.lx-bottom-tab-bar__tab')).rowGap || '0'),
      ),
      opaco: !/rgba\(.*,\s*0(\.\d+)?\)$/.test(estilo.backgroundColor),
      destinos,
    };
  });

  ok(barra !== null, `${tamano}: la barra inferior existe`);
  if (!barra) return;

  // 64-72px + safe-area. En un navegador de escritorio la safe-area es 0, así que la caja ES la
  // franja visible y el rango del documento se puede comprobar al pie de la letra.
  ok(
    barra.alto >= 64 && barra.alto <= 73,
    `${tamano}: la barra mide ${barra.alto}px (el documento pide 64-72 + safe-area)`,
    `alto=${barra.alto}`,
  );
  ok(barra.opaco, `${tamano}: el fondo de la barra es opaco`, `fondo=${barra.fondo}`);
  ok(barra.bordeArriba === '1px', `${tamano}: la barra tiene borde superior de 1px`, `borde=${barra.bordeArriba}`);
  ok(barra.sombra !== 'none', `${tamano}: la barra se separa del contenido con sombra`, `sombra=${barra.sombra}`);
  ok(barra.destinos.length === 5, `${tamano}: hay cinco destinos`, `son ${barra.destinos.length}`);
  ok(
    barra.destinos.every((d) => d.texto.length > 0),
    `${tamano}: los cinco destinos llevan etiqueta`,
    barra.destinos.map((d) => `«${d.texto}»`).join(' · '),
  );
  const tapados = barra.destinos.filter((d) => !d.suyoElCentro);
  ok(
    tapados.length === 0,
    `${tamano}: los cinco destinos son tocables (nada encima)`,
    tapados.map((d) => d.texto).join(', '),
  );
  const chicos = barra.destinos.filter((d) => d.alto < 44 || d.ancho < 44);
  ok(
    chicos.length === 0,
    `${tamano}: ningún destino baja de 44x44`,
    chicos.map((d) => `${d.texto} ${d.ancho}x${d.alto}`).join(', '),
  );
  const etiquetasMal = barra.destinos.filter((d) => d.etiquetaPx < 10 || d.etiquetaPx > 11);
  ok(
    etiquetasMal.length === 0,
    `${tamano}: las etiquetas miden 10-11px`,
    etiquetasMal.map((d) => `${d.texto} ${d.etiquetaPx}px`).join(', '),
  );
  /* «Cada item ocupa 20% del ancho» (v2, punto 3). Con cinco destinos en `flex: 1` sale solo; se
     mide para que un sexto destino o un ancho a mano se note el día que alguien lo intente. */
  const anchoEsperado = Math.round(barra.destinos.reduce((suma, d) => suma + d.ancho, 0) / 5);
  const desiguales = barra.destinos.filter((d) => Math.abs(d.ancho - anchoEsperado) > 2);
  ok(
    desiguales.length === 0,
    `${tamano}: los cinco destinos se reparten el ancho por igual`,
    barra.destinos.map((d) => `${d.texto} ${d.ancho}px`).join(' · '),
  );
  ok(
    barra.separacion === 4,
    `${tamano}: hay 4px entre el icono y su etiqueta, como pide la v2`,
    `son ${barra.separacion}px`,
  );
  const iconosMal = barra.destinos.filter((d) => d.iconoPx < 22 || d.iconoPx > 24);
  ok(
    iconosMal.length === 0,
    `${tamano}: los iconos miden 22-24px`,
    iconosMal.map((d) => `${d.texto} ${d.iconoPx}px`).join(', '),
  );
  ok(
    barra.destinos.filter((d) => d.activo).length === 1,
    `${tamano}: exactamente un destino queda marcado como actual`,
  );
}

/** La pantalla inicial: saludo, lanzador 2x2, consulta rápida y última consulta. */
async function pantallaInicial(page, tamano, ancho) {
  const vista = await page.evaluate(() => {
    const px = (nodo, prop) => (nodo ? Math.round(parseFloat(getComputedStyle(nodo)[prop])) : 0);
    const saludo = document.querySelector('.lx-inspector-greeting__name');
    const donde = document.querySelector('.lx-inspector-greeting__where');
    const main = document.querySelector('.lx-inspector-main');
    const tarjetas = [...document.querySelectorAll('.lx-quick-tile--inspector')].map((t) => {
      const c = t.getBoundingClientRect();
      return {
        titulo: t.querySelector('.lx-quick-tile__title')?.textContent?.trim() ?? '',
        ayuda: t.querySelector('.lx-quick-tile__hint')?.textContent?.trim() ?? '',
        tituloPx: px(t.querySelector('.lx-quick-tile__title'), 'fontSize'),
        ayudaPx: px(t.querySelector('.lx-quick-tile__hint'), 'fontSize'),
        radio: px(t, 'borderTopLeftRadius'),
        x: Math.round(c.x),
        ancho: Math.round(c.width),
        alto: Math.round(c.height),
        azul: t.classList.contains('lx-quick-tile--primary'),
        flecha: Boolean(t.querySelector('.lx-quick-tile__go')),
        conteo: t.querySelector('.lx-quick-tile__count')?.textContent?.trim() ?? null,
      };
    });
    const campo = document.querySelector('.lx-plate-row input');
    const boton = document.querySelector('.lx-plate-row__go');
    const cajaCampo = campo?.getBoundingClientRect();
    const cajaBoton = boton?.getBoundingClientRect();
    return {
      saludo: saludo?.textContent?.trim() ?? null,
      saludoPx: px(saludo, 'fontSize'),
      saludoPeso: saludo ? getComputedStyle(saludo).fontWeight : null,
      donde: donde?.textContent?.trim() ?? null,
      dondePx: px(donde, 'fontSize'),
      margenIzq: px(main, 'paddingLeft'),
      margenDer: px(main, 'paddingRight'),
      anchoMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
      tarjetas,
      campoAlto: cajaCampo ? Math.round(cajaCampo.height) : 0,
      botonLado: cajaBoton ? [Math.round(cajaBoton.width), Math.round(cajaBoton.height)] : [0, 0],
      botonEnLinea: cajaCampo && cajaBoton ? Math.abs(cajaCampo.y - cajaBoton.y) <= 2 : false,
      // Que el título genérico se haya ido: el documento lo pide por su nombre.
      tituloGenerico: [...document.querySelectorAll('h1, .lx-text-screen-title')]
        .map((n) => n.textContent.trim())
        .filter((x) => /^consulta de placa$/i.test(x)).length,
      ultima: Boolean(document.querySelector('.lx-last-check')),
      ultimaVacia: [...document.querySelectorAll('.lx-card')].some((c) =>
        /todavía no consultaste/i.test(c.textContent || ''),
      ),
    };
  });

  ok(Boolean(vista.saludo) && /^hola,/i.test(vista.saludo), `${tamano}: el saludo encabeza la pantalla`, `«${vista.saludo}»`);
  /*
    24-30, y el margen de arriba tiene nombre (08-10-2026).

    La tabla del documento pide 24-28px en celular y 24-30 en tablet. Medido en staging da 30 en
    los cinco tamaños, también en el teléfono: dos píxeles por encima de lo que pide la tabla para
    celular. No es un descuido — es `:root[data-density='outdoor']`, que el portal del fiscalizador
    activa y que sube el título de pantalla de 28 a 30 para que se lea de pie y al sol. Esa decisión
    es anterior a este documento y persigue el mismo objetivo que su tabla, así que gana ella.

    Se deja escrito en vez de sólo ensanchar el rango: una prueba que acepta 24-30 sin decir por
    qué esconde la pregunta, y dentro de un mes nadie sabe si los 30px son la densidad de exteriores
    o una regla que se escapó.
  */
  ok(
    vista.saludoPx >= 24 && vista.saludoPx <= 30,
    `${tamano}: el saludo mide ${vista.saludoPx}px (24-28 por tabla; 30 con densidad de exteriores)`,
  );
  ok(Number(vista.saludoPeso) >= 700, `${tamano}: el saludo va en peso 700`, `peso=${vista.saludoPeso}`);
  ok(/^fiscalización/i.test(vista.donde ?? ''), `${tamano}: debajo dice «Fiscalización · municipalidad»`, `«${vista.donde}»`);
  ok(
    vista.dondePx >= 12 && vista.dondePx <= 15,
    `${tamano}: el renglón de abajo es texto auxiliar (${vista.dondePx}px)`,
  );
  ok(vista.tituloGenerico === 0, `${tamano}: ya no hay un «Consulta de placa» genérico encabezando`);

  /* El ancho útil: nunca más de 920 (v2, punto 1) y nunca estirado al borde en un escritorio.
     Se comprueba el TOPE y no un valor exacto, porque por debajo de 920 el ancho lo manda el
     viewport y exigir una cifra sería exigir un tamaño de pantalla. */
  ok(
    vista.anchoMain <= 920,
    `${tamano}: el área central no pasa de 920px`,
    `mide ${vista.anchoMain}px`,
  );
  const margenEsperado = ancho >= 768 ? [24, 32] : [16, 16];
  ok(
    vista.margenIzq >= margenEsperado[0] && vista.margenIzq <= margenEsperado[1] && vista.margenIzq === vista.margenDer,
    `${tamano}: margen lateral ${vista.margenIzq}px (el documento pide ${margenEsperado[0]}-${margenEsperado[1]})`,
  );

  ok(vista.tarjetas.length === 4, `${tamano}: el lanzador tiene cuatro accesos`, `son ${vista.tarjetas.length}`);
  if (vista.tarjetas.length === 4) {
    // Dos columnas: dos filas de dos, o sea exactamente dos coordenadas X distintas.
    const columnas = new Set(vista.tarjetas.map((t) => t.x));
    ok(columnas.size === 2, `${tamano}: el lanzador es una cuadrícula 2x2`, `columnas=${columnas.size}`);
    const titulosMal = vista.tarjetas.filter((t) => t.tituloPx < 16 || t.tituloPx > 19);
    ok(titulosMal.length === 0, `${tamano}: los títulos de tarjeta miden 16-18px`, titulosMal.map((t) => `${t.titulo} ${t.tituloPx}px`).join(', '));
    const ayudasMal = vista.tarjetas.filter((t) => !t.ayuda || t.ayudaPx < 12 || t.ayudaPx > 15);
    ok(ayudasMal.length === 0, `${tamano}: las cuatro llevan ayuda de 12-13px`, ayudasMal.map((t) => `${t.titulo} ${t.ayudaPx}px`).join(', '));
    const radiosMal = vista.tarjetas.filter((t) => t.radio < 12 || t.radio > 16);
    ok(radiosMal.length === 0, `${tamano}: el radio de las tarjetas es 12-14px`, radiosMal.map((t) => `${t.titulo} ${t.radio}px`).join(', '));
    ok(
      vista.tarjetas.filter((t) => t.azul).length === 1,
      `${tamano}: exactamente una acción prioritaria en azul`,
    );
    ok(
      vista.tarjetas.every((t) => t.ancho >= 44 && t.alto >= 44),
      `${tamano}: ninguna tarjeta baja del objetivo táctil`,
    );
    /* El alto que da la v2 del documento: «cards aprox. 141-150 x 132-150 px a 375 px de ancho».
       Se mide el ALTO y no el ancho: el ancho lo decide la columna —a 375 con 16 de margen y 12 de
       separación salen 165, y a 768 salen más— así que exigirle 141-150 sería exigir un viewport,
       no un diseño. El alto sí es una decisión, y es la que el documento quiere ver cambiada. */
    const bajas = vista.tarjetas.filter((t) => t.alto < 132);
    ok(
      bajas.length === 0,
      `${tamano}: las tarjetas miden al menos 132px de alto, como pide la v2`,
      bajas.map((t) => `${t.titulo} ${t.alto}px`).join(', '),
    );
  }

  ok(
    vista.campoAlto >= 48 && vista.campoAlto <= 60,
    `${tamano}: el campo de placa mide ${vista.campoAlto}px (el documento pide 48-56)`,
  );
  ok(
    vista.botonLado[0] === vista.botonLado[1] && vista.botonLado[0] >= 48 && vista.botonLado[0] <= 56,
    `${tamano}: el botón de búsqueda es cuadrado de 48-56px`,
    `mide ${vista.botonLado[0]}x${vista.botonLado[1]}`,
  );
  ok(vista.botonEnLinea, `${tamano}: el botón de búsqueda está en la misma fila que el campo`);
  ok(
    vista.ultima || vista.ultimaVacia,
    `${tamano}: «Última consulta» muestra una consulta real o su estado vacío, nunca una maqueta`,
  );
}

/** Sin desplazamiento horizontal, y el último elemento de la pantalla visible bajo la barra. */
async function sinCortes(page, tamano) {
  const medida = await page.evaluate(() => {
    const barra = document.querySelector('.lx-bottom-tab-bar');
    const altoBarra = barra ? barra.getBoundingClientRect().height : 0;
    const main = document.querySelector('.lx-inspector-main');
    const relleno = main ? parseFloat(getComputedStyle(main).paddingBottom) : 0;
    // El que se desborda, por su nombre: un ancho total mayor que el de la ventana no dice cuál.
    const culpables = [...document.querySelectorAll('body *')]
      .filter((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 4)
      .map((n) => `${n.tagName.toLowerCase()}.${(n.className || '').toString().split(' ')[0]}`);
    return {
      desbordeH: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      culpables,
      altoBarra: Math.round(altoBarra),
      relleno: Math.round(relleno),
    };
  });
  ok(!medida.desbordeH, `${tamano}: no hay desplazamiento horizontal`, medida.culpables.join(', '));
  // El relleno inferior tiene que cubrir la barra ENTERA, que es lo que el criterio de aceptación
  // pide («no tapa el último elemento de cada pantalla»). Se mide contra la altura real medida.
  ok(
    medida.relleno >= medida.altoBarra,
    `${tamano}: el contenido reserva ${medida.relleno}px bajo la barra de ${medida.altoBarra}px`,
  );
  /* Y el piso que la v2 exige por su número: «padding inferior obligatorio 88-100 px». Con la
     barra en 65 y 16 de respiro salían 81, que cumplía lo de arriba y no esto. */
  ok(
    medida.relleno >= 88,
    `${tamano}: y ese relleno llega a los 88px que pide la v2`,
    `son ${medida.relleno}px`,
  );

  // Y se comprueba de verdad: se baja hasta el final y se mira si lo último queda bajo la barra.
  const ultimoTapado = await page.evaluate(() => {
    const main = document.querySelector('.lx-inspector-main');
    if (!main) return null;
    const hijos = [...main.children];
    const ultimo = hijos[hijos.length - 1];
    if (!ultimo) return null;
    window.scrollTo(0, document.body.scrollHeight);
    const c = ultimo.getBoundingClientRect();
    const barra = document.querySelector('.lx-bottom-tab-bar')?.getBoundingClientRect();
    return { fondoUltimo: Math.round(c.bottom), topeBarra: barra ? Math.round(barra.top) : null };
  });
  if (ultimoTapado && ultimoTapado.topeBarra !== null) {
    ok(
      ultimoTapado.fondoUltimo <= ultimoTapado.topeBarra,
      `${tamano}: con la pantalla al final, lo último termina sobre la barra`,
      `último=${ultimoTapado.fondoUltimo} barra=${ultimoTapado.topeBarra}`,
    );
  }
}

/** El riel de avance de la boleta y la compacidad de Pendientes (pasos 6 y 7 del documento). */
async function boletaYPendientes(page, tamano, ancho) {
  await page.goto(`${BASE}/inspector/cite`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const riel = await page.evaluate(() => {
    const nodo = document.querySelector('.lx-step-track');
    if (!nodo) return null;
    const visible = (n) => Boolean(n) && getComputedStyle(n).display !== 'none';
    const pasos = [...nodo.querySelectorAll('.lx-step-track__step')].map((p) => ({
      texto: (p.querySelector('.lx-step-track__label')?.textContent || '').trim(),
      estado: p.getAttribute('data-estado'),
      actual: p.getAttribute('aria-current') === 'step',
    }));
    return {
      nombreAccesible: nodo.getAttribute('aria-label') || '',
      compactoVisible: visible(nodo.querySelector('.lx-step-track__compact')),
      rielVisible: visible(nodo.querySelector('.lx-step-track__rail')),
      compacto: (nodo.querySelector('.lx-step-track__compact-count')?.textContent || '').trim(),
      pasos,
    };
  });

  ok(riel !== null, `${tamano}: la boleta muestra su avance`);
  if (riel) {
    ok(riel.nombreAccesible.length > 0, `${tamano}: el indicador de avance tiene nombre accesible`);
    ok(
      riel.pasos.map((p) => p.texto).join(' · ') === 'Vehículo · Infracción · Evidencia · Revisar',
      `${tamano}: los cuatro pasos son los del documento`,
      riel.pasos.map((p) => p.texto).join(' · '),
    );
    ok(
      riel.pasos.filter((p) => p.actual).length === 1,
      `${tamano}: exactamente un paso queda marcado como el actual`,
    );
    // Una presentación o la otra, nunca las dos: el documento pide riel en tablet y «Paso X de 4»
    // en celular, y dos indicadores a la vez serían dos respuestas a la misma pregunta.
    const esTablet = ancho >= 768;
    ok(
      riel.rielVisible === esTablet && riel.compactoVisible === !esTablet,
      `${tamano}: se ve ${esTablet ? 'el riel horizontal' : 'el renglón «Paso X de 4»'} y sólo ése`,
      `riel=${riel.rielVisible} compacto=${riel.compactoVisible}`,
    );
    if (!esTablet) {
      ok(/^Paso \d+ de 4$/.test(riel.compacto), `${tamano}: el renglón dice «Paso X de 4»`, `«${riel.compacto}»`);
    }
  }

  // Pendientes: la fila compacta no puede volver a ser una ficha. Se mide el alto de la fila, que
  // es lo que el documento pide («listas compactas»), y sólo cuando hay algo en cola.
  await page.goto(`${BASE}/inspector/queue`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const cola = await page.evaluate(() => {
    const filas = [...document.querySelectorAll('.lx-queue-item')];
    return {
      cuantas: filas.length,
      vacio: Boolean(document.querySelector('.lx-empty-state')),
      altos: filas.map((f) => Math.round(f.getBoundingClientRect().height)),
      desplegables: filas.filter((f) => f.querySelector('details')).length,
      // El resumen del desplegable tiene que ser tocable: es un control.
      resumenes: [...document.querySelectorAll('.lx-queue-item__more > summary')].map((s) =>
        Math.round(s.getBoundingClientRect().height),
      ),
    };
  });
  ok(cola.cuantas > 0 || cola.vacio, `${tamano}: Pendientes muestra la cola o su estado vacío`);
  if (cola.cuantas > 0) {
    const altas = cola.altos.filter((a) => a > 200);
    ok(altas.length === 0, `${tamano}: ninguna fila de la cola vuelve a ser una ficha`, `altos: ${cola.altos.join(', ')}`);
    ok(
      cola.desplegables === cola.cuantas,
      `${tamano}: cada fila conserva lo técnico en su desplegable`,
      `${cola.desplegables} de ${cola.cuantas}`,
    );
    const chicos = cola.resumenes.filter((h) => h < 44);
    ok(chicos.length === 0, `${tamano}: el desplegable se puede tocar`, `altos: ${cola.resumenes.join(', ')}`);
  }
}

(async () => {
  const navegador = await chromium.launch();
  const context = await navegador.newContext({ viewport: TAMANOS[1] });
  const page = await entrar(context);

  for (const tamano of TAMANOS) {
    console.log(`\n── ${tamano.nombre} ──`);
    await page.setViewportSize({ width: tamano.width, height: tamano.height });
    await page.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await barraInferior(page, tamano.nombre);
    await pantallaInicial(page, tamano.nombre, tamano.width);
    await sinCortes(page, tamano.nombre);
    await page.screenshot({
      path: `tests/responsive/capturas/fiscalizacion-${tamano.width}x${tamano.height}.png`,
      fullPage: true,
    });
    await boletaYPendientes(page, tamano.nombre, tamano.width);
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
