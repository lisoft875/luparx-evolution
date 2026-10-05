/**
 * Los dos ajustes del 26-09-2026 en Fiscalización: la cabecera de «Mi perfil» y la Ayuda.
 *
 * <h2>Cabecera fija — los 12 criterios del prompt</h2>
 *
 * <p>Se mide lo que el criterio dice, no lo que la hoja de estilos declara. Que una regla ponga
 * `position: sticky` no prueba que el título se vea: basta un ancestro con `overflow` distinto de
 * `visible` para que `sticky` no pegue a nada y siga sin fallar ninguna prueba de CSS. Así que
 * acá se desplaza de verdad y se pregunta dónde quedó el título.</p>
 *
 * <h2>Ayuda — las cinco opciones</h2>
 *
 * <p>Cada tarjeta tiene que LLEVAR a algún lado. Se pulsan las cinco, se comprueba a dónde
 * llegaron, que la pantalla de destino no esté vacía y que se pueda volver.</p>
 *
 *   PASS='...' node tests/responsive/fiscalizacion-perfil-y-ayuda.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'inspector@luparx.test';

/** Escritorio, tablet y teléfono: el prompt pide las tres. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/inspector/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/inspector/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del fiscalizador falló con ${respuesta.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  return page;
}

/** Dónde está el título ahora mismo, y qué más hay en pantalla. */
async function estadoDeLaCabecera(page) {
  return page.evaluate(() => {
    const barra = document.querySelector('.lx-app-bar');
    const titulo = document.querySelector('.lx-app-bar__title');
    const caja = titulo ? titulo.getBoundingClientRect() : null;
    const doc = document.documentElement;
    return {
      hayBarra: Boolean(barra),
      textoTitulo: titulo ? (titulo.textContent ?? '').trim() : '',
      // Visible de verdad: dentro del viewport, no sólo presente en el DOM.
      tituloVisible: caja ? caja.top >= -1 && caja.bottom <= window.innerHeight : false,
      topDelTitulo: caja ? Math.round(caja.top) : null,
      posicion: barra ? getComputedStyle(barra).position : null,
      scrollY: Math.round(window.scrollY),
      alturaDocumento: doc.scrollHeight,
      // Una segunda barra de desplazamiento sería un contenedor interno que desplaza además del
      // documento. El prompt lo prohíbe explícitamente.
      contenedoresQueDesplazan: [...document.querySelectorAll('body *')].filter((n) => {
        const e = getComputedStyle(n);
        return (
          (e.overflowY === 'scroll' || e.overflowY === 'auto')
          && n.scrollHeight > n.clientHeight + 4
          && n.clientHeight > 200
        );
      }).length,
      barrasDeNavegacion: document.querySelectorAll('.lx-bottom-tab-bar').length,
      desbordaHorizontal: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 664 },
  });

  console.log(`\n${BASE}/inspector · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 200));
  });

  // ===============================================================================================
  // MI PERFIL — los 12 criterios
  // ===============================================================================================
  console.log('── «Mi perfil»: la cabecera se queda ──');
  await page.goto(`${BASE}/inspector/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const alCargar = await estadoDeLaCabecera(page);
  comprobar(alCargar.hayBarra, 'criterio 2 · la cabecera existe al cargar');
  comprobar(
    /perfil/i.test(alCargar.textoTitulo),
    `criterio 2 · y su título es «Mi perfil» (dice «${alCargar.textoTitulo}»)`,
  );
  comprobar(alCargar.tituloVisible, 'criterio 2 · visible en la parte superior', `top=${alCargar.topDelTitulo}`);
  comprobar(
    alCargar.posicion === 'sticky',
    `criterio 4 · la barra está declarada como sticky (${alCargar.posicion})`,
  );

  // La pantalla tiene que dar para desplazarse; si no, el criterio no se puede probar y decirlo es
  // mejor que dar por bueno lo que no se midió.
  comprobar(
    alCargar.alturaDocumento > 664 + 100,
    `la pantalla es más larga que el viewport (${alCargar.alturaDocumento}px), así que hay scroll que probar`,
  );

  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(600);
  const aMitad = await estadoDeLaCabecera(page);
  comprobar(
    aMitad.scrollY > 100,
    `criterio 3 · la pantalla se desplazó (${aMitad.scrollY}px)`,
  );
  comprobar(
    aMitad.tituloVisible && /perfil/i.test(aMitad.textoTitulo),
    'criterio 4 · y el título SIGUE visible',
    `top=${aMitad.topDelTitulo} scrollY=${aMitad.scrollY}`,
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(700);
  const alFinal = await estadoDeLaCabecera(page);
  comprobar(
    alFinal.tituloVisible,
    'criterio 6 · al final de la pantalla la cabecera sigue ahí',
    `top=${alFinal.topDelTitulo} scrollY=${alFinal.scrollY}`,
  );
  comprobar(
    alFinal.contenedoresQueDesplazan === 0,
    'criterio 7 · no hay una segunda barra de desplazamiento',
    `${alFinal.contenedoresQueDesplazan} contenedor(es) desplazan por su cuenta`,
  );
  comprobar(
    alFinal.barrasDeNavegacion === 1,
    'criterio 8 · no apareció una segunda barra de navegación',
    `hay ${alFinal.barrasDeNavegacion}`,
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const deVuelta = await estadoDeLaCabecera(page);
  comprobar(
    deVuelta.scrollY === 0 && deVuelta.tituloVisible && deVuelta.topDelTitulo === alCargar.topDelTitulo,
    'criterio 7 · volver arriba deja todo como estaba, sin saltos',
    `top al cargar=${alCargar.topDelTitulo} · top al volver=${deVuelta.topDelTitulo}`,
  );

  console.log('── la misma pantalla en cada tamaño (criterios 10 y 11) ──');
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/inspector/profile`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(500);
    const m = await estadoDeLaCabecera(p);
    comprobar(
      m.tituloVisible && !m.desbordaHorizontal && m.contenedoresQueDesplazan === 0,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · el título aguanta el scroll y no desborda`,
      `tituloVisible=${m.tituloVisible} desborda=${m.desbordaHorizontal} scrollInterno=${m.contenedoresQueDesplazan}`,
    );
    await ctx.close();
  }

  // ===============================================================================================
  // AYUDA — las cinco opciones llevan a algún lado
  // ===============================================================================================
  console.log('── Ayuda: cada tarjeta es la acción ──');
  const OPCIONES = [
    { titulo: 'Si te quedás sin señal', destino: null },
    { titulo: 'Consultar una placa', destino: /\/inspector\/?$/ },
    { titulo: 'Levantar una boleta', destino: /\/cite/ },
    { titulo: 'Fotos y evidencia', destino: /\/cite/ },
    { titulo: 'Pendientes', destino: /\/queue/ },
    // La sexta, del 05-10-2026: no lleva a una ruta, abre la lista de problemas.
    { titulo: 'Resolver un problema', destino: null, triaje: true },
  ];

  for (const opcion of OPCIONES) {
    await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    const tarjeta = page.getByRole('button').filter({ hasText: opcion.titulo }).first();
    if ((await tarjeta.count()) === 0) {
      comprobar(false, `«${opcion.titulo}» está en Ayuda y se puede pulsar`, 'no se encontró la tarjeta');
      continue;
    }
    comprobar(true, `«${opcion.titulo}» es un botón, no un párrafo`);
    await tarjeta.click();
    await page.waitForTimeout(1800);

    if (opcion.destino === null) {
      // El prompt pide un panel breve, NO una pantalla nueva.
      const dialogo = page.getByRole('dialog');
      const abierto = await dialogo.isVisible().catch(() => false);
      comprobar(abierto, '  abre un panel corto y no una pantalla nueva');
      if (abierto && opcion.triaje) {
        /*
          La sexta opción es un TRIAJE: los siete problemas del PDF, cada uno con su salida. Se
          comprueban los siete por nombre —no un conteo, que no distingue «faltan dos» de «hay dos
          repetidos»— y después que uno de los dos nuevos de verdad resuelva: el de volver tiene
          que sacarte de Ayuda usando la navegación que ya existe.
        */
        const PROBLEMAS = [
          'Si te quedás sin señal',
          'Consultar una placa',
          'Levantar una boleta',
          'Fotos y evidencia',
          'Pendientes',
          'La aplicación presenta un error',
          'Necesito volver',
        ];
        for (const problema of PROBLEMAS) {
          const fila = dialogo.getByText(problema, { exact: true }).first();
          comprobar((await fila.count()) > 0, `    «${problema}» está en la lista`);
        }

        // El de error: información útil y la recuperación que ya existe, no una lista de causas.
        await dialogo.getByText('La aplicación presenta un error', { exact: true }).first().click();
        await page.waitForTimeout(1200);
        const panelError = page.getByRole('dialog');
        const textoError = (await panelError.textContent().catch(() => '')) ?? '';
        comprobar(
          /recargar/i.test(textoError),
          '    el problema de error ofrece recargar la aplicación',
          textoError.slice(0, 160),
        );
        comprobar(
          /en línea|sin conexión/i.test(textoError) && /esperando|sincroniz/i.test(textoError),
          '    y antes de eso dice el estado real: conexión y qué está esperando',
          textoError.slice(0, 200),
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // El de volver: tiene que SALIR de Ayuda, con el historial que ya hay.
        await page.goto(`${BASE}/inspector/more`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1600);
        await page.getByRole('button').filter({ hasText: 'Ayuda' }).first().click().catch(() => {});
        await page.waitForTimeout(1600);
        if (/\/help/.test(page.url())) {
          await page.getByRole('button').filter({ hasText: 'Resolver un problema' }).first().click();
          await page.waitForTimeout(1000);
          await page.getByRole('dialog').getByText('Necesito volver', { exact: true }).first().click();
          await page.waitForTimeout(1800);
          comprobar(
            !/\/help/.test(page.url()),
            '    el problema de volver saca de Ayuda con la navegación existente',
            `seguimos en ${page.url().replace(BASE, '')}`,
          );
        } else {
          console.log(`  ·       no se pudo entrar a Ayuda desde Más para probar «Necesito volver» (${page.url().replace(BASE, '')})`);
        }
      } else if (abierto) {
        const texto = (await dialogo.textContent()) ?? '';
        comprobar(
          /conexión|sin conexión|sincroniz/i.test(texto),
          '  y dice el estado de la conexión y de lo que está esperando',
          texto.slice(0, 140),
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    } else {
      comprobar(
        opcion.destino.test(page.url()),
        `  lleva a la ruta que ya existía (${page.url().replace(BASE, '')})`,
      );
      const contenido = await page.evaluate(() => ({
        titulo: (document.querySelector('h1')?.textContent ?? '').trim(),
        largo: (document.body.textContent ?? '').trim().length,
        barra: document.querySelectorAll('.lx-bottom-tab-bar').length,
      }));
      // Contar caracteres era el criterio equivocado, y el 02-10-2026 lo demostró: «Pendientes»
      // con la cola al día son 116 caracteres —el título y «no hay nada esperando»— y eso NO es
      // una pantalla vacía, es la buena noticia. Lo que de verdad hay que comprobar es que la
      // ruta pintó su propia pantalla y no un hueco: que tiene su título.
      comprobar(
        contenido.titulo.length > 0,
        `  y la pantalla de destino es la suya («${contenido.titulo}»)`,
        `sin <h1>; ${contenido.largo} caracteres en total`,
      );
      comprobar(contenido.barra === 1, '  con la navegación inferior intacta', `${contenido.barra} barra(s)`);
    }
  }

  // Volver a Ayuda / Más desde donde sea: el prompt lo pide explícitamente.
  await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const volver = page.getByRole('button', { name: /Volver|Atrás|Back/i }).first();
  if ((await volver.count()) > 0) {
    await volver.click();
    await page.waitForTimeout(1600);
    comprobar(/\/more/.test(page.url()), 'desde Ayuda se vuelve a «Más»', `url=${page.url().replace(BASE, '')}`);
  } else {
    comprobar(false, 'Ayuda tiene un botón de volver');
  }

  comprobar(
    erroresJs.length === 0,
    'criterio 12 · ni un error nuevo en consola',
    erroresJs.join(' | '),
  );

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
