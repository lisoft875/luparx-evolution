/**
 * La placa 5678 de la queja del 22-10-2026, mirada en el navegador.
 *
 * <p>No es una prueba de regresión: es un <b>banco de comparación</b>. Registra la misma moto negra
 * que Javier ve en staging y deja constancia, al tamaño real del teléfono, de qué archivo carga la
 * casilla y cuánto de la casilla ocupa lo que se ve. Se corre dos veces —con las fotografías de
 * moto en la carpeta y sin ellas— y las dos capturas se comparan.</p>
 *
 * <p>La fotografía que se usa en la corrida «con fotos» <b>no se despliega</b>: está en la carpeta
 * sólo mientras dura la medición, para poder enseñar a tamaño real por qué no sirve.</p>
 *
 *   cd frontend && node tests/responsive/moto-5678.cjs
 */
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = Number(process.env.PUERTO || 5207);
const BASE = `http://127.0.0.1:${PUERTO}`;
const ETIQUETA = process.env.ETIQUETA || 'sin-fotos';
const SALIDA = process.env.SALIDA || path.join(RAIZ, '..', 'verificacion', 'moto-5678');

/** La moto de la queja, y un automóvil del mismo color al lado para poder comparar tamaños. */
const CASOS = [
  { placa: 'ABC123', categoria: /^Sedán$/, color: /^Negro$/ },
  { placa: '5678', categoria: /^Motocicleta$/, color: /^Negro$/ },
];

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
      cwd: RAIZ, detached: true, env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
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

/** Sirve para el desplegable propio y para el `<select>` del sistema. */
async function elegir(page, campo, opcion) {
  const caja = page.getByRole('combobox', { name: campo }).first();
  await caja.waitFor({ state: 'visible', timeout: 10000 });
  if (await caja.evaluate((n) => n.tagName) === 'SELECT') {
    const valor = await caja.evaluate((n, patron) => {
      const re = new RegExp(patron.slice(1, patron.lastIndexOf('/')), patron.slice(patron.lastIndexOf('/') + 1));
      const o = [...n.options].find((x) => re.test(x.textContent.trim()));
      return o ? o.value : null;
    }, String(opcion));
    await caja.selectOption(valor);
  } else {
    await caja.click();
    await page.waitForTimeout(350);
    await page.locator('[role=listbox] [role=option]').filter({ hasText: opcion }).first().click();
  }
  await page.waitForTimeout(350);
}

async function registrar(page, caso) {
  const dialogo = page.locator('[role=dialog]');
  for (let intento = 0; intento < 3; intento += 1) {
    await page.getByRole('button', { name: /^Agregar$/i }).first().click();
    try { await dialogo.waitFor({ state: 'visible', timeout: 4000 }); break; } catch { /* reintenta */ }
  }
  await page.waitForTimeout(500);
  await dialogo.locator('input:not([type=number]):not([type=checkbox])').nth(0).fill(caso.placa);
  await elegir(page, /Tipo de veh/i, caso.categoria);
  await elegir(page, /^Color$/i, caso.color);
  await page.getByRole('button', { name: /^Agregar veh/i }).first().click();
  await page.waitForTimeout(1600);
  if (await dialogo.count() > 0 && await dialogo.first().isVisible()) {
    const aviso = await page.locator('[role=dialog] .lx-alert, [role=dialog] [role=alert]').allTextContents();
    throw new Error(`no se pudo registrar ${caso.placa}. ${aviso.join(' | ')}`);
  }
}

/** Qué dibuja cada casilla y cuánto de ella ocupa de verdad lo que se ve. */
const AUDITAR = () => [...document.querySelectorAll('.lx-vehiculo-fila')].map((f) => {
  const hueco = f.querySelector('.lx-vehicle-thumb');
  const img = hueco ? hueco.querySelector('img') : null;
  const caja = hueco ? hueco.getBoundingClientRect() : null;
  let anchoVisible = null;
  if (img && img.naturalWidth > 0 && caja) {
    // `object-fit: contain`: lo pintado conserva la razón del archivo dentro de la casilla.
    const rArchivo = img.naturalWidth / img.naturalHeight;
    const rCasilla = caja.width / caja.height;
    anchoVisible = rArchivo >= rCasilla ? caja.width : caja.height * rArchivo;
  }
  return {
    placa: (f.querySelector('.lx-vehiculo-fila__placa')?.textContent || '').trim(),
    muestra: img ? 'foto' : (hueco && hueco.querySelector('svg') ? 'dibujo' : 'nada'),
    archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
    cargo: img ? img.naturalWidth > 0 : null,
    natural: img ? `${img.naturalWidth}×${img.naturalHeight}` : null,
    dibujo: hueco ? hueco.getAttribute('data-lx-dibujo') : null,
    casilla: caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : null,
    ocupaAncho: anchoVisible === null ? null : `${Math.round((anchoVisible / caja.width) * 100)}%`,
  };
});

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const apagar = await levantar();
  const navegador = await chromium.launch({ executablePath: EJECUTABLE });
  const fallos = [];
  try {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await entrar(page);
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    for (const caso of CASOS) await registrar(page, caso);
    await page.waitForTimeout(1200);

    const filas = await page.evaluate(AUDITAR);
    const moto = filas.find((f) => f.placa === '5678');
    const carro = filas.find((f) => f.placa === 'ABC123');
    console.log(`\n[${ETIQUETA}]`);
    for (const f of [carro, moto]) {
      if (!f) { fallos.push('falta una fila'); continue; }
      console.log(`  ${f.placa.padEnd(8)} ${f.muestra.padEnd(7)} ${String(f.archivo || f.dibujo).padEnd(20)}`
        + ` natural ${String(f.natural || '—').padEnd(9)} casilla ${f.casilla} ocupa ${f.ocupaAncho || '—'} del ancho`);
    }

    await page.screenshot({ path: path.join(SALIDA, `pantalla-${ETIQUETA}.png`) });
    const filaCarro = page.locator('.lx-vehiculo-fila').filter({ hasText: 'ABC123' }).first();
    await filaCarro.screenshot({ path: path.join(SALIDA, `fila-carro-${ETIQUETA}.png`) });
    const fila5678 = page.locator('.lx-vehiculo-fila').filter({ hasText: '5678' }).first();
    await fila5678.screenshot({ path: path.join(SALIDA, `fila-5678-${ETIQUETA}.png`) });
    fs.writeFileSync(path.join(SALIDA, `medida-${ETIQUETA}.json`), JSON.stringify(filas, null, 2));
    await ctx.close();
  } catch (e) {
    fallos.push(String(e && e.message ? e.message : e));
  } finally {
    await navegador.close();
    await apagar();
  }
  if (fallos.length) { console.error('\nFALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
  console.log(`\ncapturas en ${SALIDA}`);
})();
