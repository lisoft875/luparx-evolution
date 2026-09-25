/**
 * El alta de un funcionario, de extremo a extremo — la incidencia P1 del 25-09-2026.
 *
 * <h2>Qué contesta este arnés que una captura de pantalla no</h2>
 *
 * <p>Lo reportado fue «pulsé Crear y enviar el correo, el control mostró un estado de acción no
 * disponible, y el usuario no apareció». Eso puede ser cuatro cosas distintas —una validación que
 * bloquea en silencio, un botón deshabilitado por una condición, una petición que nunca sale, o una
 * que sale y falla— y desde la pantalla las cuatro se ven igual: no pasa nada.</p>
 *
 * <p>Así que el arnés mira lo que la pantalla no muestra: si sale una petición, con qué responde, y
 * si después el registro está. La §3 del informe pide exactamente eso en sus pasos 3, 4 y 5, y lo
 * pide como trabajo de una persona con la pestaña Network abierta. Acá corre solo.</p>
 *
 * <h2>Qué escribe en staging</h2>
 *
 * <p>Un usuario, uno solo, siempre el mismo: {@code qa.altas@luparx.test}. La primera corrida lo
 * crea —y de paso comprueba el camino feliz completo—; las siguientes encuentran que ya existe y
 * comprueban el otro caso que la §5 pide, el del correo repetido. No acumula cuentas.</p>
 *
 * <p>La fase 1 no escribe nada: envía el formulario VACÍO, que es la que de verdad reproduce lo
 * reportado.</p>
 *
 *   PASS='...' node tests/responsive/alta-de-usuarios.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

const CORREO = 'qa.altas@luparx.test';
const PERSONA = {
  nombre: 'Prueba',
  apellido: 'Automatizada',
  documento: '117890456',
  telefono: '88887777',
  nacimiento: '1990-05-14',
  direccion: 'Cien metros al sur de la iglesia',
};

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
function dato(mensaje) {
  console.log(`  ·   ${mensaje}`);
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/admin/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}.`);
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

/**
 * Elige una opción de un desplegable por su etiqueta. Devuelve lo elegido, o null.
 *
 * <p>`exacto` no es un adorno: Playwright empareja el nombre accesible por SUBCADENA, así que
 * «País» también encuentra «País emisor del documento» — y como esa tarjeta va primero en el
 * documento, `.first()` habría elegido siempre la equivocada. Un arnés que llena el campo de al
 * lado pasa o falla por la razón que no es.</p>
 */
async function elegirPrimera(page, etiqueta, preferida, exacto = false) {
  const combo = page.getByRole('combobox', { name: etiqueta, exact: exacto }).first();
  if ((await combo.count()) === 0) return null;
  await combo.click();
  await page.waitForTimeout(400);
  const opciones = page.getByRole('option');
  if ((await opciones.count()) === 0) {
    await page.keyboard.press('Escape');
    return null;
  }
  const elegida = preferida
    ? opciones.filter({ hasText: new RegExp(preferida, 'i') }).first()
    : opciones.first();
  const objetivo = (await elegida.count()) > 0 ? elegida : opciones.first();
  const texto = (await objetivo.textContent())?.trim() ?? '';
  await objetivo.click();
  await page.waitForTimeout(700);
  return texto;
}

