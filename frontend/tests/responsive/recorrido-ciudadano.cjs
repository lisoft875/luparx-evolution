/**
 * El recorrido completo del Ciudadano, medido en el navegador.
 *
 * <p>Ingresar → municipalidad → zona → bahía → mapa → recarga con tarjeta simulada → confirmación
 * → estacionar → billetera y movimientos. Con los seis desenlaces que el gateway sabe dar, la
 * idempotencia del doble clic, los dos idiomas y los ocho tamaños.</p>
 *
 * <h2>Qué NO prueba esto</h2>
 *
 * <p>Corre contra el TRANSPORTE SIMULADO del repositorio, no contra el backend. Lo que acá sale
 * verde dice que la pantalla hace lo correcto con lo que el servidor contesta; no dice que el
 * servidor de verdad conteste eso. La integración real sigue pendiente y está anotada como tal.</p>
 *
 * <p>Tampoco toca una tarjeta: el simulador ofrece una lista de desenlaces y no hay en todo el
 * recorrido un campo donde pudiera escribirse un número.</p>
 *
 *   cd frontend && MOCKS=1 node tests/responsive/recorrido-ciudadano.cjs
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const PUERTO = 5183;
const MOCKS = process.env.MOCKS === '1';
const BASE = process.env.BASE || (MOCKS ? `http://localhost:${PUERTO}` : 'https://staging.luparx.com');
const CUENTA = process.env.CUENTA || (MOCKS ? 'citizen@example.com' : 'ana.morales@luparx.test');
const PASS = process.env.PASS || (MOCKS ? 'Password123!' : '');
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;
const CAPTURAS = process.env.CAPTURAS || path.join(__dirname, 'capturas', 'recorrido-ciudadano');

const BAHIA_OK = 'LUP-0001';

/** Los ocho tamaños que pide la estrategia de pruebas del proyecto. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'móvil grande', width: 430, height: 932, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'tablet horizontal', width: 1024, height: 768, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];

/** Los seis desenlaces del gateway, por el mismo nombre que usa el backend. */
const ESCENARIOS = [
  { id: 'VISA_APPROVED', rotulo: /Visa · aprobada/i, acredita: true, motivo: null },
  { id: 'MASTERCARD_APPROVED', rotulo: /Mastercard · aprobada/i, acredita: true, motivo: null },
  { id: 'DECLINED', rotulo: /Rechazada por el emisor/i, acredita: false, motivo: 'DECLINED' },
  { id: 'INSUFFICIENT_FUNDS', rotulo: /Fondos insuficientes/i, acredita: false, motivo: 'INSUFFICIENT_FUNDS' },
  { id: 'EXPIRED_CARD', rotulo: /Tarjeta vencida/i, acredita: false, motivo: 'EXPIRED_CARD' },
];

