/**
 * ¿Cabe lo importante en la primera pantalla, sin hacer scroll?
 *
 * Esto NO es el detector de desborde (`mobile-overflow.cjs`): aquel mide si algo se sale de lado.
 * Acá el defecto es vertical y no se sale de ningún lado — simplemente queda más abajo del pliegue,
 * y la persona no sabe que está. Reportado el 2026-09-19 en un iPhone 14 Pro Max: para «agregar un
 * vehículo» había que hacer scroll, aunque el botón vive en la cabecera de la pantalla.
 *
 * Tres cosas que mide y por qué cada una:
 *
 *   1. ALTO DECLARADO vs VISIBLE. En Safari de iPhone `100vh` es la altura con la barra de
 *      herramientas retraída, mayor que lo que se ve. Un shell con `min-height: 100vh` se declara
 *      más alto que la pantalla y empuja fuera lo que esté anclado abajo. Se emula reduciendo el
 *      viewport a la altura real que deja Safari con sus barras.
 *
 *   2. ACCIONES BAJO EL PLIEGUE. Cada botón/enlace principal de la pantalla: ¿su borde inferior
 *      cae dentro del alto visible? Un botón a 940px en una pantalla de 932 es invisible aunque el
 *      DOM diga que está.
 *
 *   3. TAPADO POR EL CROMO. Un elemento puede estar dentro del alto visible y aun así quedar
 *      debajo de la barra de pestañas fija o de la cabecera sticky. Se mide con el rectángulo real
 *      de esas barras, no suponiendo su altura.
 *
 *   node tests/responsive/sobre-el-pliegue.cjs
 *   BASE=http://localhost:5183 node tests/responsive/sobre-el-pliegue.cjs
 *   PORTAL=inspector node tests/responsive/sobre-el-pliegue.cjs
 */
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const PORTAL = process.env.PORTAL ?? 'citizen';

const CUENTAS = {
  citizen: 'ana.morales@luparx.test',
  inspector: 'inspector@luparx.test',
  admin: 'admin@luparx.test',
};
const PREFIJO = { citizen: '', admin: '/admin', inspector: '/inspector' };

const RUTAS = {
  citizen: ['/', '/vehicles', '/wallet', '/movements', '/fines', '/notifications', '/more', '/profile'],
  inspector: ['/', '/queue', '/citations', '/plate-lookup', '/profile'],
  admin: ['/', '/zones', '/users', '/audit'],
};

/**
 * La altura del navegador NO es la del teléfono. En un iPhone 14 Pro Max la pantalla son 932pt
 * pero Safari se queda con la barra de direcciones y la de herramientas; a la página le quedan
 * ~745. Medir a 932 es justamente el error que esconde este defecto, así que cada perfil trae
 * `visible`: lo que de verdad ve la persona.
 */
const TELEFONOS = [
  { nombre: 'iPhone SE',        viewport: { width: 375, height: 667 }, visible: 553 },
  { nombre: 'iPhone 14',        viewport: { width: 390, height: 844 }, visible: 664 },
  { nombre: 'iPhone 14 Pro Max',viewport: { width: 430, height: 932 }, visible: 745 },
  { nombre: 'Pixel 7',          viewport: { width: 412, height: 915 }, visible: 728 },
  { nombre: 'Galaxy S8 chico',  viewport: { width: 360, height: 740 }, visible: 592 },
];

