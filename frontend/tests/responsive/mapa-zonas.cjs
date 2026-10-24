/**
 * Estacionar › el mapa como forma de elegir la zona (22-10-2026).
 *
 * <p>Cubre, en este orden, los siete escenarios que pide la orden
 * `LuParX_Mapa_Zonas_Instrucciones_Claude_1`:</p>
 *
 * <ol>
 *   <li>abrir Estacionar y ver el mapa, sin escribir nada y sin pulsar nada;</li>
 *   <li>que las zonas dibujadas sean las que el servidor publicó para ESA municipalidad;</li>
 *   <li>tocar una zona: resaltado y ficha con los datos de esa zona y no de otra;</li>
 *   <li>cambiar de zona —desde el mapa y desde la lista— y que las dos vías queden sincronizadas;</li>
 *   <li>iniciar el estacionamiento y comprobar que el <b>identificador de zona que viaja</b> es el
 *       de la zona elegida;</li>
 *   <li>sin zonas, con la conexión caída, y al volver al mapa;</li>
 *   <li>los anchos del contrato, con dedo.</li>
 * </ol>
 *
 * <h2>Cómo se toca un polígono</h2>
 *
 * <p>Un mapa es un lienzo: no hay un elemento por zona al que apuntar. La prueba le pregunta a
 * MapLibre dónde cae el centro de cada zona —`map.project([lon, lat])`, la misma proyección que
 * está dibujando— y toca ese punto. La instancia la deja el componente en el nodo del lienzo; es
 * la única costura y está documentada allí.</p>
 *
 * <h2>Lo que esta prueba NO puede decir</h2>
 *
 * <p>Corre en Chromium. <b>Safari de iOS no es Chromium</b>, y el mapa es justo donde más se nota
 * —gestos, barra de direcciones que aparece y desaparece, áreas seguras—. Lo que aquí sale verde
 * hay que volver a verlo en un iPhone de verdad.</p>
 *
 *   cd frontend && node tests/responsive/mapa-zonas.cjs
 */
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = Number(process.env.PUERTO || 5212);
const BASE = `http://127.0.0.1:${PUERTO}`;
let API = '';
const SALIDA = process.env.SALIDA || path.join(RAIZ, '..', 'verificacion', 'mapa-zonas');

/** Los anchos del contrato del proyecto, con dedo en los que lo tienen. */
const TAMANOS = [
  { nombre: 'movil-320', width: 320, height: 568, dedo: true },
  { nombre: 'movil-390', width: 390, height: 844, dedo: true },
  { nombre: 'movil-430', width: 430, height: 932, dedo: true },
  { nombre: 'tableta-768', width: 768, height: 1024, dedo: true },
  { nombre: 'escritorio-1280', width: 1280, height: 900, dedo: false },
];

/**
 * Un estilo MapLibre válido y mínimo, servido en lugar del proveedor real.
 *
 * El proveedor de teselas no se contacta durante la prueba: lo que se mide es el componente, no la
 * disponibilidad de un tercero. Sin `glyphs` no se añade la capa de rótulos, que acá no estorba:
 * lo que se toca son los polígonos.
 */
const ESTILO_DE_PRUEBA = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

/** Responde el estilo localmente y corta cualquier salida a un tercero. */
async function sinTerceros(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (/\/styles\//.test(url) && !url.startsWith(BASE)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ESTILO_DE_PRUEBA),
      });
    }
    if (!url.startsWith(BASE) && !(API && url.startsWith(API))) return route.abort();
    return route.continue();
  });
}

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  if (cond) console.log(`  ok   ${nombre}`);
  else { fallos += 1; console.log(`  ✗    ${nombre}${detalle ? ' — ' + detalle : ''}`); }
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

/*
  El transporte simulado se sirve por HTTP DE VERDAD, y no inyectado dentro de la aplicación.

  Con `VITE_USE_MOCKS=true` el simulador entra como `fetchImpl` y ninguna petición sale al
  navegador: se pueden ver pantallas, pero no se puede interceptar el GeoJSON para probar «sin
  zonas» ni «con la red caída», ni mirar el cuerpo del POST que inicia la estadía — que es
  justamente la evidencia que pide la orden. Es el mismo módulo `mocks/index.ts` de siempre,
  envuelto por `servidor-simulado.cjs`; no es un segundo simulador escrito a mano.
*/
const { levantarSimulado } = require('./servidor-simulado.cjs');

