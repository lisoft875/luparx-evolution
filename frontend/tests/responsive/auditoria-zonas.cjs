/**
 * La matriz de seis pruebas del informe de auditoría del 24-09-2026, ejecutada de verdad.
 *
 * <h2>Qué escribe en staging, y por qué es aceptable</h2>
 *
 * <p>Las dos filas «Incorrecto» de esa matriz —crear una zona y guardar sin cambios— sólo se pueden
 * comprobar CREANDO una zona. Y en esta plataforma <b>una zona no se borra nunca</b>, por diseño:
 * cada estadía cobrada en ella tiene que seguir resolviendo a una zona con nombre.</p>
 *
 * <p>Así que el arnés trabaja siempre sobre la MISMA zona, de código {@code ZZ-QA}: la primera
 * corrida la crea, las siguientes la reconocen y siguen. No se acumula una por ejecución, no toca
 * ninguna zona real, y la deja <b>desactivada</b> al terminar, que es lo más parecido a borrarla que
 * el modelo permite. Con {@code SOLO_LECTURA=1} se salta toda la parte que escribe y comprueba nada
 * más la presentación.</p>
 *
 * <h2>Qué comprueba</h2>
 *
 * <table>
 *   <tr><td>Crear zona</td><td>§3 · un evento propio, «Zona creada», con sus valores iniciales</td></tr>
 *   <tr><td>Guardar sin cambios</td><td>§2 · NO aparece ningún evento nuevo</td></tr>
 *   <tr><td>Cambiar nombre</td><td>§7 · un solo campo, con anterior y nuevo</td></tr>
 *   <tr><td>Desactivar / activar</td><td>§4 · «Estado: Activa → Inactiva», no «active: true → false»</td></tr>
 *   <tr><td>La tabla</td><td>§6 · se lee una fila entera sin desplazamiento lateral en escritorio</td></tr>
 * </table>
 *
 *   PASS='...' node tests/responsive/auditoria-zonas.cjs
 *   SOLO_LECTURA=1 PASS='...' node tests/responsive/auditoria-zonas.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';
const SOLO_LECTURA = process.env.SOLO_LECTURA === '1';

const CODIGO = 'ZZ-QA';
const NOMBRE_BASE = 'Zona de prueba automatizada (no usar)';
const NOMBRE_EDITADO = 'Zona de prueba automatizada (editada)';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Anchos donde el informe dice que la tabla NO debe necesitar desplazamiento lateral. */
const ESCRITORIO = [
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];
const ANGOSTOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'tablet apaisada', width: 1024, height: 768 },
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

