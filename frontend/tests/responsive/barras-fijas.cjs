/**
 * Barras fijas en Fiscalización y Ciudadano — los PDF del 05 y del 06-10-2026.
 *
 * <p>El del 06-10-2026 añade cuatro preguntas sobre la cabecera del fiscalizador: que haya UN solo
 * indicador de conexión, que esté dentro de `.lx-app-bar`, que esté arriba a la derecha y que la
 * franja que lo llevaba —`.lx-inspector-status-bar`— no quede en el árbol. Esa última es la que
 * importa escribir así: «desaparecer» con `display: none` dejaría el componente duplicado en el
 * layout, que es lo que el PDF prohíbe en letra, y una comprobación visual no distingue las dos
 * cosas. Contar nodos sí.</p>
 *
 * <h2>Qué contesta este arnés que la hoja de estilos no</h2>
 *
 * <p>Que una regla diga `position: sticky` no prueba que nada se quede quieto: basta un ancestro
 * con `overflow` distinto de `visible` para que `sticky` no se pegue a nada, y esa combinación no
 * falla ninguna prueba de CSS. Así que acá se desplaza de verdad, hasta el fondo, y se pregunta
 * dónde quedaron la cabecera y la barra inferior —y, lo que de verdad importa, si se pueden TOCAR,
 * que es distinto de estar en el DOM: `elementFromPoint` sobre su centro dice si algo las tapa.</p>
 *
 * <h2>Las diez pruebas obligatorias del PDF, en orden</h2>
 *
 * <ol>
 *   <li>abrir una pantalla con lista larga → paso 1 barre todas las pantallas de los dos portales;
 *   <li>desplazar hacia abajo → `alFondo`, que es la única posición donde «tapado» significa algo;
 *   <li>la cabecera sigue accesible → `cabeceraArriba` + `cabeceraAlcanzable`;
 *   <li>la barra inferior sigue accesible → `pieAbajo` + `pieAlcanzable`;
 *   <li>volver arriba → paso 1 vuelve a 0 y compara;
 *   <li>ni saltos ni superposición → la comparación de arriba, más «la última fila se ve entera»;
 *   <li>navegar desde la barra estando desplazado → paso 3;
 *   <li>contenido largo, corto, vacío y con error → paso 4;
 *   <li>móvil y escritorio → paso 2, ocho viewports;
 *   <li>no se rompieron rutas ni estados → cada pantalla comprueba que no volvió al login.
 * </ol>
 *
 * <h2>La contraseña</h2>
 *
 * <p>Por omisión la de staging, no la de los seeds. Al revés —que es como estaban los arneses
 * viejos— el login falla, la aplicación deja el formulario en pantalla, y se miden quince veces el
 * login con el nombre de quince pantallas distintas. Ya pasó, el 19-09-2026, con cuarenta
 * hallazgos falsos.</p>
 *
 *   PASS='DemoLupaRX2026' node tests/responsive/barras-fijas.cjs
 *   PORTAL=inspector PASS='...' node tests/responsive/barras-fijas.cjs   # uno solo
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

const PORTALES = {
  inspector: {
    nombre: 'Fiscalización',
    prefijo: '/inspector',
    cuenta: process.env.CUENTA_INSPECTOR ?? 'inspector@luparx.test',
    // Con cabecera en TODAS desde el 05-10-2026: el PDF lo pide como arquitectura, no por pantalla.
    cabeceraEsperada: 'siempre',
    /*
      Dónde tiene que estar la insignia de conexión. En Fiscalización la fila no lleva nada más a la
      derecha, así que va pegada al borde: `borde`. En el Ciudadano la campana es lo accionable y le
      toca la esquina, así que la insignia es la última ANTES de la campana: `grupo`. Son dos PDF
      distintos (06-10-2026) y dos medidas distintas; una sola comprobación «está a la derecha» daría
      por bueno el ciudadano con la insignia en cualquier parte del grupo.
    */
    /*
      `grupo` desde el 06-10-2026, y antes era `borde`.

      Hasta hoy la insignia de conexión era lo único que había a la derecha de la cabecera del
      fiscalizador, así que quedaba pegada al borde y eso era lo que se comprobaba. Con la campana, lo
      pulsable se queda la esquina —donde llega el pulgar— y la insignia pasa a ser lo último ANTES de
      ella. Es exactamente la forma que el Ciudadano ya tenía, así que los dos portales se verifican
      ahora con la misma regla en vez de con dos.

      `grupo` sirve además para las pantallas de detalle, donde la campana no está y la insignia vuelve
      a quedar al borde: lo que mide es que esté dentro del grupo derecho, que es verdad en los dos
      casos. Una regla que vale para los dos estados es mejor que dos reglas que hay que mantener.
    */
    /*
      `saludo-o-barra`, el tercer criterio de esta línea en tres días. Conviene contar la cadena
      entera porque cada paso corrigió algo real del anterior:

      · 06-10: «un único En línea arriba a la derecha». Se midió así.
      · 07-10: la referencia visual lo dibuja junto al saludo del inicio.
      · 08-10 (mañana): lo partí por ESTADO —confirmación junto al saludo, advertencia en la barra—
        y eso dejó un hueco que el encargo de la tarde señala en su punto 10: en Ayuda, que no
        tiene saludo, con señal no quedaba ningún indicador.
      · 08-10 (tarde): el reparto correcto no es por estado sino por si la pantalla TIENE saludo.
        El inicio lo lleva en el saludo; todas las demás, en la barra fija. Sin señal lo lleva la
        barra siempre.

      Lo que este arnés exige: en el inicio, cero insignias en la barra y una ficha junto al
      saludo; en cualquier otra pantalla, la insignia en la barra. Nunca las dos, nunca ninguna.
    */
    conexion: 'saludo-o-barra',
    conexionSoloRaiz: false,
    pantallas: [
      { ruta: '/', nombre: 'Consulta' },
      { ruta: '/cite', nombre: 'Boleta' },
      { ruta: '/citations', nombre: 'Mis boletas' },
      { ruta: '/queue', nombre: 'Pendientes' },
      { ruta: '/more', nombre: 'Más' },
      { ruta: '/profile', nombre: 'Perfil' },
      { ruta: '/help', nombre: 'Ayuda' },
      { ruta: '/notifications', nombre: 'Avisos' },
    ],
    // La más larga del portal, la que recorre los ocho viewports del paso 2.
    larga: '/profile',
  },
  citizen: {
    nombre: 'Ciudadano',
    prefijo: '',
    cuenta: process.env.CUENTA_CITIZEN ?? 'ana.morales@luparx.test',
    /*
      «cuando corresponda», que es lo que dice el PDF de barras fijas, y lo que corresponde cambió
      el 06-10-2026.

      El 05-10 la decisión fue dejar las pantallas raíz de pestaña sin cabecera: su título era
      contenido y se desplazaba, como el mockup aprobado. El 06-10 se reportó que Vehículos,
      Billetera y Más no mostraban la cabecera del resto de la experiencia y se decidió que la
      lleven. Multas, Perfil y Ayuda siguen sin ella, así que la regla sigue siendo «donde la hay,
      que se quede» y no «todas».

      Se deja escrito el cambio de criterio en vez de sólo cambiar el valor: dentro de un mes, un
      arnés que exige una cabecera donde el mockup no la tiene parece un arnés desactualizado.
    */
    cabeceraEsperada: 'cuando-exista',
    conexion: 'grupo',
    /*
      En el Ciudadano va sólo en las pantallas raíz: las que llevan marca, municipalidad y campana.
      Una pantalla de detalle lleva flecha y título, y añadirle una insignia de conexión al lado del
      título sería tocar pantallas que el PDF del 06-10-2026 deja explícitamente fuera (Perfil, entre
      ellas). Así que acá se distingue, y no se exige donde no debe estar.
    */
    conexionSoloRaiz: true,
    /*
      `sinCabecera` marca las tres que NO la llevan por diseño —`bare`: su título es contenido y se
      desplaza—. El resto la lleva, y eso ya se puede exigir: lo que el PDF del 06-10-2026 reporta es
      que Vehículos, Billetera y Más no la mostraban, y que las cinco pantallas de la barra inferior
      deben usar el mismo patrón. Con `cuando-exista` a secas, una regresión que volviera a quitarla
      no fallaría ninguna comprobación.
    */
    pantallas: [
      { ruta: '/', nombre: 'Inicio' },
      { ruta: '/park', nombre: 'Estacionamiento' },
      { ruta: '/fines', nombre: 'Multas', sinCabecera: true },
      { ruta: '/vehicles', nombre: 'Vehículos' },
      { ruta: '/wallet', nombre: 'Billetera' },
      { ruta: '/movements', nombre: 'Movimientos' },
      { ruta: '/notifications', nombre: 'Notificaciones' },
      { ruta: '/more', nombre: 'Más' },
      { ruta: '/profile', nombre: 'Perfil', sinCabecera: true },
      { ruta: '/help', nombre: 'Ayuda', sinCabecera: true },
    ],
    larga: '/more',
  },
};

