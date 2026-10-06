/**
 * Fase 1 — la pantalla Usuarios (/admin/users). Los siete criterios de aceptación del PDF.
 *
 * <h2>Qué contesta este arnés que leer el código no</h2>
 *
 * <p>Dos cosas que sólo se ven con el navegador abierto y la red mirada. La primera: que el
 * desplegable de Rol no muestre un enum. Eso parece comprobable leyendo el `label`, y no lo es —el
 * `Select` del proyecto es un `<button role="combobox">` con su propio panel, así que lo que la
 * persona lee sale de un nodo que no existe hasta que alguien pulsa.</p>
 *
 * <p>La segunda, que es la que de verdad importa: que elegir «Jefe de fiscalización» siga mandando
 * `INSPECTOR_LEAD`. Esa es la mitad peligrosa del encargo —cambiar una etiqueta y romper el filtro
 * sin que nada se vea mal— y se comprueba de la única forma que no admite discusión: interceptando
 * la petición y leyendo su `query string`.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/usuarios-fase1.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA_ADMIN ?? 'admin@luparx.test';
const SALIDA = process.env.SALIDA ?? path.join(__dirname, 'capturas');

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/** Los códigos que NO deben aparecer como etiqueta en ninguna parte visible. */
const CODIGOS = [
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'TENANT_ADMIN',
  'TENANT_FINANCE',
  'TENANT_SUPPORT',
  'TENANT_INTEGRATION',
  'INSPECTOR_LEAD',
  'INSPECTOR',
  'CITIZEN',
];

/** Las etiquetas que sí deben aparecer, de la tabla del PDF. */
const ETIQUETAS = [
  'Administrador de plataforma',
  'Administrador municipal',
  'Finanzas',
  'Soporte municipal',
  'Integración',
  'Fiscalizador',
  'Jefe de fiscalización',
  'Ciudadano',
];

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) console.log(`  ok  ${mensaje}`);
  else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}
function dato(mensaje) {
  console.log(`  ·   ${mensaje}`);
}

