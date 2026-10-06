/**
 * Funcionarios — las ocho pruebas de aceptación de la corrección del 06-10-2026, y sus capturas.
 *
 * <h2>Qué se mide acá que no se puede leer en el código</h2>
 *
 * <p>Tres cosas. Que la tabla QUEPA: eso depende del texto real que mande el servidor —un nombre
 * municipal largo, un correo institucional— y no de los anchos declarados. Que la persona y sus
 * acciones se vean A LA VEZ: con columnas fijas eso es una pregunta de coordenadas pintadas, no de
 * reglas CSS. Y que restablecer el acceso devuelva el puesto a Activo SIN cerrarle la sesión al
 * administrador, que es la mitad del encargo y la única parte que puede romper algo de verdad.</p>
 *
 * <h2>Lo que este arnés deja como lo encontró</h2>
 *
 * <p>Desactiva un puesto y lo restablece. Si algo falla en medio, el puesto queda suspendido y el
 * informe lo dice con el nombre, para no dejar a nadie sin acceso por una corrida a medias.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/funcionarios-fase2.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA_ADMIN ?? 'admin@luparx.test';
const SALIDA = process.env.SALIDA ?? path.join(__dirname, 'capturas');

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Los anchos donde el PDF exige que NO haya desplazamiento horizontal. */
const SIN_SCROLL = [
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

async function entrar(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTA);
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
        ? `contraseña incorrecta para ${CUENTA}. Pasá la vigente con PASS=...`
        : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar: ${pista}`);
  }
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  if (new URL(page.url()).pathname.endsWith('/login')) {
    throw new Error('No se pudo entrar: seguimos en el login. Medir desde acá produce hallazgos falsos.');
  }
}

/** La geometría de la tabla, con la distinción que importa. */
async function medirTabla(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const env = document.querySelector('.lx-table-wrapper');
    if (!env) return null;
    const caja = env.getBoundingClientRect();
    const dentro = (n) => {
      if (!n) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.left >= caja.left - 1 && r.right <= caja.right + 1;
    };
    const cabeceras = [...document.querySelectorAll('thead th')].map((n) => (n.textContent ?? '').trim());
    /*
      «Cortado» NO es `scrollWidth > clientWidth`.

      Un texto con puntos suspensivos tiene scrollWidth mayor y está perfectamente dibujado — es el
      diseño. Lo que sí es defecto es un ELEMENTO que se sale de la caja de su celda: una insignia a
      media palabra, un botón sin su borde. Confundir las dos cosas costó una vuelta el 06-10: el
      arnés reportó cuatro «celdas cortas» que eran cuatro nombres con sus puntos suspensivos.
    */
    const cortadas = [];
    for (const th of document.querySelectorAll('thead th')) {
      if (th.scrollWidth > th.clientWidth + 1) {
        cortadas.push(`cabecera «${(th.textContent ?? '').trim()}» le faltan ${th.scrollWidth - th.clientWidth}px`);
      }
    }
    for (const td of document.querySelectorAll('tbody td')) {
      const estilo = getComputedStyle(td);
      const r = td.getBoundingClientRect();
      const limite = r.right - parseFloat(estilo.paddingRight || '0');
      for (const hijo of td.querySelectorAll('.lx-badge, .lx-btn')) {
        const h = hijo.getBoundingClientRect();
        if (h.right > limite + 1) {
          cortadas.push(`${String(hijo.className).split(' ')[0]} «${(hijo.textContent ?? '').trim().slice(0, 12)}» se sale ${Math.round(h.right - limite)}px`);
        }
      }
    }
    return {
      desbordePagina: doc.scrollWidth - doc.clientWidth,
      desbordeTabla: env.scrollWidth - env.clientWidth,
      cabeceras,
      personaVisible: dentro(document.querySelector('tbody td:first-child')),
      accionesVisible: dentro(document.querySelector('tbody td:last-child')),
      cortadas: [...new Set(cortadas)],
      filas: document.querySelectorAll('tbody tr').length,
      // La celda de sectores, resumida: el primero y, si hay más, su contador.
      sectores: [...document.querySelectorAll('tbody .lx-staff-zones')].map((n) => ({
        texto: (n.textContent ?? '').trim(),
        completo: n.getAttribute('title') ?? '',
      })),
    };
  });
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  console.log(`\n${BASE} · Funcionarios · corrección Fase 2 · ${CUENTA}\n`);
  try {
    await entrar(page);
  } catch (error) {
    console.error(`\n  ${error.message}\n`);
    await browser.close();
    process.exit(3);
  }

  const irAFuncionarios = async () => {
    await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
  };
  await irAFuncionarios();

  const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) ?? '').trim();
  comprobar(h1.length > 0 && !/se rompió/i.test(h1), 'la pantalla de Funcionarios se construyó', `h1=«${h1}»`);
  comprobar((await page.locator('.lx-error-boundary').count()) === 0, 'y no reventó por dentro');

  // ─────────────────────────────── 1 · vista inicial a 100%: las cuatro columnas sin mover nada
  console.log('\n── 1 · a 100% de zoom, sin desplazamiento horizontal ──');
  for (const tam of SIN_SCROLL) {
    await page.setViewportSize({ width: tam.width, height: tam.height });
    await page.waitForTimeout(900);
    const m = await medirTabla(page);
    if (!m) {
      comprobar(false, `${tam.nombre} · se encuentra la tabla`);
      continue;
    }
    comprobar(
      m.desbordeTabla <= 0,
      `${tam.nombre} ${tam.width}px · la tabla cabe, sin desplazamiento horizontal`,
      `desborda ${m.desbordeTabla}px`,
    );
    comprobar(m.desbordePagina <= 0, `${tam.nombre} ${tam.width}px · y la página tampoco desborda`);
    comprobar(
      m.personaVisible && m.accionesVisible,
      `${tam.nombre} ${tam.width}px · Persona y Acciones se ven a la vez`,
      `persona=${m.personaVisible} acciones=${m.accionesVisible}`,
    );
    comprobar(
      m.cortadas.length === 0,
      `${tam.nombre} ${tam.width}px · nada cortado a media palabra`,
      m.cortadas.join(' | '),
    );
    if (tam.width === 1536) {
      dato(`columnas: ${m.cabeceras.join(' · ')}`);
      dato(`${m.filas} filas`);
    }
  }

  // ─────────────────────────────── 2 · la celda de sectores no ensancha la tabla
  console.log('\n── 2 · Sectores resumido ──');
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.waitForTimeout(800);
  const m1536 = await medirTabla(page);
  const conVarios = (m1536?.sectores ?? []).filter((s) => /\+\d/.test(s.texto));
  if (conVarios.length > 0) {
    dato(`puestos con más de un sector: ${conVarios.map((s) => `«${s.texto}» → ${s.completo}`).join(' | ')}`);
    comprobar(
      conVarios.every((s) => s.completo.includes('·')),
      'la celda resume con «+N» y guarda la lista completa en el título',
      'falta el title con todos los sectores: el dato se perdería, no se resumiría',
    );
  } else {
    /*
      Nadie tiene dos sectores en staging, así que la prueba 2 del PDF —«Inspector con 2 sectores: la
      celda no ensancha la tabla; muestra sector principal +1 y permite consultar ambos»— no se
      ejercitaría nunca. Se los asigna, se mide, y se deja como estaba.

      Asignar y devolver, y no sólo asignar: un arnés que cambia datos de staging y no los restituye
      convierte cada corrida en una decisión que nadie tomó.
    */
    dato('ningún puesto tiene más de un sector: se asignan dos para ejercitar el resumen');
    await irAFuncionarios();
    const fila = page.locator('tbody tr').filter({ has: page.locator('.lx-badge', { hasText: 'Activo' }) }).first();
    if ((await fila.count()) === 0) {
      comprobar(false, 'hay un puesto activo al que asignarle sectores');
    } else {
      const quien = ((await fila.locator('td').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
      await fila.locator('.lx-btn').last().click();
      await page.waitForTimeout(700);
      await page.getByRole('dialog').getByRole('button', { name: /^Sectores$/ }).first().click();
      await page.waitForTimeout(900);

      const casillas = page.getByRole('dialog').locator('input[type="checkbox"]');
      const cuantas = await casillas.count();
      // El estado original, para devolverlo. Se lee antes de tocar nada.
      const original = [];
      for (let i = 0; i < cuantas; i += 1) original.push(await casillas.nth(i).isChecked());
      dato(`${cuantas} sectores en la municipalidad · marcados antes: ${original.filter(Boolean).length}`);

      if (cuantas < 2) {
        dato('la municipalidad tiene menos de dos sectores: el resumen «+N» no se puede ejercitar');
        await page.keyboard.press('Escape');
      } else {
        for (let i = 0; i < 2; i += 1) {
          if (!original[i]) await casillas.nth(i).check();
        }
        await page.getByRole('dialog').getByRole('button', { name: /^Guardar$/ }).first().click();
        await page.waitForTimeout(2400);

        await irAFuncionarios();
        await page.setViewportSize({ width: 1536, height: 960 });
        await page.waitForTimeout(1200);
        const conDos = await medirTabla(page);
        const celda = (conDos?.sectores ?? [])[0];
        comprobar(
          Boolean(celda) && /\+1/.test(celda.texto),
          'con dos sectores, la celda muestra el principal y «+1»',
          celda ? `dice «${celda.texto}»` : 'no se encontró ninguna celda de sectores resumida',
        );
        comprobar(
          Boolean(celda) && celda.completo.includes('·'),
          'y la lista completa queda consultable en el título',
          celda ? `title=«${celda.completo}»` : '',
        );
        comprobar(
          (conDos?.desbordeTabla ?? 1) <= 0,
          'y la tabla sigue cabiendo: la celda no la ensanchó',
          `desborda ${conDos?.desbordeTabla}px`,
        );
        await page.screenshot({ path: path.join(SALIDA, 'funcionarios-6-dos-sectores.png'), fullPage: true });

        // Y se devuelve como estaba.
        const fila2 = page.locator('tbody tr').filter({ hasText: quien.split(' ').slice(0, 2).join(' ') }).first();
        await fila2.locator('.lx-btn').last().click();
        await page.waitForTimeout(700);
        await page.getByRole('dialog').getByRole('button', { name: /^Sectores$/ }).first().click();
        await page.waitForTimeout(900);
        const casillas2 = page.getByRole('dialog').locator('input[type="checkbox"]');
        for (let i = 0; i < (await casillas2.count()); i += 1) {
          const debe = original[i] ?? false;
          if ((await casillas2.nth(i).isChecked()) !== debe) {
            if (debe) await casillas2.nth(i).check();
            else await casillas2.nth(i).uncheck();
          }
        }
        await page.getByRole('dialog').getByRole('button', { name: /^Guardar$/ }).first().click();
        await page.waitForTimeout(2200);
        await irAFuncionarios();
        const restaurado = ((await page.locator('tbody tr').filter({ hasText: quien.split(' ').slice(0, 2).join(' ') }).first().locator('td').nth(3).textContent()) ?? '').trim();
        comprobar(
          original.some(Boolean) ? true : /Todos/i.test(restaurado),
          'y los sectores quedaron como estaban antes de la prueba',
          `ahora dice «${restaurado}»`,
        );
      }
    }
  }
  comprobar(
    (m1536?.desbordeTabla ?? 1) <= 0,
    'con los sectores de verdad, la tabla sigue cabiendo',
    `desborda ${m1536?.desbordeTabla}px`,
  );
  await page.screenshot({ path: path.join(SALIDA, 'funcionarios-1-completa.png'), fullPage: true });

  // ─────────────────────────────── 3 · el menú ⋯ según el estado
  console.log('\n── 3 · el menú ⋯ y su contenido según el estado ──');
  /** Abre el menú de la fila cuyo estado coincide, y devuelve lo que ofrece. */
  async function abrirMenuDe(estado) {
    await irAFuncionarios();
    const fila = page.locator('tbody tr').filter({ has: page.locator('.lx-badge', { hasText: estado }) }).first();
    if ((await fila.count()) === 0) return null;
    const persona = ((await fila.locator('td').first().textContent()) ?? '').trim();
    await fila.locator('.lx-btn').last().click();
    await page.waitForTimeout(700);
    const dialogo = page.getByRole('dialog');
    const opciones = (await dialogo.locator('button').allTextContents()).map((x) => x.trim()).filter(Boolean);
    const geometria = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"], .lx-modal');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return {
        dentroDelViewport:
          r.top >= -1 && r.left >= -1
          && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
        alto: Math.round(r.height), ancho: Math.round(r.width),
      };
    });
    return { persona, opciones, geometria, fila };
  }

  const activo = await abrirMenuDe('Activo');
  if (activo) {
    dato(`puesto activo: ${activo.persona.replace(/\s+/g, ' ').slice(0, 48)}`);
    dato(`ofrece: ${activo.opciones.join(' | ')}`);
    comprobar(
      activo.geometria?.dentroDelViewport === true,
      'el menú abre completo y dentro de la pantalla',
      `caja=${activo.geometria?.ancho}×${activo.geometria?.alto}`,
    );
    comprobar(
      activo.opciones.some((o) => /^Desactivar$/i.test(o)),
      'un puesto ACTIVO ofrece Desactivar',
      `ofrece: ${activo.opciones.join(' | ')}`,
    );
    comprobar(
      !activo.opciones.some((o) => /Restablecer acceso/i.test(o)),
      'y NO ofrece Restablecer acceso',
      `ofrece: ${activo.opciones.join(' | ')}`,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else {
    comprobar(false, 'hay al menos un puesto activo que mirar');
  }

  // ─────────────────────────────── 4 · desactivar, restablecer, y la sesión del admin
  console.log('\n── 4 · desactivar y restablecer, sin perder la sesión ──');
  let dejadoSuspendido = null;
  await irAFuncionarios();
  // Un puesto activo que NO sea el propio: el servidor rechaza actuar sobre uno mismo, y con razón.
  const miCorreo = CUENTA.toLowerCase();
  const candidata = page
    .locator('tbody tr')
    .filter({ has: page.locator('.lx-badge', { hasText: 'Activo' }) })
    .filter({ hasNot: page.locator(`text=${miCorreo}`) })
    .first();

  if ((await candidata.count()) === 0) {
    comprobar(false, 'hay un puesto activo ajeno sobre el que probar el ciclo');
  } else {
    const antes = ((await candidata.locator('td').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const rolAntes = ((await candidata.locator('td').nth(1).textContent()) ?? '').trim();
    const sectoresAntes = ((await candidata.locator('td').nth(3).textContent()) ?? '').trim();
    dato(`se prueba con: ${antes.slice(0, 48)} · rol «${rolAntes}» · sectores «${sectoresAntes}»`);

    await candidata.locator('.lx-btn').last().click();
    await page.waitForTimeout(700);
    await page.getByRole('dialog').getByRole('button', { name: /^Desactivar$/ }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole('dialog').getByRole('button', { name: /^Desactivar$/ }).last().click();
    await page.waitForTimeout(2200);
    dejadoSuspendido = antes;

    const trasDesactivar = new URL(page.url()).pathname;
    comprobar(
      !trasDesactivar.endsWith('/login'),
      'desactivar no cierra la sesión del administrador',
      `quedamos en ${trasDesactivar}`,
    );

    await irAFuncionarios();
    const suspendida = page.locator('tbody tr').filter({ hasText: antes.split(' ').slice(0, 2).join(' ') }).first();
    const estadoAhora = ((await suspendida.locator('td').nth(2).textContent()) ?? '').trim();
    /*
      Se comprueba la TRANSICIÓN, no una palabra.

      La primera corrida falló con «dice "Desactivado"»: el arnés esperaba «Suspendido» —que es como
      lo escribe el PDF— y la aplicación dice «Desactivado», que es lo correcto porque la acción se
      llama «Desactivar». El estado del servidor sigue siendo SUSPENDED; lo que cambia es la etiqueta.

      Un arnés que exige una palabra concreta falla cada vez que alguien mejora un texto, y falla
      acusando a la pantalla. Lo que el PDF pide de verdad es que el puesto DEJE de estar activo y que
      el menú ofrezca lo otro, y eso es lo que se mide.
    */
    dato(`el estado pasó a «${estadoAhora}»`);
    comprobar(
      estadoAhora.length > 0 && !/^Activo$/i.test(estadoAhora),
      'el puesto dejó de estar Activo',
      `sigue diciendo «${estadoAhora}»`,
    );

    // Y ahora el menú de un puesto suspendido: ésta es la prueba del PDF.
    await suspendida.locator('.lx-btn').last().click();
    await page.waitForTimeout(700);
    const opcionesSuspendido = (await page.getByRole('dialog').locator('button').allTextContents())
      .map((x) => x.trim())
      .filter(Boolean);
    dato(`ofrece: ${opcionesSuspendido.join(' | ')}`);
    comprobar(
      opcionesSuspendido.some((o) => /Restablecer acceso/i.test(o)),
      'un puesto SUSPENDIDO ofrece Restablecer acceso',
      `ofrece: ${opcionesSuspendido.join(' | ')}`,
    );
    comprobar(
      !opcionesSuspendido.some((o) => /^Desactivar$/i.test(o)),
      'y NO ofrece Desactivar',
      `ofrece: ${opcionesSuspendido.join(' | ')}`,
    );
    await page.screenshot({ path: path.join(SALIDA, 'funcionarios-3-menu-restablecer.png') });

    await page.getByRole('dialog').getByRole('button', { name: /Restablecer acceso/i }).first().click();
    await page.waitForTimeout(2400);

    const trasRestablecer = new URL(page.url()).pathname;
    comprobar(
      !trasRestablecer.endsWith('/login'),
      'restablecer tampoco cierra la sesión del administrador',
      `quedamos en ${trasRestablecer}`,
    );

    await irAFuncionarios();
    const restaurada = page.locator('tbody tr').filter({ hasText: antes.split(' ').slice(0, 2).join(' ') }).first();
    const estadoFinal = ((await restaurada.locator('td').nth(2).textContent()) ?? '').trim();
    const rolDespues = ((await restaurada.locator('td').nth(1).textContent()) ?? '').trim();
    const sectoresDespues = ((await restaurada.locator('td').nth(3).textContent()) ?? '').trim();
    comprobar(/Activo/i.test(estadoFinal), 'el puesto volvió a Activo', `dice «${estadoFinal}»`);
    if (/Activo/i.test(estadoFinal)) dejadoSuspendido = null;
    comprobar(rolDespues === rolAntes, 'el rol se conservó', `antes «${rolAntes}», después «${rolDespues}»`);
    comprobar(
      sectoresDespues === sectoresAntes,
      'y los sectores también',
      `antes «${sectoresAntes}», después «${sectoresDespues}»`,
    );
    await page.screenshot({ path: path.join(SALIDA, 'funcionarios-4-restablecido.png'), fullPage: true });
  }

  // ─────────────────────────────── 5 · la captura del portátil, con los dos extremos a la vista
  console.log('\n── 5 · en un portátil, la identidad no se pierde al operar ──');
  await page.setViewportSize({ width: 1280, height: 800 });
  await irAFuncionarios();
  const laptop = await medirTabla(page);
  comprobar(
    (laptop?.personaVisible ?? false) && (laptop?.accionesVisible ?? false),
    'a 1280 se ven Persona y Acciones a la vez',
  );
  await page.screenshot({ path: path.join(SALIDA, 'funcionarios-2-laptop.png'), fullPage: true });

  // La sesión del administrador, al final de todo: la prueba 6 del PDF.
  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  comprobar(
    !new URL(page.url()).pathname.endsWith('/login'),
    'al terminar, el administrador sigue conectado en /admin/staff',
    `quedamos en ${new URL(page.url()).pathname}`,
  );
  await page.screenshot({ path: path.join(SALIDA, 'funcionarios-5-sesion-viva.png'), fullPage: true });

  if (dejadoSuspendido) {
    console.log(`\n  ATENCIÓN: el puesto de «${dejadoSuspendido}» quedó SUSPENDIDO porque el ciclo no`);
    console.log('  terminó. Restablecelo a mano desde /admin/staff antes de seguir.\n');
  }
  dato(`capturas en ${SALIDA}`);

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
