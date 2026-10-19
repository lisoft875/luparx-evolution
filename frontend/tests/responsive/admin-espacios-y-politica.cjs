/**
 * Las dos correcciones del 16-10-2026 en el portal del administrador, probadas de verdad.
 *
 * <h2>Qué corrige cada una</h2>
 *
 * <p><b>Espacios.</b> Para llegar a una bahía había que escoger primero su zona y luego recorrer
 * las páginas de la tabla. Con cien mil bahías eso no es una molestia, es un callejón. Ahora hay un
 * campo que busca por el PRINCIPIO del código <b>en toda la municipalidad</b> —el código es único
 * dentro de ella, así que no hace falta saber de antemano en qué zona está— y al escoger una
 * sugerencia la tabla muestra esa bahía y nada más.</p>
 *
 * <p><b>Política de parqueo.</b> Al pulsar una duración, la duración desaparecía sin decir nada.
 * Ahora se pregunta antes, nombrando la duración, y nada cambia hasta que se confirma. La versión
 * con <i>Deshacer</i> se probó el 16-10-2026 y el usuario pidió el diálogo en su lugar el
 * 19-10-2026: quitar una duración de la lista que ve el ciudadano no es una acción para hacer de
 * refilón.</p>
 *
 * <h2>Cómo correrlo</h2>
 *
 * <pre>
 *   cd ~/Development/Proyectos/luparx-evolution/frontend
 *   MOCKS=1 node tests/responsive/admin-espacios-y-politica.cjs
 * </pre>
 *
 * <p>Con {@code MOCKS=1} levanta el servidor de desarrollo del portal del administrador contra el
 * transporte simulado (`VITE_USE_MOCKS=true`), espera a que escuche, corre y lo apaga al terminar.
 * No toca staging, ni producción, ni ninguna base de datos. Nada se guarda: la política se edita en
 * memoria y el arnés NUNCA pulsa Guardar.</p>
 *
 * <p>La contraseña de la cuenta simulada sale de la tabla de `frontend/README.md`, que es donde ya
 * vive; este archivo no la copia.</p>
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const net = require('node:net');

const MOCKS = process.env.MOCKS === '1';
const RAIZ = join(__dirname, '..', '..');
const PUERTO = Number(process.env.PUERTO || 5186);
const BASE = process.env.BASE || `http://localhost:${PUERTO}`;
const RUTA = /localhost|127\.0\.0\.1/.test(BASE) ? '' : '/admin';

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
  console.error('✗ Falta la contraseña. Usá:  MOCKS=1 node tests/responsive/admin-espacios-y-politica.cjs');
  process.exit(2);
}

/* Los tamaños que exige la guía del proyecto. Los dos primeros son los que de verdad duelen. */
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

/*
  Se prueban las DOS familias. Vite escucha en `localhost`, y según cómo resuelva esa máquina el
  nombre eso puede ser 127.0.0.1 o ::1. Probando sólo IPv4, el arnés declara «no llegó a escuchar»
  con el servidor levantado — medido el 18-10-2026 en los otros cuatro arneses.
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

const buscador = (page) => page.getByRole('combobox', { name: /buscar por código/i }).first();
const opciones = (page) => page.getByRole('option');
/** Los códigos que muestra la tabla, en orden. */
const filas = (page) => page.evaluate(() =>
  [...document.querySelectorAll('tbody tr')]
    .map((tr) => (tr.querySelector('td')?.textContent ?? '').trim())
    .filter(Boolean));

async function escribir(page, texto) {
  await buscador(page).fill(texto);
  await page.waitForTimeout(900);           // 250 ms de retardo + la consulta
}

