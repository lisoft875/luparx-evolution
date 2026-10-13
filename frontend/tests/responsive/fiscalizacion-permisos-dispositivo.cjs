/**
 * Ayuda → Permisos del dispositivo: cámara y ubicación, con los estados que de verdad pasan.
 *
 * <h2>Por qué este arnés existe aparte</h2>
 *
 * <p>El «Prompt de permisos del dispositivo» (13-10-2026) pide ocho escenarios en su §6 y ninguno
 * se puede comprobar mirando la pantalla en reposo: hay que PROVOCARLOS. Una cámara denegada, una
 * cámara que no existe y una cámara que tiene tomada otra aplicación se ven igual en una captura y
 * se arreglan en tres sitios distintos, y lo que falla es justo distinguirlas.</p>
 *
 * <p>Así que cada escenario se fabrica interceptando la API del aparato con `addInitScript` —que
 * corre ANTES que la aplicación, de modo que lo que la pantalla lee es el escenario— y después se
 * mira qué dijo la fila. Nada de clases de CSS ni de banderas internas.</p>
 *
 * <h2>Las dos cosas que no se comprueban acá</h2>
 *
 * <ul>
 *   <li><b>Un teléfono real.</b> Esto es Chromium de escritorio con un aparato de vídeo falso. La
 *       prueba en un teléfono de verdad la tiene que hacer una persona, y el §6 lo dice con todas
 *       las letras: «no afirmar que se probó en un teléfono real si esa prueba no se realizó».</li>
 *   <li><b>El build nativo.</b> El camino de Capacitor no corre en un navegador; lo que se prueba
 *       acá es el camino de navegador, que es el que staging sirve.</li>
 * </ul>
 *
 *   PASS='...' node tests/responsive/fiscalizacion-permisos-dispositivo.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'Password123!';
const CUENTA = process.env.CUENTA ?? 'inspector@luparx.test';

if (/^<.*>$/.test(PASS) || PASS.trim() === '') {
  console.error(`PASS no es una contraseña: ${JSON.stringify(PASS)}`);
  process.exit(2);
}

let fallos = 0;
function comprobar(ok, mensaje, detalle) {
  if (ok) console.log(`  ok  ${mensaje}`);
  else {
    fallos++;
    console.log(`  ✗   ${mensaje}${detalle ? `\n        ${detalle}` : ''}`);
  }
}

/**
 * El guion que fabrica un escenario de cámara.
 *
 * <p>Se inyecta como texto porque `addInitScript` lo evalúa en la página, no acá. Siempre deja
 * `window.__pistas`, que es la lista de TODAS las pistas de vídeo que la aplicación llegó a abrir:
 * es por donde se comprueba que al cerrar la vista no queda ninguna viva, que es un requisito del
 * §2 y el que de verdad se nota —una cámara encendida en segundo plano se ve en la luz del
 * aparato.</p>
 */
