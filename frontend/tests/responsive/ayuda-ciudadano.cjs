/**
 * Ciudadano → Centro de Ayuda: dos niveles, y que ninguno sea un segundo menú.
 *
 * <h2>Qué se mide y por qué así</h2>
 *
 * <p>La Ayuda del ciudadano fue tres cosas en dos días: seis párrafos sin salida, después seis
 * tarjetas que llevaban cada una a su módulo —lo cual arregló un defecto y creó otro, porque una
 * Ayuda cuyos botones son los módulos de la barra de abajo es un segundo menú— y ahora un centro
 * que pregunta por el PROBLEMA y deja el módulo para el final.</p>
 *
 * <p>Entonces lo que hay que comprobar no es «hay tarjetas y llevan a algún lado»; eso ya lo
 * cumplía la versión que se reportó como defectuosa. Es más exigente:</p>
 *
 * <ul>
 *   <li><b>El primer nivel NO nombra módulos.</b> Cinco categorías de problema y el bloque de
 *       estado, y ni «Estacionar» ni «Billetera» ni «Vehículos» como título de categoría. Ésta es
 *       la comprobación que distingue esta versión de la anterior.</li>
 *   <li><b>El segundo nivel explica antes de llevar.</b> Cada opción tiene título, explicación y
 *       —sólo si hay función— una acción corta. La explicación va ARRIBA del botón.</li>
 *   <li><b>Ningún botón muerto.</b> Se pulsa cada opción con acción y se comprueba dónde cayó: una
 *       ruta real, el diagnóstico, o una recarga.</li>
 *   <li><b>El buscador filtra de verdad</b> y dice honestamente cuando no encuentra.</li>
 *   <li><b>La cabecera y la campana</b> sobreviven a los dos niveles.</li>
 * </ul>
 *
 *   PASS='...' node tests/responsive/ayuda-ciudadano.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA ?? 'ana.morales@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

/** Las cinco categorías del primer nivel, y cuántas opciones trae cada una. */
const CATEGORIAS = [
  { clave: 'parking', titulo: 'Mi estacionamiento', opciones: 5 },
  { clave: 'payments', titulo: 'Pagos y billetera', opciones: 5 },
  { clave: 'fines', titulo: 'Multas y boletas', opciones: 4 },
  { clave: 'vehicles', titulo: 'Vehículos', opciones: 4 },
  { clave: 'app', titulo: 'Problemas con la aplicación', opciones: 5 },
];

/**
 * Nombres de MÓDULO que no deben aparecer como título en el primer nivel.
 *
 * <p>Es la comprobación que separa esta versión de la anterior. «Vehículos» es a la vez una
 * categoría legítima y el nombre de una pestaña, así que no entra en la lista: lo que delata un
 * segundo menú es que la Ayuda ofrezca VERBOS de módulo —«Estacionar», «Ver billetera»— como
 * primera decisión, antes de que nadie haya dicho qué le pasa.</p>
 */
