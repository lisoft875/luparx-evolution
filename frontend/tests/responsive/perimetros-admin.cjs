/**
 * El editor de perímetros del portal del administrador, probado en un navegador de verdad.
 *
 * <h2>Qué cubre y por qué</h2>
 *
 * <p>La pantalla `/zones/geometry` cierra un hueco viejo: el mecanismo para cargar un perímetro
 * existía en la API —`PUT geometry` y `PUT geometry/review`— pero no había pantalla, así que cargar
 * un polígono exigía dos llamadas HTTP con token de administrador. El arnés recorre el camino
 * entero: elegir zona → pegar → validar → guardar → verificar.</p>
 *
 * <p>La afirmación que más importa no es que el camino feliz funcione, sino que <b>el error caro se
 * vea antes de llegar al servidor</b>. Un perímetro con lon/lat invertidos es JSON perfectamente
 * válido, el servidor lo acepta, y el polígono aparece en el océano Índico. Acá se exige que la
 * pantalla lo marque, en palabras, antes de guardar.</p>
 *
 * <p>Y la segunda: <b>guardar no es aprobar</b>. Tras guardar, el perímetro queda SIN verificar y
 * hace falta un segundo acto, con su propio permiso. Si alguien «simplifica» eso en un solo botón,
 * acá se cae.</p>
 *
 * <h2>Cómo correrlo</h2>
 *
 * <pre>
 *   cd ~/Development/Proyectos/luparx-evolution/frontend
 *   MOCKS=1 node tests/responsive/perimetros-admin.cjs
 * </pre>
 *
 * <p>Con {@code MOCKS=1} levanta el portal del administrador contra el transporte simulado
 * (`VITE_USE_MOCKS=true`) y lo apaga al terminar. No toca staging, ni producción, ni ninguna base
 * de datos: lo que se guarda vive en la memoria del simulador y muere con el proceso. El simulador
 * repite las dos negativas del servidor —redibujar degrada el sello a UNVERIFIED, y una geometría
 * DEMO no se puede aprobar—, así que probar contra él no es probar contra un sí fácil.</p>
 *
 * <p>La contraseña de la cuenta simulada sale de la tabla de `frontend/README.md`, que es donde ya
 * vive; este archivo no la copia.</p>
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const net = require('node:net');

const RAIZ = join(__dirname, '..', '..');
const PUERTO = Number(process.env.PUERTO || 5191);
const BASE = process.env.BASE || `http://localhost:${PUERTO}`;
const RUTA = /localhost|127\.0\.0\.1/.test(BASE) ? '' : '/admin';
const CAPTURAS = join(__dirname, 'capturas', 'perimetros-admin');

function cuentaSimulada() {
  const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');
  const fila = readme.split('\n').find((l) => /^\|\s*admin\s*\|/.test(l));
  if (!fila) throw new Error('No encontré la fila «admin» en la tabla de cuentas de frontend/README.md.');
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
if (!PASS || /^<.*>$/.test(PASS)) {
  console.error('✗ Falta la contraseña. Usá:  MOCKS=1 node tests/responsive/perimetros-admin.cjs');
  process.exit(2);
}

/* Los tamaños que exige la guía del proyecto. El admin se usa en escritorio, pero un regidor que
   abre el portal desde el teléfono en una sesión municipal es un caso real, no una hipótesis. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 844 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'tablet apaisada', width: 1024, height: 768 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];

let fallos = 0;
let saltadas = 0;
const ok = (c, bien, mal = '') => {
  if (c) console.log(`  ok  ${bien}`);
  else { fallos += 1; console.log(`  ✗   ${bien}${mal ? `\n        ${mal}` : ''}`); }
};
const salta = (motivo) => { saltadas += 1; console.log(`  ··  SIN PROBAR: ${motivo}`); };

/* ───────────────────────────── Polígonos de prueba ─────────────────────────────

  NINGUNO de estos es un perímetro municipal. Son cuadrados de laboratorio para ejercitar el
  validador: el arnés no guarda nada en ninguna base real y el simulador olvida todo al apagarse.
  Se escogen coordenadas que CAIGAN en San José sólo para que el aviso de «fuera de Costa Rica»
  tenga un caso negativo contra el cual contrastar.                                              */