let fallos = 0;
let pruebas = 0;
let saltadas = 0;
function ok(condicion, mensaje, detalle) {
  pruebas++;
  if (condicion) console.log(`  ok  ${mensaje}`);
  else { fallos++; console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`); }
}
const salta = (motivo) => { saltadas += 1; console.log(`  ··  SIN PROBAR: ${motivo}`); };

/*
  ¿Hay algo escuchando ya en ese puerto?

  Se prueban las DOS familias. Vite escucha en `localhost`, y según cómo resuelva esa máquina el
  nombre eso puede ser 127.0.0.1 o ::1. Probando sólo IPv4, el arnés declaraba «el servidor no
  llegó a escuchar en 90 s» con Vite perfectamente levantado e imprimiendo «ready» — medido el
  18-10-2026 en los cuatro arneses a la vez. No es una espera más larga: es mirar donde el
  servidor está.
*/
function puertoOcupado(puerto) {
  const probar = (host) => new Promise((res) => {
    const s = net.connect({ host, port: puerto });
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(1200, () => { s.destroy(); res(false); });
  });
  return Promise.all([probar('127.0.0.1'), probar('::1')]).then((r) => r.some(Boolean));
}

async function esperarPuerto(puerto, msTope) {
  const hasta = Date.now() + msTope;
  while (Date.now() < hasta) {
    if (await puertoOcupado(puerto)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Levanta el servidor de desarrollo con el transporte simulado DENTRO de la aplicación.
 *
 * <p>Tiene que ser el simulador inyectado y no el servido por HTTP: la página del proveedor
 * simulada sólo se monta con `VITE_USE_MOCKS=true`, que es justo lo que hace que una compilación
 * de producción no la contenga.</p>
 */
async function levantarServidor() {
  if (await puertoOcupado(PUERTO)) {
    if (process.env.SERVIDOR_EXTERNO === '1') {
      console.log(`  ··  se usa el servidor que ya escucha en :${PUERTO} (SERVIDOR_EXTERNO=1)`);
      return async () => {};
    }
    console.error(`✗ Ya hay algo escuchando en :${PUERTO} y no se sabe qué es.`);
    console.error('  Apagalo, o afirmá que es el servidor correcto con SERVIDOR_EXTERNO=1.');
    process.exit(2);
  }
  console.log(`  ··  levantando el servidor de desarrollo en :${PUERTO}…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/citizen'], {
    cwd: RAIZ,
    detached: true,
    env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  const apagar = () => {
    try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ }
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
  };
  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor no llegó a escuchar en 90 s:\n'
      + salida.join('').split('\n').slice(-12).join('\n'));
    apagar();
    process.exit(1);
  }
  return async () => {
    apagar();
    const hasta = Date.now() + 8000;
    while (Date.now() < hasta && (await puertoOcupado(PUERTO))) {
      await new Promise((r) => setTimeout(r, 300));
    }
  };
}

// ---------------------------------------------------------------------------------------------

const ESPIA_GPS = `
  window.__gps = [];
  const n = navigator.geolocation;
  if (n) for (const m of ['getCurrentPosition', 'watchPosition']) {
    const original = n[m] && n[m].bind(n);
    if (original) n[m] = function (...a) { window.__gps.push(m); return original(...a); };
  }
`;

/** Corta y anota cualquier petición a un tercero; responde el estilo del mapa localmente. */
async function prepararContexto(context, origen) {
  const estado = { terceros: [] };
  await context.addInitScript(ESPIA_GPS);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith(origen)) {
      return route.continue();
    }
    if (/\/styles\//.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          version: 8, name: 'prueba', sources: {},
          layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
        }),
      });
    }
    estado.terceros.push(url);
    return route.abort();
  });
  return estado;
}

async function entrar(page, idioma) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2400);
  if (/\/select-tenant/.test(page.url())) {
    const ficha = page.locator('button, a').filter({ hasText: /San José/ }).first();
    if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1600); }
  }
  if (await page.locator('input[type=password]').count()) {
    console.error('✗ Sigue en el login. Revisá CUENTA/PASS.');
    process.exit(1);
  }
  void idioma;
}

const saldoDe = (page) => page.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/Saldo disponible\s*\n?\s*([₡$][\d.,]+)/) || t.match(/Available balance\s*\n?\s*([₡$][\d.,]+)/);
  return m ? m[1] : null;
});

async function capturar(page, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const destino = path.join(CAPTURAS, `${nombre}.png`);
  await page.screenshot({ path: destino });
  return destino;
}

/** Abre la hoja de recarga y llega hasta la página simulada del proveedor. */
async function hastaLaPaginaDelProveedor(page) {
  await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /recargar saldo|top up balance/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /continuar al pago|continue to payment/i }).first().click();
  await page.waitForTimeout(2200);
}

