/**
 * El mapa de zonas del Ciudadano, medido en el navegador.
 *
 * <p>Qué cubre, en el orden de la orden de implementación del 16-10-2026: que el mapa no exista
 * antes de que la bahía valide; que sea opcional, compacto, ampliable y cerrable; que no pida GPS
 * ni permisos; que una geometría que no es oficial llegue rotulada y con otro trazo; que el
 * estado de carga, el vacío y el error de red se vean y se puedan reintentar; que cambiar de
 * municipalidad no arrastre las geometrías de la anterior; que el único origen externo que se
 * contacta sea el del estilo autorizado; y que, pase lo que pase con el mapa, el flujo manual de
 * estacionamiento siga funcionando.</p>
 *
 * <p>El estilo de teselas NO se pide a ningún tercero durante la prueba: se intercepta la URL
 * configurada y se responde un estilo mínimo local. Lo que se mide es el componente, no la
 * disponibilidad del proveedor — y así la prueba no depende de la red de nadie.</p>
 *
 * <p>Contra el transporte simulado (lo normal):</p>
 * <pre>
 *   cd frontend && MOCKS=1 node tests/responsive/mapa-ciudadano.cjs
 * </pre>
 *
 * <p>Contra un servidor ya levantado, por ejemplo para la pasada sin proveedor de mapas:</p>
 * <pre>
 *   BASE=http://localhost:5184 SIN_PROVEEDOR=1 node tests/responsive/mapa-ciudadano.cjs
 * </pre>
 *
 * <p>Variables: <code>BASE</code>, <code>CUENTA</code>, <code>PASS</code>, <code>MOCKS=1</code>,
 * <code>SERVIDOR_EXTERNO=1</code> (acepta un servidor ajeno ya escuchando en el puerto),
 * <code>SIN_PROVEEDOR=1</code>, <code>PW_CHROMIUM</code> (ruta a un Chromium propio) y
 * <code>CAPTURAS</code>.</p>
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const PUERTO = 5183;
const PUERTO_API = Number(process.env.PUERTO_API || 5190);
const MOCKS = process.env.MOCKS === '1';
const SIN_PROVEEDOR = process.env.SIN_PROVEEDOR === '1';
const BASE = process.env.BASE || (MOCKS ? `http://localhost:${PUERTO}` : 'https://staging.luparx.com');
const CUENTA = process.env.CUENTA || (MOCKS ? 'citizen@example.com' : 'ana.morales@luparx.test');
const PASS = process.env.PASS || (MOCKS ? 'Password123!' : '');
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;
const CAPTURAS = process.env.CAPTURAS || path.join(__dirname, 'capturas', 'mapa-ciudadano');

/** La bahía que el formato de la municipalidad simulada acepta, y dos que no. */
const BAHIA_OK = 'LUP-0001';
const BAHIA_FUERA_DE_RANGO = 'LUP-9999';
const BAHIA_MAL_FORMADA = 'XX1';

/** Los ocho tamaños que pide la estrategia de pruebas del proyecto. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'móvil grande', width: 430, height: 932, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'tablet horizontal', width: 1024, height: 768, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];

/** Un estilo MapLibre válido y mínimo, servido en lugar del proveedor real. */
const ESTILO_DE_PRUEBA = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

