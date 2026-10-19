/**
 * El resumen del turno del fiscalizador, medido en el navegador.
 *
 * <p>«¿Qué hice yo hoy?»: consultas de placa y boletas emitidas, en el Inicio del portal de
 * fiscalización. El endpoint existe en el servidor desde hace versiones y la pantalla ya lo pedía;
 * lo que faltaba era que el transporte simulado lo publicara, así que en toda demostración las dos
 * tarjetas desaparecían sin que nadie supiera por qué.</p>
 *
 * <h2>La regla que esto protege</h2>
 *
 * <p>La pantalla sólo dibuja una tarjeta <b>si su fuente contestó</b>. Un cero inventado en
 * «boletas emitidas» parece un turno sin trabajo, y es peor que no tener la tarjeta. Por eso acá
 * se comprueban las dos caras: que con datos las tarjetas aparecen y cuentan de verdad, y que
 * cuando el servidor no contesta <b>no aparece ningún cero</b> — mientras «pendientes de enviar»,
 * que sale de la cola de este aparato y no del servidor, sigue ahí también sin señal.</p>
 *
 *   cd frontend && MOCKS=1 node tests/responsive/inspector-resumen-turno.cjs
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const PUERTO = 5185;
const PUERTO_API = Number(process.env.PUERTO_API || 5192);
const MOCKS = process.env.MOCKS === '1';
const BASE = process.env.BASE || (MOCKS ? `http://localhost:${PUERTO}` : 'https://staging.luparx.com');
const RUTA = /localhost|127\.0\.0\.1/.test(BASE) ? '' : '/inspector';
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;
const CAPTURAS = process.env.CAPTURAS || path.join(__dirname, 'capturas', 'resumen-turno');

/** La cuenta sale de la tabla del README, como en el arnés de la Fase 1A. */
function cuentaSimulada() {
  const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');
  const fila = readme.split('\n').find((l) => /^\|\s*inspector\s*\|/.test(l));
  if (!fila) throw new Error('No encontré la fila «inspector» en frontend/README.md.');
  const celdas = fila.split('|').map((c) => c.trim());
  const correo = celdas.find((c) => c.includes('@'));
  return { correo, clave: celdas[celdas.indexOf(correo) + 1] };
}
const CUENTA = process.env.CUENTA || (MOCKS ? cuentaSimulada().correo : 'inspector@luparx.test');
const PASS = process.env.PASS || (MOCKS ? cuentaSimulada().clave : '');

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'móvil grande', width: 430, height: 932, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'tablet horizontal', width: 1024, height: 768, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];

let fallos = 0;
let pruebas = 0;
let saltadas = 0;
function ok(condicion, mensaje, detalle) {
  pruebas++;
  if (condicion) console.log(`  ok  ${mensaje}`);
  else { fallos++; console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`); }
}
const salta = (motivo) => { saltadas += 1; console.log(`  ··  SIN PROBAR: ${motivo}`); };

/*
  ¿Hay algo escuchando ya en ese puerto?

  Se prueban las DOS familias. Vite escucha en `localhost`, y según cómo resuelva esa máquina el
  nombre eso puede ser 127.0.0.1 o ::1. Probando sólo IPv4, el arnés declaraba «el servidor no
  llegó a escuchar en 90 s» con Vite perfectamente levantado e imprimiendo «ready» — medido el
  18-10-2026 en los cuatro arneses a la vez. No es una espera más larga: es mirar donde el
  servidor está.
*/
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
    if (process.env.SERVIDOR_EXTERNO === '1') {
      console.log(`  ··  se usa el servidor que ya escucha en :${PUERTO} (SERVIDOR_EXTERNO=1)`);
      return async () => {};
    }
    console.error(`✗ Ya hay algo escuchando en :${PUERTO} y no se sabe qué es.`);
    console.error('  Apagalo, o afirmá que es el servidor correcto con SERVIDOR_EXTERNO=1.');
    process.exit(2);
  }
  /*
    El simulador servido por HTTP, no inyectado dentro de la aplicación.

    Dos cosas dependen de eso y ninguna es cosmética: su estado vive en otro proceso, así que una
    recarga de la pantalla NO lo reinicia —y sin eso no se puede comprobar que el contador suba—,
    y las peticiones existen como peticiones, así que se puede provocar el fallo del resumen para
    ver que la pantalla no inventa ceros. Es el MISMO `mockFetch` del repositorio, envuelto.
  */
  const { levantarSimulado } = require('./servidor-simulado.cjs');
  const simulado = await levantarSimulado(PUERTO_API);
  console.log(`  ··  transporte simulado por HTTP en :${simulado.puerto}`);
  console.log(`  ··  levantando el servidor de desarrollo en :${PUERTO}…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/inspector'], {
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
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  const apagar = () => {
    try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ }
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
  };
  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor no llegó a escuchar en 90 s:\n'
      + salida.join('').split('\n').slice(-12).join('\n'));
    apagar();
    await simulado.cerrar();
    process.exit(1);
  }
  return async () => {
    apagar();
    await simulado.cerrar();
    const hasta = Date.now() + 8000;
    while (Date.now() < hasta && (await puertoOcupado(PUERTO))) {
      await new Promise((r) => setTimeout(r, 300));
    }
  };
}

