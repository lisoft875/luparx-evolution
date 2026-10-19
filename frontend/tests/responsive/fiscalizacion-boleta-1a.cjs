/**
 * Fase 1A de Inspector: lo que ahora se bloquea, lo que ahora sobrevive, y el choque entre un
 * borrador y una consulta de placa.
 *
 * DOS MODOS, y la diferencia importa.
 *
 *   1) CONTRA EL CÓDIGO DE LA FASE 1A (es el que hay que usar hoy):
 *
 *        cd ~/Development/Proyectos/luparx-evolution/frontend && MOCKS=1 node tests/responsive/fiscalizacion-boleta-1a.cjs
 *
 *      El arnés levanta él mismo el servidor de desarrollo con el transporte simulado
 *      (`VITE_USE_MOCKS=true`), espera a que escuche, corre, y lo apaga al terminar. No toca
 *      `apps/inspector/.env`: la variable va por el entorno del proceso, que Vite también lee.
 *      No necesita backend, no necesita staging, y no publica ni despliega nada.
 *
 *      La cuenta es la semilla del transporte simulado que el propio `frontend/README.md`
 *      documenta, y la contraseña se LEE de esa tabla en tiempo de ejecución: este archivo no
 *      guarda ninguna credencial y el comando no lleva ninguna.
 *
 *   2) CONTRA STAGING (sirve el build ANTERIOR mientras la Fase 1A siga sin desplegar):
 *
 *        BASE=https://staging.luparx.com PASS=... node tests/responsive/fiscalizacion-boleta-1a.cjs
 *
 *      Útil para comprobar regresiones del build publicado, NO para dar por probada la Fase 1A.
 *      El arnés lo dice solo: si la huella de la Fase 1A no aparece, se detiene.
 *
 * SÓLO CORRE EN LA MAC. Los binarios de Playwright del proyecto son darwin-arm64, y la máquina
 * puente es aarch64 Linux sin navegador: su caché de Playwright está vacía y el CDN que lo
 * descarga responde 000, igual que staging. Comprobado, no recordado.
 *
 * NO EMITE NINGUNA BOLETA. Llega a comprobar que el botón se habilita y ahí se detiene: emitir
 * escribiría un acto administrativo, y esto es una prueba.
 *
 * Qué comprueba, y por qué cada cosa:
 *
 *   0. HUELLA DE LA FASE 1A. Antes de medir nada se confirma que el código servido es el nuevo:
 *      el borrador escribe una clave que el build anterior no escribe nunca. Sin esa huella el
 *      arnés se detiene, para no informar como probado lo que se probó contra otro código.
 *   1. BAHÍA INCOMPLETA BLOQUEA. Antes se descartaban zona y bahía en silencio y la boleta salía
 *      sin ubicación.
 *   2. La pareja COMPLETA vuelve a habilitar, y quitar la bahía bloquea otra vez.
 *   3. FALTA LA FOTOGRAFÍA: con un tipo que la exige y sin foto, bloquea y lo dice.
 *   4. EL BORRADOR SOBREVIVE A UNA RECARGA, con su hora y con lo que trae.
 *   5. EL CHOQUE CON LA CONSULTA, los dos caminos: seguir con la consulta, y retomar el borrador
 *      reemplazando. En ninguno se mezclan datos de dos vehículos.
 *   6. ALMACENAMIENTO ROTO: la pantalla avisa en vez de afirmar que quedó guardado.
 *   7. LA OFERTA EN SIETE TAMAÑOS, de 320×568 a 1920×1080.
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const net = require('node:net');

const MOCKS = process.env.MOCKS === '1';
const RAIZ = join(__dirname, '..', '..');
const PUERTO = 5185;
const BASE = process.env.BASE || (MOCKS ? `http://localhost:${PUERTO}` : 'https://staging.luparx.com');
/* El prefijo de ruta no es el mismo en los dos sitios: el servidor de desarrollo sirve en `/`,
   y nginx publica el portal bajo `/inspector/`. Se deduce del propio BASE. */
const RUTA = /localhost|127\.0\.0\.1/.test(BASE) ? '' : '/inspector';

/**
 * La cuenta de prueba. En modo simulado sale de la tabla del README del repositorio, que es
 * donde ya vive; así este archivo no se convierte en una copia más de una credencial.
 */
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

