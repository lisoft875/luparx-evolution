/**
 * El sello de compilación al pie de la vista, mirado en el navegador (23-10-2026).
 *
 * <p>La regla que de verdad importa —que en producción no se dibuja— se comprueba sin navegador en
 * `packages/ui/src/__checks__/selloDeCompilacion.check.mjs`, porque es lógica pura y ahí se puede
 * barrer una lista de entornos mal escritos que un arnés no podría recorrer. Esto comprueba lo
 * otro: que <b>se vea</b>, que diga lo que tiene que decir, que esté en todas las pantallas y que
 * no se lleve por delante la barra de navegación ni el ancho del teléfono.</p>
 *
 *   cd frontend && node tests/responsive/sello-compilacion.cjs
 */
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = Number(process.env.PUERTO || 5214);
const BASE = `http://127.0.0.1:${PUERTO}`;
const SALIDA = process.env.SALIDA || path.join(RAIZ, '..', 'verificacion', 'sello-compilacion');

/** Las pantallas del Ciudadano donde se mira, que son de formas distintas a propósito. */
const RUTAS = ['/', '/vehicles', '/wallet', '/fines', '/park', '/profile'];

const TAMANOS = [
  { nombre: 'movil-320', width: 320, height: 568, dedo: true },
  { nombre: 'movil-390', width: 390, height: 844, dedo: true },
  { nombre: 'tableta-768', width: 768, height: 1024, dedo: true },
  { nombre: 'escritorio-1280', width: 1280, height: 900, dedo: false },
];

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

async function levantar() {
  if (await puertoOcupado(PUERTO)) return async () => {};
  const hijo = spawn('npm',
    ['run', 'dev', '--workspace=@luparx/citizen', '--', '--port', String(PUERTO), '--strictPort', 'false'], {
      cwd: RAIZ,
      detached: true,
      env: {
        ...process.env,
        VITE_USE_MOCKS: 'true',
        VITE_BASE_PATH: '/',
        // Lo que pondría un despliegue de staging. Sin esto, el servidor de desarrollo asume
        // `local`, que también muestra sello; se declara para que la prueba mida lo que se publica.
        LUPARX_ENVIRONMENT: 'staging',
        LUPARX_BUILD: 'abc1234',
        LUPARX_BUILT_AT: new Date().toISOString(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  for (let i = 0; i < 90; i += 1) {
    if (await puertoOcupado(PUERTO)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return async () => { try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ } };
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

/** Lo que el sello dice y dónde cae, medido en el navegador. */
const MIRAR = () => {
  const s = document.querySelector('.lx-sello');
  if (!s) return null;
  const r = s.getBoundingClientRect();
  const barra = document.querySelector('.lx-bottom-tab-bar');
  const rb = barra ? barra.getBoundingClientRect() : null;
  return {
    texto: (s.textContent || '').replace(/\s+/g, ' ').trim(),
    consecutivo: s.getAttribute('data-lx-sello'),
    entorno: s.getAttribute('data-lx-entorno'),
    titulo: s.getAttribute('title'),
    oculto: s.getAttribute('aria-hidden'),
    derecha: Math.round(r.right),
    abajo: Math.round(r.bottom),
    vw: window.innerWidth,
    // Si lo tapa la barra de navegación inferior, que es fija.
    tapadoPorLaBarra: rb ? r.top >= rb.top && r.bottom > rb.top : false,
    desborde: Math.round(document.documentElement.scrollWidth - window.innerWidth),
  };
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const apagar = await levantar();
  const navegador = await chromium.launch({ executablePath: EJECUTABLE });
  try {
    const ctx = await navegador.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-CR',
    });
    const page = await ctx.newPage();
    await entrar(page);

    console.log('\n══ 1 · qué dice el sello ══');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const sello = await page.evaluate(MIRAR);
    ok(sello !== null, 'el sello está en la pantalla');
    if (!sello) throw new Error('sin sello, no hay nada más que medir');
    console.log(`     ·· «${sello.texto}»`);
    ok(/^\d{8}-\d{4}$/.test(String(sello.consecutivo)),
      'el consecutivo tiene la forma AAAAMMDD-hhmm', String(sello.consecutivo));
    ok(sello.entorno === 'staging', 'dice el entorno del despliegue', String(sello.entorno));
    ok(sello.texto.includes('abc1234'), 'y el commit con el que se compiló', sello.texto);
    ok(sello.texto.includes(String(sello.consecutivo)), 'el consecutivo se lee en el texto');
    /*
      El consecutivo tiene que corresponder a AHORA: es lo único que lo hace servir para saber si
      el despliegue de hace cinco minutos salió. Se compara con el reloj de esta máquina con holgura
      de un día, que es lo que tolera una corrida que cruza la medianoche.
    */
    const hoy = new Date();
    const dos = (n) => String(n).padStart(2, '0');
    const esperadoHoy = `${hoy.getFullYear()}${dos(hoy.getMonth() + 1)}${dos(hoy.getDate())}`;
    ok(Math.abs(Number(String(sello.consecutivo).slice(0, 8)) - Number(esperadoHoy)) <= 1,
      'el consecutivo es de hoy, no de una compilación vieja',
      `${sello.consecutivo} contra ${esperadoHoy}`);
    ok(sello.oculto === 'true', 'el lector de pantalla no lo lee: es información de obra');
    ok(String(sello.titulo || '').includes('abc1234')
      && String(sello.titulo || '').includes('staging'),
      'el title lleva la fecha completa, el commit y el entorno', String(sello.titulo));

    console.log('\n══ 2 · está en todas las pantallas ══');
    for (const ruta of RUTAS) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1300);
      const s = await page.evaluate(MIRAR);
      ok(s !== null && s.consecutivo === sello.consecutivo,
        `${ruta}: el mismo sello`, s ? String(s.consecutivo) : 'no hay sello');
    }
    await ctx.close();

    console.log('\n══ 3 · no estorba ══');
    for (const tam of TAMANOS) {
      const c = await navegador.newContext({
        viewport: { width: tam.width, height: tam.height },
        hasTouch: tam.dedo, isMobile: tam.dedo, locale: 'es-CR',
      });
      const p = await c.newPage();
      await entrar(p);
      await p.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await p.waitForTimeout(500);
      const s = await p.evaluate(MIRAR);
      ok(s !== null, `${tam.nombre}: el sello está`);
      if (s) {
        ok(s.desborde <= 0, `${tam.nombre}: no desborda a lo ancho`, `desborde ${s.desborde}px`);
        ok(s.derecha <= s.vw + 1, `${tam.nombre}: no se sale por la derecha`,
          `${s.derecha} > ${s.vw}`);
        ok(!s.tapadoPorLaBarra, `${tam.nombre}: la barra de navegación no lo tapa`);
      }
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
  console.log('\nLo que esto NO comprueba: que en producción no se dibuje. Eso es lógica pura y se'
    + '\ncomprueba en packages/ui/src/__checks__/selloDeCompilacion.check.mjs, donde se puede'
    + '\nbarrer la lista de entornos mal escritos que un navegador no podría recorrer.');
  process.exit(fallos === 0 ? 0 : 1);
})();
