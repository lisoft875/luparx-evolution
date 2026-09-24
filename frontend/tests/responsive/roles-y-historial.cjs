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
  console.log('── /roles · la matriz dice lo mismo que la tabla del servidor ──');
  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const matriz = await page.evaluate(() => {
    const tabla = document.querySelector('.lx-table');
    if (!tabla) return null;
    // Las cabeceras traen la etiqueta traducida, no el nombre del permiso, así que el índice de
    // cada columna se toma del orden y se cruza con el <code> del rol, que sí es el nombre crudo.
    const encabezados = [...tabla.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim());
    const filas = [...tabla.querySelectorAll('tbody tr')].map((tr) => {
      const celdas = [...tr.querySelectorAll('td')];
      const codigo = tr.querySelector('code');
      return {
        rol: (codigo?.textContent || '').trim(),
        celdas: celdas.map((td) => (td.textContent || '').trim()),
      };
    });
    return { encabezados, filas };
  });

  if (matriz === null) {
    comprobar(false, 'la tabla de la matriz no se dibujó', `consola: ${consola.slice(0, 2).join(' | ') || 'limpia'}`);
  } else {
    comprobar(matriz.filas.length > 0, `la matriz tiene ${matriz.filas.length} roles`);
    // Ningún rol de plataforma debe asomar en el portal de una municipalidad.
    const plataforma = matriz.filas.filter((f) => f.rol.startsWith('PLATFORM_'));
    comprobar(plataforma.length === 0, 'no se listan roles de plataforma',
      plataforma.length ? `aparecieron: ${plataforma.map((f) => f.rol).join(', ')}` : undefined);

    // El permiso de cada columna se resuelve por su posición: las dos primeras son Rol y Portal.
    const permisos = await page.evaluate(() =>
      fetch('/api/v1/admin/roles', { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : []))
        .then((filas) => [...new Set(filas.flatMap((f) => f.permissions))].sort())
        .catch(() => []),
    );

    for (const criterio of CRITERIOS) {
      const fila = matriz.filas.find((f) => f.rol === criterio.rol);
      if (!fila) {
        comprobar(false, `${criterio.rol}: no aparece en la matriz`);
        continue;
      }
      for (const permiso of criterio.debe) {
        const i = permisos.indexOf(permiso);
        const concedido = i >= 0 && fila.celdas[i + 2] === '●';
        comprobar(concedido, `${criterio.rol} → ${permiso}: concedido`,
          i < 0 ? 'ese permiso no existe en la respuesta del servidor' : `la celda dice «${fila.celdas[i + 2]}»`);
      }
      for (const permiso of criterio.noDebe) {
        const i = permisos.indexOf(permiso);
        const negado = i < 0 || fila.celdas[i + 2] !== '●';
        comprobar(negado, `${criterio.rol} → ${permiso}: NO concedido`,
          `la celda dice «${fila.celdas[i + 2]}», que es un permiso que este rol no debería tener`);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 2. El filtro por módulo de la auditoría
  // ---------------------------------------------------------------------------------------------
  console.log('\n── /audit · el filtro por módulo filtra de verdad ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const selector = page.locator('select').filter({ hasText: 'Todos los módulos' }).first();
  const haySelector = await selector.isVisible().catch(() => false);
  comprobar(haySelector, 'el desplegable de módulo existe');

  if (haySelector) {
    const [peticion] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/admin/audit-events?') || r.url().includes('/admin/audit-events&'), {
        timeout: 8000,
      }).catch(() => null),
      selector.selectOption('parking-rate'),
    ]);
    comprobar(
      peticion !== null && peticion.url().includes('resourceType=parking-rate'),
      'al elegir un módulo la petición lleva resourceType',
      peticion === null ? 'no salió ninguna petición' : `salió: ${peticion.url().split('?')[1]}`,
    );
    await page.waitForTimeout(1600);
    // Y lo que queda en pantalla es de ese módulo. Con cero filas también pasa —una municipalidad
    // recién sembrada puede no haber tocado una tarifa— y eso no es un fallo del filtro.
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

  const zonaSelect = page.locator('select').filter({ hasText: 'Elegí una zona' }).first();
  const hayZona = await zonaSelect.isVisible().catch(() => false);
  comprobar(hayZona, 'la tarjeta «Quién cambió esta tarifa» está en la pantalla');

  if (hayZona) {
    const opciones = await zonaSelect.locator('option').count();
    if (opciones > 1) {
      await zonaSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      const estado = await page.evaluate(() => {
        const cuerpo = (document.body.textContent || '').replace(/\s+/g, ' ');
        return {
          cargandoParaSiempre: cuerpo.includes('Cargando…') || cuerpo.includes('Cargando...'),
          // Vacío es un resultado legítimo: una tarifa recién sembrada no se ha modificado.
          vacio: cuerpo.includes('no se ha modificado desde que se creó'),
          tablas: document.querySelectorAll('.lx-table').length,
        };
      });
      comprobar(!estado.cargandoParaSiempre, 'el historial terminó de cargar');
      comprobar(estado.tablas >= 2, `se dibujaron ${estado.tablas} tablas (historial + versiones)`);
      if (estado.vacio) console.log('        (la tarifa elegida no tiene cambios registrados; es un resultado válido)');
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
  console.log('\n── /roles · responsive, que es donde una tabla de 18 columnas se rompe ──');
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
      const envoltorio = document.querySelector('.lx-table-wrapper');
      return {
        // El desborde que importa es el de la PÁGINA. Que la tabla sea más ancha que la pantalla es
        // correcto y esperado: para eso su envoltorio desplaza en horizontal.
        desbordaLaPagina: doc.scrollWidth > doc.clientWidth + 1,
        envoltorioDesplaza: envoltorio ? getComputedStyle(envoltorio).overflowX === 'auto' : false,
        tablaMasAncha: envoltorio ? envoltorio.scrollWidth > envoltorio.clientWidth : false,
        primeraFija: Boolean(document.querySelector('.lx-table-sticky-first')),
      };
    });
    const ok = !medida.desbordaLaPagina && medida.envoltorioDesplaza && medida.primeraFija;
    comprobar(
      ok,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · la página no desborda, la tabla se desplaza sola`,
      `desbordaLaPagina=${medida.desbordaLaPagina} envoltorioDesplaza=${medida.envoltorioDesplaza} primeraFija=${medida.primeraFija}`,
    );
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
