/**
 * Los ocho bloques del informe del 24-09-2026, medidos en el navegador.
 *
 * <h2>Qué NO hace este arnés</h2>
 *
 * <p>No revoca a nadie. Staging es el ambiente que se le enseña a una municipalidad y una
 * revocación no se levanta: para devolver el puesto hay que otorgarlo de nuevo. Así que la
 * confirmación se abre y se CANCELA.</p>
 *
 * <p>La única revocación que sí se confirma es la de la propia cuenta — y ésa es segura por
 * construcción, porque el punto de la prueba es que el servidor la rechace. Si algún día dejara de
 * rechazarla, este arnés se queda sin sesión y falla ruidosamente, que es exactamente lo que debe
 * pasar.</p>
 *
 * <h2>Qué comprueba</h2>
 *
 * <ol>
 *   <li>§2.1 Revocar pregunta antes, muestra estado de carga y nunca queda sin respuesta.</li>
 *   <li>§2.1 Un administrador no puede terminar su propio puesto, y se lo dicen con palabras.</li>
 *   <li>§2.3 «Cambiar rol» ofrece los roles que existen y no imprime claves crudas.</li>
 *   <li>§3.2 El filtro Acción se usa sin conocer MEMBERSHIP_ZONES_ASSIGNED.</li>
 *   <li>§3.3 El ancho del desplegable no cambia entre estados ni trunca las etiquetas.</li>
 *   <li>§3.4 La bitácora dice qué pasó antes de decir con qué código.</li>
 *   <li>§3.5 Cambiar fechas diez veces no toca la sesión ni la municipalidad activa.</li>
 *   <li>§4 Reportes distingue el reporte de la agrupación.</li>
 * </ol>
 *
 *   PASS='...' CUENTA='admin@luparx.test' node tests/responsive/funcionarios-y-auditoria.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'tablet apaisada', width: 1024, height: 768 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
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
  if (respuesta.status() === 429) {
    console.error('La cuenta está bloqueada por intentos fallidos. Esperar 15 min o usar CUENTA=otra@luparx.test');
    process.exit(3);
  }
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}. La contraseña de PASS no sirve para ${CUENTA}.`);
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

/** El nombre de la municipalidad activa, tal como la barra superior lo muestra. */
async function municipalidadActiva(page) {
  return page.evaluate(() => {
    const insignia = document.querySelector('[data-testid="tenant-badge"], .lx-tenant-badge, header .lx-badge');
    return insignia ? (insignia.textContent ?? '').trim() : document.location.pathname;
  });
}

