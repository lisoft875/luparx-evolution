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
 *   5. QUE QUEDEN LAS CAPTURAS DE LA ENTREGA. El documento del 09-10 se detiene en Inicio hasta
 *      que las imágenes de escritorio y tablet/móvil estén revisadas, así que la corrida las deja
 *      escritas en `tests/responsive/capturas/admin-inicio-*.png`.
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
  /*
    CUATRO a 1280 otra vez, y la ida y vuelta vale la pena contarla.

    Ayer subí el corte a 1320 para que «₡1.250.040» no se desbordara — un monto de siete cifras que
    yo mismo había inyectado en la réplica como caso peor. La correccion final lo reporta como
    regresión: «se muestran los cuatro KPI en dos filas de dos, a pesar del ancho disponible».
    Protegí un valor hipotético y rompí el real.

    Ahora el corte está en 1100 y lo que cede al estrecharse es el adorno —el chevron, dos puntos
    de la cifra, dos píxeles del icono y del relleno— en vez de la fila de cuatro. Medido con el
    monto REAL: entra sin desbordarse de 1100 para arriba.
  */
  { nombre: 'laptop',           width: 1280, height: 800, dedo: false, kpisEsperados: 4 },
  /* 1366x768 lo pide la correctiva por nombre dos veces: la prueba H —«revisar también con
     1366 × 768 y 1024 × 768»— y la entrega, que exige su captura. Es además el ancho donde la
     etiqueta del KPI se parte en dos renglones, o sea donde el techo de 120 se pone a prueba. */
  { nombre: 'laptop 1366',      width: 1366, height: 768, dedo: false, kpisEsperados: 4 },
  /* «Probar ancho intermedio y confirmar que el diseño de escritorio no salta prematuramente a dos
     KPI por fila» (paso 7.5). 1152 es el ancho que una ventana no maximizada ocupa de verdad, o el
     que deja una pantalla de 1440 al 125% de zoom — que es la hipótesis más probable de la captura
     de las 20:00. */
  { nombre: 'ventana 1152',     width: 1152, height: 720, dedo: false, kpisEsperados: 4 },
  { nombre: 'escritorio',       width: 1440, height: 900, dedo: false, kpisEsperados: 4 },
  { nombre: 'escritorio grande',width: 1920, height: 1080, dedo: false, kpisEsperados: 4 },
];