/* ─────────────────────────────── Espacios ─────────────────────────────── */
async function probarEspacios(page) {
  console.log('\n── Espacios · buscar por código ──');
  await page.goto(`${BASE}${RUTA}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  ok(await buscador(page).isVisible().catch(() => false),
    'el campo de búsqueda está ANTES de escoger zona (que es cuando hace falta)');

  await escribir(page, 'L');
  ok((await opciones(page).count()) === 0, 'con un solo carácter no se busca nada');

  await escribir(page, 'LUP');
  const cuantas = await opciones(page).count();
  ok(cuantas === 10, `doce bahías con ese prefijo, se ofrecen diez (ofrecidas: ${cuantas})`);
  ok(await page.getByText(/hay más/i).first().isVisible().catch(() => false),
    'y se avisa de que hay más en vez de callarlo');

  // La prueba que da sentido a todo: una bahía de una zona que NO está escogida.
  await escribir(page, 'LUP-0105');
  const unica = await opciones(page).count();
  ok(unica === 1, `«LUP-0105» deja una sola sugerencia (${unica})`);
  const conZona = await opciones(page).first().textContent();
  ok(/escalante/i.test(conZona ?? ''), 'la sugerencia dice en qué zona está la bahía',
    `texto de la sugerencia: ${JSON.stringify(conZona)}`);
  await opciones(page).first().click();
  await page.waitForTimeout(1600);

  const visibles = await filas(page);
  ok(visibles.length === 1 && /LUP-0105/.test(visibles[0]),
    'la tabla muestra ESA bahía y nada más', `filas: ${JSON.stringify(visibles)}`);
  const ruta = (await donde(page)).ruta;
  ok(/zone=zone-escalante/.test(ruta), 'y la zona de la bahía pasó a la URL', `ruta: ${ruta}`);
  ok((await page.getByRole('button', { name: /anterior|siguiente|previous|next/i }).count()) === 0,
    'sin paginación: una fila no se pagina');

  await page.getByRole('button', { name: /ver todas las bahías/i }).first().click();
  await page.waitForTimeout(1800);
  const tras = await filas(page);
  ok(tras.length === 9 && tras.every((c) => /^LUP-01/.test(c)),
    '«Ver todas» devuelve la zona entera (nueve bahías de Escalante)', `filas: ${JSON.stringify(tras)}`);
  ok((await buscador(page).inputValue()) === '', 'y el campo queda limpio');

  await escribir(page, 'ZZ');
  ok((await opciones(page).count()) === 0 &&
     (await page.getByText(/ninguna bahía empieza/i).first().isVisible().catch(() => false)),
    'un prefijo sin coincidencias lo dice, no deja la lista en blanco');

  // Teclado: flecha abajo y enter, sin tocar el ratón.
  await escribir(page, 'LUP-000');
  await buscador(page).press('ArrowDown');
  await buscador(page).press('Enter');
  await page.waitForTimeout(1600);
  const porTeclado = await filas(page);
  ok(porTeclado.length === 1 && /LUP-0001/.test(porTeclado[0]),
    'con flecha abajo y Enter se escoge la primera, sin ratón', `filas: ${JSON.stringify(porTeclado)}`);

  // Y el cambio de estado se ve en la fila, que es la trampa de mostrar una copia.
  const cambiar = page.getByRole('button', { name: /sacar de servicio|poner en servicio/i }).first();
  if (await cambiar.count()) {
    const antes = (await page.locator('tbody tr').first().textContent()) ?? '';
    await cambiar.click();
    await page.waitForTimeout(1600);
    const despues = (await page.locator('tbody tr').first().textContent()) ?? '';
    ok(antes !== despues, 'cambiar el estado de la bahía mostrada actualiza SU fila',
      `antes: ${antes.trim()} · después: ${despues.trim()}`);
  } else {
    salta('no apareció el botón de estado (¿permiso TENANT_MANAGE?)');
  }
}

/* ──────────────────── Política de parqueo · confirmación ──────────────────── */
async function probarPolitica(page) {
  console.log('\n── Política de parqueo · confirmación al quitar ──');
  await page.goto(`${BASE}${RUTA}/parking-policy`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  const chips = page.locator('button.lx-chip');
  const antes = await chips.count();
  if (antes === 0) { salta('la política no trajo ninguna duración que quitar'); return; }

  const etiqueta = (await chips.first().getAttribute('aria-label')) ?? '';
  const minutos = etiqueta.replace(/^quitar\s*/i, '').trim();
  await chips.first().click();
  await page.waitForTimeout(600);

  // Lo primero y más importante: tocar la ficha NO la quita.
  ok((await chips.count()) === antes,
    'tocar una duración no la quita: primero pregunta',
    `fichas ahora: ${await chips.count()} · antes: ${antes}`);

  const dialogo = page.getByRole('dialog').first();
  ok(await dialogo.isVisible().catch(() => false), 'aparece el diálogo de confirmación');
  const textoDialogo = (await dialogo.textContent()) ?? '';
  ok(minutos !== '' && textoDialogo.includes(minutos),
    'el diálogo nombra la duración exacta que se va a quitar',
    `diálogo: ${JSON.stringify(textoDialogo.slice(0, 120))} · esperaba contener ${JSON.stringify(minutos)}`);
  ok(/guard/i.test(textoDialogo),
    'y avisa que el cambio se aplica al guardar, no al quitar la ficha');

  // Cancelar no quita nada.
  await page.getByRole('button', { name: /^cancelar$/i }).first().click();
  await page.waitForTimeout(500);
  ok((await page.getByRole('dialog').count()) === 0, 'cancelar cierra el diálogo');
  ok((await chips.count()) === antes, 'y cancelar deja la duración donde estaba');

  // Confirmar sí la quita.
  await chips.first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^quitar$/i }).first().click();
  await page.waitForTimeout(600);
  ok((await page.getByRole('dialog').count()) === 0, 'confirmar cierra el diálogo');
  ok((await chips.count()) === antes - 1, 'y confirmar sí la quita de la lista');

  await page.reload({ waitUntil: 'domcontentloaded' });   // nada se guarda: se recarga y queda igual
  await page.waitForTimeout(2200);
  ok((await page.locator('button.lx-chip').count()) === antes,
    'nada de esto se guardó: al recargar la política está intacta');
}

/* ─────────────────────────────── Responsive ─────────────────────────────── */
async function probarTamanos(ctx) {
  console.log('\n── responsive · ocho tamaños ──');
  for (const t of TAMANOS) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(`${BASE}${RUTA}/spaces`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await buscador(page).fill('LUP');
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const campo = document.querySelector('.lx-combobox input');
      const lista = document.querySelector('.lx-combobox__lista');
      const r = campo ? campo.getBoundingClientRect() : null;
      const l = lista ? lista.getBoundingClientRect() : null;
      return {
        desborde: doc.scrollWidth - doc.clientWidth,
        alto: r ? Math.round(r.height) : 0,
        dentro: r ? r.left >= -1 && r.right <= doc.clientWidth + 1 : false,
        listaDentro: l ? l.left >= -1 && l.right <= doc.clientWidth + 1 : null,
        tapada: Boolean(l && r && l.top < r.bottom - 2),
      };
    });
    ok(m.desborde <= 1, `${t.nombre} · sin desplazamiento lateral`, `sobran ${m.desborde}px`);
    ok(m.alto >= 44, `${t.nombre} · el campo mide ${m.alto}px de alto (mínimo táctil 44)`);
    ok(m.dentro, `${t.nombre} · el campo cabe a lo ancho`);
    ok(m.listaDentro !== false, `${t.nombre} · la lista de sugerencias cabe a lo ancho`);
    ok(!m.tapada, `${t.nombre} · la lista queda DEBAJO del campo, no encima`);
    await page.close();
  }
}

(async () => {
  console.log(`\n══ Administrador · Espacios y Política · ${BASE}${RUTA || ''} ${MOCKS ? '(transporte simulado)' : ''} ══`);
  const apagar = MOCKS ? await levantarServidor() : () => {};
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ locale: 'es-CR', viewport: { width: 1280, height: 900 } });
  const errores = [];
  ctx.on('page', (p) => p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 140)); }));
  const page = await ctx.newPage();
  try {
    await entrar(page);
    await probarEspacios(page);
    await probarPolitica(page);
    await probarTamanos(ctx);
  } catch (e) {
    fallos += 1;
    console.log(`  ✗   el arnés se detuvo: ${e && e.message ? e.message : e}`);
  } finally {
    await navegador.close();
    apagar();
  }

  if (errores.length) {
    console.log('\n── errores de consola ──');
    for (const e of [...new Set(errores)].slice(0, 8)) console.log(`  ··  ${e}`);
  }
  console.log(`\n${fallos === 0 ? '✔ todo pasó' : `✗ ${fallos} fallo(s)`}${saltadas ? ` · ${saltadas} SIN PROBAR` : ''}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
