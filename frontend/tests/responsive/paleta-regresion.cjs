/**
 * La paleta del 05-10-2026, verificada donde de verdad se ve: en el navegador.
 *
 * <h2>Qué contesta este arnés que `paleta.check.mjs` no</h2>
 *
 * <p>Aquél lee `tokens.css` y mide los tokens. Este abre las pantallas y mide lo que el navegador
 * calculó de verdad, que no es lo mismo por tres razones: un `color` escrito a mano en un
 * componente no pasa por ningún token; una regla con más especificidad puede pisar al token; y un
 * token mal escrito no da error en CSS, simplemente se ignora y la propiedad se queda con lo que
 * heredó. Las tres se ven acá y en ninguna otra parte.</p>
 *
 * <h2>Y qué comprueba que NO es color</h2>
 *
 * <p>El criterio de aceptación de la guía es que «sólo cambió presentación». Eso no se demuestra
 * mirando colores: se demuestra comprobando que las pantallas siguen cargando, que las acciones
 * siguen ahí, que no apareció desbordamiento horizontal y que ninguna ruta terminó en blanco. Un
 * cambio de paleta que rompe una pantalla es exactamente igual de grave que uno que rompe una API,
 * y se nota menos.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/paleta-regresion.cjs
 *   PORTAL=admin PASS='...' node tests/responsive/paleta-regresion.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

/**
 * Los once valores de la guía.
 *
 * <p>Se comparan NORMALIZADOS a `r,g,b` y no como texto. La primera versión los esperaba en
 * `rgb(...)` y falló 44 veces seguidas contra una paleta que estaba perfecta: `getPropertyValue`
 * sobre una propiedad personalizada devuelve el texto DECLARADO —`#070b14`— y no el color
 * resuelto, porque una variable CSS no tiene tipo hasta que se usa en una propiedad que sí lo
 * tiene. Un hallazgo idéntico en los cuatro portales es sospechoso de ser del arnés, y lo era.</p>
 */
const PALETA = {
  /*
    Los valores de la ESPECIFICACIÓN DE ACABADO VISUAL PREMIUM v1.1 (06-10-2026), con las tres
    correcciones medidas que documenta `tokens.css`.

    Antes eran los de la guía del 05-10, y por eso este arnés falló 34 veces en la corrida del
    06-10: la paleta cambió y la tabla se quedó. Esos 34 no eran un defecto, eran este arnés
    haciendo su trabajo —avisar de que los colores desplegados no son los que alguien escribió
    acá—. Lo que hay que mantener al día es esta tabla, y con la fecha al lado para que la próxima
    vez se vea de un golpe cuál de las dos cosas está vieja.

    `--lx-chrome` entra a la lista: es un token nuevo, el plano propio de la cabecera y la barra
    lateral, y es justamente el que puede desaparecer sin que ninguna pantalla se rompa — lo que
    pasaría es que la consola volvería a verse plana, en silencio.
  */
  '--lx-bg': '#07111F',
  '--lx-chrome': '#0B182A',
  '--lx-surface': '#102033',
  '--lx-surface-2': '#14263A',
  '--lx-border': '#263A4F',
  '--lx-text': '#F4F8FC',
  '--lx-text-muted': '#94A8BC',
  '--lx-primary': '#1597FF',
  '--lx-success': '#25D17D',
  '--lx-warning': '#F4AE3D',
  '--lx-danger': '#EF4444',
  '--lx-info': '#A3B3C7',
};

/**
 * Tokens que un portal redefine A PROPÓSITO, con la razón al lado.
 *
 * <p>Sin esta tabla el arnés tendría dos salidas malas: o acusa a un override legítimo, o se le
 * quita la comprobación al portal entero y deja de mirar los otros diez valores.</p>
 */
const EXCEPCIONES = {
  platform: {
    '--lx-primary': 'la plataforma usa el acento claro para distinguirse del admin municipal',
  },
  inspector: {
    '--lx-border':
      'densidad `outdoor`: el borde sube a blanco al 16% para leerse bajo el sol, decisión anterior a esta paleta',
  },
};