/** Lo que la pantalla le está diciendo a la persona ahora mismo. */
async function loQueDice(page) {
  return page.evaluate(() => ({
    alertas: [...document.querySelectorAll('.lx-alert, [role="alert"]')].map((n) =>
      (n.textContent ?? '').trim(),
    ),
    erroresDeCampo: [...document.querySelectorAll('.lx-field__error, [id$="-error"]')].map((n) => ({
      texto: (n.textContent ?? '').trim(),
      visible: n.getBoundingClientRect().top >= 0 && n.getBoundingClientRect().top <= window.innerHeight,
    })),
    scrollY: Math.round(window.scrollY),
    botonDeshabilitado: (() => {
      const b = [...document.querySelectorAll('button[type="submit"]')].pop();
      return b ? b.disabled : null;
    })(),
  }));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 1536, height: 960 },
  });

  console.log(`\n${BASE}/admin/users/new · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 200));
  });
  /** Toda petición de alta que salga, con su respuesta. */
  const altas = [];
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && /\/admin\/users(\?|$)/.test(res.url())) {
      let cuerpo = '';
      try {
        cuerpo = (await res.text()).slice(0, 300);
      } catch {
        cuerpo = '(sin cuerpo)';
      }
      altas.push({ status: res.status(), cuerpo });
    }
  });

  // ===============================================================================================
  // FASE 1 · El formulario vacío. No escribe nada, y es la que reproduce lo reportado.
  // ===============================================================================================
  console.log('── §3 pasos 1-3 · qué pasa al pulsar con el formulario incompleto ──');
  await page.goto(`${BASE}/admin/users/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const boton = page.getByRole('button', { name: 'Crear y enviar el correo' }).first();
  comprobar((await boton.count()) > 0, 'el formulario de alta carga y tiene su botón');
  if ((await boton.count()) === 0) {
    await browser.close();
    process.exit(1);
  }

  const antesDeClic = await loQueDice(page);
  comprobar(
    antesDeClic.botonDeshabilitado === false,
    'el botón NO está deshabilitado antes de tocar nada',
    `disabled=${antesDeClic.botonDeshabilitado}`,
  );

  altas.length = 0;
  await boton.click();
  await page.waitForTimeout(1800);
  const trasClicVacio = await loQueDice(page);

  dato(`peticiones de alta que salieron: ${altas.length}`);
  dato(`alertas en pantalla: ${trasClicVacio.alertas.length ? trasClicVacio.alertas.join(' | ') : '(ninguna)'}`);
  dato(`errores de campo marcados: ${trasClicVacio.erroresDeCampo.length}`);
  dato(`de ésos, visibles sin desplazarse: ${trasClicVacio.erroresDeCampo.filter((e) => e.visible).length}`);
  dato(`la página se desplazó a: ${trasClicVacio.scrollY}px`);

  comprobar(
    altas.length === 0,
    'con el formulario vacío NO se manda una petición de alta',
    `salieron ${altas.length}`,
  );
  // Éste es el corazón del informe: «el sistema debe señalar exactamente qué campo impide continuar».
  comprobar(
    trasClicVacio.erroresDeCampo.length > 0,
    'la validación marca los campos que faltan',
    'ningún campo quedó marcado: el clic no produjo NADA',
  );
  comprobar(
    trasClicVacio.alertas.length > 0 || trasClicVacio.erroresDeCampo.some((e) => e.visible),
    'y algo de eso es VISIBLE sin tener que buscarlo',
    'hay errores marcados pero todos fuera de la vista, y ningún aviso arriba:'
      + ' desde la silla de quien pulsa, el botón no hizo nada',
  );

  // ===============================================================================================
  // FASE 2 · Llenar el formulario entero
  // ===============================================================================================
  console.log('── §3 pasos 4-8 · el alta completa ──');

  // ¿Ya existe de una corrida anterior?
  await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(CORREO)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  const yaExiste = (await page.locator('tbody tr').filter({ hasText: CORREO }).count()) > 0;
  dato(yaExiste
    ? `${CORREO} ya existe: se comprueba el camino del correo repetido (§5)`
    : `${CORREO} no existe: se comprueba el camino feliz (§5)`);

  await page.goto(`${BASE}/admin/users/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const rol = await elegirPrimera(page, 'Rol', 'Fiscalizador', true);
  comprobar(rol !== null, `se puede elegir un rol (${rol ?? 'ninguno'})`);
  await page.getByLabel('Correo electrónico').fill(CORREO);
  await page.getByLabel('Nombre', { exact: true }).fill(PERSONA.nombre);
  await page.getByLabel('Primer apellido').fill(PERSONA.apellido);

  const paisDoc = await elegirPrimera(page, 'País emisor del documento', 'Costa Rica');
  const tipoDoc = await elegirPrimera(page, 'Tipo de documento');
  comprobar(paisDoc !== null && tipoDoc !== null, `documento: ${paisDoc} / ${tipoDoc}`);
  await page.getByLabel('Número de documento').fill(PERSONA.documento);

  const paisDir = await elegirPrimera(page, 'País', 'Costa Rica', true);
  comprobar(paisDir !== null, `país de la dirección: ${paisDir}`);
  // Los niveles dependen del país: en Costa Rica son Provincia, Cantón y Distrito, y cada uno se
  // carga cuando el anterior tiene valor. Se recorren en orden y se toma la primera opción.
  const niveles = [];
  for (const nivel of ['Provincia', 'Cantón', 'Distrito']) {
    const elegido = await elegirPrimera(page, nivel);
    if (elegido) niveles.push(`${nivel}=${elegido}`);
  }
  dato(`niveles de dirección: ${niveles.join(' · ') || '(ninguno)'}`);
  await page.getByLabel('Dirección (línea 1)').fill(PERSONA.direccion);
  await page.getByLabel('Número de teléfono').fill(PERSONA.telefono);
  const nacionalidad = await elegirPrimera(page, 'Nacionalidad', 'Costa Rica');
  dato(`nacionalidad: ${nacionalidad ?? '(no se pudo elegir)'}`);
  await page.getByLabel('Fecha de nacimiento').fill(PERSONA.nacimiento);
  await page.waitForTimeout(600);

  altas.length = 0;
  const botonLleno = page.getByRole('button', { name: 'Crear y enviar el correo' }).first();
  await botonLleno.click();
  await page.waitForTimeout(4000);

  const trasEnviar = await loQueDice(page);
  const respuesta = altas[0];

  dato(`peticiones de alta: ${altas.length}${respuesta ? ` · respuesta ${respuesta.status}` : ''}`);
  if (respuesta && respuesta.status >= 400) dato(`cuerpo: ${respuesta.cuerpo}`);
  dato(`alertas: ${trasEnviar.alertas.length ? trasEnviar.alertas.join(' | ') : '(ninguna)'}`);
  dato(`errores de campo: ${trasEnviar.erroresDeCampo.map((e) => e.texto).join(' | ') || '(ninguno)'}`);
  dato(`url tras enviar: ${page.url().replace(BASE, '')}`);

  comprobar(
    altas.length >= 1,
    'con el formulario completo SÍ sale la petición de alta',
    'no salió ninguna: algo la bloquea antes de la red — es el paso 3 del informe',
  );

  if (yaExiste) {
    comprobar(
      respuesta !== undefined && respuesta.status >= 400,
      'un correo ya registrado se rechaza',
      respuesta ? `respondió ${respuesta.status}` : 'no hubo respuesta',
    );
    comprobar(
      trasEnviar.alertas.some((a) => /correo|registrad|existe/i.test(a)),
      'y la pantalla dice cuál es el dato repetido, no un error genérico',
      trasEnviar.alertas.join(' | ') || '(ninguna alerta)',
    );
  } else if (respuesta && respuesta.status < 400) {
    comprobar(true, `el alta responde ${respuesta.status}`);
    comprobar(
      /\/users\/[0-9a-f-]{8,}/.test(page.url()),
      'y la pantalla lleva al usuario recién creado',
      `url=${page.url().replace(BASE, '')}`,
    );
    // §5: «confirmar que el usuario persiste después de recargar la página».
    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(CORREO)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    comprobar(
      (await page.locator('tbody tr').filter({ hasText: CORREO }).count()) > 0,
      'y aparece en el listado al volver',
      'no aparece: o el filtro activo lo esconde, o no se guardó',
    );
  } else {
    comprobar(false, 'el alta falló', respuesta ? `${respuesta.status} · ${respuesta.cuerpo}` : 'sin respuesta');
  }

  comprobar(
    erroresJs.length === 0,
    'el flujo no deja errores de JavaScript sin controlar (§5)',
    erroresJs.join(' | '),
  );

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