/** Los ocho tamaños que pide la estrategia de pruebas del proyecto. */
const TAMANOS = [
  { nombre: 'móvil chico', width: 320, height: 568, movil: true },
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'móvil grande', width: 430, height: 932, movil: true },
  { nombre: 'tablet vertical', width: 768, height: 1024, movil: true },
  { nombre: 'tablet horizontal', width: 1024, height: 768, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
  { nombre: 'escritorio', width: 1536, height: 960, movil: false },
  { nombre: 'escritorio grande', width: 1920, height: 1080, movil: false },
];
/** Los del barrido por pantalla: el teléfono es el caso que el PDF reporta. */
const DEL_BARRIDO = ['móvil chico', 'móvil estándar'];

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

// =================================================================================================
// Entrar, y abortar si no se entró
// =================================================================================================
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

  // El selector de municipalidad se disfraza de pantalla real: la ficha trae el nombre y además
  // una insignia, así que se busca por contenido y no por texto exacto.
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1400);
  }

  const sigueEnLogin = await page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (sigueEnLogin) {
    throw new Error(
      `No se pudo entrar a ${portal}: seguimos en el formulario de login. Medir desde acá produce ` +
        'hallazgos falsos en TODAS las rutas (ya pasó una vez).',
    );
  }
}

// =================================================================================================
// La medición
// =================================================================================================
async function alFondo(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(450);
}
async function alTope(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(450);
}

