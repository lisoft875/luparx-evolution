/**
 * Fiscalización en tableta y teléfono: lo que las dos fotos de staging del 24-10-2026 señalaron.
 *
 * <h2>De dónde sale cada afirmación</h2>
 *
 * <p>Javier fotografió un iPad en vertical sobre staging y marcó cuatro cosas. Este arnés cubre
 * las que se REPRODUJERON en Chromium, con su medida, y deja fuera —a propósito y por escrito—
 * las que no:</p>
 *
 * <ul>
 *   <li><b>Reproducido:</b> el formulario y la lista se estiraban de borde a borde en 768px.
 *       `.lx-inspector-main` medía 768 exactos: los 960 del tope son la regla de tablet APAISADA
 *       y en vertical nunca llegaban a aplicar.</li>
 *   <li><b>Reproducido:</b> «Todos los estados» salía como «Todos los esta…». La rejilla de
 *       filtros tenía un piso de 150px por columna; a 768 entraban cuatro columnas de 163 y esa
 *       opción necesita 146 de texto más flecha y relleno.</li>
 *   <li><b>Reproducido:</b> «Aplicar» quedaba de 100px pegado al borde, compartiendo celda con
 *       los tres campos.</li>
 *   <li><b>NO reproducido:</b> la barra inferior en mitad del formulario. En Chromium a 768×1024
 *       la barra queda en 953–1024 y SIGUE ahí tras bajar del todo. Es un defecto de Safari y
 *       este entorno no tiene WebKit, así que el arnés mide lo que sí puede medir —que la barra
 *       es fija, que está pegada abajo y que no tapa el último control— y Safari queda como
 *       pendiente declarado, no como algo probado.</li>
 *   <li><b>NO reproducido:</b> el azul brillante. En Chromium las superficies salen navy
 *       (`--lx-bg` #06172b, `--lx-surface` #0b2941). Se mide el color REAL de la tarjeta para que,
 *       si algún día un cambio de paleta lo aclara, el arnés lo diga.</li>
 * </ul>
 *
 * <h2>Cómo correrlo</h2>
 *
 * <pre>
 *   cd ~/Development/Proyectos/luparx-evolution/frontend
 *   MOCKS=1 node tests/responsive/fiscalizacion-tableta.cjs
 * </pre>
 *
 * <p>Levanta el portal de fiscalización contra el transporte simulado y lo apaga al terminar. No
 * emite ninguna boleta: el arnés NUNCA pulsa «Emitir boleta».</p>
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const net = require('node:net');

const RAIZ = join(__dirname, '..', '..');
const PUERTO = Number(process.env.PUERTO || 5193);
const BASE = process.env.BASE || `http://localhost:${PUERTO}`;
const RUTA = /localhost|127\.0\.0\.1/.test(BASE) ? '' : '/inspector';
const CAPTURAS = join(__dirname, 'capturas', 'fiscalizacion-tableta');

function cuentaSimulada() {
  const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');
  const fila = readme.split('\n').find((l) => /^\|\s*inspector\s*\|/.test(l));
  if (!fila) throw new Error('No encontré la fila «inspector» en la tabla de cuentas de frontend/README.md.');
  const celdas = fila.split('|').map((c) => c.trim());
  const correo = celdas.find((c) => c.includes('@'));
  const clave = celdas[celdas.indexOf(correo) + 1];
  if (!correo || !clave) throw new Error('La tabla de cuentas de frontend/README.md no tiene el formato esperado.');
  return { correo, clave };
}
let CUENTA = process.env.CUENTA || '';
let PASS = process.env.PASS || '';
if (!PASS) {
  const c = cuentaSimulada();
  CUENTA = CUENTA || c.correo;
  PASS = c.clave;
}

/* Los seis que pide la lista de Fase 6, más los dos móviles que la guía del proyecto exige. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 844 },
  { nombre: 'tableta vertical', width: 768, height: 1024, tabletaVertical: true },
  { nombre: 'tableta apaisada', width: 1024, height: 768 },
  { nombre: 'portátil', width: 1366, height: 768 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];

/* Las seis pantallas del boceto, con la ruta real de cada una. */
const PANTALLAS = [
  { clave: 'consulta', ruta: '/', nombre: '1 · Consulta (inicio)' },
  { clave: 'busqueda', ruta: '/lookup', nombre: '2 · Búsqueda de vehículo' },
  { clave: 'boleta', ruta: '/cite', nombre: '4 · Emitir boleta' },
  { clave: 'misboletas', ruta: '/citations', nombre: '5 · Mis boletas' },
  { clave: 'pendientes', ruta: '/pending', nombre: '6 · Pendientes / enviar' },
];

