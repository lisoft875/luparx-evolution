/**
 * El selector de «Tipo de vehículo» en un aparato de dedo (22-10-2026, urgente).
 *
 * <h2>El fallo que esta prueba existe para que no vuelva</h2>
 *
 * <p>En un iPhone, la lista propia del componente `Select` se abría y no se dejaba recorrer: al
 * arrastrar el dedo para bajar, el menú se cerraba. Con dos opciones —«Automóvil» y
 * «Motocicleta»— no se notaba nunca; con las ocho de la clasificación de carrocerías, la última
 * queda fuera de pantalla y <b>registrar una motocicleta era imposible desde un teléfono</b>.</p>
 *
 * <p>La corrección no es tocar el desplazamiento de ese componente: en un teléfono se usa el
 * `<select>` del sistema operativo, que se desplaza solo, no se cierra a destiempo y lo conoce
 * VoiceOver. Esta prueba comprueba eso de las dos maneras que importan: que el control ES un
 * `<select>` nativo, y que con él se puede <b>elegir y guardar Motocicleta</b>.</p>
 *
 * <h2>Y que el escritorio no cambió</h2>
 *
 * <p>La última sección vuelve a abrir el mismo formulario con un ratón y exige lo contrario: ahí
 * sigue mandando la lista propia (`role="combobox"` + `role="listbox"`), que es donde aporta y
 * donde el fallo no existe.</p>
 *
 *   cd frontend && node tests/responsive/selector-nativo.cjs
 */
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium, devices } = require(path.join(RAIZ, 'node_modules/playwright'));
const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = Number(process.env.PUERTO || 5198);
const BASE = `http://127.0.0.1:${PUERTO}`;
const SALIDA = process.env.SALIDA || path.join(RAIZ, '..', 'verificacion', 'selector-nativo');

/** Las ocho categorías que el formulario tiene que ofrecer, en su orden. */
const CATEGORIAS = ['Automóvil', 'Sedán', 'Hatchback', 'SUV', 'Pick-up', 'Miniván', 'Furgoneta', 'Motocicleta'];

/**
 * Teléfonos y tabletas reales, no un ancho inventado.
 *
 * <p>El iPhone SE entra porque es la pantalla más pequeña que el contrato cubre y donde antes
 * cabían menos opciones; el iPad porque `pointer: coarse` no es cuestión de tamaño —una tableta de
 * 1024 px tiene el mismo dedo que un teléfono de 320— y era la trampa fácil de este arreglo.</p>
 */
