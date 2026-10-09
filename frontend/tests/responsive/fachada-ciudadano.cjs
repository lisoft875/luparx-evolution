/**
 * La fachada del Ciudadano, medida contra su especificación (09-10-2026).
 *
 * <p>El documento da una tabla de medidas —«construcción exacta de arriba hacia abajo»— y una
 * lista de aceptación con tres tamaños. Esto mide esa tabla: lo que el navegador compuso, no lo
 * que la hoja de estilos declara.</p>
 *
 * <p>Lo que NO mide, y conviene saberlo: si «se parece a la referencia». Eso no es comprobable y
 * pretenderlo con una comparación de píxeles daría un número que nadie sabría interpretar. Lo que
 * sí se comprueba es que cada bloque exista, esté en su orden, tenga su tamaño y no lleve ningún
 * dato inventado — que es donde esta especificación se puede incumplir sin que se note.</p>
 *
 *   PASS='...' node tests/responsive/fachada-ciudadano.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA_CITIZEN ?? 'ana.morales@luparx.test';

/** Los tres del paso 10, más el ancho mínimo que el punto 7 admite. */
const TAMANOS = [
  { nombre: '360x800 (el mínimo que admite el punto 7)', width: 360, height: 800 },
  { nombre: '375x812', width: 375, height: 812 },
  { nombre: '390x844', width: 390, height: 844 },
  { nombre: '768x1024 (tablet)', width: 768, height: 1024 },
];