/** Los números de la imagen de referencia. Ninguno puede salir de la base en staging. */
/*
  Las medidas que se comprueban en MÁS DE UN SITIO, declaradas una sola vez.

  Esto no es aseo. Es el defecto concreto que dejó este arnés en rojo dos despliegues seguidos: el
  diámetro del anillo se comprobaba en tres lugares y la caja del icono del KPI en dos, cada uno con
  el rango de una especificación distinta, y los rangos se contradecían. Un número con dos rangos
  incompatibles es un arnés que NO PUEDE estar en verde: pase lo que pase en la pantalla, uno de los
  dos falla. Y lo que reportaba en rojo no era un defecto, era una decisión ya tomada.

  Manda el rango COMPACTADO, y no por ser el que pasa: es el de la última orden. La «especificación
  exacta» de la mañana del 13-10 pedía anillo de 115-125 y caja de icono de 36-40; esa misma tarde
  la orden fue «compacta el encabezado y las cuatro tarjetas superiores, reduce la altura excesiva
  de los gráficos», y al día siguiente «quiero conservar el diseño actual porque en el monitor
  grande se ve muy bien». El diseño que Javier aprobó mirándolo es el de 104px y 32px. La
  especificación de la mañana quedó atrás ese mismo día.

  Si mañana se decide volver a agrandarlos, se cambia AQUÍ y cambia en todas partes.
*/
const ANILLO = [100, 110];
const KPI_ICONO_CAJA = [30, 36];
const KPI_ICONO_GLIFO = [18, 20];

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

      // -------------------------------------------------------------------------------------
      // Las capturas que el documento pide entregar antes de seguir (§17: «detenerse y entregar
      // capturas completas de escritorio y tablet/móvil»).
      //
      // Se guardan DOS archivos distintos para los tres tamaños de la entrega, porque miden cosas
      // distintas y confundirlas cuesta una revisión entera:
      //
      //   -vista.png     lo que ve el ojo: un viewport, con la barra superior donde está pegada.
      //   -completa.png  la página entera. Playwright, al capturar la página completa, dibuja los
      //                  elementos `position: sticky` a media página en vez de arriba. Es un
      //                  artefacto de la captura, NO un defecto de la pantalla: quien revise la
      //                  imagen completa va a ver el encabezado flotando en el medio y no es real.
      //
      // Para los otros cinco tamaños alcanza la vista: existen para medir, no para mostrar.
      // -------------------------------------------------------------------------------------
      /* Los tres anchos cuya captura pide la §12: 1536 y 1366 de escritorio y el 390 de mano, que
         sigue siendo el que enseña si algo se parte. 1440 y 768 se conservan de la entrega
         anterior porque son los que Javier ya tiene de referencia para comparar. */
      const ENTREGA = [390, 768, 1366, 1440, 1536, 1920];
      const nombreCaptura = `admin-inicio-${tam.width}x${tam.height}`;
      await page.screenshot({ path: `tests/responsive/capturas/${nombreCaptura}-vista.png` });
      if (ENTREGA.includes(tam.width)) {
        await page.screenshot({
          path: `tests/responsive/capturas/${nombreCaptura}-completa.png`,
          fullPage: true,
        });
      }
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

      /*
        La llamada a la bitácora, vista desde fuera (12-10-2026).

        La portada muestra una lista blanca de actos de NEGOCIO sobre un rastro de ochenta y ocho
        acciones. Hasta hoy pedía las cuarenta más recientes SIN filtrar y descartaba en el
        cliente; el 12-10 esta misma corrida imprimió «actos visibles: ninguno» con la tarjeta
        vacía, porque el rastro de sistema llenaba la primera página.

        Se miran las DOS mitades, que fallan por separado: que la petición lleve el filtro, y que
        lo que el servidor devuelve llegue a dibujarse. Una tarjeta vacía con la respuesta llena
        es un defecto del cliente; una petición sin filtro es la regresión de hoy volviendo.
      */
      let bitacoraUrl = null;
      let bitacoraItems = null;
      const verPeticion = (peticion) => {
        if (peticion.url().includes('/admin/audit-events')) bitacoraUrl = peticion.url();
      };
      const verRespuesta = async (respuesta) => {
        if (!respuesta.url().includes('/admin/audit-events') || !respuesta.ok()) return;
        try {
          const cuerpo = await respuesta.json();
          bitacoraItems = Array.isArray(cuerpo?.items) ? cuerpo.items : null;
        } catch {
          /* una respuesta que no es JSON no dice nada de esto */
        }
      };
      page.on('request', verPeticion);
      page.on('response', verRespuesta);

      await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);
      page.off('request', verPeticion);
      page.off('response', verRespuesta);

      okInicio(
        bitacoraUrl !== null && bitacoraUrl.includes('actions='),
        'la portada le pide a la bitácora sólo sus actos, no las N más recientes de todo',
        bitacoraUrl ? decodeURIComponent(bitacoraUrl.split('?')[1] ?? '') : 'no hubo llamada a la bitácora',
      );
      if (Array.isArray(bitacoraItems)) {
        const ACTOS_DE_LA_PORTADA = new Set([
          'PARKING_SESSION_STARTED', 'PARKING_SESSION_FINISHED', 'PARKING_ZONE_CREATED',
          'USER_REGISTERED', 'USER_PASSWORD_RESET_REQUESTED', 'WALLET_TOPUP_RECORDED',
          'CITATION_ISSUED', 'CITATION_PAID', 'CITATION_CANCELLED', 'CITATION_APPEAL_FILED',
          'CITATION_APPEAL_RESOLVED', 'PLATE_EXEMPTION_GRANTED', 'PARKING_SPACE_CREATED',
          'PARKING_ZONE_UPDATED', 'PARKING_RATE_UPDATED', 'PARKING_POLICY_UPDATED',
          'PARKING_SCHEDULE_UPDATED',
        ]);
        const ajenos = bitacoraItems.map((e) => e.action).filter((a) => !ACTOS_DE_LA_PORTADA.has(a));
        okInicio(
          ajenos.length === 0,
          '  y el servidor devuelve sólo esos actos',
          [...new Set(ajenos)].join(', '),
        );
        const dibujables = bitacoraItems.filter((e) => ACTOS_DE_LA_PORTADA.has(e.action)).length;
        // Cuatro desde el 13-10-2026: ver `EVENTOS_A_MOSTRAR` en HomePage y la razón escrita ahí.
        const esperados = Math.min(dibujables, 4);
        const pintados = await page.evaluate(() => document.querySelectorAll('.lx-feed__item').length);
        okInicio(
          pintados === esperados,
          `  y los ${esperados} que caben se dibujan (la respuesta trae ${bitacoraItems.length})`,
          `pintados ${pintados}`,
        );
      }

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
          /* La fila inferior es de TRES columnas (36/31/33), las de la referencia aprobada que
             el «Paso D» de «Inicio adaptable» manda reproducir. Lo que se mide es el reparto real;
             las alturas no, porque la asimetría está autorizada por escrito. */
          filaBanchos: [...document.querySelectorAll('.lx-home-grid--operation > *')].map((n) =>
            Math.round(n.getBoundingClientRect().width),
          ),
          filaBaltos: [...document.querySelectorAll('.lx-home-grid--operation > *')].map((n) =>
            Math.round(n.getBoundingClientRect().height),
          ),
          // Ya no hay pila: si esta clase reaparece, es que volvió la distribución que el
          // «Paso D» descarta, y vale la pena que el arnés lo diga en vez de dejarlo pasar.
          pilaDerecha: document.querySelectorAll('.lx-home-stack').length,
          // La duplicación que el §1 manda corregir: la fecha y el monto del día repetidos debajo
          // del total semanal. Se comprueba por ausencia del nodo que los dibujaba.
          diaDuplicado: Boolean(document.querySelector('.lx-home__week-today')),
          // Y el otro defecto del §1: un monto partido en dos renglones. `getClientRects()` da una
          // caja por línea, así que más de una es un número roto.
          cifrasPartidas: [...document.querySelectorAll('.lx-metric__value')]
            .filter((n) => n.getClientRects().length > 1)
            .map((n) => rec(n.textContent)),
          cifrasDesbordadas: [...document.querySelectorAll('.lx-metric__value')]
            .filter((n) => n.scrollWidth > n.clientWidth + 1)
            .map((n) => rec(n.textContent)),
          operacionAlineacion: (() => {
            const f = document.querySelector('.lx-home-grid--operation');
            return f ? getComputedStyle(f).alignItems : null;
          })(),
          menuAncho: Math.round(
            document.querySelector('.lx-page-layout__sidebar')?.getBoundingClientRect().width ?? 0,
          ),
          menuRecortado: [...document.querySelectorAll('.lx-nav-link')].filter(
            (n) => n.scrollWidth > n.clientWidth + 1,
          ).length,
          contenidoAncho: Math.round(
            document.querySelector('.lx-page-layout__content')?.getBoundingClientRect().width ?? 0,
          ),
          barraSuperior: Math.round(
            document.querySelector('.lx-page-layout__header')?.getBoundingClientRect().height ?? 0,
          ),
          tarjetaRelleno: (() => {
            const c = document.querySelector('.lx-home .lx-card--dense');
            return c ? Math.round(parseFloat(getComputedStyle(c).paddingTop)) : null;
          })(),
          areaRelleno: (() => {
            const c = document.querySelector('.lx-page-layout__content');
            return c ? Math.round(parseFloat(getComputedStyle(c).paddingLeft)) : null;
          })(),
          areaHueco: (() => {
            const h = document.querySelector('.lx-home');
            return h ? Math.round(parseFloat(getComputedStyle(h).rowGap)) : null;
          })(),
          /* Solape por intersección de cajas en los encabezados de tarjeta. No lo detecta ninguna
             regla de desborde —superponer no desborda— y ya pasó una vez: el rótulo del gráfico
             impreso encima del rango de fechas. */
          solapes: (() => {
            const textos = [...document.querySelectorAll('.lx-section-header *, .lx-bars__callout')]
              .filter((n) => n.childElementCount === 0 && (n.textContent || '').trim().length > 0);
            const choques = [];
            for (let i = 0; i < textos.length; i += 1) {
              for (let j = i + 1; j < textos.length; j += 1) {
                const a = textos[i].getBoundingClientRect();
                const b = textos[j].getBoundingClientRect();
                if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
                  choques.push(`«${textos[i].textContent.trim().slice(0, 20)}» x «${textos[j].textContent.trim().slice(0, 20)}»`);
                }
              }
            }
            return choques;
          })(),
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
      /*
        120-150, y esta línea contradecía a otra de este mismo archivo (12-10-2026).

        Pedía «≥140, como en la referencia» y venía de la especificación de octubre, cuando el
        dónut era la pieza grande del bloque. La orden del 08-10 lo bajó a 136 a propósito —«el
        dónut deja de dominar», para que la lista de zonas se quedara con el ancho que suelta— y
        doscientas líneas más abajo este arnés ya comprueba el rango nuevo (120-150) con esa razón
        escrita al lado.

        O sea que el arnés se pedía dos cosas incompatibles a sí mismo y reportaba en rojo una
        decisión tomada hace cuatro días. Es el mismo defecto que tuvo el arnés de Fiscalización
        esta semana: una prueba que sobrevive a la especificación que la justificaba.
      */
      okInicio(
        comp.donut !== null && comp.donut.ancho >= ANILLO[0] && comp.donut.ancho <= ANILLO[1],
        `  y mide ${ANILLO[0]}-${ANILLO[1]}px`,
        comp.donut ? `${comp.donut.ancho}px` : 'sin dónut',
      );
      // La inversión que pide la sección 6: la ocupación pasa a ser la columna ancha.
      okInicio(
        comp.ocupacionAncho > comp.graficoAncho,
        'la ocupación es más ancha que el gráfico de ingresos',
        `ocupación ${comp.ocupacionAncho}px vs gráfico ${comp.graficoAncho}px`,
      );
      /* 54/46 en el boceto del 13-10. Era 58/42 desde el 09-10; el gráfico recupera ancho porque
         recupera su eje, su total y la línea del día. */
      {
        const total = comp.ocupacionAncho + comp.graficoAncho;
        const repartoA = [
          Math.round((comp.ocupacionAncho / total) * 100),
          Math.round((comp.graficoAncho / total) * 100),
        ];
        okInicio(
          Math.abs(repartoA[0] - 53) <= 2 && Math.abs(repartoA[1] - 47) <= 2,
          `  y se reparten ${repartoA.join('/')} (la «exacta» §3 pide ~53/47)`,
        );
      }
      /*
        La fila inferior es de TRES columnas: actividad, accesos y zonas, una al lado de otra.

        Esta línea ha pedido dos columnas, luego tres, luego dos otra vez, y ahora tres. No es
        indecisión del arnés: es que cada encargo trajo su composición y el arnés se corrige CON la
        especificación, nunca contra ella. La que manda hoy es la del 13-10 y no deja hueco: «Paso
        D — Reproducir la composición de la referencia aprobada; no imponer la nueva distribución
        propuesta posteriormente», con esa referencia impresa en la página 1 del propio documento.

        Las alturas siguen sin comprobarse, por la razón que ya estaba escrita acá: la asimetría
        está autorizada por escrito y lo que importa es que nadie ESTIRE una tarjeta, que es lo que
        mira `align-items`.
      */
      okInicio(
        comp.filaBanchos.length === 3,
        'la fila inferior tiene tres columnas (actividad, accesos y zonas)',
        `son ${comp.filaBanchos.length}`,
      );
      if (comp.filaBanchos.length === 3) {
        const total = comp.filaBanchos.reduce((a, b) => a + b, 0);
        const reparto = comp.filaBanchos.map((w) => Math.round((w / total) * 100));
        /* 40/30/30. La «Especificación exacta» §3 lo escribe y su figura A lo dibuja: medido sobre
           ese dibujo, 520 / 372 / 372 px sobre 1264 de contenido. Venía de 36/31/33, que salía de
           medir la figura ANTERIOR; los dos puntos de más que tenían los accesos existían para que
           «Registrar espacio» entrara en un 2×2, y con la cuadrícula en una columna sobran. */
        const esperado = [40, 30, 30];
        okInicio(
          reparto.every((v, i) => Math.abs(v - esperado[i]) <= 3),
          `  y se reparten ${reparto.join('/')} (la referencia pide ~${esperado.join('/')})`,
        );
        okInicio(
          comp.operacionAlineacion === 'start' || comp.operacionAlineacion === 'flex-start',
          `  y ninguna tarjeta se estira para igualar a su vecina (align-items: ${comp.operacionAlineacion})`,
        );
        console.log(`  ··  alturas ${comp.filaBaltos.join('/')}px con ${comp.eventos} eventos (la asimetría está permitida)`);
      }
      okInicio(
        comp.pilaDerecha === 0,
        '  y no ha vuelto la pila de dos tarjetas que el Paso D descarta',
        `pilas encontradas: ${comp.pilaDerecha}`,
      );
      okInicio(
        comp.menuAncho >= 240 && comp.menuAncho <= 250,
        `el menú lateral mide ${comp.menuAncho}px (la definitiva pide 240-250)`,
      );
      okInicio(
        comp.menuRecortado === 0,
        '  y ninguna etiqueta del menú se recorta a ese ancho',
        `${comp.menuRecortado} recortadas`,
      );
      okInicio(
        comp.barraSuperior >= 60 && comp.barraSuperior <= 64,
        `la barra superior mide ${comp.barraSuperior}px (la definitiva pide 64 y «no aumentar»)`,
      );
      /* «Ancho restante fluido», pero con techo (§2 del 13-10: «contenido centrado con ancho
         máximo de 1500-1600 px»). A 1536 el menú se lleva 248 y quedan 1288, por debajo del techo,
         así que a ESTE ancho el contenido sigue usando todo lo que el menú suelta. El techo se
         comprueba donde se nota, que es a 1920, en el bloque de los tres viewports. */
      okInicio(
        comp.contenidoAncho >= 1536 - comp.menuAncho - 2,
        `el contenido usa el ancho que deja el menú (${comp.contenidoAncho}px)`,
      );
      okInicio(
        comp.tarjetaRelleno !== null && comp.tarjetaRelleno >= 14 && comp.tarjetaRelleno <= 18,
        `las tarjetas del tablero tienen ${comp.tarjetaRelleno}px de relleno (pide 14-18)`,
      );
      /* Tabla §3: «Área principal — padding 18-20 px; separación entre filas 12-14 px». */
      okInicio(
        comp.areaRelleno >= 16 && comp.areaRelleno <= 20,
        `el área principal tiene ${comp.areaRelleno}px de relleno (pide 16-20)`,
      );
      okInicio(
        comp.areaHueco >= 10 && comp.areaHueco <= 14,
        `y ${comp.areaHueco}px de separación entre filas (pide 10-14)`,
      );
      okInicio(
        comp.solapes.length === 0,
        'ningún texto de encabezado se imprime encima de otro',
        comp.solapes.join(' · '),
      );
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
        (comp.eventos >= 1 && comp.eventos <= 4) || (comp.eventos === 0 && comp.actividadVacia),
        '  y la actividad muestra hasta 4 eventos reales, o su estado vacío',
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
      /* Los dos defectos que el §1 de la definitiva nombra uno por uno. */
      okInicio(
        comp.cifrasPartidas.length === 0,
        'ninguna cifra de KPI se parte en dos renglones',
        comp.cifrasPartidas.join(' · '),
      );
      okInicio(
        comp.cifrasDesbordadas.length === 0,
        '  ni se sale de su tarjeta',
        comp.cifrasDesbordadas.join(' · '),
      );
      okInicio(
        !comp.diaDuplicado,
        'el total semanal no repite la fecha y el monto del día (ya están en su KPI)',
      );

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
          // La semana puede sumar cero de verdad, y entonces el total NO se dibuja: la tarjeta lo
          // dice con todas las letras debajo del gráfico. Sin esto la prueba exigía un número que
          // la pantalla tiene razón en no tener.
          semanaEnCero: rec(document.body.textContent).includes('Sin recaudación registrada'),
          // §7, «cada elemento debe tener su propia zona de layout»: el rótulo del día y el monto
          // que dibuja el gráfico salían del flujo para apoyarse en el renglón del título, y ahí
          // ya vivía el rango. Superponer no desborda, así que ninguna regla genérica lo ve: hay
          // que medir el cruce de las dos cajas.
          encabezadoCruzado: (() => {
            const callout = document.querySelector('.lx-bars__callout');
            const card = callout?.closest('.lx-card');
            const rotulo = card?.querySelector('.lx-section-header__aside');
            const titulo = card?.querySelector('.lx-section-header__title');
            if (!callout || !rotulo) return null;
            const a = callout.getBoundingClientRect();
            const cruza = (b) =>
              b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            const r = rotulo.getBoundingClientRect();
            const t = titulo?.getBoundingClientRect();
            if (!cruza(r) && !cruza(t)) return null;
            return `«${rec(callout.textContent)}» se imprime encima de «${rec((cruza(r) ? rotulo : titulo).textContent)}»`;
          })(),
          // La otra mitad del §9: la ayuda del acceso rápido tampoco puede quedar con «…».
          ayudasVisibles: [...document.querySelectorAll('.lx-quick-tile__hint')]
            .filter((n) => getComputedStyle(n).display !== 'none').length,
          ayudasRecortadas: [...document.querySelectorAll('.lx-quick-tile__hint')]
            .filter((n) => getComputedStyle(n).display !== 'none' && n.scrollWidth > n.clientWidth + 1)
            .map((n) => rec(n.textContent)),
          // §12: el bloque de atención existe SÓLO con incidencias. Las dos salidas son correctas.
          atencion: document.querySelectorAll('.lx-home-attention__item').length,
          atencionVacia: document.querySelectorAll('.lx-home-attention').length === 0,
          atencionAlto: (() => {
            const n = document.querySelector('.lx-home-attention');
            return n ? Math.round(n.getBoundingClientRect().height) : null;
          })(),
          accesosFlechas: [...document.querySelectorAll('.lx-quick-tile__go')].filter(
            (n) => getComputedStyle(n).display !== 'none',
          ).length,
          accesosTotal: document.querySelectorAll('.lx-quick-tile').length,
        };
      });

      /*
        La tabla de geometría del plan visual del 09-10-2026. Igual que en el ciudadano, sustituye
        a las medidas sueltas: donde dos documentos hablan del mismo bloque con números distintos
        manda el más reciente, y su criterio lo dice —la composición de la referencia prevalece
        sobre una medida que produzca otro resultado visual.
      */
      const TABLA = await page.evaluate(() => {
        const alto = (sel) => {
          const n = document.querySelector(sel);
          return n ? Math.round(n.getBoundingClientRect().height) : null;
        };
        const kpis = [...document.querySelectorAll('.lx-home-kpis .lx-metric')].map((n) =>
          Math.round(n.getBoundingClientRect().height),
        );
        const etiqueta = document.querySelector('.lx-metric__label');
        const donut = document.querySelector('.lx-donut');
        const ejes = document.querySelectorAll('.lx-bars__axis-tick');
        const rotulo = document.querySelector('.lx-bars__callout');
        const barras = [...document.querySelectorAll('.lx-bars__bar')].length;
        return {
          saludo: alto('.lx-home__top'),
          kpis,
          kpisIguales: new Set(kpis).size <= 1,
          etiquetaPx: etiqueta ? Math.round(parseFloat(getComputedStyle(etiqueta).fontSize)) : null,
          filaA: [alto('.lx-home-grid--analytics > *:nth-child(1)'), alto('.lx-home-grid--analytics > *:nth-child(2)')],
          donut: donut ? Math.round(donut.getBoundingClientRect().width) : null,
          ejes: ejes.length,
          /* Con todo en cero el eje repetía «₡0» tres veces y el rótulo una cuarta. */
          ejesRepetidos: [...new Set([...ejes].map((n) => n.textContent.trim()))].length === 1 && ejes.length > 1,
          rotuloVisible: rotulo ? rotulo.textContent.trim().length > 0 : false,
          barras,
          /* §6: con los siete días en cero NO hay gráfico, hay un estado vacío compacto y
             centrado. Las dos salidas son correctas y se distinguen acá, para que el resto de las
             comprobaciones del gráfico no afirmen un eje que la pantalla tiene razón en no
             dibujar. */
          vacioIngresos: (() => {
            const n = document.querySelector('.lx-home-grid--analytics .lx-empty-state--inline');
            if (!n) return null;
            return {
              texto: n.textContent.replace(/\s+/g, ' ').trim(),
              // Que el bloque de texto sea compacto: lo que no puede volver a pasar es un gráfico
              // de ejes de 150px de alto sin un solo dato.
              altoTexto: Math.round(n.querySelector('.lx-empty-state__title').getBoundingClientRect().height),
            };
          })(),
          // §5: «filas de 27-32 px» en la lista de zonas del dónut.
          filasZona: [...document.querySelectorAll('.lx-occupancy .lx-zone-row')].map((n) =>
            Math.round(n.getBoundingClientRect().height),
          ),
          // §7: «filas compactas de 30-34 px» en «Zonas más utilizadas».
          filasRanking: [...document.querySelectorAll('.lx-zone-rank__row')].map((n) =>
            Math.round(n.getBoundingClientRect().height),
          ),
          // §7: «cada acceso de 62-76 px aprox.; ícono de 16-18 px, título 12-13 px».
          baldosas: [...document.querySelectorAll('.lx-quick-tile')].map((n) =>
            Math.round(n.getBoundingClientRect().height),
          ),
          // Cuántas baldosas comparten el renglón de arriba: 1 significa una sola columna.
          accesosPorFila: (() => {
            const t = [...document.querySelectorAll('.lx-quick-tile')];
            if (t.length === 0) return 0;
            const arriba = t[0].getBoundingClientRect().top;
            return t.filter((n) => Math.abs(n.getBoundingClientRect().top - arriba) < 4).length;
          })(),
          baldosaTituloPx: (() => {
            const n = document.querySelector('.lx-quick-tile__title');
            return n ? Math.round(parseFloat(getComputedStyle(n).fontSize)) : null;
          })(),
          baldosaGlifo: (() => {
            const n = document.querySelector('.lx-quick-tile__icon svg');
            return n ? Math.round(n.getBoundingClientRect().width) : null;
          })(),
          // Tabla §3: «ícono 16-20 px en contenedor 30-34 px».
          kpiIconoCaja: (() => {
            const n = document.querySelector('.lx-metric__icon');
            return n ? Math.round(n.getBoundingClientRect().width) : null;
          })(),
          kpiIconoGlifo: (() => {
            const n = document.querySelector('.lx-metric__icon svg');
            return n ? Math.round(n.getBoundingClientRect().width) : null;
          })(),
          // §7: nada del ranking puede quedar con «…». La prueba E lo pide para toda la pantalla.
          rankingRecortado: [...document.querySelectorAll('.lx-zone-rank__name')]
            .filter((n) => n.scrollWidth > n.clientWidth + 1)
            .map((n) => n.textContent.trim()),
        };
      });
      const dentro = (v, min, max) => v !== null && v >= min && v <= max;
      /* 50-62 (correctiva 12-10-2026). Era 64-84 por la especificación anterior, y es el rango que
         esta misma línea comprobaba en verde esta mañana: la tabla nueva pide «bloque de 50-62 px,
         sin hero alto». Medido, el bloque daba 64 por el h1 a 30px; ahora da 56. */
      /* 60-75 (boceto aprobado, 13-10-2026). Esta línea ha pedido 64-80, luego 50-62 y ahora
         60-75: cada encargo trae su rango y manda el más reciente, que es además el que viene con
         la imagen aprobada delante. */
      /*
        ATENCIÓN: estos rangos van POR DEBAJO de los que piden las tres tablas anteriores, y es a
        propósito.

        El 13-10 por la mañana se pidió saludo 56-64, KPI 100-112 y gráficos 240-275; al mediodía,
        saludo 62-70, KPI 105-118 y gráficos 245-270. Se cumplieron los dos: medido en staging,
        63 / 108 / 252. Y la respuesta fue, tres veces, que la pantalla seguía ocupando demasiado
        alto — porque esos números son los que ya tenía desde el principio.

        El encargo de la tarde da la instrucción contraria y en imperativo: «compacta el encabezado
        y las cuatro tarjetas superiores», «reduce la altura excesiva de los gráficos sin perder
        información». No se puede cumplir eso y quedarse dentro de 105-118 a la vez. Manda la
        instrucción más reciente, y este arnés la comprueba a ella.
      */
      okInicio(dentro(TABLA.saludo, 44, 50), `el saludo mide ${TABLA.saludo}px (compactado: 44-50)`);
      okInicio(
        TABLA.kpisIguales && TABLA.kpis.every((h) => dentro(h, 84, 94)),
        `los cuatro KPI miden ${TABLA.kpis.join('/')}px (compactado: 84-94 e iguales)`,
      );
      okInicio(
        dentro(TABLA.etiquetaPx, 13, 14),
        `la etiqueta del KPI mide ${TABLA.etiquetaPx}px (pide 13-14)`,
      );
      okInicio(
        /* 196-225. Bajó otros 28 la noche del 13-10 y no por compactar más: era la única forma
           de quitarle el aire a la tarjeta de OCUPACIÓN. La fila iguala alturas, así que el
           sobrante de la de ocupación lo decidía la de ingresos; con la pista de barras en 96 las
           dos caben en lo que ocupan. */
        TABLA.filaA.every((h) => dentro(h, 196, 225)),
        `la fila de gráficos mide ${TABLA.filaA.join(' y ')}px (compactado: 196-225)`,
      );
      okInicio(
        dentro(TABLA.donut, ...ANILLO),
        `el anillo mide ${TABLA.donut}px de diámetro (compactado: ${ANILLO.join('-')})`,
      );
      okInicio(
        !TABLA.ejesRepetidos,
        'el gráfico no repite la misma cifra en todo el eje',
        `${TABLA.ejes} marcas iguales`,
      );
      /*
        Las barras, sólidas. El defecto era de ORDEN DE PINTADO y no de color: `.lx-bars__grid`
        es `position: absolute` y las columnas eran botones sin posicionar, así que las tres
        líneas de referencia se dibujaban ENCIMA de cada barra y la partían en bloques. El orden
        del DOM ya era el correcto —la cuadrícula va primero— pero el orden del DOM no decide
        entre un elemento posicionado y uno que no lo está.

        Se comprueba por lo único que no miente acá, que es el píxel: se busca la línea de
        cuadrícula que cruza la barra más alta y se mira de qué color es la barra justo ahí. Si
        es el gris del borde, la línea está encima; si es el azul de la barra, está detrás.
      */
      {
        const capa = await page.evaluate(() => {
          const barras = [...document.querySelectorAll('.lx-bars__bar')];
          if (barras.length === 0) return null;
          const alta = barras.reduce((a, n) =>
            n.getBoundingClientRect().height > a.getBoundingClientRect().height ? n : a,
          );
          const rb = alta.getBoundingClientRect();
          if (rb.height < 12) return null;
          const cruza = [...document.querySelectorAll('.lx-bars__grid-line')]
            .map((n) => n.getBoundingClientRect())
            .filter((x) => x.top > rb.top + 3 && x.top < rb.bottom - 3);
          const estiloCol = getComputedStyle(alta.closest('.lx-bars__col'));
          const estiloGrid = getComputedStyle(document.querySelector('.lx-bars__grid'));
          return {
            cruces: cruza.length,
            colPosicionada: estiloCol.position !== 'static',
            colIndice: estiloCol.zIndex,
            gridIndice: estiloGrid.zIndex,
          };
        });
        if (capa === null) {
          console.log('  ··  sin barras con alto suficiente para comprobar el apilado');
        } else {
          okInicio(
            capa.colPosicionada && Number(capa.colIndice) > Number(capa.gridIndice || 0),
            `  y las líneas de la cuadrícula quedan DETRÁS de las barras (columna z=${capa.colIndice}, cuadrícula z=${capa.gridIndice})`,
            `columna posicionada: ${capa.colPosicionada}`,
          );
        }
      }
      /*
        Hasta hoy esta línea exigía las siete barras siempre, y con la semana en cero las siete
        estaban dibujadas con altura cero: era verde sobre el defecto que la §6 manda corregir. Las
        dos salidas válidas son ahora «siete barras» o «el estado vacío con su frase», y nunca las
        dos a la vez: un eje sin datos ya no es una respuesta aceptable.
      */
      okInicio(
        (TABLA.barras === 7 && TABLA.vacioIngresos === null)
          || (TABLA.barras === 0 && TABLA.vacioIngresos !== null),
        TABLA.vacioIngresos
          ? '  la semana sumó cero y se dice en un estado vacío compacto, sin gráfico de ejes'
          : '  los siete días siguen dibujados',
        `barras=${TABLA.barras} vacío=${TABLA.vacioIngresos ? `«${TABLA.vacioIngresos.texto}»` : 'no'}`,
      );
      if (TABLA.vacioIngresos) {
        okInicio(
          /Sin recaudación registrada en este per/i.test(TABLA.vacioIngresos.texto),
          '  y la frase es la que pide la §6',
          TABLA.vacioIngresos.texto,
        );
        okInicio(
          TABLA.vacioIngresos.altoTexto <= 40,
          `  y el bloque es compacto (${TABLA.vacioIngresos.altoTexto}px de texto, no 150 de eje vacío)`,
        );
      }
      /* Las piezas que la correctiva mide una por una. */
      okInicio(
        /* 24-30. Eran 27-32, y las cinco filas de esta lista son lo que de verdad pesaba en la
           tarjeta de ocupación: cinco por 32 son 160 de los 195 que medía el bloque. De ahí sale
           la mayor parte del recorte de los gráficos que pide el encargo de la tarde, y no del
           anillo, que ya estaba en el suelo de su rango. Siguen siendo objetivos de dedo válidos. */
        TABLA.filasZona.length > 0 && TABLA.filasZona.every((h) => dentro(h, 24, 30)),
        `las filas de zona del dónut miden ${TABLA.filasZona.join('/')}px (compactado: 24-30)`,
      );
      okInicio(
        TABLA.filasRanking.length === 0 || TABLA.filasRanking.every((h) => dentro(h, 30, 34)),
        `las filas del ranking miden ${TABLA.filasRanking.join('/')}px (la §7 pide 30-34)`,
      );
      okInicio(
        TABLA.rankingRecortado.length === 0,
        '  y ningún nombre del ranking queda con puntos suspensivos',
        TABLA.rankingRecortado.join(' · '),
      );
      /*
        64-70 a 1536, y la desviación respecto de los 46-54 de la tabla §3 está decidida a
        propósito, no heredada.

        A este ancho la columna de accesos mide 379 y su cuadrícula 351. «Registrar espacio» pide
        109px de texto en un renglón, que en un 2×2 necesitaría una cuadrícula de 404. O sea que
        acá sólo hay dos salidas: dos renglones por baldosa, o un título recortado. La referencia
        aprobada de la página 1 dibuja exactamente dos renglones, y el propio §3 dice que sus
        rangos son «de partida, no restricciones rígidas: nunca cortar números, etiquetas, barras
        ni controles para cumplir un número».

        El rango de 46-54 sí se comprueba, donde la baldosa SÍ es de un renglón: a 1920 y a 1366,
        en el bloque de los tres viewports.
      */
      /*
        44-50, y en UNA columna. La figura A de la «exacta» dibuja las cuatro baldosas una debajo
        de otra, en un renglón cada una y con su flecha; a ese ancho el título entra entero y la
        baldosa vuelve a medir lo que mide un renglón. Esta línea ha pedido 50-56, luego 62-70 con
        dos renglones, y ahora esto: cada figura trae su composición y manda la más reciente.
      */
      okInicio(
        TABLA.baldosas.length === 4 && TABLA.baldosas.every((h) => dentro(h, 36, 46)),
        `los cuatro accesos miden ${TABLA.baldosas.join('/')}px (un renglón, compactado: 36-46)`,
      );
      okInicio(
        TABLA.accesosPorFila === 1,
        `  y van en una sola columna (${TABLA.accesosPorFila} por fila)`,
      );
      okInicio(
        dentro(TABLA.baldosaTituloPx, 12, 13),
        `el título del acceso mide ${TABLA.baldosaTituloPx}px (pide 12-13)`,
      );
      okInicio(
        dentro(TABLA.baldosaGlifo, 16, 18),
        `su ícono mide ${TABLA.baldosaGlifo}px (pide 16-18)`,
      );
      okInicio(
        dentro(TABLA.kpiIconoCaja, ...KPI_ICONO_CAJA) && dentro(TABLA.kpiIconoGlifo, ...KPI_ICONO_GLIFO),
        `el ícono del KPI mide ${TABLA.kpiIconoGlifo}px en un contenedor de ${TABLA.kpiIconoCaja}px (compactado: ${KPI_ICONO_GLIFO.join('-')} en ${KPI_ICONO_CAJA.join('-')})`,
      );

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
        cerrada.kpiValorPx >= 23 && cerrada.kpiValorPx <= 27,
        `el número de un KPI mide ${cerrada.kpiValorPx}px (compactado: 23-27)`,
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
      okInicio(
        cerrada.totalSemana || cerrada.semanaEnCero,
        'el gráfico semanal lleva su total encima, o la semana sumó cero y lo dice',
        `total=${cerrada.totalSemana} semanaEnCero=${cerrada.semanaEnCero}`,
      );
      okInicio(
        cerrada.encabezadoCruzado === null,
        'nada se imprime encima del encabezado del gráfico',
        cerrada.encabezadoCruzado ?? '',
      );
      /*
        La §7 marca la descripción del acceso como OPCIONAL y en esta pantalla no se dibuja: en la
        columna del 30% la baldosa más ancha deja 130px de texto y la ayuda más corta mide ~155, o
        sea que a ningún ancho cabría entera. Esta comprobación cuida las dos salidas —ausente, o
        presente y completa— porque «ausente» hacía pasar en silencio la versión recortada.
      */
      okInicio(
        cerrada.ayudasVisibles === 0 || cerrada.ayudasRecortadas.length === 0,
        cerrada.ayudasVisibles === 0
          ? 'la ayuda del acceso no se dibuja (opcional por la §7), así que no hay nada que recortar'
          : 'ninguna ayuda de acceso rápido queda recortada en escritorio',
        cerrada.ayudasRecortadas.join(' · '),
      );
      okInicio(
        cerrada.atencion > 0 || cerrada.atencionVacia,
        '«Atención requerida» aparece con incidencias reales, o no aparece',
        `items=${cerrada.atencion} ausente=${cerrada.atencionVacia}`,
      );
      /* Y cuando aparece es una FRANJA, no una tarjeta: 50-64 px. El boceto lo dice con todas las
         letras —«una franja horizontal roja tenue, no una tarjeta gigante»— y es la diferencia
         entre un aviso que se lee de paso y un bloque que empuja el pie fuera de la pantalla. */
      if (cerrada.atencionAlto !== null) {
        okInicio(
          cerrada.atencionAlto >= 50 && cerrada.atencionAlto <= 64,
          `  y mide ${cerrada.atencionAlto}px de alto (el boceto pide 50-64)`,
        );
      }
      /* La flecha de los accesos: el boceto la dibuja, y por debajo de 330px de cuadrícula se
         esconde a propósito porque si no el título se corta. Las dos salidas son correctas; lo que
         no puede pasar es que haya flecha Y título cortado, que es lo que comprueba la línea de
         arriba sobre `accesosRecortados`. */
      console.log(
        `  ··  flechas en los accesos: ${cerrada.accesosFlechas} de ${cerrada.accesosTotal}`,
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

    // --- 7. La tabla de «Inicio adaptable» §3, en sus tres viewports ----------------------------
    //
    // El documento del 13-10 no trae una escala, trae DOS: «Grande / mediano» y «Portátil
    // pequeño», y nombra los tres anchos donde se comprueban. Hasta ese documento esta pantalla
    // tenía una sola escala por encima de 1200, de modo que un 1366×768 —312px menos de alto que
    // un 1080— recibía las alturas de un monitor de escritorio.
    //
    // Cada medida se comprueba contra la columna que le toca. Las dos desviaciones conocidas van
    // escritas al lado de su línea, no escondidas en un rango ancho: un rango que abarca las dos
    // escalas no comprueba ninguna.
    {
      /*
        PANTALLA contra VIEWPORT, y es la corrección más importante de esta tanda.

        La captura del problema es una pantalla de 1440×900 y el arnés venía midiendo 1440×900.
        Pero lo que la aplicación recibe no es la pantalla: es el VIEWPORT, y en esa captura mide
        unos 1440×608 —entre la barra de menú de macOS, las pestañas, la barra de direcciones, la
        de marcadores y el Dock, el navegador se lleva 292px—. Medido sobre su propia captura, con
        la barra lateral de 248px de regla.

        O sea que el arnés comprobaba una ventana 292px más alta que la real y por eso NUNCA podía
        ver la fila inferior cortada que ella sí ve. El §4 de la «Especificación exacta» lo dice
        con todas las letras: «no diseñar como si los 960 px completos fueran espacio disponible;
        calcular el alto útil a partir del contenedor real del navegador».

        Así que cada pantalla del §7 se corre DOS veces, con la pantalla entera y con el viewport
        real, y la salida dice cuál es cuál. Lo que se exige en el viewport corto no es que todo
        quepa —el propio §7 autoriza «scroll vertical normal, corto y justificado»— sino que nada
        quede cortado, tapado ni oculto para aparentar que cabe.
      */
      const CHROME_MACOS = 292;
      const TRES = [
        {
          nombre: 'escritorio grande', width: 1920, height: 1080, pequeno: false,
          // §2 de la mañana: «contenido centrado con ancho máximo de 1500-1600 px». Es el único
          // donde el techo se alcanza: 1920 - 248 de menú son 1672, por encima de 1600.
          anchoTope: [1500, 1600],
          baldosa: [36, 46],
        },
        { nombre: 'escritorio 1536', width: 1536, height: 960, pequeno: false, anchoTope: null, baldosa: [36, 46] },
        { nombre: 'escritorio mediano', width: 1440, height: 900, pequeno: false, anchoTope: null, baldosa: [36, 46] },
        { nombre: 'portátil 1366', width: 1366, height: 768, pequeno: true, anchoTope: null, baldosa: [36, 46] },
        { nombre: 'laptop 1280', width: 1280, height: 800, pequeno: true, anchoTope: null, baldosa: [36, 46] },
      ].flatMap((v) => [
        { ...v, nombre: `${v.nombre} · pantalla` },
        {
          ...v,
          nombre: `${v.nombre} · viewport real`,
          height: v.height - CHROME_MACOS,
          /*
            `bajo` se CALCULA, no se supone. Lo puse en `true` para todos los viewports reales y
            la corrida lo cobró en el sitio exacto: a 1920×1080 el viewport real son 788px, que
            está por encima del corte de 760 de la hoja, así que ahí manda la escala de
            escritorio y la hoja hace bien en no compactar nada. El arnés exigía KPI de 88-102 y
            gráficos de 205-235 donde la pantalla tiene sitio de sobra para 108 y 252.

            Es la misma trampa de siempre, en su variante más tonta: una condición escrita a mano
            donde ya existe el número que la decide. El corte vive en la hoja de estilos; acá se
            reproduce, no se reinventa.
          */
          bajo: v.height - CHROME_MACOS <= 760,
          anchoTope: v.anchoTope,
        },
      ]);
      const ctxTres = await browser.newContext({
        storageState: estado,
        locale: 'es-CR',
        ignoreHTTPSErrors: true,
      });
      const pt = await ctxTres.newPage();
      console.log('\n-- la tabla §3 en los tres viewports del 13-10 --');
      for (const v of TRES) {
        await pt.setViewportSize({ width: v.width, height: v.height });
        await pt.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
        await pt.waitForTimeout(2400);
        await pt.screenshot({ path: `tests/responsive/capturas/exacta-${v.width}x${v.height}-vista.png` });
        await pt.screenshot({ path: `tests/responsive/capturas/exacta-${v.width}x${v.height}-completa.png`, fullPage: true });

        const m = await pt.evaluate(() => {
          const alto = (sel) => {
            const n = document.querySelector(sel);
            return n ? Math.round(n.getBoundingClientRect().height) : null;
          };
          const ancho = (sel) => {
            const n = document.querySelector(sel);
            return n ? Math.round(n.getBoundingClientRect().width) : null;
          };
          const px = (sel, prop) => {
            const n = document.querySelector(sel);
            return n ? Math.round(parseFloat(getComputedStyle(n)[prop])) : null;
          };
          const fila = [...document.querySelectorAll('.lx-home-grid--operation > *')];
          const kpis = [...document.querySelectorAll('.lx-home-kpis .lx-metric')];
          const primeraFila = kpis.filter(
            (n) => Math.abs(n.getBoundingClientRect().top - kpis[0].getBoundingClientRect().top) < 4,
          ).length;
          return {
            ventana: { w: window.innerWidth, h: window.innerHeight },
            barra: alto('.lx-page-layout__header'),
            menu: ancho('.lx-page-layout__sidebar'),
            contenido: ancho('.lx-page-layout__content'),
            // El centrado: lo que queda a cada lado del contenido dentro del hueco que deja el menú.
            margenIzq: (() => {
              const c = document.querySelector('.lx-page-layout__content');
              const b = document.querySelector('.lx-page-layout__body');
              const m = document.querySelector('.lx-page-layout__sidebar');
              if (!c || !b || !m) return null;
              return Math.round(c.getBoundingClientRect().left - m.getBoundingClientRect().right);
            })(),
            huecoFilas: px('.lx-home', 'rowGap'),
            rellenoTarjeta: px('.lx-home .lx-card--dense', 'paddingTop'),
            kpiAlto: kpis.length ? Math.round(kpis[0].getBoundingClientRect().height) : null,
            kpisPrimeraFila: primeraFila,
            kpiCifraPx: px('.lx-metric__value', 'fontSize'),
            kpiGlifo: ancho('.lx-metric__icon svg'),
            kpiCaja: ancho('.lx-metric__icon'),
            graficos: [...document.querySelectorAll('.lx-home-grid--analytics > *')].map((n) =>
              Math.round(n.getBoundingClientRect().height),
            ),
            donut: ancho('.lx-donut'),
            baldosas: [...document.querySelectorAll('.lx-quick-tile')].map((n) =>
              Math.round(n.getBoundingClientRect().height),
            ),
            columnas: fila.length,
            reparto: (() => {
              const total = fila.reduce((a, n) => a + n.getBoundingClientRect().width, 0);
              return fila.map((n) => Math.round((n.getBoundingClientRect().width / total) * 100));
            })(),
            // Lo que el §6 manda comprobar en los tres: nada cortado, nada encima de nada, sin
            // scroll horizontal, y los bloques todos presentes.
            recortados: [
              ...document.querySelectorAll(
                '.lx-metric__value, .lx-metric__label, .lx-quick-tile__title, .lx-zone-row__name, .lx-zone-rank__name, .lx-feed__title',
              ),
            ]
              .filter((n) => n.scrollWidth > n.clientWidth + 1)
              .map((n) => (n.textContent || '').trim().slice(0, 28)),
            partidas: [...document.querySelectorAll('.lx-metric__value')]
              .filter((n) => n.getClientRects().length > 1)
              .map((n) => (n.textContent || '').trim()),
            desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            documento: document.documentElement.scrollHeight,
            // Un contenedor del tablero con su propia barra es la «doble barra» que el §5 prohíbe.
            dobleScroll: [...document.querySelectorAll('.lx-page-layout__content, .lx-home, .lx-home *')]
              .filter((n) => {
                const e = getComputedStyle(n);
                return (e.overflowY === 'auto' || e.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1;
              })
              .map((n) => String(n.className).slice(0, 40)),
            // Y contenido recortado por `overflow: hidden`, que es «aparentar que cabe».
            ocultos: [...document.querySelectorAll('.lx-home, .lx-home .lx-card')]
              .filter((n) => getComputedStyle(n).overflow === 'hidden' && n.scrollHeight > n.clientHeight + 2)
              .map((n) => `${String(n.className).slice(0, 30)}(${n.scrollHeight}>${n.clientHeight})`),
            bloques: [...document.querySelectorAll('.lx-section-header__title, .lx-home-attention__title, .lx-home__status-label')].map(
              (n) => (n.textContent || '').trim(),
            ),
            pila: document.querySelectorAll('.lx-home-stack').length,
            contenedor: (() => {
              const n = document.querySelector('.lx-home');
              return n ? getComputedStyle(n).containerType : null;
            })(),
          };
        });

        const dentro = (val, [min, max]) => val !== null && val >= min && val <= max;
        /*
          Tres escalas, no dos, y cada una con su razón:

            - `bajo`: el viewport es corto (≤760 de alto) y la hoja compacta lo vertical. Es la
              escala que le toca a la captura del problema, 1440×608.
            - `pequeno`: la pantalla es estrecha (≤1400) y lo que cambia es el menú y el glifo.
            - el resto: hay sitio, así que mandan los rangos del §4 de la tarde en su solape con
              los de la mañana.
        */
        const R = v.bajo
          ? { barra: [56, 64], menu: [210, 250], hueco: [8, 12], kpi: [82, 94], graf: [180, 225], relleno: [12, 18] }
          : v.pequeno
            ? { barra: [56, 68], menu: [210, 235], hueco: [10, 14], kpi: [84, 94], graf: [196, 225], relleno: [12, 18] }
            : { barra: [60, 68], menu: [230, 250], hueco: [10, 14], kpi: [84, 94], graf: [196, 225], relleno: [14, 18] };

        console.log(`\n  ${v.nombre} · ${v.width}×${v.height} (innerWidth ${m.ventana.w}, innerHeight ${m.ventana.h})`);
        okInicio(dentro(m.barra, R.barra), `  encabezado fijo ${m.barra}px (pide ${R.barra.join('-')})`);
        okInicio(dentro(m.menu, R.menu), `  menú lateral ${m.menu}px (pide ${R.menu.join('-')})`);
        okInicio(dentro(m.huecoFilas, R.hueco), `  separación entre cards ${m.huecoFilas}px (pide ${R.hueco.join('-')})`);
        okInicio(dentro(m.kpiAlto, R.kpi), `  KPI ${m.kpiAlto}px de alto (pide ${R.kpi.join('-')})`);
        okInicio(
          m.graficos.length > 0 && m.graficos.every((h) => dentro(h, R.graf)),
          `  gráficos ${m.graficos.join(' y ')}px (pide ${R.graf.join('-')})`,
        );
        okInicio(dentro(m.rellenoTarjeta, R.relleno), `  relleno de cards ${m.rellenoTarjeta}px (pide ${R.relleno.join('-')})`);
        okInicio(
          m.baldosas.length === 4 && m.baldosas.every((h) => dentro(h, v.baldosa)),
          `  accesos rápidos ${m.baldosas.join('/')}px (acá pide ${v.baldosa.join('-')})`,
        );
        // Paso B: «Número 25-29 px», «ícono en caja discreta de 34-40 px».
        okInicio(dentro(m.kpiCifraPx, [23, 27]), `  la cifra del KPI mide ${m.kpiCifraPx}px (compactado: 23-27)`);
        okInicio(
          dentro(m.kpiCaja, KPI_ICONO_CAJA) && dentro(m.kpiGlifo, KPI_ICONO_GLIFO),
          `  su ícono mide ${m.kpiGlifo}px en una caja de ${m.kpiCaja}px (compactado: ${KPI_ICONO_GLIFO.join('-')} en ${KPI_ICONO_CAJA.join('-')})`,
        );
        // Paso C: «Donut de 110-125 px».
        okInicio(dentro(m.donut, ANILLO), `  el anillo mide ${m.donut}px (compactado: ${ANILLO.join('-')})`);
        // Paso F: «No convertir los cuatro KPI en 2×2 en una pantalla de escritorio con ancho
        // suficiente». Los tres lo tienen.
        okInicio(m.kpisPrimeraFila === 4, `  los cuatro KPI están en una fila`, `son ${m.kpisPrimeraFila}`);
        okInicio(m.partidas.length === 0, '  y ningún monto se parte en dos renglones', m.partidas.join(' · '));
        // Paso D: la composición de la referencia.
        okInicio(m.columnas === 3, `  la fila inferior tiene tres columnas`, `son ${m.columnas}`);
        okInicio(m.pila === 0, '  y no ha vuelto la pila de dos tarjetas', `pilas: ${m.pila}`);
        /*
          Y que las filas se reorganicen por el ancho del TABLERO y no por el de la ventana. Es
          la diferencia entre adaptarse al espacio disponible y adaptarse a un proxy del espacio
          disponible: a 1200 de ventana el tablero mide 940, y con el menú a otro ancho mediría
          otra cosa. Se comprueba que el contenedor exista; los cortes ya se comprueban por su
          efecto, contando columnas en cada viewport.
        */
        okInicio(
          m.contenedor === 'inline-size',
          `  y el tablero es contenedor de consulta (container-type: ${m.contenedor})`,
        );
        /*
          Y que nada quede DETRÁS del encabezado pegajoso.

          Es un defecto que ninguna medida de caja ve: las tarjetas miden lo que deben y están
          donde deben; lo que falla es a dónde LLEVA el navegador cuando algo pide entrar en
          pantalla. Al tabular con el teclado, con un `scrollIntoView` o al restaurar el foco, el
          navegador alinea el elemento con el borde del contenedor de scroll —el documento— y la
          barra pegajosa flota por encima sin entrar en esa cuenta.

          Medido antes del arreglo a 1536×668: nueve de veinticuatro elementos enfocables del
          tablero acababan con su borde superior en y=0, enteros detrás de la barra de 64px. Así
          que se comprueba moviéndolos de verdad, uno por uno, no leyendo la propiedad.
        */
        const tapados = await pt.evaluate(async () => {
          const barra = document.querySelector('.lx-page-layout__header');
          const alto = barra ? barra.getBoundingClientRect().height : 0;
          const fuera = [];
          for (const n of document.querySelectorAll('.lx-home a, .lx-home button, .lx-metric')) {
            n.scrollIntoView();
            await new Promise((r) => setTimeout(r, 0));
            if (n.getBoundingClientRect().top < alto - 1) {
              fuera.push(String(n.className || n.tagName).slice(0, 28));
            }
          }
          window.scrollTo(0, 0);
          return { fuera, alto: Math.round(alto), relleno: getComputedStyle(document.documentElement).scrollPaddingTop };
        });
        okInicio(
          tapados.fuera.length === 0,
          `  y nada queda detrás del encabezado al traerlo a la vista (barra ${tapados.alto}px, scroll-padding ${tapados.relleno})`,
          `${tapados.fuera.length} tapados: ${tapados.fuera.slice(0, 4).join(', ')}`,
        );
        if (m.columnas === 3) {
          console.log(`  ··  reparto ${m.reparto.join('/')} (la figura A pide ~40/30/30)`);
        }
        // §2 para 1920: el techo y el centrado.
        if (v.anchoTope) {
          okInicio(
            dentro(m.contenido, v.anchoTope),
            `  el contenido topa en ${m.contenido}px (pide ${v.anchoTope.join('-')})`,
          );
          okInicio(
            m.margenIzq !== null && m.margenIzq > 10,
            `  y queda centrado en el hueco del menú (${m.margenIzq}px a la izquierda)`,
          );
        }
        // §6: nada cortado, nada tapado, sin scroll horizontal.
        okInicio(m.recortados.length === 0, '  ningún texto queda con puntos suspensivos', m.recortados.join(' · '));
        okInicio(!m.desborde, '  y no hay scroll horizontal');
        /*
          Las tres reglas del §5 de la «exacta» sobre el alto, comprobadas y no declaradas:

            - nada se oculta con `overflow: hidden` para aparentar que cabe;
            - no hay doble barra de desplazamiento (body + panel principal);
            - y el desplazamiento que quede es el del CONTENIDO: se imprime para que se vea si es
              «corto y justificado» o si algo lo está inflando.
        */
        okInicio(m.ocultos.length === 0, '  nada se oculta con overflow para aparentar que cabe', m.ocultos.join(' · '));
        okInicio(m.dobleScroll.length === 0, '  y no hay doble barra de desplazamiento', m.dobleScroll.join(' · '));
        console.log(`  ··  documento ${m.documento}px · desplazamiento ${Math.max(0, m.documento - m.ventana.h)}px`);
        for (const bloque of ['Ocupación en tiempo real', 'Ingresos esta semana', 'Actividad reciente', 'Accesos rápidos', 'Zonas más utilizadas']) {
          okInicio(
            m.bloques.some((t) => t.includes(bloque)),
            `  «${bloque}» sigue presente`,
            m.bloques.join(' · '),
          );
        }
      }
      await ctxTres.close();
    }
    await ctx.close();
  }

  /* ================================================================================================
     La guía de implementación visual del 14-10-2026, comprobada en el navegador
     ================================================================================================

     Lo que la guía pide es un cambio de COLOR, y un cambio de color es justo el que una prueba de
     cajas no ve: las medidas siguen siendo las mismas, las columnas siguen siendo las mismas, y la
     pantalla puede estar entera del color equivocado con todo en verde.

     Se comprueba lo que de verdad se puede romper:

       1. Que la paleta acotada LLEGUE. Que el `:has(.lx-home)` se evalúe en el navegador —y no sólo
          en la hoja— sobre el lienzo, el cromo, la tarjeta y la baldosa destacada.
       2. Que las cuatro tarjetas de KPI tengan CUATRO fondos distintos, que es lo que el paso 4
          pide, y no cuatro veces el mismo con el icono de otro color.
       3. Que el anillo use el degradado y no el azul plano, y que las barras de ingresos lleven un
          degradado vertical.
       4. Y lo que el §07 PROHÍBE: que el Panel —la pantalla de al lado, mismo portal— siga con el
          lienzo de antes. Ésta es la que de verdad importa: un `:has()` mal escrito, o un token
          puesto un bloque más arriba, repinta los cuatro portales y nadie se entera hasta que
          alguien abre otra pantalla.

     Los valores no se escriben a mano en una lista paralela: se leen de `tokens.css`, que es lo que
     se despliega. Una prueba contra una copia de los hexadecimales comprueba la copia.
  */
  {
    console.log('\n── La guía visual del 14-10: la paleta del Inicio, y sólo del Inicio ──');
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(
      path.join(__dirname, '..', '..', 'packages', 'ui', 'src', 'tokens.css'),
      'utf8',
    );
    /** El valor de un token dentro del PRIMER bloque cuyo selector es exactamente éste. */
    const token = (selector, nombre) => {
      const i = css.indexOf(`\n${selector} {`);
      if (i < 0) return null;
      const cuerpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('\n}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
      const m = cuerpo.match(new RegExp(`^\\s*${nombre}\\s*:\\s*(.+?);\\s*$`, 'm'));
      return m ? m[1].trim() : null;
    };
    const AMBITO = ":root[data-portal='admin']:has(.lx-home)";
    const ADMIN = ":root[data-portal='admin']";
    /** `#071629` → `rgb(7, 22, 41)`, que es como el navegador devuelve un color calculado. */
    const aRgb = (hex) => {
      const h = hex.trim().replace('#', '');
      const p = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
    };

    const esperado = {
      lienzo: token(AMBITO, '--lx-bg'),
      cromo: token(AMBITO, '--lx-chrome'),
      tarjeta: token(AMBITO, '--lx-surface'),
    };
    const lienzoViejo = token(ADMIN, '--lx-bg');
    okInicio(
      Boolean(esperado.lienzo && esperado.cromo && esperado.tarjeta && lienzoViejo),
      `  los tokens salen de tokens.css (lienzo ${esperado.lienzo}, cromo ${esperado.cromo}, tarjeta ${esperado.tarjeta}; el del resto del admin sigue siendo ${lienzoViejo})`,
      'falta alguno de los bloques en tokens.css',
    );
    okInicio(
      esperado.lienzo !== lienzoViejo,
      '  y el lienzo del Inicio no es el mismo que el del resto del portal (si lo fuera, esta prueba no probaría nada)',
    );

    const ctxColor = await browser.newContext({
      storageState: estado,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      viewport: { width: 1536, height: 960 },
    });
    const pc = await ctxColor.newPage();

    await pc.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
    await pc.waitForTimeout(2400);
    await pc.screenshot({ path: 'tests/responsive/capturas/guia-visual-inicio-1536x960.png' });
    await pc.screenshot({ path: 'tests/responsive/capturas/guia-visual-inicio-1536x960-completa.png', fullPage: true });

    const v = await pc.evaluate(() => {
      const cs = (n) => (n ? getComputedStyle(n) : null);
      const fondoDe = (sel) => {
        const e = cs(document.querySelector(sel));
        return e ? e.backgroundColor : null;
      };
      const kpis = [...document.querySelectorAll('.lx-home-kpis .lx-metric')].map(
        (n) => getComputedStyle(n).backgroundColor,
      );
      const arco = document.querySelector('.lx-donut__value');
      const barras = [...document.querySelectorAll('.lx-bars__bar')].map(
        (n) => getComputedStyle(n).backgroundImage,
      );
      const activo = document.querySelector('.lx-nav-link--active');
      return {
        lienzo: cs(document.body).backgroundColor,
        cromo: fondoDe('.lx-page-layout__header'),
        tarjeta: fondoDe('.lx-home-grid--analytics > .lx-card'),
        baldosa: fondoDe('.lx-quick-tile'),
        kpis,
        arco: arco ? getComputedStyle(arco).stroke : null,
        barras,
        activo: activo ? getComputedStyle(activo).backgroundImage : null,
        tieneHome: Boolean(document.querySelector('.lx-home')),
        vacioIngresos: Boolean(document.querySelector('.lx-home-grid--analytics .lx-empty-state--inline')),
      };
    });

    okInicio(v.tieneHome, '  el Inicio sigue siendo el que lleva `.lx-home` (el gancho del ámbito)');
    /*
      El lienzo se compara por INCLUSIÓN y no por igualdad: `body` lleva dos degradados radiales
      encima del color, así que `backgroundColor` da el color base y `background` da la pila
      entera. Lo que se exige es que el color base sea el nuevo.
    */
    okInicio(v.lienzo === aRgb(esperado.lienzo), `  el lienzo es ${v.lienzo}`, `se esperaba ${aRgb(esperado.lienzo)}`);
    okInicio(v.cromo === aRgb(esperado.cromo), `  la cabecera es ${v.cromo}`, `se esperaba ${aRgb(esperado.cromo)}`);
    okInicio(v.tarjeta === aRgb(esperado.tarjeta), `  la tarjeta es ${v.tarjeta}`, `se esperaba ${aRgb(esperado.tarjeta)}`);
    okInicio(
      v.baldosa === aRgb('#12366a'),
      `  y la baldosa de acceso rápido lleva la «tarjeta destacada» de la guía (${v.baldosa})`,
      `se esperaba ${aRgb('#12366a')}`,
    );

    // Paso 4: cuatro matices, no cuatro iconos de colores sobre el mismo fondo.
    okInicio(v.kpis.length === 4, `  hay cuatro tarjetas de KPI`, `son ${v.kpis.length}`);
    okInicio(
      new Set(v.kpis).size === 4,
      `  y las cuatro tienen un fondo distinto: ${v.kpis.join(' · ')}`,
      `sólo ${new Set(v.kpis).size} fondo(s) distinto(s)`,
    );

    // Paso 5: el anillo con el degradado, que en CSS calculado se ve como un `url(#...)`.
    okInicio(
      typeof v.arco === 'string' && v.arco.includes('url('),
      `  el anillo de ocupación usa el degradado (${v.arco})`,
      'sigue con un color plano',
    );
    /*
      Paso 6: degradado vertical en las barras de ingresos.

      Con una condición que la primera versión de esta prueba no tenía y que la corrida del
      14-10 cobró en el sitio: SI HAY BARRAS. Cuando la semana suma cero el Inicio no dibuja un
      gráfico de ejes vacío —dice «Sin recaudación registrada en este período» en un bloque
      compacto, y hace bien—, así que no hay ninguna barra que pintar. Exigir siete degradados
      ahí es exigir que la pantalla invente datos para poder aprobar una prueba de color.

      Es el mismo patrón que el arnés ya usa doscientas líneas más arriba para el mismo gráfico:
      o siete barras y ningún estado vacío, o ninguna barra y el estado vacío puesto.
    */
    if (v.barras.length > 0) {
      okInicio(
        v.barras.every((b) => b.includes('linear-gradient')),
        `  las ${v.barras.length} barras de ingresos llevan degradado vertical`,
        v.barras.slice(0, 2).join(' · '),
      );
    } else {
      okInicio(
        v.vacioIngresos,
        '  no hay barras porque la semana sumó cero, y el estado vacío está puesto: el degradado no aplica hoy',
        'ni barras ni estado vacío: el gráfico no dibujó nada y eso sí es un defecto',
      );
    }
    // Paso 3: el «Inicio» activo, con degradado y no con un plano.
    okInicio(
      typeof v.activo === 'string' && v.activo.includes('linear-gradient'),
      '  el «Inicio» activo del menú lleva degradado',
      String(v.activo),
    );

    /*
      Y la prohibición del §07, que es la mitad del trabajo: la pantalla de al lado.

      Si esto falla, lo que hay no es un color feo: es que el ámbito no acota y el rediseño se
      derramó sobre el portal entero.
    */
    await pc.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await pc.waitForTimeout(2400);
    await pc.screenshot({ path: 'tests/responsive/capturas/guia-visual-panel-1536x960.png' });
    const panel = await pc.evaluate(() => ({
      lienzo: getComputedStyle(document.body).backgroundColor,
      cromo: (() => {
        const n = document.querySelector('.lx-page-layout__header');
        return n ? getComputedStyle(n).backgroundColor : null;
      })(),
      tieneHome: Boolean(document.querySelector('.lx-home')),
      titulo: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 40),
    }));
    okInicio(!panel.tieneHome && panel.titulo.length > 0, `  el Panel cargó y no es el Inicio («${panel.titulo}»)`);
    okInicio(
      panel.lienzo === aRgb(lienzoViejo),
      `  el Panel conserva su lienzo de siempre (${panel.lienzo})`,
      `se esperaba ${aRgb(lienzoViejo)} y el rediseño se le derramó encima`,
    );
    okInicio(
      panel.cromo !== aRgb(esperado.cromo),
      `  y su cabecera tampoco es la del Inicio (${panel.cromo})`,
      'la cabecera del Inicio llegó al Panel',
    );

    await ctxColor.close();
  }

  await browser.close();
  console.log(`\n===== ${TAMANOS.length} tamaños · ${fallos} con problemas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
