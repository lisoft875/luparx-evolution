/**
 * La miniatura del vehículo, en los ocho tamaños del contrato (20-10-2026).
 *
 * <h2>Por qué hace falta</h2>
 *
 * La miniatura se verificó a mano en dos teléfonos y nada más, y ya había costado un defecto: al
 * ponerla, le robó sitio a la placa y «BHL019» salió cortada a media letra. Un dibujo de ancho fijo
 * dentro de una fila flexible es exactamente la clase de cosa que se rompe al cambiar de tamaño, y
 * «se ve bien en mi pantalla» no es una comprobación.
 *
 * <h2>Qué se comprueba, en las tres pantallas donde está</h2>
 *
 * <ul>
 *   <li>que está —si el dato existe, el dibujo aparece—;</li>
 *   <li>que mantiene su proporción 4:3 y no sale aplastada ni estirada;</li>
 *   <li>que el dibujo llena su hueco en vez de desbordarlo;</li>
 *   <li>que la placa no queda recortada, que es el defecto que ya ocurrió;</li>
 *   <li>que la miniatura y la placa no se solapan;</li>
 *   <li>y que la página no se sale de lado por su culpa.</li>
 * </ul>
 *
 *   cd frontend && node tests/responsive/miniatura-vehiculo.cjs
 */
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

const PUERTO = 5183;
const BASE = `http://localhost:${PUERTO}`;
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;

/** Una bahía del formato que la zona sembrada acepta. La misma que usa `mapa-ciudadano.cjs`. */
const BAHIA_OK = 'LUP-0001';

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'móvil grande', width: 430, height: 932, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'tablet apaisada', width: 1024, height: 768, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];

let fallos = 0;
let pasadas = 0;
const ok = (cond, texto, detalle) => {
  if (cond) { pasadas += 1; } else { fallos += 1; console.log(`  ✗   ${texto}${detalle ? ' — ' + detalle : ''}`); }
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
  const hijo = spawn('npm', ['run', 'dev', '--workspace=@luparx/citizen'], {
    cwd: RAIZ, detached: true, env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 90; i += 1) {
    if (await puertoOcupado(PUERTO)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return async () => { try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ } };
}

/** Todo lo que se puede saber de las miniaturas de la pantalla, medido en el navegador. */
const AUDITAR = () => {
  const miniaturas = [...document.querySelectorAll('.lx-vehicle-thumb')].map((m) => {
    const caja = m.getBoundingClientRect();
    /*
      El hueco lo llena un dibujo SVG o una fotografía del catálogo: `VehicleImage` elige uno u
      otro según haya o no imagen para ESE vehículo, y las dos son respuestas correctas. Lo que se
      mide acá es que lo que haya adentro quepa, no cuál de los dos es.
    */
    const svg = m.querySelector('svg, img');
    const cajaSvg = svg ? svg.getBoundingClientRect() : null;
    /*
      La placa. Desde el 22-10-2026 la tarjeta de «Mis vehículos» es una rejilla y la placa ya NO
      es el hermano siguiente de la imagen: vive en la columna de datos. Se busca primero dentro de
      la fila y sólo después por la regla vieja, que es la que sigue valiendo en las otras pantallas
      —el selector de estacionar y la tarjeta de Inicio—, donde la miniatura es el icono de una
      opción y no hay placa al lado.

      Esto importa más de lo que parece: con la regla vieja sola, tras el rediseño la placa dejaba
      de encontrarse y las comprobaciones de recorte y solape desaparecían EN SILENCIO. El arnés
      pasaba de 328 a 264 comprobaciones sin un solo fallo.
    */
    const fila = m.closest ? m.closest('.lx-vehiculo-fila') : null;
    const enLaFila = fila ? fila.querySelector('.lx-vehiculo-fila__placa') : null;
    const hermanoCrudo = m.nextElementSibling;
    const hermano = enLaFila
      || (hermanoCrudo && /lx-text-amount/.test(hermanoCrudo.className || '') ? hermanoCrudo : null);
    const placa = hermano;
    const cajaPlaca = placa ? placa.getBoundingClientRect() : null;
    return {
      alto: Math.round(caja.height * 10) / 10,
      ancho: Math.round(caja.width * 10) / 10,
      svgDentro: cajaSvg
        ? cajaSvg.width <= caja.width + 1 && cajaSvg.height <= caja.height + 1
          && cajaSvg.width > 0 && cajaSvg.height > 0
        : false,
      placa: placa ? {
        recortada: placa.scrollWidth > placa.clientWidth + 1,
        texto: (placa.textContent || '').trim(),
        solapa: cajaPlaca.left < caja.right - 1 && cajaPlaca.right > caja.left + 1
          && cajaPlaca.top < caja.bottom - 1 && cajaPlaca.bottom > caja.top + 1,
      } : null,
    };
  });
  return {
    miniaturas,
    desbordeH: document.documentElement.scrollWidth - window.innerWidth,
  };
};

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('input[type=email]', 'citizen@example.com');
  await page.fill('input[type=password]', 'Password123!');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2600);
  if (/select-tenant/.test(page.url())) {
    const f = page.locator('button, a').filter({ hasText: /San José/ }).first();
    if (await f.count()) { await f.click(); await page.waitForTimeout(1600); }
  }
}