let fallos = 0;
let pruebas = 0;
function ok(condicion, mensaje, detalle) {
  pruebas++;
  if (condicion) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

/*
  ¿Hay algo escuchando ya en ese puerto?

  Se prueban las DOS familias. Vite escucha en `localhost`, y según cómo resuelva esa máquina el
  nombre eso puede ser 127.0.0.1 o ::1. Probando sólo IPv4, el arnés declaraba «el servidor no
  llegó a escuchar en 90 s» con Vite perfectamente levantado e imprimiendo «ready» — medido el
  18-10-2026 en los cuatro arneses a la vez. No es una espera más larga: es mirar donde el
  servidor está.
*/
function puertoOcupado(puerto) {
  const probar = (host) => new Promise((res) => {
    const s = net.connect({ host, port: puerto });
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(1200, () => { s.destroy(); res(false); });
  });
  return Promise.all([probar('127.0.0.1'), probar('::1')]).then((r) => r.some(Boolean));
}

async function esperarPuerto(puerto, msTope) {
  const hasta = Date.now() + msTope;
  while (Date.now() < hasta) {
    if (await puertoOcupado(puerto)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Levanta el servidor de desarrollo con el transporte simulado. Devuelve cómo apagarlo.
 *
 * <p>Si el puerto ya está ocupado NO se reutiliza a ciegas: lo que haya ahí puede ser otra rama,
 * otro portal o una compilación vieja, y la corrida entera mediría eso sin decirlo. Hay que
 * afirmarlo a mano con <code>SERVIDOR_EXTERNO=1</code>.</p>
 */
async function levantarServidor() {
  if (await puertoOcupado(PUERTO)) {
    if (process.env.SERVIDOR_EXTERNO === '1') {
      console.log(`  ··  se usa el servidor que ya escucha en :${PUERTO} (SERVIDOR_EXTERNO=1)`);
      return () => {};
    }
    console.error(`✗ Ya hay algo escuchando en :${PUERTO} y no se sabe qué es.`);
    console.error('  Apagalo, o afirmá que es el servidor correcto con SERVIDOR_EXTERNO=1.');
    process.exit(2);
  }

  /*
    El transporte simulado se sirve por HTTP en vez de inyectarse dentro de la aplicación
    (`VITE_USE_MOCKS=true`). Con la inyección NINGUNA petición sale al navegador, y entonces no se
    puede medir nada de lo que esta pantalla hace con la red: que pida una sola vez, que el estado
    de carga se vea, que un 503 lleve al aviso con reintento, ni que no se contacte a terceros.
    Es el MISMO simulador del repositorio, envuelto — no una segunda copia escrita a mano.
  */
  const { levantarSimulado } = require('./servidor-simulado.cjs');
  const simulado = await levantarSimulado(PUERTO_API);
  console.log(`  ··  transporte simulado por HTTP en :${simulado.puerto}`);

  console.log(`  ··  levantando el servidor de desarrollo en :${PUERTO}…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/citizen'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      VITE_USE_MOCKS: 'false',
      VITE_API_BASE_URL: `http://localhost:${simulado.puerto}`,
      VITE_BASE_PATH: '/',
      // La pasada «sin proveedor» necesita la aplicación compilada SIN la variable: es la
      // configuración con la que se publica a producción.
      ...(SIN_PROVEEDOR ? { VITE_MAP_STYLE_URL: '' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor no llegó a escuchar en 90 s. Últimas líneas:\n'
      + salida.join('').split('\n').slice(-12).join('\n'));
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
    await simulado.cerrar();
    process.exit(1);
  }
  return async () => {
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
    await simulado.cerrar();
  };
}

// ---------------------------------------------------------------------------------------------
// Instrumentación de la página
// ---------------------------------------------------------------------------------------------

/** Deja constancia en la página de cualquier intento de pedir la ubicación. Nunca la concede. */
const ESPIA_GPS = `
  window.__gps = [];
  const n = navigator.geolocation;
  if (n) {
    const envolver = (nombre) => {
      const original = n[nombre] && n[nombre].bind(n);
      if (!original) return;
      n[nombre] = function (...args) { window.__gps.push(nombre); return original(...args); };
    };
    envolver('getCurrentPosition');
    envolver('watchPosition');
  }
  const permisos = navigator.permissions;
  if (permisos && permisos.query) {
    const original = permisos.query.bind(permisos);
    permisos.query = function (d) {
      if (d && d.name === 'geolocation') window.__gps.push('permissions.query');
      return original(d);
    };
  }
`;

/**
 * Prepara un contexto: cuenta las peticiones a terceros, responde el estilo con uno local y
 * registra las peticiones de geometrías.
 *
 * <p>El estilo de teselas NO se pide a ningún tercero durante la prueba: se intercepta la URL
 * configurada y se responde un estilo mínimo local. Lo que se mide es el componente, no la
 * disponibilidad del proveedor.</p>
 */
async function prepararContexto(context, origen) {
  const estado = { terceros: [], geojson: 0, estilo: 0, geojsonModo: 'normal', ultimasZonas: null };
  await context.addInitScript(ESPIA_GPS);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();

    // El estilo: se responde localmente, nunca se sale a la red.
    if (/\/styles\//.test(url) && !url.startsWith(origen)) {
      estado.estilo++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ESTILO_DE_PRUEBA),
      });
    }

    if (/\/citizen\/parking\/zones\/geojson/.test(url)) {
      estado.geojson++;
      if (estado.geojsonModo === 'error') {
        return route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ type: 'about:blank', title: 'Service Unavailable', status: 503 }),
        });
      }
      if (estado.geojsonModo === 'lento') {
        await new Promise((r) => setTimeout(r, 2500));
      }
      // Se deja pasar y se guarda lo que el servidor respondió: así las aserciones sobre lo que
      // se dibuja miran el dato real y no una copia escrita a mano en la prueba.
      const respuesta = await route.fetch();
      const cuerpo = await respuesta.text();
      try { estado.ultimasZonas = JSON.parse(cuerpo); } catch { estado.ultimasZonas = null; }
      return route.fulfill({ response: respuesta, body: cuerpo });
    }

    // Todo lo que no sea la aplicación ni la API simulada es un tercero: se corta y se anota.
    if (!url.startsWith(origen) && !url.startsWith(`http://localhost:${PUERTO_API}`)) {
      estado.terceros.push(url);
      return route.abort();
    }
    return route.continue();
  });
  return estado;
}

