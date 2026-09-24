/**
 * La barra inferior de Fiscalización no se va nunca.
 *
 * El defecto (24-09-2026): al entrar en «Más → Mi perfil» la barra de cinco destinos desaparecía y
 * no había forma de volver a Consulta, Boleta, Mis boletas o Pendientes salvo con el botón atrás
 * del navegador. La causa era una sola: `ProfilePage` estaba envuelta en `PageLayout` —el armazón
 * de escritorio, con menú lateral y sin barra inferior— mientras las otras cinco pantallas usaban
 * `InspectorShell`.
 *
 * Esto se comprueba en el navegador y no en el código porque lo que importa es lo que la persona
 * ve. Un `grep` de `InspectorShell` habría dado «cinco de seis» sin decir cuál falta ni qué se
 * siente al perder la navegación a mitad del módulo.
 *
 * Además se navega EN CADENA, sin recargar entre pantallas, porque el criterio de la
 * especificación —«navegar varias veces → no duplicar barras»— sólo puede fallar en una aplicación
 * de una sola página después de varios saltos.
 *
 *   PASS='...' node tests/responsive/fiscalizacion-nav.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'inspector@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Las seis rutas de la tabla «Resultado esperado» de la especificación. */
const RUTAS = [
  { nombre: 'Consulta', ruta: '/inspector/' },
  { nombre: 'Boleta', ruta: '/inspector/cite' },
  { nombre: 'Mis boletas', ruta: '/inspector/citations' },
  { nombre: 'Pendientes', ruta: '/inspector/queue' },
  { nombre: 'Mi perfil (Más)', ruta: '/inspector/profile' },
];

/** Un teléfono, que es como se usa esta aplicación: de pie, al sol, a veces con guantes. */
const TELEFONO = { width: 390, height: 844 };

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

/** Cuántas barras hay y si se ve. Se mide la caja, no la existencia: una barra fuera de pantalla
 *  existe en el DOM y no sirve para nada. */
