/**
 * ¿Cabe lo importante en la primera pantalla, sin hacer scroll?
 *
 * Esto NO es el detector de desborde (`mobile-overflow.cjs`): aquel mide si algo se sale de lado.
 * Acá el defecto es vertical y no se sale de ningún lado — simplemente queda más abajo del pliegue,
 * y la persona no sabe que está. Reportado el 2026-09-19 en un iPhone 14 Pro Max: para «agregar un
 * vehículo» había que hacer scroll, aunque el botón vive en la cabecera de la pantalla.
 *
 * Tres cosas que mide y por qué cada una:
 *
 *   1. ALTO DECLARADO vs VISIBLE. En Safari de iPhone `100vh` es la altura con la barra de
 *      herramientas retraída, mayor que lo que se ve. Un shell con `min-height: 100vh` se declara
 *      más alto que la pantalla y empuja fuera lo que esté anclado abajo. Se emula reduciendo el
 *      viewport a la altura real que deja Safari con sus barras.
 *
 *   2. ACCIONES BAJO EL PLIEGUE. Cada botón/enlace principal de la pantalla: ¿su borde inferior
 *      cae dentro del alto visible? Un botón a 940px en una pantalla de 932 es invisible aunque el
 *      DOM diga que está.
 *
 *   3. TAPADO POR EL CROMO. Un elemento puede estar dentro del alto visible y aun así quedar
 *      debajo de la barra de pestañas fija o de la cabecera sticky. Se mide con el rectángulo real
 *      de esas barras, no suponiendo su altura.
 *
 *   node tests/responsive/sobre-el-pliegue.cjs
 *   BASE=http://localhost:5183 node tests/responsive/sobre-el-pliegue.cjs
 *   PORTAL=inspector node tests/responsive/sobre-el-pliegue.cjs
 */
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';

/*
  `Password123!` es la contraseña de los seeds del repositorio y NO es la de staging: las cuentas se
  cambiaron a la de demostración. Se avisa antes de gastar un intento, porque el limitador cuenta
  5 fallos por cuenta y después bloquea 15 minutos — y un bloqueo por una contraseña que ya se
  sabía vieja es tiempo perdido dos veces.

  También se atrapa el marcador de posición pegado literalmente: pasó, y cada pegada cuenta como
  intento fallido y realimenta el bloqueo.
*/
if (/^<.*>$/.test(PASS)) {
  console.error(
    `\n  ✗ PASS llegó como marcador de posición literal (${PASS}).\n` +
      '    Poné la contraseña de verdad entre comillas simples:\n' +
      "      PASS='laQueSea' node tests/responsive/sobre-el-pliegue.cjs\n",
  );
  process.exit(2);
}
if (!process.env.PASS) {
  console.warn(
    '\n  ⚠ Sin PASS: se usará la de los seeds del repo, que en staging NO sirve desde el\n' +
      '    2026-09-19. Si esto es staging, cortá ahora y pasá PASS=... (ver\n' +
      '    claude/credenciales-y-arneses-de-prueba.md).\n',
  );
}
const PORTAL = process.env.PORTAL ?? 'citizen';

/*
  La cuenta se puede sobrescribir: el limitador cuenta POR CUENTA, así que cuando una queda
  bloqueada 15 minutos hay otra disponible y no hace falta esperar.

    CUENTA=citizen@luparx.test PASS='...' node tests/responsive/sobre-el-pliegue.cjs
*/
const CUENTAS = {
  citizen: process.env.CUENTA ?? 'ana.morales@luparx.test',
  inspector: process.env.CUENTA ?? 'inspector@luparx.test',
  admin: process.env.CUENTA ?? 'admin@luparx.test',
};
const PREFIJO = { citizen: '', admin: '/admin', inspector: '/inspector' };

const RUTAS = {
  citizen: ['/', '/vehicles', '/wallet', '/movements', '/fines', '/notifications', '/more', '/profile'],
  inspector: ['/', '/queue', '/citations', '/plate-lookup', '/profile'],
  admin: ['/', '/zones', '/users', '/audit'],
};

/**
 * La altura del navegador NO es la del teléfono. En un iPhone 14 Pro Max la pantalla son 932pt
 * pero Safari se queda con la barra de direcciones y la de herramientas; a la página le quedan
 * ~745. Medir a 932 es justamente el error que esconde este defecto, así que cada perfil trae
 * `visible`: lo que de verdad ve la persona.
 */
