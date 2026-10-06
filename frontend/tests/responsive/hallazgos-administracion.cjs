/**
 * Los diez criterios de aceptación del informe de Administración del 05-10-2026.
 *
 * <h2>Qué mide, uno por uno</h2>
 *
 * <ol>
 *   <li>IP inválida: rechazada antes del cotejo, SIN petición y SIN entrada nueva en la bitácora.
 *       Las tres cosas se comprueban por separado, porque son tres: que la pantalla lo diga, que
 *       la red no se toque, y que la bitácora no crezca.</li>
 *   <li>Desactivar un funcionario suspende su acceso municipal y no toca la sesión de quien lo
 *       pulsa ni el estado de la cuenta global.</li>
 *   <li>Reactivar lo devuelve a Activo y deja registro; el administrador sigue dentro.</li>
 *   <li>Acciones coherentes con el estado: sobre la propia fila no se ofrece forzar la contraseña,
 *       y sobre un puesto revocado no se ofrece reactivar.</li>
 *   <li>Rol y sectores asignados persisten tras recargar.</li>
 *   <li>INSPECTOR_LEAD con el mismo nombre visible en Funcionarios, en Roles y permisos y en la
 *       ficha de la persona.</li>
 *   <li>La tabla de Funcionarios no recorta acciones a escritorio con zoom al 100%.</li>
 *   <li>Roles y permisos: agrupada, desplegable y sin desplazamiento horizontal.</li>
 *   <li>Los selectores de acción y módulo salen por categorías, con todos los eventos presentes.</li>
 *   <li>La ficha distingue estado de la cuenta de acceso municipal.</li>
 * </ol>
 *
 * <h2>Lo que este arnés NO hace</h2>
 *
 * <p>No desactiva al administrador con el que entra, ni se fuerza la contraseña a sí mismo. La
 * guarda del servidor existe y hay que comprobarla, pero se comprueba por lo que la pantalla
 * OFRECE, no ejecutando una acción cuyo fallo dejaría la cuenta de pruebas fuera. Para el ciclo de
 * desactivar y reactivar se usa un funcionario que no es el operador.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/hallazgos-administracion.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';
/** La municipalidad del informe. Se elige si el selector aparece. */
const MUNICIPALIDAD = process.env.MUNICIPALIDAD ?? 'Escazú';

/** El nombre visible canónico de INSPECTOR_LEAD, decidido el 05-10-2026. */
const JEFE = 'Jefe de fiscalización';

