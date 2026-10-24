/**
 * El mapa base se dibuja SIN polígonos cuando el despliegue configuró un centro.
 *
 * <h2>Qué cierra esta prueba</h2>
 *
 * <p>La orden del 23-10-2026 pide calles debajo del selector de Zona «aun sin polígonos». El
 * componente sabe hacerlo desde ese día —la propiedad `centro`— pero hasta ahora ninguna pantalla
 * se la pasaba, porque no había de dónde sacar esa coordenada. Ahora sale de `VITE_MAP_CENTERS`,
 * que llena quien despliega. Esta prueba comprueba el camino COMPLETO: variable de entorno →
 * pantalla → componente → lienzo con el centro pedido, con el servidor publicando CERO
 * geometrías.</p>
 *
 * <p>Se levanta un servidor propio con la variable puesta, y la respuesta de geometrías se
 * sustituye por una colección vacía: así la única razón posible de que aparezca un mapa es el
 * centro configurado, y no un polígono que se haya colado.</p>
 *
 * <p>Las coordenadas de esta prueba son de PRUEBA y viven sólo acá. No se publican, no entran en
 * ningún catálogo y no son las que use ningún despliegue: lo que se mide es el mecanismo.</p>
 *
 *   node tests/responsive/mapa-centro-configurado.cjs
 */
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
/* El portal del ciudadano fija su puerto en su propia configuración de Vite: pasarle PORT no lo
   mueve, y el primer intento levantó en 5183 mientras la prueba esperaba en 5188. Se usa el suyo. */
const PUERTO = Number(process.env.PUERTO || 5183);
const PUERTO_API = Number(process.env.PUERTO_API || 5190);
const CENTRO = { lon: -84.0807, lat: 9.9333, zoom: 14 };
const SLUG = 'san-jose';

const ESTILO = {
  version: 8,
  name: 'prueba-local',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#1b2838' } }],
};

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

const esperar = async (p, ms) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await ocupado(p)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

(async () => {
  if (await ocupado(PUERTO)) {
    console.error(`✗ Ya hay algo escuchando en :${PUERTO}.`);
    process.exit(2);
  }
  const { levantarSimulado } = require('./servidor-simulado.cjs');
  const simulado = await levantarSimulado(PUERTO_API);

  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/citizen'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      VITE_USE_MOCKS: 'false',
      VITE_API_BASE_URL: `http://localhost:${simulado.puerto}`,
      VITE_BASE_PATH: '/',
      // Lo que esta prueba viene a comprobar. Con un trozo basura delante, a propósito: el
      // analizador tiene que saltárselo sin llevarse por delante la configuración buena.
      VITE_MAP_CENTERS:
        `basura;sin-dos-puntos;${SLUG}:${CENTRO.lon},${CENTRO.lat},${CENTRO.zoom};otra:999,999`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));

  const apagar = async () => {
    try { hijo.kill('SIGKILL'); } catch { /* ya no está */ }
    await simulado.cerrar();
  };

  if (!(await esperar(PUERTO, 90000))) {
    console.error('✗ El servidor no levantó:\n' + salida.join('').split('\n').slice(-12).join('\n'));
    await apagar();
    process.exit(1);
  }
  const BASE = `http://localhost:${PUERTO}`;

  const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  try {
    const ctx = await navegador.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-CR',
    });

    /*
      UN SOLO manejador, y no dos, porque Playwright ejecuta el ÚLTIMO que coincide.

      El primer intento registraba el de las geometrías y después un comodín: el comodín ganaba,
      dejaba pasar la petición al simulador y llegaban los polígonos de verdad. La prueba daba
      «mapa dibujado» en verde… por la razón equivocada, que es la peor forma de pasar. Se notó
      porque el zoom salía 12.02 —el de un `fitBounds` sobre polígonos— en vez del 14 configurado.
    */
    await ctx.route('**/*', (route) => {
      const url = route.request().url();
      // Cero geometrías: si aparece un mapa, es por el centro y por nada más.
      if (/\/parking\/zones\/geojson/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/geo+json',
          body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
        });
      }
      if (url.startsWith(BASE) || url.startsWith(`http://localhost:${simulado.puerto}`)
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
    await page.fill('input[type=email]', 'citizen@example.com');
    await page.fill('input[type=password]', 'Password123!');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2200);
    const ficha = page.locator('button, a').filter({ hasText: /San José/ }).first();
    if (await ficha.count()) { await ficha.click(); await page.waitForTimeout(1800); }
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    console.log('\n══ Sin un solo polígono, con centro configurado ══');

    const llegaron = await page.evaluate(() => {
      const n = document.querySelector('.lx-zonemap__lienzo');
      return { lienzo: Boolean(n), canvas: Boolean(n && n.querySelector('canvas')) };
    });
    ok(llegaron.lienzo && llegaron.canvas,
      'se dibuja el mapa base aunque el servidor no publique ninguna geometría',
      JSON.stringify(llegaron));

    const centro = await page.evaluate(() => {
      const n = document.querySelector('.lx-zonemap__lienzo');
      const m = n && n.__lxMapa;
      if (!m || !m.getCenter) return null;
      const c = m.getCenter();
      return { lon: c.lng, lat: c.lat, zoom: m.getZoom() };
    });
    if (centro) {
      ok(Math.abs(centro.lon - (-84.0807)) < 0.3 && Math.abs(centro.lat - 9.9333) < 0.3,
        'y queda centrado donde dice la configuración, no en el país',
        JSON.stringify(centro));
      ok(Math.abs(centro.zoom - 14) < 1.5, 'con el zoom configurado', `zoom ${centro.zoom}`);
    } else {
      ok(false, 'la costura __lxMapa debería estar disponible para medir el centro');
    }

    ok(await page.locator('.lx-zonemap__nota').count() === 1,
      'y la nota sigue diciendo que no hay zonas dibujadas: hay calles, no límites');
    ok(await page.locator('[aria-label="Zona"]').count() === 1,
      'la zona se sigue pudiendo elegir en la lista');

    /*
      Y el mapa va DEBAJO de los dos campos, que es el orden que fija el boceto aprobado: tener
      calles no sirve de nada si se las pone en otro sitio.
    */
    const orden = await page.evaluate(() => {
      const y = (sel) => {
        const n = document.querySelector(sel);
        return n ? Math.round(n.getBoundingClientRect().top + window.scrollY) : null;
      };
      return {
        numero: y('input[inputmode=numeric], input[inputmode=text]'),
        zona: y('[aria-label="Zona"]'),
        mapa: y('.lx-zonemap__lienzo'),
      };
    });
    ok(orden.numero !== null && orden.zona !== null && orden.mapa !== null
      && orden.numero < orden.zona && orden.zona < orden.mapa,
      'y el orden sigue siendo número de parqueo → zona → mapa',
      JSON.stringify(orden));

    await page.screenshot({
      path: path.join(__dirname, 'capturas', 'mapa-base', 'centro-configurado-390x844.png'),
    });
    await ctx.close();
  } finally {
    await navegador.close();
    await apagar();
  }

  console.log(fallos === 0 ? '\nsin fallos' : `\n${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