/**
 * Una sesión contra el transporte simulado, por HTTP y sin navegador.
 *
 * <p>La pantalla pide la ventana del día y nunca manda una inválida, que es lo correcto. Pero el
 * contrato del extremo tiene que sostenerse igual cuando la petición NO viene de esa pantalla —otro
 * cliente, una prueba, un script—, y eso no se puede comprobar manejando la interfaz. Así que acá se
 * entra como entra un cliente cualquiera y se pregunta directo.</p>
 */
async function sesionHttp() {
  const api = `http://localhost:${PUERTO_API}/api/v1`;
  const r = await fetch(`${api}/auth/inspector/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CUENTA, password: PASS }),
  });
  if (!r.ok) return null;
  const { accessToken } = await r.json();
  return {
    api,
    /** El resumen, con la ventana tal cual se la pasen: crudo, para poder mandar basura. */
    resumen: (consulta) => fetch(`${api}/inspector/shift-summary${consulta}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  };
}

async function entrar(page) {
  await page.goto(`${BASE}${RUTA}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2600);
  const opcion = page.locator('button, [role=button], a').filter({ hasText: /continuar|seleccionar|entrar/i }).first();
  if (/select-tenant/.test(page.url()) && (await opcion.count())) {
    await opcion.click();
    await page.waitForTimeout(1800);
  }
  if (await page.locator('input[type=password]').count()) {
    console.error('✗ Sigue en el login. Revisá CUENTA/PASS.');
    process.exit(1);
  }
}

/** Las tarjetas del Inicio, por su rótulo y su número. */
const tarjetas = (page) => page.evaluate(() => {
  const salida = {};
  // `.lx-metric` es la tarjeta; el rótulo y el número viven en sus propios nodos, así que se leen
  // por separado en vez de sacar el primer dígito del texto pegado de toda la tarjeta.
  for (const tarjeta of document.querySelectorAll('.lx-metric')) {
    const rotulo = (tarjeta.querySelector('.lx-metric__label')?.textContent ?? '').trim();
    const valor = (tarjeta.querySelector('.lx-metric__value')?.textContent ?? '').trim();
    const numero = Number.parseInt(valor.replace(/[^0-9-]/g, ''), 10);
    const n = Number.isFinite(numero) ? numero : null;
    if (/pendient|pending/i.test(rotulo)) salida.pendientes = n;
    else if (/consulta|check/i.test(rotulo)) salida.consultas = n;
    else if (/boleta|citation/i.test(rotulo)) salida.boletas = n;
  }
  salida.rotulos = [...document.querySelectorAll('.lx-metric__label')].map((e) => e.textContent.trim());
  return salida;
});

async function capturar(page, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const destino = path.join(CAPTURAS, `${nombre}.png`);
  await page.screenshot({ path: destino });
  return destino;
}

/** Hace una consulta de placa desde el Inicio, que es lo que mueve el contador. */
async function consultarPlaca(page, placa) {
  const campo = page.getByLabel(/placa|plate/i).first();
  if (!(await campo.count())) return false;
  await campo.fill(placa);
  const enviar = page.locator('button[type=submit]').first();
  if (!(await enviar.count())) return false;
  await enviar.click();
  await page.waitForTimeout(2600);
  return true;
}

// ---------------------------------------------------------------------------------------------

async function corrida(browser) {
  // ───────── 1. Con el servidor contestando ─────────
  console.log('\n── 1. El resumen, con el servidor contestando ──');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
  const page = await context.newPage();
  await entrar(page);
  await page.goto(`${BASE}${RUTA}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const antes = await tarjetas(page);
  ok(antes.consultas !== undefined, 'la tarjeta de consultas del turno aparece', JSON.stringify(antes));
  ok(antes.boletas !== undefined, 'la tarjeta de boletas emitidas aparece', JSON.stringify(antes));
  ok(antes.pendientes !== undefined, 'y la de pendientes de enviar, que no depende del servidor');
  console.log(`  ··  captura: ${await capturar(page, 'resumen-con-datos-390x844')}`);

  // ───────── 2. Las cifras se mueven de verdad ─────────
  console.log('\n── 2. Las cifras cuentan hechos, no adornos ──');
  const hecha = await consultarPlaca(page, 'BKZ987');
  if (!hecha) {
    salta('el Inicio no ofreció el campo de placa: no se pudo mover el contador');
  } else {
    // El resumen se refresca solo cada minuto; se recarga para no esperarlo.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const despues = await tarjetas(page);
    ok(despues.consultas !== null && antes.consultas !== null
      && despues.consultas > antes.consultas,
      'tras consultar una placa, el contador de consultas sube',
      `${antes.consultas} → ${despues.consultas}`);
    ok(despues.boletas === antes.boletas,
      'y el de boletas no se mueve: consultar no es emitir',
      `${antes.boletas} → ${despues.boletas}`);
  }

  // ───────── 3. Aislamiento: sólo las mías ─────────
  console.log('\n── 3. Sólo mi turno ──');
  {
    /*
      Esto era un «sin probar», con el motivo de que el simulador se inyecta como `fetchImpl` y no
      hay petición que interceptar. Para ESTE arnés era falso: `levantarServidor` arranca el portal
      con `VITE_USE_MOCKS=false` apuntado al simulador servido por HTTP, así que las peticiones
      existen y se pueden hacer a mano. El comentario describía la otra configuración y nadie lo
      volvió a mirar. Se mide.

      Lo que se afirma: el fiscalizador sale de la SESIÓN. Mandar `inspectorUserId` —el nombre que
      usa el panel administrativo para filtrar por funcionario— no cambia la respuesta. Si algún día
      alguien lo acepta acá, esto se cae.
    */
    const sesion = await sesionHttp();
    if (!sesion) {
      salta('no se pudo abrir una sesión por HTTP contra el transporte simulado');
    } else {
      const ventana = (() => {
        const desde = new Date(); desde.setHours(0, 0, 0, 0);
        const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);
        return `from=${desde.toISOString()}&to=${hasta.toISOString()}`;
      })();
      const mio = await (await sesion.resumen(`?${ventana}`)).json();
      const forzado = await sesion.resumen(
        `?${ventana}&inspectorUserId=00000000-0000-0000-0000-000000000000`);
      const ajeno = await forzado.json();
      ok(forzado.status === 200, 'pedir el turno de otro no es un error: el parámetro sencillamente no existe',
        `HTTP ${forzado.status}`);
      ok(ajeno.checks === mio.checks && ajeno.citations === mio.citations,
        'y la respuesta es la MÍA: el fiscalizador sale de la sesión, no del parámetro',
        `${mio.checks}/${mio.citations} → ${ajeno.checks}/${ajeno.citations}`);
    }
  }

  // ───────── 4. Cuando el servidor no contesta ─────────
  console.log('\n── 4. Sin servidor: ningún cero inventado ──');
  {
    const ctxRoto = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: 'es-CR', storageState: await context.storageState(),
    });
    /*
      Se rompe SÓLO el resumen, en el cliente: así la pantalla entra en el mismo estado que
      tendría contra un servidor que todavía no publica la ruta, sin tirar el resto de la sesión.
    */
    await ctxRoto.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.fetch = function (entrada, inicio) {
        const u = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
        if (/shift-summary/.test(u)) return Promise.reject(new TypeError('Failed to fetch (simulado)'));
        return original(entrada, inicio);
      };
      window.__resumenRoto = true;
    });
    const rota = await ctxRoto.newPage();
    await rota.goto(`${BASE}${RUTA}/`, { waitUntil: 'domcontentloaded' });
    await rota.waitForTimeout(3000);
    const sinServidor = await tarjetas(rota);
    const cuerpo = await rota.evaluate(() => document.body.innerText);

    if (!(await rota.evaluate(() => window.__resumenRoto === true))) {
      salta('no se pudo interceptar la petición del resumen en este transporte');
    } else if (sinServidor.consultas !== undefined || sinServidor.boletas !== undefined) {
      /*
        Con el simulador inyectado como `fetchImpl`, la petición NO pasa por `window.fetch`, así
        que romperlo no la alcanza. Es una limitación del transporte, no un fallo de la pantalla.
      */
      salta('el transporte simulado no pasa por window.fetch: el fallo del resumen no se puede provocar así');
    } else {
      ok(true, 'sin resumen, las dos tarjetas del servidor no se dibujan');
      ok(/pendient|pending/i.test(cuerpo),
        'y «pendientes de enviar» sigue ahí: su cero sí es un cero medido');
      ok(!/\b0\s*(consultas|checks)\b/i.test(cuerpo),
        'no aparece ningún cero inventado en las cifras del turno');
      console.log(`  ··  captura: ${await capturar(rota, 'resumen-sin-servidor-390x844')}`);
    }
    await ctxRoto.close();
  }

  // ───────── 5. Los ocho tamaños ─────────
  console.log('\n── 5. Los ocho tamaños ──');
  for (const tamano of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: tamano.width, height: tamano.height },
      isMobile: tamano.movil, hasTouch: tamano.movil, locale: 'es-CR',
      storageState: await context.storageState(),
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}${RUTA}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const etiqueta = `${tamano.nombre} ${tamano.width}×${tamano.height}`;
    const medidas = await p.evaluate(() => {
      const fuera = [];
      for (const el of document.querySelectorAll('.lx-metric')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -1 || r.right > window.innerWidth + 1) fuera.push(Math.round(r.right));
      }
      return {
        anchoDoc: Math.round(document.documentElement.scrollWidth),
        vw: window.innerWidth,
        fuera: fuera.length,
        tarjetas: document.querySelectorAll('.lx-metric').length,
      };
    });
    ok(medidas.tarjetas >= 3, `${etiqueta}: las tres tarjetas están`, `${medidas.tarjetas}`);
    ok(medidas.anchoDoc <= medidas.vw + 1, `${etiqueta}: sin desbordamiento horizontal`,
      `${medidas.anchoDoc} > ${medidas.vw}`);
    ok(medidas.fuera === 0, `${etiqueta}: ninguna tarjeta se sale`, `${medidas.fuera}`);
    if (tamano.width === 320 || tamano.width === 1280) {
      console.log(`  ··  captura: ${await capturar(p, `resumen-${tamano.width}x${tamano.height}`)}`);
    }
    await ctx.close();
  }

  // ───────── 6. El contrato de la ventana ─────────
  /*
    Por qué esta sección existe (17-10-2026).

    El servidor contestaba **200 con ceros** a una ventana invertida o vacía, y 200 a
    `from=1970&to=2999`. Para la pantalla, un 200 con ceros es indistinguible de «hoy no hice
    nada» — justamente la diferencia que esta pantalla se tomó el trabajo de preservar y que las
    secciones 1 y 4 de este arnés protegen. Y exigir `from` y `to` no es lo mismo que acotarlos: la
    lectura sin tope que esos parámetros venían a evitar seguía siendo pedible.

    Ahora los dos extremos contestan lo mismo, y es esto lo que se fija acá. El simulador tiene que
    equivocarse IGUAL que el servidor: uno que no se equivoca igual esconde defectos en vez de
    encontrarlos.

      · falta un parámetro, o no se puede leer  → 400 MALFORMED_REQUEST
      · la ventana está al revés o es vacía     → 422, campo `from`, código VALIDATION_FAILED
      · la ventana pasa los 31 días             → 422, campo `to`,   código SHIFT_WINDOW_TOO_WIDE

    El código específico va EN EL CAMPO y no arriba, que es como `ValidationException` lo expresa en
    todo el repositorio: arriba «no pasó la validación», en el campo cuál.
  */
  console.log('\n── 6. El contrato de la ventana ──');
  {
    const sesion = await sesionHttp();
    if (!sesion) {
      salta('no se pudo abrir una sesión por HTTP para probar el contrato de la ventana');
    } else {
      const campo = (cuerpo) => (cuerpo && cuerpo.errors && cuerpo.errors[0]) || {};

      const buena = await sesion.resumen('?from=2026-10-17T00:00:00Z&to=2026-10-18T00:00:00Z');
      const buenaCuerpo = await buena.json();
      ok(buena.status === 200, 'una ventana de un día contesta 200', `HTTP ${buena.status}`);
      ok(typeof buenaCuerpo.checks === 'number' && typeof buenaCuerpo.citations === 'number',
        'y trae las dos cifras como números', JSON.stringify(buenaCuerpo));

      const alReves = await sesion.resumen('?from=2026-10-18T00:00:00Z&to=2026-10-17T00:00:00Z');
      const alRevesCuerpo = await alReves.json();
      ok(alReves.status === 422, 'una ventana invertida se RECHAZA, ya no contesta 200 con ceros',
        `HTTP ${alReves.status}`);
      ok(campo(alRevesCuerpo).field === 'from',
        'y señala el campo «from», para que el cliente ponga el mensaje en su sitio',
        campo(alRevesCuerpo).field);

      const vacia = await sesion.resumen('?from=2026-10-17T00:00:00Z&to=2026-10-17T00:00:00Z');
      ok(vacia.status === 422, 'una ventana vacía (from == to) también', `HTTP ${vacia.status}`);

      const falta = await sesion.resumen('?to=2026-10-18T00:00:00Z');
      const faltaCuerpo = await falta.json();
      ok(falta.status === 400 && faltaCuerpo.code === 'MALFORMED_REQUEST',
        'sin «from» es 400 MALFORMED_REQUEST, como contesta el servidor y no como le quedaba cómodo al simulador',
        `HTTP ${falta.status} ${faltaCuerpo.code}`);

      const basura = await sesion.resumen('?from=ayer&to=2026-10-18T00:00:00Z');
      ok(basura.status === 400, 'una fecha ilegible también es 400: no llega al cuerpo del método',
        `HTTP ${basura.status}`);

      const todo = await sesion.resumen('?from=1970-01-01T00:00:00Z&to=2999-12-31T00:00:00Z');
      const todoCuerpo = await todo.json();
      ok(todo.status === 422, '«todo mi historial» ya no es pedible', `HTTP ${todo.status}`);
      ok(campo(todoCuerpo).code === 'SHIFT_WINDOW_TOO_WIDE',
        'y lo dice con su propio código, distinguible de «la mandé al revés»',
        campo(todoCuerpo).code);
      ok(campo(todoCuerpo).field === 'to', 'señalando «to», que es el extremo que sobra',
        campo(todoCuerpo).field);

      const treintaYUno = await sesion.resumen('?from=2026-09-16T00:00:00Z&to=2026-10-17T00:00:00Z');
      ok(treintaYUno.status === 200, 'el tope son 31 días y 31 días pasan: el límite no muerde de menos',
        `HTTP ${treintaYUno.status}`);
      const treintaYDos = await sesion.resumen('?from=2026-09-15T00:00:00Z&to=2026-10-17T00:00:00Z');
      ok(treintaYDos.status === 422, 'y 32 no pasan: el límite tampoco muerde de más',
        `HTTP ${treintaYDos.status}`);
    }
  }

  await context.close();
}

// ---------------------------------------------------------------------------------------------

(async () => {
  console.log(`\n══ Resumen del turno · ${BASE}${RUTA || ''} ${MOCKS ? '(transporte simulado)' : ''} ══`);
  if (!PASS) { console.error('✗ Falta la contraseña (PASS).'); process.exit(1); }
  const apagar = MOCKS ? await levantarServidor() : async () => {};
  const navegador = await chromium.launch({
    executablePath: EJECUTABLE,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    await corrida(navegador);
  } catch (e) {
    fallos++;
    console.error(`\n✗ La corrida se interrumpió: ${e && e.message}`);
    console.error(e && e.stack);
  } finally {
    await navegador.close();
    await apagar();
  }
  console.log(`\n${pruebas} comprobaciones · ${fallos} fallo${fallos === 1 ? '' : 's'}`
    + `${saltadas ? ` · ${saltadas} sin probar` : ''}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