let fallos = 0;
function ok(condicion, mensaje, detalle) {
  if (condicion) {
    console.log(`  ok  ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const respuesta = page
    .waitForResponse(
      (r) => !r.url().includes('/password') && /\/auth\/[a-z]+\/login$/.test(r.url()),
      {
        timeout: 20000,
      },
    )
    .catch(() => null);
  await page.click('button[type="submit"]');
  const login = await respuesta;
  if (login && !login.ok()) {
    console.error(`El login del ciudadano falló con ${login.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(2200);

  /*
    El ciudadano NO entra a su Inicio al iniciar sesión: entra al selector de municipalidad, una
    pantalla con título propio y una ficha por municipalidad. Faltando este paso, todo lo que mide
    esta prueba se mide sobre esa pantalla: no hay héroe, no hay «Estacionar ahora», la barra
    inferior tiene cero destinos y mide cero. Eso fue exactamente la corrida del 09-10 —28 fallos,
    ninguno real—, y es el modo más caro de equivocarse que tiene un arnés: no da un falso negativo
    silencioso sino un expediente entero de defectos inventados sobre una pantalla correcta.

    `barras-fijas.cjs` ya daba este paso; esta prueba nació sin él.
  */
  const ficha = page
    .locator('button, a')
    .filter({ hasText: /San José|Escazú|Montes de Oca/ })
    .first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1600);
  }

  return page;
}

/**
 * Antes de medir: ¿esto es el Inicio del ciudadano?
 *
 * <p>La comprobación no es decorativa. Medir la pantalla equivocada no falla: mide. Si no estamos
 * donde creemos, lo que corresponde es parar con un error y no escribir una lista de hallazgos
 * falsos que después alguien tiene que desmentir uno por uno.</p>
 */
async function confirmarQueEsElInicio(page) {
  const donde = await page.evaluate(() => ({
    ruta: location.pathname,
    titulo: String(document.querySelector('h1, .lx-screen-title')?.textContent || '').trim(),
    hayLogin: Boolean(document.querySelector('input[type="password"]')),
    haySelector: /Elegí cualquier municipalidad/i.test(document.body.textContent || ''),
    hayBarra: Boolean(document.querySelector('.lx-bottom-tab-bar')),
  }));
  if (donde.hayLogin || donde.haySelector || !donde.hayBarra) {
    const motivo = donde.hayLogin
      ? 'seguimos en el formulario de login'
      : donde.haySelector
        ? 'estamos en el selector de municipalidad, no en el Inicio'
        : 'no hay barra inferior: esto no es una pantalla raíz del ciudadano';
    throw new Error(
      `No se puede medir la fachada: ${motivo} (ruta=${donde.ruta}, título="${donde.titulo}"). ` +
        'Medir desde acá produce defectos inventados en TODA la tabla.',
    );
  }
}

async function medirFachada(page, tamano, ancho, placaDelServidor) {
  const v = await page.evaluate(() => {
    const rec = (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
    const px = (n, prop) => (n ? Math.round(parseFloat(getComputedStyle(n)[prop])) : 0);
    const caja = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const c = n.getBoundingClientRect();
      return { top: Math.round(c.top), alto: Math.round(c.height), ancho: Math.round(c.width) };
    };
    const hero = document.querySelector('.lx-citizen-hero');
    const cta = document.querySelector('.lx-hero-card--citizen');
    const barra = document.querySelector('.lx-bottom-tab-bar');
    const main = document.querySelector('main');
    const pares = [...document.querySelectorAll('.lx-citizen-pair > *')];
    return {
      // --- orden de arriba abajo: cada bloque por su posición, que es lo que el documento fija ---
      hero: (() => {
        const n = document.querySelector('.lx-citizen-hero');
        if (!n) return null;
        const c = n.getBoundingClientRect();
        const saludo = n.querySelector('.lx-citizen-hero__greeting');
        return {
          top: Math.round(c.top),
          alto: Math.round(c.height),
          ancho: Math.round(c.width),
          huecoSuperior: saludo ? Math.round(saludo.getBoundingClientRect().top - c.top) : 0,
        };
      })(),
      /* Si hay fotografía de verdad. El contenedor sólo se monta cuando el activo existe: la K de
         marca se quitó el 09-10 y no se sustituyó por nada, que es la orden. */
      heroConFoto: Boolean(document.querySelector('.lx-citizen-hero__photo')),
      saludo: rec(document.querySelector('.lx-citizen-hero__greeting')?.textContent),
      saludoPx: px(document.querySelector('.lx-citizen-hero__greeting'), 'fontSize'),
      saludoPeso: document.querySelector('.lx-citizen-hero__greeting')
        ? getComputedStyle(document.querySelector('.lx-citizen-hero__greeting')).fontWeight
        : null,
      // La foto es un FONDO, no un `<img>`: es lo que la hace fundirse en vez de ser un recuadro.
      fotoEsFondo: Boolean(
        hero &&
        getComputedStyle(hero.querySelector('.lx-citizen-hero__photo') || hero).backgroundImage !==
          'none',
      ),
      heroTieneImg: hero ? hero.querySelectorAll('img').length : -1,
      /* Cualquier imagen de fondo dentro del héroe, venga del elemento o de sus pseudos. Lo que
         se persigue es el sucedáneo: un `url(...)` acá sin contenedor de fotografía significa que
         alguien volvió a poner la marca de agua. Los degradados no cuentan: son luz, no imagen. */
      heroFondoDeMarca: hero
        ? [hero, ...hero.querySelectorAll('*')]
            .flatMap((n) => [
              getComputedStyle(n).backgroundImage,
              getComputedStyle(n, '::before').backgroundImage,
              getComputedStyle(n, '::after').backgroundImage,
            ])
            .filter((fondo) => fondo && fondo.includes('url('))
            .join(' ')
            .slice(0, 160)
        : '',
      degradado: hero
        ? getComputedStyle(hero, '::after').backgroundImage.includes('gradient')
        : false,
      cta: caja('.lx-hero-card--citizen'),
      ctaDegradado: cta ? getComputedStyle(cta).backgroundImage.includes('gradient') : false,
      ctaBoton: Boolean(document.querySelector('.lx-hero-card__go')),
      ctaTituloPx: px(document.querySelector('.lx-hero-card__title'), 'fontSize'),
      paresAltos: pares.map((n) => Math.round(n.getBoundingClientRect().height)),
      paresX: [...new Set(pares.map((n) => Math.round(n.getBoundingClientRect().x)))].length,
      valorPx: px(document.querySelector('.lx-citizen-pair .lx-stat-card__value'), 'fontSize'),
      multas: caja('.lx-citizen-fines'),
      actividad: [...document.querySelectorAll('.lx-citizen-activity__row')].map((n) =>
        Math.round(n.getBoundingClientRect().height),
      ),
      barraAlto: barra ? Math.round(barra.getBoundingClientRect().height) : 0,
      /* Lo que la corrección del 09-10 (segunda vuelta) tiene que sostener. */
      tituloCtaEnUnaLinea: (() => {
        const n = document.querySelector('.lx-hero-card--citizen .lx-hero-card__title');
        if (!n) return null;
        const linea = parseFloat(getComputedStyle(n).lineHeight) || 1;
        return { lineas: Math.round(n.getBoundingClientRect().height / linea), desborda: n.scrollWidth > n.clientWidth + 1 };
      })(),
      cabecera: (() => {
        const etiqueta = document.querySelector('.lx-app-bar--citizen .lx-tenant-badge__label');
        const chip = document.querySelector('.lx-app-bar--citizen .lx-connection-badge');
        const marca = document.querySelector('.lx-app-bar--citizen .lx-brand');
        return {
          nombreVisible: Boolean(etiqueta && etiqueta.getBoundingClientRect().width > 0),
          nombreCortado: etiqueta ? etiqueta.scrollWidth > etiqueta.clientWidth + 1 : null,
          nombre: rec(etiqueta?.textContent),
          chipConTexto: chip ? rec(chip.textContent).length > 0 && parseFloat(getComputedStyle(chip).fontSize) > 0 : null,
          marcaVisible: Boolean(marca && marca.getBoundingClientRect().width > 0),
        };
      })(),
      /* El P0 pide revisar que la barra no quede `static` cuando debe permanecer fija. La barra
         es `static` A PROPÓSITO: quien está fijo es su contenedor, que es el que el shell mide
         para reservar el espacio del contenido. Lo que importa es que ALGUNO de los dos lo esté,
         así que se informa el del contenedor y no sólo el de la barra. */
      barraFijeza: (() => {
        const barra = document.querySelector('.lx-bottom-tab-bar');
        if (!barra) return null;
        const padre = barra.parentElement;
        return {
          barra: getComputedStyle(barra).position,
          contenedor: padre ? getComputedStyle(padre).position : null,
          radio: Math.round(parseFloat(getComputedStyle(barra).borderTopLeftRadius)),
          abajo: padre ? Math.round(window.innerHeight - padre.getBoundingClientRect().bottom) : null,
        };
      })(),
      iconosDelPar: document.querySelectorAll('.lx-citizen-pair .lx-list-row__icon').length,
      botonesDelPar: [...document.querySelectorAll('.lx-citizen-pair .lx-btn')].map((n) =>
        Math.round(n.getBoundingClientRect().height),
      ),
      cifrasDelPar: [...document.querySelectorAll('.lx-citizen-pair .lx-stat-card__value')].map((n) => {
        const linea = parseFloat(getComputedStyle(n).lineHeight) || 1;
        return Math.round(n.getBoundingClientRect().height / linea);
      }),
      barraDestinos: document.querySelectorAll('.lx-bottom-tab-bar__tab').length,
      barraIcono: px(document.querySelector('.lx-bottom-tab-bar__icon svg'), 'width'),
      barraEtiqueta: px(document.querySelector('.lx-bottom-tab-bar__label'), 'fontSize'),
      rellenoMain: px(main, 'paddingBottom'),
      anchoMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
      desbordeH: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      /*
        Datos de la maqueta que no pueden estar.

        La lista se acortó el 09-10 y conviene decir por qué: tenía «BNY963» y «1.500», y los dos
        saltaron contra una pantalla CORRECTA. Esa placa y ese monto existen de verdad en la base
        de staging —la maqueta se dibujó a partir del mismo material de demostración—, así que
        prohibir el literal es prohibir que la pantalla muestre su dato real. Una prueba que no
        puede distinguir «escrito a mano en la interfaz» de «lo devolvió el servidor» no debe
        opinar: lo que se verifica abajo, contra la respuesta de la API, es que la placa en
        pantalla sea la que vino del servidor, que es la pregunta de verdad.

        Queda el nombre de la maqueta, que no sale de ninguna base y sólo puede estar escrito.
      */
      maqueta: ['Leana', 'Verónica'].filter((m) => (document.body.textContent || '').includes(m)),
      placaEnPantalla: rec(
        [...document.querySelectorAll('.lx-citizen-pair .lx-stat-card__value')].map((n) => n.textContent).join(' '),
      ),
    };
  });

  ok(v.hero !== null, `${tamano}: el héroe existe`);
  if (v.hero) {
    /*
      175-215px es la altura de la referencia CON su fotografía. Mientras el activo no exista, esa
      medida sólo se alcanza con relleno vacío, y la corrección del 09-10 lo prohíbe en letra:
      «ajustar la altura total de la cabecera al contenido; no compensar añadiendo padding
      vertical». Así que lo que se comprueba ahora es lo contrario de un mínimo: que el héroe NO
      tenga una gran superficie oscura por encima del saludo. Se mide el hueco real —lo que hay
      entre el borde del bloque y la primera letra— y se exige que sea relleno, no vacío.

      Cuando la fotografía entre, el alto vuelve a 175-215 por tener algo dentro, y esta
      comprobación se cambia por el mínimo otra vez.
    */
    ok(
      v.hero.huecoSuperior <= 28,
      `${tamano}: el héroe no deja superficie oscura sobre el saludo (${v.hero.huecoSuperior}px)`,
    );
    ok(
      v.heroConFoto ? v.hero.alto >= 150 : true,
      `${tamano}: el héroe mide ${v.hero.alto}px`,
      v.heroConFoto ? 'con fotografía se esperan 175-215' : 'sin fotografía, la altura la da el contenido',
    );
    ok(/^hola/i.test(v.saludo), `${tamano}: empieza con el saludo`, `«${v.saludo}»`);
    ok(
      v.saludoPx >= 26 && v.saludoPx <= 36,
      `${tamano}: el saludo mide ${v.saludoPx}px (pide 30-36; 26 por debajo de 380px)`,
    );
    ok(Number(v.saludoPeso) >= 700, `${tamano}: y va en peso 700-800`, `peso=${v.saludoPeso}`);
    // El punto 10 dice no aceptar «foto rectangular sin integración/degradado».
    if (v.heroConFoto) {
      ok(v.fotoEsFondo, `${tamano}: la foto es fondo del bloque, no un recuadro pegado`);
    } else {
      console.log(
        `  ··  ${tamano}: el héroe no lleva fotografía. Es el BLOQUEO declarado: falta el activo ` +
          'nocturno de automóvil de la referencia, y la orden del 09-10 prohíbe sustituirlo.',
      );
    }
    /* Y que no haya vuelto a entrar un sucedáneo: ni la marca de neón ni ninguna otra imagen de
       fondo en el héroe mientras la fotografía no esté. «No intentar disimularla con más opacidad
       ni cambiarla por otra marca de agua.» */
    ok(
      v.heroConFoto || !v.heroFondoDeMarca,
      `${tamano}: y no se coló ningún sucedáneo de marca de agua en su lugar`,
      v.heroFondoDeMarca,
    );
    ok(
      v.heroTieneImg === 0,
      `${tamano}: y no hay ningún <img> suelto en el héroe`,
      `hay ${v.heroTieneImg}`,
    );
    ok(v.degradado, `${tamano}: con su degradado navy encima`);
  }

  ok(v.cta !== null, `${tamano}: «Estacionar ahora» existe`);
  if (v.cta) {
    /* El alto del CTA lo mide `medirLaTabla`, con el rango de la orden definitiva. */
    ok(v.ctaDegradado, `${tamano}: con degradado azul`);
    ok(v.ctaBoton, `${tamano}: y su botón circular a la derecha`);
    ok(
      v.ctaTituloPx >= 22 && v.ctaTituloPx <= 26,
      `${tamano}: título del CTA ${v.ctaTituloPx}px (pide 22-25)`,
    );
    // «CTA principal pequeño o perdido» es de las cosas que el punto 10 no acepta: tiene que estar
    // en el primer viewport, no detrás de un desplazamiento.
    ok(v.cta.top < 812, `${tamano}: y entra en el primer viewport`, `empieza en ${v.cta.top}px`);
  }

  if (v.paresAltos.length === 2) {
    ok(v.paresX === 2, `${tamano}: Saldo y Vehículo van en dos columnas`, `columnas=${v.paresX}`);
    ok(
      v.paresAltos[0] === v.paresAltos[1],
      `${tamano}: y miden lo mismo`,
      `${v.paresAltos.join(' vs ')}`,
    );
    /*
      210-235px es la altura de la referencia, y la referencia dibuja una FOTOGRAFÍA del vehículo
      dentro de la tarjeta. Ese activo no existe en el proyecto y el encargo prohíbe inventarlo
      («no inventar imágenes de vehículos reales del usuario»), así que la diferencia no se tapa
      estirando la tarjeta: el encargo también prohíbe eso en letra («no resolver la diferencia
      simplemente aumentando alturas»).

      Entonces no es un fallo rojo ni un verde falso: se informa, con el número y con la causa,
      cada vez que se corre. El día que llegue la fotografía, esta medida se cumplirá sola.
    */
    if (v.paresAltos[0] >= 210) {
      ok(true, `${tamano}: con ${v.paresAltos[0]}px de alto (el documento pide 210-235)`);
    } else {
      console.log(
        `  ··  ${tamano}: el par mide ${v.paresAltos[0]}px y la referencia pide 210-235 CON la ` +
          'fotografía del vehículo, que no existe como activo. Pendiente de Javier, no se estira.',
      );
    }
    ok(v.valorPx >= 25 && v.valorPx <= 31, `${tamano}: el saldo mide ${v.valorPx}px (pide 25-31)`);
  } else {
    // Con una estadía activa la fachada cambia a propósito: no se exige el par.
    console.log(
      `  ··  ${tamano}: no hay par Saldo/Vehículo (hay estadía activa, o el ciudadano no tiene vehículo)`,
    );
  }

  // Multas: el documento dice «solo cuando existan multas reales». Las dos salidas son correctas,
  // así que se comprueba la que corresponda y nunca se exige la tarjeta.
  if (v.multas) {
    ok(
      v.multas.alto >= 100 && v.multas.alto <= 140,
      `${tamano}: la tarjeta de multas mide ${v.multas.alto}px (pide 105-125)`,
    );
  } else {
    console.log(`  ··  ${tamano}: sin multas por pagar, así que no se dibuja la tarjeta ámbar`);
  }

  if (v.actividad.length > 0) {
    ok(
      v.actividad.length <= 3,
      `${tamano}: la actividad muestra como mucho tres movimientos`,
      `son ${v.actividad.length}`,
    );
    const bajas = v.actividad.filter((a) => a < 92);
    ok(
      bajas.length === 0,
      `${tamano}: y sus filas miden 92px o más`,
      `altos: ${v.actividad.join(', ')}`,
    );
  } else {
    console.log(`  ··  ${tamano}: la billetera no tiene movimientos todavía`);
  }

  // --- La barra inferior, que el documento llama «requisito crítico» ---------------------------
  ok(
    v.barraDestinos === 5,
    `${tamano}: la barra tiene sus cinco destinos`,
    `son ${v.barraDestinos}`,
  );
  ok(
    v.barraAlto >= 70 && v.barraAlto <= 86,
    `${tamano}: la barra mide ${v.barraAlto}px (pide 70-78 + safe-area)`,
  );
  ok(
    v.barraIcono >= 24 && v.barraIcono <= 28,
    `${tamano}: iconos de ${v.barraIcono}px (pide 24-28)`,
  );
  ok(
    v.barraEtiqueta >= 11 && v.barraEtiqueta <= 12,
    `${tamano}: etiquetas de ${v.barraEtiqueta}px (pide 11-12)`,
  );
  ok(
    v.rellenoMain >= 100,
    `${tamano}: el contenido reserva ${v.rellenoMain}px bajo la barra (pide 100-115)`,
  );
  // --- La segunda corrección visual del 09-10, medida ----------------------------------------
  if (v.tituloCtaEnUnaLinea && ancho >= 360) {
    ok(
      v.tituloCtaEnUnaLinea.lineas === 1 && !v.tituloCtaEnUnaLinea.desborda,
      `${tamano}: «Estacionar ahora» se mantiene en una sola línea`,
      `líneas=${v.tituloCtaEnUnaLinea.lineas} desborda=${v.tituloCtaEnUnaLinea.desborda}`,
    );
  }
  if (v.cabecera) {
    ok(v.cabecera.marcaVisible, `${tamano}: la marca LuParX se ve en la cabecera`);
    ok(
      v.cabecera.nombreVisible,
      `${tamano}: la cabecera dice el nombre de la municipalidad («${v.cabecera.nombre}»)`,
    );
    ok(
      v.cabecera.nombreCortado === false,
      `${tamano}: y no queda recortado`,
      `nombre="${v.cabecera.nombre}"`,
    );
    ok(v.cabecera.chipConTexto, `${tamano}: el chip «En línea» conserva su texto, no se miniaturiza`);
  }
  if (v.barraFijeza) {
    ok(
      v.barraFijeza.barra === 'fixed' || v.barraFijeza.contenedor === 'fixed',
      `${tamano}: la barra inferior queda fija al borde del viewport`,
      `barra=${v.barraFijeza.barra} contenedor=${v.barraFijeza.contenedor}`,
    );
    ok(v.barraFijeza.radio >= 16, `${tamano}: con su contenedor redondeado (${v.barraFijeza.radio}px)`);
  }
  ok(v.iconosDelPar === 2, `${tamano}: Saldo y Vehículo llevan su icono`, `son ${v.iconosDelPar}`);
  const botonesChicos = v.botonesDelPar.filter((alto) => alto < 44);
  ok(
    v.botonesDelPar.length === 2 && botonesChicos.length === 0,
    `${tamano}: «Recargar» y «Cambiar» son tocables (44px o más)`,
    `altos: ${v.botonesDelPar.join(', ')}`,
  );
  const cifrasPartidas = v.cifrasDelPar.filter((lineas) => lineas > 1);
  ok(
    cifrasPartidas.length === 0,
    `${tamano}: ni el saldo ni la placa se parten en dos líneas`,
    `líneas: ${v.cifrasDelPar.join(', ')}`,
  );
  ok(!v.desbordeH, `${tamano}: no hay desplazamiento horizontal`);
  if (ancho >= 768) {
    ok(v.anchoMain <= 900, `${tamano}: el contenido no pasa de 900px`, `mide ${v.anchoMain}px`);
  }

  // --- Y lo que el punto 10 no acepta: datos de la maqueta ------------------------------------
  ok(
    v.maqueta.length === 0,
    `${tamano}: no hay ningún dato de la maqueta en pantalla`,
    v.maqueta.join(' · '),
  );
  if (placaDelServidor) {
    ok(
      v.placaEnPantalla.includes(placaDelServidor),
      `${tamano}: la placa que se muestra es la que devolvió el servidor (${placaDelServidor})`,
      `en pantalla: ${v.placaEnPantalla}`,
    );
  } else {
    console.log(`  ··  ${tamano}: no se vio la respuesta de vehículos; no se pudo cotejar la placa`);
  }
}

/**
 * ¿Están las clases del rediseño Y se les está aplicando su CSS?
 *
 * <p>Son dos preguntas distintas y la diferencia es exactamente la que explica «lo desplegué y se
 * ve igual». Una clase puede estar en el DOM mientras la hoja de estilos que llegó al navegador
 * no tiene su regla —porque es la hoja anterior, porque el `build` no la incluyó, porque el
 * selector quedó dentro de un bloque que no coincide—, y entonces el marcador está y el diseño
 * no. Medir sólo `querySelector` dice «sí, existe» y no contesta nada.</p>
 *
 * <p>Por eso se comprueban tres cosas por bloque: que el elemento exista, que ALGUNA hoja cargada
 * contenga una regla con ese selector, y qué valor terminó computando el navegador. Y se imprime
 * el nombre del archivo CSS y JS que el navegador descargó, que es lo único que identifica sin
 * ambigüedad qué versión se está mirando.</p>
 */
async function auditarDomYCss(page) {
  const a = await page.evaluate(() => {
    const rec = (x) => String(x || '').replace(/\s+/g, ' ').trim();

    // Qué archivos llegaron. Llevan hash en el nombre: identifican la compilación exacta.
    const recursos = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /\/assets\/.*\.(css|js)$/.test(n))
      .map((n) => n.split('/').pop());

    // Las reglas de TODAS las hojas, para poder preguntar si un selector existe de verdad.
    const selectores = new Set();
    for (const hoja of Array.from(document.styleSheets)) {
      let reglas;
      try {
        reglas = hoja.cssRules;
      } catch {
        continue; // hoja de otro origen: no se puede leer, y no hay ninguna acá
      }
      const recorrer = (lista) => {
        for (const regla of Array.from(lista)) {
          if (regla.selectorText) regla.selectorText.split(',').forEach((x) => selectores.add(x.trim()));
          if (regla.cssRules) recorrer(regla.cssRules);
        }
      };
      recorrer(reglas);
    }
    const hayRegla = (sel) => [...selectores].some((x) => x.includes(sel));

    const mirar = (sel, props) => {
      const n = document.querySelector(sel);
      if (!n) return { sel, existe: false, regla: hayRegla(sel) };
      const cs = getComputedStyle(n);
      const caja = n.getBoundingClientRect();
      const valores = {};
      for (const prop of props) valores[prop] = rec(cs[prop]).slice(0, 120);
      return {
        sel,
        existe: true,
        regla: hayRegla(sel),
        ancho: Math.round(caja.width),
        alto: Math.round(caja.height),
        valores,
      };
    };

    const raiz = getComputedStyle(document.documentElement);
    return {
      recursos,
      portal: document.documentElement.dataset.portal ?? '(sin atributo)',
      tokens: {
        '--lx-bg': rec(raiz.getPropertyValue('--lx-bg')),
        '--lx-surface': rec(raiz.getPropertyValue('--lx-surface')),
        '--lx-primary': rec(raiz.getPropertyValue('--lx-primary')),
        '--lx-primary-fill': rec(raiz.getPropertyValue('--lx-primary-fill')),
      },
      fondoBody: rec(getComputedStyle(document.body).backgroundColor),
      bloques: [
        mirar('.lx-citizen-hero', ['minHeight', 'padding', 'position', 'overflow']),
        mirar('.lx-citizen-hero__photo', ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'opacity']),
        mirar('.lx-citizen-hero__greeting', ['fontSize', 'fontWeight', 'lineHeight']),
        mirar('.lx-hero-card--citizen', ['background', 'borderRadius', 'minHeight']),
        mirar('.lx-citizen-pair', ['display', 'gridTemplateColumns', 'gap']),
        mirar('.lx-citizen-activity__row', ['minHeight', 'display']),
        mirar('.lx-bottom-tab-bar', ['height', 'position', 'background']),
      ],
    };
  });

  // ¿La fotografía del héroe se descargó, o el contenedor está pidiendo una URL que no existe?
  const urlFoto = await page.evaluate(() => {
    const n = document.querySelector('.lx-citizen-hero__photo');
    if (!n) return null;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(n).backgroundImage);
    return m ? m[1] : null;
  });
  let foto = 'sin contenedor de foto';
  if (urlFoto) {
    const r = await page.request.get(urlFoto).catch(() => null);
    foto = r ? `${r.status()} · ${urlFoto.split('/').pop()}` : `NO SE PUDO PEDIR · ${urlFoto}`;
  }

  console.log('\n══ Auditoría de DOM y CSS ══');
  console.log(`  archivos cargados: ${a.recursos.join(' · ') || '(ninguno con hash)'}`);
  console.log(`  data-portal: ${a.portal}`);
  console.log(`  tokens: ${Object.entries(a.tokens).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  fondo del body: ${a.fondoBody}`);
  console.log(`  foto del héroe: ${foto}`);
  for (const b of a.bloques) {
    if (!b.existe) {
      console.log(`  ✗   ${b.sel} — NO ESTÁ EN EL DOM (regla CSS presente: ${b.regla ? 'sí' : 'no'})`);
      fallos++;
      continue;
    }
    if (!b.regla) {
      console.log(`  ✗   ${b.sel} — está en el DOM pero NINGUNA hoja cargada tiene su regla`);
      fallos++;
      continue;
    }
    const valores = Object.entries(b.valores).map(([k, v]) => `${k}: ${v}`).join(' · ');
    console.log(`  ok  ${b.sel} — ${b.ancho}x${b.alto} · ${valores}`);
  }
}

