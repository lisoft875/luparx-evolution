/**
 * Capturas REALES de la pantalla Estacionar ya implementada.
 *
 * <h2>Para qué existe aparte de los arneses</h2>
 *
 * <p>Los arneses miden y aprueban; esta herramienta sólo fotografía. Se separa a propósito: la
 * orden del 23-10-2026 pide «captura REAL del navegador de la pantalla ya implementada», y una
 * captura tomada dentro de un arnés sale con el estado en que el arnés dejó la pantalla —a mitad
 * de un escenario, con un selector abierto o con la red caída a propósito—. Acá cada toma se
 * prepara para que muestre lo que dice mostrar, y nada más.</p>
 *
 * <p>No hay ninguna aserción. Si algo sale mal, sale mal EN LA FOTO, que es el punto: la foto es
 * la evidencia, no el resumen de la foto.</p>
 *
 * <h2>Las dos situaciones de datos</h2>
 *
 * <p>Se fotografían las dos, porque la orden las enumera y porque son visualmente distintas:</p>
 * <ul>
 *   <li><b>Con geometrías</b> (San José en el simulador): mapa dibujado, polígonos en neón y la
 *       línea de pista que dice que se puede tocar.</li>
 *   <li><b>Sin geometrías</b> (Escazú): no se dibuja mapa —no hay dónde centrarlo— y queda una
 *       nota de una línea. La zona se sigue pudiendo elegir en el desplegable, que es lo que la
 *       orden exige: «La falta de geometría no debe impedir seleccionar una zona válida».</li>
 * </ul>
 *
 * <p>Uso, con el servidor y el transporte simulado ya levantados:</p>
 * <pre>
 *   BASE=http://localhost:5183 CUENTA=citizen@example.com PASS='Password123!' \
 *     node tests/responsive/capturas-estacionar.cjs
 * </pre>
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5183';
const CUENTA = process.env.CUENTA ?? 'citizen@example.com';
const PASS = process.env.PASS ?? 'Password123!';
const SALIDA = process.env.CAPTURAS ?? path.join(__dirname, 'capturas', 'estacionar-23oct');

/**
 * El estilo MapLibre que se sirve en lugar del proveedor real.
 *
 * <p>ESTO HAY QUE DECIRLO EN EL INFORME y no esconderlo en una captura bonita: desde el contenedor
 * de la nube el proveedor de teselas NO se alcanza —el proxy lo rechaza— así que sin esta sustitución
 * el componente entra por su rama de error y la foto muestra «No se pudo cargar el mapa», que es lo
 * que salió en la primera corrida. Con el estilo local el mapa sí se monta y se ven los polígonos,
 * la selección y el encuadre, que es lo que esta pantalla aporta; lo que NO se ve son las calles,
 * porque las calles las pone el proveedor. Las calles se verifican en staging, no acá.</p>
 *
 * <p>Es el mismo estilo mínimo que usa `mapa-zonas.cjs`. Sin `glyphs` no se añade la capa de
 * rótulos: los nombres de zona no salen dibujados sobre el polígono, y eso también se dice.</p>
 */
const ESTILO_LOCAL = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

/** Sirve el estilo localmente y corta cualquier salida a un tercero. */
async function sinTerceros(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (/\/styles\//.test(url) && !url.startsWith(BASE)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ESTILO_LOCAL),
      });
    }
    if (!url.startsWith(BASE) && !/localhost:5190/.test(url)) return route.abort();
    return route.continue();
  });
}

/*
  Los tamaños son los del encargo del proyecto —móvil chico, móvil normal, móvil grande, tableta
  vertical, tableta apaisada, portátil— y no una selección cómoda. `escala` es el devicePixelRatio:
  los teléfonos reales dibujan a 2× o 3×, y una captura a 1× no muestra lo que ve la usuaria.
*/
const TAMANOS = [
  { nombre: 'movil-320', ancho: 320, alto: 568, escala: 2, dedo: true },
  { nombre: 'movil-390', ancho: 390, alto: 844, escala: 3, dedo: true },
  { nombre: 'movil-430', ancho: 430, alto: 932, escala: 3, dedo: true },
  { nombre: 'tableta-768', ancho: 768, alto: 1024, escala: 2, dedo: true },
  { nombre: 'tableta-apaisada-1024', ancho: 1024, alto: 768, escala: 2, dedo: true },
  { nombre: 'portatil-1280', ancho: 1280, alto: 800, escala: 1, dedo: false },
];

/**
 * Entra y deja elegida la municipalidad que se pide.
 *
 * <p>Después del acceso la aplicación manda a elegir municipalidad —esa pantalla existe y es parte
 * del flujo—. Fotografiarla creyendo que era Estacionar fue el primer error de esta herramienta:
 * las seis tomas «con geometrías» salieron todas del selector de municipalidad. De ahí que la
 * municipalidad sea un parámetro y que se afirme que se llegó a Estacionar antes de disparar.</p>
 */
async function entrar(page, municipalidad) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2200);
  const ficha = page.locator('button, a').filter({ hasText: new RegExp(municipalidad, 'i') }).first();
  if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1800); }
  if (await page.locator('input[type=password]').count()) {
    throw new Error('sigue en el login: revisá CUENTA/PASS');
  }
}

/** Afirma que lo que hay delante ES Estacionar, y no la pantalla anterior del flujo. */
async function enEstacionar(page) {
  const zona = page.locator('[aria-label="Zona"], [aria-label="Zone"]');
  const numero = page.locator('input[inputmode=numeric], input[inputmode=text]');
  return (await zona.count()) > 0 && (await numero.count()) > 0;
}