let fallos = 0;
let saltadas = 0;
const ok = (c, bien, mal = '') => {
  if (c) console.log(`  ok  ${bien}`);
  else { fallos += 1; console.log(`  ✗   ${bien}${mal ? `\n        ${mal}` : ''}`); }
};
const salta = (motivo) => { saltadas += 1; console.log(`  ··  SIN PROBAR: ${motivo}`); };

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
async function levantarServidor() {
  if (await puertoOcupado(PUERTO)) {
    console.log(`  ··  ya hay algo escuchando en :${PUERTO}; se usa eso`);
    return () => {};
  }
  console.log(`  ··  levantando fiscalización en :${PUERTO} con transporte simulado…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/inspector', '--', '--port', String(PUERTO)], {
    cwd: RAIZ,
    env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor no llegó a escuchar en 90 s:\n' + salida.join('').split('\n').slice(-12).join('\n'));
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
    process.exit(1);
  }
  return () => { try { hijo.kill('SIGTERM'); } catch { /* ya no está */ } };
}

async function entrar(page) {
  await page.goto(`${BASE}${RUTA}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2800);
  if (await page.locator('input[type=password]').count()) {
    console.error('✗ Sigue en el login.');
    process.exit(1);
  }
}

/** Todo lo que se mide de una pantalla, en una sola pasada por el DOM. */
const medir = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const main = document.querySelector('.lx-inspector-main');
  const barra = document.querySelector('[data-lx-bottom-chrome]');
  const rb = barra ? barra.getBoundingClientRect() : null;
  const recortado = (e) => e.scrollWidth > e.clientWidth + 1;

  /* Lo ÚLTIMO que se puede pulsar, que es lo que la barra no debe tapar nunca. */
  const pulsables = [...document.querySelectorAll('.lx-inspector-main button, .lx-inspector-main a[href]')]
    .filter((e) => e.offsetParent !== null);
  const ultimo = pulsables[pulsables.length - 1];
  const ru = ultimo ? ultimo.getBoundingClientRect() : null;

  const controles = [...document.querySelectorAll(
    '.lx-inspector-main button, .lx-inspector-main input, .lx-inspector-main textarea, .lx-inspector-main [role=combobox]',
  )].filter((e) => e.offsetParent !== null);

  const tarjeta = document.querySelector('.lx-inspector-main .lx-card');

  return {
    desborde: doc.scrollWidth - doc.clientWidth,
    ventana: { ancho: doc.clientWidth, alto: window.innerHeight },
    mainAncho: main ? Math.round(main.getBoundingClientRect().width) : null,
    mainIzq: main ? Math.round(main.getBoundingClientRect().left) : null,
    barra: rb ? {
      pos: getComputedStyle(barra).position,
      top: Math.round(rb.top), bottom: Math.round(rb.bottom), alto: Math.round(rb.height),
    } : null,
    ultimoPulsable: ru ? { texto: (ultimo.textContent || '').trim().slice(0, 24), bottom: Math.round(ru.bottom) } : null,
    /* Un control recortado es texto que la persona NO puede leer, y por eso se listan con su
       texto: un contador no dice cuál se rompió. */
    recortados: controles.filter(recortado).map((e) => ({
      t: (e.textContent || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 28),
      caja: Math.round(e.clientWidth), necesita: Math.round(e.scrollWidth),
    })),
    bajos: controles
      .map((e) => ({ t: (e.textContent || '').trim().slice(0, 20), alto: Math.round(e.getBoundingClientRect().height) }))
      .filter((c) => c.alto > 0 && c.alto < 44),
    /* El color REAL de la tarjeta y del lienzo: la queja de «azul brillante» no se reprodujo acá
       y conviene que quede medido, no opinado. */
    colores: {
      lienzo: getComputedStyle(document.body).backgroundColor,
      tarjeta: tarjeta ? getComputedStyle(tarjeta).backgroundColor : null,
    },
  };
});