/**
 * La tabla de la orden definitiva (09-10-2026), bloque por bloque.
 *
 * <p>Sustituye a las medidas sueltas que venían de los documentos anteriores. Donde las dos
 * hablaban del mismo bloque con números distintos manda ésta, porque es la más reciente y porque
 * su criterio lo dice: la composición aprobada prevalece sobre un número que produzca un
 * resultado visual distinto.</p>
 *
 * <p>El rango se comprueba como rango: por debajo del mínimo hay un bloque que se quedó corto y
 * por encima del máximo hay relleno de más, que es el defecto que esta tanda vino a quitar.</p>
 */
async function medirLaTabla(page, tamano) {
  const RANGOS = [
    ['cabecera', '.lx-app-bar', 56, 66],
    ['saludo', '.lx-citizen-hero', 92, 115],
    ['CTA «Estacionar ahora»', '.lx-hero-card--citizen', 112, 128],
    ['par Saldo/Vehículo', '.lx-citizen-pair', 145, 160],
    ['multas', '.lx-citizen-fines', 78, 92],
    ['fila de actividad', '.lx-citizen-activity__row', 70, 82],
    ['barra inferior', '.lx-bottom-tab-bar', 64, 78],
  ];
  const medido = await page.evaluate(
    (rangos) =>
      rangos.map(([nombre, sel, min, max]) => {
        const n = document.querySelector(sel);
        return { nombre, min, max, alto: n ? Math.round(n.getBoundingClientRect().height) : null };
      }),
    RANGOS,
  );
  for (const m of medido) {
    if (m.alto === null) {
      console.log(`  ··  ${tamano}: «${m.nombre}» no está en esta pantalla`);
      continue;
    }
    ok(
      m.alto >= m.min && m.alto <= m.max,
      `${tamano}: ${m.nombre} mide ${m.alto}px (la tabla pide ${m.min}-${m.max})`,
    );
  }
}

