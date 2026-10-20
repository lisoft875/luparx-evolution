/**
 * Barrido móvil del Ciudadano: desbordamiento, superposición con la navegación inferior y blancos
 * táctiles, en las trece rutas y los cinco tamaños que pide la orden del 20-10-2026.
 *
 * Mide, no mira. Y mide DESPUÉS de desplazarse hasta el final, porque la pregunta que importa no
 * es si algo está tapado al abrir la pantalla sino si se puede llegar a todo.
 *
 *   cd frontend && node ../evidencia4/barrido-movil.cjs
 */
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

/** La raíz del frontend, deducida de dónde vive este archivo: tests/responsive/<este>. */
const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

const PUERTO = 5183;
const BASE = `http://localhost:${PUERTO}`;
// En la Mac, Playwright encuentra su propio Chromium; en el contenedor de pruebas hay que
// señalarlo con PW_CHROMIUM, igual que hacen los demás arneses de esta carpeta.
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;

const TAMANOS = [
  { nombre: '320x568', width: 320, height: 568 },
  { nombre: '375x667', width: 375, height: 667 },
  { nombre: '390x844', width: 390, height: 844 },
  { nombre: '393x852', width: 393, height: 852 },
  { nombre: '430x932', width: 430, height: 932 },
];

const RUTAS_PUBLICAS = ['/login', '/register', '/forgot-password'];
const RUTAS_PRIVADAS = ['/', '/park', '/wallet', '/vehicles', '/fines', '/movements',
  '/notifications', '/profile', '/more', '/help'];

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

/** Lo que se mide en cada ruta, ya desplazado hasta el final. */
const AUDITAR = () => {
  const doc = document.documentElement;
  const desborda = doc.scrollWidth > window.innerWidth + 1;

  // Quién se sale: el culpable concreto, no «algo se sale».
  const culpables = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    })
    .slice(0, 4)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`
      + `(${Math.round(el.getBoundingClientRect().left)}→${Math.round(el.getBoundingClientRect().right)})`);

  // Lo que la navegación inferior tapa: se pregunta por el punto medio de cada control.
  const nav = document.querySelector('nav.lx-bottom-nav, nav[class*=bottom], .lx-bottom-nav');
  const rNav = nav ? nav.getBoundingClientRect() : null;
  const tapados = !rNav ? [] : [...document.querySelectorAll('button, a, input, select, textarea')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (nav.contains(el)) return false;
      const medioY = r.top + r.height / 2;
      return medioY > rNav.top && medioY < rNav.bottom;
    })
    .slice(0, 4)
    .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || '').trim().slice(0, 18)}`);

  /*
    Blancos táctiles por debajo de 44.

    Lo que se mide es el área que de verdad recibe el toque, no la caja del elemento: una casilla
    de 20 px dentro de una <label> de 44 px se acierta tocando cualquier punto de la etiqueta, y
    marcarla en rojo sería medir mal y obligarme a explicar un falso rojo en cada informe. Cuando
    un control vive dentro de una etiqueta, manda la etiqueta.
  */
  const areaDeToque = (el) => {
    const etiqueta = el.closest('label');
    const base = (etiqueta && etiqueta !== el ? etiqueta : el).getBoundingClientRect();
    // Un control puede ampliar su zona sensible con un pseudo-elemento sin crecer de alto —es lo
    // que hace la insignia de municipalidad, porque agrandar la barra superior rompe el mapa—.
    // La caja no lo refleja, el comportamiento sí: se pregunta quién recibe el toque 21 px por
    // encima y por debajo del centro, que es el borde de una banda de 44.
    if (base.height >= 44) return base;
    const x = Math.round(base.left + base.width / 2);
    const medio = base.top + base.height / 2;
    const recibe = (y) => {
      const bajo = document.elementFromPoint(x, Math.round(y));
      return Boolean(bajo) && (bajo === el || el.contains(bajo) || bajo.contains(el));
    };
    if (recibe(medio - 21) && recibe(medio + 21)) {
      return { ...base.toJSON(), height: 44, top: medio - 22, bottom: medio + 22 };
    }
    return base;
  };
  const chicos = [...document.querySelectorAll('button, a[href], [role=button], input, select')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (el.type === 'hidden') return false;
      const area = areaDeToque(el);
      return area.height < 44 || area.width < 44;
    })
    .slice(0, 5)
    .map((el) => {
      const r = areaDeToque(el);
      return `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 16)}`
        + `:${Math.round(r.height)}x${Math.round(r.width)}`;
    });

  return { desborda, ancho: doc.scrollWidth, viewport: window.innerWidth, culpables, tapados, chicos };
};

(async () => {
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });

  for (const tam of TAMANOS) {
    console.log(`\n══ ${tam.nombre} ══`);
    const ctx = await browser.newContext({
      viewport: { width: tam.width, height: tam.height }, locale: 'es-CR',
      hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });

    const revisar = async (ruta) => {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1700);
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' }));
      await page.waitForTimeout(500);
      const m = await page.evaluate(AUDITAR);
      ok(!m.desborda, `${tam.nombre} ${ruta}: sin desplazamiento lateral`,
        `${m.ancho} > ${m.viewport} · ${m.culpables.join(', ')}`);
      ok(m.tapados.length === 0, `${tam.nombre} ${ruta}: nada queda bajo la navegación inferior`,
        m.tapados.join(', '));
      ok(m.chicos.length === 0, `${tam.nombre} ${ruta}: todos los controles llegan a 44 px`,
        m.chicos.join(', '));
    };

    for (const ruta of RUTAS_PUBLICAS) await revisar(ruta);

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

    for (const ruta of RUTAS_PRIVADAS) await revisar(ruta);
    await ctx.close();
  }

  await browser.close();
  await apagar();
  console.log(`\n${pasadas + fallos} comprobaciones · ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