async function medir(page) {
  return page.evaluate(() => {
    const alto = window.innerHeight;
    const caja = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
    };
    /*
      ¿Se puede TOCAR? Estar en el DOM y con una caja dentro del viewport no alcanza: un elemento
      puede estar debajo de otro. `elementFromPoint` sobre el centro devuelve lo que el dedo
      alcanzaría de verdad; vale si es el propio nodo o un descendiente suyo (una pestaña, el logo).
    */
    const alcanzable = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      const y = Math.round(r.top + r.height / 2);
      if (y < 0 || y > alto || r.width === 0) return false;
      const encima = document.elementFromPoint(Math.round(r.left + r.width / 2), y);
      return Boolean(encima && (encima === n || n.contains(encima)));
    };

    /*
      Un segundo contenedor con desplazamiento propio es el defecto que el PDF llama «hacks
      visuales»: dos barras de scroll, y la rueda del ratón mueve la que no toca. Se buscan los
      elementos que de verdad desbordan Y permiten desplazarse, no los que sólo declaran overflow.
    */
    const otrosScroll = [...document.querySelectorAll('body *')]
      .filter((n) => {
        const e = getComputedStyle(n);
        if (!/(auto|scroll)/.test(e.overflowY)) return false;
        return n.scrollHeight > n.clientHeight + 2;
      })
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className || '').trim().split(/\s+/)[0] || '?'}`)
      .slice(0, 5);

    // La última fila de contenido: lo que el PDF pide que «pueda verse completo».
    const main = document.querySelector('main');
    const filas = main
      ? [...main.querySelectorAll('.lx-card, .lx-list-row, .lx-quick-tile, tbody tr')]
      : [];
    const ultimaFila = filas.length > 0 ? filas[filas.length - 1] : null;

    const doc = document.documentElement;
    return {
      alto,
      scrollY: Math.round(window.scrollY),
      scrollMax: Math.round(doc.scrollHeight - alto),
      // Cuántas hay: dos cabeceras o dos barras inferiores sería navegación duplicada.
      barras: document.querySelectorAll('.lx-app-bar').length,
      pies: document.querySelectorAll('.lx-bottom-tab-bar').length,
      cromos: document.querySelectorAll('.lx-top-chrome').length,
      barra: caja(document.querySelector('.lx-app-bar')),
      barraAlcanzable: alcanzable(document.querySelector('.lx-app-bar')),
      /*
        El PDF del 06-10-2026: UN solo «En línea», dentro de la barra, arriba a la derecha, y la
        franja de abajo borrada del árbol —no escondida—. Las cuatro cosas se miden por separado
        porque fallan por separado: se puede tener una sola insignia en el sitio equivocado, o dos
        con una invisible, o la franja vacía ocupando una fila.
      */
      franjaVieja: document.querySelectorAll('.lx-inspector-status-bar').length,
      conexiones: document.querySelectorAll('.lx-connection-badge').length,
      conexion: caja(document.querySelector('.lx-connection-badge')),
      conexionAlcanzable: alcanzable(document.querySelector('.lx-connection-badge')),
      conexionEnBarra: Boolean(document.querySelector('.lx-connection-badge')?.closest('.lx-app-bar')),
      // La ficha verde junto al saludo del fiscalizador (08-10-2026): el otro sitio donde el estado
      // de conexión puede estar, y el único cuando hay señal.
      estadoEnSaludo: document.querySelectorAll('.lx-inspector-greeting__state').length,
      estadoEnSaludoAlcanzable: alcanzable(document.querySelector('.lx-inspector-greeting__state')),
      grupoDerecho: caja(document.querySelector('.lx-app-bar__end')),
      // Primera del grupo derecho: con campana, significa que la campana queda a su derecha y nada
      // más entre las dos.
      // ¿Es una pantalla de detalle? La flecha de volver lo dice, y es lo que distingue una raíz de
      // pestaña —marca + municipalidad + campana— de una pantalla a la que se entró desde otra.
      tieneVolver: Boolean(document.querySelector('.lx-app-bar__back')),
      conexionPrimeraDelGrupo:
        document.querySelector('.lx-app-bar__end')?.firstElementChild
        === document.querySelector('.lx-connection-badge'),
      cromo: caja(document.querySelector('.lx-top-chrome')),
      pie: caja(document.querySelector('.lx-bottom-tab-bar')),
      pieAlcanzable: alcanzable(document.querySelector('.lx-bottom-tab-bar')),
      otrosScroll,
      ultimaFila: caja(ultimaFila),
      desbordeH: doc.scrollWidth > doc.clientWidth + 1,
      /*
        Por la RUTA, y no por «hay un campo de contraseña» (06-10-2026).

        Con el campo, las doce comprobaciones que fallaron en la primera corrida de este arnés
        fueron las doce de Perfil, en los dos portales y en los ocho tamaños, diciendo «la sesión se
        cayó a mitad de corrida». No se había caído nada: la pantalla de Perfil tiene un formulario
        para CAMBIAR la contraseña, así que siempre hay un `input[type="password"]` en ella.

        El delator estaba en la propia salida: la pantalla siguiente —Ayuda— pasaba sus dieciocho
        comprobaciones sin una queja. Una sesión caída se habría llevado esa también. Es el mismo
        falso positivo que `paleta-regresion.cjs` tuvo el 05-10 y que ahí ya se arregló así; quedó
        sin arreglar acá, en un arnés que entonces no se había corrido nunca.
      */
      enLogin: location.pathname.endsWith('/login'),
      h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 40),
    };
  });
}

/**
 * Las comprobaciones de una pantalla, desplazada hasta el fondo.
 *
 * <p>`exigeCabecera` distingue los dos portales: en Fiscalización la cabecera va en todas; en
 * Ciudadano, en las que la tienen —y donde no la hay, no se inventa un fallo.</p>
 *
 * <p>`conexion` dice dónde debe estar la insignia de estado: `'borde'` pegada al borde derecho de la
 * barra (Fiscalización, que no lleva nada más ahí), `'grupo'` la última antes de la campana
 * (Ciudadano), `'no'` en ninguna parte. Sólo se exige si la pantalla tiene cabecera: en una pantalla
 * `bare` no hay barra donde ponerla, y pedirla sería inventar un fallo.</p>
 */
function revisar(etiqueta, arriba, abajo, exigeCabecera, conexion, soloRaiz = false) {
  const sinScroll = arriba.scrollMax <= 20;

  comprobar(arriba.pies === 1, `${etiqueta} · una barra inferior y sólo una`, `hay ${arriba.pies}`);
  comprobar(arriba.barras <= 1, `${etiqueta} · no hay una segunda cabecera`, `hay ${arriba.barras}`);
  comprobar(
    arriba.otrosScroll.length === 0,
    `${etiqueta} · el único que se desplaza es el contenido`,
    `también se desplazan: ${arriba.otrosScroll.join(', ')}`,
  );
  comprobar(!arriba.desbordeH, `${etiqueta} · sin desborde horizontal`);

  if (exigeCabecera) {
    comprobar(arriba.barras === 1, `${etiqueta} · tiene cabecera`, 'no se encontró .lx-app-bar');
  }

  // --- Los PDF del 06-10-2026: un solo «En línea», arriba a la derecha, sin franja debajo -------
  // La franja vieja del fiscalizador no debe existir en NINGÚN portal, con cabecera o sin ella: era
  // marcado, y borrarla del árbol es la mitad del encargo. `display: none` no cuenta.
  comprobar(
    arriba.franjaVieja === 0,
    `${etiqueta} · la segunda franja de «En línea» no existe en el árbol`,
    `quedan ${arriba.franjaVieja} .lx-inspector-status-bar — esconderla con CSS no cuenta`,
  );
  /*
    El fiscalizador con señal: la insignia NO va en la barra, y es correcto que no esté.

    Se comprueba lo contrario de lo que se comprobaba —que no haya ninguna— más lo que sí tiene que
    haber: la ficha junto al saludo, en la pantalla de inicio, legible. En las otras pantallas del
    portal no hay indicador con señal, y tampoco hace falta: no hay nada que decidir mientras la
    boleta sale sola.
  */
  if (conexion === 'saludo-o-barra') {
    // El inicio es la única pantalla con saludo, y se reconoce por eso mismo: la ficha está ahí.
    const esInicio = arriba.estadoEnSaludo > 0;
    const indicadores = arriba.conexiones + arriba.estadoEnSaludo;
    comprobar(
      indicadores === 1,
      `${etiqueta} · hay exactamente un indicador de conexión en pantalla`,
      `barra=${arriba.conexiones} saludo=${arriba.estadoEnSaludo}`,
    );
    if (esInicio) {
      comprobar(
        arriba.conexiones === 0,
        `${etiqueta} · en el inicio lo lleva el saludo, no la barra`,
        `en la barra hay ${arriba.conexiones}`,
      );
      comprobar(
        arriba.estadoEnSaludoAlcanzable === true,
        `${etiqueta} · y se puede leer, no está tapado`,
      );
    } else {
      comprobar(
        arriba.conexiones === 1 && arriba.conexionEnBarra === true,
        `${etiqueta} · sin saludo, el estado lo lleva la barra fija`,
        `conexiones=${arriba.conexiones} enBarra=${arriba.conexionEnBarra}`,
      );
      comprobar(
        arriba.conexionAlcanzable === true,
        `${etiqueta} · y se puede leer`,
      );
    }
  }
  const exigeConexion =
    conexion !== 'no' && conexion !== 'saludo-o-barra' && arriba.barras === 1 && !(soloRaiz && arriba.tieneVolver);
  if (soloRaiz && arriba.tieneVolver) {
    dato(`${etiqueta} · pantalla de detalle: la insignia de conexión no va acá, por diseño`);
  }
  if (exigeConexion) {
    comprobar(
      arriba.conexiones === 1,
      `${etiqueta} · un solo indicador de conexión`,
      `encontré ${arriba.conexiones}`,
    );
    comprobar(
      arriba.conexionEnBarra === true,
      `${etiqueta} · y está DENTRO de la cabecera, no debajo`,
    );
    if (arriba.conexion && arriba.barra) {
      if (conexion === 'borde') {
        comprobar(
          arriba.barra.right - arriba.conexion.right <= 24,
          `${etiqueta} · la insignia está alineada al borde derecho de la cabecera`,
          `quedan ${arriba.barra.right - arriba.conexion.right}px entre la insignia y el borde`,
        );
      } else if (arriba.grupoDerecho) {
        // Con campana al lado, «a la derecha» no es «pegada al borde»: lo accionable se queda con la
        // esquina. Lo que se exige es que no haya nada entre la insignia y la campana.
        comprobar(
          arriba.conexionPrimeraDelGrupo === true,
          `${etiqueta} · la insignia es lo último antes de la campana`,
        );
        comprobar(
          arriba.grupoDerecho.right - arriba.conexion.right <= 60,
          `${etiqueta} · y está dentro del grupo de la derecha, no suelta en la fila`,
          `quedan ${arriba.grupoDerecho.right - arriba.conexion.right}px hasta el fin del grupo`,
        );
      }
      comprobar(
        arriba.conexion.left + arriba.conexion.height / 2 > (arriba.barra.left + arriba.barra.right) / 2,
        `${etiqueta} · y en la mitad derecha, no en el medio de la fila`,
      );
    }
  }
  if (arriba.cromo && arriba.barra) {
    // «No queda una fila vacía debajo»: el cromo superior mide lo que mide la barra. Si sobra alto,
    // algo sigue ocupando una fila — vacía o no. En el Ciudadano el cromo lleva además la barra de
    // estadía en curso, que sólo existe mientras hay una estadía: por eso se compara «mide lo mismo
    // o lleva algo de verdad», y no «mide lo mismo» a secas.
    comprobar(
      Math.abs(arriba.cromo.height - arriba.barra.height) <= 1 || arriba.cromo.height > arriba.barra.height + 24,
      `${etiqueta} · no sobra una fila casi vacía debajo de la cabecera`,
      `el cromo mide ${arriba.cromo.height}px y la barra ${arriba.barra.height}px`
        + ` (${arriba.cromo.height - arriba.barra.height}px de más)`,
    );
  }

  if (sinScroll) {
    dato(`${etiqueta} · no hay nada que desplazar (${arriba.scrollMax}px): sólo se revisa lo de arriba`);
    return;
  }

  // --- La cabecera, abajo del todo -------------------------------------------------------------
  if (abajo.barra) {
    comprobar(
      abajo.barra.top <= 2 && abajo.barra.bottom > 0,
      `${etiqueta} · la cabecera sigue arriba con la página al fondo`,
      `top=${abajo.barra.top} bottom=${abajo.barra.bottom} (scrollY=${abajo.scrollY})`,
    );
    comprobar(
      abajo.barraAlcanzable === true,
      `${etiqueta} · y se puede tocar, no sólo está en el DOM`,
    );
  }
  if (exigeConexion) {
    comprobar(
      abajo.conexion !== null && abajo.conexion.top >= 0 && abajo.conexion.bottom <= abajo.alto,
      `${etiqueta} · el estado de conexión tampoco se va`,
      abajo.conexion
        ? `top=${abajo.conexion.top} bottom=${abajo.conexion.bottom}`
        : 'no se encontró la insignia de conexión',
    );
    comprobar(
      abajo.conexionAlcanzable === true,
      `${etiqueta} · y se puede leer, no está tapado por el contenido`,
    );
  }

  // --- La barra inferior ------------------------------------------------------------------------
  comprobar(
    abajo.pie !== null && Math.abs(abajo.pie.bottom - abajo.alto) <= 2,
    `${etiqueta} · la barra inferior sigue abajo`,
    abajo.pie ? `bottom=${abajo.pie.bottom} contra alto=${abajo.alto}` : 'no se encontró la barra',
  );
  comprobar(abajo.pieAlcanzable === true, `${etiqueta} · y se puede tocar`);

  // --- La última fila no queda debajo de la barra ------------------------------------------------
  if (abajo.ultimaFila && abajo.pie) {
    comprobar(
      abajo.ultimaFila.bottom <= abajo.pie.top + 1,
      `${etiqueta} · la última fila se ve entera, no debajo de la barra`,
      `la fila termina en ${abajo.ultimaFila.bottom} y la barra empieza en ${abajo.pie.top}`
        + ` (${abajo.ultimaFila.bottom - abajo.pie.top}px tapados)`,
    );
  }
}

// =================================================================================================
(async () => {
  const browser = await chromium.launch();
  const soloPortal = process.env.PORTAL;
  const portales = soloPortal ? [soloPortal] : ['inspector', 'citizen'];

  console.log(`\n${BASE} · barras fijas · ${portales.join(' + ')}\n`);

  for (const portal of portales) {
    const cfg = PORTALES[portal];
    if (!cfg) {
      console.error(`PORTAL desconocido: ${portal}`);
      process.exit(2);
    }
    console.log(`\n═══ ${cfg.nombre} (${cfg.cuenta}) ═══`);

    // UN login por portal, y su estado reusado en los ocho viewports: entrar una vez por tamaño
    // quemaría de una el crédito del limitador si la contraseña estuviera vieja.
    const ctxLogin = await browser.newContext({
      viewport: { width: 390, height: 844 },
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

    const abrir = async (tamano) => {
      const ctx = await browser.newContext({
        viewport: { width: tamano.width, height: tamano.height },
        isMobile: tamano.movil,
        hasTouch: tamano.movil,
        deviceScaleFactor: tamano.movil ? 2 : 1,
        locale: 'es-CR',
        ignoreHTTPSErrors: true,
        storageState: sesion,
      });
      return ctx;
    };

    const ir = async (page, ruta) => {
      await page.goto(`${BASE}${cfg.prefijo}${ruta}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2200);
    };

    // -------------------------------------------------------------------------------------------
    // PASO 1 · todas las pantallas, en los dos teléfonos del barrido
    // -------------------------------------------------------------------------------------------
    for (const tamano of TAMANOS.filter((t) => DEL_BARRIDO.includes(t.nombre))) {
      console.log(`\n── ${cfg.nombre} · todas las pantallas a ${tamano.width}×${tamano.height} (${tamano.nombre}) ──`);
      const ctx = await abrir(tamano);
      const page = await ctx.newPage();
      for (const pantalla of cfg.pantallas) {
        await ir(page, pantalla.ruta);
        const arriba = await medir(page);

        // Regla 2 del registro de arneses: comprobarlo en CADA ruta, no sólo al entrar.
        if (arriba.enLogin) {
          comprobar(false, `${pantalla.nombre} · la ruta devolvió el login`, 'la sesión se cayó a mitad de corrida');
          continue;
        }

        await alFondo(page);
        const abajo = await medir(page);
        // `sinCabecera` sólo existe en el Ciudadano y marca las `bare`. En el resto, la cabecera se
        // exige: es lo que el PDF del 06-10-2026 reporta como faltante en tres pantallas.
        const exigeCabecera = cfg.cabeceraEsperada === 'siempre' || !pantalla.sinCabecera;
        revisar(pantalla.nombre, arriba, abajo, exigeCabecera, cfg.conexion, cfg.conexionSoloRaiz);

        // Volver arriba: ni salto ni superposición (pruebas 5 y 6 del PDF).
        await alTope(page);
        const devuelta = await medir(page);
        if (arriba.barra && devuelta.barra) {
          comprobar(
            devuelta.barra.top === arriba.barra.top,
            `${pantalla.nombre} · al volver arriba la cabecera queda donde estaba`,
            `empezó en ${arriba.barra.top} y volvió a ${devuelta.barra.top}`,
          );
        }
        if (pantalla.sinCabecera && arriba.barras === 0) {
          dato(`${pantalla.nombre} · sin cabecera, por diseño (su título es contenido y se desplaza)`);
        }
      }
      await ctx.close();
    }

    // -------------------------------------------------------------------------------------------
    // PASO 2 · la pantalla más larga, en los ocho viewports
    // -------------------------------------------------------------------------------------------
    console.log(`\n── ${cfg.nombre} · «${cfg.larga}» en los ocho tamaños ──`);
    for (const tamano of TAMANOS) {
      const ctx = await abrir(tamano);
      const page = await ctx.newPage();
      await ir(page, cfg.larga);
      const arriba = await medir(page);
      if (arriba.enLogin) {
        comprobar(false, `${tamano.nombre} · la ruta devolvió el login`);
        await ctx.close();
        continue;
      }
      await alFondo(page);
      const abajo = await medir(page);
      revisar(
        `${tamano.nombre} ${tamano.width}×${tamano.height}`,
        arriba,
        abajo,
        cfg.cabeceraEsperada === 'siempre' || !cfg.pantallas.find((p) => p.ruta === cfg.larga)?.sinCabecera,
        cfg.conexion,
        cfg.conexionSoloRaiz,
      );
      await ctx.close();
    }

    // -------------------------------------------------------------------------------------------
    // PASO 3 · navegar DESDE la barra estando desplazado (prueba 7 del PDF)
    // -------------------------------------------------------------------------------------------
    console.log(`\n── ${cfg.nombre} · la barra funciona con la página desplazada ──`);
    {
      const ctx = await abrir(TAMANOS.find((t) => t.nombre === 'móvil estándar'));
      const page = await ctx.newPage();
      await ir(page, cfg.larga);
      await alFondo(page);
      const antes = page.url();
      // La última pestaña de la barra, que es la que queda más lejos del pulgar.
      const pestanas = page.locator('.lx-bottom-tab-bar__tab');
      const cuantas = await pestanas.count();
      comprobar(cuantas === 5, `la barra tiene sus cinco destinos`, `encontré ${cuantas}`);
      if (cuantas > 0) {
        await pestanas.nth(0).click();
        await page.waitForTimeout(1800);
        comprobar(
          page.url() !== antes,
          'se puede navegar desde la barra con la página al fondo',
          `la URL no cambió: ${page.url().replace(BASE, '')}`,
        );
        const tras = await medir(page);
        comprobar(tras.pies === 1, 'y al llegar sigue habiendo una sola barra inferior', `hay ${tras.pies}`);
        comprobar(
          tras.scrollY <= 2,
          'y la pantalla nueva empieza arriba, no a media altura',
          `scrollY=${tras.scrollY}`,
        );
      }
      await ctx.close();
    }

    // -------------------------------------------------------------------------------------------
    // PASO 4 · contenido corto y una ruta que no existe (prueba 8 del PDF)
    // -------------------------------------------------------------------------------------------
    console.log(`\n── ${cfg.nombre} · contenido corto y ruta inexistente ──`);
    {
      const ctx = await abrir(TAMANOS.find((t) => t.nombre === 'escritorio'));
      const page = await ctx.newPage();
      // A 1536×960 casi nada desborda: es el caso «contenido corto», donde una barra mal hecha se
      // pega al fondo del CONTENIDO y no de la pantalla, o flota en medio.
      await ir(page, cfg.pantallas[0].ruta);
      const corto = await medir(page);
      comprobar(
        corto.pie !== null && Math.abs(corto.pie.bottom - corto.alto) <= 2,
        'con contenido corto la barra sigue pegada al borde de la pantalla',
        corto.pie ? `bottom=${corto.pie.bottom} contra alto=${corto.alto}` : 'no se encontró la barra',
      );
      comprobar(corto.otrosScroll.length === 0, 'y no aparece un segundo contenedor de scroll');

      await page.goto(`${BASE}${cfg.prefijo}/no-existe-esta-ruta`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const perdida = await medir(page);
      comprobar(
        !perdida.enLogin && perdida.pies === 1,
        'una ruta inexistente cae en una pantalla con su barra, no en un hueco',
        `pies=${perdida.pies} h1=«${perdida.h1}»`,
      );
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