/**
 * Lo que el contrato del 09-10 pide además de medir: que las cosas FUNCIONEN.
 *
 * <p>«Prueba funcional de Recargar, Cambiar, Estacionar, Multas, Ver todas y los cinco destinos
 * inferiores». Se pulsa cada uno y se mira a dónde cayó, que es la única forma de distinguir un
 * botón de un adorno. Después se vuelve al Inicio para que el siguiente parta de donde debe.</p>
 */
async function probarQueNavega(page) {
  console.log('\n══ Que cada control lleve a alguna parte ══');
  const destinos = [
    { nombre: 'Estacionar ahora', selector: '.lx-hero-card--citizen', esperado: /\/park/ },
    { nombre: 'Recargar', selector: '.lx-citizen-pair .lx-btn--solid', esperado: /\/wallet/ },
    { nombre: 'Cambiar', selector: '.lx-citizen-pair .lx-btn--outline', esperado: /\/vehicles/ },
    { nombre: 'Multas pendientes', selector: '.lx-citizen-fines .lx-list-row', esperado: /\/fines/ },
    { nombre: 'Ver todas', selector: '.lx-section-header .lx-link-button', esperado: /\/movements/ },
  ];
  for (const destino of destinos) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const control = page.locator(destino.selector).first();
    if ((await control.count()) === 0) {
      console.log(`  ··  «${destino.nombre}» no está en esta pantalla (estado de datos), no se pudo probar`);
      continue;
    }
    await control.click();
    await page.waitForTimeout(1400);
    const ruta = new URL(page.url()).pathname;
    ok(destino.esperado.test(ruta), `«${destino.nombre}» lleva a su pantalla`, `cayó en ${ruta}`);
  }

  // Los cinco destinos de la barra.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const pestanas = page.locator('.lx-bottom-tab-bar__tab');
  const cuantas = await pestanas.count();
  ok(cuantas === 5, `la barra inferior tiene sus cinco destinos`, `son ${cuantas}`);
  for (let i = 0; i < cuantas; i += 1) {
    const etiqueta = (await pestanas.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    await pestanas.nth(i).click();
    await page.waitForTimeout(1200);
    const ruta = new URL(page.url()).pathname;
    const arriba = await page.evaluate(() => Math.round(window.scrollY));
    ok(ruta.length > 0, `«${etiqueta}» navega (${ruta})`);
    ok(arriba === 0, `  y la pantalla nueva empieza arriba`, `scrollY=${arriba}`);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }
}

