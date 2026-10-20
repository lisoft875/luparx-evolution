/**
 * ¿Qué tamaño de letra tienen los campos del Ciudadano?
 *
 * Safari en iOS hace zoom AL ENFOCAR cualquier <input>, <select> o <textarea> cuyo tamaño de letra
 * sea menor a 16 px, y —esto es lo que convierte un detalle en un defecto— NO deshace ese zoom al
 * salir del campo. La persona queda con toda la aplicación ampliada y tiene que achicar a mano.
 *
 *   cd frontend && node ../evidencia4/medir-campos.cjs
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

const RUTAS = ['/login', '/register', '/forgot-password', '/', '/park', '/wallet', '/vehicles',
  '/fines', '/movements', '/notifications', '/profile', '/more', '/help'];

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

/** Todo lo que Safari puede ampliar: controles de verdad, no botones con pinta de control. */
const MEDIR = () => {
  const controles = [...document.querySelectorAll('input, select, textarea')];
  return controles.map((el) => {
    const est = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      etiqueta: el.tagName.toLowerCase(),
      tipo: el.getAttribute('type') || '',
      nombre: (el.getAttribute('aria-label') || el.getAttribute('placeholder')
        || el.getAttribute('name') || el.id || '').slice(0, 28),
      px: Math.round(parseFloat(est.fontSize) * 10) / 10,
      visible: r.width > 0 && r.height > 0,
      clase: el.className.split(' ').filter((c) => c.startsWith('lx-')).slice(0, 2).join(' '),
    };
  });
};

(async () => {
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-CR', hasTouch: true, isMobile: true,
  });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
  });

  const chicos = [];
  let total = 0;

  const revisar = async (ruta) => {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1800);
    const controles = await page.evaluate(MEDIR);
    for (const c of controles.filter((x) => x.visible)) {
      total += 1;
      const marca = c.px < 16 ? '  ✗ ' : '  ok';
      if (c.px < 16) chicos.push({ ruta, ...c });
      console.log(`${marca} ${ruta.padEnd(18)} ${c.etiqueta}${c.tipo ? '[' + c.tipo + ']' : ''}`
        + ` ${String(c.px).padStart(5)}px  ${c.nombre}  ${c.clase}`);
    }
  };

  console.log('── Antes de entrar ──');
  for (const ruta of ['/login', '/register', '/forgot-password']) await revisar(ruta);

  // Entrar y recorrer el resto.
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

  console.log('\n── Con sesión ──');
  for (const ruta of RUTAS.slice(3)) await revisar(ruta);

  // El paso 2 de Estacionar y la hoja de recarga esconden más campos.
  console.log('\n── Campos que viven detrás de una interacción ──');
  await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const bahia = page.locator('input[inputmode=numeric], input[inputmode=text]').first();
  if (await bahia.count()) { await bahia.fill('0001'); await page.waitForTimeout(900); }
  const seguir = page.getByRole('button', { name: /^Continuar$/i }).first();
  if (await seguir.count()) { await seguir.click(); await page.waitForTimeout(1800); }
  await revisar(page.url().replace(BASE, '') + ' (paso 2)');

  await browser.close();
  await apagar();

  console.log(`\n${total} controles visibles medidos · ${chicos.length} por debajo de 16 px`);
  if (chicos.length) {
    const porClase = {};
    for (const c of chicos) porClase[`${c.clase || c.etiqueta} @ ${c.px}px`] = (porClase[`${c.clase || c.etiqueta} @ ${c.px}px`] || 0) + 1;
    console.log('\nAgrupados:');
    for (const [k, n] of Object.entries(porClase)) console.log(`  ${String(n).padStart(3)} × ${k}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
