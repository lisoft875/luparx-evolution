/**
 * Las pantallas del P0 de la guía funcional, medidas en el navegador.
 *
 * Tres preguntas, ninguna de las cuales contesta una prueba unitaria:
 *
 *   1. LA MATRIZ DICE LA VERDAD. `RolePermissionsTest` comprueba la tabla en Java; esto comprueba
 *      que lo que la PANTALLA dibuja es esa tabla y no otra. Son cosas distintas: entre una y otra
 *      hay un endpoint, un tipo de TypeScript y una celda que puede estar leyendo la columna de al
 *      lado. Los tres criterios de la §3 se verifican acá contra píxeles, no contra un EnumSet.
 *
 *   2. EL FILTRO POR MÓDULO FILTRA. Que el desplegable exista no dice nada; lo que importa es que
 *      la petición lleve `resourceType` y que la tabla deje de mostrar lo demás.
 *
 *   3. EL HISTORIAL DE UNA TARIFA CARGA. Sea con entradas o vacío, pero sin reventar y sin dejar
 *      la tarjeta en «Cargando…» para siempre.
 *
 * Y una cuarta que la instrucción del proyecto exige y que esta pantalla arriesga de verdad: una
 * matriz de dieciséis columnas es el candidato natural a desbordar un teléfono. Se mide.
 *
 *   PASS='...' node tests/responsive/roles-y-historial.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/**
 * Los criterios de aceptación de la §3, escritos como los verá alguien en la pantalla.
 *
 * `debe` y `noDebe` son nombres de permiso tal como el backend los emite. Se comprueban leyendo la
 * celda de la fila del rol, no el JSON de la respuesta: lo que se está probando es la pantalla.
 */
const CRITERIOS = [
  { rol: 'INSPECTOR', debe: ['CITATION_ISSUE'], noDebe: ['TENANT_MANAGE', 'CITATION_VOID'] },
  { rol: 'TENANT_FINANCE', debe: ['WALLET_TOPUP', 'EXPORT_RUN'], noDebe: ['TENANT_MANAGE', 'USER_WRITE'] },
  { rol: 'TENANT_SUPPORT', debe: ['AUDIT_READ'], noDebe: ['TENANT_MANAGE', 'USER_WRITE', 'CITATION_VOID'] },
];

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];

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
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  return page;
}