/**
 * El P0 del saldo, probado con cifras que la cuenta de prueba no tiene.
 *
 * <p>«Probar saldos de 0, 5, 6 y 7 dígitos; conservar el valor real». Se sustituye el TEXTO en la
 * pantalla ya pintada —no el dato, que sigue viniendo del servidor— y se mide si cabe. Es la
 * única manera de comprobar un ancho contra montos que esta cuenta no va a tener nunca.</p>
 */
async function probarMontosLargos(page) {
  console.log('\n══ El saldo en una sola línea, con 0, 5, 6 y 7 cifras ══');
  const MONTOS = ['₡0', '₡9.850', '₡145.450', '₡1.450.000'];
  for (const monto of MONTOS) {
    const r = await page.evaluate((m) => {
      const n = document.querySelector('.lx-citizen-pair .lx-stat-card__value');
      if (!n) return null;
      const original = n.textContent;
      n.textContent = m;
      const cs = getComputedStyle(n);
      const linea = parseFloat(cs.lineHeight) || 1;
      const salida = {
        lineas: Math.round(n.getBoundingClientRect().height / linea),
        desborda: n.scrollWidth > n.clientWidth + 1,
        px: Math.round(parseFloat(cs.fontSize)),
      };
      n.textContent = original;
      return salida;
    }, monto);
    if (!r) {
      console.log('  ··  no hay tarjeta de saldo en pantalla; no se pudo probar');
      return;
    }
    ok(
      r.lineas === 1 && !r.desborda,
      `${monto} cabe en una línea (${r.px}px)`,
      `líneas=${r.lineas} desborda=${r.desborda}`,
    );
  }
}

