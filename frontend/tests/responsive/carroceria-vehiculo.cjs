/**
 * La clasificación de vehículos del Ciudadano, probada en el navegador (22-10-2026).
 *
 * <h2>Qué se comprueba, y por qué cada cosa</h2>
 *
 * <p>La persona elige una carrocería en el formulario y espera ver esa carrocería. Lo que esta
 * prueba NO acepta es «hay una imagen»: comprueba el <b>archivo exacto</b>, porque una SUV que
 * muestra un sedán pasa cualquier prueba que sólo exija un `<img>`, y es justo el defecto que este
 * trabajo viene a resolver.</p>
 *
 * <ol>
 *   <li><b>Registro</b>: una categoría por vehículo, <b>sin marca ni modelo</b>, que es el caso que
 *       pidió la orden: antes de esto, un carro sin modelo era siempre un sedán.</li>
 *   <li><b>La elección gana a la tabla</b>: un Hilux —que la tabla conoce como pick-up— declarado
 *       sedán por su dueño sale sedán.</li>
 *   <li><b>El tipo del servidor gana a la elección</b>: una moto no puede recibir la foto de un
 *       automóvil pase lo que pase.</li>
 *   <li><b>Edición</b>: cambiar la carrocería de un vehículo ya registrado la cambia en la tarjeta
 *       sin recargar, y sigue ahí después de recargar.</li>
 *   <li><b>Las otras tres pantallas</b>: el selector de Estacionar y la tarjeta de sesión activa
 *       del Inicio muestran la misma imagen que la lista. Es donde más fácil se escapa un olvido,
 *       porque son cuatro sitios que dibujan lo mismo.</li>
 *   <li><b>El dibujo de respaldo</b>: una pick-up amarilla no tiene archivo, y el dibujo que sale
 *       tiene que ser el de una pick-up y no el del automóvil genérico.</li>
 *   <li><b>Responsive</b>: los cuatro anchos del contrato, sin desbordes y con la tarjeta compacta
 *       intacta —una fila por vehículo—.</li>
 * </ol>
 *
 *   cd frontend && node tests/responsive/carroceria-vehiculo.cjs
 */
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const EJECUTABLE = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUERTO = Number(process.env.PUERTO || 5196);
const BASE = `http://127.0.0.1:${PUERTO}`;
const SALIDA = process.env.SALIDA || path.join(RAIZ, '..', 'verificacion', 'carroceria-vehiculo');

/**
 * Una por categoría ofrecida, y todas SIN marca ni modelo a propósito.
 *
 * <p>Los colores se reparten para que ninguna fila dependa del acierto de otra: si el emparejamiento
 * de color se rompiera, se vería en una sola fila y no en las siete.</p>
 */
const CASOS = [
  { placa: 'SED101', categoria: /^Sedán$/, color: /^Rojo$/, archivo: 'sedan-rojo.webp' },
  { placa: 'HAT102', categoria: /^Hatchback$/, color: /^Azul$/, archivo: 'hatchback-azul.webp' },
  { placa: 'SUV103', categoria: /^SUV$/, color: /^Verde$/, archivo: 'suv-compacta-verde.webp' },
  { placa: 'PCK104', categoria: /^Pick-up$/, color: /^Negro$/, archivo: 'pickup-negro.webp' },
  { placa: 'MIN105', categoria: /^Miniván$/, color: /^Plateado$/, archivo: 'minivan-plata.webp' },
  { placa: 'VAN106', categoria: /^Furgoneta$/, color: /^Blanco$/, archivo: 'van-comercial-blanco.webp' },
  /* Sin fotografías de moto desde el 22-10-2026 por la tarde: manda el dibujo. Ver el LEEME. */
  { placa: 'MOT107', categoria: /^Motocicleta$/, color: /^Naranja$/, archivo: null, dibujo: 'MOTORCYCLE',
    nota: 'motocicleta: dibujo, que llena la casilla sin fondo' },
  /* La elección manda sobre la tabla: la tabla sabe que un Hilux es pick-up, su dueño dice sedán. */
  { placa: 'CON108', categoria: /^Sedán$/, color: /^Beige$/, marca: 'Toyota', modelo: 'Hilux',
    archivo: 'sedan-beige.webp', nota: 'la elección gana a la tabla de modelos' },
  /* Sin elección, la tabla sigue mandando: lo que ya funcionaba no se rompió. */
  { placa: 'AUT109', categoria: /^Automóvil$/, color: /^Beige$/, marca: 'Toyota', modelo: 'Hilux',
    archivo: 'pickup-beige.webp', nota: 'sin elección, decide la tabla' },
  /* Amarillo no tiene archivo: cae al dibujo, y el dibujo tiene que ser el de una pick-up. */
  { placa: 'AMA110', categoria: /^Pick-up$/, color: /^Amarillo$/, archivo: null, dibujo: 'PICKUP',
    nota: 'color sin imagen: dibujo, pero el de SU carrocería' },
  /* Y una moto con una carrocería de automóvil imposible de elegir en el formulario se prueba en
     `prototipo.check.mjs`; acá se comprueba lo que sí puede pasar: moto amarilla → dibujo de moto. */
  { placa: 'MOT111', categoria: /^Motocicleta$/, color: /^Amarillo$/, archivo: null, dibujo: 'MOTORCYCLE',
    nota: 'moto sin archivo: dibujo de moto, nunca de automóvil' },
];

