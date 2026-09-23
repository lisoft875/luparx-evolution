/**
 * El menú lateral se queda donde lo dejaron.
 *
 * Reportado el 23-09-2026: bajando en el menú del administrador para llegar a Reclamos o a
 * Exoneraciones, el menú se va solo hasta arriba y hay que volver a buscar.
 *
 * La causa no era un efecto ni un `scrollIntoView` —no existe ninguno en el frontend— sino la forma
 * del árbol: las 23 pantallas del portal montan cada una su propio `AdminShell`, así que navegar
 * desmonta un `<nav>` y monta otro. No se perdía la posición: se estrenaba un elemento distinto, y
 * un elemento recién nacido tiene `scrollTop = 0`.
 *
 * Lo que se mide acá es el comportamiento, no la causa, para que la prueba siga valiendo si mañana
 * el shell pasa a una ruta de layout:
 *
 *   1. bajar el menú hasta el final, soltar y esperar: tiene que seguir ahí;
 *   2. navegar a otra ruta: el menú vuelve a la MISMA posición;
 *   3. mover el contenido principal: el menú no se mueve;
 *   4. con la ventana baja, donde el menú desborda de verdad, repetir 1 y 2.
 *
 *   node tests/responsive/menu-lateral-scroll.cjs
 *   PASS='...' node tests/responsive/menu-lateral-scroll.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Alto normal y alto bajo. El segundo es el que fuerza el desborde del menú (§7, «ventana baja»). */
const VENTANAS = [
  { nombre: 'escritorio', width: 1440, height: 900 },
  { nombre: 'ventana baja', width: 1440, height: 560 },
];

const SELECTOR = '.lx-page-layout__sidebar';

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
    console.error('Cuenta bloqueada por intentos fallidos. Esperar 15 min o usar CUENTA=otra@luparx.test');
    process.exit(3);
  }
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}.`);
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

/** El estado del menú: dónde está y cuánto puede bajar. */
async function menu(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      scrollTop: Math.round(el.scrollTop),
      // Cuánto se puede bajar en total. Si es 0, el menú no desborda y la prueba no prueba nada:
      // hay que decirlo en vez de dar un falso «ok».
      recorrido: Math.round(el.scrollHeight - el.clientHeight),
    };
  }, SELECTOR);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'es-CR', ignoreHTTPSErrors: true });
  let fallos = 0;

  console.log(`\n${BASE}/admin · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  const estado = await context.storageState();
  await pageLogin.close();

  for (const ventana of VENTANAS) {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: ventana.width, height: ventana.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    const problemas = [];
    try {
      await page.goto(`${BASE}/admin/zones`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const inicial = await menu(page);
      if (!inicial) {
        problemas.push(`no se encontró el menú (${SELECTOR}) — ¿la sesión cayó al login?`);
      } else if (inicial.recorrido <= 0) {
        // No es un fallo del menú: es que en este alto no desborda, y entonces esta prueba no
        // puede decir nada. Decirlo es más honesto que reportar «ok».
        problemas.push(`el menú no desborda en ${ventana.height}px (recorrido 0): la prueba no aplica acá`);
      } else {
        // --- 1. bajar hasta el final y esperar ---
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          el.scrollTop = el.scrollHeight;
        }, SELECTOR);
        await page.waitForTimeout(1200);
        const trasSoltar = await menu(page);
        if (trasSoltar.scrollTop === 0) {
          problemas.push('se fue solo hasta arriba después de bajarlo y soltar');
        }
        const dondeQuedo = trasSoltar.scrollTop;

        // --- 3. mover el contenido principal no debe moverlo ---
        await page.mouse.move(ventana.width - 200, ventana.height / 2);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(700);
        const trasRueda = await menu(page);
        if (Math.abs(trasRueda.scrollTop - dondeQuedo) > 4) {
          problemas.push(
            `mover el contenido principal movió el menú: ${dondeQuedo} → ${trasRueda.scrollTop}`,
          );
        }

        // --- 2. navegar y volver a mirar ---
        await page.click('a[href$="/admin/audit"], a[href="/audit"]').catch(() => {});
        await page.waitForTimeout(2000);
        const trasNavegar = await menu(page);
        if (!trasNavegar) {
          problemas.push('el menú desapareció tras navegar');
        } else if (Math.abs(trasNavegar.scrollTop - dondeQuedo) > 8) {
          problemas.push(
            `al cambiar de ruta el menú volvió a ${trasNavegar.scrollTop} (estaba en ${dondeQuedo})`,
          );
        }
      }
    } catch (e) {
      problemas.push(String(e.message).split('\n')[0]);
    }

    if (problemas.length === 0) {
      const m = await menu(page);
      console.log(`  ok  ${ventana.nombre.padEnd(14)} ${ventana.width}x${ventana.height} · el menú se queda en ${m ? m.scrollTop : '?'}px`);
    } else {
      fallos++;
      console.log(`  ✗   ${ventana.nombre.padEnd(14)} ${ventana.width}x${ventana.height}`);
      for (const p of problemas) console.log(`        ${p}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${VENTANAS.length} ventanas · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