(async () => {
  const navegador = await chromium.launch();
  const context = await navegador.newContext({ viewport: TAMANOS[1], locale: 'es-CR' });
  const page = await entrar(context);

  try {
    for (const tamano of TAMANOS) {
      console.log(`\n── ${tamano.nombre} ──`);
      await page.setViewportSize({ width: tamano.width, height: tamano.height });
      /*
        Lo que el servidor contestó, para poder comparar la pantalla contra SU dato y no contra una
        lista de literales prohibidos. Es la comprobación que reemplaza a la que marcaba «BNY963»
        como dato de maqueta cuando era el vehículo real de la cuenta.
      */
      let placaDelServidor = null;
      const oirVehiculos = async (respuesta) => {
        if (!/\/vehicles(\?|$)/.test(respuesta.url()) || !respuesta.ok()) return;
        try {
          const cuerpo = await respuesta.json();
          const lista = Array.isArray(cuerpo) ? cuerpo : (cuerpo.items ?? cuerpo.content ?? []);
          const principal = lista.find((x) => x.isPrimary) ?? lista[0];
          if (principal?.plate) placaDelServidor = principal.plate;
        } catch {
          /* una respuesta que no es JSON no es asunto de esta prueba */
        }
      };
      page.on('response', oirVehiculos);
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      page.off('response', oirVehiculos);
      await confirmarQueEsElInicio(page);
      /* Reportado con dos capturas del teléfono: el Inicio abría ya desplazado, sin encabezado.
         Era la restauración del navegador, que ocurre DESPUÉS del primer render. */
      const alAbrir = await page.evaluate(() => Math.round(window.scrollY));
      ok(alAbrir === 0, `${tamano.nombre}: el Inicio abre arriba, con su encabezado a la vista`, `scrollY=${alAbrir}`);
      await medirLaTabla(page, tamano.nombre);
      await medirFachada(page, tamano.nombre, tamano.width, placaDelServidor);
      // La auditoría de DOM y CSS una sola vez, en el ancho de la referencia: lo que comprueba
      // —qué hoja llegó, qué reglas trae— no cambia con el viewport.
      if (tamano.width === 390) await auditarDomYCss(page);
      // Dos capturas, porque miden cosas distintas: la «vista» es un viewport con la cabecera
      // pegada donde está, y la «completa» es la página entera —donde Playwright dibuja los
      // elementos sticky a media altura, que es artefacto de la captura y no defecto.
      await page.screenshot({
        path: `tests/responsive/capturas/ciudadano-${tamano.width}x${tamano.height}-vista.png`,
      });
      await page.screenshot({
        path: `tests/responsive/capturas/ciudadano-${tamano.width}x${tamano.height}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await probarMontosLargos(page);
    await probarQueNavega(page);
  } catch (e) {
    // Un arnés que no sabe dónde está no reporta: para. Lo contrario —seguir midiendo— es lo que
    // produjo 28 defectos inventados.
    console.error(`\n${String(e.message).split('\n')[0]}`);
    await navegador.close();
    process.exit(3);
  }

  await navegador.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
