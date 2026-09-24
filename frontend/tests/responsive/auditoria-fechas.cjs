/**
 * Auditoría: cambiar las fechas no puede cerrar la pantalla.
 *
 * <h2>Qué se reportó</h2>
 *
 * <p>«Traté de cambiar unas fechas en auditoría y se me cerró la página.» No se cerró el navegador
 * ni se cayó el servidor: React desmontó el árbol porque el cuerpo del componente LANZÓ.</p>
 *
 * <h2>Por qué una prueba unitaria no alcanza</h2>
 *
 * <p>`dateRange.check.mjs` comprueba que las funciones no lancen. Esto comprueba lo que de verdad
 * se reportó: que la PANTALLA siga en pie. Entre una cosa y la otra están el `onChange`, el estado
 * de React, la clave de la consulta y el render — y el defecto vivía justamente ahí, en que la
 * conversión ocurría dentro del render en cada pulsación. Una función total y una pantalla que no
 * se desmonta son dos afirmaciones distintas.</p>
 *
 * <h2>Cómo se produce el valor roto</h2>
 *
 * <p>Un `<input type="date">` de Chrome acepta años de hasta seis cifras, así que un dígito de más
 * deja `value === "20265-09-07"`. Eso es una fecha para el campo y NO es ISO 8601 para `new Date`
 * —los años expandidos exigen signo, `+020265`—, con lo cual sale `Invalid Date` y `toISOString()`
 * lanza `RangeError`.</p>
 *
 * <p>Se ataca por los dos caminos: escribiendo de verdad con el teclado (que es lo que hizo la
 * persona) y poniendo el valor con el asignador nativo más un evento `input` (que es exactamente lo
 * que React ve, sin depender de cómo Chrome segmente el campo en esta versión ni en este idioma).
 * Si el primero deja de reproducirlo porque cambió el navegador, el segundo sigue siendo válido.</p>
 *
 *   PASS='...' node tests/responsive/auditoria-fechas.cjs
 *
 * Contra un despliegue SIN el arreglo debe fallar. Un arnés que pasa en las dos versiones no está
 * comprobando nada, y en esta sesión ya hubo cinco que se lucieron así.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/**
 * Los valores intermedios que un campo de fecha deja pasar mientras alguien escribe.
 *
 * Ninguno es inventado: son las formas que `value` toma entre la primera tecla y la última.
 */
const VALORES = [
  { valor: '20265-09-07', porque: 'un dígito de más en el año (el caso reportado)' },
  { valor: '202-09-07', porque: 'un año a medio escribir' },
  { valor: '2026-09', porque: 'una fecha incompleta' },
  { valor: '', porque: 'el campo vaciado' },
  { valor: '0002-09-07', porque: 'el año 0002, por donde pasa el navegador al escribir 2026' },
];

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568 },
  { nombre: 'móvil estándar', width: 390, height: 664 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tablet vertical', width: 768, height: 1024 },
  { nombre: 'tablet apaisada', width: 1024, height: 768 },
  { nombre: 'laptop', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1536, height: 960 },
  { nombre: 'escritorio grande', width: 1920, height: 1080 },
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/admin/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (respuesta.status() === 429) {
    console.error('La cuenta está bloqueada por intentos fallidos. Esperar 15 min o usar CUENTA=otra@luparx.test');
    process.exit(3);
  }
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}. La contraseña de PASS no sirve para ${CUENTA}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  return page;
}

/**
 * Si la pantalla de auditoría sigue montada.
 *
 * <p>No se pregunta por un texto traducido —que cambia— sino por la estructura: el título de
 * pantalla y los dos campos de fecha. Cuando React desmonta por una excepción no deja un mensaje de
 * error: deja el contenedor VACÍO, así que «hay contenido» es justamente la pregunta.</p>
 */
async function sigueEnPie(page) {
  return page.evaluate(() => {
    const raiz = document.getElementById('root') ?? document.body;
    return {
      hijos: raiz.childElementCount,
      texto: (raiz.textContent ?? '').trim().length,
      fechas: document.querySelectorAll('input[type="date"]').length,
      titulo: Boolean(document.querySelector('h1')),
    };
  });
}