const TAMANOS = [
  { nombre: '320', width: 320, height: 568 },
  { nombre: '390', width: 390, height: 844 },
  { nombre: '430', width: 430, height: 932 },
  { nombre: '1280', width: 1280, height: 900 },
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

/** Elige una opción de un `Select` por el nombre accesible del campo. */
async function elegir(page, campo, opcion) {
  const caja = page.getByRole('combobox', { name: campo }).first();
  await caja.waitFor({ state: 'visible', timeout: 10000 });
  await caja.click();
  await page.waitForTimeout(350);
  await page.locator('[role=listbox] [role=option]').filter({ hasText: opcion }).first().click();
  await page.waitForTimeout(350);
}

/**
 * Rellena el formulario abierto. `input[type=text]` NO encuentra los campos: el componente `Input`
 * no escribe el atributo `type`, y el selector de CSS mira el atributo. Queda escrito porque costó.
 */
async function rellenar(page, caso) {
  const dialogo = page.locator('[role=dialog]');
  await page.waitForTimeout(500);
  const textos = dialogo.locator('input:not([type=number]):not([type=checkbox])');
  await textos.nth(0).fill(caso.placa);
  await elegir(page, /Tipo de veh/i, caso.categoria);
  await elegir(page, /^Color$/i, caso.color);
  if (caso.marca) await textos.nth(2).fill(caso.marca);
  if (caso.modelo) await textos.nth(3).fill(caso.modelo);
}

async function registrar(page, caso) {
  const dialogo = page.locator('[role=dialog]');
  for (let intento = 0; intento < 3; intento += 1) {
    await page.getByRole('button', { name: /^Agregar$/i }).first().click();
    try { await dialogo.waitFor({ state: 'visible', timeout: 4000 }); break; } catch { /* reintenta */ }
  }
  await rellenar(page, caso);
  await page.getByRole('button', { name: /^Agregar veh/i }).first().click();
  await page.waitForTimeout(1600);
  if (await dialogo.count() > 0 && await dialogo.first().isVisible()) {
    const aviso = await page.locator('[role=dialog] .lx-alert, [role=dialog] [role=alert]').allTextContents();
    throw new Error(`no se pudo registrar ${caso.placa}: el formulario quedó abierto. ${aviso.join(' | ')}`);
  }
}

/** Abre el menú de una placa y pulsa «Editar». */
async function abrirEdicion(page, placa) {
  await page.getByRole('button', { name: new RegExp(`Opciones de ${placa}`, 'i') }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Editar$/i }).first().click();
  await page.waitForTimeout(700);
}

/** Lo que se ve en cada tarjeta de la lista, medido en el navegador. */
const AUDITAR = () => {
  const filas = [...document.querySelectorAll('.lx-vehiculo-fila')].map((f) => {
    const hueco = f.querySelector('.lx-vehicle-thumb');
    const img = hueco ? hueco.querySelector('img') : null;
    const caja = hueco ? hueco.getBoundingClientRect() : null;
    return {
      placa: (f.querySelector('.lx-vehiculo-fila__placa')?.textContent || '').trim(),
      insignias: [...f.querySelectorAll('.lx-badge')].map((b) => (b.textContent || '').trim()),
      muestra: img ? 'foto' : (hueco && hueco.querySelector('svg') ? 'dibujo' : 'nada'),
      archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
      cargo: img ? img.naturalWidth > 0 : null,
      dibujo: hueco ? hueco.getAttribute('data-lx-dibujo') : null,
      caja: caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : null,
      altoFila: Math.round(f.getBoundingClientRect().height),
    };
  });
  return { filas, desbordeH: document.documentElement.scrollWidth - window.innerWidth };
};