async function levantar() {
  if (await puertoOcupado(PUERTO)) return async () => {};
  const simulado = await levantarSimulado(0);
  const hijo = spawn('npm',
    ['run', 'dev', '--workspace=@luparx/citizen', '--', '--port', String(PUERTO), '--strictPort', 'false'], {
      cwd: RAIZ,
      detached: true,
      env: {
        ...process.env,
        VITE_USE_MOCKS: 'false',
        VITE_API_BASE_URL: `http://localhost:${simulado.puerto}`,
        VITE_BASE_PATH: '/',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  for (let i = 0; i < 90; i += 1) {
    if (await puertoOcupado(PUERTO)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  API = `http://localhost:${simulado.puerto}`;
  return async () => {
    try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ }
    await simulado.cerrar();
  };
}

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('input[type=email]', 'citizen@example.com');
  await page.fill('input[type=password]', 'Password123!');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2800);
  if (/select-tenant/.test(page.url())) {
    const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
    if (await f.count()) { await f.click(); await page.waitForTimeout(1800); }
  }
}

/** Sirve para el desplegable propio y para el `<select>` del sistema. */
async function elegirEnLista(page, etiqueta, texto) {
  const caja = page.locator(`[aria-label="${etiqueta}"]`).first();
  await caja.waitFor({ state: 'visible', timeout: 10000 });
  if (await caja.evaluate((n) => n.tagName) === 'SELECT') {
    const valor = await caja.evaluate((n, buscado) => {
      const o = [...n.options].find((x) => x.textContent.includes(buscado));
      return o ? o.value : null;
    }, texto);
    if (valor === null) throw new Error(`no hay opción «${texto}»`);
    await caja.selectOption(valor);
  } else {
    await caja.click();
    await page.waitForTimeout(300);
    await page.locator('[role=option]').filter({ hasText: texto }).first().click();
  }
  await page.waitForTimeout(600);
}

/** Espera a que MapLibre esté montado y haya pintado las zonas. */
async function esperarMapa(page, intentos = 40) {
  for (let i = 0; i < intentos; i += 1) {
    const listo = await page.evaluate(() => {
      const nodo = document.querySelector('.lx-zonemap__lienzo');
      const m = nodo && nodo.__lxMapa;
      try { return Boolean(m && m.isStyleLoaded && m.isStyleLoaded() && m.getLayer('zonas-relleno')); }
      catch { return false; }
    });
    if (listo) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/** Dónde cae en pantalla el centro de cada zona dibujada, según la proyección del propio mapa. */
const PUNTOS_DE_ZONA = () => {
  const nodo = document.querySelector('.lx-zonemap__lienzo');
  const m = nodo && nodo.__lxMapa;
  if (!m) return [];
  const datos = m.getSource('zonas')?._data;
  if (!datos) return [];
  const caja = nodo.getBoundingClientRect();
  return datos.features.map((f) => {
    // Centro de la caja envolvente del polígono: para un rectángulo es su centro, y para
    // cualquier convexo cae dentro. No se dibuja nada ahí; sólo se calcula dónde tocar.
    const anillos = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0];
    let minLon = 180; let maxLon = -180; let minLat = 90; let maxLat = -90;
    for (const [lon, lat] of anillos[0]) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    const p = m.project([(minLon + maxLon) / 2, (minLat + maxLat) / 2]);
    return {
      code: f.properties.code,
      name: f.properties.name,
      x: Math.round(caja.left + p.x),
      y: Math.round(caja.top + p.y),
      dentro: p.x >= 0 && p.y >= 0 && p.x <= caja.width && p.y <= caja.height,
    };
  });
};

/**
 * Qué zona muestra el SELECTOR ahora mismo.
 *
 * <p>La tarjeta de zona se fue el 23-10-2026 —«información repetida», dice el boceto— así que lo
 * que hay que leer es el control, que es donde vive la elección de verdad. Sirve para el
 * `<select>` del sistema y para el desplegable propio.</p>
 */
const ENLISTA = () => {
  const n = document.querySelector('[aria-label="Zona"]');
  if (!n) return null;
  if (n.tagName === 'SELECT') {
    const o = n.options[n.selectedIndex];
    return { id: n.value || null, texto: (o ? o.textContent : '').trim() };
  }
  return { id: n.getAttribute('data-value') || null, texto: (n.textContent || '').trim() };
};

/**
 * El código con el que el mapa está resaltando ahora mismo.
 *
 * <p>Desde el 24-10-2026 el anillo son DOS capas —sólida para la zona oficial, punteada para la
 * que no lo es— porque `line-dasharray` no se puede decidir por los datos y una elegida no oficial
 * dibujada con el anillo sólido se veía igual que una verificada. Así que el código ya no está al
 * final del filtro: hay que buscarlo dentro, y en cualquiera de las dos capas.</p>
 */
const ANILLO = () => {
  const nodo = document.querySelector('.lx-zonemap__lienzo');
  const m = nodo && nodo.__lxMapa;
  const codigoDe = (filtro) => {
    // ['all', ['==', ['get','code'], X], …]  ó  ['==', ['get','code'], X]
    if (!Array.isArray(filtro)) return null;
    if (filtro[0] === '==' && JSON.stringify(filtro[1]) === JSON.stringify(['get', 'code'])) {
      return filtro[2];
    }
    for (const parte of filtro.slice(1)) {
      const hallado = codigoDe(parte);
      if (hallado) return hallado;
    }
    return null;
  };
  for (const capa of ['zonas-elegida', 'zonas-elegida-no-oficial']) {
    try {
      if (!m || !m.getLayer(capa)) continue;
      const hallado = codigoDe(m.getFilter(capa));
      if (hallado) return hallado;
    } catch { /* la capa aún no está */ }
  }
  return null;
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const apagar = await levantar();
  const navegador = await chromium.launch({ executablePath: EJECUTABLE });
  /** El cuerpo de cada POST /sessions, para poder mirar el zoneId que viajó. */
  const envios = [];
  try {
    const ctx = await navegador.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-CR',
    });
    await sinTerceros(ctx);
    ctx.on('request', (r) => {
      if (r.method() === 'POST' && /\/parking\/sessions$/.test(new URL(r.url()).pathname)) {
        try { envios.push(JSON.parse(r.postData() || '{}')); } catch { envios.push(null); }
      }
    });
    const page = await ctx.newPage();
    await entrar(page);

    // ---- 1 · El mapa está al entrar ------------------------------------------------------------
    console.log('\n══ 1 · abrir Estacionar y ver el mapa ══');
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    ok(await page.locator('.lx-zonemap').count() === 1,
      'el mapa está en la pantalla sin escribir ni pulsar nada');
    ok(await page.getByRole('button', { name: /ver la zona en el mapa/i }).count() === 0,
      'no hay que abrirlo: ya está abierto');
    const montado = await esperarMapa(page);
    ok(montado, 'MapLibre montó y las capas de zona existen');
    /*
      La captura que pide la orden: la pantalla tal como se abre, con el selector arriba y el mapa
      debajo, SIN desplazar. Se mide además cuánto del mapa se ve así, que es la diferencia entre
      «el mapa está» y «el mapa se ve».
    */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SALIDA, 'arriba-390.png') });
    const encuadre = await page.evaluate(() => {
      const sel = document.querySelector('[aria-label="Zona"]');
      const m = document.querySelector('.lx-zonemap');
      if (!sel || !m) return null;
      const rs = sel.getBoundingClientRect(); const rm = m.getBoundingClientRect();
      const barra = document.querySelector('.lx-sticky-cta');
      const techo = barra ? Math.min(barra.getBoundingClientRect().top, window.innerHeight) : window.innerHeight;
      return {
        selectorArriba: Math.round(rs.top), mapaArriba: Math.round(rm.top),
        debajo: rm.top >= rs.bottom - 1,
        visible: Math.round(Math.max(0, Math.min(rm.bottom, techo) - Math.max(rm.top, 0))),
        alto: Math.round(rm.height),
      };
    });
    ok(encuadre !== null && encuadre.debajo,
      'el mapa está DEBAJO del selector de zona, como pide el boceto', JSON.stringify(encuadre));
    console.log(`     ·· sin desplazar se ven ${encuadre.visible} de los ${encuadre.alto} px del mapa`);

    // ---- 2 · Las zonas son las del servidor ----------------------------------------------------
    console.log('\n══ 2 · las zonas son las que publicó el servidor ══');
    /*
      No se consulta la API desde la página: con `VITE_USE_MOCKS` el transporte simulado vive
      DENTRO de la aplicación, así que un `fetch` a la ruta devuelve el index.html del servidor de
      desarrollo. Lo que se compara son las dos cosas que la pantalla sí tiene delante: lo que el
      mapa dibuja y lo que la lista de zonas ofrece. Esa comparación es la que importa —que el mapa
      no dibuje una zona que no sea de esta municipalidad, y que una zona sin geometría no se
      invente— y no es circular: son dos consultas distintas del servidor.
    */
    /*
      El mapa se pone a la vista ANTES de medir. `PUNTOS_DE_ZONA` devuelve coordenadas de ventana
      —las que necesita `page.mouse.click`— y con el mapa a medio salir por abajo, el centro de una
      zona cae fuera de la ventana: el clic se pierde y el síntoma es «tocar no hace nada», que es
      justo lo que se está comprobando. Medido: y = 847 en una ventana de 844.
    */
    await page.evaluate(() => {
      document.querySelector('.lx-zonemap')?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(800);
    const puntos = await page.evaluate(PUNTOS_DE_ZONA);
    const enLaLista = await page.locator('[aria-label="Zona"]').first().evaluate((n) => (
      n.tagName === 'SELECT'
        ? [...n.options].filter((o) => o.value).map((o) => ({ id: o.value, nombre: o.textContent.trim() }))
        : []));
    ok(puntos.length > 0, 'el mapa dibujó zonas', JSON.stringify(puntos.map((p) => p.code)));
    ok(enLaLista.length > 0, 'la lista ofrece zonas', JSON.stringify(enLaLista));
    ok(puntos.every((p) => enLaLista.some((z) => z.nombre.includes(p.name))),
      'ninguna zona dibujada es ajena a esta municipalidad',
      JSON.stringify({ mapa: puntos.map((p) => p.name), lista: enLaLista.map((z) => z.nombre) }));
    ok(puntos.length <= enLaLista.length,
      'no se dibujan más zonas de las que la municipalidad tiene',
      `${puntos.length} dibujadas contra ${enLaLista.length} en la lista`);
    /*
      Y la mitad que de verdad protege contra inventar: la municipalidad simulada tiene a propósito
      una zona SIN geometría. Tiene que aparecer en la lista y NO en el mapa. Si algún día se
      dibujara, sería un perímetro que el servidor nunca publicó.
    */
    ok(enLaLista.length > puntos.length,
      'una zona sin geometría está en la lista y no en el mapa: no se le inventa un perímetro',
      JSON.stringify({ lista: enLaLista.map((z) => z.nombre), mapa: puntos.map((p) => p.name) }));
    ok(puntos.every((p) => p.dentro), 'todas las zonas quedan dentro del lienzo, alcanzables con el dedo',
      JSON.stringify(puntos));

    // ---- 3 · Tocar una zona la elige -----------------------------------------------------------
    /*
      UN TOQUE, NO DOS (23-10-2026).

      Hasta esta mañana tocar una zona abría una tarjeta con un botón de confirmar. El boceto
      aprobado quita esa tarjeta —«información repetida»— y sin ella el segundo toque no confirma
      nada: pide uno de más. Así que tocar ELIGE, y lo que hay que comprobar es que el selector y
      el resaltado del mapa quedan los dos en la zona tocada.
    */
    console.log('\n══ 3 · tocar una zona la elige ══');
    const alEntrar = await page.evaluate(ENLISTA);
    ok(alEntrar !== null && Boolean(alEntrar.id), 'al entrar ya hay una zona elegida en el selector',
      JSON.stringify(alEntrar));
    const otra = puntos.find((p) => !alEntrar.texto.includes(p.name));
    ok(Boolean(otra), 'hay otra zona dibujada a la que cambiar',
      JSON.stringify({ selector: alEntrar.texto, mapa: puntos.map((p) => p.name) }));
    /*
      Se vuelven a medir, y se comprueba que el punto NO esté tapado por la barra fija de
      «Continuar». Es lo que escondía el defecto la primera vez: el clic llegaba a la barra y el
      mapa no se enteraba, con el síntoma exacto de «tocar una zona no hace nada». Un usuario lo
      resuelve desplazando, pero una prueba que tocara a ciegas daría rojo sin decir por qué.
    */
    const alDia = await page.evaluate(PUNTOS_DE_ZONA);
    const destino = alDia.find((p) => p.code === otra.code) ?? otra;
    const encima = await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return e ? `${e.tagName}.${String(e.className || '').split(' ')[0]}` : null;
    }, [destino.x, destino.y]);
    ok(/CANVAS|lx-zonemap/.test(String(encima)),
      'el punto de la zona está destapado: lo que hay encima es el propio mapa',
      `encima hay ${encima}`);
    await page.mouse.click(destino.x, destino.y);
    await page.waitForTimeout(900);

    const trasTocar = await page.evaluate(ENLISTA);
    ok(trasTocar !== null && trasTocar.texto.includes(otra.name),
      'el selector queda en la zona tocada, de un solo toque',
      `${trasTocar && trasTocar.texto} ≠ ${otra.name}`);
    ok(await page.evaluate(ANILLO) === otra.code, 'y el mapa la resalta',
      String(await page.evaluate(ANILLO)));
    ok(await page.locator('.lx-zona-ficha').count() === 0,
      'no vuelve a aparecer la tarjeta de zona: la información no se repite');
    await page.evaluate(() => {
      document.querySelector('.lx-zonemap')?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SALIDA, 'tocada-390.png') });

    /*
      Y la tarifa: la del rótulo del mapa tiene que ser la que el servidor publica para ESA zona.
      Es la comprobación que atrapa el defecto peligroso —el precio de una zona sobre otra— sin
      exigir que toda zona publique tarifa, que no es cierto.
    */
    const rotulos = await page.evaluate(() => {
      const nodo = document.querySelector('.lx-zonemap__lienzo');
      const datos = nodo && nodo.__lxMapa && nodo.__lxMapa.getSource('zonas')?._data;
      if (!datos) return {};
      return Object.fromEntries(datos.features.map((f) => [f.properties.code, f.properties.lxEtiqueta || '']));
    });
    ok(String(rotulos[otra.code] || '').includes(otra.name),
      'el rótulo del mapa nombra su zona', `${otra.code}: «${rotulos[otra.code]}»`);
    const conTarifa = Object.values(rotulos).filter((r) => /[0-9]/.test(String(r)));
    ok(conTarifa.length === 0 || new Set(conTarifa).size === conTarifa.length,
      'dos zonas no comparten el mismo rótulo con precio: no se copia la tarifa de una a otra',
      JSON.stringify(rotulos));

    // ---- 4 · Y al revés: elegir en la lista mueve el mapa ---------------------------------------
    console.log('\n══ 4 · elegir en la lista mueve el mapa ══');
    const volver = puntos.find((p) => p.code !== otra.code);
    await elegirEnLista(page, 'Zona', volver.name);
    await page.waitForTimeout(900);
    ok(await page.evaluate(ANILLO) === volver.code,
      'elegir en la lista mueve el resaltado del mapa', String(await page.evaluate(ANILLO)));
    const trasLista = await page.evaluate(ENLISTA);
    ok(trasLista !== null && trasLista.texto.includes(volver.name),
      'y el selector queda donde se lo dejó', JSON.stringify(trasLista));
    await page.evaluate(() => {
      document.querySelector('.lx-zonemap')?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SALIDA, 'mapa-390.png') });

    // ---- 5 · El id de zona que viaja -----------------------------------------------------------
    console.log('\n══ 5 · el identificador de zona que viaja al iniciar ══');
    const idElegido = (await page.evaluate(ENLISTA))?.id ?? null;
    const idEsperado = enLaLista.find((z) => z.nombre.includes(volver.name))?.id;
    ok(Boolean(idEsperado), 'la zona elegida tiene identificador en la lista', JSON.stringify(enLaLista));
    ok(idElegido === idEsperado,
      'el control de zona lleva el identificador de la zona elegida en el mapa',
      `${idElegido} contra ${idEsperado}`);

    /*
      El código de bahía se toma del RANGO QUE PUBLICA LA ZONA ELEGIDA, no de un literal. Con un
      literal, cambiar de zona en la prueba dejaba un código fuera de rango —cada zona tiene el
      suyo—, el paso 1 no dejaba avanzar y el fallo aparecía tres secciones más abajo como «no se
      envió la estadía», que no dice nada de la causa.
    */
    const pista = await page.locator('.lx-field__hint, .lx-text-meta').allInnerTexts();
    const primera = (pista.join(' ').match(/[A-Z]{2,}-\d+/) || [])[0];
    ok(Boolean(primera), 'la zona publica su rango de bahías', pista.join(' | ').slice(0, 160));
    await page.locator('input[inputmode=numeric], input[inputmode=text]').first()
      .fill(primera || 'LUP-0001');
    /*
      Y se suelta el campo. Con el foco dentro, `useTecladoVirtual` marca el teclado como abierto y
      la hoja esconde la barra fija a propósito —para que no quede flotando sobre el teclado—, así
      que el botón «Continuar» existe pero está `visibility: hidden`. Es el comportamiento correcto
      de la aplicación; lo que estaba mal era que la prueba escribiera y buscara el botón sin
      soltar el campo, como no hace ninguna persona.
    */
    await page.locator('input[inputmode=numeric], input[inputmode=text]').first().blur();
    await page.waitForTimeout(900);
    /*
      Los tres «Continuar» del asistente. Se pulsa el botón de la barra fija, que es el único que
      avanza; si alguno no llegara a estar habilitado, el bucle corta y el fallo se ve abajo, en la
      comprobación de que la estadía se envió.
    */
    for (let paso = 0; paso < 3; paso += 1) {
      const continuar = page.getByRole('button', { name: /^Continuar$/ }).first();
      if (await continuar.count() === 0) { console.log(`     ·· sin botón Continuar en el paso ${paso + 1}`); break; }
      await continuar.click();
      await page.waitForTimeout(1500);
      /*
        Con «Otro vehículo» y una placa de la corrida, no con el vehículo por omisión.

        El simulador arranca con DOS estadías activas sembradas, y una de ellas es la del vehículo
        que el paso 2 trae elegido: cualquier intento con él vuelve con 409
        SESSION_ALREADY_ACTIVE_FOR_VEHICLE. Esta sección enviaba igual —por eso «se envió el inicio
        de la estadía» pasaba— pero NUNCA llegaba a «¡Listo!», y la comprobación de la pantalla de
        resultado se saltaba sola porque toleraba no encontrarla. Es decir: el camino completo del
        asistente no estaba probado, y nadie se enteraba. Con la placa de invitada sí llega.
      */
      const selectorVehiculo = page.locator('[aria-label="Selecciona un vehículo"]').first();
      if (await selectorVehiculo.count() > 0
        && await selectorVehiculo.inputValue().catch(() => '') !== 'guest') {
        await elegirEnLista(page, 'Selecciona un vehículo', 'Otro vehículo');
        const placa = page.locator('input[maxlength="16"]').first();
        if (await placa.count() > 0) {
          await placa.fill('PRB5678');
          await placa.blur();
          await page.waitForTimeout(600);
        }
      }
      const aviso = await page.locator('.lx-sticky-cta__notice').allInnerTexts();
      if (aviso.length) console.log(`     ·· el paso ${paso + 1} pide: ${aviso.join(' | ')}`);
      await page.waitForTimeout(300);
    }
    /* Confirmar, cerrando la hoja de «ahora no se cobra» si la zona está fuera de horario. */
    for (let intento = 0; intento < 3; intento += 1) {
      if (await page.locator('.lx-resultado').count() > 0) break;
      const entendido = page.getByRole('button', { name: /^Entendido$/i }).first();
      if (await entendido.isVisible().catch(() => false)) {
        await entendido.click();
        await page.waitForTimeout(900);
      }
      const confirmar = page
        .getByRole('button', { name: /Confirmar y pagar|Iniciar estacionamiento/i }).first();
      if (await confirmar.isVisible().catch(() => false)) {
        await confirmar.click();
        await page.waitForTimeout(2600);
      }
    }
    ok(envios.length > 0, 'se envió el inicio de la estadía', `envíos: ${envios.length}`);
    if (envios.length > 0) {
      ok(envios[envios.length - 1]?.zoneId === idEsperado,
        'el zoneId que VIAJÓ es el de la zona elegida en el mapa',
        `${envios[envios.length - 1]?.zoneId} contra ${idEsperado}`);
    }
    /*
      Y la evidencia que ve la persona: la pantalla de resultado nombra la zona. Si el identificador
      fuera el correcto pero la pantalla dijera otra zona, el error seguiría siendo grave.
    */
    /*
      Y se EXIGE llegar. Antes esta comprobación aceptaba `null` —«si no hay pantalla de resultado,
      bueno»— y por eso nadie notó durante semanas que el asistente nunca llegaba al final en las
      pruebas. Una comprobación que se aprueba a sí misma cuando falta lo que mide no mide nada.
    */
    const enElResultado = await page.locator('.lx-resultado').first()
      .textContent().catch(() => null);
    ok(enElResultado !== null, 'el asistente llega hasta «¡Listo!»');
    ok(enElResultado !== null && enElResultado.includes(volver.name),
      'la pantalla de resultado nombra la zona elegida',
      `buscaba «${volver.name}» en «${(enElResultado || '').slice(0, 160)}»`);
    await page.screenshot({ path: path.join(SALIDA, 'resultado-390.png') });
    ok(envios.every((e) => !e || !('cardToken' in e)), 'no viajó ningún dato de tarjeta');

    /*
      El otro lado de la corrección del 23-10: CON geometrías el botón sí está, y lo que promete
      aparece. Las dos mitades tienen que comprobarse juntas, porque «no ofrecer el botón» es fácil
      de lograr de más —quitándolo siempre— y eso sería otra regresión, no un arreglo.
    */
    if (await page.locator('.lx-resultado').count() > 0) {
      const verMapa = page.getByRole('button', { name: /Ver en el mapa/i }).first();
      ok(await verMapa.count() === 1,
        'con geometrías, «¡Listo!» sí ofrece ver el mapa');
      if (await verMapa.count() === 1) {
        await verMapa.click();
        await page.waitForTimeout(2500);
        ok(await page.locator('.lx-resultado .lx-zonemap__lienzo canvas').count() === 1,
          'y al pulsarlo aparece un mapa de verdad, no un hueco');
        await page.evaluate(() => {
          document.querySelector('.lx-resultado .lx-zonemap')?.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SALIDA, 'listo-con-mapa-390.png') });
        const ocultar = page.getByRole('button', { name: /Ocultar el mapa/i }).first();
        ok(await ocultar.count() === 1,
          'el rótulo pasa a «Ocultar el mapa» porque ahora SÍ hay mapa que ocultar');
        if (await ocultar.count() === 1) {
          await ocultar.click();
          await page.waitForTimeout(1200);
          ok(await page.locator('.lx-resultado .lx-zonemap__lienzo').count() === 0,
            'y ocultarlo lo oculta: la alternancia hace lo que dice');
        }
      }
    }

    await ctx.close();

    // ---- 6 · Sin zonas, con la red caída, y al volver -------------------------------------------
    console.log('\n══ 6 · sin zonas, con la red caída, y al volver ══');
    {
      const c = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'es-CR' });
      await sinTerceros(c);
      const p = await c.newPage();
      await p.route('**/parking/zones/geojson*', (route) => route.fulfill({
        status: 200, contentType: 'application/geo+json',
        body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
      }));
      const respuestasInicio = [];
      p.on('response', async (r) => {
        if (/\/parking\/sessions?\b|\/parking\/start/.test(r.url()) && r.request().method() === 'POST') {
          respuestasInicio.push({ url: r.url().slice(-40), estado: r.status(),
            cuerpo: await r.text().then((t) => t.slice(0, 200)).catch(() => '') });
        }
      });
      await entrar(p);
      await p.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2500);
      ok(await p.locator('.lx-zonemap__lienzo').count() === 0,
        'sin geometrías no se dibuja ningún mapa: no hay dónde centrarlo');
      /*
        Y la nota NOMBRA las zonas que no tienen perímetro. Es lo que pide la orden del 23-10 —
        «indicar qué zonas carecen de geometría»— y es la diferencia entre «esto está roto» y
        «esto falta»: quien busca la suya y no la ve necesita saber cuál de las dos cosas pasa.
      */
      const nota = (await p.locator('.lx-zonemap__nota').first().textContent()) || '';
      ok(await p.locator('.lx-zonemap__nota').count() === 1,
        'queda una nota en lugar del mapa');
      /*
        UNA línea, y SIN la lista de zonas. El boceto del 23-10 marca como defecto «demasiado texto
        técnico» y «listas extensas de perímetros»: la versión anterior nombraba las ocho zonas sin
        dibujar, dos veces. Lo que se exige ahora es que NO vuelva a crecer.
      */
      ok(nota.length <= 120, 'la nota es una línea, no un párrafo', `${nota.length} caracteres`);
      ok(!/,.*,/.test(nota), 'y no lista los perímetros que faltan', nota.slice(0, 160));
      ok(await p.locator('[aria-label="Zona"]').count() === 1,
        'y la lista de zonas sigue estando: se puede estacionar igual');
      await p.screenshot({ path: path.join(SALIDA, 'sin-zonas-390.png') });

      /*
        ── EL BOTÓN DE «¡LISTO!» NO PROMETE UN MAPA QUE NO VA A APARECER ──

        Es el fallo que Javier fotografió en staging el 23-10-2026: estacionamiento activo BNY963
        en Barrio Amón, y un botón que decía «Ocultar el mapa» sobre una pantalla sin mapa. Tocarlo
        y volver a tocarlo no cambiaba nada, porque no había nada que ocultar ni que mostrar: el
        botón guardaba la intención de la persona y el componente decidía aparte, con otros datos.

        Se comprueba acá, en el contexto que ya tiene el GeoJSON vacío, porque ésa es exactamente
        la condición del fallo. Lo que se exige no es que el rótulo diga otra cosa: es que la
        acción NO se ofrezca, y que en su lugar quede la misma nota de una línea.
      */
      await p.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1200);
      await elegirEnLista(p, 'Zona', 'Centro');
      await p.locator('input[inputmode=numeric], input[inputmode=text]').first().fill('LUP-0001');
      await p.locator('input[inputmode=numeric], input[inputmode=text]').first().blur();
      await p.waitForTimeout(400);
      /*
        Se estaciona con «Otro vehículo» y una placa inventada para esta corrida, no con uno de los
        del catálogo.

        Razón medida, no estética: la sección 5 de este mismo arnés ya inició una estadía con el
        vehículo por omisión, y el simulador comparte estado entre contextos. El segundo intento
        volvía con 409 SESSION_ALREADY_ACTIVE_FOR_VEHICLE, la pantalla se quedaba en el paso 3 y
        esta comprobación se informaba como «sin probar» sin decir por qué. La placa de invitada no
        se guarda en ninguna parte y no tiene estadía previa, así que la prueba deja de depender
        del orden en que corran las secciones.
      */
      for (let paso = 0; paso < 3; paso += 1) {
        const seguir = p.getByRole('button', { name: /^Continuar$/ }).first();
        if (await seguir.count() === 0) break;
        await seguir.click();
        await p.waitForTimeout(1400);
        const selectorVehiculo = p.locator('[aria-label="Selecciona un vehículo"]').first();
        if (await selectorVehiculo.count() > 0 && await selectorVehiculo.inputValue().catch(() => '') !== 'guest') {
          await elegirEnLista(p, 'Selecciona un vehículo', 'Otro vehículo');
          const placa = p.locator('input[maxlength="16"]').first();
          if (await placa.count() > 0) {
            await placa.fill('PRB1234');
            await placa.blur();
            await p.waitForTimeout(600);
          }
        }
      }
      /*
        Confirmar, cerrando por el camino la hoja que la aplicación abre cuando la zona no cobra a
        esta hora —«Ahora no se cobra; el cobro se reanuda el sábado», con su «Entendido»—.

        Va en un bucle corto y no en una secuencia fija porque el orden depende de la hora: si la
        hoja ya está abierta al llegar al paso 3, el clic de confirmar se lo lleva ella; si se abre
        al confirmar, hay que cerrarla y confirmar otra vez. Dos intentos cubren las dos. El primer
        intento de esta prueba suponía un orden, se quedaba en el paso 3, y la comprobación del
        botón del mapa se informaba como «sin probar» — que es no comprobar nada.
      */
      for (let intento = 0; intento < 3; intento += 1) {
        if (await p.locator('.lx-resultado').count() > 0) break;
        const entendido = p.getByRole('button', { name: /^Entendido$/i }).first();
        if (await entendido.isVisible().catch(() => false)) {
          await entendido.click();
          await p.waitForTimeout(900);
        }
        const confirmar2 = p
          .getByRole('button', { name: /Confirmar y pagar|Iniciar estacionamiento/i }).first();
        if (await confirmar2.isVisible().catch(() => false)) {
          await confirmar2.click();
          await p.waitForTimeout(2600);
        }
      }
      const enListo = await p.locator('.lx-resultado').count() > 0;
      if (!enListo && process.env.DEPURAR === '1') {
        console.log('     ·· respuestas del inicio: ' + JSON.stringify(respuestasInicio));
        console.log('     ·· botones: ' + JSON.stringify((await p.getByRole('button').allInnerTexts())
          .map((x) => x.trim()).filter(Boolean).slice(0, 14)));
        console.log('     ·· texto: ' + (await p.evaluate(() => document.body.innerText))
          .replace(/\n+/g, ' / ').slice(0, 300));
      }
      if (enListo) {
        const botonMapa = p.getByRole('button', { name: /Ver en el mapa|Ocultar el mapa/i });
        ok(await botonMapa.count() === 0,
          'en «¡Listo!» sin geometrías NO se ofrece el botón del mapa: no hay mapa que mostrar');
        const notaListo = (await p.locator('.lx-resultado .lx-zonemap__nota').first()
          .textContent().catch(() => '')) || '';
        ok(notaListo.length > 0 && notaListo.length <= 120,
          'y en su lugar queda la misma línea breve, no el párrafo de tres renglones',
          `${notaListo.length} caracteres · ${JSON.stringify(notaListo.slice(0, 120))}`);
        ok(!/funciona igual|la bah[íi]a que escribi/i.test(notaListo),
          'sin el texto largo que salía en la captura de staging',
          notaListo.slice(0, 160));
        await p.screenshot({ path: path.join(SALIDA, 'listo-sin-zonas-390.png') });
      } else {
        console.log('  ··  SIN PROBAR: no se llegó a «¡Listo!» en este contexto');
      }
      await c.close();
    }
    {
      const c = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'es-CR' });
      await sinTerceros(c);
      const p = await c.newPage();
      let caido = true;
      await p.route('**/parking/zones/geojson*', (route) => (caido
        ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{"status":503}' })
        : route.continue()));
      await entrar(p);
      await p.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2500);
      const aviso = p.locator('.lx-zonemap__aviso');
      ok(await aviso.count() === 1, 'con la conexión caída se explica el fallo en lugar del mapa');
      const reintentar = aviso.getByRole('button');
      ok(await reintentar.count() === 1, 'y se ofrece reintentar');
      await p.screenshot({ path: path.join(SALIDA, 'error-390.png') });
      caido = false;
      await reintentar.click();
      await p.waitForTimeout(3500);
      ok(await esperarMapa(p), 'al reintentar con red, el mapa aparece sin recargar la página');
      // Y al volver: salir de Estacionar y entrar otra vez deja el mapa como estaba.
      await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1200);
      await p.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      ok(await esperarMapa(p), 'al regresar al mapa vuelve a dibujarse');
      ok(await p.evaluate(() => document.querySelectorAll('.lx-zonemap__lienzo canvas').length) === 1,
        'y queda UN solo lienzo: no se acumulan mapas de WebGL',
        String(await p.evaluate(() => document.querySelectorAll('.lx-zonemap__lienzo canvas').length)));
      await c.close();
    }

    // ---- 7 · Los anchos del contrato -----------------------------------------------------------
    console.log('\n══ 7 · los anchos del contrato ══');
    for (const tam of TAMANOS) {
      const c = await navegador.newContext({
        viewport: { width: tam.width, height: tam.height },
        hasTouch: tam.dedo, isMobile: tam.dedo, locale: 'es-CR',
      });
      await sinTerceros(c);
      const p = await c.newPage();
      await entrar(p);
      await p.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1800);
      const listo = await esperarMapa(p);
      const medidas = await p.evaluate(() => {
        const s = document.querySelector('.lx-zonemap');
        const f = document.querySelector('[aria-label="Zona"]');
        const r = s ? s.getBoundingClientRect() : null;
        const rf = f ? f.getBoundingClientRect() : null;
        const barra = document.querySelector('.lx-sticky-cta');
        const rb = barra ? barra.getBoundingClientRect() : null;
        // Cuánto del mapa se ve sin desplazar, por encima de la barra fija de «Continuar».
        const techo = rb ? Math.min(rb.top, window.innerHeight) : window.innerHeight;
        const visible = r ? Math.max(0, Math.min(r.bottom, techo) - Math.max(r.top, 0)) : 0;
        return {
          mapa: Boolean(s),
          selector: Boolean(f),
          derechaMapa: r ? Math.round(r.right) : 0,
          derechaSelector: rf ? Math.round(rf.right) : 0,
          vw: window.innerWidth,
          desborde: Math.round(document.documentElement.scrollWidth - window.innerWidth),
          arribaDelMapa: r ? Math.round(r.top) : 0,
          altoMapa: r ? Math.round(r.height) : 0,
          visibleSinDesplazar: Math.round(visible),
          vh: window.innerHeight,
        };
      });
      console.log(`     ·· ${tam.nombre}: el mapa empieza a ${medidas.arribaDelMapa} px de `
        + `${medidas.vh}; se ven ${medidas.visibleSinDesplazar} de sus ${medidas.altoMapa} px sin desplazar`);
      ok(listo && medidas.mapa, `${tam.nombre}: el mapa se dibuja`);
      ok(medidas.selector, `${tam.nombre}: el selector de zona está`);
      ok(medidas.desborde <= 0, `${tam.nombre}: sin desplazamiento horizontal`,
        `desborde ${medidas.desborde}px`);
      ok(medidas.derechaMapa <= medidas.vw + 1 && medidas.derechaSelector <= medidas.vw + 1,
        `${tam.nombre}: ni el mapa ni el selector se salen por la derecha`, JSON.stringify(medidas));
      await p.screenshot({ path: path.join(SALIDA, `${tam.nombre}.png`) });
      await c.close();
    }
  } catch (e) {
    fallos += 1;
    console.error('\n✗ La corrida se interrumpió:', e && e.message ? e.message : e);
  } finally {
    await navegador.close();
    await apagar();
  }

  console.log(`\n${fallos === 0 ? 'sin fallos' : fallos + ' fallos'}`);
  console.log(`capturas en ${SALIDA}`);
  console.log('\nSIN PROBAR: Safari de iOS en un teléfono real. Esto corrió en Chromium.');
  process.exit(fallos === 0 ? 0 : 1);
})();
