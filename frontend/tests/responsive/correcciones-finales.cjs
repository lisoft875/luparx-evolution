/**
 * Las correcciones finales del 05-10 y los dos prompts del 06-10, medidas.
 *
 * <h2>Qué cubre</h2>
 *
 * <ol>
 *   <li><b>Conciliación</b>: que el verde no aparezca sin conciliación, y que las cuatro cifras
 *       cierren — «Cobrado» tiene que ser la suma de confirmado, sin confirmar y fuera de corte.</li>
 *   <li><b>Auditoría</b>: que un cambio real del formato de espacios deje su antes/después, y no
 *       «Sin cambios en los datos».</li>
 *   <li><b>Código de espacio</b>: que el error de rango se vaya al corregir, sin guardar.</li>
 *   <li><b>Roles</b>: que «X de N permisos» coincida exactamente con lo desplegado.</li>
 *   <li><b>Reportes</b>: selector de tipo y rango, sin opciones que el servidor no responda.</li>
 *   <li><b>Ciudadano</b>: cabecera en Vehículos, Billetera y Más, sin duplicarla ni perder la
 *       navegación inferior.</li>
 * </ol>
 *
 * <h2>Lo que escribe</h2>
 *
 * <p>Una sola cosa: el formato del código de espacio de la municipalidad de prueba, que cambia y
 * DEVUELVE a su valor original. Es la única forma de comprobar que la bitácora guarda el antes y el
 * después, porque hace falta un cambio real que auditar.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/correcciones-finales.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const ADMIN = process.env.CUENTA ?? 'admin@luparx.test';
const CIUDADANO = process.env.CUENTA_CITIZEN ?? 'ana.morales@luparx.test';

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
];

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

async function entrar(page, prefijo, cuenta) {
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', cuenta);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);
  if (login && !login.ok()) {
    const pista =
      login.status() === 429
        ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá; no reintentes en bucle.'
        : login.status() === 401
          ? `contraseña incorrecta para ${cuenta}. Pasá la vigente con PASS=...`
          : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar: ${pista}`);
  }
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
  }
  if (!page.url().includes('/login')) return;
  throw new Error('No se pudo entrar: seguimos en el formulario de login.');
}

/** Una pantalla que reventó NO es una pantalla sana: el ErrorBoundary la convierte en contenido. */
async function salud(page) {
  return page.evaluate(() => ({
    reventada: Boolean(document.querySelector('.lx-error-boundary')),
    mensaje: (document.querySelector('.lx-error-boundary__detail')?.textContent ?? '').trim().slice(0, 140),
    h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 48),
  }));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  console.log(`\n${BASE} · correcciones finales · ${ADMIN}\n`);
  try {
    await entrar(page, '/admin', ADMIN);
  } catch (error) {
    console.error(`\n  ${error.message}\n`);
    await browser.close();
    process.exit(3);
  }

  // ===============================================================================================
  // 1 · CONCILIACIÓN
  // ===============================================================================================
  console.log('── 1 · conciliación: el verde sólo cuando hay algo conciliado ──');

  const totales = page
    .waitForResponse((r) => r.url().includes('/admin/billing/totals'), { timeout: 15000 })
    .catch(() => null);
  await page.goto(`${BASE}/admin/billing`, { waitUntil: 'domcontentloaded' });
  const respuestaTotales = await totales;
  await page.waitForTimeout(2600);

  const estadoSalud = await salud(page);
  comprobar(!estadoSalud.reventada, 'la pantalla de conciliación se construyó', estadoSalud.mensaje);

  let cifras = null;
  if (respuestaTotales) {
    try {
      cifras = await respuestaTotales.json();
    } catch {
      cifras = null;
    }
  }

  if (cifras) {
    const minor = (m) => (m && typeof m.amountMinor === 'number' ? m.amountMinor : null);
    const cobrado = minor(cifras.capturedGross);
    const confirmado = minor(cifras.settledGross);
    const sinConfirmar = minor(cifras.unsettledGross);
    const fuera = minor(cifras.notApplicableGross);
    const cortes = cifras.settlementsInPeriod;
    dato(`cobrado ${cobrado} · confirmado ${confirmado} · sin confirmar ${sinConfirmar} · fuera de corte ${fuera} · cortes ${cortes}`);

    comprobar(
      fuera !== null,
      'el servidor informa cuánto queda fuera de todo corte',
      'falta `notApplicableGross`: sin ese dato las cuatro cifras no pueden cerrar',
    );
    comprobar(
      typeof cortes === 'number',
      'y cuántos cortes cubren el período',
      'falta `settlementsInPeriod`: sin eso no se distingue «todo conciliado» de «no hay nada que conciliar»',
    );
    // La comprobación que de verdad importa: que las cuentas cierren.
    if (cobrado !== null && confirmado !== null && sinConfirmar !== null && fuera !== null) {
      comprobar(
        cobrado === confirmado + sinConfirmar + fuera,
        'las cuatro cifras cierran: cobrado = confirmado + sin confirmar + fuera de corte',
        `${cobrado} ≠ ${confirmado} + ${sinConfirmar} + ${fuera} = ${confirmado + sinConfirmar + fuera}`,
      );
    }

    const anuncio = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="billing-state"]');
      if (!n) return null;
      return {
        texto: (n.textContent ?? '').trim(),
        verde: n.className.includes('lx-alert--success'),
      };
    });
    comprobar(anuncio !== null, 'la pantalla anuncia el estado de la conciliación');

    if (anuncio) {
      dato(`anuncio: ${anuncio.verde ? '[VERDE] ' : ''}${anuncio.texto}`);
      const conciliable = (confirmado ?? 0) + (sinConfirmar ?? 0);
      /*
        El criterio de aceptación del informe, dicho como condición: el verde sólo si hay algo
        conciliable Y no queda nada pendiente. Con lo de Escazú —todo efectivo, ningún corte— el
        conciliable es cero y el verde sería la afirmación que motivó el hallazgo.
      */
      comprobar(
        !anuncio.verde || (conciliable > 0 && sinConfirmar === 0),
        'el verde aparece sólo si hay algo conciliable y nada pendiente',
        `conciliable=${conciliable} sinConfirmar=${sinConfirmar}: en verde, esto afirma una confirmación que no existe`,
      );
      comprobar(
        conciliable > 0 || /no hay nada que conciliar|no pasa por ningún corte/i.test(anuncio.texto),
        'y sin nada conciliable lo dice con esas palabras',
        anuncio.texto,
      );
    }
  } else {
    comprobar(false, 'se pudo leer la respuesta de totales del servidor');
  }

  // ===============================================================================================
  // 2 · CÓDIGO DE ESPACIO + 3 · EL DIFF EN LA BITÁCORA
  // ===============================================================================================
  console.log('\n── 2 · código de espacio: el error se va al corregir ──');
  // `/admin/settings/space-format`, verificada contra App.tsx y no contra la memoria: una ruta
  // inexistente no falla, el comodín la manda a la portada y el arnés mide la portada con otro
  // nombre (incidente 5 del registro).
  await page.goto(`${BASE}/admin/settings/space-format`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const campoCantidad = page.getByLabel('Cantidad de caracteres').first();
  const hayCampo = (await campoCantidad.count()) > 0;
  comprobar(hayCampo, 'el formulario del código de espacio carga');

  let original = null;
  if (hayCampo) {
    original = await campoCantidad.inputValue();
    dato(`cantidad vigente: ${original}`);

    // 13 está fuera de rango: tiene que marcarse SIN pulsar Guardar.
    await campoCantidad.fill('13');
    await page.waitForTimeout(700);
    const conTrece = await page.evaluate(() => ({
      errores: [...document.querySelectorAll('.lx-field__error')].map((n) => (n.textContent ?? '').trim()),
      guardarDeshabilitado: [...document.querySelectorAll('button')].some(
        (b) => /guardar/i.test(b.textContent ?? '') && b.disabled,
      ),
      ejemplo: (document.querySelector('[data-testid="space-format-preview"]')?.textContent ?? '').trim(),
    }));
    comprobar(conTrece.errores.length > 0, 'con 13 el error aparece sin pulsar Guardar', 'no se marcó nada');
    comprobar(conTrece.guardarDeshabilitado, 'y Guardar queda deshabilitado');
    comprobar(
      conTrece.ejemplo === '—',
      'y el ejemplo no dibuja un código que el servidor va a rechazar',
      `«Así se vería» muestra ${conTrece.ejemplo}`,
    );

    // Y al corregir, el error se va. Éste es el criterio textual del informe.
    await campoCantidad.fill('4');
    await page.waitForTimeout(700);
    const conCuatro = await page.evaluate(() => ({
      errores: [...document.querySelectorAll('.lx-field__error')].map((n) => (n.textContent ?? '').trim()),
      ejemplo: (document.querySelector('[data-testid="space-format-preview"]')?.textContent ?? '').trim(),
    }));
    comprobar(
      conCuatro.errores.length === 0,
      'al volver a un valor válido el error DESAPARECE, sin guardar',
      conCuatro.errores.join(' | '),
    );
    comprobar(
      conCuatro.ejemplo.endsWith('0001'),
      `y «Así se vería» se actualiza en el acto (${conCuatro.ejemplo})`,
    );

    // 0 también está fuera de rango.
    await campoCantidad.fill('0');
    await page.waitForTimeout(600);
    const conCero = await page.evaluate(() => document.querySelectorAll('.lx-field__error').length);
    comprobar(conCero > 0, 'el 0 también se rechaza');
    await campoCantidad.fill(original);
    await page.waitForTimeout(500);
  }

  // --- el diff: se cambia de verdad, y se mira la bitácora ---------------------------------------
  console.log('\n── 3 · auditoría: el antes y el después de un cambio real ──');
  let cambioHecho = false;
  if (hayCampo && original) {
    const nuevo = original === '4' ? '5' : '4';
    await campoCantidad.fill(nuevo);
    await page.waitForTimeout(400);
    const guardar = page.getByRole('button', { name: /^Guardar$/i }).first();
    const [respuesta] = await Promise.all([
      page
        .waitForResponse((r) => r.url().includes('/space-format') && r.request().method() === 'PUT', {
          timeout: 15000,
        })
        .catch(() => null),
      guardar.click(),
    ]);
    await page.waitForTimeout(2000);
    cambioHecho = respuesta !== null && respuesta.ok();
    comprobar(cambioHecho, `se guardó un cambio real (${original} → ${nuevo})`,
      `status=${respuesta ? respuesta.status() : 'sin respuesta'}`);

    if (cambioHecho) {
      const avisoExito = await page.locator('.lx-alert--success').count();
      comprobar(avisoExito > 0, 'y la pantalla confirma que se guardó');

      await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);

      const fila = page.locator('tbody tr').filter({ hasText: /Formato de espacios/i }).first();
      comprobar((await fila.count()) > 0, 'la bitácora registró «Formato de espacios actualizado»');
      if ((await fila.count()) > 0) {
        const queCambio = (await fila.textContent()) ?? '';
        dato(`la fila dice: ${queCambio.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
        /*
          El corazón del hallazgo: «Sin cambios en los datos» después de una modificación real. El
          evento se registraba con metadatos y sin diff, así que el detalle no tenía qué contar.
        */
        comprobar(
          !/Sin cambios en los datos/i.test(queCambio),
          'y NO dice «Sin cambios en los datos» después de un cambio real',
          queCambio.replace(/\s+/g, ' ').trim().slice(0, 200),
        );
        comprobar(
          /Cantidad de caracteres/i.test(queCambio),
          'sino el campo que cambió, por su nombre',
          queCambio.replace(/\s+/g, ' ').trim().slice(0, 200),
        );
        comprobar(
          queCambio.includes(original) && queCambio.includes(nuevo),
          `con el antes y el después (${original} → ${nuevo})`,
          queCambio.replace(/\s+/g, ' ').trim().slice(0, 200),
        );
      }

      // Y se devuelve al valor que tenía, para no dejar la municipalidad cambiada.
      await page.goto(`${BASE}/admin/settings/space-format`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2200);
      await page.getByLabel('Cantidad de caracteres').first().fill(original);
      await page.getByRole('button', { name: /^Guardar$/i }).first().click();
      await page.waitForTimeout(2000);
      dato(`formato devuelto a ${original}`);
    }
  }

  // ===============================================================================================
  // 4 · ROLES: el conteo coincide con lo desplegado
  // ===============================================================================================
  console.log('\n── 4 · roles: «X de N permisos» coincide con lo desplegado ──');
  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const roles = await page.evaluate(() =>
    [...document.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role')),
  );
  comprobar(roles.length > 0, `se listan ${roles.length} roles`);

  for (const rol of roles.slice(0, 4)) {
    const fila = page.locator(`[data-role="${rol}"]`).first();
    const resumen = ((await fila.textContent()) ?? '').match(/(\d+)\s+de\s+(\d+)/);
    if (!resumen) {
      comprobar(false, `${rol}: no muestra el resumen «X de N permisos»`);
      continue;
    }
    await fila.locator('button').first().click();
    await page.waitForTimeout(700);
    const desplegado = await fila.evaluate((n) => {
      const items = [...n.querySelectorAll('[data-permission]')];
      return {
        total: items.length,
        concedidos: items.filter((i) => i.getAttribute('data-granted') === 'true').length,
      };
    });
    comprobar(
      Number(resumen[1]) === desplegado.concedidos && Number(resumen[2]) === desplegado.total,
      `${rol}: el resumen «${resumen[1]} de ${resumen[2]}» coincide con lo desplegado`,
      `desplegado: ${desplegado.concedidos} concedidos de ${desplegado.total} mostrados`,
    );
    await fila.locator('button').first().click();
    await page.waitForTimeout(300);
  }

  // ===============================================================================================
  // 5 · REPORTES: tipo y rango, sin opciones muertas
  // ===============================================================================================
  console.log('\n── 5 · reportes: tipo de reporte y rango de fechas ──');
  const fallidas = [];
  page.on('response', (r) => {
    if (r.status() >= 400) fallidas.push(`${r.status()} ${r.url().replace(BASE, '')}`);
  });
  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const reportes = await page.evaluate(() => ({
    tipo: Boolean([...document.querySelectorAll('label')].find((l) => /Tipo de reporte/i.test(l.textContent ?? ''))),
    desde: Boolean([...document.querySelectorAll('label')].find((l) => /^Desde/i.test((l.textContent ?? '').trim()))),
    hasta: Boolean([...document.querySelectorAll('label')].find((l) => /^Hasta/i.test((l.textContent ?? '').trim()))),
    fechas: document.querySelectorAll('input[type="date"]').length,
  }));
  comprobar(reportes.tipo, 'hay un selector de tipo de reporte');
  comprobar(reportes.desde && reportes.hasta && reportes.fechas >= 2, 'y un rango de fechas elegible',
    `desde=${reportes.desde} hasta=${reportes.hasta} campos=${reportes.fechas}`);
  comprobar(
    fallidas.length === 0,
    'y la pantalla no pide nada que el servidor rechace',
    [...new Set(fallidas)].join(' | '),
  );

  // ===============================================================================================
  // 6 · CIUDADANO: cabecera en Vehículos, Billetera y Más
  // ===============================================================================================
  console.log('\n── 6 · ciudadano: la cabecera en Vehículos, Billetera y Más ──');
  const ctxCiudadano = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const pc = await ctxCiudadano.newPage();
  try {
    await entrar(pc, '', CIUDADANO);
  } catch (error) {
    comprobar(false, 'se pudo entrar al portal del ciudadano', error.message);
  }

  for (const [ruta, nombre] of [['/', 'Inicio'], ['/vehicles', 'Vehículos'], ['/wallet', 'Billetera'], ['/more', 'Más']]) {
    await pc.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
    await pc.waitForTimeout(2200);
    const m = await pc.evaluate(() => {
      const barras = document.querySelectorAll('.lx-app-bar');
      const pie = document.querySelector('.lx-bottom-tab-bar');
      const caja = barras[0]?.getBoundingClientRect();
      const main = document.querySelector('main');
      return {
        barras: barras.length,
        pies: document.querySelectorAll('.lx-bottom-tab-bar').length,
        barraVisible: caja ? caja.bottom > 0 && caja.top <= 2 : false,
        // El contenido no puede empezar por debajo del borde superior de la barra.
        contenidoTapado: caja && main ? main.getBoundingClientRect().top < caja.bottom - 1 : false,
        pestanas: pie ? pie.querySelectorAll('.lx-bottom-tab-bar__tab').length : 0,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    comprobar(m.barras === 1, `${nombre.padEnd(11)} · tiene cabecera, y una sola`, `encontré ${m.barras}`);
    comprobar(m.barraVisible, `${nombre.padEnd(11)} · y está a la vista`);
    comprobar(!m.contenidoTapado, `${nombre.padEnd(11)} · sin contenido escondido debajo de ella`);
    comprobar(m.pies === 1 && m.pestanas === 5, `${nombre.padEnd(11)} · con la navegación inferior intacta`,
      `barras inferiores=${m.pies} pestañas=${m.pestanas}`);
    comprobar(!m.desborda, `${nombre.padEnd(11)} · sin desborde horizontal`);
  }

  // Y en los demás anchos, que es donde una cabecera recién agregada rompe el layout.
  console.log('\n── 6b · las tres pantallas, en cinco anchos ──');
  const sesionCiudadano = await ctxCiudadano.storageState();
  await ctxCiudadano.close();
  for (const tam of TAMANOS) {
    const c = await browser.newContext({
      storageState: sesionCiudadano,
      viewport: { width: tam.width, height: tam.height },
      isMobile: tam.movil,
      hasTouch: tam.movil,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await c.newPage();
    let bien = true;
    const detalles = [];
    for (const ruta of ['/vehicles', '/wallet', '/more']) {
      await p.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1800);
      const m = await p.evaluate(() => ({
        barras: document.querySelectorAll('.lx-app-bar').length,
        pies: document.querySelectorAll('.lx-bottom-tab-bar').length,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      if (m.barras !== 1 || m.pies !== 1 || m.desborda) {
        bien = false;
        detalles.push(`${ruta}: barras=${m.barras} pies=${m.pies} desborda=${m.desborda}`);
      }
    }
    comprobar(bien, `${tam.nombre.padEnd(18)} ${String(tam.width).padStart(4)}px`, detalles.join(' · '));
    await c.close();
  }

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
