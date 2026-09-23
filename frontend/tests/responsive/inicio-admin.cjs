/**
 * La portada del administrador, medida en ocho anchos.
 *
 * Esto NO es el detector de desborde (`mobile-overflow.cjs`) ni el del pliegue
 * (`sobre-el-pliegue.cjs`): aquellos barren todas las rutas buscando un defecto genérico. Acá se
 * comprueba UNA pantalla contra lo que su especificación dice que tiene que hacer (23-09-2026), que
 * son cosas que ningún barrido genérico puede saber:
 *
 *   1. QUE NO ESTÉ VACÍA. El defecto que originó el trabajo: /admin mostraba el nombre de la app y
 *      tres enlaces sueltos. Se verifica que los cuatro KPIs existan y tengan un valor.
 *
 *   2. QUE NO HAYA DATOS DEL MOCKUP. La §17 lo prohíbe explícitamente. Los números de la imagen de
 *      referencia —1.248.350, 342, 28, 78%— no pueden aparecer salvo que la base los produzca, y en
 *      staging no los produce. Encontrarlos significa que alguien los dejó escritos.
 *
 *   3. QUE NINGÚN NÚMERO SEA `undefined`, `null` ni `NaN`. La §14 lo pide y es el modo en que un
 *      tablero falla sin fallar: la pantalla se dibuja entera y una cifra dice «NaN».
 *
 *   4. RESPONSIVE DE VERDAD, en los ocho tamaños que pide el proyecto. Se mide, no se mira: cuántos
 *      KPIs por fila, si hay desborde horizontal, si algo se encima, y si los blancos táctiles
 *      llegan a 44px en los tamaños de dedo.
 *
 *   node tests/responsive/inicio-admin.cjs
 *   PASS='...' node tests/responsive/inicio-admin.cjs
 *   BASE=http://localhost:5183 node tests/responsive/inicio-admin.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

/**
 * Una contraseña de relleno cuenta como intento fallido y le rearma el bloqueo a la cuenta —cinco
 * por cuenta cada quince minutos, y la ventana se reinicia con CADA fallo—. Se corta antes de tocar
 * la red. Ya pasó una vez con `<la de demostración>` pegado literal.
 */
if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/**
 * Los ocho tamaños que el proyecto exige. `visible` es lo que de verdad le queda a la página
 * después de las barras del navegador; en escritorio la ventana ES el alto útil.
 */
const TAMANOS = [
  { nombre: 'móvil chico',      width: 320, height: 568, dedo: true,  kpisEsperados: 1 },
  { nombre: 'móvil estándar',   width: 390, height: 664, dedo: true,  kpisEsperados: 1 },
  { nombre: 'móvil grande',     width: 430, height: 745, dedo: true,  kpisEsperados: 1 },
  { nombre: 'tablet vertical',  width: 768, height: 1024, dedo: true, kpisEsperados: 2 },
  { nombre: 'tablet apaisada',  width: 1024, height: 768, dedo: true, kpisEsperados: 4 },
  { nombre: 'laptop',           width: 1280, height: 800, dedo: false, kpisEsperados: 4 },
  { nombre: 'escritorio',       width: 1440, height: 900, dedo: false, kpisEsperados: 4 },
  { nombre: 'escritorio grande',width: 1920, height: 1080, dedo: false, kpisEsperados: 4 },
];

/** Los números de la imagen de referencia. Ninguno puede salir de la base en staging. */
const CIFRAS_DEL_MOCKUP = ['1,248,350', '1.248.350', '1248350'];

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

  // Distinguir las dos formas de no entrar, porque la reacción es distinta: con 401 hay que
  // corregir la contraseña; con 429 hay que ESPERAR, y reintentar sólo alarga el bloqueo.
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