/**
 * Colores de la paleta ANTERIOR que ya no deberían pintarse en ninguna parte.
 *
 * <p>Un token cambiado no arrastra a un color escrito a mano en un componente, y ésa es justo la
 * mezcla que la guía quiere evitar: media pantalla con la paleta nueva y media con la vieja. Se
 * buscan los tonos viejos más reconocibles en lo que el navegador calculó.</p>
 */
const PALETA_VIEJA = [
  ['rgb(10, 132, 255)', 'el azul anterior #0A84FF'],
  ['rgb(25, 198, 255)', 'el cian anterior #19C6FF'],
  ['rgb(16, 40, 68)', 'la tarjeta anterior #102844'],
  ['rgb(11, 27, 45)', 'la superficie anterior #0B1B2D'],
  ['rgb(6, 17, 31)', 'el fondo anterior #06111F'],
  ['rgb(18, 185, 129)', 'el verde anterior #12B981'],
  ['rgb(233, 75, 95)', 'el rojo anterior #E94B5F'],
  /*
    Y los de la guía del 05-10, superados por la v1.1 el 06-10.

    Van acá por lo mismo que los otros: cambiar un token no arrastra un color escrito a mano dentro
    de un componente, y media consola con la paleta nueva y media con la de ayer es precisamente lo
    que la especificación llama «no dejar páginas antiguas con componentes visuales incompatibles».

    Si alguna de estas líneas falla, NO es ruido: significa que ese valor sigue pintándose en algún
    sitio que no pasa por un token. El fondo #070B14 y la superficie #0F1724 son los dos que más
    vale vigilar, porque son los que la v1.1 vino a separar.
  */
  ['rgb(7, 11, 20)', 'el fondo de la guía del 05-10, #070B14'],
  ['rgb(15, 23, 36)', 'la superficie del 05-10, #0F1724 — era la barra lateral Y la tarjeta'],
  ['rgb(17, 29, 43)', 'la tarjeta alta del 05-10, #111D2B'],
  ['rgb(59, 130, 246)', 'el azul del 05-10, #3B82F6'],
  ['rgb(34, 197, 94)', 'el verde del 05-10, #22C55E'],
  ['rgb(245, 158, 11)', 'el ámbar del 05-10, #F59E0B'],
];

const PORTALES = {
  admin: {
    nombre: 'Administración',
    prefijo: '/admin',
    cuenta: process.env.CUENTA_ADMIN ?? 'admin@luparx.test',
    rutas: ['/', '/zones', '/spaces', '/tariffs', '/users', '/staff', '/roles', '/audit', '/reports'],
  },
  inspector: {
    nombre: 'Fiscalización',
    prefijo: '/inspector',
    cuenta: process.env.CUENTA_INSPECTOR ?? 'inspector@luparx.test',
    rutas: ['/', '/cite', '/citations', '/queue', '/more', '/profile', '/help'],
  },
  citizen: {
    nombre: 'Ciudadano',
    prefijo: '',
    cuenta: process.env.CUENTA_CITIZEN ?? 'ana.morales@luparx.test',
    rutas: ['/', '/park', '/vehicles', '/wallet', '/fines', '/notifications', '/more', '/profile'],
  },
  platform: {
    nombre: 'Plataforma',
    prefijo: '/platform',
    cuenta: process.env.CUENTA_PLATFORM ?? 'platform@luparx.test',
    // Verificadas contra el enrutador, no contra la memoria: una ruta inexistente no falla, el
    // comodín la manda a la portada y el arnés mide la portada con otro nombre (incidente 5).
    rutas: ['/', '/tenants', '/users', '/catalogs', '/reports', '/audit', '/system'],
  },
};

const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];

/**
 * `#070b14`, `rgb(7, 11, 20)` y `rgba(7,11,20,1)` son el mismo color. Devuelve `7,11,20` para los
 * tres, y `null` si trae transparencia o no se reconoce.
 */
