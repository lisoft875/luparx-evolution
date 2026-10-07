/**
 * Ciudadano → Ayuda: la cabecera que se perdía y las seis tarjetas que no llevaban a ningún lado.
 *
 * <h2>Qué se mide y por qué así</h2>
 *
 * <p>El encargo del 07-10-2026 reporta dos cosas en la misma pantalla: al entrar a Ayuda se perdía
 * la cabecera superior, y las seis tarjetas eran texto informativo sin acción. Las dos se
 * comprueban por el hecho y no por el aspecto:</p>
 *
 * <ul>
 *   <li><b>La cabecera.</b> Que exista UNA `.lx-app-bar` —ni cero, que era el defecto, ni dos, que
 *       sería la corrección hecha mal— y que la campana y la navegación inferior sigan ahí.</li>
 *   <li><b>Las acciones.</b> Se pulsan las seis y se comprueba a qué ruta llegaron y que la
 *       pantalla de destino pintó su propio título. Un enlace que navega a una pantalla vacía es un
 *       enlace muerto con mejor disfraz.</li>
 * </ul>
 *
 * <p>Ninguna de las seis rutas es nueva, así que lo que esto protege es que sigan existiendo: el
 * día que alguien renombre `/vehicles`, esta prueba lo dice antes que una municipalidad.</p>
 *
 *   PASS='...' node tests/responsive/ayuda-ciudadano.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA ?? 'ana.morales@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

/** Las seis tarjetas y la ruta que YA existía para cada una. */
const TEMAS = [
  { titulo: 'Cómo estacionar', ruta: /\/park/ },
  // Ampliar no tiene ruta propia: el panel vive en la tarjeta de la estadía del Inicio.
  { titulo: 'Si necesitás más tiempo', ruta: /\/$|\/\?/ },
  { titulo: 'Si te llega una boleta', ruta: /\/fines/ },
  // Apelar necesita saber CUÁL boleta, así que se elige en la lista.
  { titulo: 'Apelar una boleta', ruta: /\/fines/ },
  { titulo: 'La billetera', ruta: /\/wallet/ },
  { titulo: 'Placas compartidas', ruta: /\/vehicles/ },
];

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/citizen/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del ciudadano falló con ${respuesta.status()}.`);
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

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 664 },
  });

  console.log(`\n${BASE} · Ayuda del ciudadano · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 200));
  });

  // ===============================================================================================
  // 1 · LA CABECERA VUELVE, Y NO LLEGA ACOMPAÑADA
  // ===============================================================================================
  console.log('── La cabecera de Ayuda ──');
  await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const cabecera = await page.evaluate(() => {
    const barra = document.querySelector('.lx-app-bar');
    const caja = barra ? barra.getBoundingClientRect() : null;
    const campana = barra ? barra.querySelector('.lx-app-bar__icon-btn') : null;
    const cajaCampana = campana ? campana.getBoundingClientRect() : null;
    const pegado = (() => {
      let nodo = barra;
      while (nodo && nodo !== document.body) {
        const p = getComputedStyle(nodo).position;
        if (p === 'sticky' || p === 'fixed') return nodo.className || nodo.tagName;
        nodo = nodo.parentElement;
      }
      return 'nadie';
    })();
    return {
      cabeceras: document.querySelectorAll('.lx-app-bar').length,
      titulo: (document.querySelector('.lx-app-bar__title')?.textContent ?? '').trim(),
      visible: caja ? caja.top >= -1 && caja.height > 0 : false,
      volver: document.querySelectorAll('.lx-app-bar__back').length,
      campana: cajaCampana ? Math.round(Math.min(cajaCampana.width, cajaCampana.height)) : 0,
      pegado,
      barrasInferiores: document.querySelectorAll('.lx-bottom-tab-bar').length,
      destinos: document.querySelectorAll('.lx-bottom-tab-bar a, .lx-bottom-tab-bar button').length,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  comprobar(cabecera.cabeceras === 1, 'Ayuda muestra la cabecera superior, y una sola', JSON.stringify(cabecera));
  comprobar(/ayuda/i.test(cabecera.titulo), `  con su título («${cabecera.titulo}»)`);
  comprobar(cabecera.visible, '  visible en la parte de arriba');
  comprobar(cabecera.volver === 1, '  con la flecha de volver, porque se entra desde «Más»');
  comprobar(cabecera.campana >= 44, `  y la campana no se perdió (${cabecera.campana}px de blanco táctil)`);
  comprobar(cabecera.pegado !== 'nadie', `  la cabecera se queda al desplazar (${cabecera.pegado})`);
  comprobar(cabecera.barrasInferiores === 1, '  la navegación inferior sigue intacta, y una sola');
  comprobar(cabecera.destinos === 5, `  con sus cinco destinos (${cabecera.destinos})`);
  comprobar(!cabecera.desborda, '  y sin desborde horizontal');

  // ===============================================================================================
  // 2 · LAS SEIS TARJETAS SON ACCIONES
  // ===============================================================================================
  console.log('── Las seis tarjetas ──');
  const tarjetas = await page.$$eval('.lx-help-card', (nodos) =>
    nodos.map((n) => {
      const accion = n.querySelector('.lx-help-card__action');
      const caja = n.getBoundingClientRect();
      return {
        titulo: (n.querySelector('.lx-help-card__title')?.textContent ?? '').trim(),
        icono: n.querySelectorAll('.lx-help-card__icon').length,
        accion: (accion?.textContent ?? '').trim(),
        flecha: n.querySelectorAll('.lx-help-card__go').length,
        boton: n.tagName === 'BUTTON',
        alto: Math.round(caja.height),
        accionCortada: accion ? accion.scrollWidth > accion.clientWidth + 1 : false,
      };
    }),
  );
  comprobar(tarjetas.length === 6, 'las seis tarjetas están ahí', `${tarjetas.length}`);
  for (const tarjeta of tarjetas) {
    comprobar(
      tarjeta.boton && tarjeta.icono === 1 && tarjeta.accion.length > 0 && tarjeta.flecha === 1,
      `  «${tarjeta.titulo}»: botón con icono, acción y flecha`,
      JSON.stringify(tarjeta),
    );
    comprobar(
      tarjeta.accion.length <= 26 && !tarjeta.accionCortada,
      `  y su acción es corta y entera («${tarjeta.accion}»)`,
      `${tarjeta.accion.length} caracteres · cortada=${tarjeta.accionCortada}`,
    );
    comprobar(tarjeta.alto >= 44, '  con blanco táctil suficiente', `${tarjeta.alto}px`);
  }

  // ===============================================================================================
  // 3 · CADA ACCIÓN LLEGA A UNA PANTALLA DE VERDAD
  // ===============================================================================================
  console.log('── Adónde lleva cada una ──');
  for (const tema of TEMAS) {
    await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const tarjeta = page.locator('.lx-help-card').filter({ hasText: tema.titulo }).first();
    if ((await tarjeta.count()) === 0) {
      comprobar(false, `«${tema.titulo}» está en Ayuda`, 'no se encontró la tarjeta');
      continue;
    }
    await tarjeta.click();
    await page.waitForTimeout(2200);
    const ruta = page.url().replace(BASE, '');
    comprobar(tema.ruta.test(ruta), `«${tema.titulo}» lleva a su pantalla (${ruta})`);
    const destino = await page.evaluate(() => ({
      // El título puede estar en la barra o ser el título de pantalla de una raíz de pestaña.
      titulo:
        (document.querySelector('.lx-app-bar__title')?.textContent
          ?? document.querySelector('h1')?.textContent
          ?? '').trim(),
      enLogin: window.location.pathname.endsWith('/login'),
      barra: document.querySelectorAll('.lx-bottom-tab-bar').length,
    }));
    comprobar(
      !destino.enLogin && destino.titulo.length > 0,
      `  y la pantalla de destino es la suya («${destino.titulo}»)`,
      JSON.stringify(destino),
    );
    comprobar(destino.barra === 1, '  con la navegación inferior intacta');
  }

  // ===============================================================================================
  // 4 · MÓVIL Y ESCRITORIO
  // ===============================================================================================
  console.log('── Móvil y escritorio ──');
  for (const tam of [
    { nombre: 'móvil chico', width: 320, height: 568 },
    { nombre: 'móvil estándar', width: 390, height: 664 },
    { nombre: 'tablet vertical', width: 768, height: 1024 },
    { nombre: 'escritorio', width: 1536, height: 960 },
  ]) {
    const ctx = await browser.newContext({
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      viewport: { width: tam.width, height: tam.height },
      storageState: await context.storageState(),
    });
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2400);
    const medida = await p2.evaluate(() => {
      const tarjetas = [...document.querySelectorAll('.lx-help-card')];
      return {
        tarjetas: tarjetas.length,
        cabeceras: document.querySelectorAll('.lx-app-bar').length,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        // Contenido que no cabe en su propia caja: texto cortado de verdad.
        cortadas: tarjetas.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
        chicas: tarjetas.filter((n) => n.getBoundingClientRect().height < 44).length,
      };
    });
    comprobar(
      medida.tarjetas === 6 && medida.cabeceras === 1 && !medida.desborda
        && medida.cortadas === 0 && medida.chicas === 0,
      `${tam.nombre.padEnd(16)} ${tam.width}x${tam.height} · cabecera, seis tarjetas, nada cortado`,
      JSON.stringify(medida),
    );
    await ctx.close();
  }

  comprobar(erroresJs.length === 0, 'ni un error nuevo en consola', erroresJs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