/** Las filas de la bitácora de esta zona, de la más reciente a la más vieja. */
async function bitacoraDe(page, codigoZona) {
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  const combo = page.getByRole('combobox', { name: 'Módulo' }).first();
  await combo.click();
  await page.waitForTimeout(300);
  await page.getByRole('option').filter({ hasText: /^Zonas$/ }).first().click();
  await page.waitForTimeout(1800);
  return page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].map((tr) => {
      const celdas = [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim());
      const cambios = tr.querySelector('.lx-table-cell-clamp');
      return {
        accion: celdas[1] ?? '',
        recurso: celdas[2] ?? '',
        cambios: celdas[3] ?? '',
        cambiosCompletos: cambios ? (cambios.getAttribute('title') ?? '') : '',
      };
    }),
  );
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 1536, height: 960 },
  });

  console.log(`\n${BASE}/admin · ${CUENTA}${SOLO_LECTURA ? ' · SÓLO LECTURA' : ''}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (err) => errores.push(String(err.message).slice(0, 200)));

  if (!SOLO_LECTURA) {
    // =============================================================================================
    // La matriz, fila por fila
    // =============================================================================================
    await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);

    const yaExiste = (await page.locator('tbody tr').filter({ hasText: CODIGO }).count()) > 0;

    if (!yaExiste) {
      console.log(`── §3 · crear la zona ${CODIGO} ──`);
      await page.getByRole('button', { name: /^Crear zona$/ }).click();
      await page.waitForTimeout(600);
      const dialogo = page.getByRole('dialog');
      const campos = dialogo.locator('input, textarea');
      await campos.nth(0).fill(CODIGO);
      await campos.nth(1).fill(NOMBRE_BASE);
      await campos.nth(2).fill('Creada por el arnés de auditoría. No representa ningún sector real.');
      // Los dos modales de Zonas confirman con «Guardar»; «Crear zona» es el título del
      // diálogo y el botón de la pantalla, no el de dentro.
      await dialogo.getByRole('button', { name: /^Guardar$/ }).click();
      await page.waitForTimeout(2200);

      const trasCrear = await bitacoraDe(page, CODIGO);
      const creacion = trasCrear[0] ?? {};
      comprobar(
        /Zona creada/i.test(creacion.accion) && /PARKING_ZONE_CREATED/.test(creacion.accion),
        'crear una zona registra una acción propia, no «Zona actualizada»',
        `acción=${(creacion.accion || '(vacío)').slice(0, 90)}`,
      );
      comprobar(
        creacion.cambios.includes(CODIGO) && creacion.cambios.includes('Nombre'),
        'y deja los valores con los que la zona nació',
        `qué cambió=${(creacion.cambios || '(vacío)').slice(0, 140)}`,
      );
    } else {
      console.log(`── §3 · la zona ${CODIGO} ya existe de una corrida anterior; no se vuelve a crear ──`);
      comprobar(true, `${CODIGO} reutilizada (el arnés no acumula zonas)`);
      await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2200);
    }

    const fila = page.locator('tbody tr').filter({ hasText: CODIGO }).first();
    comprobar((await fila.count()) > 0, `la fila de ${CODIGO} está en la lista de zonas`);

    // --- §2: guardar sin tocar nada ---------------------------------------------------------
    console.log('── §2 · guardar sin cambiar nada no debe registrar nada ──');
    const antes = await bitacoraDe(page, CODIGO);
    await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.locator('tbody tr').filter({ hasText: CODIGO }).first()
      .getByRole('button', { name: /^Editar zona$/ }).click();
    await page.waitForTimeout(700);
    const edicion = page.getByRole('dialog');
    const [respuestaVacia] = await Promise.all([
      page.waitForResponse((r) => /\/admin\/parking\/zones\//.test(r.url()) && r.request().method() === 'PUT', {
        timeout: 15000,
      }).catch(() => null),
      edicion.getByRole('button', { name: /Guardar/i }).click(),
    ]);
    await page.waitForTimeout(2000);
    comprobar(
      respuestaVacia !== null && respuestaVacia.ok(),
      'el guardado sin cambios sigue respondiendo bien (no se rompe nada)',
      `status=${respuestaVacia ? respuestaVacia.status() : 'sin respuesta'}`,
    );
    const despues = await bitacoraDe(page, CODIGO);
    comprobar(
      despues.length === antes.length,
      'y NO agrega una fila a la bitácora',
      `antes=${antes.length} después=${despues.length}` +
        (despues.length > antes.length ? ` · nueva: ${despues[0].accion} / ${despues[0].cambios}` : ''),
    );

    // --- §7: cambiar un solo campo ------------------------------------------------------------
    console.log('── §7 · cambiar el nombre registra ese campo y sólo ése ──');
    const nombreNuevo = (await fila.textContent())?.includes('editada') ? NOMBRE_BASE : NOMBRE_EDITADO;
    await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.locator('tbody tr').filter({ hasText: CODIGO }).first()
      .getByRole('button', { name: /^Editar zona$/ }).click();
    await page.waitForTimeout(700);
    const edicion2 = page.getByRole('dialog');
    const camposEdicion = edicion2.locator('input, textarea');
    await camposEdicion.nth(1).fill(nombreNuevo);
    await edicion2.getByRole('button', { name: /Guardar/i }).click();
    await page.waitForTimeout(2200);

    const trasNombre = await bitacoraDe(page, CODIGO);
    const cambioNombre = trasNombre[0] ?? {};
    comprobar(
      /Zona actualizada/i.test(cambioNombre.accion),
      'se registra como «Zona actualizada»',
      (cambioNombre.accion || '(vacío)').slice(0, 90),
    );
    comprobar(
      cambioNombre.cambios.includes('Nombre') && !cambioNombre.cambios.includes('name:'),
      'el campo se llama «Nombre», no «name»',
      (cambioNombre.cambios || '(vacío)').slice(0, 140),
    );
    comprobar(
      !/Descripción|Estado/.test(cambioNombre.cambios),
      'y no arrastra campos que no se tocaron',
      (cambioNombre.cambios || '(vacío)').slice(0, 140),
    );

    // --- §4: desactivar, en palabras ----------------------------------------------------------
    console.log('── §4 · desactivar se entiende sin saber qué es `active: false` ──');
    await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const filaZona = page.locator('tbody tr').filter({ hasText: CODIGO }).first();
    const estaActiva = /Operando/.test((await filaZona.textContent()) ?? '');
    await filaZona.getByRole('button', { name: estaActiva ? /^Desactivar$/ : /^Activar$/ }).click();
    await page.waitForTimeout(700);
    const confirmar = page.getByRole('dialog');
    await confirmar.getByRole('button', { name: /zona$/i }).click();
    await page.waitForTimeout(2200);

    const trasEstado = await bitacoraDe(page, CODIGO);
    const cambioEstado = trasEstado[0] ?? {};
    comprobar(
      /Estado:/.test(cambioEstado.cambios),
      'el campo se llama «Estado»',
      (cambioEstado.cambios || '(vacío)').slice(0, 140),
    );
    comprobar(
      /Activa|Inactiva/.test(cambioEstado.cambios) && !/true|false/.test(cambioEstado.cambios),
      'y el valor dice Activa / Inactiva, no true / false',
      (cambioEstado.cambios || '(vacío)').slice(0, 140),
    );

    // Se deja desactivada: es lo más cerca de borrarla que el modelo permite.
    await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const filaFinal = page.locator('tbody tr').filter({ hasText: CODIGO }).first();
    if (/Operando/.test((await filaFinal.textContent()) ?? '')) {
      await filaFinal.getByRole('button', { name: /^Desactivar$/ }).click();
      await page.waitForTimeout(700);
      await page.getByRole('dialog').getByRole('button', { name: /zona$/i }).click();
      await page.waitForTimeout(1800);
    }
    const quedo = await page.locator('tbody tr').filter({ hasText: CODIGO }).first().textContent();
    comprobar(/Desactivada/.test(quedo ?? ''), `${CODIGO} queda desactivada al terminar`, (quedo ?? '').slice(0, 90));
  } else {
    console.log('── la mitad que escribe se saltó (SOLO_LECTURA=1) ──');
  }

  // ===============================================================================================
  // §6 — la tabla se lee sin ir y volver
  // ===============================================================================================
  console.log('── §6 · una fila completa sin desplazamiento lateral en escritorio ──');
  for (const tam of ESCRITORIO) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const medida = await p.evaluate(() => {
      const envoltorio = document.querySelector('.lx-table-wrapper');
      const doc = document.documentElement;
      return {
        exceso: envoltorio ? envoltorio.scrollWidth - envoltorio.clientWidth : -1,
        paginaDesborda: doc.scrollWidth > doc.clientWidth + 1,
        columnas: document.querySelectorAll('thead th').length,
      };
    });
    comprobar(
      medida.exceso <= 1 && !medida.paginaDesborda,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · las ${medida.columnas} columnas caben`,
      `la tabla se pasa ${medida.exceso}px · la página desborda=${medida.paginaDesborda}`,
    );
    await ctx.close();
  }

  console.log('── y en pantallas angostas: la página no desborda y el actor queda fijo ──');
  for (const tam of ANGOSTOS) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    const medida = await p.evaluate(() => {
      const doc = document.documentElement;
      const primera = document.querySelector('.lx-table td:first-child');
      return {
        paginaDesborda: doc.scrollWidth > doc.clientWidth + 1,
        actorFijo: primera ? getComputedStyle(primera).position === 'sticky' : false,
        envoltorioDesplaza: Boolean(document.querySelector('.lx-table-wrapper')),
      };
    });
    comprobar(
      !medida.paginaDesborda && medida.envoltorioDesplaza && medida.actorFijo,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · la página no desborda y el actor queda fijo`,
      `desborda=${medida.paginaDesborda} actorFijo=${medida.actorFijo}`,
    );
    await ctx.close();
  }

  comprobar(errores.length === 0, 'ninguna excepción de render', errores.join(' | '));

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
