/**
 * Fiscalización · especificación visual responsive — los criterios medibles.
 *
 * <p>Mide la pantalla inicial de /inspector contra la tabla de medidas del «Orden visual de
 * implementación v2 · iPad» (12-10-2026) y contra sus criterios de aceptación, en los cinco
 * tamaños de siempre: 360x800, 375x812, 390x844, 768x1024 y 1024x768.</p>
 *
 * <p>La parte del Inicio se reescribió con la v2. La anterior medía el saludo, el lanzador de
 * cuatro baldosas y el botón cuadrado —que era lo correcto hasta el 11 de octubre— y con la
 * pantalla nueva habría reportado en rojo justamente lo que el encargo pedía corregir.</p>
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
        /* La FORMA del icono, no sólo su tamaño. Sirve para dos cosas: comprobar que «Más» dejó
           de llevar el dibujo de «sin conexión» —una señal tachada, que es lo que tenía por
           equivocación— y poder decir cuándo dos destinos comparten dibujo. */
        formaIcono: icono ? icono.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 220) : '',
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
  /* El icono de «Más», que el encargo del 09-10 vino a corregir. La referencia pide la lista con
     viñetas; lo que había era la señal tachada de «sin conexión», reconocible porque su primer
     trazo es la diagonal `M3 3l18 18`. */
  const mas = barra.destinos.find((d) => /^m[áa]s$/i.test(d.texto));
  if (mas) {
    ok(
      !/M3 3l18 18/.test(mas.formaIcono),
      `${tamano}: «Más» ya no lleva el icono de «sin conexión»`,
      mas.formaIcono.slice(0, 80),
    );
    ok(
      /circle/.test(mas.formaIcono) && /M8 6h13/.test(mas.formaIcono),
      `${tamano}: y lleva la lista con viñetas de la referencia`,
      mas.formaIcono.slice(0, 80),
    );
  }
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

/**
 * El Inicio, con la jerarquía de la v2: encabezado compacto, título, formulario, tres accesos,
 * última consulta.
 *
 * <p>Esta función se reescribió entera el 12-10-2026 y conviene decirlo, porque lo que medía antes
 * no estaba mal: medía el saludo, el lanzador de cuatro baldosas y el botón cuadrado, que es lo que
 * el encargo del 07-10 pedía y lo que había. La v2 cambia la pantalla, así que una prueba que
 * siguiera exigiendo aquello habría reportado en rojo justamente la corrección pedida.</p>
 */