/** Imprime y cuenta. Un arnés que sólo dice «ok» no sirve cuando dice «✗». */
let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });

  console.log(`\n${BASE}/admin · ${CUENTA}\n`);

  const pageLogin = await entrar(context);
  const estado = await context.storageState();
  await pageLogin.close();

  const page = await context.newPage();
  const consola = [];
  page.on('pageerror', (err) => consola.push(`pageerror: ${String(err.message).slice(0, 160)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consola.push(msg.text().slice(0, 160));
  });
  const apiFallida = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      apiFallida.push(`${res.status()} ${res.url().replace(BASE, '')}`);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // 1. La matriz de roles
  // ---------------------------------------------------------------------------------------------
  console.log('── /roles · lo desplegado dice lo mismo que la tabla del servidor ──');
  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  /*
    La matriz de dieciséis columnas dejó de existir el 05-10-2026: ahora es una fila por rol que se
    despliega con los permisos agrupados por área. Así que este bloque CAMBIÓ de forma, no de
    propósito: sigue comprobando que lo que la pantalla muestra coincide con lo que el servidor
    concede, sólo que para verlo hay que abrir el rol.

    Se sigue leyendo `data-permission` / `data-granted`, que la pantalla emite justamente para esto.
    Y se sigue distinguiendo «la pantalla lo muestra negado» de «no hay fila para ese permiso»: un
    permiso ausente no es un permiso negado, y confundirlos fue el error de la primera versión.
  */
  const listados = await page.evaluate(() =>
    [...document.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role')),
  );
  comprobar(listados.length > 0, `se listan ${listados.length} roles`);
  const plataforma = listados.filter((rol) => (rol ?? '').startsWith('PLATFORM_'));
  comprobar(plataforma.length === 0, 'no se listan roles de plataforma',
    plataforma.length ? `aparecieron: ${plataforma.join(', ')}` : undefined);

  for (const criterio of CRITERIOS) {
    const fila = page.locator(`[data-role="${criterio.rol}"]`).first();
    if ((await fila.count()) === 0) {
      comprobar(false, `${criterio.rol}: no aparece en la lista de roles`);
      continue;
    }
    await fila.locator('button').first().click();
    await page.waitForTimeout(700);
    const concedidos = await fila.evaluate((nodo) => {
      const mapa = {};
      for (const item of nodo.querySelectorAll('[data-permission]')) {
        mapa[item.getAttribute('data-permission')] = item.getAttribute('data-granted') === 'true';
      }
      return mapa;
    });
    if (Object.keys(concedidos).length === 0) {
      comprobar(false, `${criterio.rol}: al abrirlo no apareció ningún permiso`);
      continue;
    }
    for (const permiso of criterio.debe) {
      comprobar(concedidos[permiso] === true, `${criterio.rol} → ${permiso}: concedido`,
        permiso in concedidos ? 'la pantalla lo muestra NEGADO' : 'no hay fila para ese permiso');
    }
    for (const permiso of criterio.noDebe) {
      comprobar(concedidos[permiso] === false, `${criterio.rol} → ${permiso}: NO concedido`,
        permiso in concedidos ? 'la pantalla lo muestra CONCEDIDO' : 'no hay fila para ese permiso');
    }
    // Cerrarlo: la pantalla abre uno a la vez, y dejarlo abierto cambia lo que mide el siguiente.
    await fila.locator('button').first().click();
    await page.waitForTimeout(400);
  }

  // ---------------------------------------------------------------------------------------------
  // 2. El filtro por módulo de la auditoría
  // ---------------------------------------------------------------------------------------------
  console.log('\n── /audit · el filtro por módulo filtra de verdad ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  // `Select` de @luparx/ui NO es un <select> nativo: es un combobox con listbox (WAI-ARIA APG),
  // porque el menú del sistema operativo es una hoja blanca sobre un portal oscuro. Así que
  // `page.locator('select')` no encuentra nada y `selectOption` no existe. La primera versión
  // buscaba lo nativo y reportó «el desplegable de módulo existe: ✗» contra una pantalla que lo
  // tenía. Se abre y se elige como lo haría una persona.
  const selector = page.getByRole('combobox', { name: 'Módulo' }).first();
  const haySelector = await selector.isVisible().catch(() => false);
  comprobar(haySelector, 'el desplegable de módulo existe');

  if (haySelector) {
    await selector.click();
    const opcion = page.getByRole('option', { name: 'Tarifas', exact: true }).first();
    const [peticion] = await Promise.all([
      page
        .waitForRequest((r) => r.url().includes('/admin/audit-events?'), { timeout: 8000 })
        .catch(() => null),
      opcion.click(),
    ]);
    comprobar(
      peticion !== null && peticion.url().includes('resourceType=parking-rate'),
      'al elegir un módulo la petición lleva resourceType',
      peticion === null ? 'no salió ninguna petición' : `salió: ${peticion.url().split('?')[1]}`,
    );
    await page.waitForTimeout(1600);
    const ajenas = await page.evaluate(() => {
      const filas = [...document.querySelectorAll('.lx-table tbody tr')];
      return filas.filter((tr) => {
        const texto = (tr.textContent || '').toLowerCase();
        return texto.includes('citation') || texto.includes('membership') || texto.includes('exemption');
      }).length;
    });
    comprobar(ajenas === 0, 'la tabla no muestra entradas de otros módulos', `quedaron ${ajenas} filas ajenas`);
  }

  // ---------------------------------------------------------------------------------------------
  // 3. El historial de una tarifa
  // ---------------------------------------------------------------------------------------------
  console.log('\n── /tariffs · quién cambió esta tarifa ──');
  await page.goto(`${BASE}/admin/tariffs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const zonaSelect = page.getByRole('combobox', { name: 'Zona' }).first();
  const hayZona = await zonaSelect.isVisible().catch(() => false);
  comprobar(hayZona, 'la tarjeta «Quién cambió esta tarifa» está en la pantalla');

  if (hayZona) {
    await zonaSelect.click();
    // La primera opción real, saltándose «Elegí una zona».
    const opciones = page.getByRole('option');
    const cuantas = await opciones.count();
    if (cuantas > 1) {
      await opciones.nth(1).click();
      await page.waitForTimeout(2200);
      const estadoTarifa = await page.evaluate(() => {
        const cuerpo = (document.body.textContent || '').replace(/\s+/g, ' ');
        return {
          cargandoParaSiempre: cuerpo.includes('Cargando…') || cuerpo.includes('Cargando...'),
          vacio: cuerpo.includes('no se ha modificado desde que se creó'),
          tablas: document.querySelectorAll('.lx-table').length,
        };
      });
      comprobar(!estadoTarifa.cargandoParaSiempre, 'el historial terminó de cargar');
      comprobar(estadoTarifa.tablas >= 2, `se dibujaron ${estadoTarifa.tablas} tablas (historial + versiones)`);
      if (estadoTarifa.vacio) {
        console.log('        (la tarifa elegida no tiene cambios registrados; es un resultado válido)');
      }
    } else {
      console.log('        (ninguna zona tiene tarifa base; no hay historial que pedir)');
    }
  }

  comprobar(apiFallida.length === 0, 'ninguna llamada a la API devolvió ≥400',
    apiFallida.slice(0, 3).join(' | '));
  comprobar(consola.length === 0, 'la consola quedó limpia', consola.slice(0, 3).join(' | '));

  await page.close();

  // ---------------------------------------------------------------------------------------------
  // 4. La matriz en cinco anchos: es el candidato natural a desbordar
  // ---------------------------------------------------------------------------------------------
  console.log('\n── /roles · responsive: ya no hay matriz, así que no debe haber scroll horizontal ──');
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    const medida = await p.evaluate(() => {
      const doc = document.documentElement;
      return {
        desbordaLaPagina: doc.scrollWidth > doc.clientWidth + 1,
        // Antes se EXIGÍA un envoltorio con desplazamiento horizontal, porque dieciséis columnas no
        // caben en ninguna pantalla y eso era lo correcto para una matriz. Desde el 05-10-2026 no
        // hay matriz, así que la expectativa se invierte: no debe quedar NINGÚN desplazamiento
        // horizontal, en ninguna parte y a ningún ancho.
        contenedoresQueDesplazan: [...document.querySelectorAll('main *')].filter(
          (n) => n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX),
        ).length,
        roles: document.querySelectorAll('[data-role]').length,
      };
    });
    const ok = !medida.desbordaLaPagina && medida.contenedoresQueDesplazan === 0 && medida.roles > 0;
    comprobar(
      ok,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · nada desborda en horizontal`,
      `desbordaLaPagina=${medida.desbordaLaPagina} contenedoresQueDesplazan=${medida.contenedoresQueDesplazan} roles=${medida.roles}`,
    );
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