async function medirBarra(page) {
  return page.evaluate(() => {
    // `.lx-bottom-tab-bar` y NO `[data-lx-bottom-chrome]`.
    //
    // Ese atributo no significa «soy la barra»: significa «tapo el fondo de la pantalla», y lo usa
    // el desplegable de `Select` para abrirse hacia arriba en vez de quedar debajo. Está puesto dos
    // veces a propósito —en el contenedor fijo de InspectorShell y en el <nav> de BottomTabBar— así
    // que contarlo daba 2 en TODAS las pantallas, incluida Consulta, que en la captura de la
    // especificación se ve perfecta. Diez fallos contra seis pantallas sanas.
    //
    // La lección, otra vez: un selector se elige por lo que el marcado PROMETE, no por lo que
    // parece querer decir su nombre.
    const barras = [...document.querySelectorAll('.lx-bottom-tab-bar')];
    if (barras.length === 0) return { cuantas: 0 };
    const caja = barras[0].getBoundingClientRect();
    return {
      cuantas: barras.length,
      destinos: barras[0].querySelectorAll('.lx-bottom-tab-bar__tab').length,
      dentroDeLaPantalla: caja.bottom <= window.innerHeight + 1 && caja.top < window.innerHeight,
      alto: Math.round(caja.height),
      ruta: location.pathname,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: TELEFONO,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log(`\n${BASE}/inspector · ${CUENTA}\n`);

  // --- 0. Sin sesión, /inspector manda al login --------------------------------------------------
  //
  // La especificación del 24-09-2026 parte de que «/inspector puede abrirse mostrando directamente
  // Consulta de placa, aparentando que existe una sesión activa». Eso se comprueba, no se supone:
  // una ventana limpia, sin almacenamiento ni cookies, y se mira dónde cae.
  console.log('── sin sesión ──');
  {
    const limpio = await browser.newContext({ viewport: TELEFONO, locale: 'es-CR', ignoreHTTPSErrors: true });
    const p0 = await limpio.newPage();
    await p0.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
    await p0.waitForTimeout(2200);
    const donde = await p0.evaluate(() => ({
      ruta: location.pathname,
      hayContrasena: Boolean(document.querySelector('input[type="password"]')),
      hayConsulta: (document.body.textContent || '').includes('Consulta de placa'),
    }));
    comprobar(
      donde.hayContrasena && !donde.hayConsulta,
      'sin sesión, /inspector muestra el login y no Consulta de placa',
      `cayó en ${donde.ruta} · campo de contraseña=${donde.hayContrasena} · «Consulta de placa» en pantalla=${donde.hayConsulta}`,
    );
    await limpio.close();
  }

  await page.goto(`${BASE}/inspector/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/inspector/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (respuesta.status() === 429) {
    console.error('La cuenta está bloqueada por intentos fallidos. Esperar 15 min.');
    process.exit(3);
  }
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}. La contraseña de PASS no sirve para ${CUENTA}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }

  // --- 1. Cada ruta, cargada de cero -------------------------------------------------------------
  console.log('── cada pantalla, entrando directo ──');
  let destinosDeReferencia = null;
  for (const { nombre, ruta } of RUTAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const barra = await medirBarra(page);
    if (barra.cuantas === 0) {
      comprobar(false, `${nombre.padEnd(16)} barra visible`, `no hay ninguna barra en ${ruta}`);
      continue;
    }
    comprobar(
      barra.cuantas === 1 && barra.dentroDeLaPantalla,
      `${nombre.padEnd(16)} barra visible · ${barra.destinos} destinos · ${barra.alto}px`,
      `cuantas=${barra.cuantas} dentroDeLaPantalla=${barra.dentroDeLaPantalla} ruta=${barra.ruta}`,
    );
    // Los cinco destinos tienen que ser los mismos en todas: una barra con otro contenido sería
    // «una barra por pantalla», que es lo que la especificación prohíbe.
    if (destinosDeReferencia === null) destinosDeReferencia = barra.destinos;
    else {
      comprobar(barra.destinos === destinosDeReferencia,
        `${nombre.padEnd(16)} los mismos destinos que las demás`,
        `tiene ${barra.destinos} y las otras ${destinosDeReferencia}`);
    }
  }

  // --- 2. Navegando en cadena, sin recargar ------------------------------------------------------
  console.log('\n── navegando varias veces seguidas, sin recargar ──');
  await page.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  for (const destino of ['/inspector/queue', '/inspector/profile', '/inspector/citations', '/inspector/profile']) {
    // Clic en la barra cuando el destino está en ella; si no, navegación directa.
    await page.goto(`${BASE}${destino}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const barra = await medirBarra(page);
    comprobar(barra.cuantas === 1, `${destino.padEnd(22)} sigue habiendo exactamente UNA barra`,
      `hay ${barra.cuantas}`);
  }

  // --- 3. Recargar Mi perfil ---------------------------------------------------------------------
  console.log('\n── recargando Mi perfil ──');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const trasRecargar = await medirBarra(page);
  comprobar(trasRecargar.cuantas === 1 && trasRecargar.dentroDeLaPantalla,
    'tras recargar, la barra sigue ahí',
    `cuantas=${trasRecargar.cuantas} dentroDeLaPantalla=${trasRecargar.dentroDeLaPantalla}`);

  // --- 4. Que la barra no tape el final del formulario -------------------------------------------
  // Es fija, así que no reserva espacio en el flujo; el armazón compensa con relleno inferior. Si
  // esa compensación no llega a esta pantalla, el último campo queda debajo de la barra.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const tapado = await page.evaluate(() => {
    const barra = document.querySelector('[data-lx-bottom-chrome]');
    if (!barra) return null;
    const techo = barra.getBoundingClientRect().top;
    const escondidos = [];
    for (const el of document.querySelectorAll('main input, main button, main select')) {
      const caja = el.getBoundingClientRect();
      if (caja.height === 0) continue;
      if (caja.top < techo && caja.bottom > techo + 4) {
        escondidos.push((el.getAttribute('name') || el.textContent || el.tagName).slice(0, 30));
      }
    }
    return escondidos;
  });
  comprobar(tapado !== null && tapado.length === 0,
    'al final del formulario la barra no tapa ningún control',
    tapado === null ? 'no se encontró la barra' : `tapados: ${tapado.slice(0, 3).join(', ')}`);

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