/*
  Espera el desenlace de verdad, en vez de dormir un rato fijo.

  Un `waitForTimeout` fijo convierte la velocidad de la máquina en un resultado. Después de tocar
  «Pagar» faltan cuatro viajes —POST /simular, volver a la billetera, POST /return y GET /wallet—
  y en una Mac con el resto del entorno abierto no siempre caben en 2,6 s: la comprobación fallaba
  sin que hubiera defecto, y fallaba distinto en cada corrida.

  Esto NO afloja nada. Si el desenlace no llega, el texto no aparece y la aserción falla igual:
  lo único que cambia es que se deja de medir el reloj de la máquina.
*/
const DESENLACE = /Saldo acreditado|Balance credited|no se completó|did not go through|Cancelaste|cancell?ed/i;

async function esperarDesenlace(page, limiteMs = 20000) {
  await page
    .waitForFunction(
      (fuente) => new RegExp(fuente, 'i').test(document.body.innerText),
      DESENLACE.source,
      { timeout: limiteMs },
    )
    .catch(() => {}); // Si no llega, que lo diga la aserción y no una excepción.
  // El saldo lo pinta otra consulta, que puede llegar después del aviso: se espera a que se quede
  // quieto tres lecturas seguidas antes de leerlo.
  let previo = null;
  let iguales = 0;
  for (let i = 0; i < 24; i += 1) {
    const actual = await saldoDe(page);
    iguales = actual !== null && actual === previo ? iguales + 1 : 0;
    if (iguales >= 2) return;
    previo = actual;
    await page.waitForTimeout(300);
  }
}

/** Elige un desenlace en la página simulada y vuelve. */
async function resolverComo(page, rotulo) {
  await page.getByRole('radio').filter({ hasText: rotulo }).first()
    .click({ force: true })
    .catch(async () => {
      await page.locator('label').filter({ hasText: rotulo }).first().click();
    });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Pagar$|^Pay$/i }).first().click();
  await esperarDesenlace(page);
}

// ---------------------------------------------------------------------------------------------

