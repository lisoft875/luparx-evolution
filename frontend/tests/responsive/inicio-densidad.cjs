/**
 * ¿Cuánto alto gasta el Inicio, y en qué?
 *
 * La corrección v4 (24-09-2026) no pide rediseñar nada: pide que el contenido operativo
 * —4 KPI, gráfico de 7 días, ocupación por zona, actividad reciente y los 4 accesos rápidos—
 * entre SIN SCROLL en una laptop, y da alturas concretas por bloque. Una especificación numérica
 * se verifica con números: este arnés mide, no mira.
 *
 * Lo que NO se puede dar por sabido, y por eso se mide en vez de suponerse:
 *
 *   «1536 x 960» es el tamaño de la PANTALLA, no el del viewport. Entre medio están la barra de
 *   menú de macOS, la tira de pestañas, la barra de direcciones, los marcadores y el Dock. El alto
 *   real que le queda a la página es bastante menor, y de cuánto menos depende de la configuración
 *   de cada quien. Así que acá se mide el alto que el Inicio NECESITA y se compara contra un
 *   presupuesto declarado (ALTO_UTIL), en lugar de fingir que la página dispone de 960px.
 *
 *   node inicio-densidad.cjs
 *   ALTO_UTIL=700 node inicio-densidad.cjs      # presupuesto más estricto
 *   PASS='...' node inicio-densidad.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/** Las capturas de la §8 van juntas y fuera del control de versiones, no sueltas en la raíz. */