/** El archivo que dibuja una miniatura cualquiera, por selector. */
const MIRAR = (selector) => {
  const hueco = document.querySelector(selector);
  if (!hueco) return null;
  const img = hueco.querySelector('img');
  return {
    archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
    dibujo: hueco.getAttribute('data-lx-dibujo'),
  };
};

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
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await contexto.newPage();
    await entrar(page);

    console.log('\n══ 1 · registro, una categoría por vehículo ══');
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    for (const caso of CASOS) {
      await registrar(page, caso);
    }
    /*
      NO se navega después de registrar: `page.goto` recarga, y el servidor simulado vive en
      memoria, así que los once vehículos registrados desaparecerían. Lo aprendido en la lámina del
      Paso 3, repetido acá para que no se pierda con el archivo.
    */
    let { filas } = await page.evaluate(AUDITAR);
    for (const caso of CASOS) {
      const f = filas.find((x) => x.placa === caso.placa);
      if (!f) { ok(false, `${caso.placa}: aparece en la lista`); continue; }
      if (caso.archivo) {
        ok(f.archivo === caso.archivo,
          `${caso.placa} → ${caso.archivo}${caso.nota ? ' · ' + caso.nota : ''}`,
          `muestra ${f.muestra} ${f.archivo ?? ''}`);
        ok(f.cargo === true, `${caso.placa}: la imagen cargó de verdad`);
      } else {
        ok(f.muestra === 'dibujo' && f.dibujo === caso.dibujo,
          `${caso.placa} → dibujo ${caso.dibujo}${caso.nota ? ' · ' + caso.nota : ''}`,
          `muestra ${f.muestra} ${f.archivo ?? ''} dibujo=${f.dibujo}`);
      }
    }

    console.log('\n══ 2 · responsive, con los once vehículos recién registrados ══');
    /*
      Se MIDE y se captura acá, antes de navegar a ninguna parte: el servidor simulado vive en
      memoria y cualquier `goto` devuelve la lista a los cuatro vehículos sembrados. Cambiar el
      tamaño de la ventana no recarga, así que los once siguen en pantalla y la lámina muestra de
      verdad las ocho categorías a los cuatro anchos.
    */
    for (const tam of TAMANOS) {
      await page.setViewportSize({ width: tam.width, height: tam.height });
      await page.waitForTimeout(900);
      const r = await page.evaluate(AUDITAR);
      console.log(`\n── ${tam.width} px ──`);
      for (const f of r.filas) {
        console.log(`  ${f.placa.padEnd(8)} ${f.muestra.padEnd(7)} ${(f.archivo ?? '—').padEnd(26)} caja ${f.caja}  fila ${f.altoFila}`);
      }
      ok(r.desbordeH <= 1, `${tam.width}: sin desbordamiento horizontal`, `${r.desbordeH}px`);
      /*
        La tarjeta compacta, comprobada por ESTRUCTURA y no por altura en píxeles.

        El primer intento exigía una altura máxima y falló a 320 px en la única fila que lleva tres
        insignias —«Automóvil», «En uso» y «Principal»—, que allí envuelven a dos líneas y suben la
        fila a 149 px. Eso no es el diseño viejo volviendo: es texto que envuelve, y pasaba igual
        antes de este trabajo. Lo que define «compacta» es que imagen, datos y menú estén EN LA
        MISMA FILA, uno al lado del otro, y eso es lo que se mide.
      */
      const apiladas = await page.evaluate(() => {
        const malas = [];
        for (const fila of document.querySelectorAll('.lx-vehiculo-fila')) {
          const img = fila.querySelector('.lx-vehicle-thumb')?.getBoundingClientRect();
          const datos = fila.querySelector('.lx-vehiculo-fila__datos')?.getBoundingClientRect();
          const menu = fila.querySelector('.lx-vehiculo-fila__menu')?.getBoundingClientRect();
          if (!img || !datos || !menu) continue;
          const seSolapan = (a, b) => a.bottom > b.top + 2 && b.bottom > a.top + 2;
          const aLaDerecha = (a, b) => b.left >= a.right - 2;
          if (!(seSolapan(img, datos) && seSolapan(datos, menu)
                && aLaDerecha(img, datos) && aLaDerecha(datos, menu))) {
            malas.push((fila.querySelector('.lx-vehiculo-fila__placa')?.textContent || '?').trim());
          }
        }
        return malas;
      });
      ok(apiladas.length === 0,
        `${tam.width}: imagen, datos y menú siguen en una sola fila`, apiladas.join(', '));
      // Y la proporción 2:1 del hueco, que es lo que mantiene alineada la columna de imágenes.
      const torcidas = r.filas.filter((f) => {
        const [a, h] = (f.caja || '0×0').split('×').map(Number);
        return Math.abs(a - h * 2) > 2;
      });
      ok(torcidas.length === 0, `${tam.width}: todos los huecos son 2:1`,
        torcidas.map((f) => `${f.placa}=${f.caja}`).join(', '));
      await page.screenshot({ path: path.join(SALIDA, `lista-${tam.nombre}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);

    console.log('\n══ 3 · edición: cambiar la carrocería de un vehículo ya registrado ══');
    await abrirEdicion(page, 'SED101');
    await elegir(page, /Tipo de veh/i, /^SUV$/);
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await page.waitForTimeout(1600);
    ({ filas } = await page.evaluate(AUDITAR));
    const editado = filas.find((x) => x.placa === 'SED101');
    ok(editado?.archivo === 'suv-compacta-rojo.webp',
      'SED101 pasa de sedán a SUV sin recargar la página', `muestra ${editado?.archivo}`);

    console.log('\n══ 4 · el tipo del servidor manda sobre la carrocería ══');
    /*
      Se edita la MOTO para pedirle que sea un sedán. El formulario no deja —elegir «Sedán» cambia
      el tipo a automóvil— así que lo que se comprueba es lo contrario y es lo que importa: pasar
      una moto a automóvil y volver la deja con imagen de moto, nunca con la de un sedán.
    */
    await abrirEdicion(page, 'MOT107');
    await elegir(page, /Tipo de veh/i, /^Sedán$/);
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await page.waitForTimeout(1600);
    ({ filas } = await page.evaluate(AUDITAR));
    const exMoto = filas.find((x) => x.placa === 'MOT107');
    ok(exMoto?.archivo === 'sedan-naranja.webp' && exMoto.insignias.some((b) => /Autom/.test(b)),
      'MOT107 pasada a Sedán queda como automóvil, con imagen de sedán',
      `${exMoto?.archivo} · ${exMoto?.insignias.join(', ')}`);
    await abrirEdicion(page, 'MOT107');
    await elegir(page, /Tipo de veh/i, /^Motocicleta$/);
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await page.waitForTimeout(1600);
    ({ filas } = await page.evaluate(AUDITAR));
    const volvio = filas.find((x) => x.placa === 'MOT107');
    ok(volvio?.dibujo === 'MOTORCYCLE' && volvio.insignias.some((b) => /Motocicleta/.test(b)),
      'y al volver a Motocicleta recupera el dibujo de moto, no la imagen del sedán',
      `${volvio?.archivo} ${volvio?.dibujo} · ${volvio?.insignias.join(', ')}`);

    console.log('\n══ 5 · el vehículo de la sesión activa ══');
    /*
      BHL019 es un Toyota Yaris gris con sesión activa en el simulador: hoy su imagen sale de la
      tabla de modelos (hatchback). Se le pone «Pick-up» a mano y la tarjeta de sesión activa del
      Inicio tiene que cambiar con ella. Es la pantalla más fácil de olvidar.
    */
    await abrirEdicion(page, 'BHL019');
    await elegir(page, /Tipo de veh/i, /^Pick-up$/);
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await page.waitForTimeout(1600);
    ({ filas } = await page.evaluate(AUDITAR));
    const bhl = filas.find((x) => x.placa === 'BHL019');
    ok(bhl?.archivo === 'pickup-gris.webp', 'BHL019 (Yaris) declarado pick-up muestra pickup-gris',
      String(bhl?.archivo));

    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    /*
      El perfil sembrado tiene DOS estadías activas y el Inicio muestra la más urgente, que es la
      de SJB4402: una placa prestada, sin vehículo registrado detrás. Por eso su miniatura es el
      dibujo gris y no una fotografía, y eso es lo correcto —no hay color ni modelo que afirmar—.
      Se comprueba tal cual, y después se termina esa estadía para que la siguiente en urgencia,
      la de BHL019, pase al frente: ES la que tiene vehículo y la que prueba lo que interesa.
    */
    const prestada = await page.evaluate(MIRAR, '.lx-sesion-activa__vehiculo');
    ok(prestada?.archivo === null && prestada?.dibujo === 'CAR',
      'una estadía con placa prestada no inventa imagen: dibujo neutro', JSON.stringify(prestada));

    const terminar = page.getByRole('button', { name: /Finalizar ahora/i }).first();
    if (await terminar.count()) {
      await terminar.click();
      await page.waitForTimeout(900);
      const confirmar = page.locator('[role=dialog]').getByRole('button', { name: /Finalizar|Confirmar|Sí/i }).first();
      if (await confirmar.count()) { await confirmar.click(); }
      await page.waitForTimeout(2500);
    }
    try {
      await page.waitForSelector('.lx-sesion-activa__vehiculo img', { timeout: 15000 });
    } catch {
      const dentro = await page.evaluate(() => {
        const n = document.querySelector('.lx-sesion-activa');
        return n ? n.innerHTML.slice(0, 300) : 'no hay .lx-sesion-activa en la página';
      });
      console.log(`  ·· diagnóstico del Inicio: ${dentro}`);
    }
    const hero = await page.evaluate(MIRAR, '.lx-sesion-activa__vehiculo');
    ok(hero?.archivo === 'pickup-gris.webp',
      'la estadía de BHL019 muestra en el Inicio la misma imagen que la lista', JSON.stringify(hero));
    /*
      Y de paso queda probado lo que más dudas levanta de guardar en el dispositivo: la elección
      sobrevivió a una recarga COMPLETA de la página. El `goto` reinicia el servidor simulado y los
      once vehículos del paso 1 ya no están; BHL019 vuelve sembrado desde cero y su carrocería la
      pone el dispositivo.
    */
    ok(hero?.archivo === 'pickup-gris.webp', 'y sigue ahí después de recargar la página entera');

    console.log('\n══ 6 · el selector de Estacionar ══');
    /*
      La ruta es `/park` y el selector de vehículo es el PASO 2 del asistente: hay que elegir zona
      y espacio antes. Y sus miniaturas viven dentro de las opciones del desplegable, así que sólo
      existen en el DOM con el desplegable ABIERTO; buscarlas con él cerrado devuelve cero y no es
      un fallo del producto.
    */
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const zona = page.getByRole('combobox', { name: /^Zona$|^Zone$/i }).first();
    await zona.click();
    await page.waitForTimeout(400);
    await page.locator('[role=listbox] [role=option]').first().click();
    await page.waitForTimeout(500);
    await page.locator('input[inputmode=numeric], input[inputmode=text]').first().fill('LUP-0001');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole('combobox', { name: /Veh[ií]culo|Vehicle/i }).first().click();
    await page.waitForTimeout(700);
    const enSelector = await page.evaluate(() => {
      for (const opcion of document.querySelectorAll('[role=listbox] [role=option]')) {
        if (!/BHL019/.test(opcion.textContent || '')) continue;
        const hueco = opcion.querySelector('.lx-vehicle-thumb');
        if (!hueco) return { archivo: null, dibujo: null, nota: 'la opción no trae miniatura' };
        const img = hueco.querySelector('img');
        return {
          archivo: img ? (img.currentSrc || img.src).replace(/^.*\//, '').replace(/\?.*$/, '') : null,
          dibujo: hueco.getAttribute('data-lx-dibujo'),
        };
      }
      return null;
    });
    await page.screenshot({ path: path.join(SALIDA, 'estacionar-selector-390.png') });
    ok(enSelector?.archivo === 'pickup-gris.webp',
      'el selector de vehículo de Estacionar muestra la misma imagen', JSON.stringify(enSelector));

    console.log('\n══ 7 · el formulario, con las ocho opciones ══');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /^Agregar$/i }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('combobox', { name: /Tipo de veh/i }).first().click();
    await page.waitForTimeout(500);
    const opciones = await page.locator('[role=listbox] [role=option]').allTextContents();
    console.log(`  ·· opciones: ${opciones.map((o) => o.trim()).join(' · ')}`);
    const esperadas = ['Automóvil', 'Sedán', 'Hatchback', 'SUV', 'Pick-up', 'Miniván', 'Furgoneta', 'Motocicleta'];
    ok(esperadas.every((e) => opciones.some((o) => o.trim() === e)),
      'el selector ofrece las ocho categorías', opciones.join(', '));
    await page.screenshot({ path: path.join(SALIDA, 'formulario-opciones.png') });

    console.log(`\n${comprobaciones} comprobaciones · ${fallos} fallos`);
    console.log(`capturas en ${SALIDA}`);
  } finally {
    await browser.close();
    await apagar();
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