const TELEFONOS = [
  { nombre: 'iPhone SE',        viewport: { width: 375, height: 667 }, visible: 553 },
  { nombre: 'iPhone 14',        viewport: { width: 390, height: 844 }, visible: 664 },
  { nombre: 'iPhone 14 Pro Max',viewport: { width: 430, height: 932 }, visible: 745 },
  { nombre: 'Pixel 7',          viewport: { width: 412, height: 915 }, visible: 728 },
  { nombre: 'Galaxy S8 chico',  viewport: { width: 360, height: 740 }, visible: 592 },
];

/**
 * Hasta abajo del todo, y esperar a que se asiente.
 *
 * <p>Es la única posición donde «la barra tapa esto» significa algo: arriba del todo, medio
 * contenido cruza la barra fija por pura geometría y el scroll lo resuelve. Abajo del todo ya no
 * queda scroll, así que lo que siga debajo de la barra está debajo para siempre.</p>
 */
async function alFondo(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(450);
}

async function medir(page, altoVisible) {
  return page.evaluate((visible) => {
    const rec = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);

    // El cromo fijo/sticky real, medido y no supuesto.
    let topeCromo = 0;
    let pisoCromo = visible;
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      const b = el.getBoundingClientRect();
      if (b.height === 0 || b.width === 0) continue;
      if (b.top <= 1 && b.bottom > topeCromo && b.bottom < visible / 2) topeCromo = b.bottom;
      if (b.bottom >= visible - 2 && b.top < pisoCromo && b.top > visible / 2) pisoCromo = b.top;
    }

    // Acciones: lo que la persona vino a tocar.
    const acciones = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // Las que viven DENTRO del cromo (pestañas, campana) no cuentan: siempre están a la vista.
      if (el.closest('.lx-bottom-tab-bar, .lx-top-chrome, .lx-app-bar')) continue;
      const texto = rec(el.textContent) || rec(el.getAttribute('aria-label'));
      if (!texto) continue;
      acciones.push({
        texto,
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        fueraDelPliegue: b.top >= visible,
        tapadaAbajo: b.bottom > pisoCromo && b.top < pisoCromo,
        tapadaArriba: b.top < topeCromo && b.bottom > 0,
      });
    }

    const doc = document.documentElement;
    return {
      altoDeclarado: doc.scrollHeight,
      altoVisible: visible,
      topeCromo: Math.round(topeCromo),
      pisoCromo: Math.round(pisoCromo),
      espacioUtil: Math.round(pisoCromo - topeCromo),
      acciones,
      // La primera acción de la pantalla es la que más importa: si esa ya exige scroll, el
      // diseño está mal ordenado, no "un poco largo".
      primeraAccion: acciones[0] ?? null,
    };
  }, altoVisible);
}

/**
 * Entra, y ABORTA si no entró.
 *
 * La primera corrida (2026-09-19) reportó «40 vistas · 40 con problemas» y las 40 eran la MISMA
 * pantalla: el login. La contraseña por omisión del arnés había quedado vieja —las cuentas se
 * cambiaron a la de demostración para el tutorial del cliente—, el login fallaba en silencio y la
 * aplicación dejaba el formulario en pantalla, así que el medidor encontraba «¿Olvidaste tu
 * contraseña?» y «Crear cuenta» fuera del pliegue y los reportaba como defectos de /vehicles,
 * /wallet y las demás. Un informe entero de hallazgos falsos, que además vació el crédito del
 * limitador: 40 intentos fallidos dejaron la cuenta bloqueada 15 minutos.
 *
 * De ahí las dos comprobaciones de abajo. Una medición que no puede confirmar QUÉ está midiendo
 * no vale nada, y es peor que ninguna: manda a arreglar pantallas que no están rotas.
 */
