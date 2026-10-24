/**
 * El teclado virtual, en los cinco tamaños que pide la orden del 20-10-2026.
 *
 * <h2>Cómo se simula un teclado en un navegador que no lo tiene</h2>
 *
 * Chromium no levanta teclado, pero el teclado no es más que esto: el viewport VISUAL se encoge y
 * el de maquetación no. `Page.setDeviceMetricsOverride` con `visibleSize` reproduce exactamente
 * esa asimetría por el protocolo de depuración, que es lo que lee `window.visualViewport`. No es
 * un teclado de verdad —un iPhone sigue SIN PROBAR— pero sí es la condición exacta a la que el
 * código reacciona.
 *
 * <h2>Qué se comprueba</h2>
 *
 * Que con el teclado arriba y el cursor en un campo: el campo se ve entero, nadie se le pone
 * encima, y ni la navegación inferior ni el botón fijo reciben toques. Y que al cerrar el teclado
 * las dos cosas vuelven, sin que la página haya saltado.
 *
 *   cd frontend && node tests/responsive/teclado-ciudadano.cjs
 */
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

const PUERTO = 5183;
const BASE = `http://localhost:${PUERTO}`;
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;

/*
  El alto del teclado NO es el mismo en todas partes, y usar 300 px en apaisado sería inventarse un
  caso que no existe: en horizontal el teclado de un teléfono es mucho más bajo, y en una tablet es
  más alto en píxeles pero sobre una pantalla mucho más larga.

  Los valores de abajo son APROXIMACIONES de los teclados reales de iOS y Android (incluida la barra
  de predicción). No están medidos en un dispositivo —no hay dispositivo— y lo que importa de ellos
  es otra cosa: que todos quedan por encima del umbral de 150 px, así que el código los trata como
  teclado, y que el espacio ÚTIL que dejan es el de verdad. El caso peor es el apaisado de 568×320,
  donde quedan 120 px para trabajar.
*/
/** El campo del código de bahía del paso 1, que es el que la orden nombra. */
const SEL_CAMPO = 'input[inputmode=numeric], input[inputmode=text]';

const TAMANOS = [
  { nombre: '320x568 vertical', width: 320, height: 568, teclado: 300, movil: true },
  { nombre: '375x667 vertical', width: 375, height: 667, teclado: 300, movil: true },
  { nombre: '390x844 vertical', width: 390, height: 844, teclado: 300, movil: true },
  { nombre: '393x852 vertical', width: 393, height: 852, teclado: 310, movil: true },
  { nombre: '430x932 vertical', width: 430, height: 932, teclado: 320, movil: true },
  // Apaisado: el caso peor de todos. 320 de alto menos 200 de teclado deja 120 px.
  { nombre: '568x320 apaisado', width: 568, height: 320, teclado: 200, movil: true },
  { nombre: '844x390 apaisado', width: 844, height: 390, teclado: 210, movil: true },
  { nombre: '932x430 apaisado', width: 932, height: 430, teclado: 220, movil: true },
  // Tablet: teclado alto en píxeles, pantalla larga.
  { nombre: '768x1024 tablet vertical', width: 768, height: 1024, teclado: 370, movil: true },
  { nombre: '1024x768 tablet apaisada', width: 1024, height: 768, teclado: 350, movil: true },
];

let fallos = 0;
let pasadas = 0;
const ok = (cond, texto, detalle) => {
  if (cond) { pasadas += 1; } else { fallos += 1; console.log(`  ✗   ${texto}${detalle ? ' — ' + detalle : ''}`); }
};

const puertoOcupado = (p) => {
  const probar = (host) => new Promise((res) => {
    const s = net.connect({ host, port: p });
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(1000, () => { s.destroy(); res(false); });
  });
  return Promise.all([probar('127.0.0.1'), probar('::1')]).then((r) => r.some(Boolean));
};

async function levantar() {
  if (await puertoOcupado(PUERTO)) return async () => {};
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/citizen'], {
    cwd: RAIZ, detached: true, env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 90; i += 1) {
    if (await puertoOcupado(PUERTO)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return async () => { try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ } };
}