/** Abre un Select por su etiqueta accesible y devuelve el listbox. */
async function abrir(page, etiqueta) {
  const disparador = page.getByRole('combobox', { name: etiqueta }).first();
  await disparador.click();
  await page.waitForTimeout(350);
  return { disparador, lista: page.getByRole('listbox').first() };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 1536, height: 960 },
  });

  console.log(`\n${BASE}/admin · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (err) => errores.push(String(err.message).slice(0, 200)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text().slice(0, 200));
  });

  // ===============================================================================================
  // §2.1 — Revocar
  // ===============================================================================================
  console.log('── §2.1 · Revocar pregunta, y no se puede uno revocar a sí mismo ──');
  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const filas = page.locator('tbody tr');
  const cuantas = await filas.count();
  comprobar(cuantas > 0, `la plantilla carga (${cuantas} fila(s))`);

  const propia = filas.filter({ hasText: CUENTA }).first();
  const hayPropia = await propia.count();
  comprobar(hayPropia > 0, `la fila de la cuenta con la que se probó (${CUENTA}) está en la lista`);

  // --- a) en OTRA fila: se abre la confirmación y se cancela. No se revoca a nadie.
  const ajena = filas.filter({ hasNotText: CUENTA }).filter({ hasText: 'Revocar' }).first();
  if ((await ajena.count()) > 0) {
    const antes = (await ajena.textContent()) ?? '';
    await ajena.getByRole('button', { name: 'Revocar' }).click();
    await page.waitForTimeout(500);
    const dialogo = page.getByRole('dialog');
    const abierto = await dialogo.isVisible().catch(() => false);
    comprobar(abierto, 'pulsar Revocar abre una confirmación en vez de revocar de un solo clic');
    if (abierto) {
      const texto = (await dialogo.textContent()) ?? '';
      comprobar(
        /no se levanta|otorg/i.test(texto),
        'la confirmación dice en qué se diferencia de Desactivar',
        texto.slice(0, 160),
      );
      comprobar(
        /conserva|se toca|boletas/i.test(texto),
        'y dice que no borra lo que la persona hizo',
        texto.slice(0, 160),
      );
      await dialogo.getByRole('button', { name: /Cancelar/i }).click();
      await page.waitForTimeout(700);
    }
    const despues = (await ajena.textContent()) ?? '';
    comprobar(antes === despues, 'cancelar no cambia la fila', `antes≠después`);
  } else {
    comprobar(false, 'ARNÉS: no hay ninguna fila ajena revocable con la que probar la confirmación');
  }

  // --- b) en la PROPIA fila: se confirma. El servidor debe rechazarlo.
  if (hayPropia > 0) {
    const botonPropio = propia.getByRole('button', { name: 'Revocar' });
    if ((await botonPropio.count()) > 0) {
      const estadoAntes = (await propia.textContent()) ?? '';
      await botonPropio.click();
      await page.waitForTimeout(500);
      const dialogo = page.getByRole('dialog');
      const [respuesta] = await Promise.all([
        page
          .waitForResponse((r) => /\/admin\/memberships\//.test(r.url()) && r.request().method() === 'DELETE', {
            timeout: 15000,
          })
          .catch(() => null),
        dialogo.getByRole('button', { name: /^Revocar$/ }).click(),
      ]);
      await page.waitForTimeout(1500);

      comprobar(
        respuesta !== null && respuesta.status() === 403,
        `el servidor rechaza que uno termine su propio puesto (403)`,
        `status=${respuesta ? respuesta.status() : 'sin respuesta'}`,
      );
      const aviso = (await page.locator('.lx-alert, [role="alert"]').allTextContents()).join(' | ');
      comprobar(
        /propio puesto/i.test(aviso),
        'y la pantalla lo dice con palabras, no con «no se pudo completar»',
        aviso.slice(0, 200) || '(ninguna alerta)',
      );
      const estadoDespues = (await propia.textContent()) ?? '';
      comprobar(
        estadoAntes.includes('Activo') === estadoDespues.includes('Activo'),
        'y el estado visual de la fila NO cambia falsamente',
      );
      comprobar(
        !/select-tenant|login/.test(page.url()),
        'y la sesión sigue en pie',
        `url=${page.url()}`,
      );
    } else {
      comprobar(false, 'ARNÉS: la propia fila no ofrece Revocar (¿ya está revocada?)');
    }
  }

  // ===============================================================================================
  // §2.3 — Cambiar rol
  // ===============================================================================================
  console.log('── §2.3 · Cambiar rol ofrece los roles que existen ──');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const conCambioRol = page.locator('tbody tr').filter({ hasText: 'Fiscalizador' }).first();
  if ((await conCambioRol.count()) > 0) {
    await conCambioRol.getByRole('button', { name: /Cambiar rol/i }).click();
    await page.waitForTimeout(600);
    const dialogo = page.getByRole('dialog');
    const texto = (await dialogo.textContent()) ?? '';
    comprobar(
      !/portal\.[A-Z]/.test(texto),
      'el modal no imprime una clave de traducción cruda',
      texto.slice(0, 160),
    );
    const combos = dialogo.getByRole('combobox');
    if ((await combos.count()) > 0) {
      await combos.first().click();
      await page.waitForTimeout(350);
      const opciones = await page.getByRole('option').allTextContents();
      comprobar(
        opciones.length > 0,
        `el selector ofrece ${opciones.length} rol(es) alternativo(s)`,
        opciones.join(' · '),
      );
      await page.keyboard.press('Escape');
    } else {
      // Sin selector debe haber una explicación y el botón apagado: el otro final legítimo.
      const guardar = dialogo.getByRole('button', { name: /Guardar/i });
      comprobar(
        /No hay otro rol/i.test(texto) && (await guardar.isDisabled().catch(() => false)),
        'si de verdad no hay alternativas, se dice y el botón queda deshabilitado',
        texto.slice(0, 160),
      );
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else {
    comprobar(false, 'ARNÉS: no hay ninguna fila de Fiscalizador con la que probar el cambio de rol');
  }

  // ===============================================================================================
  // §3.2 / §3.3 / §3.4 — Auditoría
  // ===============================================================================================
  console.log('── §3.2 · el filtro Acción se usa sin saber códigos ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const { lista: listaAcciones } = await abrir(page, 'Acción');
  const etiquetas = await page.getByRole('option').allTextContents();
  comprobar(
    etiquetas.some((e) => /Sectores asignados/.test(e)),
    'la acción se puede elegir por su nombre humano («Sectores asignados»)',
    etiquetas.slice(0, 6).join(' · '),
  );
  comprobar(
    etiquetas.some((e) => /MEMBERSHIP_ZONES_ASSIGNED/.test(e)),
    'y el código interno sigue visible como detalle',
  );
  await page.getByRole('option').filter({ hasText: 'Sectores asignados' }).first().click();
  await page.waitForTimeout(1600);
  const urlAccion = page.url();
  comprobar(!/error|select-tenant/.test(urlAccion), 'elegir una acción no saca de la pantalla');

  console.log('── §3.3 · el ancho del selector de módulos no cambia entre estados ──');
  const medidas = [];
  for (const eleccion of ['Todos los módulos', 'Zonas', 'Tarifas', 'Política de parqueo', 'Boletas']) {
    const { disparador } = await abrir(page, 'Módulo');
    const medida = await page.evaluate(() => {
      const lista = document.querySelector('.lx-listbox');
      if (!lista) return null;
      const opciones = [...lista.querySelectorAll('.lx-listbox__label')];
      return {
        ancho: Math.round(lista.getBoundingClientRect().width),
        // Una etiqueta recortada tiene más contenido del que puede dibujar.
        truncadas: opciones.filter((o) => o.scrollWidth > o.clientWidth + 1).map((o) => o.textContent),
        opciones: opciones.length,
        anchoDisparador: 0,
      };
    });
    if (medida === null) {
      comprobar(false, `ARNÉS: la lista no se abrió al elegir «${eleccion}»`);
      break;
    }
    medida.anchoDisparador = Math.round((await disparador.boundingBox())?.width ?? 0);
    medidas.push({ eleccion, ...medida });
    const opcion = page.getByRole('option').filter({ hasText: new RegExp(`^${eleccion}$`) }).first();
    if ((await opcion.count()) > 0) {
      await opcion.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(900);
  }

  if (medidas.length >= 2) {
    const anchos = medidas.map((m) => m.ancho);
    const min = Math.min(...anchos);
    const max = Math.max(...anchos);
    comprobar(
      max - min <= 2,
      `el ancho de la lista es el mismo con cualquier valor seleccionado (${anchos.join(' / ')} px)`,
      medidas.map((m) => `${m.eleccion}=${m.ancho}px (campo ${m.anchoDisparador}px)`).join(' · '),
    );
    for (const m of medidas) {
      comprobar(
        m.truncadas.length === 0,
        `con «${m.eleccion}» ninguna de las ${m.opciones} opciones queda truncada`,
        m.truncadas.join(' · '),
      );
      comprobar(
        m.ancho >= m.anchoDisparador - 1,
        `y la lista nunca es más angosta que el campo (${m.ancho} ≥ ${m.anchoDisparador})`,
      );
    }
  }

  console.log('── §3.4 · la bitácora dice qué pasó antes que con qué código ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  const primeraFila = page.locator('tbody tr').first();
  if ((await primeraFila.count()) > 0) {
    const celdas = await primeraFila.locator('td').allTextContents();
    const accion = celdas[1] ?? '';
    const recurso = celdas[2] ?? '';
    comprobar(
      /[a-záéíóúñ]/.test(accion.replace(/[A-Z_]{4,}/g, '')),
      'la columna Acción trae un nombre en palabras además del código',
      accion.slice(0, 80),
    );
    comprobar(
      !/^[a-z-]+\/[0-9a-f-]{20,}$/i.test(recurso.trim()),
      'la columna Recurso ya no es «tipo/uuid» a secas',
      recurso.slice(0, 80),
    );
  }

  // ===============================================================================================
  // §3.5 — la prueba de regresión que pide el informe, palabra por palabra
  // ===============================================================================================
  console.log('── §3.5 · diez cambios de fecha, módulo, acción, recarga y navegación ──');
  const municipioAntes = await municipalidadActiva(page);
  const campos = page.locator('input[type="date"]');
  for (let i = 1; i <= 10; i++) {
    const dia = String(((i * 3) % 27) + 1).padStart(2, '0');
    await campos.nth(0).fill(`2026-09-${dia}`);
    await page.waitForTimeout(220);
    await campos.nth(1).fill(`2026-09-${String(Math.min(28, Number(dia) + 1)).padStart(2, '0')}`);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(1200);
  comprobar(
    (await campos.count()) === 2 && !/select-tenant|login/.test(page.url()),
    'diez cambios de fecha: la pantalla sigue en pie',
    `url=${page.url()}`,
  );

  await abrir(page, 'Módulo');
  await page.getByRole('option').filter({ hasText: 'Zonas' }).first().click();
  await page.waitForTimeout(900);
  await abrir(page, 'Acción');
  await page.getByRole('option').nth(3).click();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  comprobar(!/select-tenant|login/.test(page.url()), 'tras recargar sigue en Auditoría', `url=${page.url()}`);

  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const municipioDespues = await municipalidadActiva(page);
  comprobar(
    municipioAntes === municipioDespues && !/select-tenant/.test(page.url()),
    `la municipalidad activa se mantuvo («${municipioAntes}» → «${municipioDespues}»)`,
    `url=${page.url()}`,
  );

  // ===============================================================================================
  // §4 — Reportes
  // ===============================================================================================
  console.log('── §4 · reporte y agrupación son cosas distintas ──');
  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const textoReportes = (await page.locator('main, body').first().textContent()) ?? '';
  comprobar(/Agrupar por/i.test(textoReportes), 'el control está etiquetado «Agrupar por»');
  comprobar(/Usuarios registrados/i.test(textoReportes), 'y «Usuarios registrados» sigue siendo el nombre del reporte');
  comprobar(
    /entre el .* y el /i.test(textoReportes),
    'el período que cubre el reporte se dice en pantalla',
    textoReportes.slice(0, 200),
  );
  await abrir(page, 'Agrupar por');
  await page.getByRole('option').filter({ hasText: 'Mes' }).first().click();
  await page.waitForTimeout(2500);
  const cargando = await page.locator('text=/Cargando/i').count();
  comprobar(cargando === 0, 'agrupar por Mes termina de cargar (no hay spinner colgado)');
  const vacio = (await page.locator('main, body').first().textContent()) ?? '';
  comprobar(
    !/rango seleccionado/i.test(vacio),
    'y el mensaje de vacío ya no habla de un rango que no se puede seleccionar',
  );

  // ===============================================================================================
  // Responsive
  // ===============================================================================================
  console.log('── las tres pantallas en cada tamaño ──');
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    const problemas = [];
    for (const ruta of ['/admin/staff', '/admin/audit', '/admin/reports']) {
      await p.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1800);
      const medida = await p.evaluate(() => {
        const doc = document.documentElement;
        return { exceso: doc.scrollWidth - doc.clientWidth, vacio: (doc.textContent ?? '').trim().length < 80 };
      });
      if (medida.exceso > 1) problemas.push(`${ruta} desborda ${medida.exceso}px`);
      if (medida.vacio) problemas.push(`${ruta} quedó en blanco`);
    }
    comprobar(
      problemas.length === 0,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · las tres pantallas sin desborde`,
      problemas.join(' · '),
    );
    await ctx.close();
  }

  const reventones = errores.filter((e) => /RangeError|Invalid time value|Minified React error/i.test(e));
  comprobar(reventones.length === 0, 'ninguna excepción de render en toda la sesión', reventones.join(' | '));

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