function aRgb(valor) {
  const v = String(valor || '').trim();
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${h.slice(6)}`;
    if (h.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
  }
  const rgb = v.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3) return null;
    const alfa = p.length > 3 ? p[3] : 1;
    return alfa === 1 ? p.slice(0, 3).join(',') : `${p.slice(0, 3).join(',')},${alfa}`;
  }
  return null;
}

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}
function dato(mensaje) {
  console.log(`  ·   ${mensaje}`);
}

async function entrar(page, portal) {
  const { prefijo, cuenta } = PORTALES[portal];
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', cuenta);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse((r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);

  if (login && !login.ok()) {
    const pista =
      login.status() === 429
        ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá; no reintentes en bucle.'
        : login.status() === 401
          ? `contraseña incorrecta para ${cuenta}. Pasá la vigente con PASS=...`
          : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar a ${portal}: ${pista}`);
  }

  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
  }
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    throw new Error(`No se pudo entrar a ${portal}: seguimos en el formulario de login.`);
  }
}

/** Lo que el navegador calculó de verdad en esta pantalla. */
async function medir(page, paleta, vieja) {
  return page.evaluate(
    ({ paleta, vieja }) => {
      const raiz = getComputedStyle(document.documentElement);
      // Sólo se LEE acá; la comparación se hace en Node, donde se puede normalizar. Dentro de la
      // página, `getPropertyValue` de una propiedad personalizada devuelve el texto declarado.
      const tokens = {};
      for (const nombre of Object.keys(paleta)) {
        tokens[nombre] = { valor: raiz.getPropertyValue(nombre).trim() };
      }

      /*
        Los colores de la paleta anterior, buscados en lo que el navegador CALCULÓ, no en la hoja de
        estilos. Un `color: #0A84FF` escrito a mano dentro de un componente no aparece en
        `tokens.css` y es justo el que hay que encontrar.
      */
      const viejos = [];
      const nodos = document.querySelectorAll('body *');
      for (const nodo of nodos) {
        const estilo = getComputedStyle(nodo);
        for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
          const v = estilo[prop];
          const encontrado = vieja.find(([rgb]) => v === rgb);
          if (encontrado) {
            viejos.push({
              color: encontrado[1],
              prop,
              donde: `${nodo.tagName.toLowerCase()}.${String(nodo.className || '').trim().split(/\s+/)[0] || '?'}`,
            });
          }
        }
        if (viejos.length > 6) break;
      }

      const doc = document.documentElement;
      const main = document.querySelector('main') ?? document.body;
      return {
        tokens,
        viejos,
        // Una pantalla que no se construyó: el síntoma más caro de un cambio «sólo visual».
        raizVacia: (document.getElementById('root')?.childElementCount ?? 0) === 0,
        /*
          Reventada, que NO es lo mismo que vacía.

          `ErrorBoundary` existe justamente para que un fallo de render no deje la pantalla en
          blanco, y lo consigue: pone una tarjeta con el mensaje del error. El efecto secundario es
          que un arnés que sólo pregunta «¿hay contenido?» ve una pantalla sana. La primera corrida
          dio por buena `/platform/reports` con el título «Algo se rompió en esta pantalla», que es
          literalmente el texto de la tarjeta de error.
        */
        reventada: Boolean(document.querySelector('.lx-error-boundary')),
        mensajeDelFallo: (document.querySelector('.lx-error-boundary__detail')?.textContent ?? '').trim().slice(0, 120),
        /*
          En el login, no «hay un campo de contraseña».

          «Mi perfil» tiene uno —el de cambiar la contraseña— y es la pantalla más legítima del
          mundo. La primera corrida reportó «/profile devolvió el login» en el fiscalizador y en el
          ciudadano por eso, y las dos veces la sesión estaba perfecta: la pantalla siguiente cargó
          sin problema. Lo que distingue al login es la RUTA, más el campo de contraseña.
        */
        enLogin: location.pathname.endsWith('/login')
          || (Boolean(document.querySelector('input[type="password"]'))
              && Boolean(document.querySelector('input[type="email"]'))
              && document.querySelectorAll('nav, .lx-page-layout__sidebar, .lx-bottom-tab-bar').length === 0),
        h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 40),
        textoDeLaPantalla: (main.textContent ?? '').trim().length,
        desbordaLaPagina: doc.scrollWidth > doc.clientWidth + 1,
        // Contenido tapado o cortado: lo que la guía llama «texto cortado» y «controles fuera del
        // viewport».
        fueraDeCuadro: [...main.querySelectorAll('button, a, input, select, [role="combobox"]')].filter(
          (n) => {
            const c = n.getBoundingClientRect();
            return c.width > 0 && (c.right > doc.clientWidth + 1 || c.left < -1);
          },
        ).length,
        // El fondo del documento tiene que ser el nivel 0 y no quedarse transparente.
        fondoDelCuerpo: getComputedStyle(document.body).backgroundColor,
      };
    },
    { paleta, vieja },
  );
}