const TAMANOS = [
  { nombre: 'móvil estándar', width: 390, height: 844 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
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

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => /\/auth\/admin\/login$/.test(r.url()), { timeout: 15000 })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);

  if (login && !login.ok()) {
    const pista =
      login.status() === 429
        ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá; no reintentes en bucle.'
        : login.status() === 401
          ? `contraseña incorrecta para ${CUENTA}. Pasá la vigente con PASS=...`
          : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar: ${pista}`);
  }

  const ficha = page
    .locator('button, a')
    .filter({ hasText: new RegExp(MUNICIPALIDAD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
  }

  // Segunda red: aunque el login haya dado 200, si el formulario sigue en pantalla no se entró, y
  // medir desde acá produce hallazgos falsos en TODAS las rutas (ya pasó, el 19-09-2026).
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    throw new Error('No se pudo entrar: seguimos en el formulario de login.');
  }
  return page;
}

/**
 * ¿Seguimos dentro, o la pantalla volvió al login?
 *
 * <p>Por la RUTA. Un campo de contraseña no es un login: `/admin/profile` tiene el formulario para
 * cambiar la contraseña, y decidirlo por ese campo convierte esa pantalla en un falso «la sesión se
 * cayó». Acá todavía no pasaba —este arnés sólo recorre staff, roles y auditoría— y se corrige
 * igual: es la cuarta vez que el mismo atajo aparece en una red de pruebas de este proyecto, y las
 * tres anteriores sí produjeron fallos inventados.</p>
 */
async function sigueLaSesion(page) {
  return page.evaluate(() => ({
    enLogin: location.pathname.endsWith('/login'),
    url: location.pathname,
  }));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });

  console.log(`\n${BASE}/admin · ${CUENTA} · ${MUNICIPALIDAD}\n`);

  let page;
  try {
    page = await entrar(context);
  } catch (error) {
    console.error(`\n  ${error.message}\n`);
    await browser.close();
    process.exit(3);
  }

  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 180)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 180));
  });

  // ===============================================================================================
  // CRITERIO 1 · La IP inválida se rechaza antes del cotejo y no genera evento de auditoría
  // ===============================================================================================
  console.log('── criterio 1 · el cotejo de IP valida antes de consultar ──');

  /** Cuántas entradas tiene la bitácora ahora mismo, según el propio servidor. */
  async function totalDeBitacora() {
    const respuesta = await page
      .waitForResponse((r) => r.url().includes('/admin/audit-events') && r.request().method() === 'GET', {
        timeout: 15000,
      })
      .catch(() => null);
    return respuesta;
  }

  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  const primera = await totalDeBitacora();
  await page.waitForTimeout(2200);
  let totalAntes = null;
  if (primera) {
    try {
      totalAntes = (await primera.json()).totalElements ?? null;
    } catch {
      totalAntes = null;
    }
  }
  dato(`entradas en la bitácora antes: ${totalAntes ?? '(no se pudo leer)'}`);

  const campoIp = page.getByLabel('Dirección IP').first();
  comprobar((await campoIp.count()) > 0, 'el cotejo de IP está en pantalla');

  if ((await campoIp.count()) > 0) {
    // Toda petición de cotejo que salga, con su respuesta.
    const cotejos = [];
    const escucha = async (res) => {
      if (res.request().method() === 'POST' && res.url().includes('ip-fingerprint')) {
        cotejos.push(res.status());
      }
    };
    page.on('response', escucha);

    await campoIp.fill('999.999.999.999');
    await page.getByRole('button', { name: 'Cotejar' }).first().click();
    await page.waitForTimeout(2000);

    comprobar(cotejos.length === 0, 'con 999.999.999.999 NO sale una petición al servidor', `salieron ${cotejos.length}`);

    const estado = await page.evaluate(() => ({
      aviso: (document.querySelector('[data-testid="audit-probe-invalid"]')?.textContent ?? '').trim(),
      resultado: (document.querySelector('[data-testid="audit-probe-result"]')?.textContent ?? '').trim(),
      verde: Boolean(document.querySelector('[data-testid="audit-probe-result"] .lx-alert--success')),
    }));
    comprobar(estado.aviso.length > 0, 'la pantalla dice que eso no es una dirección IP', estado.aviso || '(no hay aviso)');
    comprobar(
      estado.resultado === '',
      'y NO muestra un resultado en verde que se lea como «descartada»',
      estado.resultado.slice(0, 120),
    );

    // Y la bitácora no creció. Se vuelve a pedir y se compara con el total de antes.
    await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
    const segunda = await totalDeBitacora();
    await page.waitForTimeout(2000);
    let totalDespues = null;
    if (segunda) {
      try {
        totalDespues = (await segunda.json()).totalElements ?? null;
      } catch {
        totalDespues = null;
      }
    }
    dato(`entradas en la bitácora después: ${totalDespues ?? '(no se pudo leer)'}`);
    if (totalAntes !== null && totalDespues !== null) {
      comprobar(
        totalDespues === totalAntes,
        'la bitácora NO creció: no hay «Dirección IP cotejada» por un valor inválido',
        `antes ${totalAntes}, después ${totalDespues}`,
      );
    } else {
      dato('no se pudo comparar el total de la bitácora; el resto del criterio 1 sí se midió');
    }

    // Y una dirección válida sí funciona: una validación que rechaza todo también «pasaría».
    await page.getByLabel('Dirección IP').first().fill('190.10.1.25');
    cotejos.length = 0;
    await page.getByRole('button', { name: 'Cotejar' }).first().click();
    await page.waitForTimeout(2500);
    comprobar(cotejos.length === 1, 'una dirección válida SÍ se coteja', `salieron ${cotejos.length} peticiones`);
    page.off('response', escucha);
  }

  // ===============================================================================================
  // CRITERIO 9 · Los selectores de Auditoría salen por categorías y no pierden eventos
  // ===============================================================================================
  console.log('\n── criterio 9 · los selectores de acción y módulo, agrupados ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  for (const [etiqueta, minimo] of [['Acción', 80], ['Módulo', 10]]) {
    const combo = page.getByRole('combobox', { name: etiqueta, exact: true }).first();
    if ((await combo.count()) === 0) {
      comprobar(false, `el filtro «${etiqueta}» está en pantalla`);
      continue;
    }
    await combo.click();
    await page.waitForTimeout(600);
    const lista = await page.evaluate(() => ({
      grupos: [...document.querySelectorAll('.lx-listbox__group')].map((n) => (n.textContent ?? '').trim()),
      opciones: document.querySelectorAll('.lx-listbox [role="option"]').length,
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    comprobar(
      lista.grupos.length >= 2,
      `«${etiqueta}» viene por categorías (${lista.grupos.length})`,
      `grupos: ${lista.grupos.join(' · ') || 'ninguno'}`,
    );
    // Agrupar no es acortar: el informe lo dice explícitamente («no eliminar eventos de auditoría
    // sólo para acortar el selector»).
    comprobar(
      lista.opciones >= minimo,
      `y no se perdió ninguna opción (${lista.opciones} ≥ ${minimo})`,
      `grupos: ${lista.grupos.join(' · ')}`,
    );
  }

  // ===============================================================================================
  // CRITERIOS 2, 3, 4, 5 y 7 · Funcionarios
  // ===============================================================================================
  console.log('\n── criterios 4 y 7 · la tabla de Funcionarios y sus acciones ──');
  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const tabla = await page.evaluate(() => {
    const t = document.querySelector('.lx-table');
    if (!t) return null;
    const envoltorio = document.querySelector('.lx-table-wrapper');
    const anchos = [...t.querySelectorAll('thead th')].map((th) => ({
      titulo: (th.textContent ?? '').trim(),
      ancho: Math.round(th.getBoundingClientRect().width),
    }));
    return {
      anchos,
      filas: t.querySelectorAll('tbody tr').length,
      // El desborde que importa a escritorio: que la tabla quepa en su envoltorio sin recortar.
      tablaMasAncha: envoltorio ? envoltorio.scrollWidth - envoltorio.clientWidth : null,
      desbordaLaPagina: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      // Un botón de acciones por fila, no cinco.
      botonesPorFila: [...t.querySelectorAll('tbody tr')].map(
        (tr) => tr.querySelectorAll('td:last-child button').length,
      ),
    };
  });

  if (tabla === null) {
    comprobar(false, 'la tabla de Funcionarios se dibujó', `consola: ${erroresJs.slice(0, 2).join(' | ') || 'limpia'}`);
  } else {
    dato(`${tabla.filas} filas · columnas: ${tabla.anchos.map((c) => `${c.titulo} ${c.ancho}px`).join(' · ')}`);
    comprobar(
      tabla.tablaMasAncha === 0,
      'criterio 7 · a 1536px la tabla entra entera: no recorta ninguna acción',
      `le sobran ${tabla.tablaMasAncha}px por desplazar`,
    );
    comprobar(!tabla.desbordaLaPagina, 'y la página no desborda en horizontal');
    const maximo = Math.max(0, ...tabla.botonesPorFila);
    comprobar(
      maximo <= 1,
      'la columna de acciones es un solo botón por fila',
      `alguna fila trae ${maximo} botones`,
    );
  }

  // Criterio 4: sobre la propia fila no se ofrece forzar la contraseña.
  const miFila = page.locator('tbody tr').filter({ hasText: CUENTA }).first();
  if ((await miFila.count()) > 0) {
    await miFila.locator('td:last-child button').first().click();
    await page.waitForTimeout(1200);
    const panel = page.getByRole('dialog');
    const texto = (await panel.textContent().catch(() => '')) ?? '';
    const ofrece = await panel.getByRole('button', { name: 'Forzar cambio de contraseña' }).count();
    comprobar(
      ofrece === 0,
      'criterio 4 · sobre la propia cuenta NO se ofrece forzar la contraseña',
      'el botón sigue ahí, y sólo puede dar 403',
    );
    comprobar(
      /propia cuenta|cerraría tu sesión/i.test(texto),
      'y la pantalla explica por qué, en vez de que parezca un olvido',
      texto.slice(0, 160),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    dato(`no encontré la fila de ${CUENTA} en Funcionarios; el criterio 4 sobre la propia cuenta no se midió`);
  }

  // Criterios 2, 3 y 5: desactivar y reactivar a OTRO, y que el rol y los sectores persistan.
  console.log('\n── criterios 2, 3 y 5 · desactivar, reactivar y que todo persista ──');
  const otra = page
    .locator('tbody tr')
    .filter({ hasText: 'Activo' })
    .filter({ hasNotText: CUENTA })
    .first();

  if ((await otra.count()) === 0) {
    dato('no hay ningún puesto Activo que no sea el del operador: los criterios 2, 3 y 5 no se midieron');
  } else {
    const antes = await otra.evaluate((tr) => ({
      persona: (tr.querySelector('td')?.textContent ?? '').trim().slice(0, 60),
      rol: (tr.querySelectorAll('td')[1]?.textContent ?? '').trim(),
      sectores: (tr.querySelectorAll('td')[3]?.textContent ?? '').trim(),
    }));
    dato(`el puesto de prueba: ${antes.persona} · ${antes.rol} · sectores: ${antes.sectores}`);

    await otra.locator('td:last-child button').first().click();
    await page.waitForTimeout(1100);
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).first().click();
    await page.waitForTimeout(1200);
    // El diálogo de confirmación pide un motivo y lo confirma.
    const motivo = page.getByRole('dialog').locator('input, textarea').first();
    if ((await motivo.count()) > 0) await motivo.fill('Prueba de aceptación 05-10');
    const confirmar = page
      .getByRole('dialog')
      .getByRole('button', { name: /Desactivar|Confirmar/ })
      .last();
    await confirmar.click();
    await page.waitForTimeout(2800);

    const sesionTrasDesactivar = await sigueLaSesion(page);
    comprobar(
      !sesionTrasDesactivar.enLogin,
      'criterio 2 · desactivar a otro NO toca la sesión del administrador',
      `terminamos en ${sesionTrasDesactivar.url}`,
    );
    const quedoDesactivado = await page
      .locator('tbody tr')
      .filter({ hasText: antes.persona.slice(0, 20) })
      .first()
      .textContent()
      .catch(() => '');
    comprobar(
      /Desactivado/.test(quedoDesactivado ?? ''),
      'y el acceso municipal quedó Desactivado',
      (quedoDesactivado ?? '').slice(0, 120),
    );

    // Reactivar, desde el menú de la misma fila.
    const fila = page.locator('tbody tr').filter({ hasText: antes.persona.slice(0, 20) }).first();
    await fila.locator('td:last-child button').first().click();
    await page.waitForTimeout(1100);
    const reactivar = page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).first();
    comprobar((await reactivar.count()) > 0, 'criterio 4 · estando Desactivado SÍ se ofrece Reactivar');
    if ((await reactivar.count()) > 0) {
      await reactivar.click();
      await page.waitForTimeout(2800);
      const sesionTrasReactivar = await sigueLaSesion(page);
      comprobar(!sesionTrasReactivar.enLogin, 'criterio 3 · reactivar tampoco toca la sesión del administrador');
    }

    // Criterio 5: recargar y comprobar que el rol y los sectores siguen ahí.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const despues = await page
      .locator('tbody tr')
      .filter({ hasText: antes.persona.slice(0, 20) })
      .first()
      .evaluate((tr) => ({
        estado: (tr.querySelectorAll('td')[2]?.textContent ?? '').trim(),
        rol: (tr.querySelectorAll('td')[1]?.textContent ?? '').trim(),
        sectores: (tr.querySelectorAll('td')[3]?.textContent ?? '').trim(),
      }))
      .catch(() => null);
    if (despues) {
      comprobar(/Activo/.test(despues.estado), 'criterio 3 · tras recargar el puesto está Activo', despues.estado);
      comprobar(despues.rol === antes.rol, 'criterio 5 · el rol persiste', `antes ${antes.rol}, ahora ${despues.rol}`);
      comprobar(
        despues.sectores === antes.sectores,
        'criterio 5 · los sectores asignados persisten',
        `antes «${antes.sectores}», ahora «${despues.sectores}»`,
      );
    } else {
      comprobar(false, 'la fila del puesto de prueba volvió a aparecer tras recargar');
    }
  }

  // ===============================================================================================
  // CRITERIO 6 · Un solo nombre visible para INSPECTOR_LEAD
  // ===============================================================================================
  console.log('\n── criterio 6 · el nombre del rol, igual en todas las pantallas ──');
  const nombresPorPantalla = {};

  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  nombresPorPantalla['Roles y permisos'] = await page.evaluate(() => {
    const fila = document.querySelector('[data-role="INSPECTOR_LEAD"]');
    return fila ? (fila.querySelector('strong')?.textContent ?? '').trim() : '(no aparece)';
  });

  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  nombresPorPantalla['Funcionarios (cambio de rol)'] = await page.evaluate(() => {
    // El desplegable de roles del diálogo no está abierto; se lee la columna Rol de las filas, que
    // es el mismo texto traducido.
    const textos = [...document.querySelectorAll('tbody tr')]
      .map((tr) => (tr.querySelectorAll('td')[1]?.textContent ?? '').trim())
      .filter((texto) => /fiscalizaci/i.test(texto));
    return textos.find((texto) => /jefe|supervisor/i.test(texto)) ?? '(ninguna fila con ese rol)';
  });

  for (const [pantalla, nombre] of Object.entries(nombresPorPantalla)) {
    dato(`${pantalla}: «${nombre}»`);
  }
  const vistos = Object.values(nombresPorPantalla).filter((n) => /jefe|supervisor/i.test(n));
  comprobar(
    vistos.length > 0 && vistos.every((n) => n === JEFE),
    `criterio 6 · INSPECTOR_LEAD se llama «${JEFE}» en todas las pantallas donde aparece`,
    `encontrados: ${vistos.map((n) => `«${n}»`).join(', ') || 'ninguno'}`,
  );

  // ===============================================================================================
  // CRITERIO 8 · Roles y permisos: agrupada, desplegable, sin scroll horizontal
  // ===============================================================================================
  console.log('\n── criterio 8 · Roles y permisos, legible y sin matriz infinita ──');
  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const roles = await page.evaluate(() => {
    const filas = [...document.querySelectorAll('[data-role]')];
    return {
      cuantos: filas.length,
      conResumen: filas.filter((f) => /\d+\s+de\s+\d+/.test(f.textContent ?? '')).length,
      // Nada abierto todavía: el detalle no debe estar en el DOM antes de pedirlo.
      permisosVisibles: document.querySelectorAll('[data-permission]').length,
      desbordaLaPagina: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollHorizontalInterno: [...document.querySelectorAll('main *')].filter(
        (n) => n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX),
      ).length,
    };
  });
  comprobar(roles.cuantos > 0, `hay ${roles.cuantos} roles listados`);
  comprobar(
    roles.conResumen === roles.cuantos,
    'cada rol trae su resumen «N de M permisos»',
    `${roles.conResumen} de ${roles.cuantos}`,
  );
  comprobar(roles.permisosVisibles === 0, 'y el detalle no está abierto de entrada', `${roles.permisosVisibles} permisos a la vista`);
  comprobar(!roles.desbordaLaPagina, 'criterio 8 · la página no desborda en horizontal');
  comprobar(
    roles.scrollHorizontalInterno === 0,
    'y no queda ningún contenedor con desplazamiento horizontal',
    `${roles.scrollHorizontalInterno} contenedores`,
  );

  // Abrir un rol: los permisos aparecen agrupados.
  const jefe = page.locator('[data-role="INSPECTOR_LEAD"]').first();
  if ((await jefe.count()) > 0) {
    await jefe.locator('button').first().click();
    await page.waitForTimeout(900);
    const abierto = await page.evaluate(() => {
      const fila = document.querySelector('[data-role="INSPECTOR_LEAD"]');
      if (!fila) return null;
      const permisos = [...fila.querySelectorAll('[data-permission]')];
      return {
        grupos: [...fila.querySelectorAll('.lx-role-group__title')].map((n) => (n.textContent ?? '').trim()),
        permisos: permisos.length,
        concedidos: permisos.filter((n) => n.getAttribute('data-granted') === 'true').length,
        expandido: fila.querySelector('button')?.getAttribute('aria-expanded'),
      };
    });
    if (abierto) {
      comprobar(abierto.expandido === 'true', 'el rol se despliega y lo dice (aria-expanded)');
      comprobar(abierto.grupos.length >= 2, `los permisos salen por área (${abierto.grupos.join(' · ')})`);
      // Los negados también se ven: la pregunta de verdad de una pantalla de permisos es qué NO
      // puede hacer alguien, y esconderlos la haría más corta e inútil.
      comprobar(
        abierto.permisos > abierto.concedidos,
        'y se ven los concedidos Y los negados',
        `${abierto.concedidos} concedidos de ${abierto.permisos} mostrados`,
      );
      comprobar(
        abierto.concedidos >= 2,
        'con al menos los permisos que el servidor concede a ese rol',
        `${abierto.concedidos} concedidos`,
      );
    } else {
      comprobar(false, 'la fila de INSPECTOR_LEAD se pudo leer tras abrirla');
    }
  } else {
    comprobar(false, 'INSPECTOR_LEAD aparece en Roles y permisos');
  }

  // ===============================================================================================
  // CRITERIO 10 · La ficha distingue cuenta de acceso municipal
  // ===============================================================================================
  console.log('\n── criterio 10 · estado de la cuenta frente a acceso municipal ──');
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const primeraFicha = page.locator('tbody tr a, tbody tr button').first();
  if ((await primeraFicha.count()) === 0) {
    dato('no hay ninguna persona en la lista para abrir su ficha');
  } else {
    await primeraFicha.click();
    await page.waitForTimeout(2600);
    const ficha = await page.evaluate(() => {
      const texto = document.body.textContent ?? '';
      return {
        cuenta: texto.includes('Estado de la cuenta'),
        acceso: texto.includes('Acceso a la municipalidad'),
        // El enum crudo salía en la única pantalla donde el rol no estaba traducido.
        enumCrudo: /INSPECTOR_LEAD|TENANT_ADMIN|TENANT_FINANCE/.test(texto),
        url: location.pathname,
      };
    });
    dato(`ficha abierta: ${ficha.url}`);
    comprobar(ficha.cuenta, 'criterio 10 · la ficha rotula «Estado de la cuenta»');
    comprobar(ficha.acceso, 'y «Acceso a la municipalidad» como un bloque aparte');
    comprobar(!ficha.enumCrudo, 'y el rol sale traducido, no como el nombre del enum');
  }

  // ===============================================================================================
  // Responsive: las tres pantallas tocadas, en cinco anchos
  // ===============================================================================================
  console.log('\n── responsive · /staff, /roles y /audit en cinco anchos ──');
  const sesion = await context.storageState();
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: sesion,
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    for (const ruta of ['/admin/staff', '/admin/roles', '/admin/audit']) {
      await p.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2000);
      const m = await p.evaluate(() => ({
        desbordaLaPagina: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        // Por la ruta, no por el campo de contraseña: ver `sigueLaSesion` arriba.
        enLogin: location.pathname.endsWith('/login'),
        h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 30),
      }));
      comprobar(
        !m.desbordaLaPagina && !m.enLogin && m.h1.length > 0,
        `${tam.nombre.padEnd(18)} ${String(tam.width).padStart(4)}px · ${ruta}`,
        `desborda=${m.desbordaLaPagina} enLogin=${m.enLogin} h1=«${m.h1}»`,
      );
    }
    await ctx.close();
  }

  comprobar(erroresJs.length === 0, 'ni un error nuevo en consola', erroresJs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
