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

  /**
   * Abre el menú de acciones de una fila y devuelve el panel.
   *
   * <p>Desde el 05-10-2026 las acciones no son botones en la fila: la columna desbordaba la tabla y
   * recortaba la última acción, así que ahora hay un botón de tres puntos que abre un panel con las
   * que correspondan a ese estado. Este arnés buscaba los botones en la fila, y por eso había que
   * tocarlo: no cambió lo que comprueba, cambió por dónde se llega.</p>
   */
  async function abrirAcciones(fila) {
    await fila.locator('td:last-child button').first().click();
    await page.waitForTimeout(900);
    const panel = page.getByRole('dialog');
    return (await panel.isVisible().catch(() => false)) ? panel : null;
  }

  async function cerrarAcciones() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

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
  const ajena = filas.filter({ hasNotText: CUENTA }).filter({ hasNotText: 'Revocado' }).first();
  if ((await ajena.count()) > 0) {
    const antes = (await ajena.textContent()) ?? '';
    const menu = await abrirAcciones(ajena);
    comprobar(menu !== null, 'el botón de la fila abre el panel de acciones');
    if (menu === null) {
      comprobar(false, 'ARNÉS: sin panel de acciones no se puede seguir con Revocar');
      await cerrarAcciones();
    }
    await menu.getByRole('button', { name: 'Revocar' }).first().click();
    await page.waitForTimeout(700);
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
    const menuPropio = await abrirAcciones(propia);
    const botonPropio = menuPropio
      ? menuPropio.getByRole('button', { name: 'Revocar' })
      : page.locator('nada');
    if ((await botonPropio.count()) > 0) {
      const estadoAntes = (await propia.textContent()) ?? '';
      await botonPropio.first().click();
      await page.waitForTimeout(700);
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
  // «Restablecer acceso» — el P1 del 02-10-2026
  // ===============================================================================================
  console.log('── forzar un cambio de contraseña: no se ofrece sobre uno mismo, y sobre otro avisa ──');
  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  /*
    Este bloque cambió de forma el 05-10-2026, y conviene decir por qué para que nadie lo «arregle»
    devolviéndolo a lo de antes.

    Antes se pulsaba «Forzar cambio de contraseña» en la PROPIA fila, se confirmaba, y se comprobaba
    que el servidor contestara 403 y que la sesión siguiera en pie. Era la única prueba de la guarda
    que arregló el P1 del 02-10-2026.

    El criterio 4 del informe del 05-10-2026 dice que no se ofrezca una acción que no corresponde al
    estado, y una acción cuya única respuesta posible es un 403 no corresponde nunca. Así que el
    botón dejó de ofrecerse sobre la propia cuenta — y con él se fue el camino por el que este arnés
    llegaba al 403.

    La guarda del servidor NO se dejó sin probar: se movió a donde pertenecía desde el principio,
    `SelfActionGuardsTest` en el backend, que la prueba directamente y no a través de un botón. Lo
    que se comprueba acá es lo que a esta altura se puede comprobar: que la pantalla no lo ofrece,
    que dice por qué, y que sobre otra persona la acción sigue existiendo y sigue avisando de lo
    que hace.
  */
  const propiaFila = page.locator('tbody tr').filter({ hasText: CUENTA }).first();
  if ((await propiaFila.count()) > 0) {
    const panel = await abrirAcciones(propiaFila);
    comprobar(panel !== null, 'la propia fila abre su panel de acciones');
    if (panel) {
      const texto = (await panel.textContent()) ?? '';
      comprobar(
        (await panel.getByRole('button', { name: /Forzar cambio de contraseña/i }).count()) === 0,
        'sobre la propia cuenta NO se ofrece forzar el cambio de contraseña',
        'el botón sigue ahí, y sólo puede dar 403',
      );
      comprobar(
        /propia cuenta/i.test(texto) && /sesi/i.test(texto),
        'y la pantalla dice por qué, en vez de que parezca un olvido',
        texto.slice(0, 200),
      );
      // Revocar y Cambiar rol son acciones del PUESTO y siguen ofreciéndose: lo que se esconde es
      // una sola acción, no todas. Sin esto, un panel vacío pasaría esta prueba.
      comprobar(
        (await panel.getByRole('button', { name: /Revocar/i }).count()) > 0,
        'y el resto de las acciones del puesto siguen ahí',
      );
    }
    await cerrarAcciones();
  } else {
    comprobar(false, `ARNÉS: la fila de ${CUENTA} no está en la lista`);
  }

  // Sobre OTRA persona: la acción existe y la confirmación dice lo que de verdad hace. No se
  // ejecuta — forzarle la contraseña a una cuenta sembrada la dejaría fuera de los demás arneses.
  const otraFila = page
    .locator('tbody tr')
    .filter({ hasNotText: CUENTA })
    .filter({ hasNotText: 'Revocado' })
    .first();
  if ((await otraFila.count()) > 0) {
    const panel = await abrirAcciones(otraFila);
    const boton = panel
      ? panel.getByRole('button', { name: /Forzar cambio de contraseña/i })
      : page.locator('nada');
    comprobar((await boton.count()) > 0, 'sobre otra persona la acción SÍ se ofrece');
    if ((await boton.count()) > 0) {
      await boton.first().click();
      await page.waitForTimeout(800);
      const dialogo = page.getByRole('dialog');
      const texto = (await dialogo.textContent().catch(() => '')) ?? '';
      comprobar(
        /contraseña/i.test(texto),
        '  y la confirmación dice que fuerza un cambio de contraseña, no una reactivación',
        texto.slice(0, 160),
      );
      comprobar(/sesion|sesión/i.test(texto), '  y avisa que cierra las sesiones abiertas', texto.slice(0, 160));
      comprobar(
        // «Restablecer acceso» desde el 06-10-2026: es como lo llama el encargo de Funcionarios, y
        // no colisiona porque esta acción —la de la contraseña— ya se llamaba «Forzar cambio de
        // contraseña». La prosa de este diálogo nombra la otra para que nadie las confunda, así que
        // tiene que nombrarla con la etiqueta que de verdad está en el botón.
        /Restablecer acceso/i.test(texto),
        '  y señala cuál es la acción para devolver un acceso quitado',
        texto.slice(0, 160),
      );
      const cancelar = dialogo.getByRole('button', { name: /Cancelar/i });
      if ((await cancelar.count()) > 0) await cancelar.first().click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
      comprobar(
        !/login|select-tenant/.test(page.url()) && /\/admin\/staff/.test(page.url()),
        'y cancelar deja la sesión y la pantalla donde estaban',
        `url=${page.url().replace(BASE, '')}`,
      );
    } else {
      await cerrarAcciones();
    }
  } else {
    comprobar(false, 'ARNÉS: no hay ninguna fila ajena no revocada con la que probar');
  }

  // ===============================================================================================
  // §2.3 — Cambiar rol
  // ===============================================================================================
  console.log('── §2.3 · Cambiar rol ofrece los roles que existen ──');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const conCambioRol = page.locator('tbody tr').filter({ hasText: 'Fiscalizador' }).first();
  if ((await conCambioRol.count()) > 0) {
    // Por el menú de la fila, como todas las acciones desde el 05-10-2026.
    const panelRol = await abrirAcciones(conCambioRol);
    if (panelRol === null) {
      comprobar(false, 'ARNÉS: la fila no abrió su panel de acciones');
    }
    await page.getByRole('dialog').getByRole('button', { name: /Cambiar rol/i }).first().click();
    await page.waitForTimeout(800);
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

  await abrir(page, 'Acción');
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
    const cabeceras = await page.locator('thead th').allTextContents();
    const celdas = await primeraFila.locator('td').allTextContents();
    const accion = celdas[1] ?? '';
    // Desde la especificación del 25-09 la columna Recurso salió de la tabla principal (sigue en
    // Ver detalle) y Acción muestra sólo el texto amigable, sin el código debajo.
    comprobar(
      !cabeceras.some((c) => /Recurso/i.test(c)),
      'la columna Recurso ya no está en la tabla principal',
      cabeceras.join(' | '),
    );
    comprobar(
      /[a-záéíóúñ]/.test(accion) && !/[A-Z]{4,}_[A-Z]/.test(accion),
      'la columna Acción muestra sólo el nombre en palabras, sin el código',
      accion.slice(0, 80),
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