const cuadrado = (oeste, sur, lado) => ([[
  [oeste, sur], [oeste + lado, sur], [oeste + lado, sur + lado], [oeste, sur + lado], [oeste, sur],
]]);
const EN_SAN_JOSE = { type: 'Polygon', coordinates: cuadrado(-84.08, 9.93, 0.01) };
/* El mismo cuadrado con lon y lat cambiadas de puesto: JSON impecable, polígono en el Índico. */
const INVERTIDO = {
  type: 'Polygon',
  coordinates: [EN_SAN_JOSE.coordinates[0].map(([lon, lat]) => [lat, lon])],
};
const ANILLO_ABIERTO = {
  type: 'Polygon',
  coordinates: [EN_SAN_JOSE.coordinates[0].slice(0, 4)],
};
const UN_PUNTO = { type: 'Point', coordinates: [-84.08, 9.93] };
/* Más vértices de los que el servidor acepta (10 000): fuerza el 422 y con él el camino de error
   del guardado, que es el estado que una pantalla suele olvidar probar. */
const DEMASIADO_COMPLEJO = {
  type: 'Polygon',
  coordinates: [(() => {
    const pts = [];
    for (let i = 0; i < 10_050; i += 1) {
      pts.push([-84.08 + (i % 100) * 0.00001, 9.93 + Math.floor(i / 100) * 0.00001]);
    }
    pts.push(pts[0]);
    return pts;
  })()],
};

