/**
 * Capturas de referencia ANTES de migrar a Tailwind, y comparación DESPUÉS.
 *
 * Este archivo es la red de seguridad de la migración: sin él, "no rompí nada" es una opinión.
 * Con él es un número — cuántos píxeles cambiaron y en qué pantalla.
 *
 *   node tests/visual/snapshot.cjs --base      # captura la referencia (ANTES de migrar)
 *   node tests/visual/snapshot.cjs             # compara contra la referencia (DESPUÉS)
 *
 * Variables: BASE (default staging), PASS (default DemoLupaRX2026).
 *
 * ⚠️ POR DEFECTO MIDE **STAGING**, NO TU BUILD LOCAL.
 *
 * Eso es correcto para verificar un despliegue, y ENGAÑOSO para verificar un cambio que todavía no
 * desplegaste: el 2026-09-18 se reemplazó la paleta entera y esta herramienta informó "0 con layout
 * distinto" porque estaba comparando el código viejo de staging contra sí mismo. Un arnés que dice
 * que todo está bien cuando no lo midió es peor que no tener arnés.
 *
 * Para medir lo que acabás de compilar, servílo y apuntá BASE ahí:
 *
 *   npm run build
 *   npx --yes serve -s apps/citizen/dist -l 4173   (o cualquier servidor estático)
 *   BASE=http://localhost:4173 node tests/visual/snapshot.cjs
 *
 * Ojo: servido así, cada portal es su propia raíz (no hay /admin/ ni /inspector/), así que hay que
 * levantar uno por vez. Contra staging los cuatro conviven bajo un mismo dominio.
 *
 * Por qué capturas propias y no `toHaveScreenshot` de @playwright/test: el repo tiene
 * `playwright` a secas, no `@playwright/test`, y agregar el runner completo para esto es más
 * dependencia de la que hace falta. La comparación píxel a píxel son treinta líneas.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const MODO_BASE = process.argv.includes('--base');

const DIR = path.join(__dirname, MODO_BASE ? 'referencia' : 'actual');
const DIR_REF = path.join(__dirname, 'referencia');
const DIR_DIFF = path.join(__dirname, 'diferencias');

const CUENTAS = {
  citizen: 'ana.morales@luparx.test',
  admin: 'admin@luparx.test',
  inspector: 'inspector@luparx.test',
  platform: 'platform@luparx.test',
};
const PREFIJO = { citizen: '', admin: '/admin', inspector: '/inspector', platform: '/platform' };

/** Las pantallas que de verdad importan, no todas: una migración se juzga por lo que se ve seguido. */
const PANTALLAS = {
  // Rutas verificadas contra los App.tsx de cada portal. Un nombre inventado NO falla: el router
  // cae a la ruta raíz y la captura sale idéntica a la de inicio, o sea una referencia falsa que
  // dice "ok" para siempre. Pasó con `/admin/citations` (no existe) y `/inspector/my-citations`
  // (es `/citations`): cuatro de cuarenta capturas eran duplicados exactos de la portada.
  citizen: ['/', '/wallet', '/movements', '/fines', '/vehicles', '/profile'],
  admin: ['/', '/dashboard', '/zones', '/tariffs', '/audit', '/users', '/appeals', '/exemptions'],
  inspector: ['/', '/queue', '/citations', '/profile'],
  platform: ['/tenants', '/users', '/system', '/catalogs'],
};

/** Teléfono y escritorio: los dos extremos donde el layout cambia de forma. */
const VISTAS = [
  { nombre: 'movil', viewport: { width: 390, height: 844 } },
  { nombre: 'escritorio', viewport: { width: 1280, height: 900 } },
];

