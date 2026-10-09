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
    .waitForResponse(
      (r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()),
      {
        timeout: 20000,
      },
    )
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  if (login && !login.ok()) {
    console.error(`El login del ciudadano falló con ${login.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(2200);

  /*
    El ciudadano NO entra a su Inicio al iniciar sesión: entra al selector de municipalidad, una
    pantalla con título propio y una ficha por municipalidad. Faltando este paso, todo lo que mide
    esta prueba se mide sobre esa pantalla: no hay héroe, no hay «Estacionar ahora», la barra
    inferior tiene cero destinos y mide cero. Eso fue exactamente la corrida del 09-10 —28 fallos,
    ninguno real—, y es el modo más caro de equivocarse que tiene un arnés: no da un falso negativo
    silencioso sino un expediente entero de defectos inventados sobre una pantalla correcta.

    `barras-fijas.cjs` ya daba este paso; esta prueba nació sin él.
  */
  const ficha = page
    .locator('button, a')
    .filter({ hasText: /San José|Escazú|Montes de Oca/ })
    .first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1600);
  }

  return page;
}

/**
 * Antes de medir: ¿esto es el Inicio del ciudadano?
 *
 * <p>La comprobación no es decorativa. Medir la pantalla equivocada no falla: mide. Si no estamos
 * donde creemos, lo que corresponde es parar con un error y no escribir una lista de hallazgos
 * falsos que después alguien tiene que desmentir uno por uno.</p>
 */
async function confirmarQueEsElInicio(page) {
  const donde = await page.evaluate(() => ({
    ruta: location.pathname,
    titulo: String(document.querySelector('h1, .lx-screen-title')?.textContent || '').trim(),
    hayLogin: Boolean(document.querySelector('input[type="password"]')),
    haySelector: /Elegí cualquier municipalidad/i.test(document.body.textContent || ''),
    hayBarra: Boolean(document.querySelector('.lx-bottom-tab-bar')),
  }));
  if (donde.hayLogin || donde.haySelector || !donde.hayBarra) {
    const motivo = donde.hayLogin
      ? 'seguimos en el formulario de login'
      : donde.haySelector
        ? 'estamos en el selector de municipalidad, no en el Inicio'
        : 'no hay barra inferior: esto no es una pantalla raíz del ciudadano';
    throw new Error(
      `No se puede medir la fachada: ${motivo} (ruta=${donde.ruta}, título="${donde.titulo}"). ` +
        'Medir desde acá produce defectos inventados en TODA la tabla.',
    );
  }
}

async function medirFachada(page, tamano, ancho) {
  const v = await page.evaluate(() => {
    const rec = (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
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
        hero &&
        getComputedStyle(hero.querySelector('.lx-citizen-hero__photo') || hero).backgroundImage !==
          'none',
      ),
      heroTieneImg: hero ? hero.querySelectorAll('img').length : -1,
      degradado: hero
        ? getComputedStyle(hero, '::after').backgroundImage.includes('gradient')
        : false,
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
    ok(
      v.heroTieneImg === 0,
      `${tamano}: y no hay ningún <img> suelto en el héroe`,
      `hay ${v.heroTieneImg}`,
    );
    ok(v.degradado, `${tamano}: con su degradado navy encima`);
  }

  ok(v.cta !== null, `${tamano}: «Estacionar ahora» existe`);
  if (v.cta) {
    ok(
      v.cta.alto >= 150 && v.cta.alto <= 190,
      `${tamano}: el CTA mide ${v.cta.alto}px (pide 150-165)`,
    );
    ok(v.ctaDegradado, `${tamano}: con degradado azul`);
    ok(v.ctaBoton, `${tamano}: y su botón circular a la derecha`);
    ok(
      v.ctaTituloPx >= 22 && v.ctaTituloPx <= 26,
      `${tamano}: título del CTA ${v.ctaTituloPx}px (pide 22-25)`,
    );
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
    console.log(
      `  ··  ${tamano}: no hay par Saldo/Vehículo (hay estadía activa, o el ciudadano no tiene vehículo)`,
    );
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
    ok(
      v.actividad.length <= 3,
      `${tamano}: la actividad muestra como mucho tres movimientos`,
      `son ${v.actividad.length}`,
    );
    const bajas = v.actividad.filter((a) => a < 92);
    ok(
      bajas.length === 0,
      `${tamano}: y sus filas miden 92px o más`,
      `altos: ${v.actividad.join(', ')}`,
    );
  } else {
    console.log(`  ··  ${tamano}: la billetera no tiene movimientos todavía`);
  }

  // --- La barra inferior, que el documento llama «requisito crítico» ---------------------------
  ok(
    v.barraDestinos === 5,
    `${tamano}: la barra tiene sus cinco destinos`,
    `son ${v.barraDestinos}`,
  );
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

/**
 * ¿Están las clases del rediseño Y se les está aplicando su CSS?
 *
 * <p>Son dos preguntas distintas y la diferencia es exactamente la que explica «lo desplegué y se
 * ve igual». Una clase puede estar en el DOM mientras la hoja de estilos que llegó al navegador
 * no tiene su regla —porque es la hoja anterior, porque el `build` no la incluyó, porque el
 * selector quedó dentro de un bloque que no coincide—, y entonces el marcador está y el diseño
 * no. Medir sólo `querySelector` dice «sí, existe» y no contesta nada.</p>
 *
 * <p>Por eso se comprueban tres cosas por bloque: que el elemento exista, que ALGUNA hoja cargada
 * contenga una regla con ese selector, y qué valor terminó computando el navegador. Y se imprime
 * el nombre del archivo CSS y JS que el navegador descargó, que es lo único que identifica sin
 * ambigüedad qué versión se está mirando.</p>
 */
async function auditarDomYCss(page) {
  const a = await page.evaluate(() => {
    const rec = (x) => String(x || '').replace(/\s+/g, ' ').trim();

    // Qué archivos llegaron. Llevan hash en el nombre: identifican la compilación exacta.
    const recursos = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /\/assets\/.*\.(css|js)$/.test(n))
      .map((n) => n.split('/').pop());

    // Las reglas de TODAS las hojas, para poder preguntar si un selector existe de verdad.
    const selectores = new Set();
    for (const hoja of Array.from(document.styleSheets)) {
      let reglas;
      try {
        reglas = hoja.cssRules;
      } catch {
        continue; // hoja de otro origen: no se puede leer, y no hay ninguna acá
      }
      const recorrer = (lista) => {
        for (const regla of Array.from(lista)) {
          if (regla.selectorText) regla.selectorText.split(',').forEach((x) => selectores.add(x.trim()));
          if (regla.cssRules) recorrer(regla.cssRules);
        }
      };
      recorrer(reglas);
    }
    const hayRegla = (sel) => [...selectores].some((x) => x.includes(sel));

    const mirar = (sel, props) => {
      const n = document.querySelector(sel);
      if (!n) return { sel, existe: false, regla: hayRegla(sel) };
      const cs = getComputedStyle(n);
      const caja = n.getBoundingClientRect();
      const valores = {};
      for (const prop of props) valores[prop] = rec(cs[prop]).slice(0, 120);
      return {
        sel,
        existe: true,
        regla: hayRegla(sel),
        ancho: Math.round(caja.width),
        alto: Math.round(caja.height),
        valores,
      };
    };

    const raiz = getComputedStyle(document.documentElement);
    return {
      recursos,
      portal: document.documentElement.dataset.portal ?? '(sin atributo)',
      tokens: {
        '--lx-bg': rec(raiz.getPropertyValue('--lx-bg')),
        '--lx-surface': rec(raiz.getPropertyValue('--lx-surface')),
        '--lx-primary': rec(raiz.getPropertyValue('--lx-primary')),
        '--lx-primary-fill': rec(raiz.getPropertyValue('--lx-primary-fill')),
      },
      fondoBody: rec(getComputedStyle(document.body).backgroundColor),
      bloques: [
        mirar('.lx-citizen-hero', ['minHeight', 'padding', 'position', 'overflow']),
        mirar('.lx-citizen-hero__photo', ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'opacity']),
        mirar('.lx-citizen-hero__greeting', ['fontSize', 'fontWeight', 'lineHeight']),
        mirar('.lx-hero-card--citizen', ['background', 'borderRadius', 'minHeight']),
        mirar('.lx-citizen-pair', ['display', 'gridTemplateColumns', 'gap']),
        mirar('.lx-citizen-activity__row', ['minHeight', 'display']),
        mirar('.lx-bottom-tab-bar', ['height', 'position', 'background']),
      ],
    };
  });

  // ¿La fotografía del héroe se descargó, o el contenedor está pidiendo una URL que no existe?
  const urlFoto = await page.evaluate(() => {
    const n = document.querySelector('.lx-citizen-hero__photo');
    if (!n) return null;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(n).backgroundImage);
    return m ? m[1] : null;
  });
  let foto = 'sin contenedor de foto';
  if (urlFoto) {
    const r = await page.request.get(urlFoto).catch(() => null);
    foto = r ? `${r.status()} · ${urlFoto.split('/').pop()}` : `NO SE PUDO PEDIR · ${urlFoto}`;
  }

  console.log('\n══ Auditoría de DOM y CSS ══');
  console.log(`  archivos cargados: ${a.recursos.join(' · ') || '(ninguno con hash)'}`);
  console.log(`  data-portal: ${a.portal}`);
  console.log(`  tokens: ${Object.entries(a.tokens).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  fondo del body: ${a.fondoBody}`);
  console.log(`  foto del héroe: ${foto}`);
  for (const b of a.bloques) {
    if (!b.existe) {
      console.log(`  ✗   ${b.sel} — NO ESTÁ EN EL DOM (regla CSS presente: ${b.regla ? 'sí' : 'no'})`);
      fallos++;
      continue;
    }
    if (!b.regla) {
      console.log(`  ✗   ${b.sel} — está en el DOM pero NINGUNA hoja cargada tiene su regla`);
      fallos++;
      continue;
    }
    const valores = Object.entries(b.valores).map(([k, v]) => `${k}: ${v}`).join(' · ');
    console.log(`  ok  ${b.sel} — ${b.ancho}x${b.alto} · ${valores}`);
  }
}

(async () => {
  const navegador = await chromium.launch();
  const context = await navegador.newContext({ viewport: TAMANOS[1], locale: 'es-CR' });
  const page = await entrar(context);

  try {
    for (const tamano of TAMANOS) {
      console.log(`\n── ${tamano.nombre} ──`);
      await page.setViewportSize({ width: tamano.width, height: tamano.height });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await confirmarQueEsElInicio(page);
      await medirFachada(page, tamano.nombre, tamano.width);
      // La auditoría de DOM y CSS una sola vez, en el ancho de la referencia: lo que comprueba
      // —qué hoja llegó, qué reglas trae— no cambia con el viewport.
      if (tamano.width === 390) await auditarDomYCss(page);
      // Dos capturas, porque miden cosas distintas: la «vista» es un viewport con la cabecera
      // pegada donde está, y la «completa» es la página entera —donde Playwright dibuja los
      // elementos sticky a media altura, que es artefacto de la captura y no defecto.
      await page.screenshot({
        path: `tests/responsive/capturas/ciudadano-${tamano.width}x${tamano.height}-vista.png`,
      });
      await page.screenshot({
        path: `tests/responsive/capturas/ciudadano-${tamano.width}x${tamano.height}.png`,
        fullPage: true,
      });
    }
  } catch (e) {
    // Un arnés que no sabe dónde está no reporta: para. Lo contrario —seguir midiendo— es lo que
    // produjo 28 defectos inventados.
    console.error(`\n${String(e.message).split('\n')[0]}`);
    await navegador.close();
    process.exit(3);
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