async function medir(page, dedo) {
  return page.evaluate((esDedo) => {
    const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    // --- desborde horizontal ---
    const desborde = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const anchos = [];
    for (const el of document.querySelectorAll('main *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      if (b.right > document.documentElement.clientWidth + 1) {
        anchos.push({ texto: rec(el.textContent).slice(0, 40), derecha: Math.round(b.right) });
      }
    }

    // --- KPIs: cuántos hay y cuántos por fila ---
    const tarjetas = [...document.querySelectorAll('.lx-home-kpis .lx-card')];
    const kpis = tarjetas.map((el) => {
      const b = el.getBoundingClientRect();
      return {
        label: rec(el.querySelector('.lx-stat-card__label')?.textContent),
        value: rec(el.querySelector('.lx-stat-card__value')?.textContent),
        top: Math.round(b.top),
      };
    });
    const primeraFila = kpis.length > 0 ? kpis.filter((k) => k.top === kpis[0].top).length : 0;

    // --- cifras rotas: lo que la §14 prohíbe mostrar ---
    const textoPagina = rec(document.querySelector('main')?.textContent);
    const rotas = ['undefined', 'null', 'NaN', 'Infinity', '[object Object]'].filter((mala) =>
      new RegExp(`\\b${mala}\\b`).test(textoPagina),
    );

    // --- encimados: dos bloques hermanos que se pisan ---
    const encimados = [];
    const bloques = [...document.querySelectorAll('.lx-home-kpis .lx-card, .lx-home-split > .lx-card')];
    for (let i = 0; i < bloques.length; i++) {
      for (let j = i + 1; j < bloques.length; j++) {
        const a = bloques[i].getBoundingClientRect();
        const b = bloques[j].getBoundingClientRect();
        const cruza = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (cruza) encimados.push([i, j]);
      }
    }

    // --- blancos táctiles ---
    const chicos = [];
    if (esDedo) {
      for (const el of document.querySelectorAll('main a, main button')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        // Las barras del gráfico son columnas altas y finas: el alto es lo que importa para el dedo
        // y el ancho lo reparte la cantidad de días, así que se miden sólo por alto.
        const esBarra = el.classList.contains('lx-bars__col');
        const falla = esBarra ? b.height < 44 : b.height < 44 && b.width < 44;
        if (falla) chicos.push({ texto: rec(el.textContent).slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) });
      }
    }

    // --- el gráfico y la franja existen y no están recortados ---
    const barras = document.querySelectorAll('.lx-bars__col').length;
    const franja = document.querySelectorAll('.lx-status-strip__item').length;
    const zonas = document.querySelectorAll('.lx-zone-bar').length;
    const accesos = document.querySelectorAll('.lx-quick-action').length;

    // Las fechas del eje no pueden encimarse: si la siguiente empieza antes de que termine la
    // anterior, el eje es ilegible aunque el layout "funcione".
    const etiquetas = [...document.querySelectorAll('.lx-bars__col-label')].map((el) => el.getBoundingClientRect());
    let ejesEncimados = 0;
    for (let i = 1; i < etiquetas.length; i++) {
      if (etiquetas[i].left < etiquetas[i - 1].right - 1) ejesEncimados++;
    }

    return { desborde, anchos: anchos.slice(0, 4), kpis, primeraFila, rotas, encimados, chicos: chicos.slice(0, 5), barras, franja, zonas, accesos, ejesEncimados, textoPagina };
  }, dedo);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'es-CR', ignoreHTTPSErrors: true });
  let fallos = 0;

  console.log(`\n${BASE}/admin · ${CUENTA}\n`);

  const pageLogin = await entrar(context);
  const estado = await context.storageState();
  await pageLogin.close();

  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: tam.width, height: tam.height },
      deviceScaleFactor: tam.dedo ? 3 : 2,
      isMobile: tam.dedo && tam.width < 700,
      hasTouch: tam.dedo,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      // El Inicio hace tres consultas; se espera a que las barras o el vacío del gráfico existan.
      await page.waitForTimeout(2600);
      const r = await medir(page, tam.dedo);

      const problemas = [];
      if (r.kpis.length !== 4) problemas.push(`hay ${r.kpis.length} KPIs y deberían ser 4`);
      for (const kpi of r.kpis) {
        if (!kpi.value) problemas.push(`el KPI "${kpi.label}" no tiene valor`);
      }
      if (r.primeraFila !== tam.kpisEsperados) {
        problemas.push(`${r.primeraFila} KPIs en la primera fila, se esperaban ${tam.kpisEsperados}`);
      }
      if (r.desborde) problemas.push(`desborde horizontal${r.anchos.length ? `: "${r.anchos[0].texto}" llega a ${r.anchos[0].derecha}px` : ''}`);
      if (r.rotas.length > 0) problemas.push(`cifras rotas en pantalla: ${r.rotas.join(', ')}`);
      if (r.encimados.length > 0) problemas.push(`${r.encimados.length} bloques encimados`);
      if (r.chicos.length > 0) problemas.push(`blanco táctil chico: "${r.chicos[0].texto}" ${r.chicos[0].w}x${r.chicos[0].h}`);
      if (r.franja === 0) problemas.push('falta la franja de estado del sistema');
      if (r.accesos === 0) problemas.push('faltan los accesos rápidos');
      if (r.ejesEncimados > 0) problemas.push(`${r.ejesEncimados} fechas del eje encimadas`);
      for (const cifra of CIFRAS_DEL_MOCKUP) {
        if (r.textoPagina.includes(cifra)) problemas.push(`DATO DEL MOCKUP EN PANTALLA: ${cifra}`);
      }

      if (problemas.length === 0) {
        console.log(`  ok  ${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · ${r.kpis.length} KPIs (${r.primeraFila}/fila) · ${r.barras} barras · ${r.zonas} zonas · ${r.accesos} accesos`);
      } else {
        fallos++;
        console.log(`  ✗   ${tam.nombre.padEnd(18)} ${tam.width}x${tam.height}`);
        for (const p of problemas) console.log(`        ${p}`);
      }
    } catch (e) {
      fallos++;
      console.log(`  ?   ${tam.nombre} — ${String(e.message).split('\n')[0]}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${TAMANOS.length} tamaños · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