/*
  Encoger el viewport visual sin tocar el de maquetación: eso, y nada más, es lo que un teclado le
  hace a la página. `Emulation.setDeviceMetricsOverride` NO lo consigue —se probó: deja
  `visualViewport.height` igual al de maquetación—, así que se sustituye el valor que el código
  lee y se dispara el mismo evento que dispararía el navegador.

  Queda dicho sin adornos: esto prueba que el mecanismo reacciona a la señal del teclado, no que
  un iPhone produzca esa señal. Lo segundo sigue SIN PROBAR.
*/
async function abrirTeclado(page, alto) {
  await page.evaluate((alto) => {
    const vv = window.visualViewport;
    if (!vv) return;
    if (!window.__altoReal) {
      window.__altoReal = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vv), 'height');
    }
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - alto });
    vv.dispatchEvent(new Event('resize'));
  }, alto);
}

async function cerrarTeclado(page) {
  await page.evaluate(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    delete vv.height;
    vv.dispatchEvent(new Event('resize'));
  });
}

/*
  `sel` sirve para mirar el campo DESPUÉS de quitarle el foco: al cerrar el teclado el foco se va al
  cuerpo del documento, y seguir midiendo «el elemento activo» mediría el documento entero. Sin
  argumento se mide el que tiene el foco, que es lo que hace falta mientras se escribe.
*/
const MIRAR = (sel) => {
  const activo = sel ? document.querySelector(sel) : document.activeElement;
  const r = activo ? activo.getBoundingClientRect() : null;
  const vv = window.visualViewport;
  const dentro = r ? r.top >= 0 && r.bottom <= (vv ? vv.height : window.innerHeight) + 1 : false;
  const x = r ? Math.round(r.left + r.width / 2) : 0;
  const y = r ? Math.round(r.top + r.height / 2) : 0;
  const encima = r ? document.elementFromPoint(x, y) : null;
  const nav = document.querySelector('.lx-bottom-tab-bar');
  const cta = document.querySelector('.lx-sticky-cta');
  // Un elemento que no se encuentra NO cuenta como oculto: así se leía en verde una regla de CSS
  // que apuntaba a una clase inexistente, que es justo el defecto que esta prueba destapó.
  const oculto = (el) => { if (!el) return null; return getComputedStyle(el).visibility === 'hidden'; };
  /* Usable = está, se ve y acepta el dedo. Un nodo presente pero `pointer-events: none` no sirve. */
  const usable = (el) => {
    if (!el) return false;
    const e = getComputedStyle(el);
    const c = el.getBoundingClientRect();
    return e.visibility !== 'hidden' && e.display !== 'none' && e.pointerEvents !== 'none'
      && c.height > 0 && c.width > 0;
  };
  const solapa = (a, b) => a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
  return {
    enfocado: Boolean(activo) && /INPUT|TEXTAREA/.test(activo.tagName),
    tieneFoco: activo === document.activeElement,
    dentro,
    propio: Boolean(encima) && (encima === activo || activo.contains(encima)),
    navOculta: oculto(nav),
    ctaOculto: oculto(cta),
    /*
      Desde el 23-10-2026 lo que se exige NO es que estén ocultas sino que estén PRESENTES y que
      no pisen el campo. Se mide lo que la persona puede hacer: que el nodo esté, que se pueda
      pulsar y que su caja no se solape con la del campo activo.
    */
    navUsable: usable(nav),
    ctaUsable: usable(cta),
    pisanElCampo: [nav, cta].some((el) => el && r && solapa(el.getBoundingClientRect(), r)),
    atributo: document.documentElement.getAttribute('data-teclado'),
    altoVisual: vv ? Math.round(vv.height) : null,
    altoLayout: window.innerHeight,
    scroll: Math.round(window.scrollY),
  };
};

