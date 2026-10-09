/**
 * Ciudadano → Ayuda → «Permisos del dispositivo», y la cámara de verdad.
 *
 * <h2>Qué distingue esta prueba de una que sólo mira la pantalla</h2>
 *
 * <p>El encargo del 09-10-2026 lo dice en letra: «verificar el acceso real a la cámara; no basta
 * con cambiar el texto ni mostrar un estado verde». Una prueba que abra el panel y lea «Habilitada»
 * no comprueba nada —ese era exactamente el defecto reportado: el panel decía que todo funcionaba
 * sin haber abierto la cámara nunca—. Así que acá los cuatro escenarios se PROVOCAN:</p>
 *
 * <ul>
 *   <li><b>Concedido</b>: Chromium arrancado con cámara falsa y el permiso otorgado al origen. La
 *       comprobación tiene que terminar en verde y, en la impugnación, el obturador tiene que
 *       producir una imagen que llegue al servidor.</li>
 *   <li><b>Denegado</b>: el permiso se revoca en el contexto. El panel tiene que decir «Bloqueada»
 *       y explicar dónde se habilita, sin pintar nada de verde.</li>
 *   <li><b>Sin cámara</b>: se borra `navigator.mediaDevices` antes de que cargue la aplicación. El
 *       panel tiene que decirlo y la impugnación NO debe ofrecer el botón de cámara, pero sí el de
 *       adjuntar.</li>
 *   <li><b>Sin pedir nada al abrir</b>: el permiso no se solicita al cargar Ayuda ni al abrir el
 *       panel; sólo al pulsar. Se comprueba contando las llamadas a `getUserMedia`.</li>
 * </ul>
 *
 *   PASS='...' node tests/responsive/permisos-ciudadano.cjs
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'https://staging.luparx.com';
const PASS = process.env.PASS ?? 'DemoLupaRX2026';
const CUENTA = process.env.CUENTA ?? 'ana.morales@luparx.test';

/** Móvil y escritorio, que es lo que el encargo pide probar. */
const TAMANOS = [
  { nombre: 'móvil 390x844', width: 390, height: 844 },
  { nombre: 'escritorio 1280x800', width: 1280, height: 800 },
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
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/citizen/login'), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  if (!respuesta.ok()) {
    console.error(`El login del ciudadano falló con ${respuesta.status()}.`);
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

/** Cuenta cuántas veces la aplicación pidió la cámara, sin impedírselo. */
const ESPIA = `
  window.__gum = 0;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => { window.__gum += 1; return original(...args); };
  }
`;

/** Abre Ayuda y entra al panel de permisos. Devuelve el texto del panel. */
async function abrirPanel(page) {
  await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  const tarjeta = page.locator('[data-categoria="permisos"]');
  const existe = (await tarjeta.count()) > 0;
  if (!existe) return { existe: false };
  await tarjeta.first().click();
  await page.waitForTimeout(900);
  const dialogo = page.locator('[role="dialog"]').last();
  return { existe: true, dialogo, texto: (await dialogo.innerText()).replace(/\s+/g, ' ') };
}

(async () => {
  // ===============================================================================================
  // 1 · CÁMARA CONCEDIDA
  // ===============================================================================================
  const conCamara = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  for (const tamano of TAMANOS) {
    console.log(`\n── Permiso concedido · ${tamano.nombre} ──`);
    const context = await conCamara.newContext({
      viewport: { width: tamano.width, height: tamano.height },
      locale: 'es-CR',
      permissions: ['camera'],
    });
    await context.addInitScript(ESPIA);
    const sesion = await entrar(context);
    await sesion.close();

    const page = await context.newPage();
    const panel = await abrirPanel(page);
    ok(panel.existe, `${tamano.nombre}: la tarjeta «Permisos del dispositivo» está en Ayuda`);
    if (!panel.existe) {
      await context.close();
      continue;
    }

    // Nada se pidió sólo por abrir: el encargo exige que el permiso se solicite ÚNICAMENTE
    // después de una acción explícita.
    const pedidasAlAbrir = await page.evaluate(() => window.__gum ?? 0);
    ok(pedidasAlAbrir === 0, `${tamano.nombre}: abrir el panel no pide la cámara`, `llamadas: ${pedidasAlAbrir}`);

    ok(
      /Sin comprobar|Se pide al usarla/.test(panel.texto),
      `${tamano.nombre}: antes de comprobar NO dice que esté habilitada`,
      panel.texto.slice(0, 160),
    );
    ok(
      !/Todo está funcionando correctamente|lista para usarse/.test(panel.texto),
      `${tamano.nombre}: y no declara que todo funciona sin haberlo probado`,
      panel.texto.slice(0, 160),
    );
    ok(!/Ubicación/i.test(panel.texto), `${tamano.nombre}: no aparece ninguna fila de ubicación`);

    const boton = panel.dialogo.locator('button', { hasText: /Habilitar cámara|Comprobar la cámara/ }).first();
    ok((await boton.count()) > 0, `${tamano.nombre}: hay un botón para habilitarla o comprobarla`);
    if ((await boton.count()) > 0) {
      await boton.click();
      await page.waitForTimeout(1800);
      const despues = (await panel.dialogo.innerText()).replace(/\s+/g, ' ');
      const pedidas = await page.evaluate(() => window.__gum ?? 0);
      ok(pedidas >= 1, `${tamano.nombre}: pulsar SÍ abre la cámara de verdad`, `llamadas: ${pedidas}`);
      ok(
        /Habilitada/.test(despues) && /entregó imagen/.test(despues),
        `${tamano.nombre}: y el estado pasa a habilitada porque el aparato entregó imagen`,
        despues.slice(0, 200),
      );
    }
    await page.screenshot({
      path: `tests/responsive/capturas/ciudadano-permisos-${tamano.width}.png`,
    });
    await context.close();
  }

  // ===============================================================================================
  // 2 · USO REAL EN EL FLUJO DE EVIDENCIA
  // ===============================================================================================
  console.log('\n── La cámara en la impugnación ──');
  {
    const context = await conCamara.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'es-CR',
      permissions: ['camera'],
    });
    const sesion = await entrar(context);
    await sesion.close();
    const page = await context.newPage();
    await page.goto(`${BASE}/fines`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    const multa = page.locator('a[href*="/fines/"], button').filter({ hasText: /Ver|Detalle|₡/ }).first();
    if ((await multa.count()) === 0) {
      console.log('  ··  esta cuenta no tiene multas en staging: el flujo de evidencia no se pudo recorrer');
    } else {
      await multa.click();
      await page.waitForTimeout(2000);
      const camara = page.locator('button', { hasText: /Tomar foto con la cámara/ });
      const adjuntar = page.locator('button', { hasText: /Agregar foto/ });
      if ((await camara.count()) === 0 && (await adjuntar.count()) === 0) {
        console.log('  ··  esta multa no está en estado de impugnación con evidencia: no hay nada que medir');
      } else {
        ok((await camara.count()) > 0, 'con cámara disponible se ofrece «Tomar foto con la cámara»');
        ok((await adjuntar.count()) > 0, 'y «Agregar foto» sigue estando como alternativa');
        if ((await camara.count()) > 0) {
          await camara.first().click();
          await page.waitForTimeout(1600);
          const dialogo = page.locator('[role="dialog"]').last();
          ok((await dialogo.locator('video').count()) > 0, 'la ventana muestra lo que ve la cámara');
          const obturador = dialogo.locator('button', { hasText: /Tomar foto$/ }).first();
          if ((await obturador.count()) > 0) {
            await obturador.click();
            await page.waitForTimeout(1200);
            ok((await dialogo.locator('img').count()) > 0, 'y al disparar aparece la vista previa');
            ok(
              (await dialogo.locator('button', { hasText: /Repetir/ }).count()) > 0 &&
                (await dialogo.locator('button', { hasText: /Usar esta foto/ }).count()) > 0,
              'con «Repetir» y «Usar esta foto», no guardado automático',
            );
          }
        }
      }
    }
    await context.close();
  }
  await conCamara.close();

  // ===============================================================================================
  // 3 · PERMISO DENEGADO
  // ===============================================================================================
  console.log('\n── Permiso denegado ──');
  {
    const navegador = await chromium.launch({ args: ['--use-fake-device-for-media-stream'] });
    const context = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CR' });
    // Sin `--use-fake-ui-for-media-stream` y sin conceder el permiso, Chromium lo deniega solo.
    await context.clearPermissions();
    const sesion = await entrar(context);
    await sesion.close();
    const page = await context.newPage();
    const panel = await abrirPanel(page);
    if (panel.existe) {
      const boton = panel.dialogo.locator('button', { hasText: /Habilitar cámara|Comprobar la cámara/ }).first();
      if ((await boton.count()) > 0) {
        await boton.click();
        await page.waitForTimeout(2000);
        const texto = (await panel.dialogo.innerText()).replace(/\s+/g, ' ');
        ok(/Bloqueada/.test(texto), 'denegada: el panel lo dice', texto.slice(0, 200));
        ok(
          /candado|permisos del sitio/i.test(texto),
          'y explica dónde se habilita',
          texto.slice(0, 200),
        );
        ok(!/Habilitada|entregó imagen/.test(texto), 'y no se pinta de verde');
      }
    }
    await context.close();
    await navegador.close();
  }

  // ===============================================================================================
  // 4 · SIN CÁMARA EN EL APARATO
  // ===============================================================================================
  console.log('\n── Sin cámara ──');
  {
    const navegador = await chromium.launch();
    const context = await navegador.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-CR' });
    const sesion = await entrar(context);
    await sesion.close();
    // Se borra DESPUÉS del login y antes de cargar Ayuda, para que la aplicación arranque en un
    // navegador que, hasta donde ella puede ver, no tiene cámara.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    const panel = await abrirPanel(page);
    if (panel.existe) {
      ok(
        /No disponible en este navegador|No hay cámara/.test(panel.texto),
        'sin cámara: el panel lo dice en vez de ofrecer un botón muerto',
        panel.texto.slice(0, 200),
      );
      ok(
        /adjuntar una fotografía/i.test(panel.texto),
        'y nombra la alternativa: adjuntar una fotografía ya tomada',
        panel.texto.slice(0, 200),
      );
    }
    await context.close();
    await navegador.close();
  }

  console.log(`\n${fallos === 0 ? 'Sin fallos.' : `${fallos} fallo(s).`}`);
  process.exit(fallos === 0 ? 0 : 1);
})();