const VERBOS_DE_MODULO = ['Estacionar', 'Ver billetera', 'Ver multas', 'Ver vehículos', 'Consultar placa'];

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/citizen/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del ciudadano falló con ${respuesta.status()}.`);
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

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 664 },
  });

  console.log(`\n${BASE} · Ayuda del ciudadano · ${CUENTA}\n`);
  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') erroresJs.push(m.text().slice(0, 200));
  });

  // ===============================================================================================
  // 1 · LA CABECERA VUELVE, Y NO LLEGA ACOMPAÑADA
  // ===============================================================================================
  console.log('── La cabecera de Ayuda ──');
  await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const cabecera = await page.evaluate(() => {
    const barra = document.querySelector('.lx-app-bar');
    const caja = barra ? barra.getBoundingClientRect() : null;
    const campana = barra ? barra.querySelector('.lx-app-bar__icon-btn') : null;
    const cajaCampana = campana ? campana.getBoundingClientRect() : null;
    const pegado = (() => {
      let nodo = barra;
      while (nodo && nodo !== document.body) {
        const p = getComputedStyle(nodo).position;
        if (p === 'sticky' || p === 'fixed') return nodo.className || nodo.tagName;
        nodo = nodo.parentElement;
      }
      return 'nadie';
    })();
    return {
      cabeceras: document.querySelectorAll('.lx-app-bar').length,
      titulo: (document.querySelector('.lx-app-bar__title')?.textContent ?? '').trim(),
      visible: caja ? caja.top >= -1 && caja.height > 0 : false,
      volver: document.querySelectorAll('.lx-app-bar__back').length,
      campana: cajaCampana ? Math.round(Math.min(cajaCampana.width, cajaCampana.height)) : 0,
      pegado,
      barrasInferiores: document.querySelectorAll('.lx-bottom-tab-bar').length,
      destinos: document.querySelectorAll('.lx-bottom-tab-bar a, .lx-bottom-tab-bar button').length,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  comprobar(cabecera.cabeceras === 1, 'Ayuda muestra la cabecera superior, y una sola', JSON.stringify(cabecera));
  comprobar(/ayuda/i.test(cabecera.titulo), `  con su título («${cabecera.titulo}»)`);
  comprobar(cabecera.visible, '  visible en la parte de arriba');
  comprobar(cabecera.volver === 1, '  con la flecha de volver, porque se entra desde «Más»');
  comprobar(cabecera.campana >= 44, `  y la campana no se perdió (${cabecera.campana}px de blanco táctil)`);
  comprobar(cabecera.pegado !== 'nadie', `  la cabecera se queda al desplazar (${cabecera.pegado})`);
  comprobar(cabecera.barrasInferiores === 1, '  la navegación inferior sigue intacta, y una sola');
  comprobar(cabecera.destinos === 5, `  con sus cinco destinos (${cabecera.destinos})`);
  comprobar(!cabecera.desborda, '  y sin desborde horizontal');

  // ===============================================================================================
  // 2 · EL PRIMER NIVEL PREGUNTA, NO LISTA MÓDULOS
  // ===============================================================================================
  console.log('── El primer nivel ──');
  const primerNivel = await page.evaluate(() => {
    const categorias = [...document.querySelectorAll('[data-categoria]')];
    return {
      filas: categorias.map((n) => ({
        clave: n.getAttribute('data-categoria'),
        titulo: (n.querySelector('.lx-help-card__title')?.textContent ?? '').trim(),
        alto: Math.round(n.getBoundingClientRect().height),
        boton: n.tagName === 'BUTTON',
        flecha: n.querySelectorAll('.lx-help-card__go').length,
      })),
      buscador: document.querySelectorAll('input[type="search"]').length,
      texto: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });

  comprobar(
    primerNivel.filas.length === CATEGORIAS.length + 1,
    `el primer nivel muestra las ${CATEGORIAS.length} categorías y el bloque de estado`,
    primerNivel.filas.map((f) => f.clave).join(', '),
  );
  for (const categoria of CATEGORIAS) {
    const fila = primerNivel.filas.find((f) => f.clave === categoria.clave);
    comprobar(
      Boolean(fila) && fila.titulo === categoria.titulo && fila.boton && fila.flecha === 1,
      `  «${categoria.titulo}» está, es un botón y tiene flecha`,
      fila ? JSON.stringify(fila) : 'no está',
    );
    comprobar(fila && fila.alto >= 44, '  con blanco táctil suficiente', fila ? `${fila.alto}px` : '—');
  }
  comprobar(primerNivel.buscador === 1, 'hay un buscador, y uno solo', `${primerNivel.buscador}`);

  /*
    La comprobación que separa esta versión de la anterior: la Ayuda no abre ofreciendo verbos de
    módulo. Si alguien «simplifica» esto volviendo a poner «Estacionar» o «Ver billetera» en la
    primera pantalla, vuelve a ser el segundo menú que el encargo del 07-10 vino a quitar.
  */
  const verbosEncontrados = VERBOS_DE_MODULO.filter((v) => primerNivel.texto.includes(v));
  comprobar(
    verbosEncontrados.length === 0,
    'y la primera pantalla no ofrece verbos de módulo: pregunta antes de llevar',
    verbosEncontrados.join(', '),
  );

  // ===============================================================================================
  // 3 · EL SEGUNDO NIVEL: EXPLICA, Y DESPUÉS LLEVA
  // ===============================================================================================
  console.log('── El segundo nivel ──');
  for (const categoria of CATEGORIAS) {
    await page.goto(`${BASE}/help/${categoria.clave}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    const nivel = await page.evaluate(() => {
      const opciones = [...document.querySelectorAll('[data-opcion]')];
      return {
        cabeceras: document.querySelectorAll('.lx-app-bar').length,
        titulo: (document.querySelector('.lx-app-bar__title')?.textContent ?? '').trim(),
        pregunta: (document.querySelector('main p')?.textContent ?? '').trim(),
        opciones: opciones.map((n) => {
          const cuerpo = n.querySelector('.lx-text-meta');
          const accion = n.querySelector('.lx-help-card__action');
          return {
            clave: n.getAttribute('data-opcion'),
            titulo: (n.querySelector('.lx-help-card__title')?.textContent ?? '').trim(),
            explicacion: (cuerpo?.textContent ?? '').trim().length,
            accion: (accion?.textContent ?? '').trim(),
            // La explicación tiene que ir ARRIBA del botón, no adentro ni debajo.
            explicaAntes: Boolean(cuerpo && accion)
              && cuerpo.compareDocumentPosition(accion) === Node.DOCUMENT_POSITION_FOLLOWING,
          };
        }),
      };
    });

    comprobar(
      nivel.cabeceras === 1 && nivel.titulo === categoria.titulo,
      `«${categoria.titulo}» abre con su cabecera y su título`,
      JSON.stringify({ cabeceras: nivel.cabeceras, titulo: nivel.titulo }),
    );
    comprobar(
      /necesitás resolver|está pasando/i.test(nivel.pregunta),
      `  y pregunta primero («${nivel.pregunta}»)`,
    );
    comprobar(
      nivel.opciones.length === categoria.opciones,
      `  con sus ${categoria.opciones} opciones`,
      `${nivel.opciones.length}: ${nivel.opciones.map((o) => o.clave).join(', ')}`,
    );
    for (const opcion of nivel.opciones) {
      comprobar(
        opcion.explicacion > 20 && opcion.accion.length > 0 && opcion.explicaAntes,
        `  «${opcion.titulo}» explica y después ofrece «${opcion.accion}»`,
        JSON.stringify(opcion),
      );
      comprobar(
        opcion.accion.length <= 28,
        '  con una acción corta',
        `${opcion.accion.length} caracteres`,
      );
    }
  }

  // ===============================================================================================
  // 3b · NINGÚN BOTÓN MUERTO: SE PULSAN TODOS
  // ===============================================================================================
  console.log('── Que cada acción haga algo ──');
  for (const categoria of CATEGORIAS) {
    const claves = await (async () => {
      await page.goto(`${BASE}/help/${categoria.clave}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      return page.$$eval('[data-opcion]', (ns) => ns.map((n) => n.getAttribute('data-opcion')));
    })();

    for (const clave of claves) {
      await page.goto(`${BASE}/help/${categoria.clave}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      const antes = page.url();
      /*
        Una marca en el documento, para distinguir la tercera clase de acción.

        Hay tres: navegar, abrir el diagnóstico y RECARGAR. «La aplicación presenta un error»
        recarga, así que no cambia la URL ni abre diálogo, y las dos primeras versiones de esto la
        dieron por botón muerto.

        La segunda versión usaba `performance.now()`, razonando que si BAJA es que hay un documento
        nuevo. El razonamiento es correcto y la medición no servía: el documento viejo llevaba
        ~1.8s de vida cuando se leía, y el nuevo ~2s cuando se volvía a leer. Dos números casi
        iguales decidiendo una comparación — una moneda al aire, y salió cruz.

        Una marca en `window` no tiene ese problema: una recarga la borra y nada más la borra. No
        depende de cuánto tardó nada.
      */
      await page.evaluate(() => {
        window.__marcaDeRecarga = true;
      });
      await page.locator(`[data-opcion="${clave}"]`).first().click();
      await page.waitForTimeout(2000);
      const despues = page.url();
      const recargo = await page.evaluate(() => window.__marcaDeRecarga !== true);
      const dialogo = await page.getByRole('dialog').isVisible().catch(() => false);
      if (dialogo) {
        // La acción era el diagnóstico: que de verdad haya medido algo.
        const filas = await page.$$eval('.lx-diag__row', (ns) => ns.length);
        comprobar(filas > 0, `«${categoria.clave}/${clave}» abre el diagnóstico con sus filas`, `${filas}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      } else if (recargo) {
        comprobar(true, `«${categoria.clave}/${clave}» recarga la aplicación, que es su acción`);
      } else {
        const salioDeAyuda = !/\/help/.test(despues);
        const titulo = await page.evaluate(
          () =>
            (document.querySelector('.lx-app-bar__title')?.textContent
              ?? document.querySelector('h1')?.textContent
              ?? '').trim(),
        );
        comprobar(
          (salioDeAyuda || despues !== antes) && titulo.length > 0,
          `«${categoria.clave}/${clave}» lleva a una pantalla de verdad («${titulo}»)`,
          `${antes.replace(BASE, '')} → ${despues.replace(BASE, '')}`,
        );
      }
    }
  }

  // ===============================================================================================
  // 3c · EL BUSCADOR
  // ===============================================================================================
  console.log('── El buscador ──');
  await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.locator('input[type="search"]').first().fill('boleta');
  await page.waitForTimeout(800);
  const conBusqueda = await page.evaluate(() => ({
    resultados: document.querySelectorAll('.lx-help-card').length,
    categorias: document.querySelectorAll('[data-categoria]').length,
    texto: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  }));
  comprobar(
    conBusqueda.resultados > 0 && conBusqueda.categorias === 0,
    'buscar «boleta» muestra resultados y deja de mostrar las categorías',
    JSON.stringify({ resultados: conBusqueda.resultados, categorias: conBusqueda.categorias }),
  );
  comprobar(
    /boleta/i.test(conBusqueda.texto),
    '  y lo encontrado habla de boletas',
    conBusqueda.texto.slice(0, 120),
  );

  // Sin coincidencias: lo dice, no se queda en blanco.
  await page.locator('input[type="search"]').first().fill('zzzqqq');
  await page.waitForTimeout(800);
  const sinNada = (await page.evaluate(() => (document.querySelector('main')?.textContent ?? ''))) ?? '';
  comprobar(
    /no encontramos/i.test(sinNada),
    'una búsqueda sin resultados lo dice en palabras',
    sinNada.replace(/\s+/g, ' ').slice(0, 140),
  );

  // ===============================================================================================
  // 3d · EL ACCESO DESDE «MÁS», EN LOS DOS PORTALES
  // ===============================================================================================
  /*
    El encargo del acceso pedía que el del fiscalizador se viera como el del ciudadano. Ya se veía
    —mismo componente, mismos props— y por eso lo único que cambió fue el icono: era un escudo, y
    en el menú del admin ese mismo escudo es «Roles y permisos».

    Se comprueba lo que de verdad importa de un icono compartido: que los DOS portales dibujen el
    mismo, y que no sea el de permisos. Si alguien cambia uno solo, esto lo dice.
  */
  console.log('── El acceso a Ayuda desde «Más» ──');
  {
    const formaDelIcono = async (p2, ruta) => {
      await p2.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(2200);
      return p2.evaluate(() => {
        const filas = [...document.querySelectorAll('.lx-list-row')];
        const fila = filas.find((n) => /^Ayuda/.test((n.textContent ?? '').trim()));
        if (!fila) return null;
        const svg = fila.querySelector('svg');
        const caja = fila.getBoundingClientRect();
        return {
          titulo: (fila.querySelector('.lx-list-row__title')?.textContent ?? '').trim(),
          // La huella del dibujo: si cambia en un portal y no en el otro, esto deja de coincidir.
          icono: svg ? [...svg.children].map((h) => h.tagName + ':' + (h.getAttribute('d') ?? h.getAttribute('r') ?? '')).join('|') : '',
          alto: Math.round(caja.height),
        };
      });
    };

    const ciudadano = await formaDelIcono(page, '/more');
    const ctxInsp = await browser.newContext({ locale: 'es-CR', ignoreHTTPSErrors: true, viewport: { width: 390, height: 664 } });
    const pInsp = await ctxInsp.newPage();
    // El fiscalizador es otra sesión: este script entra como ciudadano, así que se mide sin sesión
    // sólo si la ruta lo permite; si manda al login, se dice y no se inventa un resultado.
    await pInsp.goto(`${BASE}/inspector/more`, { waitUntil: 'domcontentloaded' });
    await pInsp.waitForTimeout(2200);
    const enLoginInsp = await pInsp.evaluate(() => window.location.pathname.endsWith('/login'));
    const inspector = enLoginInsp ? null : await formaDelIcono(pInsp, '/inspector/more');
    await ctxInsp.close();

    comprobar(
      Boolean(ciudadano) && ciudadano.titulo === 'Ayuda',
      `el acceso del ciudadano dice «Ayuda» y nada más`,
      ciudadano ? JSON.stringify(ciudadano) : 'no se encontró la fila',
    );
    comprobar(
      Boolean(ciudadano) && ciudadano.alto >= 44,
      '  con blanco táctil suficiente',
      ciudadano ? `${ciudadano.alto}px` : '—',
    );
    // El escudo de «Roles y permisos» empieza con el contorno del escudo; el de ayuda, con un círculo.
    comprobar(
      Boolean(ciudadano) && ciudadano.icono.startsWith('circle:'),
      '  y su icono es el de ayuda, no el escudo de permisos',
      ciudadano ? ciudadano.icono.slice(0, 80) : '—',
    );
    if (inspector) {
      comprobar(
        inspector.icono === ciudadano.icono,
        'el fiscalizador dibuja exactamente el mismo icono',
        `ciudadano=${ciudadano.icono.slice(0, 50)} · fiscalizador=${inspector.icono.slice(0, 50)}`,
      );
    } else {
      console.log('  ·       sin sesión de fiscalizador en este contexto: su icono no se pudo comparar');
    }
  }

  // ===============================================================================================
  // 4 · MÓVIL Y ESCRITORIO
  // ===============================================================================================
  console.log('── Móvil y escritorio ──');
  for (const tam of [
    { nombre: 'móvil chico', width: 320, height: 568 },
    { nombre: 'móvil estándar', width: 390, height: 664 },
    { nombre: 'tablet vertical', width: 768, height: 1024 },
    { nombre: 'escritorio', width: 1536, height: 960 },
  ]) {
    const ctx = await browser.newContext({
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      viewport: { width: tam.width, height: tam.height },
      storageState: await context.storageState(),
    });
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2400);
    const medida = await p2.evaluate(() => {
      const tarjetas = [...document.querySelectorAll('.lx-help-card')];
      return {
        tarjetas: tarjetas.length,
        categorias: document.querySelectorAll('[data-categoria]').length,
        cabeceras: document.querySelectorAll('.lx-app-bar').length,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        // Contenido que no cabe en su propia caja: texto cortado de verdad.
        cortadas: tarjetas.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
        chicas: tarjetas.filter((n) => n.getBoundingClientRect().height < 44).length,
      };
    });
    comprobar(
      medida.categorias === 6 && medida.cabeceras === 1 && !medida.desborda
        && medida.cortadas === 0 && medida.chicas === 0,
      `${tam.nombre.padEnd(16)} ${tam.width}x${tam.height} · primer nivel entero, nada cortado`,
      JSON.stringify(medida),
    );

    // Y el segundo nivel, en el mismo ancho: es donde vive el texto largo.
    await p2.goto(`${BASE}/help/parking`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2000);
    const segundo = await p2.evaluate(() => {
      const opciones = [...document.querySelectorAll('[data-opcion]')];
      return {
        opciones: opciones.length,
        cabeceras: document.querySelectorAll('.lx-app-bar').length,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        cortadas: opciones.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
      };
    });
    comprobar(
      segundo.opciones === 5 && segundo.cabeceras === 1 && !segundo.desborda && segundo.cortadas === 0,
      `${''.padEnd(16)} ${tam.width}x${tam.height} · «Mi estacionamiento» cabe entero`,
      JSON.stringify(segundo),
    );
    await ctx.close();
  }

  comprobar(erroresJs.length === 0, 'ni un error nuevo en consola', erroresJs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