async function medir(page, altoVisible) {
  return page.evaluate((visible) => {
    const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);

    // El cromo fijo/sticky real, medido y no supuesto.
    let topeCromo = 0;
    let pisoCromo = visible;
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      const b = el.getBoundingClientRect();
      if (b.height === 0 || b.width === 0) continue;
      if (b.top <= 1 && b.bottom > topeCromo && b.bottom < visible / 2) topeCromo = b.bottom;
      if (b.bottom >= visible - 2 && b.top < pisoCromo && b.top > visible / 2) pisoCromo = b.top;
    }

    // Acciones: lo que la persona vino a tocar.
    const acciones = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // Las que viven DENTRO del cromo (pestañas, campana) no cuentan: siempre están a la vista.
      if (el.closest('.lx-bottom-tab-bar, .lx-top-chrome, .lx-app-bar')) continue;
      const texto = rec(el.textContent) || rec(el.getAttribute('aria-label'));
      if (!texto) continue;
      acciones.push({
        texto,
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        fueraDelPliegue: b.top >= visible,
        tapadaAbajo: b.bottom > pisoCromo && b.top < pisoCromo,
        tapadaArriba: b.top < topeCromo && b.bottom > 0,
      });
    }

    const doc = document.documentElement;
    return {
      altoDeclarado: doc.scrollHeight,
      altoVisible: visible,
      topeCromo: Math.round(topeCromo),
      pisoCromo: Math.round(pisoCromo),
      espacioUtil: Math.round(pisoCromo - topeCromo),
      acciones,
      // La primera acción de la pantalla es la que más importa: si esa ya exige scroll, el
      // diseño está mal ordenado, no "un poco largo".
      primeraAccion: acciones[0] ?? null,
    };
  }, altoVisible);
}

async function entrar(page, portal) {
  const prefijo = PREFIJO[portal];
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTAS[portal]);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2200);

  // El selector de municipalidad se disfraza de pantalla real. Se busca el botón que CONTIENE el
  // nombre (la ficha trae además la insignia «Ya la usás»), no un texto exacto.
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
}

(async () => {
  const browser = await chromium.launch();
  let problemas = 0;
  let vistas = 0;

  console.log(`\n${BASE}${PREFIJO[PORTAL]} · ${CUENTAS[PORTAL]}`);
  console.log('Alto "visible" = lo que queda para la página después de las barras del navegador.\n');

  for (const tel of TELEFONOS) {
    console.log(`\n########## ${tel.nombre}  ${tel.viewport.width}x${tel.viewport.height} (visible ${tel.visible}) ##########`);
    const ctx = await browser.newContext({
      // La altura del contexto ES la visible: así el navegador reporta lo mismo que ve la persona.
      viewport: { width: tel.viewport.width, height: tel.visible },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    try {
      await entrar(page, PORTAL);
    } catch (e) {
      console.log(`  (login: ${String(e.message).split('\n')[0]})`);
    }

    for (const ruta of RUTAS[PORTAL]) {
      try {
        await page.goto(`${BASE}${PREFIJO[PORTAL]}${ruta}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1100);
        const r = await medir(page, tel.visible);
        vistas++;

        const malas = r.acciones.filter((a) => a.fueraDelPliegue || a.tapadaAbajo || a.tapadaArriba);
        const primeraExigeScroll = r.primeraAccion && r.primeraAccion.fueraDelPliegue;

        if (malas.length === 0) {
          console.log(`  ok  ${ruta}  · útil ${r.espacioUtil}px · ${r.acciones.length} acciones a la vista`);
          continue;
        }
        problemas++;
        console.log(`  ✗   ${ruta}  · útil ${r.espacioUtil}px · alto ${r.altoDeclarado}px`);
        if (primeraExigeScroll) {
          console.log(`        LA PRIMERA ACCIÓN EXIGE SCROLL: "${r.primeraAccion.texto}" empieza en ${r.primeraAccion.top}px`);
        }
        for (const a of malas.slice(0, 5)) {
          const causa = a.tapadaAbajo
            ? `tapada por la barra inferior (empieza ${a.top}, la barra en ${r.pisoCromo})`
            : a.tapadaArriba
              ? `tapada por la cabecera (termina ${a.bottom}, la cabecera hasta ${r.topeCromo})`
              : `fuera del pliegue (empieza en ${a.top}, se ve hasta ${r.altoVisible})`;
          console.log(`        "${a.texto}" — ${causa}`);
        }
      } catch (e) {
        console.log(`  ?   ${ruta} — ${String(e.message).split('\n')[0]}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${vistas} vistas · ${problemas} con acciones fuera de la vista =====`);
  process.exit(problemas > 0 ? 1 : 0);
})();
