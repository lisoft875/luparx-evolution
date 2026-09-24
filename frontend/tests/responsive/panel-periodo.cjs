/**
 * El selector de período del Panel, comprobado por lo que CAMBIA, no por lo que se ve.
 *
 * Un desplegable que existe y no filtra es peor que ninguno: da confianza en un número equivocado.
 * Así que de cada atajo se comprueban tres cosas distintas:
 *
 *   1. que la petición al servidor lleve el rango correcto —calculado acá, con la misma aritmética
 *      de calendario que la pantalla, pero escrita aparte: si las dos tuvieran el mismo error, la
 *      prueba lo bendeciría—;
 *   2. que el rango activo que la pantalla imprime coincida con el atajo pulsado;
 *   3. que los KPI se vuelvan a pedir. Un filtro que cambia el rótulo y no los datos es el fallo
 *      más caro de esta pantalla, porque no se ve.
 *
 * Y una cuarta, del criterio 6 de la especificación: los indicadores de TIEMPO REAL —ocupación
 * actual, estadías vigentes— no deben quedar atados al período histórico.
 *
 *   PASS='...' node tests/responsive/panel-periodo.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'admin@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** `yyyy-mm-dd` en hora local, que es la que usa la pantalla. */
function iso(d) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * El rango que cada atajo DEBE producir.
 *
 * Escrito acá de nuevo, a propósito, y no importado de la pantalla: una prueba que reutiliza el
 * cálculo que está probando no prueba el cálculo, prueba que la función se llama a sí misma.
 */
function rangoEsperado(cual) {
  const hoy = new Date();
  const dia = (n) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
  switch (cual) {
    case 'hoy':
      return [iso(hoy), iso(hoy)];
    case 'ayer':
      return [iso(dia(-1)), iso(dia(-1))];
    case 'ultimos7':
      return [iso(dia(-6)), iso(hoy)];
    case 'ultimos30':
      return [iso(dia(-29)), iso(hoy)];
    case 'esteMes':
      return [iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), iso(hoy)];
    case 'mesAnterior':
      return [
        iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      ];
    default:
      throw new Error(`atajo desconocido: ${cual}`);
  }
}