async function entrar(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()), { timeout: 15000 })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);
  if (login && !login.ok()) {
    const pista = login.status() === 429
      ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá; no reintentes en bucle.'
      : login.status() === 401
        ? `contraseña incorrecta para ${CUENTA}. Pasá la vigente con PASS=...`
        : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar: ${pista}`);
  }
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }
  if (page.url().endsWith('/login')) {
    throw new Error('No se pudo entrar: seguimos en el login. Medir desde acá produce hallazgos falsos.');
  }
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  console.log(`\n${BASE} · Fase 1 · Usuarios · ${CUENTA}\n`);
  try {
    await entrar(page);
  } catch (error) {
    console.error(`\n  ${error.message}\n`);
    await browser.close();
    process.exit(3);
  }

  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  // ───────────────────────────────────────────────────────── 1 · la pantalla se construyó
  const h1 = (await page.locator('h1').first().textContent().catch(() => '')) ?? '';
  comprobar(h1.trim().length > 0 && !/se rompió/i.test(h1), 'la pantalla de Usuarios se construyó', `h1=«${h1.trim()}»`);
  comprobar(
    (await page.locator('.lx-error-boundary').count()) === 0,
    'y no reventó por dentro',
    (await page.locator('.lx-error-boundary').textContent().catch(() => '')) ?? '',
  );
  const subtitulo = await page.locator('.lx-page-header__subtitle').textContent().catch(() => null);
  comprobar(Boolean(subtitulo && subtitulo.trim().length > 0), 'tiene la línea de apoyo bajo el título', `«${subtitulo ?? ''}»`);

  // ───────────────────────────────────────────── 2 · el desplegable de Rol, abierto
  const combos = page.locator('[role="combobox"]');
  const cuantos = await combos.count();
  dato(`${cuantos} desplegables en la banda de filtros`);
  // El de Rol es el primero de los tres, y se identifica por su nombre accesible para no depender
  // del orden visual.
  const rol = page.locator('[role="combobox"][aria-label*="Rol"], [role="combobox"][aria-label*="rol"]').first();
  const hayRol = await rol.count() > 0;
  comprobar(hayRol, 'se encuentra el desplegable de Rol por su nombre accesible');

  let textoDelPanel = '';
  if (hayRol) {
    await rol.click();
    await page.waitForTimeout(500);
    textoDelPanel = (await page.locator('[role="listbox"]').first().textContent().catch(() => '')) ?? '';
    dato(`opciones: ${textoDelPanel.replace(/\s+/g, ' ').trim().slice(0, 160)}`);

    const codigosVisibles = CODIGOS.filter((c) => textoDelPanel.includes(c));
    comprobar(
      codigosVisibles.length === 0,
      'ningún código técnico aparece como etiqueta en el desplegable',
      `se ven: ${codigosVisibles.join(', ')}`,
    );
    const faltan = ETIQUETAS.filter((e) => !textoDelPanel.includes(e));
    comprobar(
      faltan.length === 0,
      'están las ocho etiquetas humanas de la tabla del PDF',
      `faltan: ${faltan.join(', ')}`,
    );

    // ── LA comprobación: la etiqueta humana filtra con el código interno ──────────────────────
    const peticion = page
      .waitForRequest((r) => r.url().includes('/api/v1/admin/users?') && r.url().includes('role='), { timeout: 10000 })
      .catch(() => null);
    await page.locator('[role="option"]').filter({ hasText: 'Jefe de fiscalización' }).first().click();
    const pedida = await peticion;
    await page.waitForTimeout(1200);
    comprobar(
      pedida !== null && new URL(pedida.url()).searchParams.get('role') === 'INSPECTOR_LEAD',
      'elegir «Jefe de fiscalización» filtra con INSPECTOR_LEAD',
      pedida ? `la petición llevó role=${new URL(pedida.url()).searchParams.get('role')}` : 'no salió ninguna petición con `role=`',
    );
  }

  // ───────────────────────────────────────────── 3 · nada de códigos en el resto de la pantalla
  const textoVisible = (await page.locator('main').innerText().catch(() => '')) ?? '';
  const colados = CODIGOS.filter((c) => textoVisible.includes(c));
  comprobar(
    colados.length === 0,
    'tampoco hay códigos técnicos en la tabla ni en los filtros',
    `se ven: ${colados.join(', ')}`,
  );
  comprobar(
    !/undefined|NaN|null|\[object/.test(textoVisible),
    'y no hay textos de desarrollo a la vista',
  );

  // ───────────────────────────────────────────── 4 · la columna de estado y su insignia
  /*
    Primero se quita el filtro, y esto NO es higiene: es el arreglo de un fallo.

    La primera corrida dijo «los estados se dibujan como insignia — encontré 0», y la pantalla las
    dibuja. Lo que pasó es que tres líneas antes se había elegido «Jefe de fiscalización» para
    comprobar que filtra con el código, así que la tabla estaba legítimamente VACÍA: la cabecera
    sigue ahí con cero filas, de modo que `thead th` contestaba y `tbody .lx-badge` contaba cero.

    El delator estaba en la propia salida: dos líneas más abajo, con la pantalla recargada, decía
    «filas sin filtro: 6». Contar celdas de una tabla filtrada a nada es medir el filtro, no la
    celda.
  */
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const filasParaInsignias = await page.locator('tbody tr').count();
  comprobar(
    filasParaInsignias > 0,
    'hay filas que mirar antes de medir sus celdas',
    'la tabla salió vacía: lo que siga no dice nada de cómo se dibuja un estado',
  );
  const cabeceras = await page.locator('thead th').allTextContents();
  dato(`columnas: ${cabeceras.map((c) => c.trim()).join(' · ')}`);
  comprobar(
    cabeceras.some((c) => /estado de cuenta/i.test(c)),
    'la columna de estado se llama «Estado de cuenta»',
    `las cabeceras son: ${cabeceras.join(', ')}`,
  );
  comprobar(cabeceras.some((c) => /^rol$/i.test(c.trim())), 'y hay una columna de Rol');
  if (filasParaInsignias > 0) {
    const insignias = await page.locator('tbody .lx-badge').count();
    comprobar(
      insignias > 0,
      'los estados se dibujan como insignia, no como texto plano',
      `encontré ${insignias} en ${filasParaInsignias} filas`,
    );
    comprobar(
      (await page.locator('tbody .lx-badge__dot').count()) > 0,
      'y la insignia lleva su punto de color',
    );
  }

  // ───────────────────────────────────────────── 5 · búsqueda, filtros y paginación siguen vivos
  const filasAntes = filasParaInsignias;
  /*
    El buscador DE LA PANTALLA, dentro de la banda de filtros.

    Acá decía `page.locator('input[type="search"], main input').first()`, y falló: desde el 06-10 la
    cabecera del admin tiene un buscador global, que es el ÚNICO `input[type="search"]` de toda la
    aplicación. Un selector con coma devuelve la primera coincidencia en orden del DOM, y la cabecera
    va antes que `main`, así que el arnés escribía en el buscador de la cabecera —que abre un panel de
    destinos y no consulta nada— y luego se quejaba de que la búsqueda no consultaba al servidor.

    Un localizador escrito con una alternativa «por si acaso» es un localizador que no sabe qué está
    midiendo. Éste nombra el sitio: el campo de la banda de filtros.
  */
  const busqueda = page.locator('.lx-filter-row--search input').first();
  comprobar(
    (await busqueda.count()) > 0,
    'se encuentra el campo de búsqueda DE LA PANTALLA, no el de la cabecera',
  );
  const vistas = [];
  const anota = (peticion) => {
    const url = peticion.url();
    if (url.includes('/api/v1/admin/users')) vistas.push(url.replace(BASE, ''));
  };
  page.on('request', anota);
  await busqueda.fill('a');
  await page.waitForTimeout(2500);
  page.off('request', anota);
  const conQ = vistas.filter((u) => /[?&]q=a(&|$)/.test(u));
  comprobar(
    conQ.length > 0,
    'la búsqueda sigue consultando al servidor',
    // Las URLs vistas, en el fallo: sin esto, «no consultó» no distingue entre un campo que no
    // reacciona, un campo equivocado y una petición con otra forma. Con esto se lee de un golpe.
    vistas.length > 0 ? `peticiones vistas: ${vistas.join(' | ')}` : 'no salió NINGUNA petición a /admin/users',
  );
  dato(`filas sin filtro: ${filasAntes} · con «a»: ${await page.locator('tbody tr').count()}`);

  // El `?q=` de la URL, que es lo que el buscador de la cabecera usa.
  await page.goto(`${BASE}/admin/users?q=ana`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const valorInicial = await page.locator('.lx-filter-row--search input').first().inputValue().catch(() => '');
  comprobar(valorInicial === 'ana', 'la pantalla arranca filtrada por el `?q=` de la URL', `el campo dice «${valorInicial}»`);

  const paginacion = await page.locator('.lx-pagination, [class*="pagination"]').count();
  comprobar(paginacion > 0, 'la paginación sigue en la pantalla');

  // ───────────────────────────────────────────── 6 · a 100% de zoom, nada cortado ni desbordado
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const medidas = await page.evaluate(() => {
    const doc = document.documentElement;
    const recortados = [...document.querySelectorAll('main th, main td, main .lx-btn, main h1, .lx-page-header__subtitle')]
      .filter((n) => n.scrollWidth > n.clientWidth + 1)
      .map((n) => (n.textContent ?? '').trim().slice(0, 24));
    const tabla = document.querySelector('.lx-table-wrapper');
    return {
      desbordeH: doc.scrollWidth - doc.clientWidth,
      desbordeTabla: tabla ? tabla.scrollWidth - tabla.clientWidth : 0,
      recortados,
    };
  });
  comprobar(medidas.desbordeH <= 0, 'sin scroll horizontal en la página', `desborda ${medidas.desbordeH}px`);
  comprobar(
    medidas.recortados.length === 0,
    'y sin contenido cortado',
    `cortados: ${medidas.recortados.join(' | ')}`,
  );
  if (medidas.desbordeTabla > 0) {
    dato(`la tabla tiene ${medidas.desbordeTabla}px de desplazamiento propio (es su contenedor, no la página)`);
  }

  // ───────────────────────────────────────────── 7 · las dos capturas que pide la entrega
  await page.screenshot({ path: path.join(SALIDA, 'usuarios-fase1-normal.png'), fullPage: true });
  const rol2 = page.locator('[role="combobox"][aria-label*="Rol"], [role="combobox"][aria-label*="rol"]').first();
  if (await rol2.count() > 0) {
    await rol2.click();
  }
  // Lo suficiente para que el panel acabe de abrirse antes de la foto: una captura a mitad de
  // apertura es justo la que no sirve para aprobar nada.
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SALIDA, 'usuarios-fase1-roles-abierto.png') });
  dato(`capturas en ${SALIDA}`);

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