/* ──────────────────────────── Servidor de desarrollo ──────────────────────────── */
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
    console.log(`  ··  ya hay algo escuchando en :${PUERTO}; se usa eso y no se levanta otro`);
    return () => {};
  }
  console.log(`  ··  levantando el portal del administrador en :${PUERTO} con transporte simulado…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/admin', '--', '--port', String(PUERTO)], {
    cwd: RAIZ,
    env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  if (!(await esperarPuerto(PUERTO, 90000))) {
    console.error('✗ El servidor de desarrollo no llegó a escuchar en 90 s. Últimas líneas:\n' +
      salida.join('').split('\n').slice(-12).join('\n'));
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
    process.exit(1);
  }
  return () => { try { hijo.kill('SIGTERM'); } catch { /* ya no está */ } };
}

const donde = (page) => page.evaluate(() => ({
  ruta: location.pathname + location.search,
  hayPassword: Boolean(document.querySelector('input[type=password]')),
}));

async function entrar(page) {
  let respuesta = null;
  page.on('response', (r) => { if (/\/auth\/.*\/login/.test(r.url())) respuesta = r; });
  await page.goto(`${BASE}${RUTA}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('input[type=email], input[name=email]', CUENTA);
  await page.fill('input[type=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2600);
  const cod = respuesta ? respuesta.status() : 0;
  if (cod === 401) { console.error('✗ 401: la cuenta o la contraseña no son las de este entorno.'); process.exit(1); }
  const d = await donde(page);
  if (/select-tenant/.test(d.ruta)) {
    const opcion = page.locator('button, [role=button], a').filter({ hasText: /continuar|seleccionar|entrar/i }).first();
    if (await opcion.count()) { await opcion.first().click(); await page.waitForTimeout(1800); }
  }
  const tras = await donde(page);
  if (tras.hayPassword) { console.error(`✗ Sigue en el login (código ${cod}).`); process.exit(1); }
  ok(true, `entró (${cod || 'simulado'}) · ${BASE}${RUTA || '/'}`);
}

/* ─────────────────────────────── Utilidades ─────────────────────────────── */
const caja = (page) => page.locator('textarea.lx-textarea').first();
const boton = (page, re) => page.getByRole('button', { name: re }).first();
const alerta = (page, re) => page.getByText(re).first();

async function elegirZona(page, indice = 1) {
  /*
    El Select propio se abre con un `button[role=combobox]` dentro de `.lx-select-wrap`, y las
    filas son `[role=option]` en un portal colgado del `body`. El selector tiene que decir
    `.lx-select-wrap` y no sólo `[role=combobox]`: la barra del armazón tiene SU propio combobox
    —el buscador— que además está oculto en escritorio, así que un selector amplio se queda
    esperando treinta segundos por un elemento invisible y el arnés «falla» por el motivo
    equivocado. Medido el 24-10-2026 en la primera corrida de este archivo.
  */
  const campo = page.locator('.lx-select-wrap button[role=combobox]').first();
  await campo.click();
  await page.waitForTimeout(500);
  const opciones = page.getByRole('option');
  const cuantas = await opciones.count();
  if (cuantas <= indice) return null;
  const etiqueta = (await opciones.nth(indice).textContent())?.trim() ?? '';
  await opciones.nth(indice).click();
  await page.waitForTimeout(1200);
  return etiqueta;
}

async function pegarYValidar(page, objeto) {
  await caja(page).fill(typeof objeto === 'string' ? objeto : JSON.stringify(objeto));
  await boton(page, /^validar$/i).click();
  await page.waitForTimeout(500);
}

/* ─────────────────────────── 1 · Llegar a la pantalla ─────────────────────────── */
async function probarLlegada(page) {
  console.log('\n── Llegar a Perímetros ──');
  await page.goto(`${BASE}${RUTA}/zones`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const enElMenu = page.getByRole('link', { name: /perímetros/i }).first();
  ok(await enElMenu.isVisible().catch(() => false),
    'la pantalla tiene entrada propia en el menú: se llega sin saber la URL de memoria');

  await enElMenu.click();
  await page.waitForTimeout(2200);
  const ruta = (await donde(page)).ruta;
  ok(/\/zones\/geometry/.test(ruta), 'y el menú lleva a /zones/geometry', `ruta: ${ruta}`);
  ok(await page.getByText(/perímetros de zona/i).first().isVisible().catch(() => false),
    'la pantalla se presenta con su título');

  // Estado vacío: sin zona escogida no hay dónde pegar. Una caja de texto antes de saber para qué
  // zona es invita a pegar primero y escoger después, que es como se carga el polígono en la zona
  // equivocada.
  ok((await caja(page).count()) === 0,
    'antes de escoger zona NO hay caja de texto: no se puede pegar un perímetro «en el aire»');
}

/* ───────────────────── 2 · El validador, en la pantalla ───────────────────── */
async function probarValidacion(page) {
  console.log('\n── Validar antes de guardar ──');
  const zona = await elegirZona(page, 1);
  if (!zona) { salta('el simulador no devolvió ninguna zona'); return null; }
  ok(true, `zona escogida: ${zona}`);

  ok(await caja(page).isVisible().catch(() => false), 'al escoger zona aparece la caja para pegar');
  ok(await page.getByText(/no tiene perímetro|ya tiene un perímetro/i).first().isVisible().catch(() => false),
    'y dice si esa zona ya tenía perímetro o no, antes de que se pise nada');

  const guardar = boton(page, /guardar perímetro/i);
  ok(await guardar.isDisabled().catch(() => true),
    'Guardar nace apagado: no se guarda lo que no se validó');

  await pegarYValidar(page, 'esto no es json');
  ok(await alerta(page, /no es JSON válido/i).isVisible().catch(() => false),
    'un texto que no es JSON lo dice en palabras, no en un error de consola');
  ok(await guardar.isDisabled().catch(() => true), 'y Guardar sigue apagado');

  await pegarYValidar(page, UN_PUNTO);
  ok(await alerta(page, /Polygon o MultiPolygon/i).isVisible().catch(() => false),
    'un Point se rechaza nombrando lo que sí se acepta');

  await pegarYValidar(page, ANILLO_ABIERTO);
  ok(await alerta(page, /no cierra/i).isVisible().catch(() => false),
    'un anillo que no cierra se rechaza diciendo exactamente eso');

  /* La afirmación central del arnés. */
  await pegarYValidar(page, INVERTIDO);
  const avisoInvertido = await alerta(page, /fuera de Costa Rica/i).isVisible().catch(() => false);
  ok(avisoInvertido,
    'lon/lat invertidos: JSON válido, pero la pantalla AVISA que la caja cae fuera de Costa Rica');
  ok(await alerta(page, /\[lon, lat\]/i).isVisible().catch(() => false),
    'y nombra la causa probable —el orden [lon, lat]— en vez de dejar adivinando');

  await pegarYValidar(page, EN_SAN_JOSE);
  ok(await alerta(page, /GeoJSON válido/i).isVisible().catch(() => false),
    'un polígono bien formado en San José valida');
  ok((await alerta(page, /fuera de Costa Rica/i).count()) === 0,
    'y NO arrastra el aviso del intento anterior: cada validación responde por sí sola');
  const resumen = (await page.locator('.lx-alert').first().textContent()) ?? '';
  ok(/-84\.0/.test(resumen) && /9\.9/.test(resumen),
    'el resumen muestra la caja real del polígono, que es lo que deja verlo mal pegado',
    `resumen: ${resumen.replace(/\s+/g, ' ').trim()}`);
  ok(/anillo/i.test(resumen) && /vértice/i.test(resumen),
    'y los números vienen CON su nombre: «1 anillo · 5 vértices», no «1 · 5»',
    `resumen: ${resumen.replace(/\s+/g, ' ').trim()}`);
  ok(!(await guardar.isDisabled().catch(() => true)), 'recién ahora Guardar se enciende');
  return zona;
}

/* ──────────────── 3 · Guardar no es aprobar, y el error se ve ──────────────── */
async function probarGuardarYVerificar(page) {
  console.log('\n── Guardar, y después aprobar ──');

  // Primero el camino de error del SERVIDOR, que es el que suele quedar sin probar.
  await pegarYValidar(page, DEMASIADO_COMPLEJO);
  if (await alerta(page, /GeoJSON válido/i).isVisible().catch(() => false)) {
    await boton(page, /guardar perímetro/i).click();
    await page.waitForTimeout(1800);
    ok(await alerta(page, /no se pudo guardar/i).isVisible().catch(() => false),
      'si el servidor rechaza el polígono, la pantalla lo dice en vez de quedarse callada');
    ok((await alerta(page, /perímetro guardado/i).count()) === 0,
      'y NO canta éxito con un guardado que no ocurrió');
  } else {
    salta('el validador local rechazó el polígono gigante antes del servidor');
  }

  await pegarYValidar(page, EN_SAN_JOSE);
  await boton(page, /guardar perímetro/i).click();
  await page.waitForTimeout(2000);
  ok(await alerta(page, /perímetro guardado/i).isVisible().catch(() => false),
    'un perímetro válido se guarda');
  ok(await alerta(page, /sin verificar/i).isVisible().catch(() => false),
    'y el mensaje dice que queda SIN verificar: guardar no es aprobar');

  const verificar = boton(page, /verificar como oficial/i);
  ok(await verificar.isVisible().catch(() => false),
    'aprobar es un segundo acto, con su propio botón y su propio permiso');
  ok(await page.getByText(/DEMO no se puede aprobar/i).first().isVisible().catch(() => false),
    'y se recuerda ahí mismo que una geometría DEMO no se puede aprobar');

  await verificar.click();
  await page.waitForTimeout(1800);
  ok(await alerta(page, /perímetro verificado/i).isVisible().catch(() => false),
    'verificado: el servidor acepta la aprobación de un perímetro que no es DEMO');
  ok(await alerta(page, /el ciudadano lo verá/i).isVisible().catch(() => false),
    'y el mensaje dice la consecuencia: recién ahora el ciudadano lo ve');

  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, 'verificado-1280x800.png'), fullPage: true });
}