/**
 * Deja la pantalla quieta antes de disparar.
 *
 * <p>El mapa es una tela que se dibuja sola y tarda; `networkidle` no sirve porque el proveedor de
 * teselas mantiene conexiones abiertas. Se espera a que el lienzo exista —si va a existir— y
 * después un margen fijo para que termine de pintar.</p>
 */
async function asentar(page) {
  await page.waitForTimeout(2200);
  const lienzo = page.locator('.lx-zonemap__lienzo canvas');
  if (await lienzo.count()) await page.waitForTimeout(2600);
  /* El foco deja el campo de texto para que la barra fija de «Continuar» se vea en la foto:
     con un campo enfocado la aplicación la esconde a propósito para no tapar el teclado. */
  await page.evaluate(() => (document.activeElement instanceof HTMLElement
    ? document.activeElement.blur() : undefined));
  await page.waitForTimeout(400);
}

async function disparar(page, nombre) {
  const archivo = path.join(SALIDA, `${nombre}.png`);
  await page.screenshot({ path: archivo });
  console.log(`  ··  ${archivo}`);
  return archivo;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  for (const t of TAMANOS) {
    const context = await browser.newContext({
      viewport: { width: t.ancho, height: t.alto },
      deviceScaleFactor: t.escala,
      /* Con dedo la aplicación usa el `<select>` del sistema y agranda los blancos de toque: es
         otra pantalla, no la misma más angosta, así que la foto tiene que decir con qué entró. */
      hasTouch: t.dedo,
      isMobile: t.dedo,
      locale: 'es-CR',
    });
    await sinTerceros(context);
    const page = await context.newPage();

    // ── Con geometrías: San José, que el simulador publica con perímetros ──
    await entrar(page, 'San José');
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await asentar(page);
    if (!(await enEstacionar(page))) {
      throw new Error(`${t.nombre}: no se llegó a Estacionar; no se fotografía otra pantalla`);
    }
    await disparar(page, `${t.nombre}-con-geometrias`);

    /*
      ── Con una zona elegida: el anillo y el relleno encendidos ──

      Hay que elegirla de las DOS formas. Con dedo el selector es el `<select>` del sistema; sin
      dedo —el portátil— es el desplegable propio, y `selectOption` no existe ahí. La primera
      versión sólo sabía la primera, así que el portátil se quedó sin tres de sus cuatro fotos y
      la falta no se notó hasta contar los archivos.
    */
    const zona = page.locator('[aria-label="Zona"], [aria-label="Zone"]').first();
    const elegida = await (async () => {
      if (await zona.evaluate((n) => n.tagName) === 'SELECT') {
        const valor = await zona.evaluate((n) => [...n.options].find((o) => o.value)?.value ?? null);
        if (!valor) return false;
        await zona.selectOption(valor);
        return true;
      }
      await zona.click();
      await page.waitForTimeout(400);
      const opcion = page.locator('[role=option]').first();
      if (!(await opcion.count())) return false;
      await opcion.click();
      return true;
    })();
    if (elegida) {
      await asentar(page);
      await disparar(page, `${t.nombre}-zona-elegida`);

      // ── Los dos campos llenos: es el estado en que «Continuar» se habilita ──
      await page.locator('input[inputmode=numeric], input[inputmode=text]').first().fill('LUP-0001');
      await asentar(page);
      await disparar(page, `${t.nombre}-completo`);

      /*
        Y el mapa desplazado hasta verse entero.

        En un teléfono NO cabe: el orden que fija la orden —título, progreso, los dos campos y
        recién entonces el mapa— deja el mapa empezando cerca de los 530 px, así que de sus ~400 px
        se ven unos 160 sin desplazar. Es la consecuencia del orden pedido, no un defecto escondido,
        y por eso van las DOS fotos: la de arriba muestra lo que se ve al entrar, y ésta muestra que
        el mapa que hay debajo es un mapa de verdad y no un recuadro vacío.
      */
      const lienzo = page.locator('.lx-zonemap__lienzo');
      if (await lienzo.count()) {
        /*
          `scrollIntoViewIfNeeded` NO sirve acá y la primera versión salió casi idéntica a la
          anterior: desplaza lo MÍNIMO para que asome un borde, y el borde de arriba del mapa ya
          asomaba, así que movió 38 px. Lo que hace falta es llevar abajo del todo el contenedor
          que de verdad se desplaza —que es el documento— para que el mapa quede entero contra la
          barra fija.
        */
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
        await asentar(page);
        await disparar(page, `${t.nombre}-mapa-desplazado`);
      }
    }
    await context.close();

    // ── Sin geometrías: Escazú, que el simulador publica sin un solo perímetro ──
    const ctxVacio = await browser.newContext({
      viewport: { width: t.ancho, height: t.alto },
      deviceScaleFactor: t.escala,
      hasTouch: t.dedo,
      isMobile: t.dedo,
      locale: 'es-CR',
    });
    await sinTerceros(ctxVacio);
    const vacia = await ctxVacio.newPage();
    await entrar(vacia, 'Escazú');
    await vacia.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await asentar(vacia);
    if (await enEstacionar(vacia)) {
      await disparar(vacia, `${t.nombre}-sin-geometrias`);
    } else {
      console.log(`  ··  ${t.nombre}: Escazú no llegó a Estacionar; sin toma «sin geometrías»`);
    }
    await ctxVacio.close();
  }

  await browser.close();
  console.log(`\ncapturas en ${SALIDA}`);
})().catch((e) => { console.error(e); process.exit(1); });
