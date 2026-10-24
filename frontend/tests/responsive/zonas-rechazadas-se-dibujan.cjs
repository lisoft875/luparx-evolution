/**
 * Si el servidor publicara los perímetros de San José, ¿se dibujarían bien?
 *
 * <h2>Qué pregunta contesta, y por qué hacía falta contestarla aparte</h2>
 *
 * <p>El 24-10-2026 Javier pidió saber por qué Barrio Amón no aparece delimitado. El preflight de
 * staging ya había mostrado que los ocho polígonos de San José EXISTEN, son válidos, SRID 4326 y
 * caen donde deben — pero su `geom_status` es `REJECTED`, y el endpoint del ciudadano publica sólo
 * los estados que diga `GEO_CITIZEN_GEOMETRY_STATUSES`, hoy `VERIFIED,UNVERIFIED`. Cero features.</p>
 *
 * <p>Eso deja una pregunta abierta que no se puede contestar mirando staging, porque staging no
 * los manda: <b>si llegaran, ¿los dibujaría bien la aplicación?</b> Si la respuesta fuera que no,
 * abrir la variable no arreglaría nada y habría un segundo defecto esperando. Acá se interceptan
 * las geometrías y se devuelve Barrio Amón tal como vendría, para medir el dibujo.</p>
 *
 * <h2>De dónde salen estas coordenadas</h2>
 *
 * <p><b>Del propio preflight de Javier</b>, sección 4, que imprime la caja de cada zona. Son los
 * rectángulos de demostración que siembra la V41_0: no son el perímetro de Barrio Amón y no se
 * usan como tal en ninguna parte del producto. Viven sólo en este archivo de prueba, para que la
 * foto se parezca a lo que él vería, y por eso la comprobación EXIGE que el rótulo diga
 * «DEMO · no oficial»: lo que se valida no es sólo que se dibuje, es que se dibuje <i>diciendo lo
 * que es</i>.</p>
 *
 *   node tests/responsive/zonas-rechazadas-se-dibujan.cjs
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5183';
const API = Number(process.env.PUERTO_API || 5190);
const CUENTA = process.env.CUENTA ?? 'citizen@example.com';
const PASS = process.env.PASS ?? 'Password123!';
const SALIDA = process.env.CAPTURAS ?? path.join(__dirname, 'capturas', 'zonas-san-jose');

const ESTILO = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

/** Las cajas que imprime el preflight. Rectángulos DEMO, no perímetros. Sólo para esta prueba. */
const CAJAS = [
  { code: 'SJ-AMON', name: 'Barrio Amón', o: -84.0790, s: 9.9345, e: -84.0730, n: 9.9385 },
  { code: 'SJ-MERCADO', name: 'Mercado Central', o: -84.0830, s: 9.9300, e: -84.0780, n: 9.9335 },
  { code: 'SJ-SABANA', name: 'La Sabana', o: -84.1030, s: 9.9300, e: -84.0960, n: 9.9360 },
];

const comoFeature = (c, estado) => ({
  type: 'Feature',
  id: c.code,
  geometry: {
    type: 'Polygon',
    coordinates: [[[c.o, c.n], [c.e, c.n], [c.e, c.s], [c.o, c.s], [c.o, c.n]]],
  },
  properties: { code: c.code, name: c.name, source: 'DEMO', status: estado, verifiedAt: null },
});

