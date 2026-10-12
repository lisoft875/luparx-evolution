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
/** Lo que se informa sin aprobar ni reprobar: un estado legítimo que conviene ver en la salida. */
function dato(mensaje) {
  console.log(`  ··  ${mensaje}`);
}
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
 * El Inicio, con la estructura de la «Especificación definitiva del Inicio» (12-10-2026).
 *
 * <p>Tercera reescritura de esta función en seis días, y las tres por el mismo motivo: la pantalla
 * cambió. Medía el saludo y cuatro baldosas (07-10), después el título y tres accesos (11-10) y
 * ahora el saludo, los indicadores del turno y ningún acceso. Una prueba que sobrevive a la
 * especificación que la justificaba reporta en rojo justamente la corrección pedida, y eso ya pasó
 * dos veces en este proyecto.</p>
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
    const saludo = document.querySelector('.lx-fiscal-greet__hi');
    const donde = document.querySelector('.lx-fiscal-greet__where');
    const barra = document.querySelector('.lx-app-bar--inspector');
    const consulta = document.querySelector('.lx-fiscal-ask');
    const placa = document.querySelector('.lx-plate-row input');
    const boton = document.querySelector('.lx-plate-row__go');

    const indicadores = [...document.querySelectorAll('.lx-fiscal-kpis .lx-metric')].map((n) => {
      const c = n.getBoundingClientRect();
      const rot = n.querySelector('.lx-metric__label');
      const val = n.querySelector('.lx-metric__value');
      return {
        rotulo: (rot?.textContent || '').trim(),
        valor: (val?.textContent || '').trim(),
        alto: Math.round(c.height),
        x: Math.round(c.x),
        // Una tarjeta que no se puede tocar: la regla 3 prohíbe repetir en el cuerpo los accesos
        // que ya están en la barra inferior, y una métrica con destino sería eso.
        pulsable: Boolean(n.querySelector('button:not([disabled]), a[href]')),
      };
    });

    // Texto que no cabe en su caja, en cualquier parte del contenido.
    const recortados = [...document.querySelectorAll('.lx-inspector-main *')]
      .filter((n) => n.childElementCount === 0 && (n.textContent || '').trim().length > 0)
      .filter((n) => n.scrollWidth > n.clientWidth + 1)
      .map((n) => (n.textContent || '').trim().slice(0, 28));

    // Solape por intersección de cajas: superponer no desborda, así que ninguna regla de desborde
    // lo detecta. Ya pasó una vez en el portal administrativo.
    const textos = [...document.querySelectorAll('.lx-inspector-main *')].filter(
      (n) => n.childElementCount === 0 && (n.textContent || '').trim().length > 0,
    );
    const solapes = [];
    for (let i = 0; i < textos.length; i += 1) {
      for (let j = i + 1; j < textos.length; j += 1) {
        const a = textos[i].getBoundingClientRect();
        const b = textos[j].getBoundingClientRect();
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
          solapes.push(`«${textos[i].textContent.trim().slice(0, 18)}» x «${textos[j].textContent.trim().slice(0, 18)}»`);
        }
      }
    }

    return {
      // --- encabezado compacto ---
      barra: caja(barra),
      marca: (document.querySelector('.lx-app-bar .lx-brand__wordmark')?.textContent || '').trim(),
      municipio: (document.querySelector('.lx-app-bar .lx-tenant-badge')?.textContent || '').trim(),
      conexion: (document.querySelector('.lx-app-bar .lx-connection-badge')?.textContent || '').trim(),
      fiscalizador: (document.querySelector('.lx-app-bar .lx-fiscal-who')?.textContent || '').trim(),
      campanas: document.querySelectorAll('.lx-app-bar__icon-btn').length,
      // --- saludo ---
      saludo: (saludo?.textContent || '').trim(),
      saludoPx: px(saludo, 'fontSize'),
      saludoEsH1: saludo?.tagName === 'H1',
      donde: (donde?.textContent || '').trim(),
      cajaSaludo: caja(document.querySelector('.lx-fiscal-greet')),
      reloj: (document.querySelector('.lx-fiscal-clock__hour')?.textContent || '').trim(),
      // --- indicadores ---
      indicadores,
      // --- la consulta ---
      cajaConsulta: caja(consulta),
      padConsulta: px(consulta, 'paddingTop'),
      radioConsulta: px(consulta, 'borderTopLeftRadius'),
      tituloConsulta: (document.querySelector('.lx-fiscal-ask__title')?.textContent || '').trim(),
      tituloConsultaPx: px(document.querySelector('.lx-fiscal-ask__title'), 'fontSize'),
      tituloConsultaEsH2: document.querySelector('.lx-fiscal-ask__title')?.tagName === 'H2',
      subConsulta: (document.querySelector('.lx-fiscal-ask__sub')?.textContent || '').trim(),
      aviso: (document.querySelector('.lx-fiscal-ask__note')?.textContent || '').trim(),
      placa: caja(placa),
      boton: caja(boton),
      botonTexto: (boton?.textContent || '').trim(),
      // --- ubicación de la consulta ---
      ubicacion: (document.querySelector('.lx-fiscal-where__title')?.textContent || '').trim(),
      ubicacionVisible: Boolean(
        document.querySelector('.lx-fiscal-where')
          && getComputedStyle(document.querySelector('.lx-fiscal-where')).display !== 'none',
      ),
      zona: caja(document.querySelector('.lx-fiscal-where .lx-select')),
      bahia: caja(document.querySelector('.lx-fiscal-where input[name="spaceCode"]')),
      rotulos: [...document.querySelectorAll('.lx-fiscal-where label.lx-field__label')].map((l) => ({
        texto: l.textContent.trim(),
        apunta: Boolean(l.getAttribute('for') && document.getElementById(l.getAttribute('for'))),
      })),
      // --- lo que NO debe existir ---
      accesosDuplicados: document.querySelectorAll('.lx-quick-grid, .lx-quick-tile').length,
      navegacionesEnCuerpo: document.querySelectorAll('.lx-inspector-main nav').length,
      // --- última consulta ---
      ultima: Boolean(document.querySelector('.lx-last-card')),
      ultimaVacia: Boolean(document.querySelector('.lx-last-card__empty')),
      // --- contenedor ---
      anchoMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
      margenIzq: px(main, 'paddingLeft'),
      margenDer: px(main, 'paddingRight'),
      hueco: px(main, 'rowGap'),
      recortados,
      solapes,
      colores: {
        fondo: getComputedStyle(document.body).backgroundColor,
        cabecera: barra ? getComputedStyle(barra).backgroundColor : null,
        tarjeta: consulta ? getComputedStyle(consulta).backgroundColor : null,
        borde: consulta ? getComputedStyle(consulta).borderTopColor : null,
        campo: placa ? getComputedStyle(placa).backgroundColor : null,
        buscar: boton ? getComputedStyle(boton).backgroundColor : null,
      },
    };
  });

  // ── encabezado compacto ───────────────────────────────────────────────────────────────────────
  ok(
    vista.barra !== null && vista.barra.alto >= 56 && vista.barra.alto <= 64,
    `${tamano}: el encabezado mide ${vista.barra?.alto}px (la tabla pide 56-64)`,
  );
  ok(/lupa\s*rx/i.test(vista.marca), `${tamano}: lleva la marca`, `«${vista.marca}»`);
  ok(vista.municipio.length > 0, `${tamano}: y la municipalidad`, `«${vista.municipio}»`);
  ok(/en línea|sin conexión/i.test(vista.conexion), `${tamano}: y el estado de conexión`, `«${vista.conexion}»`);
  ok(vista.campanas >= 1, `${tamano}: y la campana de avisos`, `hay ${vista.campanas}`);
  if (ancho >= 480) {
    ok(vista.fiscalizador.length > 0, `${tamano}: y el nombre del fiscalizador`, `«${vista.fiscalizador}»`);
  }

  // ── saludo ────────────────────────────────────────────────────────────────────────────────────
  ok(/^hola,/i.test(vista.saludo), `${tamano}: el saludo encabeza la pantalla`, `«${vista.saludo}»`);
  ok(vista.saludoEsH1, `${tamano}: y es el encabezado de nivel 1`);
  const rangoSaludo = ancho >= 768 ? [23, 27] : [21, 24];
  ok(
    vista.saludoPx >= rangoSaludo[0] && vista.saludoPx <= rangoSaludo[1],
    `${tamano}: mide ${vista.saludoPx}px (la tabla pide ${rangoSaludo[0]}-${rangoSaludo[1]})`,
  );
  ok(/^fiscalización/i.test(vista.donde), `${tamano}: debajo dice «Fiscalización · municipalidad»`, `«${vista.donde}»`);

  // ── lo que la regla 3 prohíbe ─────────────────────────────────────────────────────────────────
  ok(
    vista.accesosDuplicados === 0,
    `${tamano}: no hay una segunda fila de accesos en el cuerpo (la barra inferior ya los tiene)`,
    `quedan ${vista.accesosDuplicados}`,
  );
  ok(
    vista.navegacionesEnCuerpo === 0,
    `${tamano}: ni una segunda navegación dentro de la pantalla`,
    `hay ${vista.navegacionesEnCuerpo}`,
  );

  // ── indicadores del turno ─────────────────────────────────────────────────────────────────────
  /*
    No se exige que existan: la especificación dice «sólo si existen», y si el servidor no publica
    el resumen del turno la fila entera no se dibuja y eso es correcto. Lo que SÍ se exige es que
    las que estén sean honestas.
  */
  if (vista.indicadores.length === 0) {
    dato(`${tamano}: sin indicadores del turno — el servidor no dio cifras y la fila no se dibuja`);
  } else {
    ok(
      vista.indicadores.length <= 4,
      `${tamano}: hay ${vista.indicadores.length} indicadores (la tabla admite hasta cuatro)`,
    );
    ok(
      vista.indicadores.every((i) => /^\d+$/.test(i.valor)),
      `${tamano}: todos muestran una cifra`,
      vista.indicadores.map((i) => `${i.rotulo}=${i.valor}`).join(' · '),
    );
    ok(
      vista.indicadores.every((i) => !/evidencia/i.test(i.rotulo)),
      `${tamano}: ninguno dice «Evidencias» — ese dato no existe en el servidor`,
      vista.indicadores.map((i) => i.rotulo).join(' · '),
    );
    ok(
      vista.indicadores.every((i) => !i.pulsable),
      `${tamano}: y ninguno es un acceso disfrazado de métrica`,
    );
    const columnas = new Set(vista.indicadores.map((i) => i.x)).size;
    const esperadas = ancho >= 768 ? Math.min(vista.indicadores.length, 4) : 2;
    ok(
      columnas === esperadas,
      `${tamano}: van en ${esperadas} columna(s)`,
      `son ${columnas}`,
    );
  }

  // ── la consulta ───────────────────────────────────────────────────────────────────────────────
  ok(/^consultar veh/i.test(vista.tituloConsulta), `${tamano}: la tarjeta se titula «Consultar vehículo»`, `«${vista.tituloConsulta}»`);
  ok(vista.tituloConsultaEsH2, `${tamano}: y es un encabezado de nivel 2, bajo el saludo`);
  ok(
    vista.tituloConsultaPx >= 17 && vista.tituloConsultaPx <= 20,
    `${tamano}: mide ${vista.tituloConsultaPx}px (la tabla pide 17-20 para un título de sección)`,
  );
  ok(vista.subConsulta.length > 0, `${tamano}: lleva subtítulo breve`, `«${vista.subConsulta}»`);
  ok(
    /bah[ií]a/i.test(vista.aviso),
    `${tamano}: y el aviso de la bahía, que es la regla crítica del encargo`,
    `«${vista.aviso}»`,
  );
  ok(
    vista.padConsulta >= 14 && vista.padConsulta <= 18,
    `${tamano}: su relleno es de ${vista.padConsulta}px (14-18)`,
  );
  ok(
    vista.radioConsulta >= 12 && vista.radioConsulta <= 16,
    `${tamano}: y su radio de ${vista.radioConsulta}px (12-16)`,
  );
  ok(vista.placa !== null && vista.placa.alto >= 44, `${tamano}: el campo de placa mide ${vista.placa?.alto}px (≥44)`);
  ok(
    vista.boton !== null && vista.boton.alto >= 44 && vista.boton.ancho >= 44,
    `${tamano}: BUSCAR mide ${vista.boton?.ancho}x${vista.boton?.alto} (objetivo táctil ≥44)`,
  );
  ok(vista.botonTexto.length > 0, `${tamano}: y dice su nombre`, `«${vista.botonTexto}»`);
  /* Una fila cuando cabe —tablet— y apilados cuando no: las dos formas son correctas y la tabla
     las nombra. Lo que no puede pasar es que el texto se corte, y eso se comprueba aparte. */
  if (ancho >= 768) {
    ok(
      vista.placa !== null && vista.boton !== null && Math.abs(vista.placa.y - vista.boton.y) <= 2,
      `${tamano}: la placa y BUSCAR van en una fila`,
      `placa.y=${vista.placa?.y} boton.y=${vista.boton?.y}`,
    );
  }

  // ── ubicación de la consulta ──────────────────────────────────────────────────────────────────
  ok(
    /ubicaci[óo]n/i.test(vista.ubicacion) && vista.ubicacionVisible,
    `${tamano}: la zona y la bahía viven en «Ubicación de la consulta», visible`,
    `«${vista.ubicacion}»`,
  );
  ok(
    vista.zona !== null && vista.bahia !== null && vista.zona.alto >= 44 && vista.bahia.alto >= 44,
    `${tamano}: las dos conservan el objetivo táctil`,
    `zona=${vista.zona?.alto} bahía=${vista.bahia?.alto}`,
  );
  ok(
    vista.rotulos.length >= 2 && vista.rotulos.every((r) => r.apunta),
    `${tamano}: y sus rótulos apuntan a su control`,
    vista.rotulos.map((r) => `«${r.texto}»`).join(' · '),
  );

  // ── última consulta ───────────────────────────────────────────────────────────────────────────
  ok(vista.ultima, `${tamano}: «Última consulta» sigue en la pantalla`);

  // ── contenedor, texto y color ─────────────────────────────────────────────────────────────────
  ok(vista.anchoMain <= 960, `${tamano}: el área central no pasa de 960px`, `mide ${vista.anchoMain}px`);
  const margen = ancho >= 768 ? [18, 24] : [14, 16];
  ok(
    vista.margenIzq >= margen[0] && vista.margenIzq <= margen[1] && vista.margenIzq === vista.margenDer,
    `${tamano}: margen lateral ${vista.margenIzq}px (la tabla pide ${margen[0]}-${margen[1]})`,
  );
  ok(vista.hueco >= 12 && vista.hueco <= 16, `${tamano}: separación entre bloques de ${vista.hueco}px (12-16)`);
  ok(vista.recortados.length === 0, `${tamano}: ningún texto queda cortado`, vista.recortados.join(' · '));
  ok(vista.solapes.length === 0, `${tamano}: ningún texto se imprime encima de otro`, vista.solapes.join(' · '));

  /* Los colores de la especificación, por su valor. Se miden los computados y no los tokens: un
     token correcto que nadie aplica no pinta nada.

     BUSCAR lleva #0670D6 y no el #0788FF del documento, y está medido: con texto blanco encima,
     #0788FF da 3.51 y hace falta 4.5. No hay ningún azul que sirva a la vez de relleno con blanco
     y de texto sobre la tarjeta —los dos requisitos no se cruzan—, así que son dos tokens. El
     #0788FF sí se usa donde es legible: la pestaña activa de la barra inferior, sobre el cromo,
     donde da 4.60. La cuenta entera está en tokens.css. */
  ok(vista.colores.fondo === 'rgb(6, 27, 48)', `${tamano}: el fondo es #061B30`, vista.colores.fondo);
  ok(vista.colores.cabecera === 'rgb(6, 34, 59)', `${tamano}: la cabecera es #06223B`, vista.colores.cabecera);
  ok(vista.colores.tarjeta === 'rgb(11, 43, 71)', `${tamano}: las tarjetas son #0B2B47`, vista.colores.tarjeta);
  ok(vista.colores.borde === 'rgb(34, 80, 107)', `${tamano}: el borde es #22506B`, vista.colores.borde);
  ok(vista.colores.campo === 'rgb(6, 30, 54)', `${tamano}: los campos son #061E36`, vista.colores.campo);
  ok(vista.colores.buscar === 'rgb(6, 112, 214)', `${tamano}: BUSCAR lleva el azul de relleno medido`, vista.colores.buscar);
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

/* `accesosNavegan` vivió acá hasta el 12-10-2026: comprobaba que las tres baldosas del Inicio
   llevaran a /cite, /queue y /cite. La «Especificación definitiva» las quita —la regla 3 prohíbe
   repetir en el cuerpo lo que la barra inferior ya hace— así que no queda nada que navegar desde
   ahí. Que los cinco destinos de la barra funcionen lo comprueba `fiscalizacion-nav.cjs`, que es
   su sitio. */

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
    await boletaYPendientes(page, tamano.nombre, tamano.width);
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