const CAPTURAS = path.join(__dirname, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

/**
 * El alto de viewport que se supone disponible en la laptop de la especificación.
 *
 * 1536x960 de pantalla, Chrome al 100% con barra de marcadores, en macOS:
 *   960 − 25 (barra de menú) − 88 (pestañas + direcciones) − 32 (marcadores) − 70 (Dock) ≈ 745
 *
 * Es una estimación declarada, no un hecho: si la barra de marcadores está oculta sobran 32px y si
 * el Dock está escondido sobran 70. Por eso el arnés imprime SIEMPRE el alto necesario en píxeles,
 * que es el dato que no depende de esta suposición, y el veredicto queda como una lectura sobre
 * ese número.
 */
const ALTO_UTIL = Number(process.env.ALTO_UTIL ?? 745);

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Los anchos que la §8 manda comparar, más el de la referencia. */
const ANCHOS = [
  { nombre: 'laptop 1536 (referencia)', width: 1536, height: 960 },
  { nombre: 'escritorio 1440', width: 1440, height: 900 },
  { nombre: 'laptop 1366', width: 1366, height: 768 },
  { nombre: 'laptop 1280', width: 1280, height: 800 },
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

async function medir(page) {
  return page.evaluate(() => {
    const alto = (sel, raiz = document) => {
      const el = raiz.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().height) : null;
    };
    const rect = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    };

    const contenido = document.querySelector('.lx-page-layout__content');

    // Los hijos directos del Inicio, por orden y por su clase REAL — no una lista de selectores
    // escrita de memoria.
    //
    // La primera versión de este arnés pedía '.lx-shell-header-row' y le creía a lo que volviera.
    // Esa clase existe DOS veces en la página: en la barra fija de arriba (marca + perfil) y en el
    // encabezado de la pantalla. `querySelector` devuelve la primera, así que midió la barra de
    // navegación y le puso el nombre del encabezado; el encabezado real, de unos 100px, no se midió
    // nunca y apareció disfrazado de «hueco previo 93px». Sólo se notó porque las partes no sumaban
    // el total. Octavo arnés de la sesión que miente, y la misma raíz que los otros siete: afirmar
    // sobre un selector sin comprobar que apunta a lo que uno cree.
    const home = document.querySelector('.lx-home');
    const filas = [...(home?.children ?? [])].map((el, i) => {
      const clase = String(el.className || el.tagName).split(/\s+/)[0];
      return { nombre: `${i + 1}. ${clase}`, caja: el.getBoundingClientRect(), alto: Math.round(el.getBoundingClientRect().height) };
    });
    const pie = rect('.lx-page-layout__footer');
    if (pie) filas.push({ nombre: 'pie', caja: pie, alto: Math.round(pie.height) });

    // El hueco real entre una sección y la siguiente. Se calcula de las cajas y no del CSS: el gap
    // declarado y el hueco que se ve no son el mismo número cuando hay márgenes de por medio.
    for (let i = 1; i < filas.length; i++) {
      const previa = filas[i - 1].caja;
      const actual = filas[i].caja;
      filas[i].hueco = previa && actual ? Math.round(actual.top - previa.bottom) : null;
    }

    // Lo que la §1 declara obligatorio ver sin scroll. El pie puede quedar fuera, así que el corte
    // es el borde inferior de la fila de operación, no el final del documento.
    const operacion = rect('.lx-home-grid--operation');
    const cabeceraFija = alto('.lx-page-layout__header') ?? 0;
    const estiloContenido = contenido ? getComputedStyle(contenido) : null;
    const relleno = {
      arriba: estiloContenido ? Math.round(parseFloat(estiloContenido.paddingTop)) : null,
      abajo: estiloContenido ? Math.round(parseFloat(estiloContenido.paddingBottom)) : null,
    };

    // Alto de ventana que haría falta para que el último bloque operativo termine justo en el
    // borde inferior, contando la barra fija de arriba y el respiro de abajo.
    const necesario = operacion
      ? Math.round(operacion.bottom + window.scrollY + relleno.abajo)
      : null;

    return {
      filas: filas.map(({ nombre, alto: h, hueco }) => ({ nombre, alto: h, hueco })),
      piezas: {
        'tarjeta KPI': alto('.lx-metric'),
        'área de barras': alto('.lx-bars__track'),
        'rótulo del gráfico': alto('.lx-bars__callout'),
        'tarjeta de acceso': alto('.lx-quick-tile'),
        'vacío de actividad': alto('.lx-feed__empty'),
        'fila de zona': alto('.lx-zone-row'),
        'tarjeta del gráfico': alto('.lx-home-grid:not(.lx-home-grid--operation) > .lx-card'),
        'tarjeta de zonas': alto('.lx-home-grid:not(.lx-home-grid--operation) > .lx-card:nth-child(2)'),
        'tarjeta de actividad': alto('.lx-home-grid--operation > .lx-card'),
        'tarjeta de accesos': alto('.lx-home-grid--operation > .lx-card:nth-child(2)'),
        // El encabezado de cada tarjeta, medido aparte.
        //
        // Quedan 43px por recortar y las dos veces que los busqué por cálculo me equivoqué:
        // predije que las zonas caerían a ~192px y quedaron en 241. La diferencia está en el
        // encabezado de la tarjeta, que en `.lx-card--dense` debería poner el título y su
        // explicación en un renglón y no se sabe si lo está haciendo. Medirlo cuesta dos líneas;
        // adivinarlo lleva costados dos despliegues.
        'encab. del gráfico': alto('.lx-home-grid:not(.lx-home-grid--operation) > .lx-card .lx-section-header'),
        'encab. de zonas': alto('.lx-home-grid:not(.lx-home-grid--operation) > .lx-card:nth-child(2) .lx-section-header'),
        'encab. de actividad': alto('.lx-home-grid--operation > .lx-card .lx-section-header'),
      },
      cabeceraFija,
      relleno,
      necesario,
      // Las trampas que la §4 prohíbe. Se comprueban en el DOM y no en el diff, porque lo que
      // importa es lo que la página HACE, no lo que el commit dice.
      trampas: (() => {
        const hallazgos = [];
        for (const el of document.querySelectorAll('.lx-page-layout__content, .lx-page-layout__content *')) {
          const e = getComputedStyle(el);
          if (e.transform && e.transform !== 'none' && /matrix\(0?\.\d/.test(e.transform)) {
            hallazgos.push(`transform escalado en .${el.className || el.tagName}`);
          }
          if (e.zoom && e.zoom !== '1' && e.zoom !== 'normal') {
            hallazgos.push(`zoom ${e.zoom} en .${el.className || el.tagName}`);
          }
          const px = parseFloat(e.fontSize);
          if (px > 0 && px < 11 && (el.textContent || '').trim().length > 0) {
            hallazgos.push(`fuente de ${px}px en .${el.className || el.tagName}`);
          }
        }
        return [...new Set(hallazgos)].slice(0, 6);
      })(),
      // La §5 pide que el menú no dependa del scroll del contenido.
      sidebar: (() => {
        const nav = document.querySelector('.lx-page-layout__sidebar');
        if (!nav) return null;
        const e = getComputedStyle(nav);
        return { position: e.position, top: e.top, overflowY: e.overflowY, alto: Math.round(nav.getBoundingClientRect().height) };
      })(),
      // Lo que la §5 marcó como engañoso: «-100% contra ayer» cuando hoy vale ₡0.
      deltaRecaudacion: (() => {
        const primera = document.querySelector('.lx-home-kpis .lx-metric');
        if (!primera) return null;
        const d = primera.querySelector('.lx-metric__delta, .lx-metric__hint');
        return d ? `${d.className} · «${(d.textContent || '').replace(/\s+/g, ' ').trim()}»` : 'sin delta';
      })(),
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'es-CR', ignoreHTTPSErrors: true });

  console.log(`\n${BASE}/admin · presupuesto de alto útil: ${ALTO_UTIL}px\n`);

  const pageLogin = await entrar(context);
  const estado = await context.storageState();
  await pageLogin.close();

  let fallos = 0;

  for (const tam of ANCHOS) {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: tam.width, height: tam.height },
      deviceScaleFactor: 2,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const r = await medir(page);

    console.log(`── ${tam.nombre} · viewport ${tam.width}x${tam.height} ──`);
    if (r.necesario === null) {
      console.log('   no se encontró la fila de operación; el Inicio no se construyó');
      fallos++;
      await ctx.close();
      continue;
    }

    for (const fila of r.filas) {
      if (fila.alto === null) continue;
      const hueco = fila.hueco === null || fila.hueco === undefined ? '' : `   (hueco previo ${fila.hueco}px)`;
      console.log(`   ${fila.nombre.padEnd(22)} ${String(fila.alto).padStart(4)}px${hueco}`);
    }
    console.log('   ' + '-'.repeat(52));
    for (const [nombre, h] of Object.entries(r.piezas)) {
      if (h !== null) console.log(`   ${nombre.padEnd(22)} ${String(h).padStart(4)}px`);
    }
    console.log('   ' + '-'.repeat(52));
    console.log(`   barra fija superior    ${String(r.cabeceraFija).padStart(4)}px`);
    console.log(`   relleno del contenido  ${r.relleno.arriba}px arriba / ${r.relleno.abajo}px abajo`);

    const total = r.necesario + r.cabeceraFija;
    const sobra = ALTO_UTIL - total;
    console.log(`   ALTO NECESARIO         ${String(total).padStart(4)}px  (contenido operativo + barra fija)`);
    if (sobra >= 0) {
      console.log(`   ✔ entra en ${ALTO_UTIL}px con ${sobra}px de sobra`);
    } else {
      fallos++;
      console.log(`   ✗ SE PASA por ${-sobra}px del presupuesto de ${ALTO_UTIL}px`);
    }

    if (r.trampas.length > 0) {
      fallos++;
      console.log(`   ✗ §4 — la altura se está ganando con trampa: ${r.trampas.join('; ')}`);
    }
    if (r.sidebar) {
      const ok = r.sidebar.position === 'sticky' || r.sidebar.position === 'fixed';
      console.log(`   sidebar: position=${r.sidebar.position} top=${r.sidebar.top} overflowY=${r.sidebar.overflowY} alto=${r.sidebar.alto}px ${ok ? '✔' : '✗ no es fijo'}`);
      if (!ok) fallos++;
    }
    console.log(`   KPI recaudación → ${r.deltaRecaudacion}`);
    console.log('');

    await page.screenshot({ path: path.join(CAPTURAS, `inicio-${tam.width}x${tam.height}.png`), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  console.log(`===== ${ANCHOS.length} anchos · ${fallos} con problemas · capturas en tests/responsive/capturas/ =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