async function entrar(page, portal) {
  await page.goto(`${BASE}${PREFIJO[portal]}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('input[type=email]', CUENTAS[portal]);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(3000);

  // Elegir municipalidad, si la pide. NO con `getByText('San José', {exact:true})`: la ficha
  // contiene el nombre MÁS el badge "Ya la usás", así que `exact` no la encuentra y el login se
  // queda atascado en el selector. En escritorio coincidía por accidente de layout y en móvil no,
  // y el resultado fueron cuatro capturas idénticas del selector haciéndose pasar por las
  // pantallas de inicio, billetera, movimientos y multas.
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(2500);
  }

  // Comprobación dura: si seguimos en el selector, el resto de las capturas de este portal serían
  // todas la misma pantalla. Mejor fallar acá que producir una referencia mentirosa.
  const sigueEnSelector = await page
    .locator('text=Elegí cualquier municipalidad')
    .isVisible()
    .catch(() => false);
  if (sigueEnSelector) {
    throw new Error(`${portal}: no se pudo salir del selector de municipalidad`);
  }
}

/**
 * Sin esto la comparación es inútil: el reloj de la estadía, las fechas relativas y las
 * animaciones cambian entre corridas y todas las capturas saldrían distintas.
 */
const CONGELAR = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  /* La cuenta regresiva de una estadía activa cambia cada segundo: sin taparla, toda pantalla que
     muestre la barra del temporizador reporta diferencias en cada corrida y la comparación deja de
     significar nada. Se oculta el texto, NO el elemento: si desapareciera, cambiaría el alto de la
     página y entonces sí estaríamos comparando layouts distintos.

     Sólo __more (el reloj). __meta es la zona y el espacio, que NO cambian: taparla sería perder
     cobertura de la única parte de esa barra que puede romperse. */
  .lx-sticky-timer-bar__more {
    visibility: hidden !important;
  }
`;

/** Ancho y alto de un PNG, leídos del chunk IHDR (bytes 16..24). */
function dimensiones(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Una migración de CSS cambia el LAYOUT; los datos de staging cambian el CONTENIDO. Comparar
 * bytes no distingue una cosa de la otra, y eso vuelve el arnés inútil justo cuando más se
 * necesita: en la corrida del 2026-09-18, 17 de 44 capturas "cambiaron" y NINGUNA era de CSS —
 * la bitácora de auditoría había crecido 135px por las pruebas del día, y el ciudadano tenía una
 * estadía activa que no estaba al capturar la referencia.
 *
 * Por eso lo que decide es la DIMENSIÓN: si el alto y el ancho no se movieron, el layout no se
 * movió. Un cambio de contenido se reporta aparte, como aviso, sin hacer fallar la corrida.
 *
 * Límite conocido: un cambio de CSS que altere colores o tipografía SIN mover nada de sitio pasa
 * como "contenido". Para eso están las capturas en `actual/`, que quedan en disco para mirarlas.
 */
function compararPNG(a, b) {
  const da = dimensiones(a);
  const db = dimensiones(b);
  if (da.w !== db.w || da.h !== db.h) {
    return {
      layout: false,
      motivo: `LAYOUT: ${da.w}x${da.h} → ${db.w}x${db.h} (${db.h - da.h >= 0 ? '+' : ''}${db.h - da.h}px de alto)`,
    };
  }
  if (a.length === b.length && a.equals(b)) return { layout: true, iguales: true, motivo: 'idénticas' };
  const delta = (((b.length - a.length) / a.length) * 100).toFixed(2);
  return { layout: true, iguales: false, motivo: `mismo tamaño, contenido distinto (${delta}% en bytes)` };
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  if (!MODO_BASE) fs.mkdirSync(DIR_DIFF, { recursive: true });

  console.log(`\nMidiendo contra: ${BASE}`);
  if (BASE.includes('staging')) {
    console.log('  ⚠️  Es STAGING, no tu build local. Un cambio sin desplegar NO se va a ver acá.');
  }

  const browser = await chromium.launch();
  let tomadas = 0, cambiadas = 0, nuevas = 0, contenido = 0;

  for (const portal of Object.keys(CUENTAS)) {
    for (const vista of VISTAS) {
      const ctx = await browser.newContext({ ...vista, locale: 'es-CR', ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      await page.addStyleTag({ content: CONGELAR }).catch(() => {});
      try {
        await entrar(page, portal);
      } catch (e) {
        console.log(`  (login ${portal}: ${String(e.message).split('\n')[0]})`);
      }

      for (const ruta of PANTALLAS[portal]) {
        const nombre = `${portal}${ruta.replace(/\//g, '_')}-${vista.nombre}.png`;
        try {
          await page.goto(`${BASE}${PREFIJO[portal]}${ruta}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1800);
          await page.addStyleTag({ content: CONGELAR }).catch(() => {});
          const buf = await page.screenshot({ fullPage: true });
          fs.writeFileSync(path.join(DIR, nombre), buf);
          tomadas++;

          if (!MODO_BASE) {
            const ref = path.join(DIR_REF, nombre);
            if (!fs.existsSync(ref)) {
              nuevas++;
              console.log(`  ?   ${nombre} — sin referencia`);
            } else {
              const r = compararPNG(fs.readFileSync(ref), buf);
              if (r.iguales) {
                console.log(`  ok  ${nombre}`);
              } else if (!r.layout) {
                cambiadas++;
                console.log(`  ✗   ${nombre} — ${r.motivo}`);
              } else {
                contenido++;
                console.log(`  ~   ${nombre} — ${r.motivo}`);
              }
            }
          } else {
            console.log(`  +   ${nombre}`);
          }
        } catch (e) {
          console.log(`  !   ${nombre} — ${String(e.message).split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
  }

  await browser.close();
  if (MODO_BASE) {
    // Dos capturas idénticas casi siempre significan que una ruta no existe y el router cayó a la
    // portada: la referencia quedaría diciendo "ok" sobre una pantalla que nunca se probó.
    const crypto = require('crypto');
    const porHash = {};
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.png'))) {
      const h = crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, f))).digest('hex');
      (porHash[h] ||= []).push(f);
    }
    const repetidas = Object.values(porHash).filter((g) => g.length > 1);
    console.log(`\n===== referencia: ${tomadas} capturas en tests/visual/referencia =====`);
    if (repetidas.length) {
      // Sale con error a propósito: una referencia con capturas repetidas es PEOR que no tener
      // referencia, porque diría "ok" para siempre sobre pantallas que nunca se probaron. Avisar y
      // seguir no alcanza — hay que frenar antes de que alguien migre creyendo que está cubierto.
      console.log('\n  ✗ capturas IDÉNTICAS entre sí. La referencia NO sirve todavía.');
      console.log('    Causas típicas: la ruta no existe (el router cae a la portada), o el login');
      console.log('    se quedó en el selector de municipalidad.');
      for (const g of repetidas) console.log('     ' + g.join('  ==  '));
      process.exit(1);
    }
  } else {
    console.log(
      `\n===== ${tomadas} capturas · ${cambiadas} con LAYOUT distinto · ${contenido} sólo contenido · ${nuevas} sin referencia =====`,
    );
    if (contenido > 0 && cambiadas === 0) {
      console.log('  (las marcadas con ~ cambiaron de contenido pero conservan el mismo tamaño:');
      console.log('   datos de staging que se movieron, no el diseño. Mirá tests/visual/actual/ si dudás.)');
    }
    process.exit(cambiadas > 0 ? 1 : 0);
  }
})();