(async () => {
  const browser = await chromium.launch();
  const soloPortal = process.env.PORTAL;
  const portales = soloPortal ? [soloPortal] : ['admin', 'inspector', 'citizen', 'platform'];

  console.log(`\n${BASE} · paleta 05-10-2026 · ${portales.join(' + ')}\n`);

  for (const portal of portales) {
    const cfg = PORTALES[portal];
    if (!cfg) {
      console.error(`PORTAL desconocido: ${portal}`);
      process.exit(2);
    }
    console.log(`\n═══ ${cfg.nombre} (${cfg.cuenta}) ═══`);

    const ctxLogin = await browser.newContext({
      viewport: { width: 1536, height: 960 },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const pLogin = await ctxLogin.newPage();
    try {
      await entrar(pLogin, portal);
    } catch (error) {
      console.error(`\n  ${error.message}\n`);
      await browser.close();
      process.exit(3);
    }
    const sesion = await ctxLogin.storageState();
    await ctxLogin.close();

    // ---------------------------------------------------------------------------------------------
    // 1 · Los tokens, una vez por portal: si están mal, están mal en todas sus pantallas
    // ---------------------------------------------------------------------------------------------
    const ctx = await browser.newContext({
      storageState: sesion,
      viewport: { width: 1536, height: 960 },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    const erroresJs = [];
    page.on('pageerror', (e) => erroresJs.push(String(e.message).slice(0, 160)));
    page.on('console', (m) => {
      if (m.type() === 'error') erroresJs.push(m.text().slice(0, 160));
    });
    /*
      Las peticiones que el servidor rechaza, CON SU URL.

      «Failed to load resource: the server responded with a status of 400» es lo que la consola
      imprime, y no dice cuál recurso: con eso en la mano hay que abrir el portal a mano y mirar la
      pestaña de red. La URL y el método los tiene el arnés delante, así que los anota.
    */
    const peticionesFallidas = [];
    page.on('response', (res) => {
      if (res.status() >= 400) {
        peticionesFallidas.push(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, '')}`);
      }
    });

    await page.goto(`${BASE}${cfg.prefijo}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const primera = await medir(page, PALETA, PALETA_VIEJA);

    console.log('\n-- los once valores de la guía, leídos del navegador --');
    const excepciones = EXCEPCIONES[portal] ?? {};
    for (const [nombre, { valor }] of Object.entries(primera.tokens)) {
      if (excepciones[nombre]) {
        dato(`${nombre.padEnd(18)} ${valor.padEnd(10)} override: ${excepciones[nombre]}`);
        continue;
      }
      const leido = aRgb(valor);
      const esperado = aRgb(PALETA[nombre]);
      comprobar(
        leido !== null && leido === esperado,
        `${nombre.padEnd(18)} ${valor}`,
        `esperaba ${PALETA[nombre]} (${esperado}) y leí ${leido ?? 'algo que no es un color'}`,
      );
    }
    comprobar(
      primera.fondoDelCuerpo !== 'rgba(0, 0, 0, 0)',
      'el cuerpo tiene fondo propio, no transparente',
      primera.fondoDelCuerpo,
    );

    // ---------------------------------------------------------------------------------------------
    // 2 · Cada pantalla: que siga viva, que no desborde y que no quede color viejo pintado
    // ---------------------------------------------------------------------------------------------
    console.log('\n-- las pantallas, a 1536px --');
    for (const ruta of cfg.rutas) {
      await page.goto(`${BASE}${cfg.prefijo}${ruta}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2200);
      const m = await medir(page, PALETA, PALETA_VIEJA);

      if (m.enLogin) {
        comprobar(false, `${ruta} · la ruta devolvió el login`, 'la sesión se cayó a mitad de corrida');
        continue;
      }
      // Lo más caro de un cambio «sólo visual»: una pantalla que dejó de construirse. Un conteo en
      // cero sin contexto no distingue «no se construyó» de «la aplicación reventó», así que el
      // fallo imprime dónde estaba parado.
      comprobar(
        !m.raizVacia && !m.reventada && m.textoDeLaPantalla > 40,
        `${ruta.padEnd(16)} · la pantalla se construyó («${m.h1}»)`,
        m.reventada
          ? `la pantalla REVENTÓ y el ErrorBoundary la reemplazó: ${m.mensajeDelFallo}`
          : `raízVacía=${m.raizVacia} caracteres=${m.textoDeLaPantalla} consola=${erroresJs.slice(0, 2).join(' | ') || 'limpia'}`,
      );
      comprobar(!m.desbordaLaPagina, `${ruta.padEnd(16)} · sin desborde horizontal`);
      comprobar(
        m.fueraDeCuadro === 0,
        `${ruta.padEnd(16)} · ningún control fuera del cuadro`,
        `${m.fueraDeCuadro} control(es) con parte fuera del viewport`,
      );
      comprobar(
        m.viejos.length === 0,
        `${ruta.padEnd(16)} · nada pintado con la paleta anterior`,
        m.viejos.map((v) => `${v.color} en ${v.prop} de ${v.donde}`).join(' · '),
      );
    }

    // ---------------------------------------------------------------------------------------------
    // 3 · Responsive: la guía pide que el portal siga siendo navegable en todos los anchos
    // ---------------------------------------------------------------------------------------------
    console.log('\n-- la portada del portal, en seis anchos --');
    for (const tam of TAMANOS) {
      const ctxTam = await browser.newContext({
        storageState: sesion,
        viewport: { width: tam.width, height: tam.height },
        isMobile: tam.movil,
        hasTouch: tam.movil,
        locale: 'es-CR',
        ignoreHTTPSErrors: true,
      });
      const p = await ctxTam.newPage();
      await p.goto(`${BASE}${cfg.prefijo}/`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(2000);
      const m = await medir(p, PALETA, PALETA_VIEJA);
      comprobar(
        !m.desbordaLaPagina && !m.raizVacia && !m.enLogin && m.fueraDeCuadro === 0,
        `${tam.nombre.padEnd(18)} ${String(tam.width).padStart(4)}px`,
        `desborda=${m.desbordaLaPagina} raízVacía=${m.raizVacia} enLogin=${m.enLogin} fueraDeCuadro=${m.fueraDeCuadro}`,
      );
      await ctxTam.close();
    }

    comprobar(
      erroresJs.length === 0,
      `${cfg.nombre} · ni un error nuevo en consola`,
      erroresJs.slice(0, 3).join(' | '),
    );
    comprobar(
      peticionesFallidas.length === 0,
      `${cfg.nombre} · ninguna petición rechazada por el servidor`,
      [...new Set(peticionesFallidas)].slice(0, 6).join('\n        '),
    );
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