async function entrar(page, portal) {
  const prefijo = PREFIJO[portal];
  await page.goto(`${BASE}${prefijo}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.fill('input[type="email"]', CUENTAS[portal]);
  await page.fill('input[type="password"]', PASS);

  // La respuesta del login, no lo que quede en pantalla: 401 y 429 se distinguen, y un 429 tras
  // varias corridas seguidas es el limitador y no una contraseña mala.
  const respuesta = page
    .waitForResponse((r) => r.url().includes('/password') === false && /\/auth\/[a-z]+\/login$/.test(r.url()), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  await page.waitForTimeout(1800);

  if (login && !login.ok()) {
    const pista =
      login.status() === 429
        ? 'el limitador bloqueó la cuenta (5 fallos = 15 min). Esperá y no reintentes en bucle.'
        : login.status() === 401
          ? `contraseña incorrecta para ${CUENTAS[portal]}. Pasá la vigente con PASS=...`
          : `el servidor respondió ${login.status()}.`;
    throw new Error(`No se pudo entrar: ${pista}`);
  }

  // El selector de municipalidad se disfraza de pantalla real. Se busca el botón que CONTIENE el
  // nombre (la ficha trae además la insignia «Ya la usás»), no un texto exacto.
  const ficha = page.locator('button, a').filter({ hasText: 'San José' }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }

  // Segunda red: aunque el login haya dado 200, si el formulario sigue en pantalla no se entró.
  // Se comprueba por un campo de contraseña visible y no por un texto, que cambia con el idioma.
  const sigueEnLogin = await page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (sigueEnLogin) {
    throw new Error(
      'No se pudo entrar: seguimos en el formulario de login. Medir desde acá produce hallazgos ' +
        'falsos en TODAS las rutas (ya pasó una vez).',
    );
  }
}

(async () => {
  const browser = await chromium.launch();
  let problemas = 0;
  let vistas = 0;

  console.log(`\n${BASE}${PREFIJO[PORTAL]} · ${CUENTAS[PORTAL]}`);
  console.log('Alto "visible" = lo que queda para la página después de las barras del navegador.\n');

  /*
    UN solo login para los cinco viewports, y su estado reusado. Antes se entraba una vez por
    viewport: cinco intentos por corrida, así que una contraseña vieja quemaba de una el crédito del
    limitador (5 fallos = 15 min) y la segunda corrida ya no podía ni medir ni averiguar nada.
    Además tarda cinco veces menos.
  */
  const ctxLogin = await browser.newContext({
    viewport: { width: 390, height: 664 },
    isMobile: true,
    hasTouch: true,
    locale: 'es-CR',
    ignoreHTTPSErrors: true,
  });
  const pageLogin = await ctxLogin.newPage();
  let sesion;
  try {
    await entrar(pageLogin, PORTAL);
    sesion = await ctxLogin.storageState();
  } catch (e) {
    // Se ABORTA, no se sigue. Antes esto era un aviso en una línea entre cuarenta, y la corrida
    // continuaba midiendo el login como si fuera cada una de las pantallas.
    console.error(`\n  ✗ ${String(e.message).split('\n')[0]}\n`);
    await ctxLogin.close();
    await browser.close();
    process.exit(2);
  }
  await ctxLogin.close();
  console.log('  Sesión iniciada una vez y reusada en todos los tamaños.');

  for (const tel of TELEFONOS) {
    console.log(`\n########## ${tel.nombre}  ${tel.viewport.width}x${tel.viewport.height} (visible ${tel.visible}) ##########`);
    const ctx = await browser.newContext({
      // La altura del contexto ES la visible: así el navegador reporta lo mismo que ve la persona.
      viewport: { width: tel.viewport.width, height: tel.visible },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      storageState: sesion,
    });
    const page = await ctx.newPage();
    // Un solo reintento de sesión por viewport: si hace falta dos veces, no es el vencimiento.
    let reintentado = false;

    for (const ruta of RUTAS[PORTAL]) {
      try {
        await page.goto(`${BASE}${PREFIJO[PORTAL]}${ruta}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1100);

        /*
          La sesión reusada puede caerse a mitad de corrida —token vencido, sesión revocada— y
          entonces la ruta protegida vuelve a mostrar el login. Se comprueba en CADA ruta y no sólo
          al entrar: sin esto, medir el login disfrazado de pantalla real es exactamente el informe
          de cuarenta hallazgos falsos que originó todas estas redes.
        */
        const cayoAlLogin = await page
          .locator('input[type="password"]')
          .first()
          .isVisible()
          .catch(() => false);
        if (cayoAlLogin) {
          /*
            El token de acceso dura 15 minutos y la aplicación lo renueva sola con el refresh token;
            el arnés reusa un `storageState` congelado del primer login, así que en una corrida larga
            —cinco viewports por ocho rutas— se le vence a mitad. Es una limitación del arnés y no un
            defecto del producto (comprobado: `expiresIn` 900 s y refresh token presente).

            Se vuelve a entrar UNA vez y se sigue. Si tras reentrar sigue apareciendo el login,
            entonces sí es otra cosa y se aborta: medir el formulario como si fuera esta pantalla es
            lo que produjo el informe de cuarenta hallazgos falsos.
          */
          if (!reintentado) {
            reintentado = true;
            console.log('  ↻  la sesión venció; se vuelve a entrar y se continúa');
            await entrar(page, PORTAL);
            await page.goto(`${BASE}${PREFIJO[PORTAL]}${ruta}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1100);
          }
          const sigueCaido = await page
            .locator('input[type="password"]')
            .first()
            .isVisible()
            .catch(() => false);
          if (sigueCaido) {
            console.error(
              `\n  ✗ ${ruta} devuelve el login incluso después de volver a entrar. Se aborta en vez\n` +
                '    de medir el formulario como si fuera esta pantalla.\n',
            );
            await ctx.close();
            await browser.close();
            process.exit(2);
          }
        }

        // Arriba del todo: qué se ve sin tocar nada.
        const r = await medir(page, tel.visible);
        // Abajo del todo: qué queda tapado cuando ya no hay más scroll.
        await alFondo(page);
        const fondo = await medir(page, tel.visible);
        vistas++;

        /*
          TAPADA y FUERA DEL PLIEGUE no son el mismo defecto, y mezclarlos hace ilegible el informe.

          Fuera del pliegue = hay que bajar para verlo, lo que en una pantalla con contenido real
          —el Inicio con una estadía activa mide 790px en 425 visibles— es scroll legítimo y no un
          fallo de maquetación.

          Tapada = la barra fija está encima Y NO QUEDA SCROLL PARA CORRERLO. Esa segunda mitad es
          la que faltaba: hasta el 2026-09-23 esto se medía con la página arriba del todo, donde
          cualquier contenido que todavía no se desplazó cruza la barra por pura geometría. Así
          reportó cuatro defectos inventados —«Agregar tarjeta», «Más opciones», «Español (Costa
          Rica)»— en pantallas que se arreglan bajando dos dedos. `main` ya reserva
          `padding-bottom: calc(space-4 + footerHeight)` justamente para que eso no pase, y el
          arnés estaba acusando a la reserva de no existir mientras la medía en el único momento
          en que no se nota.

          Ahora se mide DESPUÉS de ir al fondo: si algo sigue debajo de la barra ahí, está debajo
          para siempre, y eso sí es el defecto que este arnés vino a buscar.

          Sólo cuenta como fallo eso, más el caso en que la PRIMERA acción de la pantalla exige
          scroll: eso dice que el orden está mal, no que la página sea larga.
        */
        // Cada una se mide donde su afirmación significa algo, y NO en el mismo sitio.
        //
        // Abajo del todo: lo que la barra inferior tapa ahí, lo tapa para siempre.
        // Arriba del todo: lo que la cabecera tapa ahí, es que la página no le reservó espacio.
        //
        // Mezclarlas fue el arreglo a medias del 23-09-2026: se movieron las DOS al fondo, y ahí
        // «tapada por la cabecera» se volvió cierta para todo el contenido que quedó por encima del
        // viewport —que es la mitad de la página, legítimamente—. La salida lo decía sin disimulo:
        // «la cabecera hasta 0».
        const tapadas = [
            ...fondo.acciones.filter((a) => a.tapadaAbajo),
            ...r.acciones.filter((a) => a.tapadaArriba),
        ];
        const bajoElPliegue = r.acciones.filter((a) => a.fueraDelPliegue);
        const malas = tapadas;
        const primeraExigeScroll = r.primeraAccion && r.primeraAccion.fueraDelPliegue;

        if (malas.length === 0 && !primeraExigeScroll) {
          const nota = bajoElPliegue.length
            ? ` · ${bajoElPliegue.length} bajo el pliegue (scroll normal)`
            : '';
          console.log(
            `  ok  ${ruta}  · útil ${r.espacioUtil}px · ${r.acciones.length} acciones${nota}`,
          );
          continue;
        }
        problemas++;
        console.log(`  ✗   ${ruta}  · útil ${r.espacioUtil}px · alto ${r.altoDeclarado}px`);
        if (primeraExigeScroll) {
          console.log(`        LA PRIMERA ACCIÓN EXIGE SCROLL: "${r.primeraAccion.texto}" empieza en ${r.primeraAccion.top}px`);
        }
        for (const a of malas.slice(0, 5)) {
          const causa = a.tapadaAbajo
            ? `tapada por la barra inferior con la página al fondo (empieza ${a.top}, la barra en ${fondo.pisoCromo})`
            : a.tapadaArriba
              ? `tapada por la cabecera sin haber hecho scroll (termina ${a.bottom}, la cabecera hasta ${r.topeCromo})`
              : `fuera del pliegue (empieza en ${a.top}, se ve hasta ${r.altoVisible})`;
          console.log(`        "${a.texto}" — ${causa}`);
        }
      } catch (e) {
        console.log(`  ?   ${ruta} — ${String(e.message).split('\n')[0]}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${vistas} vistas · ${problemas} con acciones fuera de la vista =====`);
  process.exit(problemas > 0 ? 1 : 0);
})();