/** Pone un valor como lo pone el navegador: asignador nativo + evento `input`, que es lo que React oye. */
async function escribirComoElNavegador(page, indice, valor) {
  await page.evaluate(
    ({ indice, valor }) => {
      const campo = document.querySelectorAll('input[type="date"]')[indice];
      const asignar = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      asignar.call(campo, valor);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { indice, valor },
  );
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
    viewport: { width: 1536, height: 960 },
  });

  console.log(`\n${BASE}/admin/audit · ${CUENTA}\n`);

  const pageLogin = await entrar(context);
  await pageLogin.close();

  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (err) => errores.push(String(err.message).slice(0, 200)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text().slice(0, 200));
  });
  const peticiones = [];
  page.on('request', (r) => {
    if (r.url().includes('/audit-events')) peticiones.push(r.url().replace(BASE, ''));
  });

  // ---------------------------------------------------------------------------------------------
  // 0. La pantalla carga
  // ---------------------------------------------------------------------------------------------
  console.log('── /admin/audit carga ──');
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);

  const inicial = await sigueEnPie(page);
  comprobar(inicial.fechas === 2, `hay dos campos de fecha`, `encontrados=${inicial.fechas}`);
  comprobar(inicial.titulo && inicial.texto > 100, 'la pantalla tiene contenido', JSON.stringify(inicial));
  if (inicial.fechas !== 2) {
    console.log('\n  ARNÉS DESACTUALIZADO: sin los dos campos de fecha no hay nada que comprobar.');
    await browser.close();
    process.exit(1);
  }

  // ---------------------------------------------------------------------------------------------
  // 1. El caso reportado, por los dos campos
  // ---------------------------------------------------------------------------------------------
  for (const [indice, nombre] of [[0, 'desde'], [1, 'hasta']]) {
    console.log(`── el campo «${nombre}» recibe lo que se escribe ──`);
    for (const { valor, porque } of VALORES) {
      const antes = errores.length;
      await escribirComoElNavegador(page, indice, valor);
      const estado = await sigueEnPie(page);
      const nuevos = errores.slice(antes);
      const reventó = nuevos.some((e) => /Invalid time value|RangeError/i.test(e));
      comprobar(
        estado.fechas === 2 && estado.titulo && !reventó,
        `«${valor || '(vacío)'}» — ${porque}`,
        `campos=${estado.fechas} titulo=${estado.titulo} hijos=${estado.hijos}` +
          (nuevos.length ? `\n        errores: ${nuevos.join(' | ')}` : ''),
      );
      // Se devuelve a un estado limpio para que un fallo no arrastre al siguiente.
      await escribirComoElNavegador(page, indice, '');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 2. El camino real: teclas, no asignadores
  // ---------------------------------------------------------------------------------------------
  console.log('── escribiendo con el teclado, que es lo que hizo la persona ──');
  const antesTeclado = errores.length;
  const campo = page.locator('input[type="date"]').first();
  await campo.click();
  // Cinco dígitos de año: el segmento acepta seis, así que el quinto NO lo trunca, lo acumula.
  await page.keyboard.type('09072026');
  await page.waitForTimeout(400);
  await page.keyboard.type('5');
  await page.waitForTimeout(900);
  const trasTeclado = await sigueEnPie(page);
  const valorTecleado = await campo.inputValue().catch(() => '(ilegible)');
  const reventóTeclado = errores.slice(antesTeclado).some((e) => /Invalid time value|RangeError/i.test(e));
  comprobar(
    trasTeclado.fechas === 2 && trasTeclado.titulo && !reventóTeclado,
    `la pantalla sigue en pie tras teclear un año largo (value=${JSON.stringify(valorTecleado)})`,
    `campos=${trasTeclado.fechas} titulo=${trasTeclado.titulo}` +
      `\n        errores: ${errores.slice(antesTeclado).join(' | ') || '(ninguno)'}`,
  );

  // ---------------------------------------------------------------------------------------------
  // 3. Y después de todo eso, el filtro sigue filtrando
  // ---------------------------------------------------------------------------------------------
  console.log('── un rango válido se sigue aplicando ──');
  await escribirComoElNavegador(page, 0, '');
  await escribirComoElNavegador(page, 1, '');
  peticiones.length = 0;
  await escribirComoElNavegador(page, 0, '2026-09-01');
  await escribirComoElNavegador(page, 1, '2026-09-09');
  await page.waitForTimeout(1600);

  const ultima = peticiones[peticiones.length - 1] ?? '';
  comprobar(/[?&]from=/.test(ultima), 'la petición lleva «from»', `última: ${ultima || '(ninguna)'}`);
  comprobar(/[?&]to=/.test(ultima), 'la petición lleva «to»', `última: ${ultima || '(ninguna)'}`);
  // La ventana es semiabierta: el «hasta el 9» se pide como «< 10 de septiembre».
  comprobar(
    /to=2026-09-10/.test(decodeURIComponent(ultima)),
    'el cierre del 9 se pide como el comienzo del 10 (ventana semiabierta)',
    `última: ${decodeURIComponent(ultima) || '(ninguna)'}`,
  );
  const traStValido = await sigueEnPie(page);
  comprobar(traStValido.fechas === 2 && traStValido.titulo, 'la pantalla sigue en pie con el rango válido');

  // Y con un rango inválido NO se manda un extremo inventado.
  peticiones.length = 0;
  await escribirComoElNavegador(page, 1, '20265-09-09');
  await page.waitForTimeout(1200);
  const conRoto = decodeURIComponent(peticiones[peticiones.length - 1] ?? '');
  comprobar(
    conRoto === '' || !/[?&]to=/.test(conRoto),
    'con un «hasta» ilegible el filtro se omite, no se inventa',
    `última: ${conRoto || '(ninguna)'}`,
  );

  // ---------------------------------------------------------------------------------------------
  // 4. La fila de filtros, en todos los tamaños
  // ---------------------------------------------------------------------------------------------
  console.log('── la fila de filtros en cada tamaño ──');
  for (const tam of TAMANOS) {
    const ctx = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: tam.width, height: tam.height },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    const medida = await p.evaluate(() => {
      const doc = document.documentElement;
      const campos = [...document.querySelectorAll('input[type="date"]')];
      return {
        desborda: doc.scrollWidth > doc.clientWidth + 1,
        exceso: doc.scrollWidth - doc.clientWidth,
        // Un campo de fecha recortado es un campo donde no se puede escribir el año, que es
        // exactamente el defecto que trajo este arnés.
        recortado: campos.some((c) => c.getBoundingClientRect().right > doc.clientWidth + 1),
        visibles: campos.filter((c) => c.getBoundingClientRect().width > 0).length,
      };
    });
    comprobar(
      !medida.desborda && !medida.recortado && medida.visibles === 2,
      `${tam.nombre.padEnd(18)} ${tam.width}x${tam.height} · sin desborde y los dos campos visibles`,
      `exceso=${medida.exceso}px recortado=${medida.recortado} visibles=${medida.visibles}`,
    );
    await ctx.close();
  }

  const reventones = errores.filter((e) => /Invalid time value|RangeError/i.test(e));
  comprobar(
    reventones.length === 0,
    'en toda la sesión no hubo un solo «Invalid time value»',
    reventones.join(' | '),
  );

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