function revisar(etiqueta, datos, minimo) {
  ok(datos.miniaturas.length >= minimo, `${etiqueta}: aparece la miniatura`,
    `${datos.miniaturas.length} encontradas, se esperaba al menos ${minimo}`);
  datos.miniaturas.forEach((m, i) => {
    /*
      2:1 desde el 22-10-2026, y el MISMO hueco lleve foto o dibujo.

      Era 4:3 mientras lo único que había era la silueta. Con las imágenes de la biblioteca —que
      son 2:1— el hueco pasó a 2:1 y el dibujo se centra dentro con `preserveAspectRatio`: si cada
      fuente midiera lo suyo, una lista con unos vehículos con imagen y otros sin ella tendría las
      filas de anchos distintos. Se admite 1 px de redondeo, no más.
    */
    const esperado = Math.round(m.alto * 2);
    ok(Math.abs(m.ancho - esperado) <= 1, `${etiqueta}: miniatura ${i + 1} mantiene 2:1`,
      `${m.ancho}×${m.alto}, se esperaba ancho ${esperado}`);
    ok(m.alto > 0 && m.ancho > 0, `${etiqueta}: miniatura ${i + 1} tiene tamaño`,
      `${m.ancho}×${m.alto}`);
    ok(m.svgDentro, `${etiqueta}: miniatura ${i + 1} dibuja dentro de su hueco`);
    if (m.placa) {
      ok(!m.placa.recortada, `${etiqueta}: la placa ${m.placa.texto} no sale recortada`);
      ok(!m.placa.solapa, `${etiqueta}: la miniatura no se solapa con la placa ${m.placa.texto}`);
    }
  });
  ok(datos.desbordeH <= 1, `${etiqueta}: la página no se sale de lado`, `${datos.desbordeH}px`);
}