function guionDeCamara(escenario) {
  return `
    window.__gum = { llamadas: 0, pistas: [], fallos: [], notas: [] };
    // Sólo para el diagnóstico: si la página no tuviera getUserMedia, soporteDeCamara()
    // contestaría «no disponible en este navegador» y la fila diría otra cosa.
    window.__gum.habiaReal = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const fallar = (nombre) => {
      const e = new Error(nombre);
      e.name = nombre;
      return Promise.reject(e);
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...(navigator.mediaDevices ?? {}),
        getUserMedia: async (restricciones) => {
          window.__gum.llamadas++;
          if ('${escenario}' === 'denied') return fallar('NotAllowedError');
          if ('${escenario}' === 'notFound') return fallar('NotFoundError');
          if ('${escenario}' === 'busy') return fallar('NotReadableError');
          if ('${escenario}' === 'failed') return fallar('TypeError');
          if ('${escenario}' === 'overconstrained' && window.__gum.llamadas === 1) {
            // El primer intento falla por restricciones; el segundo —el que abrirCamara hace sin
            // condiciones desde el 13-10— tiene que llegar acá y salir bien.
            return fallar('OverconstrainedError');
          }
          /*
            La cámara «que funciona» es un LIENZO, no una cámara.

            Primero esto llamaba al getUserMedia de verdad con un aparato de vídeo simulado por
            bandera de Chromium. La corrida del 13-10 lo cobró: NotSupportedError «Not supported»
            —el navegador de esa máquina no entrega captura de medios en ese modo— y los tres
            fallos que salieron no decían nada de la aplicación, decían que ahí no hay cámara.

            canvas.captureStream() devuelve un MediaStream de verdad, con una pista de vídeo de
            verdad que se reproduce en un <video> y que stop() deja en «ended». O sea que
            ejercita el camino ENTERO de la pantalla —abrir, pintar, contar pistas, apagarlas al
            cerrar— sin depender de que la máquina que corre el arnés tenga cámara ni de una
            bandera del navegador. Comprobado antes de usarlo: 1 pista, «live», readyState 4 en
            el vídeo, y «ended» después de cerrar.

            Lo que esto NO prueba, y conviene no confundirlo: que el sensor de un aparato concreto
            responda. Eso sólo lo prueba una persona con un teléfono en la mano.
          */
          let stream;
          try {
            const lienzo = document.createElement('canvas');
            lienzo.width = 320;
            lienzo.height = 240;
            const pincel = lienzo.getContext('2d');
            pincel.fillStyle = '#0b2b47';
            pincel.fillRect(0, 0, 320, 240);
            stream = lienzo.captureStream(10);
          } catch (e) {
            window.__gum.fallos.push((e && e.name) + ': ' + (e && e.message));
            throw e;
          }
          /*
            La contabilidad del arnés va en su propio try: si ESTO lanzara, la excepción saldría
            por \`getUserMedia\` y la aplicación reportaría una cámara rota que en realidad se
            abrió. Una sonda que puede provocar el fallo que mide no sirve para medirlo.
          */
          try {
            stream.getVideoTracks().forEach((t) => window.__gum.pistas.push(t));
          } catch (e) {
            window.__gum.notas.push('contabilidad: ' + e);
          }
          return stream;
        },
      },
    });
    // El registro de permisos miente a propósito cuando el escenario lo pide: es exactamente el
    // caso que el §2 llama «no considerar la cámara funcional solo porque el permiso aparece
    // concedido» — permiso en verde y cámara que no abre.
    if (navigator.permissions && navigator.permissions.query) {
      const consulta = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = async (desc) => {
        if (desc && desc.name === 'camera') {
          return { state: '${escenario}' === 'denied' ? 'denied' : 'granted', onchange: null };
        }
        return consulta(desc);
      };
    }
  `;
}

/** Lo que la sonda vio, para imprimirlo cuando algo no sale como se esperaba. */
async function diagnosticoGum(page) {
  const g = await page
    .evaluate(() => window.__gum ?? null)
    .catch(() => null);
  if (!g) return 'sin sonda';
  return `llamadas=${g.llamadas} habiaReal=${g.habiaReal} pistas=${g.pistas.length}`
    + ` fallos=[${g.fallos.join(' | ')}] notas=[${g.notas.join(' | ')}]`;
}

/** Y el de ubicación, con las cuatro salidas que `probePosition` sabe distinguir. */
function guionDeUbicacion(escenario) {
  if (escenario === 'unavailable') {
    return `Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });`;
  }
  if (escenario === 'timeout') {
    return `
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          // Nunca contesta: la que vence es la cuenta atrás de la propia API, que es el caso real
          // de un aparato bajo techo sin fijar satélites.
          getCurrentPosition: (_ok, error) => {
            setTimeout(() => error({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 400);
          },
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    `;
  }
  if (escenario === 'denied') {
    return `
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok, error) => {
            error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          },
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    `;
  }
  return '';
}

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/inspector/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', CUENTA);
  await page.fill('input[type="password"]', PASS);
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/inspector/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del fiscalizador falló con ${respuesta.status()}.`);
    process.exit(3);
  }
  await page.waitForTimeout(1800);
  const ficha = page.locator('button, a').filter({ hasText: /San José|Escazú|Montes de Oca/ }).first();
  if (await ficha.isVisible().catch(() => false)) {
    await ficha.click();
    await page.waitForTimeout(1500);
  }
  return page;
}

/** Abre Ayuda → Permisos del dispositivo y devuelve las filas tal y como quedaron pintadas. */
async function abrirPermisos(page) {
  await page.goto(`${BASE}/inspector/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.locator('.lx-list-row').filter({ hasText: 'Permisos del dispositivo' }).first().click();
  await page.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  return filas(page);
}