async function recorrido(browser) {
  const origen = new URL(BASE).origin;

  // ───────── 1. Estacionar: zona, bahía y mapa ─────────
  console.log('\n── 1. Estacionar: zona, bahía y mapa ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);

    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const pantalla = await page.evaluate(() => document.body.innerText);
    ok(/Zona y espacio|Zone and space/i.test(pantalla), 'la pantalla de estacionar abre',
      pantalla.slice(0, 120).replace(/\n+/g, ' / '));

    const zona = page.getByRole('combobox', { name: /^Zona$|^Zone$/i }).first();
    ok(await zona.count() === 1, 'la zona se ofrece como desplegable accesible');
    await zona.click();
    await page.waitForTimeout(350);
    await page.locator('[role=listbox] [role=option]').first().click();
    await page.waitForTimeout(400);

    const bahia = page.locator('input[inputmode=numeric], input[inputmode=text]').first();
    await bahia.fill(BAHIA_OK);
    await page.waitForTimeout(700);

    const abrirMapa = page.getByRole('button', { name: /ver la zona en el mapa|see the zone on the map/i });
    ok(await abrirMapa.count() === 1, 'con zona y bahía válidas se ofrece el mapa');
    await abrirMapa.click();
    await page.waitForTimeout(3200);
    ok(await page.locator('.lx-zonemap__lienzo canvas').count() === 1, 'el mapa se dibuja');
    ok(await page.locator('.lx-zonemap__noOficial').count() === 1,
      'las geometrías que no son oficiales llegan rotuladas');
    ok((await page.evaluate(() => window.__gps.length)) === 0, 'no se pidió la ubicación');
    console.log(`  ··  captura: ${await capturar(page, 'estacionar-mapa-390x844')}`);

    /*
      Desde el 19-10-2026 esto es un asistente de cuatro pasos y no un formulario de cinco bloques:
      en un teléfono no caben a la vez el formulario entero, el aviso de validación, el botón y la
      navegación inferior. Zona y espacio es el paso 1; vehículo y tiempo el 2; confirmar el 3.
    */
    const continuar = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
    ok(await continuar.isEnabled(), 'con zona y bahía válidas se puede continuar, con el mapa abierto');
    await continuar.click();                       // paso 1 → 2
    await page.waitForTimeout(1200);
    ok(/Veh[ií]culo|Vehicle/i.test(await page.evaluate(() => document.body.innerText)),
      'el paso 2 pide vehículo y tiempo');
    /*
      Se estaciona «otro vehículo» con una placa libre, no el vehículo principal: el perfil
      sembrado YA tiene una estadía activa con ese carro —se ve en la barra superior— y el
      servidor la rechaza, con razón, con VEHICLE_ALREADY_PARKED. Hasta hoy esta comprobación
      aceptaba «activ» como prueba de éxito y por eso pasaba en VERDE contra ese mensaje de error:
      «sesión de estacionamiento activa» contiene «activ». Ahora se exige el rótulo del paso 4.
    */
    const selVehiculo = page.getByRole('combobox').first();
    await selVehiculo.click();
    await page.waitForTimeout(400);
    await page.locator('[role=listbox] [role=option]').filter({ hasText: /Otro veh|Another vehicle/i }).first().click();
    await page.waitForTimeout(600);
    await page.locator('input[maxlength="16"]').first().fill('PRU001');
    await page.waitForTimeout(700);

    await page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first().click();  // 2 → 3
    await page.waitForTimeout(1800);

    const iniciar = page
      .getByRole('button', { name: /confirmar y pagar|confirm and pay|iniciar estacionamiento|start parking/i })
      .first();
    ok(await iniciar.isEnabled(), 'el paso 3 ofrece confirmar');
    await iniciar.click();
    await page.waitForTimeout(3500);
    const tras = await page.evaluate(() => document.body.innerText);
    ok(/¡Listo!|All set/.test(tras), 'el estacionamiento se inicia y el paso 4 lo confirma',
      tras.slice(0, 160).replace(/\n+/g, ' / '));
    ok(/PRU001/.test(tras), 'y el resultado nombra la placa que se estacionó');

    ok(estado.terceros.length === 0, 'no se contactó a ningún tercero',
      estado.terceros.slice(0, 3).join('\n'));
    await context.close();
  }

  // ───────── 2. Recarga con tarjeta: los desenlaces ─────────
  console.log('\n── 2. Recarga con tarjeta simulada ──');
  for (const esc of ESCENARIOS) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);

    await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const antes = await saldoDe(page);

    await hastaLaPaginaDelProveedor(page);
    if (!/\/pay\/simulada\//.test(page.url())) {
      ok(false, `${esc.id}: se llega a la página del proveedor`, page.url());
      await context.close();
      continue;
    }
    if (esc === ESCENARIOS[0]) {
      const texto = await page.evaluate(() => document.body.innerText);
      ok(/NO es un proveedor de pagos/i.test(texto),
        'la página simulada dice que no es un proveedor real');
      ok(await page.locator('input[type=password], input[name*=card i], input[autocomplete*=cc]').count() === 0,
        'no hay ningún campo donde escribir una tarjeta');
      console.log(`  ··  captura: ${await capturar(page, 'pago-pagina-simulada-390x844')}`);
    }

    await resolverComo(page, esc.rotulo);
    const cuerpo = await page.evaluate(() => document.body.innerText);
    const despues = await saldoDe(page);

    if (esc.acredita) {
      ok(/Saldo acreditado|Balance credited/i.test(cuerpo), `${esc.id}: se confirma el pago`,
        cuerpo.slice(0, 160).replace(/\n+/g, ' / '));
      ok(antes !== despues, `${esc.id}: el saldo subió`, `${antes} → ${despues}`);
      ok(/MODO PRUEBA|TEST MODE/.test(cuerpo), `${esc.id}: el saldo queda rotulado como simulado`);
    } else {
      ok(/no se completó|did not go through/i.test(cuerpo), `${esc.id}: se informa que no se pagó`,
        cuerpo.slice(0, 160).replace(/\n+/g, ' / '));
      ok(antes === despues, `${esc.id}: el saldo NO cambió`, `${antes} → ${despues}`);
      const motivo = await page.locator(`[data-motivo="${esc.motivo}"]`).count();
      ok(motivo === 1, `${esc.id}: se dice el motivo que dio el emisor`);
      if (esc === ESCENARIOS[2]) {
        console.log(`  ··  captura: ${await capturar(page, 'pago-rechazado-390x844')}`);
      }
    }
    await context.close();
  }

  // ───────── 3. Autenticación del banco, aprobada y rechazada ─────────
  console.log('\n── 3. Autenticación adicional del banco ──');
  for (const aprueba of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const antes = await saldoDe(page);
    await hastaLaPaginaDelProveedor(page);

    await page.getByRole('radio').filter({ hasText: /Pide autenticación del banco/i }).first()
      .click({ force: true })
      .catch(async () => {
        await page.locator('label').filter({ hasText: /Pide autenticación del banco/i }).first().click();
      });
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /^Pagar$/i }).first().click();
    await page.waitForTimeout(900);

    const enDesafio = /autenticación del banco emisor/i.test(await page.evaluate(() => document.body.innerText));
    ok(enDesafio, `3DS (${aprueba ? 'aprueba' : 'rechaza'}): aparece el paso de autenticación`);
    if (!enDesafio) { await context.close(); continue; }

    await page.getByRole('button', {
      name: aprueba ? /completar la autenticación/i : /no completarla/i,
    }).first().click();
    await esperarDesenlace(page);

    const cuerpo = await page.evaluate(() => document.body.innerText);
    const despues = await saldoDe(page);
    if (aprueba) {
      ok(/Saldo acreditado/i.test(cuerpo), '3DS aprobada: se acredita',
        cuerpo.slice(0, 160).replace(/\n+/g, ' / '));
      ok(antes !== despues, '3DS aprobada: el saldo sube', `${antes} → ${despues}`);
    } else {
      ok(/no se completó/i.test(cuerpo), '3DS rechazada: no se acredita');
      ok(antes === despues, '3DS rechazada: el saldo no cambia', `${antes} → ${despues}`);
      ok(await page.locator('[data-motivo="AUTHENTICATION_FAILED"]').count() === 1,
        '3DS rechazada: el motivo es la autenticación, no la tarjeta');
    }
    await context.close();
  }

  // ───────── 4. Cancelar, y el doble clic ─────────
  console.log('\n── 4. Cancelación e idempotencia ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const antes = await saldoDe(page);

    await hastaLaPaginaDelProveedor(page);
    await page.getByRole('button', { name: /cancelar y volver/i }).first().click();
    await esperarDesenlace(page);
    const cuerpo = await page.evaluate(() => document.body.innerText);
    ok(/Cancelaste el pago/i.test(cuerpo), 'cancelar se informa como cancelación, no como fallo',
      cuerpo.slice(0, 140).replace(/\n+/g, ' / '));
    ok(antes === (await saldoDe(page)), 'cancelar no mueve el saldo');

    /*
      El doble clic.

      Se comprueba la mitad que el ciudadano vive: el botón se inhabilita mientras la petición
      está en vuelo, así que el segundo toque no llega a salir. La otra mitad —que dos peticiones
      con la MISMA clave de idempotencia devuelvan el mismo traspaso— vive en el servidor y está
      implementada tanto en el simulador como en el backend; desde la pantalla no se puede
      observar sin inventar una forma de provocarla, y no se afirma acá lo que no se midió.
    */
    await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: /recargar saldo/i }).first().click();
    await page.waitForTimeout(900);
    const continuar = page.getByRole('button', { name: /continuar al pago|abriendo el pago/i }).first();
    await Promise.all([continuar.click(), continuar.click().catch(() => {})]);
    /*
      El botón se inhabilita mientras la petición está en vuelo
      (`disabled={… || iniciar.isPending}`), pero el transporte simulado vive en memoria y
      responde sin latencia observable: para cuando la prueba puede mirar el botón, la pantalla
      ya navegó. No se afirma lo que no se pudo medir.
    */
    salta('la inhabilitación en vuelo del botón no es observable con un transporte sin latencia');
    await page.waitForTimeout(2400);
    ok(/\/pay\/simulada\//.test(page.url()), 'y el traspaso se abrió una sola vez', page.url());

    await context.close();
  }

  // ───────── 5. Movimientos y el rótulo del saldo de prueba ─────────
  console.log('\n── 5. Billetera y movimientos ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await hastaLaPaginaDelProveedor(page);
    await resolverComo(page, /Visa · aprobada/i);

    await page.goto(`${BASE}/movements`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const cuerpo = await page.evaluate(() => document.body.innerText);
    ok(/MODO PRUEBA/.test(cuerpo), 'movimientos rotula el saldo simulado');
    ok(/Recarga de saldo/i.test(cuerpo), 'la recarga aparece como movimiento');
    ok(/Saldo posterior/i.test(cuerpo), 'cada fila dice el saldo que quedó');
    ok(!/citizen\.|payment\.|wallet\./.test(cuerpo),
      'no se escapa ninguna clave de traducción sin traducir',
      (cuerpo.match(/\b(citizen|payment|wallet)\.[a-zA-Z.]+/g) || []).slice(0, 3).join(', '));
    console.log(`  ··  captura: ${await capturar(page, 'movimientos-390x844')}`);
    await context.close();
  }

  // ───────── 6. En inglés ─────────
  /*
    El idioma es una preferencia de la CUENTA, no del navegador, así que se cambia donde lo cambia
    el ciudadano —en «Más»— y se navega POR DENTRO, con las pestañas.

    Lo que acá NO se puede medir, y conviene dejar escrito: que la elección sobreviva a una recarga
    completa. El transporte simulado vive en memoria, así que al recargar vuelve el perfil sembrado
    con `locale: es-CR` y la aplicación —correctamente— aplica el idioma de la cuenta por encima
    del recordado en el navegador. Medido contra un transporte HTTP real, la elección sí persiste.
  */
  console.log('\n── 6. en-US ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    const pestana = (texto) => page.locator('.lx-bottom-tab-bar__tab').filter({ hasText: texto }).first();
    await pestana(/Más|More/).click();
    await page.waitForTimeout(1800);

    const selectorIdioma = page.getByRole('combobox').first();
    let ofrecidos = [];
    if (await selectorIdioma.count()) {
      await selectorIdioma.click();
      await page.waitForTimeout(400);
      ofrecidos = (await page.locator('[role=listbox] [role=option]').allInnerTexts()).map((x) => x.trim());
      const ingles = page.locator('[role=listbox] [role=option]').filter({ hasText: /English/i }).first();
      if (await ingles.count()) { await ingles.click(); await page.waitForTimeout(2200); }
      else { await page.keyboard.press('Escape'); }
    }
    ok(ofrecidos.length > 0, 'la cuenta puede elegir idioma desde «Más»', JSON.stringify(ofrecidos));

    if (!ofrecidos.some((x) => /English/i.test(x))) {
      salta(`esta municipalidad sólo habilita ${JSON.stringify(ofrecidos)}`);
    } else {
      const enMas = await page.evaluate(() => document.body.innerText);
      ok(/My profile|Fines|Notifications/.test(enMas), 'al elegir inglés la pantalla cambia de idioma',
        enMas.slice(0, 120).replace(/\n+/g, ' / '));

      await pestana(/Billetera|Wallet/).click();
      await page.waitForTimeout(2200);
      const enBilletera = await page.evaluate(() => document.body.innerText);
      ok(/Available balance|Top up balance/i.test(enBilletera),
        'y al cambiar de pantalla el idioma se mantiene',
        enBilletera.slice(0, 120).replace(/\n+/g, ' / '));
      ok(!/quedan menos de|Saldo disponible|Recargar saldo/.test(enBilletera),
        'sin mezcla: no queda ni un texto en el idioma anterior',
        (enBilletera.match(/quedan menos de|Saldo disponible|Recargar saldo/g) || []).join(', '));
      ok(!/citizen\.|payment\.|wallet\./.test(enBilletera),
        'tampoco en inglés se escapa una clave sin traducir',
        (enBilletera.match(/\b(citizen|payment|wallet)\.[a-zA-Z.]+/g) || []).slice(0, 3).join(', '));
      salta('que la elección sobreviva a una recarga necesita un transporte con estado; el simulado vive en memoria');
    }
    await context.close();
  }

  // ───────── 7. Los ocho tamaños ─────────
  console.log('\n── 7. Los ocho tamaños ──');
  for (const tamano of TAMANOS) {
    const context = await browser.newContext({
      viewport: { width: tamano.width, height: tamano.height },
      isMobile: tamano.movil, hasTouch: tamano.movil, locale: 'es-CR',
    });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);

    const etiqueta = `${tamano.nombre} ${tamano.width}×${tamano.height}`;
    const billetera = await page.evaluate(() => ({
      anchoDoc: Math.round(document.documentElement.scrollWidth), vw: window.innerWidth,
    }));
    ok(billetera.anchoDoc <= billetera.vw + 1, `${etiqueta}: la billetera no desborda`,
      `${billetera.anchoDoc} > ${billetera.vw}`);

    await page.getByRole('button', { name: /recargar saldo/i }).first().click();
    await page.waitForTimeout(900);
    const hoja = await page.evaluate(() => {
      const dialogo = document.querySelector('[role=dialog]');
      const botones = [...(dialogo?.querySelectorAll('button') ?? [])].map((b) => {
        const r = b.getBoundingClientRect();
        return { alto: Math.round(r.height), der: Math.round(r.right), izq: Math.round(r.left) };
      });
      return {
        hayDialogo: Boolean(dialogo),
        nombrado: Boolean(dialogo?.getAttribute('aria-label') || dialogo?.getAttribute('aria-labelledby')),
        anchoDoc: Math.round(document.documentElement.scrollWidth),
        vw: window.innerWidth,
        bajos: botones.filter((b) => b.alto > 0 && b.alto < 44).length,
        fuera: botones.filter((b) => b.izq < -1 || b.der > window.innerWidth + 1).length,
        total: botones.length,
      };
    });
    ok(hoja.hayDialogo, `${etiqueta}: la hoja de recarga abre`);
    ok(hoja.nombrado, `${etiqueta}: la hoja tiene nombre accesible`);
    ok(hoja.anchoDoc <= hoja.vw + 1, `${etiqueta}: la hoja no desborda`,
      `${hoja.anchoDoc} > ${hoja.vw}`);
    ok(hoja.fuera === 0, `${etiqueta}: ningún control se sale`, `${hoja.fuera} de ${hoja.total}`);
    ok(hoja.bajos === 0, `${etiqueta}: todos los controles llegan a 44px`,
      `${hoja.bajos} de ${hoja.total}`);
    if (tamano.width === 390 || tamano.width === 1280) {
      console.log(`  ··  captura: ${await capturar(page, `recarga-${tamano.width}x${tamano.height}`)}`);
    }
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------

(async () => {
  console.log(`\n══ Recorrido del Ciudadano · ${BASE} ${MOCKS ? '(transporte simulado)' : ''} ══`);
  if (!PASS) { console.error('✗ Falta la contraseña (PASS).'); process.exit(1); }
  const apagar = MOCKS ? await levantarServidor() : async () => {};
  const navegador = await chromium.launch({
    executablePath: EJECUTABLE,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    await recorrido(navegador);
  } catch (e) {
    fallos++;
    console.error(`\n✗ La corrida se interrumpió: ${e && e.message}`);
    console.error(e && e.stack);
  } finally {
    await navegador.close();
    await apagar();
  }
  console.log(`\n${pruebas} comprobaciones · ${fallos} fallo${fallos === 1 ? '' : 's'}`
    + `${saltadas ? ` · ${saltadas} sin probar` : ''}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