let CUENTA = process.env.CUENTA || 'inspector@luparx.test';
let PASS = process.env.PASS || '';
if (MOCKS && !PASS) {
  const c = cuentaSimulada();
  CUENTA = process.env.CUENTA || c.correo;
  PASS = c.clave;
}
if (!PASS || /^<.*>$/.test(PASS)) {
  console.error('✗ Falta la contraseña. Contra la Fase 1A usá:  MOCKS=1 node tests/responsive/fiscalizacion-boleta-1a.cjs');
  process.exit(2);
}

const PLACA_BORRADOR = 'BKZ987';
const CONSULTA = 'ABC123';

let fallos = 0;
let saltadas = 0;
const ok = (c, bien, mal = '') => {
  if (c) console.log(`  ok  ${bien}`);
  else { fallos += 1; console.log(`  ✗   ${bien}${mal ? `\n        ${mal}` : ''}`); }
};
/** Lo que NO se pudo probar se dice, no se aprueba por omisión. */
const salta = (motivo) => { saltadas += 1; console.log(`  ··  SIN PROBAR: ${motivo}`); };
const visible = (loc) => loc.first().isVisible().catch(() => false);
const donde = (page) => page.evaluate(() => ({
  ruta: location.pathname,
  h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 40),
  hayPassword: Boolean(document.querySelector('input[type=password]')),
  raizVacia: (document.getElementById('root')?.childElementCount ?? 0) === 0,
}));
const campoPlaca = (page) => page.getByLabel(/placa|plate/i).first();
const hayBorradorGuardado = (page) => page.evaluate(() =>
  Object.keys(window.localStorage).some((k) => k.startsWith('luparx.inspector.citationDraft')));

/*
  Zona y tipo NO son `<select>` nativos. Son el combobox del sistema de diseño
  (`packages/ui/src/components/Select.tsx`): un `button` con su rótulo accesible que abre, en un
  portal, un `[role=listbox]` con sus `[role=option]`. Buscarlos como `select` es lo que hacía
  que estas comprobaciones salieran SIN PROBAR. Las aserciones no cambian; cambia cómo se
  alcanza el control.

  Un fallo al abrir o al elegir NO se convierte en un skip: se deja reventar, y quien llama lo
  anota como comprobación fallida.
*/
const listaAbierta = (page) => page.locator('[role=listbox]').first();
const opcionesAbiertas = (page) => page.locator('[role=listbox] [role=option]');