function filas(page) {
  return page.$$eval('.lx-diag__row', (nodos) =>
    nodos.map((n) => ({
      clave: n.getAttribute('data-check'),
      tono: n.getAttribute('data-tono'),
      accion: n.getAttribute('data-accion'),
      texto: (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
      botones: [...n.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
    })),
  );
}

/**
 * Pulsa «Comprobar la cámara», deja que la ventana resuelva, y la cierra.
 *
 * <p>La vista de prueba se abre con el panel de permisos CERRADO —dos ventanas modales comparten
 * el oyente de Escape, así que la pantalla cierra una para abrir la otra— y por eso las filas no
 * se pueden leer hasta después de cerrarla. Al cerrarse, el panel vuelve solo.</p>
 */
async function probarCamaraYCerrar(page) {
  await page.getByRole('button', { name: /Comprobar la cámara/i }).first().click();
  await page.waitForTimeout(1600);
  const cerrar = page.getByRole('button', { name: /^Cerrar$/i }).first();
  if ((await cerrar.count()) > 0) await cerrar.click();
  await page.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  return filas(page);
}

async function resumen(page) {
  const texto = await page.getByRole('dialog').first().textContent().catch(() => '');
  return (texto ?? '').replace(/\s+/g, ' ');
}

(async () => {
  /*
    Sin banderas de cámara, y a propósito.

    La primera versión lanzaba Chromium con `--use-fake-device-for-media-stream` para tener una
    cámara simulada. En la máquina donde se corre el arnés eso contestó `NotSupportedError`, y los
    tres fallos resultantes no decían nada de la aplicación. El camino feliz ya no depende del
    navegador: el escenario «ok» fabrica su propio `MediaStream` con un lienzo.
  */
  const browser = await chromium.launch();
  console.log(`\n${BASE}/inspector · ${CUENTA}\n`);

  const erroresJs = [];

  /** Una sesión limpia con un escenario inyectado. El login se hace una vez y se reutiliza. */
  let estado = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR', ignoreHTTPSErrors: true });
    const p = await entrar(ctx);
    estado = await ctx.storageState();
    await p.close();
    await ctx.close();
  }

  async function escenario({ camara, ubicacion, permisos = [] }) {
    const ctx = await browser.newContext({
      storageState: estado,
      viewport: { width: 390, height: 844 },
      locale: 'es-CR',
      ignoreHTTPSErrors: true,
      permissions: permisos,
      geolocation: permisos.includes('geolocation') ? { latitude: 9.9333, longitude: -84.0833 } : undefined,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erroresJs.push(String(e)));
    if (camara) await p.addInitScript(guionDeCamara(camara));
    if (ubicacion) await p.addInitScript(guionDeUbicacion(ubicacion));
    return { ctx, p };
  }

  // ===============================================================================================
  // CÁMARA — los cuatro escenarios del §6
  // ===============================================================================================
  console.log('── Cámara ──');

  // --- Permiso concedido y cámara que responde --------------------------------------------------
  {
    const { ctx, p } = await escenario({ camara: 'ok', permisos: ['camera'] });
    const antes = await abrirPermisos(p);
    const camara = antes.find((f) => f.clave === 'camera');
    comprobar(
      camara?.tono === 'aviso' && /Sin comprobar/i.test(camara.texto),
      'con el permiso concedido pero SIN probar, la cámara no está en verde',
      camara ? `tono=${camara.tono} · ${camara.texto}` : 'no se pintó la fila de cámara',
    );
    comprobar(
      !/Todo está funcionando correctamente/.test(await resumen(p)),
      '  y el resumen no dice que todo está bien',
    );

    await p.getByRole('button', { name: /Comprobar la cámara/i }).first().click();
    await p.waitForTimeout(1600);
    comprobar(
      (await p.locator('.lx-diag__row').count()) === 0,
      '  y el panel de permisos se aparta: una sola ventana modal a la vez',
    );
    const vivo = await p.locator('video.lx-camera__video').count();
    comprobar(
      vivo === 1,
      '  «Comprobar la cámara» abre la vista en vivo',
      `videos=${vivo} · ${await diagnosticoGum(p)}`,
    );
    /*
      Las tres de abajo sólo se comprueban si la vista llegó a abrirse, y no por indulgencia: sin
      vista, «no hay obturador» y «hay un botón de cerrar» salen en verde porque no hay NADA
      —el botón de cerrar que encuentran es la X del encabezado—. Una prueba que pasa cuando la
      pantalla falló es peor que una que no existe. La corrida del 13-10 las dio por buenas con la
      cámara caída, y es la segunda vez este mes que una medición sobrevive a lo que medía.
    */
    if (vivo === 1) {
      const reproduciendo = await p
        .locator('video.lx-camera__video')
        .evaluate((v) => !!v.srcObject)
        .catch(() => false);
      comprobar(reproduciendo, '  y el vídeo tiene una fuente de verdad');
      const hayObturador = await p.getByRole('button', { name: /Tomar foto/i }).count();
      comprobar(hayObturador === 0, '  sin obturador: en una prueba no se toma ninguna fotografía');
      const hayCerrar = await p.getByRole('button', { name: /^Cerrar$/i }).count();
      comprobar(hayCerrar > 1, '  y con un botón de cerrar propio, además de la X del encabezado');
    }

    await p.getByRole('button', { name: /^Cerrar$/i }).first().click();
    await p.waitForSelector('.lx-diag__row', { timeout: 8000 }).catch(() => undefined);
    await p.waitForTimeout(900);
    comprobar(
      (await p.locator('.lx-diag__row').count()) > 0,
      '  al cerrar se vuelve al panel de permisos, no a ninguna otra parte',
    );
    const pistas = await p.evaluate(() => (window.__gum?.pistas ?? []).map((t) => t.readyState));
    comprobar(
      pistas.length > 0 && pistas.every((e) => e === 'ended'),
      '  al cerrar, TODAS las pistas de vídeo quedan apagadas',
      `pistas=${JSON.stringify(pistas)} · ${await diagnosticoGum(p)}`,
    );
    const despues = (await filas(p)).find((f) => f.clave === 'camera');
    comprobar(
      despues?.tono === 'ok' && /entregó imagen|Habilitada/i.test(despues.texto),
      '  y ahora sí: comprobada, el aparato entregó imagen',
      despues ? `tono=${despues.tono} · ${despues.texto} · ${await diagnosticoGum(p)}` : 'sin fila',
    );
    await ctx.close();
  }

  // --- Permiso denegado -------------------------------------------------------------------------
  {
    const { ctx, p } = await escenario({ camara: 'denied' });
    await abrirPermisos(p);
    const camara = (await probarCamaraYCerrar(p)).find((f) => f.clave === 'camera');
    comprobar(
      camara?.tono === 'aviso' && /Bloqueada/i.test(camara.texto),
      'con el permiso denegado la fila dice «Bloqueada», no «no funciona»',
      camara ? `tono=${camara.tono} · ${camara.texto}` : 'sin fila',
    );
    comprobar(
      /candado|permisos del sitio/i.test(camara?.texto ?? ''),
      '  y explica en una frase dónde se habilita',
      camara?.texto,
    );
    comprobar(
      /boleta puede seguir funcionando/i.test(camara?.texto ?? ''),
      '  sin afirmar que la boleta se queda sin fotos, que es lo que NO se sabe',
      camara?.texto,
    );
    comprobar(
      (camara?.botones ?? []).some((b) => /Comprobar la cámara/i.test(b)),
      '  y el botón sigue ahí: comprobar no es conceder, y el permiso pudo cambiar en Ajustes',
      JSON.stringify(camara?.botones ?? []),
    );
    await ctx.close();
  }

  // --- Sin cámara en el aparato ----------------------------------------------------------------
  {
    const { ctx, p } = await escenario({ camara: 'notFound' });
    await abrirPermisos(p);
    const camara = (await probarCamaraYCerrar(p)).find((f) => f.clave === 'camera');
    comprobar(
      camara?.tono === 'nodisponible',
      'sin cámara conectada, el tono es «no disponible» y no «problema»',
      camara ? `tono=${camara.tono} · ${camara.texto}` : 'sin fila',
    );
    comprobar(
      !(camara?.botones ?? []).some((b) => /Comprobar la cámara/i.test(b)),
      '  y no se ofrece un botón que no puede arreglar nada',
      JSON.stringify(camara?.botones ?? []),
    );
    await ctx.close();
  }

  // --- La tiene tomada otra aplicación ----------------------------------------------------------
  {
    const { ctx, p } = await escenario({ camara: 'busy' });
    await abrirPermisos(p);
    const camara = (await probarCamaraYCerrar(p)).find((f) => f.clave === 'camera');
    comprobar(
      camara?.tono === 'aviso' && /otra aplicación/i.test(camara.texto),
      'con la cámara tomada por otra aplicación se dice eso y no «bloqueada»',
      camara ? `tono=${camara.tono} · ${camara.texto}` : 'sin fila',
    );
    await ctx.close();
  }

  // --- La resolución pedida no encaja: hay cámara, y hay que decirlo ---------------------------
  {
    /*
      `abrirCamara` pide la cámara trasera a 1920×1080 como PREFERENCIA (`ideal`), que en teoría
      ningún navegador puede rechazar. En la práctica hay cámaras que contestan
      `OverconstrainedError` igual, y hasta el 13-10 eso se traducía como «No hay cámara en este
      aparato» — una afirmación falsa: la cámara está, lo que no encaja es la resolución.

      Desde ese día hay un segundo intento sin condiciones. Esta prueba lo comprueba por su
      efecto: el primer intento falla, el segundo entrega imagen, y la fila acaba en verde.
    */
    const { ctx, p } = await escenario({ camara: 'overconstrained' });
    await abrirPermisos(p);
    const fila = (await probarCamaraYCerrar(p)).find((f) => f.clave === 'camera');
    comprobar(
      fila?.tono === 'ok',
      'si la resolución pedida no encaja, se reintenta sin condiciones en vez de decir «no hay cámara»',
      fila ? `tono=${fila.tono} · ${fila.texto} · ${await diagnosticoGum(p)}` : 'sin fila',
    );
    const llamadas = await p.evaluate(() => window.__gum?.llamadas ?? 0);
    comprobar(llamadas === 2, '  y el reintento es UNO, no un bucle', `llamadas=${llamadas}`);
    await ctx.close();
  }

  // ===============================================================================================
  // UBICACIÓN — los cuatro escenarios del §6
  // ===============================================================================================
  console.log('\n── Ubicación ──');

  {
    const { ctx, p } = await escenario({ permisos: ['geolocation'] });
    await abrirPermisos(p);
    await p.getByRole('button', { name: /Comprobar ubicación/i }).first().click();
    await p.waitForTimeout(2500);
    const fila = (await filas(p)).find((f) => f.clave === 'location');
    comprobar(
      /-?\d+\.\d{4}/.test(fila?.texto ?? ''),
      'con permiso concedido se muestran coordenadas de verdad',
      fila?.texto,
    );
    comprobar(fila?.tono === 'ok', '  y la fila queda en orden', `tono=${fila?.tono}`);
    await ctx.close();
  }

  {
    const { ctx, p } = await escenario({ ubicacion: 'denied' });
    await abrirPermisos(p);
    await p.getByRole('button', { name: /Comprobar ubicación/i }).first().click();
    await p.waitForTimeout(1800);
    const fila = (await filas(p)).find((f) => f.clave === 'location');
    comprobar(
      fila?.tono === 'aviso' && /denegado/i.test(fila.texto),
      'con el permiso denegado se dice denegado',
      fila ? `tono=${fila.tono} · ${fila.texto}` : 'sin fila',
    );
    comprobar(
      !/Todo está funcionando correctamente/.test(await resumen(p)),
      '  y el resumen NO dice que todo está bien (§4)',
    );
    await ctx.close();
  }

  {
    const { ctx, p } = await escenario({ ubicacion: 'unavailable' });
    const fs = await abrirPermisos(p);
    const fila = fs.find((f) => f.clave === 'location');
    comprobar(
      fila?.tono === 'nodisponible',
      'sin receptor de posición, el tono es «no disponible»',
      fila ? `tono=${fila.tono} · ${fila.texto}` : 'sin fila',
    );
    comprobar(
      !(fila?.botones ?? []).some((b) => /Comprobar ubicación/i.test(b)),
      '  y no se ofrece comprobar lo que el aparato no tiene',
      JSON.stringify(fila?.botones ?? []),
    );
    await ctx.close();
  }

  {
    const { ctx, p } = await escenario({ ubicacion: 'timeout' });
    await abrirPermisos(p);
    await p.getByRole('button', { name: /Comprobar ubicación/i }).first().click();
    await p.waitForTimeout(2200);
    const fila = (await filas(p)).find((f) => f.clave === 'location');
    comprobar(
      /tiempo|no se pudo fijar|agotad/i.test(fila?.texto ?? ''),
      'con el tiempo agotado se dice eso, y no «denegado»',
      fila?.texto,
    );
    await ctx.close();
  }

  // ===============================================================================================
  // §4 — «Volver a comprobar», y §6 — nada roto alrededor
  // ===============================================================================================
  console.log('\n── Volver a comprobar, y lo que no se puede romper ──');

  {
    const { ctx, p } = await escenario({ camara: 'denied', ubicacion: 'denied' });
    await abrirPermisos(p);
    await p.getByRole('button', { name: /Volver a comprobar/i }).first().click();
    await p.waitForTimeout(2600);
    const texto = await resumen(p);
    comprobar(
      !/Todo está funcionando correctamente/.test(texto),
      'con dos permisos denegados, «Volver a comprobar» no declara que todo funciona',
      texto.slice(0, 160),
    );
    const fila = (await filas(p)).find((f) => f.clave === 'location');
    comprobar(
      /denegado/i.test(fila?.texto ?? ''),
      '  y sí intenta la ubicación de verdad: la fila queda con su causa',
      fila?.texto,
    );
    const camara = (await filas(p)).find((f) => f.clave === 'camera');
    comprobar(
      !/entregó imagen/i.test(camara?.texto ?? ''),
      '  sin marcar la cámara como comprobada: eso tiene su propio botón',
      camara?.texto,
    );
    await ctx.close();
  }

  // --- Navegación y emisión de boletas: lo que no puede haberse roto ---------------------------
  {
    const { ctx, p } = await escenario({ camara: 'ok', permisos: ['camera'] });
    await abrirPermisos(p);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
    const barra = await p.locator('.lx-bottom-tab-bar__tab').count();
    comprobar(barra >= 4, 'al cerrar el panel, la barra inferior sigue completa', `pestañas=${barra}`);

    /*
      `/cite`, no `/citations/new`.

      La corrida del 13-10 marcó tres fallos acá y los tres eran MÍOS: inventé una ruta que no
      existe. `App.tsx` monta `/cite` para el formulario y `/citations/:id` para el detalle, así que
      `/citations/new` entraba al detalle de una boleta llamada «new» —que se dibujó sin romperse,
      por eso no hubo ni un error de consola— y ahí no hay ni botón de foto ni formulario.

      No era una regresión: este commit no toca la emisión de boletas. Pero el arnés la acusó, que
      es exactamente la clase de fallo que hace perder un despliegue arreglando lo que no está roto.
    */
    await p.goto(`${BASE}/inspector/cite`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    const boton = await p.getByRole('button', { name: /Tomar fotograf|evidencia/i }).count();
    comprobar(boton > 0, 'la emisión de boletas conserva su acción de adjuntar evidencia', `botones=${boton}`);
    const entrada = await p.locator('input[type="file"][capture]').count();
    comprobar(
      entrada === 1,
      '  y sigue usando el selector del sistema, que es el mecanismo que vale como prueba',
      `inputs=${entrada}`,
    );
    const placa = await p.locator('input').count();
    comprobar(placa > 0, '  y el formulario sigue en pie', `campos=${placa}`);
    await ctx.close();
  }

  comprobar(erroresJs.length === 0, 'ni un error de JavaScript en consola', erroresJs.join(' | '));

  await browser.close();
  console.log(`\n===== ${fallos} comprobaciones fallidas =====`);
  process.exit(fallos > 0 ? 1 : 0);
})();