async function pantallaInicial(page, tamano, ancho) {
  const vista = await page.evaluate(() => {
    const px = (nodo, prop) => (nodo ? Math.round(parseFloat(getComputedStyle(nodo)[prop])) : 0);
    const caja = (nodo) => {
      if (!nodo) return null;
      const c = nodo.getBoundingClientRect();
      return { x: Math.round(c.x), y: Math.round(c.y), ancho: Math.round(c.width), alto: Math.round(c.height) };
    };
    const main = document.querySelector('.lx-inspector-main');
    const titulo = document.querySelector('.lx-fiscal-title__h');
    const sub = document.querySelector('.lx-fiscal-title__sub');
    const tarjetaConsulta = document.querySelector('.lx-fiscal-consulta .lx-card');
    const nav = document.querySelector('.lx-quick-grid--touch');
    const campo = document.querySelector('.lx-plate-row input');
    const boton = document.querySelector('.lx-plate-row__go');
    const barra = document.querySelector('.lx-app-bar--inspector');

    const accesos = [...document.querySelectorAll('.lx-quick-tile--inspector')].map((t) => {
      const c = t.getBoundingClientRect();
      const tit = t.querySelector('.lx-quick-tile__title');
      const ayu = t.querySelector('.lx-quick-tile__hint');
      return {
        titulo: tit?.textContent?.trim() ?? '',
        ayuda: ayu?.textContent?.trim() ?? '',
        tituloPx: px(tit, 'fontSize'),
        ayudaPx: px(ayu, 'fontSize'),
        x: Math.round(c.x),
        ancho: Math.round(c.width),
        alto: Math.round(c.height),
        azul: t.classList.contains('lx-quick-tile--primary'),
        // Truncado DE VERDAD: el texto que no entra en su caja, no una regla de CSS que lo permita.
        cortado:
          (tit && tit.scrollWidth > tit.clientWidth + 1) || (ayu && ayu.scrollWidth > ayu.clientWidth + 1),
        conteo: t.querySelector('.lx-quick-tile__count')?.textContent?.trim() ?? null,
      };
    });

    // Los rótulos de los tres campos, y que de verdad estén asociados al control.
    const rotulos = [...document.querySelectorAll('.lx-fiscal-consulta label.lx-field__label')].map((l) => ({
      texto: l.textContent.trim(),
      para: l.getAttribute('for'),
      apunta: Boolean(l.getAttribute('for') && document.getElementById(l.getAttribute('for'))),
      visible: getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().height > 0,
    }));

    const ultima = document.querySelector('.lx-last-card');

    return {
      // --- encabezado compacto ---
      barra: caja(barra),
      marca: (document.querySelector('.lx-app-bar .lx-brand__wordmark')?.textContent || '').trim(),
      municipio: (document.querySelector('.lx-app-bar .lx-tenant-badge')?.textContent || '').trim(),
      conexion: (document.querySelector('.lx-app-bar .lx-connection-badge')?.textContent || '').trim(),
      fiscalizador: (document.querySelector('.lx-app-bar .lx-fiscal-who')?.textContent || '').trim(),
      // --- título ---
      titulo: titulo?.textContent?.trim() ?? null,
      tituloPx: px(titulo, 'fontSize'),
      tituloPeso: titulo ? getComputedStyle(titulo).fontWeight : null,
      sub: sub?.textContent?.trim() ?? null,
      subPx: px(sub, 'fontSize'),
      cajaTitulo: caja(document.querySelector('.lx-fiscal-title')),
      // Lo que la v2 quita, por su nombre.
      saludos: [...document.querySelectorAll('.lx-inspector-main *')].filter((n) =>
        /^hola,/i.test((n.textContent || '').trim()),
      ).length,
      tituloGenerico: [...document.querySelectorAll('h1, h2, .lx-section-header__title')]
        .map((n) => n.textContent.trim())
        .filter((x) => /^consulta(r)? de placa$/i.test(x)).length,
      // Ninguna fotografía ni logotipo gigante dentro del contenido.
      imagenes: [...document.querySelectorAll('.lx-inspector-main img')].map((n) =>
        Math.round(n.getBoundingClientRect().height),
      ),
      // --- el bloque principal ---
      cajaConsulta: caja(tarjetaConsulta),
      padConsulta: px(tarjetaConsulta, 'paddingTop'),
      campo: caja(campo),
      boton: caja(boton),
      botonTexto: (boton?.textContent || '').trim(),
      enLinea: campo && boton ? Math.abs(campo.getBoundingClientRect().y - boton.getBoundingClientRect().y) <= 2 : false,
      rotulos,
      zona: caja(document.querySelector('.lx-fiscal-consulta .lx-select')),
      bahia: caja(document.querySelector('.lx-fiscal-consulta input[name="spaceCode"]')),
      // --- accesos ---
      cajaNav: caja(nav),
      rotuloAcciones: (document.querySelector('.lx-fiscal-subhead')?.textContent || '').trim(),
      accesos,
      // El orden del DOM, que es el que lee un lector de pantalla y el que manda cuando la
      // maquetación cambia de columnas: la consulta ANTES que los accesos.
      consultaAntes:
        tarjetaConsulta && nav
          ? Boolean(tarjetaConsulta.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING)
          : false,
      // --- última consulta ---
      cajaUltima: caja(ultima),
      ultimaVacia: Boolean(document.querySelector('.lx-last-card__empty')),
      ultimaReal: Boolean(document.querySelector('.lx-last-check')),
      // --- medidas del contenedor y color ---
      margenIzq: px(main, 'paddingLeft'),
      margenDer: px(main, 'paddingRight'),
      anchoMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
      hueco: px(main, 'rowGap'),
      colores: {
        fondo: getComputedStyle(document.body).backgroundColor,
        tarjeta: tarjetaConsulta ? getComputedStyle(tarjetaConsulta).backgroundColor : null,
        borde: tarjetaConsulta ? getComputedStyle(tarjetaConsulta).borderTopColor : null,
        buscar: boton ? getComputedStyle(boton).backgroundColor : null,
      },
    };
  });

  // ── el encabezado compacto: marca, municipio, inspector y estado ─────────────────────────────
  ok(
    vista.barra !== null && vista.barra.alto >= 56 && vista.barra.alto <= 64,
    `${tamano}: el encabezado mide ${vista.barra?.alto}px (la v2 pide 56-64)`,
  );
  ok(/lupa\s*rx/i.test(vista.marca), `${tamano}: el encabezado lleva la marca`, `«${vista.marca}»`);
  ok(vista.municipio.length > 0, `${tamano}: y el municipio`, `«${vista.municipio}»`);
  ok(/en línea|sin conexión/i.test(vista.conexion), `${tamano}: y el estado de conexión`, `«${vista.conexion}»`);
  /* El nombre del fiscalizador se esconde por debajo de 480px a propósito (ver `.lx-fiscal-who`):
     ahí la fila ya lleva logo, municipalidad, estado y campana. */
  if (ancho >= 480) {
    ok(vista.fiscalizador.length > 0, `${tamano}: y el nombre del fiscalizador`, `«${vista.fiscalizador}»`);
  }

  // ── el título de la pantalla ─────────────────────────────────────────────────────────────────
  ok(/^consultar veh/i.test(vista.titulo ?? ''), `${tamano}: la pantalla se titula «Consultar vehículo»`, `«${vista.titulo}»`);
  ok(
    vista.tituloPx >= 22 && vista.tituloPx <= 26,
    `${tamano}: el título mide ${vista.tituloPx}px (la v2 pide 22-26)`,
  );
  ok(Number(vista.tituloPeso) >= 700, `${tamano}: el título va en peso 700`, `peso=${vista.tituloPeso}`);
  ok(Boolean(vista.sub) && vista.subPx >= 13 && vista.subPx <= 15, `${tamano}: lleva subtítulo breve de 13-15px`, `«${vista.sub}» ${vista.subPx}px`);
  ok(
    vista.cajaTitulo !== null && vista.cajaTitulo.alto >= 58 && vista.cajaTitulo.alto <= 76,
    `${tamano}: el bloque de título mide ${vista.cajaTitulo?.alto}px (58-76)`,
  );
  ok(vista.saludos === 0, `${tamano}: el saludo «Hola, …» ya no encabeza la pantalla`, `quedan ${vista.saludos}`);
  ok(vista.tituloGenerico === 0, `${tamano}: no hay un «Consultar placa» genérico repetido`);
  ok(vista.imagenes.length === 0, `${tamano}: no hay fotografía ni logotipo dentro del contenido`, `alturas: ${vista.imagenes.join(', ')}`);

  // ── la consulta es el bloque principal, y va PRIMERO ─────────────────────────────────────────
  ok(vista.consultaAntes, `${tamano}: la consulta aparece antes que los accesos secundarios`);
  ok(
    vista.cajaConsulta !== null && vista.cajaTitulo !== null && vista.cajaConsulta.y >= vista.cajaTitulo.y,
    `${tamano}: y debajo del título`,
  );
  ok(
    vista.cajaNav !== null && vista.cajaConsulta !== null
      && (vista.cajaNav.y >= vista.cajaConsulta.y + vista.cajaConsulta.alto - 1
        || vista.cajaNav.x >= vista.cajaConsulta.x + vista.cajaConsulta.ancho - 1),
    `${tamano}: los accesos quedan después de la consulta, debajo o a su derecha`,
    `consulta=${JSON.stringify(vista.cajaConsulta)} accesos=${JSON.stringify(vista.cajaNav)}`,
  );
  /* 220-270 de la tabla. Por debajo de 390px la zona y la bahía se apilan —si no, «Seleccionar
     zona» se recorta— y la tarjeta crece: ahí se comprueba que siga siendo UNA tarjeta y no que
     mida lo que mide en un iPad. */
  if (ancho >= 390) {
    ok(
      vista.cajaConsulta.alto >= 220 && vista.cajaConsulta.alto <= 270,
      `${tamano}: la tarjeta de consulta mide ${vista.cajaConsulta.alto}px (la v2 pide 220-270)`,
    );
  }
  ok(
    vista.padConsulta >= 16 && vista.padConsulta <= 20,
    `${tamano}: su relleno es de ${vista.padConsulta}px (16-20)`,
  );
  ok(vista.campo !== null && vista.campo.alto >= 48, `${tamano}: el campo de placa mide ${vista.campo?.alto}px (≥48)`);
  ok(
    vista.boton !== null && vista.boton.alto >= 48 && vista.boton.ancho >= 90,
    `${tamano}: Buscar mide ${vista.boton?.ancho}x${vista.boton?.alto} (la v2 pide ≥90x48)`,
  );
  ok(vista.botonTexto.length > 0, `${tamano}: y dice su nombre, no sólo un icono`, `«${vista.botonTexto}»`);
  ok(vista.enLinea, `${tamano}: la placa y Buscar van en la misma fila`);
  // Las etiquetas SIEMPRE visibles, que es lo que la v2 pide para los tres campos.
  ok(vista.rotulos.length >= 3, `${tamano}: los tres campos llevan rótulo`, `son ${vista.rotulos.length}`);
  ok(
    vista.rotulos.every((r) => r.visible && r.apunta),
    `${tamano}: los rótulos se ven y apuntan a su control`,
    vista.rotulos.map((r) => `«${r.texto}»→${r.para}`).join(' · '),
  );
  ok(
    vista.zona !== null && vista.bahia !== null && vista.zona.alto >= 44 && vista.bahia.alto >= 44,
    `${tamano}: zona y bahía conservan el objetivo táctil`,
    `zona=${vista.zona?.alto} bahía=${vista.bahia?.alto}`,
  );
  /* Dos columnas desde 390. Es la composición de la referencia; por debajo se apilan, que es lo
     que la v2 permite en teléfono y lo único que evita recortar el texto del selector. */
  if (ancho >= 390) {
    ok(
      Math.abs(vista.zona.y - vista.bahia.y) <= 2,
      `${tamano}: zona y bahía van en dos columnas`,
      `zona.y=${vista.zona.y} bahía.y=${vista.bahia.y}`,
    );
  }

  // ── los tres accesos secundarios ─────────────────────────────────────────────────────────────
  ok(vista.accesos.length === 3, `${tamano}: hay TRES accesos secundarios, no cuatro tarjetas`, `son ${vista.accesos.length}`);
  ok(/acciones r[áa]pidas/i.test(vista.rotuloAcciones), `${tamano}: con su rótulo «Acciones rápidas»`, `«${vista.rotuloAcciones}»`);
  if (vista.accesos.length === 3) {
    const nombres = vista.accesos.map((a) => a.titulo);
    ok(
      /levantar/i.test(nombres[0]) && /pendientes/i.test(nombres[1]) && /evidencia/i.test(nombres[2]),
      `${tamano}: son Levantar boleta, Pendientes y Evidencia, en ese orden`,
      nombres.join(' · '),
    );
    ok(
      vista.accesos.every((a) => !/consultar placa/i.test(a.titulo)),
      `${tamano}: «Consultar placa» ya no se repite como tarjeta`,
    );
    const fuera = vista.accesos.filter((a) => a.alto < 84 || a.alto > 110);
    ok(fuera.length === 0, `${tamano}: los tres miden 84-110px de alto`, vista.accesos.map((a) => `${a.titulo} ${a.alto}px`).join(', '));
    const cortados = vista.accesos.filter((a) => a.cortado);
    ok(cortados.length === 0, `${tamano}: ningún texto se recorta`, cortados.map((a) => a.titulo).join(', '));
    ok(
      vista.accesos.every((a) => a.ayuda.length > 0),
      `${tamano}: los tres llevan su línea de ayuda`,
      vista.accesos.map((a) => `${a.titulo}: «${a.ayuda}»`).join(' · '),
    );
    ok(
      vista.accesos.filter((a) => a.azul).length === 0,
      `${tamano}: ninguno lleva relleno azul (el azul queda para Buscar)`,
    );
    const columnas = new Set(vista.accesos.map((a) => a.x)).size;
    const esperadas = ancho >= 768 ? 3 : 2;
    ok(columnas === esperadas, `${tamano}: van en ${esperadas} columnas`, `son ${columnas}`);
  }

  // ── última consulta ──────────────────────────────────────────────────────────────────────────
  ok(
    vista.ultimaVacia || vista.ultimaReal,
    `${tamano}: «Última consulta» muestra una consulta real o su estado vacío, nunca una maqueta`,
  );
  if (vista.ultimaVacia && vista.cajaUltima) {
    ok(
      vista.cajaUltima.alto >= 64 && vista.cajaUltima.alto <= 88,
      `${tamano}: su estado vacío mide ${vista.cajaUltima.alto}px (la v2 pide 64-88)`,
    );
  }

  // ── el contenedor y la paleta ────────────────────────────────────────────────────────────────
  ok(vista.anchoMain <= 960, `${tamano}: el área central no pasa de 960px`, `mide ${vista.anchoMain}px`);
  const margen = ancho >= 768 ? [20, 28] : [16, 16];
  ok(
    vista.margenIzq >= margen[0] && vista.margenIzq <= margen[1] && vista.margenIzq === vista.margenDer,
    `${tamano}: margen lateral ${vista.margenIzq}px (la v2 pide ${margen[0]}-${margen[1]})`,
  );
  ok(vista.hueco >= 12 && vista.hueco <= 16, `${tamano}: separación vertical de ${vista.hueco}px (12-16)`);
  /* Los colores de la v2, por su valor. Se miden los computados y no los tokens: un token correcto
     que nadie aplica no pinta nada. */
  ok(vista.colores.fondo === 'rgb(6, 26, 43)', `${tamano}: el fondo es #061A2B`, vista.colores.fondo);
  ok(vista.colores.tarjeta === 'rgb(16, 45, 67)', `${tamano}: la tarjeta es #102D43`, vista.colores.tarjeta);
  ok(vista.colores.borde === 'rgb(49, 83, 106)', `${tamano}: el borde es #31536A`, vista.colores.borde);
  /*
    El relleno de Buscar es #0670D6 y no el #0788FF del documento, y es deliberado: con texto
    blanco encima, #0788FF da 3.51 y hace falta 4.5. Es el mismo caso que el Ciudadano resolvió en
    septiembre con este mismo valor. El #31B4FF de la v2 sí se usa, como TINTA: enlaces, iconos,
    foco y la pestaña activa. La medición está escrita en tokens.css y la verifica paleta.check.mjs.
  */
  ok(vista.colores.buscar === 'rgb(6, 112, 214)', `${tamano}: Buscar lleva el azul de relleno medido`, vista.colores.buscar);
}

