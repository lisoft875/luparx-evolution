/**
 * La lámina de revisión de «Mis vehículos» (22-10-2026).
 *
 * <h2>Qué es y qué NO es</h2>
 *
 * <p>Capturas del NAVEGADOR sobre el código local, con los WebP que están en el repositorio. No es
 * una composición, no es una maqueta y no hay ninguna imagen generada: lo que se ve es lo que la
 * aplicación dibuja hoy.</p>
 *
 * <p>Los vehículos de la lámina se registran POR LA INTERFAZ, con el mismo formulario que usa la
 * persona, contra el servidor simulado. Son <b>datos de prueba</b>: viven en la memoria de esa
 * pestaña y no quedan en el repositorio ni en ninguna base.</p>
 *
 * <h2>Los seis casos</h2>
 *
 * <p>Sedán · SUV · pick-up · hatchback · un color que sólo existe desde que se corrigió el catálogo
 * (beige o naranja) · y el respaldo, que es una motocicleta: la biblioteca no tiene carrocería de
 * moto, así que se dibuja. <b>Nunca una foto de automóvil para una moto.</b></p>
 *
 *   cd frontend && node tests/responsive/lamina-vehiculos.cjs
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

const PUERTO = 5195;
const BASE = `http://localhost:${PUERTO}`;
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;
const SALIDA = process.env.LX_CAPTURAS || path.join(RAIZ, '..', 'verificacion', 'lamina-vehiculos');

/**
 * Los vehículos que se registran para la lámina, y qué demuestra cada uno.
 *
 * <p>Los tipos son los DOS que el contrato tiene: `CAR` y `MOTORCYCLE`. Una pick-up se registra
 * como automóvil porque es lo único que el formulario permite, y es justamente lo que hace que el
 * caso valga: la forma sale del modelo, no del tipo.</p>
 */
const CASOS = [
  { placa: 'SED001', marca: 'Honda', modelo: 'Civic', anio: '2020', tipo: /Automóvil/, color: /^Negro$/,
    archivo: 'sedan-negro.webp', demuestra: 'sedán · modelo conocido' },
  { placa: 'SUV002', marca: 'Hyundai', modelo: 'Tucson', anio: '2022', tipo: /Automóvil/, color: /^Rojo$/,
    archivo: 'suv-compacta-rojo.webp', demuestra: 'SUV compacta' },
  { placa: 'PCK003', marca: 'Ford', modelo: 'Ranger Raptor', anio: '2023', tipo: /Automóvil/, color: /^Azul$/,
    archivo: 'pickup-azul.webp', demuestra: 'pick-up con versión · registrada CAR' },
  { placa: 'HAT004', marca: 'Suzuki', modelo: 'Swift GL Sport', anio: '2019', tipo: /Automóvil/, color: /^Beige$/,
    archivo: 'hatchback-beige.webp', demuestra: 'hatchback con acabado + BEIGE' },
  { placa: 'NAR005', marca: 'Kia', modelo: 'Picanto', anio: '2021', tipo: /Automóvil/, color: /^Naranja$/,
    archivo: 'hatchback-naranja.webp', demuestra: 'ORANGE, el otro color recuperado' },
  /*
    Las fotografías de moto se reprocesaron la tarde del 22-10-2026: el archivo entregado traía un
    41% de relleno azul incrustado, y la moto se veía diminuta por eso y no por su encuadre. La
    medición y lo que queda pendiente están en el LEEME de prototipo.
  */
  { placa: 'MOT006', marca: 'Honda', modelo: 'CB190', anio: '2021', tipo: /Motocicleta/, color: /^Verde$/,
    archivo: 'moto-verde.webp', demuestra: 'motocicleta: su propia fotografía' },
  /*
    Una moto de un color que la biblioteca NO tiene. Es la otra mitad de la garantía: cuando no hay
    archivo de moto, cae al dibujo —que tiene silueta de moto— y nunca a la foto de un automóvil.
  */
  { placa: 'MOT011', marca: 'Honda', modelo: 'CB190', anio: '2021', tipo: /Motocicleta/,
    color: /^Amarillo$/, archivo: null, demuestra: 'moto AMARILLA: sin archivo, cae al dibujo' },
  { placa: 'SIN007', marca: '', modelo: '', anio: '', tipo: /Automóvil/, color: /^Café$/,
    archivo: null, demuestra: 'sin marca ni modelo + CAFÉ, color sin imagen: dibujo' },
  { placa: 'MIN009', marca: 'Toyota', modelo: 'Innova 2.8 GX', anio: '2020', tipo: /Automóvil/,
    color: /^Plateado$/, archivo: 'minivan-plata.webp', demuestra: 'monovolumen' },
  { placa: 'VAN010', marca: 'Hyundai', modelo: 'H-100 caja seca', anio: '2019', tipo: /Automóvil/,
    color: /^Blanco$/, archivo: 'van-comercial-blanco.webp', demuestra: 'furgoneta de carga' },
  /* Textos largos, que es donde una rejilla se rompe: apodo, marca y modelo al límite del campo. */
  { placa: 'LARGO08', nombre: 'El carro de mamá para los mandados', marca: 'Mercedes-Benz',
    modelo: 'Sprinter 519 CDI Furgón Largo', anio: '2018', tipo: /Automóvil/, color: /^Blanco$/,
    archivo: 'van-comercial-blanco.webp',
    demuestra: 'SPRINTER con versión → van comercial · y textos largos' },
];