async function probarPantalla(page, pantalla, t) {
  await page.goto(`${BASE}${RUTA}${pantalla.ruta}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const arriba = await medir(page);

  ok(arriba.desborde <= 0, `${pantalla.nombre}: sin desplazamiento horizontal`,
    `scrollWidth − clientWidth = ${arriba.desborde}`);

  ok(arriba.recortados.length === 0, `${pantalla.nombre}: ningún control recorta su texto`,
    JSON.stringify(arriba.recortados));

  ok(arriba.bajos.length === 0, `${pantalla.nombre}: todos los controles llegan a 44px`,
    JSON.stringify(arriba.bajos));

  /*
    La columna de contenido en TABLETA VERTICAL. El encargo pide 560-720px centrados y no de borde
    a borde; antes medía los 768 completos.
  */
  if (t.tabletaVertical && arriba.mainAncho != null) {
    ok(arriba.mainAncho >= 560 && arriba.mainAncho <= 720,
      `${pantalla.nombre}: la columna mide ${arriba.mainAncho}px, dentro de los 560-720 del encargo`);
    const margen = arriba.mainIzq;
    const margenDerecho = t.width - (arriba.mainIzq + arriba.mainAncho);
    ok(Math.abs(margen - margenDerecho) <= 1,
      `${pantalla.nombre}: y está centrada`, `izq ${margen} · der ${margenDerecho}`);
  }

  /* La barra: fija, pegada abajo, y sin tapar lo último que se puede pulsar — bajando del todo,
     que es donde el relleno inferior se pone a prueba. */
  if (!arriba.barra) {
    ok(false, `${pantalla.nombre}: no encontré la barra inferior`);
    return;
  }
  ok(arriba.barra.pos === 'fixed', `${pantalla.nombre}: la barra es fija`, `position: ${arriba.barra.pos}`);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(700);
  const abajo = await medir(page);
  ok(abajo.barra.bottom === abajo.ventana.alto,
    `${pantalla.nombre}: tras bajar del todo la barra sigue pegada al borde inferior`,
    `bottom ${abajo.barra.bottom} · ventana ${abajo.ventana.alto}`);
  if (abajo.ultimoPulsable) {
    ok(abajo.ultimoPulsable.bottom <= abajo.barra.top,
      `${pantalla.nombre}: «${abajo.ultimoPulsable.texto}» queda por ENCIMA de la barra, no debajo`,
      `fin del control ${abajo.ultimoPulsable.bottom} · borde de la barra ${abajo.barra.top}`);
  } else {
    salta(`${pantalla.nombre}: la pantalla no trajo ningún control que pulsar`);
  }

  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `${pantalla.clave}-${t.width}x${t.height}.png`) });
  return abajo.colores;
}

(async () => {
  const apagar = process.env.MOCKS === '1' ? await levantarServidor() : () => {};
  const navegador = await chromium.launch();
  let colores = null;
  try {
    for (const t of TAMANOS) {
      console.log(`\n── ${t.nombre} · ${t.width}×${t.height} ──`);
      const ctx = await navegador.newContext({
        viewport: { width: t.width, height: t.height },
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(String(e)));
      await entrar(page);
      for (const pantalla of PANTALLAS) {
        const c = await probarPantalla(page, pantalla, t);
        if (c) colores = c;
      }
      ok(errores.length === 0, `${t.nombre}: ningún error de JavaScript`, errores.slice(0, 2).join(' | '));
      await ctx.close();
    }
  } finally {
    await navegador.close();
    apagar();
  }

  console.log('\n── Color medido (la queja de «azul brillante») ──');
  console.log(`  ··  lienzo ${colores?.lienzo} · tarjeta ${colores?.tarjeta}`);
  salta('Safari de iPad. Este entorno no tiene WebKit de Playwright (el CDN está bloqueado desde ' +
    'el contenedor y desde la VM de la Mac), así que la barra en mitad del formulario y el tono ' +
    'de las superficies en ESE navegador no están comprobados acá.');

  console.log(`\n${fallos === 0 ? '✓ sin fallos' : `✗ ${fallos} fallo(s)`}` +
    `${saltadas ? ` · ${saltadas} sin probar` : ''}`);
  console.log(`  capturas en ${CAPTURAS}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