/**
 * La consulta sigue funcionando, con sus validaciones y sus estados. Sólo lectura: una consulta de
 * placa no modifica nada en el servidor.
 */
async function consultaFunciona(page, tamano) {
  const escribir = async (placa, bahia) => {
    await page.fill('.lx-plate-row input', '');
    await page.fill('.lx-plate-row input', placa);
    const campoBahia = page.locator('.lx-fiscal-consulta input[name="spaceCode"]');
    await campoBahia.fill(bahia ?? '');
  };

  // 1. Zona sin bahía / bahía sin zona: la pareja se valida ANTES de salir a la red.
  await escribir('SJP123', '0042');
  await page.click('.lx-plate-row__go');
  await page.waitForTimeout(900);
  const incompleta = await page.locator('.lx-alert').filter({ hasText: /zona y la bah/i }).count();
  ok(incompleta === 1, `${tamano}: con bahía y sin zona, avisa antes de consultar`, `avisos=${incompleta}`);

  // 2. Una placa sin la pareja: el servidor contesta y la pantalla dice algo.
  await escribir('SJP123', '');
  await Promise.all([
    page.waitForResponse((r) => /\/inspector\/plate-checks|\/plate/.test(r.url()), { timeout: 20000 }).catch(() => null),
    page.click('.lx-plate-row__go'),
  ]);
  await page.waitForTimeout(1200);
  const respondio = await page.evaluate(() => ({
    veredicto: Boolean(document.querySelector('.lx-verdict__plate')),
    error: Boolean(document.querySelector('.lx-alert')),
  }));
  ok(
    respondio.veredicto || respondio.error,
    `${tamano}: una consulta real termina en veredicto o en un error dicho, nunca en una pantalla muda`,
  );

  // 3. El veredicto queda debajo del formulario y dentro del primer pantallazo.
  if (respondio.veredicto) {
    const sitio = await page.evaluate(() => {
      const v = document.querySelector('.lx-verdict__plate').closest('.lx-card');
      const f = document.querySelector('.lx-fiscal-consulta .lx-card');
      return { veredicto: Math.round(v.getBoundingClientRect().y), formulario: Math.round(f.getBoundingClientRect().y) };
    });
    ok(sitio.veredicto > sitio.formulario, `${tamano}: la respuesta aparece bajo el formulario`, JSON.stringify(sitio));
  }

  // 4. Error de red: se corta la consulta y la pantalla tiene que decirlo.
  await page.route('**/plate**', (ruta) => ruta.abort());
  await escribir('ABC123', '');
  await page.click('.lx-plate-row__go');
  await page.waitForTimeout(1500);
  const conError = await page.locator('.lx-alert').count();
  ok(conError > 0, `${tamano}: con la red caída, la consulta lo dice`, `avisos=${conError}`);
  await page.unroute('**/plate**');
}