(async () => {
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });

  for (const tam of TAMANOS) {
    console.log(`\n══ ${tam.nombre} ══`);
    const ctx = await browser.newContext({
      viewport: { width: tam.width, height: tam.height }, locale: 'es-CR',
      hasTouch: Boolean(tam.movil), isMobile: Boolean(tam.movil),
    });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.fill('input[type=email]', 'citizen@example.com');
    await page.fill('input[type=password]', 'Password123!');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2600);
    if (/select-tenant/.test(page.url())) {
      const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
      if (await f.count()) { await f.click(); await page.waitForTimeout(1600); }
    }

    // El campo que la orden nombra: el código de bahía del paso 1.
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const campo = page.locator('input[inputmode=numeric], input[inputmode=text]').first();
    if (await campo.count() === 0) {
      ok(false, `${tam.nombre}: aparece el campo del código de bahía`);
      await ctx.close();
      continue;
    }

    /*
      Antes de tocar el teclado: ¿cabe el campo en la banda que dejan libre las barras pegadas?

      Esta comprobación salió de un fallo que el teclado destapó pero que no era del teclado. A
      568×320 y con el teclado CERRADO, el cromo de arriba ocupaba 137 px y las barras de abajo 143:
      de 320 quedaban 40 px de banda para un campo de 44. No cabía, y por eso ningún desplazamiento
      lo arreglaba.
    */
    const banda = await page.evaluate((sel) => {
      const c = document.querySelector(sel);
      const r = c.getBoundingClientRect();
      const vv = window.visualViewport;
      const arriba = [...document.querySelectorAll('.lx-top-chrome, [data-lx-top-chrome]')]
        .reduce((bajo, n) => {
          const b = n.getBoundingClientRect();
          return b.height > 0 && getComputedStyle(n).position !== 'static'
            ? Math.max(bajo, b.bottom) : bajo;
        }, 0);
      const abajo = [...document.querySelectorAll('.lx-bottom-tab-bar, .lx-sticky-cta')]
        .reduce((alto, n) => {
          const b = n.getBoundingClientRect();
          return b.height > 0 && getComputedStyle(n).visibility !== 'hidden'
            ? Math.min(alto, b.top) : alto;
        }, vv ? vv.height : window.innerHeight);
      return { arriba: Math.round(arriba), abajo: Math.round(abajo), libre: Math.round(abajo - arriba), campo: Math.round(r.height) };
    }, SEL_CAMPO);
    ok(banda.libre >= banda.campo, `${tam.nombre}: el campo cabe en la banda que dejan las barras`,
      `libre ${banda.libre}px (de ${banda.arriba} a ${banda.abajo}), campo ${banda.campo}px`);

    const scrollAntes = await page.evaluate(() => Math.round(window.scrollY));
    await campo.click();
    /*
      El punto de comparación es DESPUÉS del clic, no antes, y el motivo es que medir desde antes
      medía otra cosa.

      Al enfocar un campo el navegador lo desplaza él solo, con o sin teclado y con o sin este
      código: a 320×568 el clic se llevaba la página de 0 a 373 —su tope— antes de que hubiera
      ningún teclado. Comparar contra 0 contaba ese desplazamiento del navegador como si fuera un
      salto nuestro. Lo que esta prueba afirma es que ABRIR Y CERRAR EL TECLADO no deja la página
      en otro sitio, así que el antes es el instante anterior a abrirlo. La tolerancia no se tocó, y
      debajo se añade la comprobación que de verdad importa: que al cerrar el campo siga visible.
    */
    const scrollTrasClic = await page.evaluate(() => Math.round(window.scrollY));
    await abrirTeclado(page, tam.teclado);
    // Sin `scrollIntoView` del lado de la prueba a propósito: lo que se comprueba es que la
    // APLICACIÓN acomode el campo sobre el teclado. Si lo desplazara el arnés, la prueba se estaría
    // aprobando a sí misma.
    await page.waitForTimeout(900);

    const conTeclado = await page.evaluate(MIRAR);
    ok(conTeclado.atributo === 'abierto', `${tam.nombre}: se reconoce que el teclado está arriba`,
      JSON.stringify(conTeclado));
    ok(conTeclado.enfocado && conTeclado.dentro,
      `${tam.nombre}: el campo activo se ve entero sobre el teclado`, JSON.stringify(conTeclado));
    ok(conTeclado.propio, `${tam.nombre}: y nadie se le pone encima`, JSON.stringify(conTeclado));
    /*
      EL CONTRATO CAMBIÓ EL 23-10-2026, Y AL REVÉS.

      Hasta hoy estas dos comprobaciones exigían que la navegación y el botón estuvieran OCULTOS
      con el teclado arriba. Era la orden del 20-10, que lo autorizaba en letra para que no
      compitieran por los pocos píxeles que deja el teclado.

      El 23-10 Javier fotografió la consecuencia en su iPhone: tocó «Número de parqueo» y los dos
      desaparecieron, y volvían sólo al tocar fuera. Su orden de ese día sustituye expresamente a
      la anterior: «botón y navegación siempre accesibles, que no se tapen ni desaparezcan».

      Así que se exige lo contrario, y además lo que la orden vieja protegía: que estén y que NO
      pisen el campo. Las dos cosas a la vez, porque cumplir sólo la primera es volver al defecto
      del 20-10 y cumplir sólo la segunda es el defecto del 23-10.
    */
    ok(conTeclado.navUsable === true, `${tam.nombre}: la navegación inferior sigue estando y se puede pulsar`,
      JSON.stringify(conTeclado));
    ok(conTeclado.ctaUsable === true, `${tam.nombre}: el botón fijo también`,
      JSON.stringify(conTeclado));
    ok(conTeclado.pisanElCampo === false, `${tam.nombre}: y ninguna de las dos pisa el campo`,
      JSON.stringify(conTeclado));

    // Escribir, borrar y volver a escribir con el teclado arriba.
    await campo.type('0012', { delay: 40 });
    await page.waitForTimeout(400);
    await campo.press('Backspace');
    await campo.type('5', { delay: 40 });
    await page.waitForTimeout(600);
    const escrito = await campo.inputValue();
    ok(escrito === '0015', `${tam.nombre}: se escribe y se borra sin perder el foco`, `valor ${escrito}`);
    const trasEscribir = await page.evaluate(MIRAR);
    ok(trasEscribir.dentro && trasEscribir.propio,
      `${tam.nombre}: y el campo sigue visible después de escribir`, JSON.stringify(trasEscribir));

    // Cerrar el teclado: todo vuelve.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await cerrarTeclado(page);
    await page.waitForTimeout(800);
    const sinTeclado = await page.evaluate(MIRAR, SEL_CAMPO);
    ok(sinTeclado.atributo === null, `${tam.nombre}: al cerrarlo, se deja de tratar como abierto`,
      JSON.stringify(sinTeclado));
    ok(sinTeclado.navOculta === false, `${tam.nombre}: la navegación inferior vuelve`,
      `oculta=${sinTeclado.navOculta}`);
    ok(sinTeclado.ctaOculto === false, `${tam.nombre}: el botón fijo vuelve`,
      `oculto=${sinTeclado.ctaOculto}`);
    ok(Math.abs(sinTeclado.scroll - scrollTrasClic) < 400,
      `${tam.nombre}: abrir y cerrar el teclado no deja la página en otro sitio`,
      `clic ${scrollAntes}→${scrollTrasClic}, cierre → ${sinTeclado.scroll}`);
    // Lo que el «no saltó» quería decir: que después de cerrar, el campo sigue a la vista y sin
    // nada encima. Esto es más fuerte que comparar números de scroll.
    ok(sinTeclado.dentro && sinTeclado.propio,
      `${tam.nombre}: al cerrar el teclado el campo sigue visible y despejado`,
      JSON.stringify(sinTeclado));

    // Y se puede continuar: el valor escrito sigue ahí y el botón responde.
    const sigue = await campo.inputValue();
    ok(sigue === '0015', `${tam.nombre}: el código escrito sobrevive al cierre del teclado`, sigue);

    await ctx.close();
  }

  /*
    Girar el teléfono MIENTRAS se escribe.

    Es el caso que rompe las soluciones hechas con un valor fijo: el teclado que ocupaba 300 px de
    844 pasa a ocupar 210 de 390, y lo que antes sobraba ahora no cabe. Si algo se hubiera
    resuelto con un número en vez de con el alto que publica el navegador, aquí se ve.
  */
  console.log('\n══ giro de pantalla con el teclado abierto (390x844 → 844x390) ══');
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: 'es-CR', hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.fill('input[type=email]', 'citizen@example.com');
    await page.fill('input[type=password]', 'Password123!');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2600);
    if (/select-tenant/.test(page.url())) {
      const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
      if (await f.count()) { await f.click(); await page.waitForTimeout(1600); }
    }
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    const campo = page.locator('input[inputmode=numeric], input[inputmode=text]').first();
    await campo.click();
    await abrirTeclado(page, 300);
    await page.waitForTimeout(700);
    await campo.type('0042', { delay: 40 });
    await page.waitForTimeout(400);

    const antes = await page.evaluate(MIRAR);
    ok(antes.dentro && antes.propio, 'giro: el campo se ve antes de girar', JSON.stringify(antes));

    // El giro. El teclado apaisado es más bajo, así que se vuelve a publicar con su alto nuevo,
    // que es exactamente lo que hace el navegador de verdad al rotar.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    await abrirTeclado(page, 210);
    await page.waitForTimeout(900);

    const despues = await page.evaluate(MIRAR);
    ok(despues.atributo === 'abierto', 'giro: después de girar sigue reconociendo el teclado',
      JSON.stringify(despues));
    ok(despues.dentro, 'giro: el campo sigue entero a la vista en apaisado', JSON.stringify(despues));
    ok(despues.propio, 'giro: y nadie se le pone encima', JSON.stringify(despues));
    ok(despues.navUsable === true, 'giro: la navegación inferior sigue estando',
      `oculta=${despues.navOculta}`);
    ok(despues.ctaUsable === true, 'giro: el botón fijo sigue estando', JSON.stringify(despues));
    ok(despues.pisanElCampo === false, 'giro: y siguen sin pisar el campo', JSON.stringify(despues));
    ok((await campo.inputValue()) === '0042', 'giro: lo escrito no se pierde al girar');

    // Se sigue escribiendo girado.
    await campo.press('Backspace');
    await campo.type('7', { delay: 40 });
    await page.waitForTimeout(500);
    ok((await campo.inputValue()) === '0047', 'giro: se puede seguir escribiendo girado');
    const escribiendoGirado = await page.evaluate(MIRAR);
    ok(escribiendoGirado.dentro && escribiendoGirado.propio,
      'giro: el campo sigue visible mientras se escribe girado', JSON.stringify(escribiendoGirado));

    // Cerrar el teclado girado: todo vuelve y nada se sale de lado.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await cerrarTeclado(page);
    await page.waitForTimeout(800);
    const fin = await page.evaluate(() => ({
      atributo: document.documentElement.getAttribute('data-teclado'),
      navOculta: (() => { const e = document.querySelector('.lx-bottom-tab-bar'); return e ? getComputedStyle(e).visibility === 'hidden' : null; })(),
      ctaOculto: (() => { const e = document.querySelector('.lx-sticky-cta'); return e ? getComputedStyle(e).visibility === 'hidden' : null; })(),
      desbordeH: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    ok(fin.atributo === null, 'giro: al cerrar, deja de tratarse como abierto', JSON.stringify(fin));
    ok(fin.navOculta === false, 'giro: la navegación vuelve en apaisado', `oculta=${fin.navOculta}`);
    ok(fin.ctaOculto === false, 'giro: el botón fijo vuelve en apaisado', `oculto=${fin.ctaOculto}`);
    ok(fin.desbordeH <= 1, 'giro: no quedó desborde horizontal', `${fin.desbordeH}px`);

    await ctx.close();
  }

  /*
    El caso que el iPhone de la usuaria demostró el 21-10-2026: teclado abierto y NINGUNA señal del
    viewport.

    En Chromium la detección por medida pasa en los diez tamaños de arriba. En su teléfono, con esta
    misma versión ya desplegada, el botón y la barra seguían tapando el formulario — así que allí
    esa medida no llegó, o no como se esperaba. Esta prueba reproduce ese escenario de la única
    forma honesta: enfocando el campo y NO tocando el viewport. Si ocultar las barras siguiera
    colgando de la medida, acá se vería en rojo.

    Y la cara opuesta: en un escritorio, enfocar un campo NO debe esconder nada, porque ahí no sube
    ningún teclado.
  */
  console.log('\n══ sin señal del viewport: el foco solo debe bastar en un aparato de dedo ══');
  for (const caso of [
    { nombre: 'teléfono 390x844', width: 390, height: 844, movil: true, esperaOculto: true },
    { nombre: 'escritorio 1280x800', width: 1280, height: 800, movil: false, esperaOculto: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: caso.width, height: caso.height }, locale: 'es-CR',
      hasTouch: caso.movil, isMobile: caso.movil,
    });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.fill('input[type=email]', 'citizen@example.com');
    await page.fill('input[type=password]', 'Password123!');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2600);
    if (/select-tenant/.test(page.url())) {
      const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
      if (await f.count()) { await f.click(); await page.waitForTimeout(1600); }
    }
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    const dedo = await page.evaluate(() => window.matchMedia('(pointer: coarse) and (hover: none)').matches);
    ok(dedo === caso.movil, `${caso.nombre}: el navegador se presenta como aparato de dedo = ${caso.movil}`,
      `matchMedia dice ${dedo}`);

    await page.locator(SEL_CAMPO).first().click();
    // A propósito: NO se encoge el viewport. Ésta es la condición que faltaba.
    await page.waitForTimeout(1100);

    const v = await page.evaluate(MIRAR);
    ok(v.atributo === (caso.esperaOculto ? 'abierto' : null),
      `${caso.nombre}: ${caso.esperaOculto ? 'se trata como teclado abierto sin medirlo' : 'no se trata como teclado'}`,
      JSON.stringify(v));
    /*
      Y acá está el corazón del defecto del 23-10: SIN encoger el viewport, es decir con el foco
      como única señal, las barras se iban igual. Ése es el caso que Javier fotografió, porque su
      iPhone no dio medida. Ahora se quedan, en los dos casos: con señal y sin ella.
    */
    ok(v.navUsable === true, `${caso.nombre}: la navegación inferior se queda`, JSON.stringify(v));
    ok(v.ctaUsable === true, `${caso.nombre}: el botón fijo se queda`, JSON.stringify(v));
    // Sin medida no se reserva alto: un número inventado deja un hueco del tamaño del error.
    const reservado = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx-teclado-alto').trim());
    ok(reservado === '', `${caso.nombre}: sin medida no se reserva alto inventado`, `--lx-teclado-alto='${reservado}'`);

    // Y al salir del campo, todo vuelve.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(700);
    const w = await page.evaluate(MIRAR, SEL_CAMPO);
    ok(w.navOculta === false && w.ctaOculto === false,
      `${caso.nombre}: al salir del campo vuelven las dos`, JSON.stringify(w));

    await ctx.close();
  }

  await browser.close();
  await apagar();
  console.log(`\n${pasadas + fallos} comprobaciones · ${fallos} fallos`);
  console.log('·· SIN PROBAR: un teclado de iPhone de verdad. Acá se reproducen las DOS');
  console.log('   situaciones: con el viewport visual encogido —que es lo que iOS debería hacer—');
  console.log('   y sin ninguna señal, que es lo que pasó en el teléfono de la usuaria el 21-10.');
  console.log('   Ocultar las barras ya no depende de esa señal; dar sitio y acomodar sí, porque');
  console.log('   sin medir el teclado no se puede reservar su alto sin inventárselo.');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
