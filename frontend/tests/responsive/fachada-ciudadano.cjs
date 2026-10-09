/**
 * La fachada del Ciudadano, medida contra su especificación (09-10-2026).
 *
 * <p>El documento da una tabla de medidas —«construcción exacta de arriba hacia abajo»— y una
 * lista de aceptación con tres tamaños. Esto mide esa tabla: lo que el navegador compuso, no lo
 * que la hoja de estilos declara.</p>
 *
 * <p>Lo que NO mide, y conviene saberlo: si «se parece a la referencia». Eso no es comprobable y
 * pretenderlo con una comparación de píxeles daría un número que nadie sabría interpretar. Lo que
 * sí se comprueba es que cada bloque exista, esté en su orden, tenga su tamaño y no lleve ningún
 * dato inventado — que es donde esta especificación se puede incumplir sin que se note.</p>
 *
 *   PASS='...' node tests/responsive/fachada-ciudadano.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA_CITIZEN ?? 'ana.morales@luparx.test';

/** Los tres del paso 10, más el ancho mínimo que el punto 7 admite. */
const TAMANOS = [
  { nombre: '360x800 (el mínimo que admite el punto 7)', width: 360, height: 800 },
  { nombre: '375x812', width: 375, height: 812 },
  { nombre: '390x844', width: 390, height: 844 },
  { nombre: '768x1024 (tablet)', width: 768, height: 1024 },
];

