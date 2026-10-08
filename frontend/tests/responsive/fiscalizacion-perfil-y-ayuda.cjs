/**
 * Los dos ajustes del 26-09-2026 en Fiscalización: la cabecera de «Mi perfil» y la Ayuda.
 *
 * <h2>Cabecera fija — los 12 criterios del prompt</h2>
 *
 * <p>Se mide lo que el criterio dice, no lo que la hoja de estilos declara. Que una regla ponga
 * `position: sticky` no prueba que el título se vea: basta un ancestro con `overflow` distinto de
 * `visible` para que `sticky` no pegue a nada y siga sin fallar ninguna prueba de CSS. Así que
 * acá se desplaza de verdad y se pregunta dónde quedó el título.</p>
 *
 * <h2>Ayuda — las cinco opciones</h2>
 *
 * <p>Cada tarjeta tiene que LLEVAR a algún lado. Se pulsan las cinco, se comprueba a dónde
 * llegaron, que la pantalla de destino no esté vacía y que se pueda volver.</p>
 *
 *   PASS='...' node tests/responsive/fiscalizacion-perfil-y-ayuda.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'inspector@luparx.test';

/** Escritorio, tablet y teléfono: el prompt pide las tres. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
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
    page.waitForResponse((r) => r.url().includes('/auth/inspector/login'), { timeout: 15000 }),
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
    await page.waitForTimeout(1400);
  }
  return page;
}

/** Dónde está el título ahora mismo, y qué más hay en pantalla. */
async function estadoDeLaCabecera(page) {
  return page.evaluate(() => {
    const barra = document.querySelector('.lx-app-bar');
    const titulo = document.querySelector('.lx-app-bar__title');
    const caja = titulo ? titulo.getBoundingClientRect() : null;
    const doc = document.documentElement;
    return {
      hayBarra: Boolean(barra),
      textoTitulo: titulo ? (titulo.textContent ?? '').trim() : '',
      // Visible de verdad: dentro del viewport, no sólo presente en el DOM.
      tituloVisible: caja ? caja.top >= -1 && caja.bottom <= window.innerHeight : false,
      topDelTitulo: caja ? Math.round(caja.top) : null,
      /*
        Quién pega NO es necesariamente la barra. En el fiscalizador la que pega es su envoltorio
        `.lx-top-chrome`, que lleva la barra Y la franja de estadía en curso como un solo bloque
        —si pegara sólo la barra, la franja se le despegaría al desplazarse—. Preguntarle
        `position` únicamente a `.lx-app-bar` contesta `static` de una cabecera que sí se queda:
        eso es un fallo del arnés, no de la pantalla, y el 06-10-2026 lo dio por tres sesiones
        mientras los criterios 3, 4 y 6 pasaban en la misma corrida. Se busca desde la barra hacia
        arriba y se informa también CUÁL es, que es lo que faltaba para verlo de un vistazo.
      */
      posicion: (() => {
        let nodo = barra;
        while (nodo && nodo !== document.body) {
          const p = getComputedStyle(nodo).position;
          if (p === 'sticky' || p === 'fixed') return p;
          nodo = nodo.parentElement;
        }
        return barra ? getComputedStyle(barra).position : null;
      })(),
      quienPega: (() => {
        let nodo = barra;
        while (nodo && nodo !== document.body) {
          const p = getComputedStyle(nodo).position;
          if (p === 'sticky' || p === 'fixed') return nodo.className || nodo.tagName;
          nodo = nodo.parentElement;
        }
        return 'nadie';
      })(),
      scrollY: Math.round(window.scrollY),
      alturaDocumento: doc.scrollHeight,
      // Una segunda barra de desplazamiento sería un contenedor interno que desplaza además del
      // documento. El prompt lo prohíbe explícitamente.
      contenedoresQueDesplazan: [...document.querySelectorAll('body *')].filter((n) => {
        const e = getComputedStyle(n);
        return (
          (e.overflowY === 'scroll' || e.overflowY === 'auto')
          && n.scrollHeight > n.clientHeight + 4
          && n.clientHeight > 200
        );
      }).length,
      barrasDeNavegacion: document.querySelectorAll('.lx-bottom-tab-bar').length,
      desbordaHorizontal: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 664 },
  });

  console.log(`\n${BASE}/inspector · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 200));
  });

  // ===============================================================================================
  // MI PERFIL — los 12 criterios
  // ===============================================================================================
  console.log('── «Mi perfil»: la cabecera se queda ──');
  await page.goto(`${BASE}/inspector/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const alCargar = await estadoDeLaCabecera(page);
  comprobar(alCargar.hayBarra, 'criterio 2 · la cabecera existe al cargar');
  comprobar(
    /perfil/i.test(alCargar.textoTitulo),
    `criterio 2 · y su título es «Mi perfil» (dice «${alCargar.textoTitulo}»)`,
  );
  comprobar(alCargar.tituloVisible, 'criterio 2 · visible en la parte superior', `top=${alCargar.topDelTitulo}`);
  comprobar(
    alCargar.posicion === 'sticky' || alCargar.posicion === 'fixed',
    `criterio 4 · la cabecera está declarada para quedarse (${alCargar.posicion} · ${alCargar.quienPega})`,
  );

  // La pantalla tiene que dar para desplazarse; si no, el criterio no se puede probar y decirlo es
  // mejor que dar por bueno lo que no se midió.
  comprobar(
    alCargar.alturaDocumento > 664 + 100,
    `la pantalla es más larga que el viewport (${alCargar.alturaDocumento}px), así que hay scroll que probar`,
  );

  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(600);
  const aMitad = await estadoDeLaCabecera(page);
  comprobar(
    aMitad.scrollY > 100,
    `criterio 3 · la pantalla se desplazó (${aMitad.scrollY}px)`,
  );
  comprobar(
    aMitad.tituloVisible && /perfil/i.test(aMitad.textoTitulo),
    'criterio 4 · y el título SIGUE visible',
    `top=${aMitad.topDelTitulo} scrollY=${aMitad.scrollY}`,
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(700);
  const alFinal = await estadoDeLaCabecera(page);
  comprobar(
    alFinal.tituloVisible,
    'criterio 6 · al final de la pantalla la cabecera sigue ahí',
    `top=${alFinal.topDelTitulo} scrollY=${alFinal.scrollY}`,
  );
  comprobar(
    alFinal.contenedoresQueDesplazan === 0,
    'criterio 7 · no hay una segunda barra de desplazamiento',
    `${alFinal.contenedoresQueDesplazan} contenedor(es) desplazan por su cuenta`,
  );
  comprobar(
    alFinal.barrasDeNavegacion === 1,
    'criterio 8 · no apareció una segunda barra de navegación',
    `hay ${alFinal.barrasDeNavegacion}`,
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const deVuelta = await estadoDeLaCabecera(page);
  comprobar(
    deVuelta.scrollY === 0 && deVuelta.tituloVisible && deVuelta.topDelTitulo === alCargar.topDelTitulo,
    'criterio 7 · volver arriba deja todo como estaba, sin saltos',
    `top al cargar=${alCargar.topDelTitulo} · top al volver=${deVuelta.topDelTitulo}`,
  );

  console.log('── la misma pantalla en cada tamaño (criterios 10 y 11) ──');
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/inspector/profile`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(500);
    const m = await estadoDeLaCabecera(p);
    comprobar(
      m.tituloVisible && !m.desbordaHorizontal && m.contenedoresQueDesplazan === 0,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · el título aguanta el scroll y no desborda`,
      `tituloVisible=${m.tituloVisible} desborda=${m.desbordaHorizontal} scrollInterno=${m.contenedoresQueDesplazan}`,
    );
    await ctx.close();
  }

  // ===============================================================================================
  // AYUDA — el bloque de las cinco opciones se fue (08-10-2026)
  // ===============================================================================================
  /*
    Acá vivía el recorrido de las cinco tarjetas de la Ayuda vieja: se pulsaba cada una, se
    comprobaba a qué ruta llevaba y que la pantalla de destino tuviera su título.

    Se borra porque esas tarjetas ya no existen. El encargo de reestructuración las quitó —las
    cuatro llevaban a destinos que la barra inferior ya tiene— y lo que ahora hay que comprobar es
    lo contrario: que NO estén. Eso se mide más abajo, en el bloque «Ayuda: cuatro accesos», junto
    con que los cuatro paneles abran contenido real.

    Vale la pena anotar un falso APROBADO que este bloque daba y que sólo se vio al quitarlo: su
    comprobación de «Pendientes» buscaba un botón por su texto en toda la página, y pasaba
    encontrando la PESTAÑA «Pendientes» de la barra inferior. Medía la barra creyendo medir la
    Ayuda. El bloque nuevo busca dentro de las filas de la pantalla, no en todo el documento.
  */

  // ===============================================================================================
  // DIAGNÓSTICO — los dos problemas que sí se pueden provocar
  // ===============================================================================================
  /*
    Un diagnóstico que sólo se ha visto en verde no está probado: lo que hay que demostrar es que
    DETECTA. Se provocan los dos únicos estados que un navegador deja provocar sin tocar el
    servidor —sin señal, y con algo esperando en la cola— y se comprueba que cada uno aparece con
    su acción y que las demás filas siguen sin botones.

    Los permisos no se provocan: Chromium concede o deniega por contexto, y denegarlos acá probaría
    la configuración del arnés, no la pantalla.
  */
  // ===============================================================================================
  // LA CAMPANA NO SE VA, Y LAS ACCIONES SON CORTAS (07-10-2026)
  // ===============================================================================================
  /*
    Dos encargos del 07-10, los dos sobre la misma pantalla:

      · La campana desaparecía al entrar a Ayuda, porque se dibujaba sólo en las pantallas raíz.
        Un indicador de avisos sin leer que se esconde al navegar no es un indicador. Se comprueba
        en Ayuda Y con el diagnóstico abierto, que es donde la captura del PDF la echó de menos.
      · Las acciones eran frases largas —«Ir a consultar una placa»— y ahora son cortas con una
        flecha. Se mide el patrón completo en las seis: título, descripción, acción y flecha.
  */
  console.log('── La campana se queda, y las acciones son cortas ──');
  await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  {
    const cabecera = await page.evaluate(() => {
      const barra = document.querySelector('.lx-app-bar');
      const campana = barra ? barra.querySelector('.lx-app-bar__icon-btn') : null;
      const caja = campana ? campana.getBoundingClientRect() : null;
      return {
        campanas: document.querySelectorAll('.lx-app-bar__icon-btn').length,
        visible: caja ? caja.width > 0 && caja.height > 0 && caja.top >= -1 : false,
        tactil: caja ? Math.round(Math.min(caja.width, caja.height)) : 0,
        enLinea: document.querySelectorAll('.lx-connection-badge').length,
        cabeceras: document.querySelectorAll('.lx-app-bar').length,
      };
    });
    comprobar(
      cabecera.campanas === 1 && cabecera.visible,
      'en Ayuda la campana sigue ahí, y una sola',
      JSON.stringify(cabecera),
    );
    comprobar(cabecera.tactil >= 44, '  con su blanco táctil de 44px', `${cabecera.tactil}px`);
    /* Una, y en la barra (08-10-2026, tarde).

       Esta línea esperó una, luego cero, y vuelve a una. El reparto final es por si la pantalla
       tiene SALUDO: el inicio lo lleva en el saludo, y Ayuda —que no tiene— lo lleva en la barra
       fija, que es lo que pide el punto 10 del encargo de reestructuración. Lo que esta línea
       cuida es lo de siempre: que haya exactamente uno, ni cero ni dos. El reparto completo lo
       mide `barras-fijas.cjs`. */
    comprobar(cabecera.enLinea === 1, '  y «En línea» está una sola vez', `encontré ${cabecera.enLinea}`);
    comprobar(cabecera.cabeceras === 1, '  sin una segunda cabecera', `${cabecera.cabeceras}`);

    // Con el diagnóstico abierto: el modal no reemplaza el header.
    await page.locator('.lx-list-row').filter({ hasText: 'Diagnóstico' }).first().click();
    await page.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => {});
    const conModal = await page.evaluate(() => ({
      campanas: document.querySelectorAll('.lx-app-bar__icon-btn').length,
      cabeceras: document.querySelectorAll('.lx-app-bar').length,
    }));
    comprobar(
      conModal.campanas === 1 && conModal.cabeceras === 1,
      '  y con el diagnóstico abierto tampoco desaparece',
      JSON.stringify(conModal),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // En los avisos NO va, que es la única excepción: sería un botón hacia donde ya estás.
    await page.goto(`${BASE}/inspector/notifications`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const enAvisos = await page.evaluate(() => document.querySelectorAll('.lx-app-bar__icon-btn').length);
    comprobar(enAvisos === 0, 'en la pantalla de avisos la campana no se dibuja', `${enAvisos}`);
  }

  // --- Ayuda: cuatro accesos, y ninguno que repita la barra inferior ----------------------------
  //
  // Reescrito el 08-10-2026. Antes se medía el patrón de las SEIS tarjetas —icono, acción y flecha
  // en cada una—; el encargo de hoy quita cuatro de ellas porque llevaban a destinos que la barra
  // inferior ya tiene, y deja cuatro accesos que no navegan: abren paneles que miden o actúan.
  //
  // Lo que se comprueba cambia con ellas: antes «las seis siguen ahí», ahora «estas cuatro y
  // NINGUNA de las que se fueron», que es lo que el encargo pide en su punto 13.
  await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  {
    const ayuda = await page.evaluate(() => {
      const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const filas = [...document.querySelectorAll('.lx-list-row')].map((n) => {
        const caja = n.getBoundingClientRect();
        return {
          titulo: rec(n.querySelector('.lx-list-row__title')?.textContent),
          icono: n.querySelectorAll('.lx-list-row__icon svg').length,
          flecha: n.querySelectorAll('.lx-list-row__value svg').length,
          alto: Math.round(caja.height),
        };
      });
      return {
        filas,
        // Las tarjetas de la Ayuda vieja, por su clase: tienen que haber desaparecido del árbol.
        tarjetasViejas: document.querySelectorAll('.lx-help-card').length,
        lead: rec(document.querySelector('main p')?.textContent),
        // El texto entero de la pantalla, para buscar en él los accesos que el encargo prohíbe.
        texto: rec(document.querySelector('main')?.textContent),
      };
    });

    comprobar(ayuda.tarjetasViejas === 0, 'las tarjetas largas de la Ayuda vieja ya no están', `${ayuda.tarjetasViejas}`);
    comprobar(
      /En qué podemos ayudarte/i.test(ayuda.lead),
      'debajo del título dice «¿En qué podemos ayudarte?»',
      `«${ayuda.lead}»`,
    );

    const esperados = ['Diagnóstico', 'Permisos del dispositivo', 'Sincronización', 'Reportar un problema'];
    const titulos = ayuda.filas.map((f) => f.titulo);
    comprobar(
      esperados.every((e) => titulos.includes(e)) && ayuda.filas.length === esperados.length,
      'Ayuda tiene exactamente los cuatro accesos del encargo',
      titulos.join(' · ') || 'ninguno',
    );

    // Los cuatro que el punto 13 manda comprobar que YA NO estén. Se buscan como títulos de fila y
    // no en el texto suelto: «Sincronización» contiene «sincroniza», y el diagnóstico menciona la
    // cámara — buscar subcadenas daría falsos positivos sobre texto legítimo.
    for (const prohibido of ['Consultar una placa', 'Levantar una boleta', 'Fotos y evidencia', 'Pendientes']) {
      comprobar(
        !titulos.includes(prohibido),
        `  y ya no ofrece «${prohibido}», que vive en la barra inferior`,
        titulos.join(' · '),
      );
    }

    for (const fila of ayuda.filas) {
      comprobar(
        fila.icono === 1 && fila.flecha === 1,
        `  «${fila.titulo}»: icono + nombre + flecha`,
        JSON.stringify(fila),
      );
      comprobar(fila.alto >= 44, '  con blanco táctil suficiente', `${fila.alto}px`);
    }
  }

  // --- Los cuatro paneles abren algo REAL (punto 13 del encargo) --------------------------------
  {
    const paneles = [
      { nombre: 'Diagnóstico', espera: '.lx-diag__row' },
      { nombre: 'Permisos del dispositivo', espera: '.lx-diag__row' },
      { nombre: 'Sincronización', espera: '.lx-summary__row' },
      { nombre: 'Reportar un problema', espera: '.lx-report-state' },
    ];
    for (const panel of paneles) {
      await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      await page.locator('.lx-list-row').filter({ hasText: panel.nombre }).first().click();
      const abrio = await page
        .waitForSelector(`.lx-modal ${panel.espera}`, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      comprobar(abrio, `«${panel.nombre}» abre un panel con contenido real`, `esperaba ${panel.espera}`);
      if (abrio && panel.nombre === 'Permisos del dispositivo') {
        // La cámara es la prioritaria del encargo: tiene que estar y decir en qué estado está.
        const camara = await page.evaluate(() => {
          const fila = [...document.querySelectorAll('.lx-modal .lx-diag__row')].find((n) =>
            /cámara/i.test(n.textContent || ''),
          );
          return fila ? String(fila.textContent).replace(/\s+/g, ' ').trim() : null;
        });
        comprobar(camara !== null, '  y la cámara aparece con su estado', camara ?? 'no está');
      }
      if (abrio && panel.nombre === 'Reportar un problema') {
        // Y no finge que envió nada: no hay backend, y el panel tiene que decirlo.
        const texto = await page.evaluate(() => String(document.querySelector('.lx-modal')?.textContent || ''));
        comprobar(
          /no se puede enviar|todavía no/i.test(texto),
          '  y dice que todavía no se puede enviar, en vez de fingirlo',
        );
      }
    }
  }

  console.log('── Diagnóstico: que detecte de verdad ──');

  /*
    `navegar: false` existe por un error que costó la corrida del 06-10-2026: el escenario sin
    señal cortaba el contexto ANTES de pedir la pantalla, así que el `goto` moría con
    ERR_INTERNET_DISCONNECTED y se llevaba el script entero por delante. Una aplicación offline no
    es una aplicación que se pueda DESCARGAR offline: primero se carga, después se corta. Es
    exactamente lo que le pasa a un fiscalizador en la calle.
  */
  async function abrirDiagnostico(p, navegar = true) {
    if (navegar) {
      await p.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2200);
    }
    await p.locator('.lx-list-row').filter({ hasText: 'Diagnóstico' }).first().click();
    await p.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(400);
    return p.$$eval('.lx-diag__row', (nodos) =>
      nodos.map((n) => ({
        clave: n.getAttribute('data-check'),
        tono: n.getAttribute('data-tono'),
        accion: n.getAttribute('data-accion'),
        texto: (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
        botones: [...n.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
      })),
    );
  }

  // --- Sin señal -------------------------------------------------------------------------------
  {
    // La pantalla primero, el corte después: `useIsOnline` escucha el evento `offline`, así que el
    // diagnóstico se entera sin recargar nada —que es justo lo que tiene que pasar en la calle.
    await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await context.setOffline(true);
    await page.waitForTimeout(800);
    const filas = await abrirDiagnostico(page, false);
    const conexion = filas.find((f) => f.clave === 'connection');
    comprobar(
      conexion?.tono === 'problema',
      'sin señal, la conexión se marca como problema',
      conexion ? `tono=${conexion.tono} · ${conexion.texto}` : 'no se pintó la fila de conexión',
    );
    comprobar(
      (conexion?.botones ?? []).some((b) => /ver conexión/i.test(b)),
      '  y ofrece la única acción que resuelve: ver la conexión',
      JSON.stringify(conexion?.botones ?? []),
    );
    const sanasConRemedio = filas.filter((f) => f.tono === 'ok' && f.accion === 'remedio');
    comprobar(
      sanasConRemedio.length === 0,
      '  mientras las comprobaciones en orden siguen sin un botón de recuperación',
      sanasConRemedio.map((f) => f.clave).join(', '),
    );
    const texto = (await page.getByRole('dialog').textContent().catch(() => '')) ?? '';
    comprobar(
      !/Todo está funcionando correctamente/.test(texto),
      '  y el resumen deja de decir que todo está bien',
      texto.slice(0, 140),
    );
    await page.keyboard.press('Escape');
    await context.setOffline(false);
    await page.waitForTimeout(800);
  }

  // --- Con algo esperando ------------------------------------------------------------------------
  /*
    La cola se siembra en `localStorage`, que es donde vive de verdad (ver `citationQueue.ts`), con
    `nextAttemptAt` en el futuro: así la fila CUENTA como pendiente y el barrido automático no
    intenta enviarla. Sin eso, el arnés le mandaría al servidor de staging una boleta inventada —y
    este trabajo es sólo de pruebas, no de datos.
  */
  const tenantId = await page.evaluate(() => {
    try {
      return window.localStorage.getItem('luparx.tenant.inspector.v1');
    } catch {
      return null;
    }
  });
  if (!tenantId) {
    console.log('  ·       sin municipalidad recordada en este navegador: no se puede sembrar la cola');
  } else {
    await page.evaluate((tid) => {
      const fila = {
        id: 'diagnostico-arnes',
        tenantId: tid,
        deviceCitationId: 'diagnostico-arnes',
        idempotencyKey: 'diagnostico-arnes',
        issueIdempotencyKey: 'diagnostico-arnes',
        createdAt: new Date().toISOString(),
        payload: {},
        photos: [],
        requiresPhoto: false,
        infractionName: 'Prueba de diagnóstico',
        state: 'PENDING',
        attempts: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        // Un día en el futuro: nunca le toca el turno de envío.
        nextAttemptAt: Date.now() + 86_400_000,
        citationId: null,
        number: null,
        status: null,
        sentAt: null,
      };
      window.localStorage.setItem(`luparx.inspector.citationQueue.${tid}`, JSON.stringify([fila]));
    }, tenantId);

    const filas = await abrirDiagnostico(page);
    const sync = filas.find((f) => f.clave === 'sync');
    comprobar(
      sync?.tono === 'aviso' && /1 operación esperando/.test(sync.texto),
      'con una operación en la cola, la sincronización lo dice con el número',
      sync ? `tono=${sync.tono} · ${sync.texto}` : 'no se pintó la fila de sincronización',
    );
    comprobar(
      (sync?.botones ?? []).some((b) => /Sincronizar ahora/i.test(b)),
      '  y aparece «Sincronizar ahora», que antes no estaba',
      JSON.stringify(sync?.botones ?? []),
    );
    const otras = filas.filter((f) => f.clave !== 'sync' && f.accion === 'remedio');
    comprobar(
      otras.length === 0,
      '  y nada más cambió: ninguna otra fila ganó un botón de recuperación',
      otras.map((f) => `${f.clave}:${f.botones.join('/')}`).join(', '),
    );
    await page.keyboard.press('Escape');

    // La cola se deja como estaba: un arnés que ensucia el entorno hace fallar al siguiente.
    await page.evaluate((tid) => {
      window.localStorage.removeItem(`luparx.inspector.citationQueue.${tid}`);
    }, tenantId);
  }

  // --- Móvil y escritorio ------------------------------------------------------------------------
  /*
    §10 pide las dos. Lo que se mide no es «se ve bien» sino lo único que se puede medir: que el
    panel quepa —ni desborda la página ni se corta su propio contenido— y que las seis filas sigan
    ahí en los dos anchos. Un diagnóstico que en el teléfono muestra cinco filas y en el escritorio
    seis estaría mintiendo en uno de los dos sitios.
  */
  for (const tam of [
    { nombre: 'móvil estándar', width: 390, height: 664 },
    { nombre: 'escritorio', width: 1536, height: 960 },
  ]) {
    const ctx = await browser.newContext({
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      viewport: { width: tam.width, height: tam.height },
      storageState: await context.storageState(),
    });
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2200);
    await p2.locator('.lx-list-row').filter({ hasText: 'Diagnóstico' }).first().click();
    await p2.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => {});
    await p2.waitForTimeout(500);
    const medida = await p2.evaluate(() => {
      const doc = document.documentElement;
      const filas = [...document.querySelectorAll('.lx-diag__row')];
      const panel = document.querySelector('[role="dialog"]');
      const cajaPanel = panel ? panel.getBoundingClientRect() : null;
      return {
        filas: filas.length,
        desbordaPagina: doc.scrollWidth > doc.clientWidth + 1,
        // Una fila cuyo contenido no cabe en su propia caja: texto cortado de verdad.
        filasQueDesbordan: filas.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
        panelCabe: cajaPanel ? cajaPanel.left >= -1 && cajaPanel.right <= window.innerWidth + 1 : false,
      };
    });
    comprobar(
      medida.filas === 6 && !medida.desbordaPagina && medida.filasQueDesbordan === 0 && medida.panelCabe,
      `${tam.nombre.padEnd(16)} ${tam.width}x${tam.height} · las seis filas caben y nada desborda`,
      JSON.stringify(medida),
    );
    await ctx.close();
  }

  // Volver a Ayuda / Más desde donde sea: el prompt lo pide explícitamente.
  await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const volver = page.getByRole('button', { name: /Volver|Atrás|Back/i }).first();
  if ((await volver.count()) > 0) {
    await volver.click();
    await page.waitForTimeout(1600);
    comprobar(/\/more/.test(page.url()), 'desde Ayuda se vuelve a «Más»', `url=${page.url().replace(BASE, '')}`);
  } else {
    comprobar(false, 'Ayuda tiene un botón de volver');
  }

  comprobar(
    erroresJs.length === 0,
    'criterio 12 · ni un error nuevo en consola',
    erroresJs.join(' | '),
  );

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
