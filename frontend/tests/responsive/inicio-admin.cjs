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
  { nombre: 'tablet apaisada',  width: 1024, height: 768, dedo: true, kpisEsperados: 2 },
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

/**
 * Los nombres de clase que este arnés busca en el marcado.
 *
 * Están acá arriba, en un solo lugar y con nombre, porque un arnés acoplado a nombres de clase se
 * rompe EN SILENCIO cuando la pantalla se rediseña, y cuando se rompe miente en la dirección más
 * cara: dice «la página está rota» cuando la rota es la prueba. Pasó el 24-09-2026 con el Inicio
 * v3: la portada quedó sana —ruta correcta, shell montado, sin errores de consola, sin APIs en
 * 400— y este arnés reportó 8/8 fallos porque seguía buscando `.lx-stat-card__value` después de
 * que los KPIs pasaran a `MetricCard` (`.lx-metric__value`). Un ciclo de deploy perseguido detrás
 * de un defecto inexistente, el séptimo de la sesión.
 *
 * La defensa está abajo, en `obsoletos`: si la página se ve sana y aun así un grupo entero
 * desaparece, la conclusión por omisión es que el selector envejeció, no que la pantalla murió; y
 * se imprimen las clases que SÍ están en el DOM para poder corregirlo sin adivinar.
 */
const SEL = {
  kpi: '.lx-home-kpis .lx-metric',
  kpiEtiqueta: '.lx-metric__label',
  kpiValor: '.lx-metric__value',
  bloques: '.lx-home-kpis .lx-metric, .lx-home-grid > .lx-card',
  franja: '.lx-status-bar__item',
  accesos: '.lx-quick-tile',
  zonas: '.lx-zone-row',
  barras: '.lx-bars__col',
  etiquetaBarra: '.lx-bars__col-label',
};