// ---------------------------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------------------------

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2200);
  if (/\/select-tenant/.test(page.url())) {
    const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú/ }).first();
    if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1500); }
  }
  if (await page.locator('input[type=password]').count()) {
    console.error('✗ Sigue en el login. Revisá CUENTA/PASS del entorno.');
    process.exit(1);
  }
}

/** Abre el desplegable rotulado `etiqueta` y elige la opción cuyo texto coincide. */
async function elegir(page, etiqueta, texto) {
  const disparador = page.locator(`[aria-label="${etiqueta}"]`).first();
  await disparador.click();
  await page.waitForTimeout(300);
  await page.locator('[role=option]').filter({ hasText: texto }).first().click();
  await page.waitForTimeout(400);
}

const campoBahia = (page) => page.locator('input[inputmode=numeric], input[inputmode=text]').first();
const seccionMapa = (page) => page.locator('.lx-zonemap');
const botonAbrir = (page) => page.getByRole('button', { name: /ver la zona en el mapa|see the zone on the map/i });
const botonAmpliar = (page) => page.locator('.lx-zonemap__accion');

/** Deja la pantalla con zona elegida y la bahía indicada. */
async function prepararPaso1(page, bahia) {
  await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await elegir(page, 'Zona', 'Centro');
  if (bahia !== null) {
    await campoBahia(page).fill(bahia);
    await page.waitForTimeout(500);
  }
}

/** Espera a que MapLibre termine de montar y devuelve lo que realmente quedó en el estilo. */
async function leerMapa(page) {
  return page.evaluate(async () => {
    const lienzo = document.querySelector('.lx-zonemap__lienzo');
    if (!lienzo) return { hay: false };
    const canvas = lienzo.querySelector('canvas');
    return {
      hay: true,
      canvas: Boolean(canvas),
      ancho: canvas ? canvas.clientWidth : 0,
      alto: canvas ? canvas.clientHeight : 0,
      controles: lienzo.querySelectorAll('.maplibregl-ctrl button').length,
      atribucion: Boolean(lienzo.querySelector('.maplibregl-ctrl-attrib')),
    };
  });
}

/**
 * Mide el control del mapa y su texto por separado.
 *
 * <p>Comparar el texto con su caja es lo que delata un rótulo recortado, que es el defecto que
 * `scrollWidth` no ve cuando el texto desborda hacia fuera en lugar de hacia dentro.</p>
 */
async function medirAccion(page) {
  return page.evaluate(() => {
    const b = document.querySelector('.lx-zonemap__accion');
    if (!b) return null;
    const caja = b.getBoundingClientRect();
    const rango = document.createRange();
    rango.selectNodeContents(b);
    const texto = rango.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      x: Math.round(caja.x), der: Math.round(caja.right),
      ancho: Math.round(caja.width), alto: Math.round(caja.height),
      textoIzq: Math.round(texto.left), textoDer: Math.round(texto.right),
      relleno: [cs.paddingLeft, cs.paddingRight].join(' '),
      rotulo: b.textContent.trim(),
      vw: window.innerWidth,
    };
  });
}

/** Comprueba que el control existe, cabe y no recorta su rótulo. */
function comprobarAccion(m, etiqueta) {
  if (!m) { ok(false, `${etiqueta}: existe el control de ampliar`); return; }
  ok(m.alto >= 44 && m.ancho >= 44, `${etiqueta}: el control cumple 44px`, `${m.ancho}x${m.alto}`);
  ok(m.textoIzq >= m.x - 1 && m.textoDer <= m.der + 1,
    `${etiqueta}: el rótulo «${m.rotulo}» no queda recortado`,
    `texto ${m.textoIzq}…${m.textoDer} dentro de ${m.x}…${m.der}`);
  ok(m.der <= m.vw, `${etiqueta}: el control cabe en la ventana`, `${m.der} > ${m.vw}`);
  ok(m.relleno !== '0px 0px', `${etiqueta}: el control lleva los estilos de botón del sistema`,
    `padding: ${m.relleno}`);
}

async function capturar(page, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  // El mapa compacto vive al final de un formulario largo: sin esto la captura sale del
  // encabezado de la pantalla y no enseña nada de lo que se está probando.
  const seccion = page.locator('.lx-zonemap').first();
  if (await seccion.count()) {
    await seccion.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
  }
  const destino = path.join(CAPTURAS, `${nombre}.png`);
  await page.screenshot({ path: destino });
  return destino;
}

// ---------------------------------------------------------------------------------------------
// La pasada sin proveedor de teselas
// ---------------------------------------------------------------------------------------------

