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

  await browser.close();
  console.log(`\n===== ${TAMANOS.length} tamaños · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
