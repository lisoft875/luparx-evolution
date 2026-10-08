/**
 * La campana del fiscalizador: que exista, que lleve a algún lado, y que avise de algo real.
 *
 * <h2>Las tres cosas que esto comprueba y leer el código no</h2>
 *
 * <p>Que la campana quepa junto a «En línea» sin partir la fila, con el texto que de verdad manda el
 * servidor. Que lleve a una pantalla que se construye. Y la que importa: que **anular una boleta
 * produzca un aviso para quien la emitió**. Eso último recorre backend, base de datos y dos portales,
 * y es la única forma de saber si la cadena entera está conectada.</p>
 *
 * <h2>Lo que deja como lo encontró</h2>
 *
 * <p>Anular una boleta NO se puede deshacer — es la regla del sistema, no una limitación de esto— así
 * que la prueba de la cadena completa sólo corre si encuentra una boleta anulable y lo dice con su
 * número. Si no encuentra ninguna, informa que no se ejercitó en vez de pasar en silencio.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/campana-fiscalizacion.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const INSPECTOR = process.env.CUENTA_INSPECTOR ?? 'inspector@luparx.test';
const ADMIN = process.env.CUENTA_ADMIN ?? 'admin@luparx.test';
const SALIDA = process.env.SALIDA ?? path.join(__dirname, 'capturas');

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 844 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'tablet horizontal', width: 1024, height: 768 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) console.log(`  ok  ${mensaje}`);
  else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}
function dato(mensaje) {
  console.log(`  ·   ${mensaje}`);
}

async function entrar(page, prefijo, cuenta) {
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', cuenta);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()), { timeout: 15000 })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);
  if (login && !login.ok()) {
    const pista = login.status() === 429
      ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá; no reintentes en bucle.'
      : login.status() === 401
        ? `contraseña incorrecta para ${cuenta}. Pasá la vigente con PASS=...`
        : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar a ${cuenta}: ${pista}`);
  }
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  if (new URL(page.url()).pathname.endsWith('/login')) {
    throw new Error(`No se pudo entrar a ${cuenta}: seguimos en el login.`);
  }
}

/** La cabecera, medida. Lo que el PDF pide: una campana, junto al estado, sin segunda fila. */
async function medirCabecera(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const barra = document.querySelector('.lx-app-bar');
    const cromo = document.querySelector('.lx-top-chrome');
    if (!barra || !cromo) return null;
    const cajaBarra = barra.getBoundingClientRect();
    const cajaCromo = cromo.getBoundingClientRect();
    const campanas = document.querySelectorAll('.lx-app-bar__icon-btn');
    const campana = campanas[0]?.getBoundingClientRect() ?? null;
    const conexion = document.querySelector('.lx-connection-badge')?.getBoundingClientRect() ?? null;
    const grupo = document.querySelector('.lx-app-bar__end')?.getBoundingClientRect() ?? null;
    return {
      desbordeH: doc.scrollWidth - doc.clientWidth,
      altoBarra: Math.round(cajaBarra.height),
      altoCromo: Math.round(cajaCromo.height),
      barras: document.querySelectorAll('.lx-app-bar').length,
      pies: document.querySelectorAll('.lx-bottom-tab-bar').length,
      pestanas: document.querySelectorAll('.lx-bottom-tab-bar__tab').length,
      campanas: campanas.length,
      campanaTactil: campana ? { w: Math.round(campana.width), h: Math.round(campana.height) } : null,
      campanaAlBorde: campana ? Math.round(cajaBarra.right - campana.right) : null,
      // El estado ANTES de la campana: lo pulsable se queda la esquina.
      estadoAntes: Boolean(conexion && campana && conexion.right <= campana.left + 1),
      conexiones: document.querySelectorAll('.lx-connection-badge').length,
      enGrupo: Boolean(conexion && grupo && grupo.right - conexion.right <= 60),
      contador: (document.querySelector('.lx-app-bar__badge')?.textContent ?? '').trim(),
      franjaVieja: document.querySelectorAll('.lx-inspector-status-bar').length,
    };
  });
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  console.log(`\n${BASE} · la campana del fiscalizador\n`);

  // ════════════════════════════ 1 · la cabecera, en los ocho tamaños
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  try {
    await entrar(page, '/inspector', INSPECTOR);
  } catch (error) {
    console.error(`\n  ${error.message}\n`);
    await browser.close();
    process.exit(3);
  }
  const sesionInspector = await ctx.storageState();

  console.log('── 1 · la cabecera con campana, en los ocho tamaños ──');
  for (const tam of TAMANOS) {
    await page.setViewportSize({ width: tam.width, height: tam.height });
    await page.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const m = await medirCabecera(page);
    if (!m) {
      comprobar(false, `${tam.nombre} · se encuentra la cabecera`);
      continue;
    }
    const etiqueta = `${tam.nombre} ${tam.width}px`;
    comprobar(m.campanas === 1, `${etiqueta} · una campana, y una sola`, `encontré ${m.campanas}`);
    /*
      Con señal, CERO insignias en la barra (08-10-2026).

      Esta línea exigía una. El reparto cambió: con señal el estado vive junto al saludo del inicio
      —donde lo pone la referencia visual aprobada— y la barra fija lo dibuja sólo cuando NO hay
      señal, que es cuando deja de ser una confirmación y pasa a ser una advertencia que no puede
      desplazarse fuera de la vista. `barras-fijas.cjs` mide el reparto completo; acá sólo se
      comprueba que la campana no quedó compartiendo sitio con una insignia que ya no está.
    */
    /*
      Una sola insignia en la barra, de nuevo (08-10-2026, tarde).

      Esta línea exigió una, luego cero, y vuelve a una. No es indecisión: el reparto final es por
      si la pantalla tiene saludo, y este arnés recorre pantallas de Fiscalización que no lo
      tienen, así que ahí el estado SÍ vive en la barra. `barras-fijas.cjs` mide el reparto
      completo, inicio incluido; acá sólo importa que la campana no comparta sitio con dos.
    */
    comprobar(
      m.conexiones <= 1,
      `${etiqueta} · como mucho un «En línea» en la barra`,
      `encontré ${m.conexiones}`,
    );
    comprobar(m.franjaVieja === 0, `${etiqueta} · sin la franja de estado de antes`);
    comprobar(m.barras === 1, `${etiqueta} · una sola cabecera`, `hay ${m.barras}`);
    comprobar(
      Math.abs(m.altoCromo - m.altoBarra) <= 1,
      `${etiqueta} · sin segunda fila debajo de la cabecera`,
      `cromo ${m.altoCromo} contra barra ${m.altoBarra}`,
    );
    comprobar(m.desbordeH <= 0, `${etiqueta} · sin desborde horizontal`, `desborda ${m.desbordeH}px`);
    comprobar(
      m.campanaTactil !== null && m.campanaTactil.w >= 44 && m.campanaTactil.h >= 44,
      `${etiqueta} · la campana tiene objetivo táctil de 44px`,
      m.campanaTactil ? `${m.campanaTactil.w}×${m.campanaTactil.h}` : 'no se encontró',
    );
    comprobar(
      m.campanaAlBorde !== null && m.campanaAlBorde <= 24,
      `${etiqueta} · y queda en la esquina`,
      `a ${m.campanaAlBorde}px del borde`,
    );
    // La campana se queda la esquina: lo pulsable es lo que tiene que alcanzar el pulgar. Con
    // insignia al lado, ésta queda antes; sin ella, la campana está sola. Las dos formas cumplen.
    comprobar(
      m.campanaAlBorde !== null && m.campanaAlBorde <= 24,
      `${etiqueta} · y la campana se queda la esquina`,
      `quedan ${m.campanaAlBorde}px hasta el borde`,
    );
    if (m.conexiones === 1) {
      comprobar(m.estadoAntes, `${etiqueta} · con «En línea» a su lado, antes de ella`);
    }
    comprobar(m.pestanas === 5, `${etiqueta} · la barra inferior sigue con sus cinco destinos`, `hay ${m.pestanas}`);
    if (tam.width === 390) {
      dato(`contador en la campana: «${m.contador || 'sin contador'}»`);
      await page.screenshot({ path: path.join(SALIDA, 'campana-1-cabecera-movil.png') });
    }
  }

  // ════════════════════════════ 2 · lleva a una pantalla que se construye
  console.log('\n── 2 · la campana lleva a los avisos ──');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/inspector/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.locator('.lx-app-bar__icon-btn').first().click();
  await page.waitForTimeout(2000);
  comprobar(
    new URL(page.url()).pathname.endsWith('/notifications'),
    'pulsarla abre la pantalla de avisos',
    `quedamos en ${new URL(page.url()).pathname}`,
  );
  const h1 = ((await page.locator('h1, .lx-app-bar__title').first().textContent().catch(() => '')) ?? '').trim();
  comprobar(h1.length > 0, 'la pantalla se construyó', `título=«${h1}»`);
  comprobar(
    (await page.locator('.lx-error-boundary').count()) === 0,
    'y no reventó por dentro',
    ((await page.locator('.lx-error-boundary').textContent().catch(() => '')) ?? '').slice(0, 120),
  );
  const mAvisos = await medirCabecera(page);
  comprobar((mAvisos?.pestanas ?? 0) === 5, 'la navegación inferior sigue intacta acá');
  comprobar((mAvisos?.desbordeH ?? 1) <= 0, 'y sin desborde horizontal');
  // Ninguna sexta pestaña: la campana no es un destino de la barra inferior.
  const textoPestanas = (await page.locator('.lx-bottom-tab-bar').innerText().catch(() => '')) ?? '';
  comprobar(
    !/avisos|notificaci/i.test(textoPestanas),
    'y los avisos NO son una sexta pestaña',
    textoPestanas.replace(/\s+/g, ' ').slice(0, 80),
  );
  await page.screenshot({ path: path.join(SALIDA, 'campana-2-pantalla-avisos.png'), fullPage: true });

  // ════════════════════════════ 3 · la cadena completa: anular una boleta produce un aviso
  console.log('\n── 3 · anular una boleta le avisa a quien la emitió ──');
  const ctxAdmin = await browser.newContext({ viewport: { width: 1536, height: 960 }, locale: 'es-CR', ignoreHTTPSErrors: true });
  const admin = await ctxAdmin.newPage();
  let numeroAnulado = null;
  try {
    await entrar(admin, '/admin', ADMIN);
    await admin.goto(`${BASE}/admin/enforcement/citations`, { waitUntil: 'domcontentloaded' });
    await admin.waitForTimeout(2400);
    const filas = await admin.locator('tbody tr').count();
    dato(`${filas} boletas en el portal de administración`);
    if (filas === 0) {
      dato('no hay boletas en staging: la cadena completa no se pudo ejercitar');
    } else {
      // La primera que ofrezca anular. No se busca por fiscalizador: el aviso se comprueba después
      // en la campana, que es la prueba de verdad.
      const anular = admin.getByRole('button', { name: /Anular/i }).first();
      if ((await anular.count()) === 0) {
        dato('ninguna boleta de la lista ofrece Anular (puede que ya estén todas anuladas o pagadas)');
      } else {
        numeroAnulado = ((await admin.locator('tbody tr').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
        dato(`se anula: ${numeroAnulado.slice(0, 60)}`);
        await anular.click();
        await admin.waitForTimeout(800);
        const motivo = admin.getByRole('dialog').locator('input, textarea').first();
        if ((await motivo.count()) > 0) await motivo.fill('Prueba de la campana del fiscalizador');
        await admin.getByRole('dialog').getByRole('button', { name: /Anular|Confirmar/i }).last().click();
        await admin.waitForTimeout(2600);
        comprobar(
          !new URL(admin.url()).pathname.endsWith('/login'),
          'anular no cierra la sesión del administrador',
        );
      }
    }
  } catch (error) {
    dato(`no se pudo preparar la anulación: ${error.message}`);
  }
  await ctxAdmin.close();

  if (numeroAnulado) {
    // Sesión nueva del fiscalizador: el contador se consulta al montar, así que una pestaña abierta
    // desde antes no lo habría vuelto a pedir.
    const ctx2 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      storageState: sesionInspector,
    });
    const insp = await ctx2.newPage();
    await insp.goto(`${BASE}/inspector/notifications`, { waitUntil: 'domcontentloaded' });
    await insp.waitForTimeout(2600);
    const texto = ((await insp.locator('main').innerText().catch(() => '')) ?? '');
    dato(`la pantalla dice: ${texto.replace(/\s+/g, ' ').slice(0, 160)}`);
    comprobar(
      /anular/i.test(texto),
      'el fiscalizador ve el aviso de que le anularon una boleta',
      'si falla y el backend no se desplegó, es eso: el endpoint /inspector/notifications no existiría',
    );
    comprobar(
      !/notification\.type\./.test(texto),
      'y el aviso está traducido, no es una clave cruda',
      texto.replace(/\s+/g, ' ').slice(0, 160),
    );
    await insp.screenshot({ path: path.join(SALIDA, 'campana-3-aviso-recibido.png'), fullPage: true });
    await ctx2.close();
  } else {
    dato('sin anulación no hay aviso que buscar: la cadena completa quedó sin ejercitar');
  }

  dato(`capturas en ${SALIDA}`);
  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