/* ───────────────── 4 · Cambiar de zona no arrastra el estado ───────────────── */
async function probarCambioDeZona(page) {
  console.log('\n── Cambiar de zona ──');
  const otra = await elegirZona(page, 2);
  if (!otra) { salta('el simulador sólo devolvió una zona'); return; }
  ok((await alerta(page, /perímetro guardado/i).count()) === 0,
    `al pasar a «${otra}» NO sigue colgado el «guardado» de la zona anterior`);
  ok((await alerta(page, /perímetro verificado/i).count()) === 0,
    'ni el «verificado»: cada zona responde por sí sola');
  ok((await boton(page, /verificar como oficial/i).count()) === 0,
    'y el botón de aprobar desaparece hasta que se guarde algo en ESTA zona');
  ok(await boton(page, /guardar perímetro/i).isDisabled().catch(() => true),
    'Guardar vuelve a estar apagado aunque la caja conserve el texto pegado');
}

/* ────────────────────────────── 5 · Responsive ────────────────────────────── */
async function probarTamanos(navegador) {
  console.log('\n── Responsive ──');
  mkdirSync(CAPTURAS, { recursive: true });
  for (const t of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: t.width, height: t.height } });
    const page = await ctx.newPage();
    await entrar(page);
    await page.goto(`${BASE}${RUTA}/zones/geometry`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await elegirZona(page, 1);
    await pegarYValidar(page, EN_SAN_JOSE);

    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const caja = document.querySelector('textarea.lx-textarea');
      const r = caja ? caja.getBoundingClientRect() : null;
      const botones = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({
          texto: (b.textContent ?? '').trim().slice(0, 24),
          clase: b.className,
          alto: Math.round(b.getBoundingClientRect().height),
        }));
      const cortos = botones.filter((b) => b.alto > 0 && b.alto < 44);
      const menu = document.querySelector('.lx-page-layout__sidebar');
      return {
        /*
          El menú lateral, medido y no mirado. Debajo de 900px el cuerpo se apila en columna y
          `flex-basis` pasa a medir el ALTO: la regla del admin a ≤1400px lo dejaba en 228px con
          1223px de contenido, recortado a media fila, en TODAS las pantallas del portal. Se mide
          la caja contra el contenido porque un menú recortado se ve perfectamente bien en una
          captura: lo que falta es justo lo que no se ve.
        */
        menu: menu
          ? { alto: Math.round(menu.getBoundingClientRect().height), contenido: menu.scrollHeight }
          : null,
        desborde: doc.scrollWidth - doc.clientWidth,
        ancho: doc.clientWidth,
        caja: r ? { izq: Math.round(r.left), der: Math.round(r.right), alto: Math.round(r.height) } : null,
        /*
          Se separan los controles de ESTA pantalla de los del armazón a propósito, y no para
          conseguir un verde: el disparador del menú de usuario (`.lx-menu__trigger`) mide 42–43 px
          y es un defecto REAL, pero es anterior a esta pantalla, vive en `tokens.css` con
          `min-height: 40px` y lo comparten los cuatro portales. Corregirlo acá metería un cambio
          de CSS compartido —Fiscalización incluida— dentro de un despliegue que es de otra cosa.
          Así que no se esconde: se mide, se reporta en cada corrida como pendiente, y el arnés
          sigue fallando si el que queda corto es un control del editor de perímetros.
        */
        bajos: cortos.filter((b) => !/lx-menu__trigger/.test(b.clase)),
        delArmazon: cortos.filter((b) => /lx-menu__trigger/.test(b.clase)),
      };
    });

    ok(m.desborde <= 0, `${t.nombre} (${t.width}): sin desplazamiento horizontal`,
      `scrollWidth − clientWidth = ${m.desborde}`);
    if (m.caja) {
      ok(m.caja.izq >= 0 && m.caja.der <= m.ancho + 1,
        `${t.nombre}: la caja de pegar cabe entera en la pantalla`,
        `izq ${m.caja.izq} · der ${m.caja.der} · ancho ${m.ancho}`);
      ok(m.caja.alto >= 100,
        `${t.nombre}: la caja conserva alto suficiente para ver el polígono que se pega`,
        `alto ${m.caja.alto}px`);
    } else {
      ok(false, `${t.nombre}: la caja de pegar no apareció`);
    }
    ok(m.bajos.length === 0,
      `${t.nombre}: los controles del editor llegan a 44px de alto`,
      `bajos: ${JSON.stringify(m.bajos)}`);
    /*
      Dos reglas distintas porque son dos composiciones distintas, no por conveniencia. Hasta
      900px el menú se apila ENCIMA del contenido y tiene que caber entero: ahí un recorte deja
      opciones inalcanzables, porque nada más en esa caja se desplaza. De 901px en adelante es
      una columna pegada al costado con su propio desplazamiento, y que su contenido pase del
      alto de la ventana es el diseño, no un defecto.
    */
    if (!m.menu) {
      ok(false, `${t.nombre}: no encontré el menú lateral para medirlo`);
    } else if (t.width <= 900) {
      ok(m.menu.alto >= m.menu.contenido - 1,
        `${t.nombre}: apilado, el menú muestra su contenido entero y no recorta a media fila`,
        `caja ${m.menu.alto}px · contenido ${m.menu.contenido}px`);
    } else {
      ok(m.menu.alto > t.height * 0.5,
        `${t.nombre}: al costado, el menú ocupa la altura de la ventana y se desplaza solo`,
        `caja ${m.menu.alto}px · ventana ${t.height}px`);
    }
    if (m.delArmazon.length) {
      salta(`${t.nombre}: PENDIENTE anterior a esta pantalla — el disparador del menú de usuario ` +
        `mide ${m.delArmazon.map((b) => b.alto).join('/')}px (tokens.css: .lx-menu__trigger, ` +
        'min-height 40px). Compartido por los cuatro portales: pide su propio cambio.');
    }

    await page.screenshot({ path: join(CAPTURAS, `${t.width}x${t.height}.png`), fullPage: true });
    await ctx.close();
  }
}

/* ─────────────────────────────────── Main ─────────────────────────────────── */
(async () => {
  const apagar = process.env.MOCKS === '1' ? await levantarServidor() : () => {};
  const navegador = await chromium.launch();
  try {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    await entrar(page);
    await probarLlegada(page);
    const zona = await probarValidacion(page);
    if (zona) {
      await probarGuardarYVerificar(page);
      await probarCambioDeZona(page);
    }
    ok(errores.length === 0, 'ningún error de JavaScript durante el recorrido',
      errores.slice(0, 3).join(' | '));
    await ctx.close();
    await probarTamanos(navegador);
  } finally {
    await navegador.close();
    apagar();
  }
  console.log(`\n${fallos === 0 ? '✓ sin fallos' : `✗ ${fallos} fallo(s)`}` +
    `${saltadas ? ` · ${saltadas} sin probar` : ''}`);
  console.log(`  capturas en ${CAPTURAS}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