const APARATOS = [
  { nombre: 'iPhone SE', perfil: devices['iPhone SE'] },
  { nombre: 'iPhone 13', perfil: devices['iPhone 13'] },
  { nombre: 'Pixel 5', perfil: devices['Pixel 5'] },
  { nombre: 'iPad (gen 7)', perfil: devices['iPad (gen 7)'] },
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

async function abrirAgregar(page) {
  const dialogo = page.locator('[role=dialog]');
  for (let intento = 0; intento < 3; intento += 1) {
    await page.getByRole('button', { name: /^Agregar$/i }).first().click();
    try { await dialogo.waitFor({ state: 'visible', timeout: 4000 }); break; } catch { /* reintenta */ }
  }
  await page.waitForTimeout(500);
  return dialogo;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });
  let fallos = 0;
  let comprobaciones = 0;
  const ok = (cond, texto, detalle = '') => {
    comprobaciones += 1;
    if (cond) console.log(`  ok   ${texto}`);
    else { fallos += 1; console.log(`  ✗    ${texto}${detalle ? ' — ' + detalle : ''}`); }
  };

  try {
    for (const aparato of APARATOS) {
      console.log(`\n══ ${aparato.nombre} ══`);
      const contexto = await browser.newContext({ ...aparato.perfil });
      const page = await contexto.newPage();
      await entrar(page);
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Que el navegador se esté haciendo pasar por un aparato de dedo de verdad: si esto fuera
      // false, todo lo de abajo pasaría por el camino de escritorio y la prueba no probaría nada.
      const dedo = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
      ok(dedo, `${aparato.nombre}: el navegador emula puntero grueso`, String(dedo));

      const dialogo = await abrirAgregar(page);
      const nativo = dialogo.locator('select.lx-select--nativo').first();
      ok(await nativo.count() === 1, `${aparato.nombre}: «Tipo de vehículo» es un <select> del sistema`,
        `encontrados ${await dialogo.locator('select.lx-select--nativo').count()}`);
      ok(await dialogo.getByRole('combobox', { name: /Tipo de veh/i }).count() >= 1,
        `${aparato.nombre}: conserva su nombre accesible`);

      // TODAS las categorías, y en su orden. Antes la última era inalcanzable.
      const rotulos = (await nativo.locator('option').allTextContents()).map((s) => s.trim());
      ok(CATEGORIAS.every((c) => rotulos.includes(c)),
        `${aparato.nombre}: están las ocho categorías, Motocicleta incluida`, rotulos.join(' · '));
      ok(rotulos[rotulos.length - 1] === 'Motocicleta',
        `${aparato.nombre}: Motocicleta es la última y está presente`, rotulos.slice(-2).join(' · '));

      /*
        El control del sistema no se puede «desplazar» desde una prueba porque no lo dibuja la
        página: lo dibuja el sistema operativo. Lo que sí se puede —y es lo que de verdad importa—
        es elegir la opción que antes quedaba fuera de pantalla.
      */
      await nativo.selectOption({ label: 'Motocicleta' });
      await page.waitForTimeout(300);
      ok(await nativo.inputValue() === 'MOTORCYCLE:',
        `${aparato.nombre}: se puede ELEGIR Motocicleta`, await nativo.inputValue());

      const textos = dialogo.locator('input:not([type=number]):not([type=checkbox])');
      await textos.nth(0).fill(`NAT${aparato.nombre.replace(/\D/g, '').slice(0, 3) || '000'}`);
      const colorNativo = dialogo.locator('select.lx-select--nativo').nth(1);
      ok(await colorNativo.count() === 1, `${aparato.nombre}: «Color», con trece opciones, también es nativo`);
      await colorNativo.selectOption({ label: 'Naranja' });
      await page.waitForTimeout(200);

      await page.getByRole('button', { name: /^Agregar veh/i }).first().click();
      await page.waitForTimeout(1800);
      ok(await dialogo.count() === 0 || !(await dialogo.first().isVisible()),
        `${aparato.nombre}: se puede GUARDAR con Motocicleta elegida`,
        (await page.locator('[role=dialog] [role=alert], [role=dialog] .lx-alert').allTextContents()).join(' | '));

      const placa = `NAT${aparato.nombre.replace(/\D/g, '').slice(0, 3) || '000'}`;
      const fila = await page.evaluate((p) => {
        for (const f of document.querySelectorAll('.lx-vehiculo-fila')) {
          if ((f.querySelector('.lx-vehiculo-fila__placa')?.textContent || '').trim() !== p) continue;
          const hueco = f.querySelector('.lx-vehicle-thumb');
          const img = hueco?.querySelector('img');
          return {
            insignias: [...f.querySelectorAll('.lx-badge')].map((b) => (b.textContent || '').trim()),
            archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
            dibujo: hueco?.getAttribute('data-lx-dibujo') ?? null,
          };
        }
        return null;
      }, placa);
      ok(fila?.insignias.some((b) => /Motocicleta/.test(b)),
        `${aparato.nombre}: el vehículo queda guardado COMO motocicleta`, JSON.stringify(fila));
      ok(fila?.archivo === 'moto-naranja.webp' || fila?.dibujo === 'MOTORCYCLE',
        `${aparato.nombre}: y su tarjeta muestra una moto`, JSON.stringify(fila));

      // Y al volver a editarlo, la opción elegida sigue puesta: no se pierde al guardar.
      await page.getByRole('button', { name: new RegExp(`Opciones de ${placa}`, 'i') }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /^Editar$/i }).first().click();
      await page.waitForTimeout(800);
      const alEditar = await page.locator('[role=dialog] select.lx-select--nativo').first().inputValue();
      ok(alEditar === 'MOTORCYCLE:', `${aparato.nombre}: al EDITAR sigue en Motocicleta`, alEditar);

      await page.screenshot({ path: path.join(SALIDA, `${aparato.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
      await contexto.close();
    }

    console.log('\n══ escritorio: la lista propia no cambió ══');
    const escritorio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await escritorio.newPage();
    await entrar(page);
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const dedoEscritorio = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    ok(dedoEscritorio === false, 'escritorio: el puntero NO es grueso', String(dedoEscritorio));
    const dialogo = await abrirAgregar(page);
    ok(await dialogo.locator('select.lx-select--nativo').count() === 0,
      'escritorio: no se usa el <select> del sistema');
    const combo = page.getByRole('combobox', { name: /Tipo de veh/i }).first();
    await combo.click();
    await page.waitForTimeout(400);
    const opciones = (await page.locator('[role=listbox] [role=option]').allTextContents()).map((s) => s.trim());
    ok(CATEGORIAS.every((c) => opciones.includes(c)),
      'escritorio: la lista propia sigue ofreciendo las ocho', opciones.join(' · '));
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-1280.png') });
    await escritorio.close();

    console.log(`\n${comprobaciones} comprobaciones · ${fallos} fallos`);
    console.log(`capturas en ${SALIDA}`);
  } finally {
    await browser.close();
    await apagar();
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