async function cerrarLista(page, disparador) {
  if (!(await listaAbierta(page).isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  if (await listaAbierta(page).isVisible().catch(() => false)) await disparador.click();
  await listaAbierta(page).waitFor({ state: 'hidden', timeout: 5000 });
}

/** Los rótulos de un desplegable, dejándolo cerrado como estaba. */
async function rotulosDe(page, disparador) {
  await disparador.click();
  await listaAbierta(page).waitFor({ state: 'visible', timeout: 5000 });
  const rotulos = (await opcionesAbiertas(page).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await cerrarLista(page, disparador);
  return rotulos;
}

/**
 * Deja elegido un tipo de infracción que NO exija fotografía, y dice cuál.
 *
 * <p>Hace falta para medir la BAHÍA y nada más. «Emitir» se inhabilita por varias razones a la
 * vez; si el tipo elegido exige una foto que no hay, el botón sigue inhabilitado con la pareja
 * zona+bahía completa y la comprobación de la bahía mediría la fotografía. La versión anterior
 * de este arnés tenía el mismo defecto latente —`selectOption({ index: 1 })` caía en el primer
 * tipo real, que en este catálogo es justo el que pide foto—, pero nunca llegó a ejecutarse.</p>
 *
 * @returns el índice elegido, o `null` si todos los tipos exigen fotografía.
 */
async function elegirTipoSinFoto(page, tipo) {
  const cuantos = (await rotulosDe(page, tipo)).length;
  for (let i = 0; i < cuantos; i += 1) {
    await elegirEnDesplegable(page, tipo, i);
    await page.waitForTimeout(400);
    if (!(await page.getByText(/[Ff]alta la fotograf[íi]a/).first().isVisible().catch(() => false))) {
      return i;
    }
  }
  return null;
}

/** Elige la opción `indice` de ESE desplegable (las opciones salen del listbox abierto). */
async function elegirEnDesplegable(page, disparador, indice) {
  await disparador.click();
  await listaAbierta(page).waitFor({ state: 'visible', timeout: 5000 });
  const total = await opcionesAbiertas(page).count();
  if (indice >= total) throw new Error(`se pidió la opción ${indice} y sólo hay ${total}`);
  await opcionesAbiertas(page).nth(indice).click();
  await listaAbierta(page).waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(300);
}

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

/** Levanta el servidor de desarrollo con el transporte simulado. Devuelve cómo apagarlo. */
async function levantarServidor() {
  if (await puertoOcupado(PUERTO)) {
    console.log(`  ··  ya hay algo escuchando en :${PUERTO}; se usa eso y no se levanta otro`);
    return () => {};
  }
  console.log(`  ··  levantando el servidor de desarrollo en :${PUERTO} con transporte simulado…`);
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/inspector'], {
    cwd: RAIZ,
    // Vite también lee las VITE_* del entorno del proceso: así no se toca `apps/inspector/.env`.
    env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const salida = [];
  hijo.stdout.on('data', (d) => salida.push(String(d)));
  hijo.stderr.on('data', (d) => salida.push(String(d)));
  const vivo = await esperarPuerto(PUERTO, 90000);
  if (!vivo) {
    console.error('✗ El servidor de desarrollo no llegó a escuchar en 90 s. Últimas líneas:\n' +
      salida.join('').split('\n').slice(-12).join('\n'));
    try { hijo.kill('SIGTERM'); } catch { /* ya no está */ }
    process.exit(1);
  }
  return () => { try { hijo.kill('SIGTERM'); } catch { /* ya no está */ } };
}

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
  if (cod === 429) { console.error('✗ 429: limitador. NO reintentes; rotá CUENTA.'); process.exit(1); }

  // Con varias municipalidades el portal pide elegir una antes de dejar pasar.
  const d = await donde(page);
  if (/select-tenant/.test(d.ruta)) {
    const opcion = page.locator('button, [role=button], a').filter({ hasText: /continuar|seleccionar|entrar/i }).first();
    if (await opcion.count()) { await opcion.click(); await page.waitForTimeout(1800); }
  }
  const tras = await donde(page);
  if (tras.hayPassword) { console.error(`✗ Sigue en el login (código ${cod}).`); process.exit(1); }
  ok(true, `entró (${cod || 'simulado'}) · ${BASE}${RUTA || '/'}`);
}

/** Deja un borrador guardado para `placa` y devuelve `true` si el autoguardado lo aceptó. */
async function dejarBorrador(page, placa) {
  await page.goto(`${BASE}${RUTA}/cite`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const descartar = page.getByRole('button', { name: /descartarla|discard it|seguir con esta consulta|carry on with this lookup/i });
  if (await descartar.count()) { await descartar.first().click(); await page.waitForTimeout(600); }
  await campoPlaca(page).fill(placa);
  await page.waitForTimeout(1400);                       // el autoguardado tiene 800 ms de retardo
  return hayBorradorGuardado(page);
}

(async () => {
  console.log(`\n══ Fase 1A · boleta · ${BASE}${RUTA || ''} ${MOCKS ? '(transporte simulado)' : ''} ══`);
  const apagar = MOCKS ? await levantarServidor() : () => {};
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ locale: 'es-CR', viewport: { width: 768, height: 1024 } });
  const page = await ctx.newPage();
  const consola = [];
  page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 120)); });
  const terminar = async (codigo) => { await ctx.close().catch(() => {}); await navegador.close().catch(() => {}); apagar(); process.exit(codigo); };

  await entrar(page);

  // ───────────────── 0. La huella: ¿esto es el código de la Fase 1A? ─────────────────
  /*
    El build anterior no tiene borrador: nunca escribe `luparx.inspector.citationDraft.*`. Si la
    clave no aparece tras escribir una placa, lo que se está probando NO son los cambios de la
    Fase 1A, y seguir seria informar como probado algo que se probó contra otro código.
  */
  console.log('\n── la huella de la Fase 1A ──');
  const huella = await dejarBorrador(page, PLACA_BORRADOR);
  if (!huella) {
    console.error(
      '✗ DETENIDO: el código servido NO contiene los cambios de la Fase 1A.\n' +
      '    Tras escribir una placa no se escribió ninguna clave `luparx.inspector.citationDraft.*`,\n' +
      '    que es la huella del borrador introducido en esta fase.\n' +
      `    Entorno probado: ${BASE}${RUTA || ''}\n` +
      '    Para probar la Fase 1A: MOCKS=1 node tests/responsive/fiscalizacion-boleta-1a.cjs',
    );
    await terminar(1);
  }
  ok(true, 'el código servido escribe el borrador: son los cambios de la Fase 1A');

  // ───────────────────────── 1 y 2. La bahía ─────────────────────────
  console.log('\n── la bahía ──');
  await page.goto(`${BASE}${RUTA}/cite`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const descartarPrevio = page.getByRole('button', { name: /descartarla|discard it/i });
  if (await descartarPrevio.count()) { await descartarPrevio.first().click(); await page.waitForTimeout(600); }
  const d1 = await donde(page);
  ok(!d1.hayPassword && !d1.raizVacia, `/cite abre («${d1.h1}»)`, JSON.stringify(d1));

  const emitir = page.locator('button[type=submit]').last();
  /*
    El disparador se declara `role="combobox"` (Select.tsx), no `button`: buscarlo como botón
    tampoco lo encuentra. Se alcanza por su rol real y su rótulo accesible; la bahía sigue
    siendo un `input` de verdad y su localizador no cambia.
  */
  const zona = page.getByRole('combobox', { name: /^Zona$/i });
  const bahia = page.getByLabel(/bah[ií]a|space/i).first();
  const tipo = page.getByRole('combobox', { name: /Tipo de infracci[óo]n/i });

  await campoPlaca(page).fill('BKZ123');
  /*
    Para medir la BAHÍA hay que quitar del medio las demás razones por las que «Emitir» se
    inhabilita. La fotografía tiene su propia sección más abajo; acá estorba.
  */
  const tipoSinFoto = (await tipo.count()) ? await elegirTipoSinFoto(page, tipo) : null;
  if (tipoSinFoto === null && (await tipo.count())) {
    console.log('  ··  todos los tipos de este catálogo exigen fotografía');
  }

  if (!(await zona.count()) || !(await bahia.count())) {
    salta('la pantalla no expone zona y bahía');
  } else if (tipoSinFoto === null) {
    salta('todos los tipos exigen fotografía: «Emitir» no puede habilitarse y la bahía no se puede medir sola');
  } else {
    const zonasDelCatalogo = await rotulosDe(page, zona);
    if (zonasDelCatalogo.length > 0) {
      try {
        await elegirEnDesplegable(page, zona, 0);        // zona SIN bahía
        await page.waitForTimeout(500);
        ok(await emitir.isDisabled(), 'con zona y sin bahía, «Emitir» queda inhabilitado');
        ok(await visible(page.getByText(/mitad de la ubicaci[óo]n|zona y la bah[ií]a/i)),
           'y la pantalla dice por qué');

        await bahia.fill('A-01');                        // pareja COMPLETA
        await page.waitForTimeout(600);
        ok(!(await emitir.isDisabled()), 'con la pareja completa vuelve a habilitarse (una boleta válida puede avanzar)');

        await bahia.fill('');                            // y al quitarla, bloquea otra vez
        await page.waitForTimeout(500);
        ok(await emitir.isDisabled(), 'al borrar la bahía bloquea de nuevo');
      } catch (e) {
        // Un fallo al manejar el control es un FALLO, no un «sin probar».
        ok(false, 'el control de zona se pudo manejar', String((e && e.message) || e).slice(0, 200));
      }
    } else {
      salta('esta municipalidad no tiene zonas conocidas: la bahía no se puede probar');
    }
  }

  // ───────────────────────── 3. La fotografía que falta ─────────────────────────
  console.log('\n── la fotografía ──');
  if (await tipo.count()) {
    try {
      const tipos = await rotulosDe(page, tipo);
      console.log(`  ··  ${tipos.length} tipo(s) en el catálogo de este entorno`);
      let exigeFoto = false;
      for (let i = 0; i < tipos.length; i += 1) {
        await elegirEnDesplegable(page, tipo, i);
        await page.waitForTimeout(400);
        if (await visible(page.getByText(/[Ff]alta la fotograf[íi]a/))) { exigeFoto = true; break; }
      }
      if (exigeFoto) {
        ok(true, 'con un tipo que exige fotografía y sin foto, la pantalla lo dice');
        ok(await emitir.isDisabled(), 'y «Emitir» queda inhabilitado');
      } else {
        salta('ningún tipo del catálogo de este entorno exige fotografía');
      }
    } catch (e) {
      ok(false, 'el catálogo de tipos se pudo recorrer', String((e && e.message) || e).slice(0, 200));
    }
  } else {
    salta('la pantalla no expone el catálogo de tipos');
  }

  // ───────────────────────── 4. El borrador sobrevive a la recarga ─────────────────────────
  console.log('\n── el borrador y la recarga ──');
  const guardado = await dejarBorrador(page, PLACA_BORRADOR);
  ok(guardado, 'el borrador queda escrito en el aparato');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const d2 = await donde(page);
  ok(!d2.hayPassword, 'tras la recarga sigue con sesión', JSON.stringify(d2));
  ok(await visible(page.getByText(/sin terminar|unfinished/i)), 'la pantalla ofrece retomar el borrador');
  ok(await visible(page.getByText(/[Tt]rae la placa|[Ii]t carries plate/)), 'y dice qué trae');
  const retomar = page.getByRole('button', { name: /retomarla|pick it up/i }).first();
  if (await retomar.count()) {
    await retomar.click();
    await page.waitForTimeout(1000);
    const placa = await campoPlaca(page).inputValue();
    ok(placa.toUpperCase().includes(PLACA_BORRADOR), `y al retomarlo vuelve la placa («${placa}»)`);
  } else {
    salta('no apareció el botón de retomar');
  }

  // ─────────────── 5. El choque entre el borrador y la consulta de placa ───────────────
  /*
    Se llega por el camino real: la consulta de placa y su botón «emitir boleta», que es el único
    que pone datos preseleccionados en /cite. La consulta vive en la raíz del portal, no en
    `/lookup`. Si el veredicto de la placa no ofrece ese botón, se dice SIN PROBAR en vez de
    empujar estado al router a mano.
  */
  console.log('\n── el choque con la consulta de placa ──');
  async function llegarDesdeConsulta(placaConsulta) {
    await page.goto(`${BASE}${RUTA}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const campo = page.getByLabel(/placa|plate/i).first();
    if (!(await campo.count())) return null;
    await campo.fill(placaConsulta);
    const consultar = page.locator('button[type=submit]').first();
    if (!(await consultar.count())) return null;
    await consultar.click();
    await page.waitForTimeout(3000);
    const boton = page.getByRole('button', { name: /emitir boleta|write a citation|emitir/i }).last();
    if (!(await boton.count()) || !(await boton.isVisible().catch(() => false))) return null;
    await boton.click();
    await page.waitForTimeout(2000);
    return (await donde(page)).ruta;
  }

  const hayBorrador = await dejarBorrador(page, PLACA_BORRADOR);
  const ruta = hayBorrador ? await llegarDesdeConsulta(CONSULTA) : null;

  if (!hayBorrador) {
    salta('no se pudo dejar el borrador previo: el choque no se puede montar');
  } else if (!ruta || !/\/cite/.test(ruta)) {
    salta(`la consulta de ${CONSULTA} no ofreció «emitir boleta» (veredicto sin boleta, o sin datos en este entorno)`);
  } else {
    const placaAlLlegar = await campoPlaca(page).inputValue();
    ok(placaAlLlegar.toUpperCase().includes(CONSULTA),
       `al llegar, la placa es la de la consulta y no la del borrador («${placaAlLlegar}»)`);
    ok(await visible(page.getByText(/es de otra placa|different plate/i)),
       'la pantalla declara que el borrador es de otra placa');
    ok(await visible(page.getByText(new RegExp(PLACA_BORRADOR, 'i'))), 'y nombra la placa del borrador');
    ok(await visible(page.getByText(/el borrador se descarta|discards the draft/i)),
       'y avisa que seguir con la consulta descarta el borrador');

    // ── Camino A: seguir con la consulta ──
    const seguir = page.getByRole('button', { name: /seguir con esta consulta|carry on with this lookup/i }).first();
    if (await seguir.count()) {
      await seguir.click();
      await page.waitForTimeout(1000);
      const tras = await campoPlaca(page).inputValue();
      ok(tras.toUpperCase().includes(CONSULTA), `camino A: la placa de la consulta se conserva («${tras}»)`);
      ok(!(await visible(page.getByText(/es de otra placa|different plate/i))), 'camino A: la oferta desaparece');
      const contenido = await page.evaluate(() => {
        const k = Object.keys(window.localStorage).find((x) => x.startsWith('luparx.inspector.citationDraft'));
        return k ? window.localStorage.getItem(k) : null;
      });
      ok(contenido === null || !new RegExp(PLACA_BORRADOR, 'i').test(contenido),
         'camino A: el borrador del otro vehículo ya no está guardado');
    } else {
      salta('camino A: no apareció «seguir con esta consulta»');
    }

    // ── Camino B: retomar el borrador reemplazando ──
    const otraVez = await dejarBorrador(page, PLACA_BORRADOR);
    const ruta2 = otraVez ? await llegarDesdeConsulta(CONSULTA) : null;
    if (!ruta2 || !/\/cite/.test(ruta2)) {
      salta('camino B: no se pudo volver a montar el choque');
    } else {
      const reemplazar = page.getByRole('button', { name: /retomar el borrador y reemplazar|pick up the draft and replace/i }).first();
      if (await reemplazar.count()) {
        await reemplazar.click();
        await page.waitForTimeout(1400);
        const tras = await campoPlaca(page).inputValue();
        ok(tras.toUpperCase().includes(PLACA_BORRADOR), `camino B: la placa pasa a ser la del borrador («${tras}»)`);
        ok(!tras.toUpperCase().includes(CONSULTA), 'camino B: y la de la consulta NO queda mezclada');
        ok(!(await visible(page.getByText(/es de otra placa|different plate/i))), 'camino B: la oferta desaparece');
      } else {
        salta('camino B: no apareció «retomar el borrador y reemplazar»');
      }
    }
  }

  // ───────────────────────── 6. El almacenamiento roto ─────────────────────────
  // Se rompe SÓLO para las claves del inspector: romper `setItem` entero tiraría la sesión y la
  // prueba mediría el login en vez del aviso.
  console.log('\n── el almacenamiento que no guarda ──');
  /*
    Se hereda la SESIÓN pero NO el borrador.

    `storageState()` copia todo el `localStorage`, incluida la clave
    `luparx.inspector.citationDraft.<tenant>` que dejaron las secciones anteriores. Con un
    borrador presente, `/cite` dibuja la oferta «¿retomar?», y mientras esa oferta está sin
    contestar la pantalla NO autoguarda a propósito (`NewCitationPage.tsx`, «si hay borrador
    previo, no se guarda»). Resultado: el `setItem` roto de abajo no se invocaba NI UNA VEZ, el
    aviso no podía aparecer, y la clave que la prueba encontraba era la heredada, no una
    escritura. Las dos comprobaciones fallaban por el escenario, no por el producto.

    No se puede soltar el `localStorage` entero: la sesión vive ahí (`luparx.auth.inspector.v1`),
    y entonces esto mediría el login.
  */
  const estadoHeredado = await ctx.storageState();
  for (const origen of estadoHeredado.origins ?? []) {
    origen.localStorage = (origen.localStorage ?? [])
      .filter((entrada) => !entrada.name.startsWith('luparx.inspector.citationDraft'));
  }
  const ctx2 = await navegador.newContext({
    locale: 'es-CR', viewport: { width: 768, height: 1024 }, storageState: estadoHeredado,
  });
  await ctx2.addInitScript(() => {
    // Se cuenta cuántas veces se provoca el fallo: sin esa cuenta no hay forma de distinguir
    // «la pantalla aguantó el fallo» de «el fallo nunca llegó a ocurrir», que es justo el agujero
    // por el que esta prueba pasó meses midiendo otra cosa.
    window.__fallosDeEscritura = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (clave, valor) {
      if (typeof clave === 'string' && /^luparx\.inspector\.(citationDraft|citationQueue)/.test(clave)) {
        window.__fallosDeEscritura += 1;
        throw new DOMException('Cuota llena (simulado por el arnés)', 'QuotaExceededError');
      }
      return original.call(this, clave, valor);
    };
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}${RUTA}/cite`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2000);
  const d3 = await donde(p2);
  if (d3.hayPassword) {
    salta('al romper el almacenamiento la sesión no sobrevivió: el aviso no se puede medir así');
  } else {
    const heredado = await p2.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith('luparx.inspector.citationDraft')));
    ok(heredado.length === 0, 'el contexto no heredó ningún borrador: el escenario arranca limpio',
       JSON.stringify(heredado));

    await p2.getByLabel(/placa|plate/i).first().fill('ZZZ111');
    await p2.waitForTimeout(1800);
    const intentos = await p2.evaluate(() => window.__fallosDeEscritura);
    ok(intentos > 0, 'el fallo de escritura simulado se ejecutó de verdad',
       `veces que se provocó: ${intentos}`);
    ok(await visible(p2.getByText(/no est[áa] guardando|is not saving/i)),
       'la pantalla dice que el aparato no está guardando');
    ok(!(await visible(p2.getByText(/guardada para enviar|saved to send|qued[óo] guardada/i))),
       'y NO afirma que la boleta quedó guardada');
    const persistido = await p2.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.startsWith('luparx.inspector.citationDraft')));
    ok(!persistido, 'y en efecto no hay nada escrito: el aviso corresponde a la realidad');
  }
  await ctx2.close();

  // ─────────────── 7. La oferta del borrador en varios tamaños ───────────────
  // El bloque nuevo son dos botones y hasta cuatro líneas de texto dentro de un Alert: justo la
  // forma que se desborda en un teléfono estrecho. Se mide en siete tamaños, no en uno.
  console.log('\n── la oferta del borrador, tamaño por tamaño ──');
  const TAMANOS = [
    ['móvil chico', 320, 568], ['móvil estándar', 390, 844], ['móvil grande', 430, 932],
    ['tableta vertical', 768, 1024], ['tableta horizontal', 1024, 768],
    ['portátil', 1366, 768], ['escritorio grande', 1920, 1080],
  ];
  const conOferta = await dejarBorrador(page, PLACA_BORRADOR);
  if (!conOferta) {
    salta('sin borrador guardado no hay oferta que medir');
  } else {
    for (const [nombre, w, h] of TAMANOS) {
      await page.setViewportSize({ width: w, height: h });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const oferta = page.getByText(/sin terminar|unfinished/i).first();
      if (!(await oferta.isVisible().catch(() => false))) {
        salta(`${nombre} (${w}×${h}): la oferta no apareció`);
        continue;
      }
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        const botones = [...document.querySelectorAll('button')]
          .filter((b) => /[Rr]etomar|[Dd]escartar|[Ss]eguir con|[Pp]ick it up|[Dd]iscard|[Cc]arry on/.test(b.textContent || ''))
          .map((b) => { const r = b.getBoundingClientRect(); return { alto: Math.round(r.height), dentro: r.left >= -1 && r.right <= window.innerWidth + 1 }; });
        return {
          hScroll: d.scrollWidth > window.innerWidth + 1,
          botones,
          chicos: botones.filter((b) => b.alto < 44).length,
          fuera: botones.filter((b) => !b.dentro).length,
        };
      });
      console.log(`  ${nombre} (${w}×${h}) · ${m.botones.length} botón(es), altos ${m.botones.map((b) => b.alto).join('/')}`);
      ok(!m.hScroll, `  ${nombre}: sin scroll horizontal`);
      ok(m.botones.length >= 2, `  ${nombre}: los dos botones de la oferta están dibujados`);
      ok(m.fuera === 0, `  ${nombre}: ningún botón se sale del ancho`);
      ok(m.chicos === 0, `  ${nombre}: ningún botón bajo 44 px`, JSON.stringify(m.botones));
    }
    await page.setViewportSize({ width: 768, height: 1024 });
  }

  if (consola.length) console.log(`\n  ··  errores de consola: ${consola.slice(0, 3).join(' | ')}`);
  console.log(
    `\n${fallos === 0 ? '✓ Fase 1A verde' : `✗ ${fallos} comprobación(es) fallaron`}` +
    `${saltadas ? ` · ${saltadas} sin probar (ver arriba)` : ''}\n`,
  );
  await terminar(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error('✗ ', e); process.exit(1); });