const ATAJOS = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'ayer', etiqueta: 'Ayer' },
  { clave: 'ultimos7', etiqueta: 'Últimos 7 días' },
  { clave: 'ultimos30', etiqueta: 'Últimos 30 días' },
  { clave: 'esteMes', etiqueta: 'Este mes' },
  { clave: 'mesAnterior', etiqueta: 'Mes anterior' },
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) console.log(`  ok  ${mensaje}`);
  else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log(`\n${BASE}/admin/dashboard · ${CUENTA}\n`);

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/admin/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (respuesta.status() === 429) {
    console.error('La cuenta está bloqueada por intentos fallidos. Esperar 15 min.');
    process.exit(3);
  }
  if (!respuesta.ok()) {
    console.error(`El login falló con ${respuesta.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }

  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  // El criterio 1: el Panel carga como antes, sin obligar a elegir un período.
  const alCargar = await page.evaluate(() => ({
    hayKpis: document.querySelectorAll('.lx-dashboard-kpis .lx-stat-card, .lx-dashboard-kpis > *').length,
    textoRango: (document.querySelector('[data-testid="rango-activo"]')?.textContent || '').trim(),
  }));
  comprobar(alCargar.hayKpis > 0, `al cargar ya hay ${alCargar.hayKpis} indicadores, sin elegir período`);

  console.log('\n── cada atajo pide el rango que promete ──');
  for (const { clave, etiqueta } of ATAJOS) {
    const [desde, hasta] = rangoEsperado(clave);
    const boton = page.getByRole('button', { name: etiqueta, exact: true }).first();
    if (!(await boton.isVisible().catch(() => false))) {
      comprobar(false, `${etiqueta.padEnd(16)} el atajo existe`);
      continue;
    }
    const [peticion] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/admin/dashboard?'), { timeout: 8000 }).catch(() => null),
      boton.click(),
    ]);
    if (peticion === null) {
      comprobar(false, `${etiqueta.padEnd(16)} vuelve a pedir los datos`, 'no salió ninguna petición al pulsarlo');
      continue;
    }
    const url = new URL(peticion.url());
    // El cliente manda instantes ISO; se compara sólo la parte de la fecha, que es lo que el atajo
    // decide. La hora la fija `startOfDay` / `startOfNextDay`, que ya tienen su propia prueba.
    const from = (url.searchParams.get('from') || '').slice(0, 10);
    const to = (url.searchParams.get('to') || '').slice(0, 10);
    // `to` es exclusivo: la pantalla pide el arranque del día siguiente para incluir el último día.
    const finEsperado = new Date(`${hasta}T00:00:00`);
    finEsperado.setDate(finEsperado.getDate() + 1);
    const hastaExclusivo = iso(finEsperado);
    comprobar(
      from === desde && to === hastaExclusivo,
      `${etiqueta.padEnd(16)} pide ${desde} → ${hasta}`,
      `pidió from=${from} to=${to}, se esperaba from=${desde} to=${hastaExclusivo}`,
    );

    await page.waitForTimeout(1200);
    const rango = (await page.locator('[data-testid="rango-activo"]').first().textContent().catch(() => '')) || '';
    comprobar(rango.includes(etiqueta), `${etiqueta.padEnd(16)} el rango activo lo nombra`, `dice: «${rango.trim()}»`);
  }

  // --- El criterio 6: lo de tiempo real no se ata al período -------------------------------------
  console.log('\n── los indicadores en vivo siguen diciendo que son de ahora ──');
  // Lo que la §6 pide de verdad es que no se confunda lo de AHORA con lo del PERÍODO. Afirmarlo
  // como «tiene que aparecer la cadena "En este momento"» fue más estricto que la especificación:
  // ese texto es el respaldo de la ocupación cuando NO hay datos, y con datos la tarjeta dice
  // «N sobre M bahías», que es mejor. El rótulo ya decía «Ocupación actual» y eso basta.
  //
  // Así que se comprueba la separación, que es el invariante: ningún indicador en vivo rotulado
  // «del período», y ninguno del período rotulado «actual».
  const enVivo = await page.evaluate(() => {
    const rotulos = [...document.querySelectorAll('.lx-dashboard-kpis .lx-stat-card__label, .lx-stat-card__label')]
      .map((el) => (el.textContent || '').trim());
    return {
      rotulos,
      ocupacionActual: rotulos.some((r) => /ocupación/i.test(r) && /actual/i.test(r)),
      ocupacionDelPeriodo: rotulos.some((r) => /ocupación/i.test(r) && /per[íi]odo/i.test(r)),
      cuantosDelPeriodo: rotulos.filter((r) => /per[íi]odo/i.test(r)).length,
    };
  });
  comprobar(enVivo.ocupacionActual, 'la ocupación está rotulada «actual»', `rótulos: ${enVivo.rotulos.join(' | ')}`);
  comprobar(!enVivo.ocupacionDelPeriodo, 'la ocupación NO está rotulada «del período»');
  comprobar(enVivo.cuantosDelPeriodo >= 2, `${enVivo.cuantosDelPeriodo} indicadores dicen «del período»`,
    `rótulos: ${enVivo.rotulos.join(' | ')}`);

  // --- Personalizado ------------------------------------------------------------------------------
  console.log('\n── personalizado ──');
  const campos = page.locator('input[type="date"]');
  if ((await campos.count()) >= 2) {
    await campos.nth(0).fill('2026-09-01');
    await campos.nth(1).fill('2026-09-15');
    const [peticion] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/admin/dashboard?'), { timeout: 8000 }).catch(() => null),
      page.getByRole('button', { name: 'Aplicar', exact: true }).first().click(),
    ]);
    comprobar(
      peticion !== null && peticion.url().includes('from=2026-09-01'),
      'un rango escrito a mano se aplica',
      peticion === null ? 'no salió petición' : `pidió ${peticion.url().split('?')[1]}`,
    );
    await page.waitForTimeout(1200);
    const rango = (await page.locator('[data-testid="rango-activo"]').first().textContent().catch(() => '')) || '';
    comprobar(rango.includes('Personalizado'), 'el rango activo dice «Personalizado»', `dice: «${rango.trim()}»`);
  } else {
    comprobar(false, 'los dos campos de fecha existen');
  }

  // --- Responsive ----------------------------------------------------------------------------------
  console.log('\n── el selector en cuatro anchos ──');
  for (const tam of [
    { nombre: 'móvil chico', width: 320, height: 568 },
    { nombre: 'móvil estándar', width: 390, height: 664 },
    { nombre: 'tablet', width: 768, height: 1024 },
    { nombre: 'escritorio', width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: tam.width, height: tam.height });
    await page.waitForTimeout(700);
    const medida = await page.evaluate(() => {
      const doc = document.documentElement;
      const botones = [...document.querySelectorAll('.lx-period-filter__presets button')];
      return {
        desborda: doc.scrollWidth > doc.clientWidth + 1,
        cuantos: botones.length,
        // Un atajo con el texto cortado no es un atajo: hay que adivinar cuál es.
        cortados: botones.filter((b) => b.scrollWidth > b.clientWidth + 1).length,
      };
    });
    comprobar(
      !medida.desborda && medida.cuantos === 6 && medida.cortados === 0,
      `${tam.nombre.padEnd(16)} ${tam.width}px · ${medida.cuantos} atajos, ninguno cortado`,
      `desborda=${medida.desborda} cortados=${medida.cortados}`,
    );
  }

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
