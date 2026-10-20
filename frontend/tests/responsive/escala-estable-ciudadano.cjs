/**
 * El caso crítico de la orden del 20-10-2026: navegar en círculo tocando campos y comprobar que la
 * escala NO se mueve.
 *
 *   Inicio → Estacionar → Vehículos → Billetera → Multas → Inicio, tres vueltas.
 *
 * <h2>Qué se mide y qué NO</h2>
 *
 * Lo que se mide es la escala de presentación: `visualViewport.scale` y la relación entre el ancho
 * del viewport visual y el del layout. Si Safari ampliara, las dos cosas cambiarían y no volverían
 * solas. Chromium no amplía al enfocar —esa ampliación es de Safari—, así que esta prueba NO
 * demuestra el comportamiento de Safari: demuestra que la aplicación no se descuadra sola al
 * navegar, que es la otra mitad del reporte.
 *
 * La parte de Safari se ataca en la causa, no en el síntoma, y se verifica midiendo el tamaño de
 * letra de los campos (`medir-campos.cjs`): por debajo de 16 px Safari amplía SIEMPRE, por encima
 * no amplía NUNCA. Es una regla del motor, no una probabilidad.
 *
 *   cd frontend && node ../evidencia4/escala-estable.cjs
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

const VUELTA = ['/', '/park', '/vehicles', '/wallet', '/fines'];
const VUELTAS = 3;

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

const ESCALA = () => ({
  escala: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : 1,
  anchoVisual: window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth,
  anchoLayout: document.documentElement.clientWidth,
  anchoDocumento: document.documentElement.scrollWidth,
});

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

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    // Enfocar y escribir en los campos del ingreso: es el primer sitio donde Safari ampliaría.
    await page.fill('input[type=email]', 'citizen@example.com');
    await page.fill('input[type=password]', 'Password123!');
    const base = await page.evaluate(ESCALA);
    await page.click('button[type=submit]');
    await page.waitForTimeout(2600);
    if (/select-tenant/.test(page.url())) {
      const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
      if (await f.count()) { await f.click(); await page.waitForTimeout(1600); }
    }

    for (let vuelta = 1; vuelta <= VUELTAS; vuelta += 1) {
      for (const ruta of VUELTA) {
        await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(1200);

        // Interactuar de verdad: enfocar el primer campo que haya, escribir y salir.
        const campo = page.locator('input:not([type=hidden]):not([type=checkbox])').first();
        if (await campo.count()) {
          await campo.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(250);
          await campo.type('00', { delay: 20 }).catch(() => {});
          await page.waitForTimeout(250);
          await page.evaluate(() => document.activeElement && document.activeElement.blur());
          await page.waitForTimeout(250);
        }
        // Y desplazarse hasta el final, que es donde el reporte decía que se descuadraba.
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
        await page.waitForTimeout(350);

        const m = await page.evaluate(ESCALA);
        ok(m.escala === base.escala, `${tam.nombre} vuelta ${vuelta} ${ruta}: la escala no cambió`,
          `${base.escala} → ${m.escala}`);
        ok(m.anchoLayout === base.anchoLayout,
          `${tam.nombre} vuelta ${vuelta} ${ruta}: el ancho de maquetación no cambió`,
          `${base.anchoLayout} → ${m.anchoLayout}`);
        ok(m.anchoDocumento <= m.anchoLayout + 1,
          `${tam.nombre} vuelta ${vuelta} ${ruta}: el documento no excede la ventana`,
          `${m.anchoDocumento} > ${m.anchoLayout}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  await apagar();
  console.log(`\n${pasadas + fallos} comprobaciones · ${fallos} fallos`);
  console.log('·· SIN PROBAR: Safari iOS real. Chromium no amplía al enfocar; esta prueba cubre la');
  console.log('   estabilidad de la maquetación, no el comportamiento del motor de Apple.');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