async function pasadaSinProveedor(browser) {
  console.log('\n── Sin proveedor de teselas configurado ──');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
  const estado = await prepararContexto(context, new URL(BASE).origin);
  const page = await context.newPage();
  await entrar(page);
  await prepararPaso1(page, BAHIA_OK);

  ok(await botonAbrir(page).count() === 1, 'el botón de abrir el mapa sigue estando');
  await botonAbrir(page).click();
  await page.waitForTimeout(1200);

  const aviso = page.locator('.lx-zonemap__aviso');
  ok(await aviso.count() === 1, 'se muestra un aviso en lugar del mapa');
  const texto = (await aviso.first().innerText()).trim();
  ok(/no tiene configurado un proveedor de mapas/i.test(texto),
    'el aviso dice que falta el proveedor', texto);
  ok(await botonAmpliar(page).count() === 0, 'no ofrece ampliar lo que no se puede dibujar');
  ok(await page.locator('.lx-zonemap__lienzo').count() === 0, 'no se crea ningún lienzo');
  ok(estado.estilo === 0, 'no se pidió ningún estilo a nadie', `estilos pedidos: ${estado.estilo}`);
  ok(estado.terceros.length === 0, 'no hubo peticiones a terceros', estado.terceros.join('\n'));
  ok((await page.evaluate(() => window.__gps.length)) === 0, 'no se pidió la ubicación');

  const continuar = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
  ok(await continuar.count() > 0 && await continuar.isEnabled(),
    'el flujo manual sigue disponible sin mapa');

  console.log(`  ··  captura: ${await capturar(page, 'sin-proveedor-390x844')}`);
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// La pasada completa
// ---------------------------------------------------------------------------------------------

async function pasadaFuncional(browser) {
  const origen = new URL(BASE).origin;

  // ---- 1. El mapa no aparece antes de tiempo --------------------------------------------------
  console.log('\n── Cuándo aparece el mapa ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);

    await prepararPaso1(page, null);
    ok(await seccionMapa(page).count() === 0, 'sin bahía escrita no hay mapa ni botón');
    ok(await botonAbrir(page).count() === 0, 'sin bahía escrita no se ofrece abrirlo');

    await campoBahia(page).fill(BAHIA_MAL_FORMADA);
    await page.waitForTimeout(500);
    ok(await botonAbrir(page).count() === 0, 'con la bahía mal formada tampoco');

    await campoBahia(page).fill(BAHIA_FUERA_DE_RANGO);
    await page.waitForTimeout(500);
    ok(await botonAbrir(page).count() === 0, 'con la bahía fuera de rango tampoco');

    await campoBahia(page).fill(BAHIA_OK);
    await page.waitForTimeout(600);
    ok(await botonAbrir(page).count() === 1, 'con la bahía válida aparece el botón');
    ok(await seccionMapa(page).count() === 0, 'y el mapa sigue cerrado hasta que se pide');
    ok(estado.geojson === 0, 'no se pidió ninguna geometría mientras el mapa estaba cerrado',
      `peticiones: ${estado.geojson}`);

    await context.close();
  }

  // ---- 2. Abierto: lo que se dibuja -----------------------------------------------------------
  console.log('\n── El mapa abierto ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await prepararPaso1(page, BAHIA_OK);
    await botonAbrir(page).click();
    await page.waitForTimeout(3500);

    ok(estado.geojson === 1, 'se pidieron las geometrías una sola vez', `peticiones: ${estado.geojson}`);
    ok(estado.estilo === 1, 'se pidió el estilo una sola vez', `peticiones: ${estado.estilo}`);
    ok(estado.terceros.length === 0, 'no hubo ninguna otra petición a terceros',
      estado.terceros.slice(0, 5).join('\n'));

    const mapa = await leerMapa(page);
    ok(mapa.hay, 'el lienzo del mapa está en la pantalla');
    ok(mapa.canvas && mapa.ancho > 100 && mapa.alto > 100,
      'MapLibre creó un lienzo con tamaño', `${mapa.ancho}x${mapa.alto}`);
    ok(mapa.controles >= 2, 'están los controles de acercar y alejar', `botones: ${mapa.controles}`);
    ok(mapa.atribucion, 'el mapa muestra su atribución');

    ok((await page.evaluate(() => window.__gps.length)) === 0,
      'no se pidió la ubicación en ningún momento');

    /*
      Qué se dibuja y de qué color NO se comprueba acá: MapLibre no deja un asa pública a su
      instancia desde el DOM, y colgar una sólo para la prueba sería código de prueba en
      producción. Esa regla —VERIFIED sólido, lo demás punteado y en otro color— se comprueba
      entera, y con el TypeScript real, en `packages/ui/src/map/__checks__/capas.check.mjs`.
      Lo que sí se mide acá es el dato que llegó y lo que la pantalla hace con él.
    */
    const colecion = estado.ultimasZonas;
    ok(colecion && colecion.type === 'FeatureCollection' && Array.isArray(colecion.features),
      'el servidor devolvió una FeatureCollection', JSON.stringify(colecion).slice(0, 200));
    const rasgos = (colecion && colecion.features) || [];
    const verificadas = rasgos.filter((f) => f.properties.status === 'VERIFIED');
    const otras = rasgos.filter((f) => f.properties.status !== 'VERIFIED');
    ok(verificadas.length >= 1, 'llegó al menos una geometría VERIFIED',
      JSON.stringify(rasgos.map((f) => [f.id, f.properties.status])));
    ok(otras.length >= 1, 'llegó al menos una que no lo está, para comprobar el rótulo',
      JSON.stringify(otras.map((f) => [f.id, f.properties.source, f.properties.status])));
    ok(rasgos.every((f) => typeof f.properties.status === 'string'
      && 'source' in f.properties),
      'cada geometría viaja con su estado y su procedencia');
    ok(rasgos.every((f) => f.geometry && /Polygon$/.test(f.geometry.type)),
      'todas son perímetros: no llega ningún punto de bahía',
      JSON.stringify(rasgos.map((f) => f.geometry && f.geometry.type)));

    const rotulo = page.locator('.lx-zonemap__noOficial');
    ok(await rotulo.count() === 1, 'hay un aviso de que no todas son oficiales');
    const textoRotulo = (await rotulo.first().innerText()).trim();
    ok(/no son límites oficiales/i.test(textoRotulo), 'el aviso lo dice sin rodeos', textoRotulo);
    ok(/demostración/i.test(textoRotulo), 'y nombra que son datos de demostración', textoRotulo);
    ok(await rotulo.first().isVisible(), 'el aviso se ve, no está escondido');

    // Accesibilidad básica.
    const acc = await page.evaluate(() => {
      const s = document.querySelector('.lx-zonemap');
      const l = document.querySelector('.lx-zonemap__lienzo');
      const b = document.querySelector('.lx-zonemap__accion');
      const titulo = s && s.getAttribute('aria-labelledby');
      return {
        etiquetada: Boolean(titulo && document.getElementById(titulo)),
        tituloTexto: titulo && document.getElementById(titulo) ? document.getElementById(titulo).textContent : '',
        rolLienzo: l ? l.getAttribute('role') : null,
        etiquetaLienzo: l ? l.getAttribute('aria-label') : null,
        expandido: b ? b.getAttribute('aria-expanded') : null,
        altoBoton: b ? Math.round(b.getBoundingClientRect().height) : 0,
        nombreBoton: b ? b.textContent.trim() : '',
      };
    });
    ok(acc.etiquetada && acc.tituloTexto.length > 0, 'la sección tiene nombre accesible', acc.tituloTexto);
    ok(acc.rolLienzo === 'img' && Boolean(acc.etiquetaLienzo),
      'el lienzo se anuncia como imagen con descripción', `${acc.rolLienzo} / ${acc.etiquetaLienzo}`);
    ok(acc.expandido === 'false', 'el botón declara que el mapa está compacto', String(acc.expandido));
    comprobarAccion(await medirAccion(page), 'compacto');

    console.log(`  ··  captura: ${await capturar(page, 'compacto-390x844')}`);

    // ---- Compacto → ampliado, con el teclado --------------------------------------------------
    console.log('\n── Compacto, ampliado y teclado ──');
    const altoCompacto = await page.evaluate(
      () => Math.round(document.querySelector('.lx-zonemap__lienzo').getBoundingClientRect().height));
    ok(altoCompacto >= 150 && altoCompacto <= 260, 'compacto mide lo que dice medir', `${altoCompacto}px`);

    await botonAmpliar(page).focus();
    ok(await page.evaluate(() => document.activeElement.classList.contains('lx-zonemap__accion')),
      'el botón de ampliar recibe el foco');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);

    const ampliado = await page.evaluate(() => {
      const s = document.querySelector('.lx-zonemap');
      const r = s.getBoundingClientRect();
      const b = document.querySelector('.lx-zonemap__accion');
      return {
        clase: s.className.includes('lx-zonemap--ampliado'),
        posicion: getComputedStyle(s).position,
        ancho: Math.round(r.width),
        alto: Math.round(r.height),
        expandido: b.getAttribute('aria-expanded'),
        nombre: b.textContent.trim(),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });
    ok(ampliado.clase && ampliado.posicion === 'fixed', 'con Enter el mapa se amplía',
      `${ampliado.posicion} ${ampliado.ancho}x${ampliado.alto}`);
    ok(ampliado.ancho >= ampliado.vw - 2 && ampliado.alto >= ampliado.vh - 2,
      'ampliado ocupa la pantalla', `${ampliado.ancho}x${ampliado.alto} de ${ampliado.vw}x${ampliado.vh}`);
    ok(ampliado.expandido === 'true', 'y lo declara con aria-expanded');
    ok(/cerrar|collapse/i.test(ampliado.nombre), 'el botón pasa a ofrecer cerrarlo', ampliado.nombre);
    comprobarAccion(await medirAccion(page), 'ampliado');

    console.log(`  ··  captura: ${await capturar(page, 'ampliado-390x844')}`);

    const tamanoLienzo = await page.evaluate(
      () => { const c = document.querySelector('.lx-zonemap__lienzo canvas');
        return c ? Math.round(c.getBoundingClientRect().height) : 0; });
    ok(tamanoLienzo > altoCompacto, 'el lienzo creció al ampliar', `${altoCompacto} → ${tamanoLienzo}`);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    const vuelto = await page.evaluate(() => ({
      clase: document.querySelector('.lx-zonemap').className.includes('lx-zonemap--ampliado'),
      expandido: document.querySelector('.lx-zonemap__accion').getAttribute('aria-expanded'),
      alto: Math.round(document.querySelector('.lx-zonemap__lienzo').getBoundingClientRect().height),
    }));
    ok(!vuelto.clase && vuelto.expandido === 'false', 'se cierra con el teclado y vuelve a compacto');
    ok(Math.abs(vuelto.alto - altoCompacto) <= 4, 'y recupera su alto compacto',
      `${vuelto.alto} vs ${altoCompacto}`);

    // ---- El flujo manual no se toca -----------------------------------------------------------
    console.log('\n── El flujo manual de estacionamiento ──');
    const continuar = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
    ok(await continuar.count() > 0, 'el botón de continuar sigue en su sitio');
    ok(await continuar.isEnabled(), 'y sigue habilitado con el mapa abierto');

    // ---- Desmontaje ---------------------------------------------------------------------------
    const antes = await page.evaluate(() => document.querySelectorAll('canvas').length);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const despues = await page.evaluate(() => document.querySelectorAll('canvas').length);
    ok(antes >= 1 && despues === 0, 'al salir de la pantalla no queda ningún lienzo colgando',
      `${antes} → ${despues}`);

    await context.close();
  }

  // ---- 3. Carga, vacío y error ----------------------------------------------------------------
  console.log('\n── Carga, vacío, error y reintento ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);

    // Carga
    estado.geojsonModo = 'lento';
    await prepararPaso1(page, BAHIA_OK);
    await botonAbrir(page).click();
    await page.waitForTimeout(700);
    const enCarga = (await page.locator('.lx-zonemap__aviso, .lx-text-meta').allInnerTexts()).join(' | ');
    ok(/cargando el mapa/i.test(enCarga), 'mientras llega, el mapa dice que está cargando', enCarga);
    await page.waitForTimeout(3200);
    ok(await page.locator('.lx-zonemap__lienzo').count() === 1, 'y después se dibuja');

    // Error + reintento
    estado.geojsonModo = 'error';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await elegir(page, 'Zona', 'Centro');
    await campoBahia(page).fill(BAHIA_OK);
    await page.waitForTimeout(500);
    await botonAbrir(page).click();
    await page.waitForTimeout(3000);

    const avisoError = page.locator('.lx-zonemap__aviso');
    ok(await avisoError.count() === 1, 'con la red caída se muestra un aviso');
    const textoError = (await avisoError.first().innerText()).trim();
    ok(/no se pudo cargar el mapa/i.test(textoError), 'el aviso lo explica', textoError);
    ok(/puede continuar sin él/i.test(textoError), 'y dice que se puede seguir sin él', textoError);
    const reintentar = avisoError.getByRole('button', { name: /reintentar|retry/i });
    ok(await reintentar.count() === 1, 'ofrece reintentar');

    const continuarConError = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
    ok(await continuarConError.isEnabled(), 'el flujo manual sigue habilitado con el mapa caído');
    console.log(`  ··  captura: ${await capturar(page, 'error-de-red-390x844')}`);

    const antesDelReintento = estado.geojson;
    estado.geojsonModo = 'normal';
    await reintentar.click();
    await page.waitForTimeout(3500);
    ok(estado.geojson > antesDelReintento, 'el reintento vuelve a pedir las geometrías',
      `${antesDelReintento} → ${estado.geojson}`);
    ok(await page.locator('.lx-zonemap__lienzo').count() === 1, 'y el mapa se dibuja tras reintentar');

    await context.close();
  }

  // ---- 4. Cambio de municipalidad y aislamiento -----------------------------------------------
  console.log('\n── Cambio de municipalidad ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await prepararPaso1(page, BAHIA_OK);
    await botonAbrir(page).click();
    await page.waitForTimeout(3000);

    const deSanJose = ((estado.ultimasZonas && estado.ultimasZonas.features) || []).map((f) => f.id);
    ok(deSanJose.length >= 1, 'San José tiene geometrías dibujadas', JSON.stringify(deSanJose));
    ok(await page.locator('.lx-zonemap__lienzo').count() === 1, 'y el mapa de San José se dibuja');

    // El selector de municipalidad vive en el paso 0 de esta misma pantalla.
    const cambiar = page.getByRole('button', { name: /^cambiar$|^switch$/i }).first();
    if (await cambiar.count() === 0) {
      ok(false, 'se encontró el control de cambio de municipalidad en /park');
    } else {
      await cambiar.click();
      await page.waitForTimeout(600);
      const escazu = page.locator('button, [role=option], li').filter({ hasText: /Escazú/ }).last();
      if (await escazu.count() === 0) {
        ok(false, 'la lista de municipalidades ofrece Escazú');
      } else {
        await escazu.click();
        await page.waitForTimeout(2500);
        await elegir(page, 'Zona', 'Centro');
        await campoBahia(page).fill(BAHIA_OK);
        await page.waitForTimeout(600);
        if (await botonAbrir(page).count()) { await botonAbrir(page).click(); }
        await page.waitForTimeout(3000);

        const deEscazu = ((estado.ultimasZonas && estado.ultimasZonas.features) || []).map((f) => f.id);
        const aviso = page.locator('.lx-zonemap__aviso');
        const textoAviso = (await aviso.count()) ? (await aviso.first().innerText()).trim() : '';
        ok(!deEscazu.some((id) => deSanJose.includes(id)),
          'ninguna geometría de San José aparece bajo Escazú',
          `San José ${JSON.stringify(deSanJose)} · Escazú ${JSON.stringify(deEscazu)}`);
        if (deEscazu.length === 0) {
          ok(/todavía no tiene zonas verificadas/i.test(textoAviso),
            'la municipalidad sin geometrías muestra el estado vacío', textoAviso || '(sin aviso)');
          ok(await page.locator('.lx-zonemap__lienzo').count() === 0,
            'y no se dibuja ningún lienzo vacío');
          console.log(`  ··  captura: ${await capturar(page, 'vacio-escazu-390x844')}`);
        }
      }
    }
    ok(estado.terceros.length === 0, 'tampoco aquí se contactó a ningún tercero',
      estado.terceros.slice(0, 5).join('\n'));

    await context.close();
  }

  // ---- 4bis. Regresión: el estacionamiento se completa igual ---------------------------------
  /*
    Lo que de verdad hay que no romper. Se hace al final y en su propio contexto porque iniciar
    una sesión cambia el estado del transporte simulado, y lo que viene después mediría otra
    pantalla. No se emite nada real: es el simulador del repositorio.
  */
  console.log('\n── Regresión: iniciar un estacionamiento con el mapa delante ──');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    const estado = await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);

    // Primero con el mapa caído: el peor caso para el flujo.
    estado.geojsonModo = 'error';
    await prepararPaso1(page, BAHIA_OK);
    if (await botonAbrir(page).count()) { await botonAbrir(page).click(); await page.waitForTimeout(2500); }
    ok(await page.locator('.lx-zonemap__aviso').count() === 1, 'el mapa está caído, como se quería');

    // Cuatro pasos desde el 19-10-2026: zona y espacio, vehículo y tiempo, confirmar, resultado.
    const seguir = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
    await seguir.scrollIntoViewIfNeeded().catch(() => {});
    ok(await seguir.isEnabled(), 'se puede continuar con el mapa caído');
    await seguir.click();                                            // 1 → 2
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first().click();   // 2 → 3
    await page.waitForTimeout(1600);
    const iniciar = page
      .getByRole('button', { name: /confirmar y pagar|confirm and pay|iniciar estacionamiento|start parking/i })
      .first();
    ok(await iniciar.isEnabled(), 'y el paso 3 deja confirmar');
    await iniciar.click();
    await page.waitForTimeout(3500);

    const despues = await page.evaluate(() => ({
      ruta: location.pathname,
      texto: document.body.innerText.slice(0, 2000),
    }));
    ok(/sesión|session|activo|activa|resumen|confirm/i.test(despues.texto),
      'el estacionamiento se inició con el mapa caído',
      `${despues.ruta} · ${despues.texto.slice(0, 160).replace(/\n/g, ' / ')}`);
    ok(estado.terceros.length === 0, 'y sin contactar a ningún tercero en todo el flujo',
      estado.terceros.slice(0, 5).join('\n'));

    await context.close();
  }

  // ---- 5. Los ocho tamaños --------------------------------------------------------------------
  console.log('\n── Los ocho tamaños ──');
  for (const tamano of TAMANOS) {
    const context = await browser.newContext({
      viewport: { width: tamano.width, height: tamano.height },
      isMobile: tamano.movil,
      hasTouch: tamano.movil,
      locale: 'es-CR',
    });
    await prepararContexto(context, origen);
    const page = await context.newPage();
    await entrar(page);
    await prepararPaso1(page, BAHIA_OK);
    if (await botonAbrir(page).count() === 0) {
      ok(false, `${tamano.nombre}: aparece el botón de abrir el mapa`);
      await context.close();
      continue;
    }
    await botonAbrir(page).click();
    await page.waitForTimeout(3000);

    const medidas = await page.evaluate(() => {
      const s = document.querySelector('.lx-zonemap');
      const l = document.querySelector('.lx-zonemap__lienzo');
      const b = document.querySelector('.lx-zonemap__accion');
      const r = s ? s.getBoundingClientRect() : null;
      return {
        hay: Boolean(s),
        lienzo: Boolean(l),
        derecha: r ? Math.round(r.right) : 0,
        izquierda: r ? Math.round(r.left) : 0,
        anchoDoc: Math.round(document.documentElement.scrollWidth),
        vw: window.innerWidth,
        altoBoton: b ? Math.round(b.getBoundingClientRect().height) : 0,
        anchoBoton: b ? Math.round(b.getBoundingClientRect().width) : 0,
      };
    });

    const etiqueta = `${tamano.nombre} ${tamano.width}x${tamano.height}`;
    ok(medidas.hay && medidas.lienzo, `${etiqueta}: el mapa se dibuja`);
    ok(medidas.anchoDoc <= medidas.vw + 1, `${etiqueta}: sin desbordamiento horizontal`,
      `documento ${medidas.anchoDoc} > ventana ${medidas.vw}`);
    ok(medidas.izquierda >= -1 && medidas.derecha <= medidas.vw + 1,
      `${etiqueta}: el mapa cabe en la ventana`,
      `${medidas.izquierda}…${medidas.derecha} de ${medidas.vw}`);
    comprobarAccion(await medirAccion(page), `${etiqueta} compacto`);

    // Ampliado, en este tamaño.
    await botonAmpliar(page).click();
    await page.waitForTimeout(900);
    const ampliado = await page.evaluate(() => {
      const r = document.querySelector('.lx-zonemap').getBoundingClientRect();
      return {
        ancho: Math.round(r.width), alto: Math.round(r.height),
        vw: window.innerWidth, vh: window.innerHeight,
        anchoDoc: Math.round(document.documentElement.scrollWidth),
      };
    });
    ok(ampliado.ancho >= ampliado.vw - 2 && ampliado.alto >= ampliado.vh - 2,
      `${etiqueta}: ampliado cubre la pantalla`,
      `${ampliado.ancho}x${ampliado.alto} de ${ampliado.vw}x${ampliado.vh}`);
    ok(ampliado.anchoDoc <= ampliado.vw + 1, `${etiqueta}: ampliado tampoco desborda`,
      `documento ${ampliado.anchoDoc} > ventana ${ampliado.vw}`);
    comprobarAccion(await medirAccion(page), `${etiqueta} ampliado`);

    if (tamano.width === 390 || tamano.width === 1280) {
      console.log(`  ··  captura: ${await capturar(page, `ampliado-${tamano.width}x${tamano.height}`)}`);
    }
    await botonAmpliar(page).click();
    await page.waitForTimeout(500);
    if (tamano.width === 1280) {
      console.log(`  ··  captura: ${await capturar(page, 'compacto-1280x800')}`);
    }
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------

(async () => {
  console.log(`\n══ Mapa del ciudadano · ${BASE} ${MOCKS ? '(transporte simulado)' : ''}`
    + `${SIN_PROVEEDOR ? ' · sin proveedor de teselas' : ''} ══`);
  if (!PASS) {
    console.error('✗ Falta la contraseña (PASS).');
    process.exit(1);
  }
  const apagar = MOCKS ? await levantarServidor() : async () => {};
  const navegador = await chromium.launch({
    executablePath: EJECUTABLE,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    if (SIN_PROVEEDOR) {
      await pasadaSinProveedor(navegador);
    } else {
      await pasadaFuncional(navegador);
    }
  } catch (e) {
    fallos++;
    console.error(`\n✗ La corrida se interrumpió: ${e && e.message}`);
    console.error(e && e.stack);
  } finally {
    await navegador.close();
    await apagar();
  }

  console.log(`\n${pruebas} comprobaciones · ${fallos} fallo${fallos === 1 ? '' : 's'}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