const TAMANOS = [
  { nombre: '320', width: 320, height: 568, movil: true },
  { nombre: '390', width: 390, height: 844, movil: true },
  { nombre: '430', width: 430, height: 932, movil: true },
  { nombre: '1280', width: 1280, height: 900, movil: false },
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

async function irAVehiculos(page) {
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

/** Elige una opción de un `Select` por el nombre accesible del campo. */
async function elegir(page, campo, opcion) {
  const caja = page.getByRole('combobox', { name: campo }).first();
  await caja.waitFor({ state: 'visible', timeout: 10000 });
  /*
    Dos controles posibles, y hay que servir a los dos.

    Este arnés corre con `hasTouch`, y desde el 22-10-2026 un aparato de dedo recibe el `<select>`
    del sistema en vez de la lista propia —porque la lista propia no se dejaba recorrer en un
    iPhone—. Un `<select>` no abre ningún `[role=listbox]`: se elige con `selectOption`. El arnés
    detecta cuál le tocó en vez de asumir, así que sigue sirviendo si mañana el formulario vuelve
    a la lista propia o se prueba en escritorio.
  */
  if (await caja.evaluate((n) => n.tagName === 'SELECT')) {
    const rotulos = await caja.locator('option').allTextContents();
    const elegido = rotulos.map((s) => s.trim()).find((s) => opcion.test(s));
    if (!elegido) throw new Error(`«${opcion}» no está entre las opciones: ${rotulos.join(' · ')}`);
    await caja.selectOption({ label: elegido });
    await page.waitForTimeout(250);
    return;
  }
  await caja.click();
  await page.waitForTimeout(350);
  await page.locator('[role=listbox] [role=option]').filter({ hasText: opcion }).first().click();
  await page.waitForTimeout(350);
}

/** Registra un vehículo con el mismo formulario que usa la persona. */
async function registrar(page, caso) {
  const dialogo = page.locator('[role=dialog]');
  // Se espera al diálogo en vez de confiar en una pausa: el primer intento falló a 320 px porque
  // la pulsación llegó antes de que la lista terminara de dibujarse.
  for (let intento = 0; intento < 3; intento += 1) {
    await page.getByRole('button', { name: /^Agregar$/i }).first().click();
    try { await dialogo.waitFor({ state: 'visible', timeout: 4000 }); break; } catch { /* reintenta */ }
  }
  await page.waitForTimeout(600);
  /*
    `input[type=text]` NO los encuentra: el componente `Input` no escribe el atributo `type`, y el
    selector de CSS mira el ATRIBUTO mientras que `element.type` —lo que se ve al inspeccionar—
    devuelve «text» igual. Media hora de diagnóstico; queda escrito.
  */
  const textos = dialogo.locator('input:not([type=number]):not([type=checkbox])');
  await textos.nth(0).fill(caso.placa);
  await elegir(page, /Tipo de veh/i, caso.tipo);
  await elegir(page, /^Color$/i, caso.color);
  // Nombre · Marca · Modelo, en el orden del formulario.
  if (caso.nombre) await textos.nth(1).fill(caso.nombre);
  if (caso.marca) await textos.nth(2).fill(caso.marca);
  if (caso.modelo) await textos.nth(3).fill(caso.modelo);
  if (caso.anio) await dialogo.locator('input[type=number]').first().fill(caso.anio);
  await page.getByRole('button', { name: /^Agregar veh/i }).first().click();
  await page.waitForTimeout(2000);
  /*
    Que el diálogo se cierre es la única señal de que el servidor aceptó: si queda abierto es que
    hubo un error de validación, y seguir adelante produciría una lámina con menos vehículos de los
    que dice tener. Se informa y se aborta en vez de capturar algo incompleto.
  */
  if (await dialogo.count() > 0 && await dialogo.first().isVisible()) {
    const aviso = await page.locator('[role=dialog] .lx-alert, [role=dialog] [role=alert]').allTextContents();
    throw new Error(`no se pudo registrar ${caso.placa}: el formulario quedó abierto. ${aviso.join(' | ')}`);
  }
}

/** Lo que se ve en cada tarjeta, medido en el navegador. */
const AUDITAR = () => {
  const filas = [...document.querySelectorAll('.lx-vehiculo-fila')].map((f) => {
    const hueco = f.querySelector('.lx-vehicle-thumb');
    const img = hueco ? hueco.querySelector('img') : null;
    const caja = hueco ? hueco.getBoundingClientRect() : null;
    return {
      placa: (f.querySelector('.lx-vehiculo-fila__placa')?.textContent || '').trim(),
      descripcion: (f.querySelector('.lx-vehiculo-fila__descripcion')?.textContent || '').trim(),
      insignias: [...f.querySelectorAll('.lx-badge')].map((b) => (b.textContent || '').trim()),
      muestra: img ? 'foto' : (hueco && hueco.querySelector('svg') ? 'dibujo' : 'nada'),
      archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
      cargo: img ? img.naturalWidth > 0 : null,
      caja: caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : null,
      menu: (() => {
        const b = f.querySelector('.lx-vehiculo-fila__menu');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { nombre: b.getAttribute('aria-label'), alto: Math.round(r.height), ancho: Math.round(r.width) };
      })(),
      altoFila: Math.round(f.getBoundingClientRect().height),
    };
  });
  return { filas, desbordeH: document.documentElement.scrollWidth - window.innerWidth };
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });
  let fallos = 0;

  /*
    UN solo contexto para los tres anchos. El servidor simulado vive en la memoria de la pestaña:
    recargar —o abrir otro contexto— borraría los siete vehículos de prueba y habría que
    registrarlos tres veces. Se registran una vez y después sólo cambia el viewport, que es lo que
    de verdad se está revisando.
  */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'es-CR',
    hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
  });
  await entrar(page);
  await irAVehiculos(page);
  for (const caso of CASOS) await registrar(page, caso);
  /*
    Y de acá en adelante NO se navega. `page.goto` recarga la aplicación entera y con ella el
    servidor simulado, que vive en la memoria de la pestaña: los siete vehículos recién registrados
    desaparecían y la lámina salía con los cuatro sembrados. La lista se actualiza sola al crear.
  */
  await page.waitForTimeout(1200);

  for (const tam of TAMANOS) {
    console.log(`\n══ ${tam.nombre} px ══`);
    await page.setViewportSize({ width: tam.width, height: tam.height });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    const { filas, desbordeH } = await page.evaluate(AUDITAR);
    for (const caso of CASOS) {
      const f = filas.find((x) => x.placa === caso.placa);
      if (!f) { console.log(`  ✗   ${caso.placa}: no apareció`); fallos += 1; continue; }
      console.log(`  ${caso.placa}  ${f.muestra.padEnd(7)} ${String(f.archivo ?? '—').padEnd(26)}`
        + `caja ${String(f.caja).padEnd(8)} fila ${String(f.altoFila).padEnd(4)} `
        + `[${f.insignias.join(' · ')}]  ${caso.demuestra}`);
      if (f.muestra === 'foto' && f.cargo !== true) { console.log('      ✗ la imagen NO cargó'); fallos += 1; }
      /*
        El archivo exacto, no «alguna imagen». Un Sprinter con la foto de un sedán pasaría
        cualquier comprobación que sólo exigiera que hubiera un `<img>`; es justo el defecto que
        el Paso 4 vino a arreglar.
      */
      if (caso.archivo === null && f.muestra !== 'dibujo') {
        console.log(`      ✗ debía caer al dibujo y muestra ${f.archivo}`); fallos += 1;
      }
      if (caso.archivo && f.archivo !== caso.archivo) {
        console.log(`      ✗ esperaba ${caso.archivo} y muestra ${f.archivo}`); fallos += 1;
      }
    }
    /*
      La garantía que de verdad importa y que sobrevive a que lleguen o no los activos: una
      motocicleta jamás puede mostrar la foto de un automóvil. Antes se comprobaba exigiendo que
      cayera al dibujo; eso dejó de ser cierto el 22-10-2026 por la noche, cuando llegaron las
      nueve fotos de moto, así que la comprobación pasó a lo que nunca cambia: o dibujo, o un
      archivo cuyo nombre empieza por «moto-».
    */
    for (const moto of filas.filter((x) => /^MOT/.test(x.placa))) {
      const correcto = moto.muestra === 'dibujo'
        || (moto.muestra === 'foto' && /^moto-/.test(moto.archivo || ''));
      if (!correcto) {
        console.log(`  ✗   la MOTOCICLETA ${moto.placa} recibió «${moto.muestra}» (${moto.archivo})`);
        fallos += 1;
      }
    }
    const menu = filas[0]?.menu;
    if (!menu || menu.alto < 44 || menu.ancho < 44) {
      console.log(`  ✗   el botón de menú mide ${menu?.ancho}×${menu?.alto}, menos del mínimo táctil 44`);
      fallos += 1;
    } else {
      console.log(`  ··  menú: ${menu.ancho}×${menu.alto} px · nombre accesible «${menu.nombre}»`);
    }
    if (desbordeH > 1) { console.log(`  ✗   la página se sale de lado ${desbordeH}px`); fallos += 1; }
    else console.log('  ··  sin desbordamiento horizontal');

    await page.screenshot({ path: path.join(SALIDA, `lista-${tam.nombre}.png`), fullPage: true });

    /*
      El menú de acciones abierto. Se abre el de un vehículo que NO es el principal: el principal
      no ofrece «Marcar como principal» —un botón que no haría nada es peor que ninguno— y abrir
      ése dejaría esa rama sin comprobar, que es justo la que la instrucción del 22-10 movió.
    */
    await page.locator('.lx-vehiculo-fila__menu').last().click();
    await page.waitForTimeout(900);
    const acciones = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')]
      .map((b) => (b.textContent || '').trim()).filter(Boolean));
    console.log(`  ··  menú de acciones: ${acciones.join(' · ')}`);
    for (const esperada of ['Editar', 'Marcar como principal', 'Eliminar']) {
      if (!acciones.includes(esperada)) {
        console.log(`  ✗   falta «${esperada}» en el menú`); fallos += 1;
      }
    }
    await page.screenshot({ path: path.join(SALIDA, `menu-${tam.nombre}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  await ctx.close();

  await browser.close();
  await apagar();
  console.log(`\ncapturas en ${SALIDA}`);
  console.log(fallos === 0 ? 'sin fallos' : `${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