/** Los tres accesos llevan a donde dicen, y no se creó ninguna ruta nueva. */
async function accesosNavegan(page, tamano) {
  const destinos = [
    { texto: /levantar/i, ruta: '/inspector/cite' },
    { texto: /pendientes/i, ruta: '/inspector/queue' },
    { texto: /evidencia/i, ruta: '/inspector/cite' },
  ];
  for (const destino of destinos) {
    await page.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    await page.locator('.lx-quick-tile--inspector').filter({ hasText: destino.texto }).first().click();
    await page.waitForTimeout(1200);
    const url = new URL(page.url()).pathname.replace(/\/$/, '');
    ok(url === destino.ruta, `${tamano}: el acceso ${destino.texto.source} lleva a ${destino.ruta}`, `quedó en ${url}`);
  }
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
    // Las dos que la v2 pide de cada tamaño: «primer viewport y página completa».
    await page.screenshot({
      path: `tests/responsive/capturas/fiscalizacion-${tamano.width}x${tamano.height}-vista.png`,
    });
    await page.screenshot({
      path: `tests/responsive/capturas/fiscalizacion-${tamano.width}x${tamano.height}-completa.png`,
      fullPage: true,
    });
    await consultaFunciona(page, tamano.nombre);
    await accesosNavegan(page, tamano.nombre);
    await boletaYPendientes(page, tamano.nombre, tamano.width);
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