let fallos = 0;
function ok(condicion, mensaje, detalle) {
  if (condicion) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()), {
      timeout: 20000,
    })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  if (login && !login.ok()) {
    console.error(`El login del ciudadano falló con ${login.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(2200);
  return page;
}

async function medirFachada(page, tamano, ancho) {
  const v = await page.evaluate(() => {
    const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const px = (n, prop) => (n ? Math.round(parseFloat(getComputedStyle(n)[prop])) : 0);
    const caja = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const c = n.getBoundingClientRect();
      return { top: Math.round(c.top), alto: Math.round(c.height), ancho: Math.round(c.width) };
    };
    const hero = document.querySelector('.lx-citizen-hero');
    const cta = document.querySelector('.lx-hero-card--citizen');
    const barra = document.querySelector('.lx-bottom-tab-bar');
    const main = document.querySelector('main');
    const pares = [...document.querySelectorAll('.lx-citizen-pair > *')];
    return {
      // --- orden de arriba abajo: cada bloque por su posición, que es lo que el documento fija ---
      hero: caja('.lx-citizen-hero'),
      saludo: rec(document.querySelector('.lx-citizen-hero__greeting')?.textContent),
      saludoPx: px(document.querySelector('.lx-citizen-hero__greeting'), 'fontSize'),
      saludoPeso: document.querySelector('.lx-citizen-hero__greeting')
        ? getComputedStyle(document.querySelector('.lx-citizen-hero__greeting')).fontWeight
        : null,
      // La foto es un FONDO, no un `<img>`: es lo que la hace fundirse en vez de ser un recuadro.
      fotoEsFondo: Boolean(
        hero && getComputedStyle(hero.querySelector('.lx-citizen-hero__photo') || hero).backgroundImage !== 'none',
      ),
      heroTieneImg: hero ? hero.querySelectorAll('img').length : -1,
      degradado: hero ? getComputedStyle(hero, '::after').backgroundImage.includes('gradient') : false,
      cta: caja('.lx-hero-card--citizen'),
      ctaDegradado: cta ? getComputedStyle(cta).backgroundImage.includes('gradient') : false,
      ctaBoton: Boolean(document.querySelector('.lx-hero-card__go')),
      ctaTituloPx: px(document.querySelector('.lx-hero-card__title'), 'fontSize'),
      paresAltos: pares.map((n) => Math.round(n.getBoundingClientRect().height)),
      paresX: [...new Set(pares.map((n) => Math.round(n.getBoundingClientRect().x)))].length,
      valorPx: px(document.querySelector('.lx-citizen-pair .lx-stat-card__value'), 'fontSize'),
      multas: caja('.lx-citizen-fines'),
      actividad: [...document.querySelectorAll('.lx-citizen-activity__row')].map((n) =>
        Math.round(n.getBoundingClientRect().height),
      ),
      barraAlto: barra ? Math.round(barra.getBoundingClientRect().height) : 0,
      barraDestinos: document.querySelectorAll('.lx-bottom-tab-bar__tab').length,
      barraIcono: px(document.querySelector('.lx-bottom-tab-bar__icon svg'), 'width'),
      barraEtiqueta: px(document.querySelector('.lx-bottom-tab-bar__label'), 'fontSize'),
      rellenoMain: px(main, 'paddingBottom'),
      anchoMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
      desbordeH: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      // --- datos de maqueta que no pueden estar ---
      maqueta: ['Leana', 'BNY963', 'Toyota Rav4', '49.850', '1.500'].filter((m) =>
        (document.body.textContent || '').includes(m),
      ),
    };
  });

  ok(v.hero !== null, `${tamano}: el héroe existe`);
  if (v.hero) {
    ok(
      v.hero.alto >= 150,
      `${tamano}: el héroe mide ${v.hero.alto}px (el documento pide ~175-215 con la cabecera)`,
    );
    ok(/^hola/i.test(v.saludo), `${tamano}: empieza con el saludo`, `«${v.saludo}»`);
    ok(
      v.saludoPx >= 26 && v.saludoPx <= 36,
      `${tamano}: el saludo mide ${v.saludoPx}px (pide 30-36; 26 por debajo de 380px)`,
    );
    ok(Number(v.saludoPeso) >= 700, `${tamano}: y va en peso 700-800`, `peso=${v.saludoPeso}`);
    // El punto 10 dice no aceptar «foto rectangular sin integración/degradado».
    ok(v.fotoEsFondo, `${tamano}: la foto es fondo del bloque, no un recuadro pegado`);
    ok(v.heroTieneImg === 0, `${tamano}: y no hay ningún <img> suelto en el héroe`, `hay ${v.heroTieneImg}`);
    ok(v.degradado, `${tamano}: con su degradado navy encima`);
  }

  ok(v.cta !== null, `${tamano}: «Estacionar ahora» existe`);
  if (v.cta) {
    ok(v.cta.alto >= 150 && v.cta.alto <= 190, `${tamano}: el CTA mide ${v.cta.alto}px (pide 150-165)`);
    ok(v.ctaDegradado, `${tamano}: con degradado azul`);
    ok(v.ctaBoton, `${tamano}: y su botón circular a la derecha`);
    ok(v.ctaTituloPx >= 22 && v.ctaTituloPx <= 26, `${tamano}: título del CTA ${v.ctaTituloPx}px (pide 22-25)`);
    // «CTA principal pequeño o perdido» es de las cosas que el punto 10 no acepta: tiene que estar
    // en el primer viewport, no detrás de un desplazamiento.
    ok(v.cta.top < 812, `${tamano}: y entra en el primer viewport`, `empieza en ${v.cta.top}px`);
  }

  if (v.paresAltos.length === 2) {
    ok(v.paresX === 2, `${tamano}: Saldo y Vehículo van en dos columnas`, `columnas=${v.paresX}`);
    ok(
      v.paresAltos[0] === v.paresAltos[1],
      `${tamano}: y miden lo mismo`,
      `${v.paresAltos.join(' vs ')}`,
    );
    ok(
      v.paresAltos[0] >= 210,
      `${tamano}: con ${v.paresAltos[0]}px de alto (el documento pide 210-235)`,
    );
    ok(v.valorPx >= 25 && v.valorPx <= 31, `${tamano}: el saldo mide ${v.valorPx}px (pide 25-31)`);
  } else {
    // Con una estadía activa la fachada cambia a propósito: no se exige el par.
    console.log(`  ··  ${tamano}: no hay par Saldo/Vehículo (hay estadía activa, o el ciudadano no tiene vehículo)`);
  }

  // Multas: el documento dice «solo cuando existan multas reales». Las dos salidas son correctas,
  // así que se comprueba la que corresponda y nunca se exige la tarjeta.
  if (v.multas) {
    ok(
      v.multas.alto >= 100 && v.multas.alto <= 140,
      `${tamano}: la tarjeta de multas mide ${v.multas.alto}px (pide 105-125)`,
    );
  } else {
    console.log(`  ··  ${tamano}: sin multas por pagar, así que no se dibuja la tarjeta ámbar`);
  }

  if (v.actividad.length > 0) {
    ok(v.actividad.length <= 3, `${tamano}: la actividad muestra como mucho tres movimientos`, `son ${v.actividad.length}`);
    const bajas = v.actividad.filter((a) => a < 92);
    ok(bajas.length === 0, `${tamano}: y sus filas miden 92px o más`, `altos: ${v.actividad.join(', ')}`);
  } else {
    console.log(`  ··  ${tamano}: la billetera no tiene movimientos todavía`);
  }

  // --- La barra inferior, que el documento llama «requisito crítico» ---------------------------
  ok(v.barraDestinos === 5, `${tamano}: la barra tiene sus cinco destinos`, `son ${v.barraDestinos}`);
  ok(
    v.barraAlto >= 70 && v.barraAlto <= 86,
    `${tamano}: la barra mide ${v.barraAlto}px (pide 70-78 + safe-area)`,
  );
  ok(
    v.barraIcono >= 24 && v.barraIcono <= 28,
    `${tamano}: iconos de ${v.barraIcono}px (pide 24-28)`,
  );
  ok(
    v.barraEtiqueta >= 11 && v.barraEtiqueta <= 12,
    `${tamano}: etiquetas de ${v.barraEtiqueta}px (pide 11-12)`,
  );
  ok(
    v.rellenoMain >= 100,
    `${tamano}: el contenido reserva ${v.rellenoMain}px bajo la barra (pide 100-115)`,
  );
  ok(!v.desbordeH, `${tamano}: no hay desplazamiento horizontal`);
  if (ancho >= 768) {
    ok(v.anchoMain <= 900, `${tamano}: el contenido no pasa de 900px`, `mide ${v.anchoMain}px`);
  }

  // --- Y lo que el punto 10 no acepta: datos de la maqueta ------------------------------------
  ok(
    v.maqueta.length === 0,
    `${tamano}: no hay ningún dato de la maqueta en pantalla`,
    v.maqueta.join(' · '),
  );
}

(async () => {
  const navegador = await chromium.launch();
  const context = await navegador.newContext({ viewport: TAMANOS[1], locale: 'es-CR' });
  const page = await entrar(context);

  for (const tamano of TAMANOS) {
    console.log(`\n── ${tamano.nombre} ──`);
    await page.setViewportSize({ width: tamano.width, height: tamano.height });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await medirFachada(page, tamano.nombre, tamano.width);
    await page.screenshot({
      path: `tests/responsive/capturas/ciudadano-${tamano.width}x${tamano.height}.png`,
      fullPage: true,
    });
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