let fallos = 0;
const ok = (cond, nombre, detalle = '') => {
  if (cond) console.log(`  ok   ${nombre}`);
  else { fallos += 1; console.log(`  ✗    ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const ocupado = (p) => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: p });
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.setTimeout(1000, () => { s.destroy(); res(false); });
});

(async () => {
  if (!(await ocupado(5183))) {
    console.error('✗ No hay servidor en :5183. Levantá el del ciudadano antes de correr esto.');
    process.exit(2);
  }
  fs.mkdirSync(SALIDA, { recursive: true });

  const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    hasTouch: true, isMobile: true, locale: 'es-CR',
  });

  /*
    UN solo manejador: Playwright ejecuta el último que coincide, y con dos el comodín se come al
    específico. Ya costó una corrida en `mapa-centro-configurado.cjs`.
  */
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    /*
      La LISTA de zonas también se sustituye, y no por comodidad: la tarifa del rótulo sale de
      `durations`, que viaja en la lista y no en el GeoJSON. Sin sustituirla, el simulador no
      conoce `SJ-AMON`, no hay tarifa, y el rótulo salía sólo con el nombre — que es exactamente lo
      que pasó en la primera corrida y lo que habría hecho pasar por bueno medio punto 4 del
      encargo. Los importes son de prueba; en staging los pone la municipalidad.
    */
    if (/\/parking\/zones(\?|$)/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CAJAS.map((c, i) => ({
          id: `zona-${i}`,
          code: c.code,
          name: c.name,
          durations: [
            { minutes: 30, amountMinor: 22500, currencyCode: 'CRC' },
            { minutes: 60, amountMinor: 45000, currencyCode: 'CRC' },
          ],
          spaceCodes: { first: '0001', last: '0080', total: 80 },
        }))),
      });
    }
    if (/\/parking\/zones\/geojson/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/geo+json',
        body: JSON.stringify({
          type: 'FeatureCollection',
          features: CAJAS.map((c) => comoFeature(c, 'REJECTED')),
        }),
      });
    }
    if (url.startsWith(BASE) || url.startsWith(`http://localhost:${API}`)
      || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (/\/styles\//.test(url)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ESTILO),
      });
    }
    return route.abort();
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.fill('input[type=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2200);
  const ficha = page.locator('button, a').filter({ hasText: /San José/ }).first();
  if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1800); }
  await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  console.log('\n══ Lo que llega REJECTED, ¿se dibuja? ══');

  const dibujo = await page.evaluate(() => {
    const nodo = document.querySelector('.lx-zonemap__lienzo');
    const m = nodo && nodo.__lxMapa;
    if (!m) return null;
    const rasgos = m.querySourceFeatures ? m.querySourceFeatures('zonas') : [];
    return {
      lienzo: true,
      capas: ['zonas-relleno', 'zonas-resplandor', 'zonas-borde', 'zonas-borde-no-oficial',
        'zonas-elegida', 'zonas-elegida-no-oficial', 'zonas-etiqueta']
        .filter((id) => { try { return Boolean(m.getLayer(id)); } catch { return false; } }),
      rasgos: rasgos.length,
      codigos: [...new Set(rasgos.map((f) => f.properties && f.properties.code))].filter(Boolean),
    };
  });
  ok(Boolean(dibujo && dibujo.lienzo), 'el mapa se monta');
  if (dibujo) {
    ok(dibujo.rasgos > 0, 'los polígonos llegan a la fuente del mapa',
      JSON.stringify(dibujo));
    ok(dibujo.codigos.includes('SJ-AMON'), 'y Barrio Amón está entre ellos',
      JSON.stringify(dibujo.codigos));
    ok(dibujo.capas.includes('zonas-relleno') && dibujo.capas.includes('zonas-resplandor'),
      'con su relleno y su resplandor: el estilo neón del boceto',
      JSON.stringify(dibujo.capas));
    /*
      El trazo punteado es la capa que SEPARA lo no oficial de lo oficial. Que exista aquí es la
      comprobación que impide el peor resultado posible de este encargo: un rectángulo de
      demostración dibujado como si fuera el límite de Barrio Amón.
    */
    ok(dibujo.capas.includes('zonas-borde-no-oficial'),
      'y con el contorno punteado, porque NO son límites oficiales',
      JSON.stringify(dibujo.capas));
    /*
      Y LA ELEGIDA TAMBIÉN PUNTEADA. Es la comprobación que nació de una captura: con un solo
      anillo de selección, sólido, la zona elegida perdía el punteado y se veía igual que una
      verificada. El rótulo seguía diciendo «DEMO · no oficial», pero el contorno —que es la señal
      que no hay que leer ni distinguir por color— mentía justo en la zona que se está mirando.
    */
    ok(dibujo.capas.includes('zonas-elegida-no-oficial'),
      'existe la capa del anillo punteado para la elegida no oficial',
      JSON.stringify(dibujo.capas));
  }

  /*
    Las DOS capas del anillo existen siempre; lo que decide cuál se ve es el filtro. Así que se
    mide lo que de verdad se PINTA —`queryRenderedFeatures` por capa— y no lo que está declarado:
    una capa declarada que no pinta nada no es una señal para nadie.
  */
  const anillos = await page.evaluate(() => {
    const nodo = document.querySelector('.lx-zonemap__lienzo');
    const m = nodo && nodo.__lxMapa;
    if (!m || !m.queryRenderedFeatures) return null;
    const cuenta = (capa) => {
      try { return m.queryRenderedFeatures({ layers: [capa] }).length; } catch { return -1; }
    };
    return { solido: cuenta('zonas-elegida'), punteado: cuenta('zonas-elegida-no-oficial') };
  });
  if (anillos) {
    ok(anillos.punteado > 0 && anillos.solido === 0,
      'y el anillo que se PINTA sobre la elegida es el punteado, no el sólido de una verificada',
      JSON.stringify(anillos));
  } else {
    console.log('  ··  SIN PROBAR: no se pudo consultar lo pintado por capa');
  }

  const rotulo = await page.evaluate(() => {
    const nodo = document.querySelector('.lx-zonemap__lienzo');
    const m = nodo && nodo.__lxMapa;
    if (!m || !m.querySourceFeatures) return null;
    const f = m.querySourceFeatures('zonas').find((x) => x.properties && x.properties.code === 'SJ-AMON');
    return f ? (f.properties.lxEtiqueta ?? null) : null;
  });
  if (rotulo !== null) {
    ok(/Barrio Amón/.test(rotulo), 'el rótulo lleva el nombre de la zona', JSON.stringify(rotulo));
    ok(/\d/.test(rotulo) && /\/h|min/.test(rotulo),
      'y la tarifa real que publica el servidor, no una escrita a mano',
      JSON.stringify(rotulo));
    ok(/DEMO · no oficial/.test(rotulo),
      'y dice DEMO · no oficial: el rótulo no deja creer que es un límite municipal',
      JSON.stringify(rotulo));
    console.log(`  ··  rótulo de Barrio Amón: ${JSON.stringify(rotulo)}`);
  } else {
    console.log('  ··  SIN PROBAR: la fuente no expuso la etiqueta');
  }

  const aviso = await page.locator('.lx-zonemap__noOficial').count();
  ok(aviso >= 1, 'y la pantalla avisa aparte de que no son límites oficiales', `avisos=${aviso}`);

  await page.evaluate(() => {
    document.querySelector('.lx-zonemap')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(900);
  const archivo = path.join(SALIDA, 'barrio-amon-si-se-publicara-390x844.png');
  await page.screenshot({ path: archivo });
  console.log(`  ··  captura: ${archivo}`);

  await navegador.close();
  console.log(fallos === 0 ? '\nsin fallos' : `\n${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