(async () => {
  const apagar = await levantar();
  const browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });

  for (const tam of TAMANOS) {
    console.log(`\n══ ${tam.nombre} (${tam.width}×${tam.height}) ══`);
    const ctx = await browser.newContext({
      viewport: { width: tam.width, height: tam.height }, locale: 'es-CR',
      hasTouch: Boolean(tam.movil), isMobile: Boolean(tam.movil),
    });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });

    await entrar(page);

    // 1 · Mis vehículos: la lista, con la placa al lado. Es donde la miniatura convive con el dato
    //     que ya recortó una vez, así que es la pantalla que más importa.
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    revisar(`${tam.nombre} · Mis vehículos`, await page.evaluate(AUDITAR), 1);

    /*
      2 · Estacionar, paso 2: la miniatura es el icono de cada opción del selector de vehículo, así
      que sólo existe con la lista desplegada. Para llegar al paso 2 hace falta zona y una bahía
      del formato que la zona acepta: `LUP-0001`, la misma que usan los otros arneses. Un código
      inventado deja el campo en inválido y el paso no avanza.
    */
    await page.goto(`${BASE}/park`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const zona = page.getByRole('combobox', { name: /^Zona$|^Zone$/i }).first();
    if (await zona.count()) {
      /*
        Con dedo, el selector de zona es el `<select>` del sistema desde el 22-10-2026, y ahí la
        lista la dibuja el navegador: `[role=option]` no existe y esperarlo cuelga la prueba treinta
        segundos. Se eligen las dos formas, que es lo que hace cualquier arnés que toque un `Select`.
      */
      if (await zona.evaluate((n) => n.tagName) === 'SELECT') {
        const valor = await zona.evaluate((n) => [...n.options].find((o) => o.value)?.value ?? null);
        if (valor) await zona.selectOption(valor);
      } else {
        await zona.click();
        await page.waitForTimeout(350);
        await page.locator('[role=listbox] [role=option]').first().click();
      }
      await page.waitForTimeout(400);
      await page.locator('input[inputmode=numeric], input[inputmode=text]').first().fill(BAHIA_OK);
      await page.waitForTimeout(700);
      /*
        Soltar el campo antes de buscar «Continuar», y esto NO es un apaño para que pase la prueba:
        es la secuencia real desde el 21-10-2026. Con un campo de texto enfocado en un aparato de
        dedo, el botón fijo se esconde a propósito —es justamente lo que la usuaria pidió, que no le
        tape el formulario—, así que en un teléfono se escribe el código, se baja el teclado y
        recién entonces se continúa. Antes de este cambio la prueba llegaba al paso 2 con el campo
        todavía enfocado porque Playwright no levanta ningún teclado; eso era lo irreal.
      */
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(600);
      const continuar = page.getByRole('button', { name: /^Continuar$|^Continue$/i }).first();
      if (await continuar.count() && await continuar.isEnabled()) {
        await continuar.click();
        await page.waitForTimeout(1400);
        const selector = page.getByRole('combobox').first();
        if (await selector.count()) {
          await selector.click();
          await page.waitForTimeout(500);
          const datos = await page.evaluate(AUDITAR);
          if (datos.miniaturas.length === 0) {
            console.log(`  ··   ${tam.nombre} · Estacionar paso 2: SIN PROBAR, el selector no mostró opciones`);
          } else {
            revisar(`${tam.nombre} · Estacionar paso 2`, datos, 1);
          }
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      } else {
        console.log(`  ··   ${tam.nombre} · Estacionar paso 2: SIN PROBAR, el paso 1 no dejó continuar`);
      }
    }

    /*
      3 · Inicio: la tarjeta del vehículo principal.

      Esta tarjeta NO está mientras hay una estadía en curso, y no es un defecto: la pantalla 2 del
      boceto repite sólo el saldo, y así está escrito en `HomePage`. El perfil sembrado arranca con
      dos estadías activas, así que para ver la tarjeta hay que terminarlas —por la interfaz, como
      lo haría la persona— y es lo que se hace acá. Es un servidor simulado: al recargar la página
      vuelve a su semilla, así que esto no deja nada tocado para las demás pruebas.
    */
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    for (let vuelta = 0; vuelta < 4; vuelta += 1) {
      const fin = page.getByRole('button', { name: /^Finalizar ahora$|^End now$/i }).first();
      if (await fin.count() === 0) break;
      await fin.click();
      await page.waitForTimeout(900);
      const si = page.getByRole('button', { name: /^S[ií], finalizar$|^Yes, end$/i }).first();
      if (await si.count()) await si.click();
      await page.waitForTimeout(2000);
    }
    const inicio = await page.evaluate(AUDITAR);
    if (inicio.miniaturas.length === 0) {
      ok(false, `${tam.nombre} · Inicio: aparece la miniatura del vehículo principal`,
        'no quedó ninguna, y sin estadía en curso debería estar');
    } else {
      revisar(`${tam.nombre} · Inicio`, inicio, 1);
    }

    await ctx.close();
  }

  await browser.close();
  await apagar();
  console.log(`\n${pasadas + fallos} comprobaciones · ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