async function medir(page, dedo) {
  return page.evaluate(([esDedo, SEL]) => {
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
    const tarjetas = [...document.querySelectorAll(SEL.kpi)];
    const kpis = tarjetas.map((el) => {
      const b = el.getBoundingClientRect();
      return {
        label: rec(el.querySelector(SEL.kpiEtiqueta)?.textContent),
        value: rec(el.querySelector(SEL.kpiValor)?.textContent),
        top: Math.round(b.top),
      };
    });
    const primeraFila = kpis.length > 0 ? kpis.filter((k) => k.top === kpis[0].top).length : 0;

    // --- cifras rotas: lo que la §14 prohíbe mostrar ---
    const textoPagina = rec(document.querySelector('main')?.textContent);
    // Literal, NUNCA expresión regular. La primera versión hacía
    // `new RegExp('\\b' + mala + '\\b')`, y con `[object Object]` eso no busca ese texto: los
    // corchetes lo convierten en una CLASE de caracteres —{o,b,j,e,c,t,espacio,O}— así que el patrón
    // pasa a ser «un carácter de ese conjunto entre dos límites de palabra». Un espacio cumple, y
    // entonces marcaba como rota cualquier pantalla que tuviera un espacio: las ocho, siempre.
    // Costó un ciclo entero de deploy perseguir un defecto que no existía.
    //
    // No basta con decir QUE hay una cifra rota: hay que decir DÓNDE. «[object Object]» repetido en
    // ocho tamaños sin más pista obliga a adivinar cuál de veinte campos es, que es el mismo punto
    // ciego que tenía este arnés cuando decía «0 KPIs» sin decir que la página había reventado.
    const rotas = [];
    for (const mala of ['undefined', 'null', 'NaN', 'Infinity', '[object Object]']) {
      const donde = textoPagina.indexOf(mala);
      if (donde === -1) continue;
      const contexto = textoPagina.slice(Math.max(0, donde - 45), donde + mala.length + 25);
      // Y el elemento más profundo que lo contiene, que es el que hay que ir a arreglar.
      let culpable = '';
      for (const el of document.querySelectorAll('main *')) {
        if (el.children.length === 0 && rec(el.textContent).includes(mala)) {
          culpable = el.className || el.tagName;
          break;
        }
      }
      rotas.push(`${mala} — «…${contexto}…»${culpable ? ` en .${culpable}` : ''}`);
    }

    // --- encimados: dos bloques hermanos que se pisan ---
    const encimados = [];
    const bloques = [...document.querySelectorAll(SEL.bloques)];
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
    const barras = document.querySelectorAll(SEL.barras).length;
    const franja = document.querySelectorAll(SEL.franja).length;
    const zonas = document.querySelectorAll(SEL.zonas).length;
    const accesos = document.querySelectorAll(SEL.accesos).length;

    // Las clases que SÍ existen bajo <main>, para poder decir con qué reemplazar un selector muerto
    // en vez de dejar al lector con «no encontré .lx-quick-action» y ninguna pista de qué hay.
    const clasesReales = [...new Set(
      [...document.querySelectorAll('main [class]')]
        .flatMap((el) => String(el.className).split(/\s+/))
        .filter((c) => c.startsWith('lx-') && !c.includes('--')),
    )].sort();

    // Las fechas del eje no pueden encimarse: si la siguiente empieza antes de que termine la
    // anterior, el eje es ilegible aunque el layout "funcione".
    const etiquetas = [...document.querySelectorAll(SEL.etiquetaBarra)].map((el) => el.getBoundingClientRect());
    let ejesEncimados = 0;
    for (let i = 1; i < etiquetas.length; i++) {
      if (etiquetas[i].left < etiquetas[i - 1].right - 1) ejesEncimados++;
    }

    // Dónde estamos parados de verdad. Sin esto, «0 KPIs» es indistinguible de «la página reventó»
    // y de «esto es la pantalla de login»: tres hechos distintos con la misma salida. Ya costó dos
    // vueltas creerle a un arnés que medía otra pantalla.
    const donde = {
      ruta: location.pathname,
      titulo: rec(document.querySelector('h1')?.textContent).slice(0, 60),
      hayShell: Boolean(document.querySelector('.lx-nav')),
      // Un React sin error boundary deja el contenedor vacío cuando algo revienta al renderizar.
      raizVacia: (document.querySelector('#root')?.childElementCount ?? 0) === 0,
      primerTexto: rec(document.body.textContent).slice(0, 120),
    };

    return { desborde, anchos: anchos.slice(0, 4), kpis, primeraFila, rotas, encimados, chicos: chicos.slice(0, 5), barras, franja, zonas, accesos, ejesEncimados, textoPagina, donde, clasesReales };
  }, [dedo, SEL]);
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
    // Lo que la pantalla no puede decir. Un fallo de render no deja rastro en el DOM —deja el DOM
    // vacío— así que el único lugar donde queda escrito es la consola.
    const consola = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consola.push(msg.text().slice(0, 200));
    });
    page.on('pageerror', (err) => consola.push(`pageerror: ${String(err.message).slice(0, 200)}`));
    const fallidas = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        fallidas.push(`${res.status()} ${res.url().replace(BASE, '')}`);
      }
    });
    try {
      await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      // El Inicio hace tres consultas; se espera a que las barras o el vacío del gráfico existan.
      await page.waitForTimeout(2600);
      const r = await medir(page, tam.dedo);

      // ---------------------------------------------------------------------------------------
      // Antes de acusar a la página, preguntarse si la que envejeció es la prueba.
      //
      // La página está sana cuando está montada (shell presente, raíz con hijos), la consola no
      // tiene errores y ninguna llamada a la API devolvió 400 o más. Si con TODO eso a favor un
      // grupo entero de elementos no aparece, la hipótesis barata —«el Inicio perdió los accesos
      // rápidos»— es la equivocada: lo que perdió el nombre de clase es el selector de acá.
      // Distinguir los dos casos es lo único que impide gastar un deploy arreglando lo que no está
      // roto.
      // ---------------------------------------------------------------------------------------
      const sana = r.donde.hayShell && !r.donde.raizVacia && consola.length === 0 && fallidas.length === 0;
      const obsoletos = [];
      if (sana) {
        if (r.kpis.length > 0 && r.kpis.every((k) => !k.value)) {
          obsoletos.push(`hay ${r.kpis.length} tarjetas en ${SEL.kpi} y NINGUNA tiene ${SEL.kpiValor}`);
        }
        if (r.franja === 0) obsoletos.push(`ningún elemento en ${SEL.franja}`);
        if (r.accesos === 0) obsoletos.push(`ningún elemento en ${SEL.accesos}`);
        if (r.kpis.length === 0) obsoletos.push(`ningún elemento en ${SEL.kpi}`);
      }
      if (obsoletos.length > 0) {
        fallos++;
        console.log(`  !   ${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} — ARNÉS DESACTUALIZADO, no defecto de la página`);
        for (const o of obsoletos) console.log(`        ${o}`);
        console.log(`        la página se ve sana: ruta=${r.donde.ruta} · h1="${r.donde.titulo}" · shell=true · raízVacía=false · consola limpia · API limpia`);
        console.log(`        clases que sí están en <main>: ${r.clasesReales.slice(0, 24).join(' ')}`);
        console.log('        corregir SEL en este archivo antes de tocar el Inicio');
        await ctx.close();
        continue;
      }

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
        // El contexto se imprime SIEMPRE que algo falla, no sólo cuando se sospecha: la vez que no
        // se imprime es la vez que se necesitaba.
        console.log(`        ruta=${r.donde.ruta} · h1="${r.donde.titulo}" · shell=${r.donde.hayShell} · raízVacía=${r.donde.raizVacia}`);
        if (r.donde.raizVacia || !r.donde.hayShell) {
          console.log(`        body: "${r.donde.primerTexto}"`);
        }
        for (const linea of consola.slice(0, 4)) console.log(`        consola: ${linea}`);
        for (const linea of fallidas.slice(0, 4)) console.log(`        API: ${linea}`);
      }
    } catch (e) {
      fallos++;
      console.log(`  ?   ${tam.nombre} — ${String(e.message).split('\n')[0]}`);
    }
    await ctx.close();
  }

  // ===============================================================================================
  // LOS CUATRO KPI SON ACCESOS (06-10-2026)
  // ===============================================================================================
  /*
    El defecto que corrige la especificación: de las cuatro tarjetas sólo «Recaudación» navegaba, y
    ninguna comunicaba que fuera pulsable. Lo que se mide acá no es que haya un `onClick` —eso lo
    ve cualquiera leyendo el código— sino las cuatro cosas que sólo se saben ejecutando:

      1. que la tarjeta ENTERA sea el control, y que sea un `<button>` de verdad (teclado incluido);
      2. que al pulsarla se llegue a la ruta que dice, sin recargar la aplicación;
      3. que no se pierda ni la sesión ni la municipalidad al llegar;
      4. que «Atrás» del navegador devuelva al Inicio.

    El quinto criterio —que las cuatro se vean iguales— se mide por el chevron y por el alto: cuatro
    tarjetas «del mismo tipo» que midan distinto no son del mismo tipo.
  */
  console.log('\n── Los cuatro KPI como accesos ──');
  function okInicio(ok, mensaje, detalle) {
    if (ok) {
      console.log(`  ok  ${mensaje}`);
    } else {
      fallos++;
      console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
    }
  }

  /* Los cuatro KPI de la referencia aprobada, en su orden (08-10-2026). «Ocupación actual» salió
     de la fila —pasó a ser el dónut del bloque de ocupación— y entró «Usuarios registrados». */
  const DESTINOS = [
    { etiqueta: 'Estacionamientos activos', ruta: /\/admin\/dashboard/ },
    { etiqueta: 'Usuarios registrados', ruta: /\/admin\/users/ },
    { etiqueta: 'Multas emitidas', ruta: /\/admin\/enforcement\/citations\?from=/ },
    { etiqueta: 'Ingresos del día', ruta: /\/admin\/billing/ },
  ];

  {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: 1440, height: 900 },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    // --- 1. Las cuatro son del mismo tipo --------------------------------------------------------
    const tarjetas = await page.$$eval('.lx-home-kpis .lx-metric', (nodos) =>
      nodos.map((n) => {
        const control = n.querySelector('.lx-metric__hit');
        const caja = n.getBoundingClientRect();
        return {
          etiqueta: (n.querySelector('.lx-metric__label')?.textContent ?? '').trim(),
          esBoton: control?.tagName === 'BUTTON',
          // Toda el área útil: el control tiene que llenar la tarjeta, no ser un enlace adentro.
          cubre: control
            ? Math.round(control.getBoundingClientRect().width) >= Math.round(caja.width) - 2
            : false,
          chevron: n.querySelectorAll('.lx-metric__chevron').length,
          cursor: control ? getComputedStyle(control).cursor : '',
          alto: Math.round(caja.height),
          // Elementos pulsables anidados: el documento prohíbe que un clic dispare dos cosas.
          anidados: control ? control.querySelectorAll('button, a').length : 0,
        };
      }),
    );
    okInicio(tarjetas.length === 4, 'el Inicio sigue mostrando las cuatro tarjetas', `${tarjetas.length}`);
    for (const tarjeta of tarjetas) {
      okInicio(
        tarjeta.esBoton && tarjeta.cubre && tarjeta.cursor === 'pointer' && tarjeta.chevron === 1,
        `  «${tarjeta.etiqueta}» es un botón que cubre la tarjeta, con cursor y chevron`,
        JSON.stringify(tarjeta),
      );
      okInicio(tarjeta.anidados === 0, `  «${tarjeta.etiqueta}» no anida otro control adentro`, String(tarjeta.anidados));
    }
    const altos = tarjetas.map((t) => t.alto);
    okInicio(
      altos.length > 0 && Math.max(...altos) - Math.min(...altos) <= 2,
      '  y las cuatro miden lo mismo de alto',
      altos.join(' / '),
    );

    // --- 1b. El hover pinta la tarjeta ENTERA (07-10-2026) --------------------------------------
    /*
      El defecto que trajo la captura del 07-10: en «Estadías activas» el resaltado dejaba una
      franja inferior con el color de reposo, y parecía que el hover pertenecía a un hijo interno.
      La causa era medible: `.lx-home-kpis` es una cuadrícula que estira las cuatro tarjetas a la
      altura de la más alta, y el botón de adentro tenía ancho pero no alto.

      Por eso lo que se mide no es «se ve bien» sino el hecho: con el mouse encima, la caja del
      botón tiene que coincidir con la caja de la tarjeta, y su fondo tiene que haber cambiado.
      Comparar píxeles diría «cambió algo»; esto dice QUÉ.
    */
    for (const etiqueta of DESTINOS.map((d) => d.etiqueta)) {
      const tarjeta = page.locator('.lx-home-kpis .lx-metric', { hasText: etiqueta }).first();
      if ((await tarjeta.count()) === 0) continue;
      const reposo = await tarjeta.evaluate((n) => {
        const hit = n.querySelector('.lx-metric__hit');
        return hit ? getComputedStyle(hit).backgroundColor : '';
      });
      await tarjeta.hover();
      await page.waitForTimeout(350);
      const medida = await tarjeta.evaluate((n) => {
        const hit = n.querySelector('.lx-metric__hit');
        const cajaH = hit ? hit.getBoundingClientRect() : null;
        return {
          /*
            Contra la caja INTERIOR de la tarjeta, no contra la exterior.

            La primera versión comparaba con `getBoundingClientRect()`, que incluye el borde, y las
            cuatro fallaron por exactamente 2px en cada eje: 277x103 contra 275x101. Esos 2px son
            el borde de 1px de la tarjeta a cada lado, y el fondo de un hover que llega al borde
            POR DENTRO es exactamente lo correcto — el borde es el filo de la tarjeta, no una
            franja sin pintar. La medición pedía algo imposible y lo llamaba defecto.

            `clientWidth`/`clientHeight` son la caja de relleno, y como `.lx-metric` no tiene
            relleno propio, el botón debe coincidir EXACTO. Tolerancia de 1px sólo por el redondeo
            del navegador, no por el borde.
          */
          altoTarjeta: n.clientHeight,
          altoBoton: cajaH ? Math.round(cajaH.height) : 0,
          anchoTarjeta: n.clientWidth,
          anchoBoton: cajaH ? Math.round(cajaH.width) : 0,
          fondo: hit ? getComputedStyle(hit).backgroundColor : '',
        };
      });
      okInicio(
        Math.abs(medida.altoTarjeta - medida.altoBoton) <= 1
          && Math.abs(medida.anchoTarjeta - medida.anchoBoton) <= 1,
        `  «${etiqueta}» se resalta de borde a borde, sin franja`,
        `interior de la tarjeta ${medida.anchoTarjeta}x${medida.altoTarjeta} · botón ${medida.anchoBoton}x${medida.altoBoton}`,
      );
      okInicio(
        medida.fondo !== reposo && medida.fondo !== '' && medida.fondo !== 'rgba(0, 0, 0, 0)',
        '  y el fondo de verdad cambia al pasar por encima',
        `reposo=${reposo} hover=${medida.fondo}`,
      );
    }
    // Se suelta el mouse para que el hover no contamine las mediciones siguientes.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);

    // --- 2. El teclado llega y se ve ------------------------------------------------------------
    let saltos = 0;
    let enfocado = null;
    while (saltos < 30) {
      await page.keyboard.press('Tab');
      saltos++;
      enfocado = await page.evaluate(() => {
        const activo = document.activeElement;
        if (!activo || !activo.closest('.lx-home-kpis .lx-metric')) return null;
        const estilo = getComputedStyle(activo);
        return {
          etiqueta: (activo.getAttribute('aria-label') ?? '').trim(),
          outline: estilo.outlineStyle === 'none' ? 0 : parseFloat(estilo.outlineWidth) || 0,
        };
      });
      if (enfocado) break;
    }
    okInicio(
      Boolean(enfocado) && enfocado.outline > 0,
      '  el tabulador llega a los KPI y el foco se ve',
      enfocado ? JSON.stringify(enfocado) : `no se alcanzó ningún KPI en ${saltos} tabulaciones`,
    );

    // --- 3. Cada una abre lo suyo, conserva el contexto y vuelve --------------------------------
    for (const destino of DESTINOS) {
      await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2400);
      const municipioAntes = await page.evaluate(
        () => (document.querySelector('.lx-shell-header__identity')?.textContent ?? '').trim(),
      );
      const tarjeta = page.locator('.lx-home-kpis .lx-metric', { hasText: destino.etiqueta }).first();
      if ((await tarjeta.count()) === 0) {
        okInicio(false, `«${destino.etiqueta}» está en el Inicio`, 'no se encontró la tarjeta');
        continue;
      }
      // Se pulsa el VALOR, no el botón: si el área útil no llegara hasta ahí, esto no navegaría.
      const valor = tarjeta.locator('.lx-metric__value').first();
      const antes = await page.evaluate(() => window.performance.now());
      await valor.click();
      await page.waitForTimeout(2400);
      const url = page.url();
      okInicio(destino.ruta.test(url), `«${destino.etiqueta}» abre su módulo`, url.replace(BASE, ''));
      // Navegación de la SPA y no recarga: `performance.now()` se reinicia con cada documento nuevo.
      const despues = await page.evaluate(() => window.performance.now());
      okInicio(despues > antes, '  sin recargar la aplicación entera', `${Math.round(antes)} → ${Math.round(despues)}`);
      const estadoDestino = await page.evaluate(() => ({
        municipio: (document.querySelector('.lx-shell-header__identity')?.textContent ?? '').trim(),
        titulo: (document.querySelector('h1')?.textContent ?? '').trim(),
        enLogin: window.location.pathname.endsWith('/login'),
      }));
      okInicio(
        !estadoDestino.enLogin && estadoDestino.titulo.length > 0,
        `  y llega a una pantalla con título («${estadoDestino.titulo}»)`,
        JSON.stringify(estadoDestino),
      );
      okInicio(
        municipioAntes !== '' && estadoDestino.municipio === municipioAntes,
        '  conservando la municipalidad',
        `antes "${municipioAntes}" · después "${estadoDestino.municipio}"`,
      );
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      okInicio(/\/admin\/?(\?|$)/.test(page.url()), '  y «Atrás» devuelve al Inicio', page.url().replace(BASE, ''));
    }

    // --- 4. Ocupación por zona: los nombres dejan de cortarse -----------------------------------
    /*
      Lo que se mide no es «se ve bien» sino dos hechos: que ningún nombre quede recortado por el
      clamp de dos renglones, y que la columna del nombre sea más ancha que la de la barra —que era
      la causa: una barra de 4px de alto se quedaba con más ancho que el nombre de la zona.
    */
    await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const zonas = await page.evaluate(() => {
      const filas = [...document.querySelectorAll('.lx-zone-row')];
      return filas.map((fila) => {
        const nombre = fila.querySelector('.lx-zone-row__name');
        const barra = fila.querySelector('.lx-zone-row__track');
        const valor = fila.querySelector('.lx-zone-row__value');
        return {
          texto: (nombre?.textContent ?? '').trim(),
          titulo: nombre?.getAttribute('title') ?? '',
          // Recortado de verdad: el contenido no cabe en los dos renglones que se le dan.
          recortado: nombre ? nombre.scrollHeight > nombre.clientHeight + 1 : false,
          anchoNombre: nombre ? Math.round(nombre.getBoundingClientRect().width) : 0,
          anchoBarra: barra ? Math.round(barra.getBoundingClientRect().width) : 0,
          valorRecortado: valor ? valor.scrollWidth > valor.clientWidth + 1 : false,
        };
      });
    });
    if (zonas.length === 0) {
      console.log('  ·       sin zonas en este entorno: no hay ocupación que medir');
    } else {
      const recortadas = zonas.filter((z) => z.recortado);
      okInicio(
        recortadas.length === 0,
        `ninguna de las ${zonas.length} zonas queda con el nombre cortado`,
        recortadas.map((z) => `${z.titulo || z.texto}`).join(' · '),
      );
      const estrechas = zonas.filter((z) => z.anchoNombre <= z.anchoBarra);
      okInicio(
        estrechas.length === 0,
        '  y el nombre tiene más ancho que la barra, que era la causa',
        estrechas.map((z) => `${z.texto}: nombre ${z.anchoNombre}px vs barra ${z.anchoBarra}px`).join(' · '),
      );
      const valores = zonas.filter((z) => z.valorRecortado);
      okInicio(
        valores.length === 0,
        '  y ni el porcentaje ni «Sin bahías» se recortan',
        valores.map((z) => z.texto).join(' · '),
      );
      const conTitulo = zonas.every((z) => z.titulo.length > 0);
      okInicio(conTitulo, '  y cada nombre conserva su texto completo como respaldo');
    }

    // --- 5. La composición de la referencia aprobada, a 1536x960 (paso 9 del documento) ----------
    //
    // Se mide la ESTRUCTURA, no el parecido: qué bloques hay, en qué orden y con qué proporción.
    // «Se parece» no es comprobable; «la ocupación es más ancha que el gráfico» sí.
    {
      await page.setViewportSize({ width: 1536, height: 960 });
      await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);

      const comp = await page.evaluate(() => {
        const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const caja = (sel) => {
          const n = document.querySelector(sel);
          return n ? { x: Math.round(n.getBoundingClientRect().x), ancho: Math.round(n.getBoundingClientRect().width), alto: Math.round(n.getBoundingClientRect().height) } : null;
        };
        const analitica = [...document.querySelectorAll('.lx-home-grid--analytics > .lx-card')];
        const franja = document.querySelector('.lx-home__status');
        const kpis = document.querySelector('.lx-home-kpis');
        return {
          saludo: rec(document.querySelector('.lx-home__title h1')?.textContent),
          donde: rec(document.querySelector('.lx-home__when')?.textContent),
          reloj: Boolean(document.querySelector('.lx-home__hour')),
          donut: caja('.lx-donut'),
          donutNumero: rec(document.querySelector('.lx-donut__number')?.textContent),
          ocupacionAncho: analitica[0] ? Math.round(analitica[0].getBoundingClientRect().width) : 0,
          graficoAncho: analitica[1] ? Math.round(analitica[1].getBoundingClientRect().width) : 0,
          ranking: document.querySelectorAll('.lx-zone-rank__row').length,
          rankingPuestos: [...document.querySelectorAll('.lx-zone-rank__pos')].map((n) => rec(n.textContent)),
          apiladas: document.querySelectorAll('.lx-home-stack > .lx-card').length,
          eventos: document.querySelectorAll('.lx-feed__item').length,
          // El estado vacío DISEÑADO —dos renglones, no un párrafo centrado— es una respuesta
          // válida a «cuántos eventos hay»: en una municipalidad sin actividad reciente, cero es
          // el dato. Se mide para poder distinguirlo de una tarjeta que no dibujó nada.
          actividadVacia: Boolean(document.querySelector('.lx-feed__empty-title')),
          /* Qué actos trae el rastro, para que la próxima corrida conteste por qué la tarjeta está
             vacía sin tener que adivinarlo. Si acá vienen actos y la tarjeta sigue en cero, el
             problema es la lista blanca `ACTOS` de HomePage, que decide qué se muestra. */
          actosEnPantalla: [...document.querySelectorAll('.lx-feed__title')]
            .map((n) => rec(n.textContent))
            .slice(0, 6),
          // La franja de servicios tiene que estar DESPUÉS de los KPI en el documento, no antes.
          franjaDespuesDeKpis:
            Boolean(franja && kpis) && franja.getBoundingClientRect().top > kpis.getBoundingClientRect().top,
          franjaPiezas: document.querySelectorAll('.lx-home__status .lx-status-bar__item').length,
          // Las etiquetas del gráfico semanal: días de la semana, no fechas.
          etiquetasBarras: [...document.querySelectorAll('.lx-bars__col-label')].map((n) => rec(n.textContent)),
          altoTotal: document.documentElement.scrollHeight,
          desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });

      console.log('\n-- composición a 1536x960 --');
      okInicio(/^Hola/.test(comp.saludo), 'el saludo encabeza el tablero', `«${comp.saludo}»`);
      okInicio(
        /^Administración municipal ·/.test(comp.donde),
        '  y debajo dice «Administración municipal · municipalidad»',
        `«${comp.donde}»`,
      );
      okInicio(comp.reloj, '  con la fecha y la hora a la derecha');
      okInicio(comp.donut !== null, 'el dónut de ocupación existe');
      okInicio(
        comp.donut !== null && comp.donut.ancho >= 140,
        '  y es grande, como en la referencia',
        comp.donut ? `${comp.donut.ancho}px` : 'sin dónut',
      );
      // La inversión que pide la sección 6: la ocupación pasa a ser la columna ancha.
      okInicio(
        comp.ocupacionAncho > comp.graficoAncho,
        'la ocupación es más ancha que el gráfico de ingresos',
        `ocupación ${comp.ocupacionAncho}px vs gráfico ${comp.graficoAncho}px`,
      );
      okInicio(comp.apiladas === 2, 'la columna derecha de la fila 3 lleva dos tarjetas apiladas', `son ${comp.apiladas}`);
      /*
        Corregido el 08-10-2026, y era un defecto MÍO de la prueba, no de la pantalla.

        Esta línea exigía 4-5 eventos siempre. En staging la tarjeta trae cero y está mostrando su
        estado vacío, que es exactamente lo que el paso 8 del documento pide que exista. Afirmar
        datos sembrados es la sexta vez esta semana que una comprobación mía falla por lo que
        espera y no por lo que hay: «hay 4-5 filas» no es la regla, la regla es «hay 4-5 filas o se
        dice con intención que no hay ninguna».

        Lo que sigue siendo un fallo: cero eventos sin estado vacío. Eso es una tarjeta que no
        dibujó nada, y es lo que esta comprobación cuida ahora.
      */
      okInicio(
        (comp.eventos >= 4 && comp.eventos <= 5) || (comp.eventos === 0 && comp.actividadVacia),
        '  y la actividad muestra 4-5 eventos reales, o su estado vacío',
        `eventos=${comp.eventos} vacíoDiseñado=${comp.actividadVacia}`,
      );
      if (comp.eventos === 0) {
        /*
          La línea que contestó la pregunta (08-10-2026).

          Imprimió «actos visibles: ninguno» y eso mandó a comparar la lista blanca de la portada
          —doce actos— contra `AuditAction` del servidor, que tiene ochenta y ocho. Faltaba
          `PARKING_SESSION_STARTED`, el acto más frecuente de una municipalidad de
          estacionamiento. Se deja la línea: si la tarjeta vuelve a vaciarse, lo primero que hay
          que saber es si el rastro no trae nada o si trae algo que la pantalla descarta.
        */
        console.log(
          `  ··  la actividad está vacía; actos visibles: ${comp.actosEnPantalla.join(' · ') || 'ninguno'}`,
        );
      }
      okInicio(
        comp.rankingPuestos.join(',') === comp.rankingPuestos.map((_, i) => String(i + 1)).join(','),
        'el ranking de zonas está numerado en orden',
        comp.rankingPuestos.join(' · ') || 'vacío (puede ser correcto si no hay zonas con bahías)',
      );
      okInicio(comp.franjaDespuesDeKpis, 'los estados técnicos ya no encabezan la pantalla');
      /*
        Cinco, no cuatro (corregido el 08-10-2026). Otro defecto de la prueba: escribí `=== 4`
        leyendo el documento, que nombra cuatro estados técnicos —«sistema, base de datos,
        fiscalización y pasarela»—, y la pantalla arma CINCO: esos cuatro más las alertas de pagos
        fallidos, que ya estaban antes de mover la franja.

        `>= 4` y la cuenta impresa: lo que esta comprobación cuida es que al bajar la franja al pie
        no se perdiera ninguna pieza, y para eso el piso es la respuesta correcta. Un `=== 5` se
        rompería el día que se añada un servicio, que es justo cuando nadie querría arreglar una
        prueba.
      */
      okInicio(
        comp.franjaPiezas >= 4,
        '  y no se perdió ninguna pieza al bajarla al pie',
        `son ${comp.franjaPiezas}`,
      );
      const dias = /^(lun|mar|mié|mie|jue|vie|sáb|sab|dom)/i;
      okInicio(
        comp.etiquetasBarras.length === 0 || comp.etiquetasBarras.every((e) => dias.test(e)),
        'el gráfico semanal se rotula con días de la semana',
        comp.etiquetasBarras.join(' · '),
      );
      okInicio(!comp.desborde, 'no hay desplazamiento horizontal a 1536px');

      /* --- Lo que la especificación cerrada del 09-10-2026 añade --------------------------------
         Su regla principal es «NO ELIMINAR INFORMACIÓN EXISTENTE» y nombra los ocho bloques que
         tienen que seguir en Inicio. Se comprueban por existencia, que es exactamente la forma de
         esa regla: lo que importa no es cómo se ven sino que no hayan desaparecido al compactar. */
      const cerrada = await page.evaluate(() => {
        const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const px = (n, prop) => (n ? Math.round(parseFloat(getComputedStyle(n)[prop])) : 0);
        const titulos = [...document.querySelectorAll('.lx-section-header__title, h2')].map((n) => rec(n.textContent));
        return {
          titulos,
          kpiValorPx: px(document.querySelector('.lx-metric__value'), 'fontSize'),
          tituloModuloPx: px(document.querySelector('.lx-section-header__title'), 'fontSize'),
          radioTarjeta: px(document.querySelector('.lx-card'), 'borderTopLeftRadius'),
          // §9: los títulos de los accesos NO pueden estar recortados en escritorio.
          accesosRecortados: [...document.querySelectorAll('.lx-quick-tile__title')]
            .filter((n) => n.scrollWidth > n.clientWidth + 1)
            .map((n) => rec(n.textContent)),
          espacios: rec(document.querySelector('.lx-donut')?.parentElement?.textContent).includes('espacios'),
          totalSemana: Boolean(document.querySelector('.lx-home__week-total')),
          // §12: el bloque de atención existe SÓLO con incidencias. Las dos salidas son correctas.
          atencion: document.querySelectorAll('.lx-home-attention__item').length,
          atencionVacia: document.querySelectorAll('.lx-home-attention').length === 0,
        };
      });

      const OBLIGATORIOS = [
        'Ocupación en tiempo real',
        'Ingresos esta semana',
        'Actividad reciente',
        'Accesos rápidos',
        'Zonas más utilizadas',
        'Estado de los servicios',
      ];
      for (const bloque of OBLIGATORIOS) {
        okInicio(
          cerrada.titulos.some((titulo) => titulo.includes(bloque)),
          `«${bloque}» sigue en Inicio`,
          cerrada.titulos.join(' · '),
        );
      }
      okInicio(
        cerrada.accesosRecortados.length === 0,
        'ningún título de acceso rápido queda recortado en escritorio',
        cerrada.accesosRecortados.join(' · '),
      );
      okInicio(
        cerrada.kpiValorPx >= 28 && cerrada.kpiValorPx <= 34,
        `el número de un KPI mide ${cerrada.kpiValorPx}px (la especificación pide 28-34)`,
      );
      okInicio(
        cerrada.tituloModuloPx >= 18 && cerrada.tituloModuloPx <= 20,
        `los títulos de módulo miden ${cerrada.tituloModuloPx}px (pide 18-20)`,
      );
      okInicio(
        cerrada.radioTarjeta >= 14 && cerrada.radioTarjeta <= 18,
        `el radio de tarjeta es ${cerrada.radioTarjeta}px (pide 14-18)`,
      );
      okInicio(cerrada.espacios, 'bajo el dónut se dice de cuántos espacios sale el porcentaje');
      okInicio(cerrada.totalSemana, 'el gráfico semanal lleva su total encima');
      okInicio(
        cerrada.atencion > 0 || cerrada.atencionVacia,
        '«Atención requerida» aparece con incidencias reales, o no aparece',
        `items=${cerrada.atencion} ausente=${cerrada.atencionVacia}`,
      );
    }

    // --- 6. Los estados del paso 8: cargando, error y cero --------------------------------------
    //
    // Se provocan de verdad interceptando la red, no se simulan con una clase de CSS: el estado que
    // importa es el que la pantalla compone cuando el servidor no contesta lo que esperaba.
    {
      // Error: el panel falla y la pantalla tiene que decirlo sin romperse.
      const ctxError = await browser.newContext({
        storageState: estado,
        viewport: { width: 1536, height: 960 },
        locale: 'es-CR',
        ignoreHTTPSErrors: true,
      });
      const pe = await ctxError.newPage();
      await pe.route('**/api/v1/admin/dashboard/revenue-series**', (ruta) => ruta.fulfill({ status: 500, body: '{}' }));
      await pe.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      await pe.waitForTimeout(2400);
      const conError = await pe.evaluate(() => ({
        reintentar: Boolean(document.querySelector('.lx-inline-error')),
        sigueViva: document.querySelectorAll('.lx-home-kpis .lx-metric').length,
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      console.log('\n-- estados (paso 8) --');
      okInicio(conError.reintentar, 'con el gráfico caído aparece el error con su botón de reintentar');
      okInicio(conError.sigueViva === 4, '  y las cuatro tarjetas siguen en pie', `son ${conError.sigueViva}`);
      okInicio(!conError.desborde, '  y no se desborda');
      await ctxError.close();

      // Cero: el panel contesta vacío. Un cero medido se escribe 0; un gráfico sin serie no se
      // inventa una.
      const ctxCero = await browser.newContext({
        storageState: estado,
        viewport: { width: 1536, height: 960 },
        locale: 'es-CR',
        ignoreHTTPSErrors: true,
      });
      const pc = await ctxCero.newPage();
      await pc.route('**/api/v1/admin/users**', (ruta) =>
        ruta.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], page: 0, size: 1, totalElements: 0, totalPages: 0 }),
        }),
      );
      await pc.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      await pc.waitForTimeout(2400);
      const cero = await pc.evaluate(() => {
        const tarjetas = [...document.querySelectorAll('.lx-home-kpis .lx-metric')];
        const usuarios = tarjetas.find((n) => /Usuarios registrados/.test(n.textContent || ''));
        return { valor: (usuarios?.querySelector('.lx-metric__value')?.textContent || '').trim() };
      });
      okInicio(cero.valor === '0', 'un cero real se escribe 0, no «sin dato»', `dice «${cero.valor}»`);
      await ctxCero.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${TAMANOS.length} tamaños · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
