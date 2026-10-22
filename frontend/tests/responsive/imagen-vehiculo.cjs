/**
 * La imagen del vehículo en el navegador: los tres escalones y el respaldo (22-10-2026).
 *
 * <h2>Qué mide, y por qué no lo miden los otros arneses</h2>
 *
 * <p>`miniatura-vehiculo.cjs` mide el hueco, la proporción y que la placa no se recorte, y lo hace
 * en ocho tamaños. `prototipo.check.mjs` y `catalogo.check.mjs` miden la REGLA —qué imagen le toca
 * a qué vehículo— sin navegador. Entre los dos quedaba sin probar lo que une las dos cosas: que el
 * archivo exista de verdad, que llegue, que cargue y que sea el del vehículo correcto.</p>
 *
 * <h2>Los tres escalones</h2>
 *
 * <ol>
 *   <li><b>Fotografía con licencia</b> del modelo concreto: se fabrica una acá para poder probarla
 *       (la carpeta real está vacía, no hay imágenes compradas todavía).</li>
 *   <li><b>Imagen de prototipo</b> por carrocería y color: las cien del 22-10-2026, que sí están.</li>
 *   <li><b>El dibujo</b>, para lo que no tiene imagen —una motocicleta, un color sin declarar—.</li>
 * </ol>
 *
 * <h2>La imagen de prueba se crea y se borra acá</h2>
 *
 * <p>La orden del 22-10-2026 prohíbe «utilizar imágenes de prueba como si fueran activos finales».
 * El archivo lo escribe este arnés antes de levantar el servidor y lo borra al terminar, pase o
 * falle; la última comprobación verifica que ya no está. No se versiona, no entra en ningún
 * paquete que se despliegue y no tiene fila en LICENCIAS.md porque no es un activo: es un
 * instrumento de medición, como el servidor simulado.</p>
 *
 *   cd frontend && node tests/responsive/imagen-vehiculo.cjs
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));

/*
  Un puerto propio y no el 5183 del resto de los arneses. El catálogo se arma cuando el
  empaquetador lee la carpeta, así que un servidor levantado ANTES de escribir la imagen de prueba
  podría no tenerla. Con puerto propio este arnés siempre levanta el suyo, después de crearla.
*/
const PUERTO = 5190;
const BASE = `http://localhost:${PUERTO}`;
const EJECUTABLE = process.env.PW_CHROMIUM || undefined;

const CON_LICENCIA = path.join(RAIZ, 'apps/citizen/src/vehicleImages/assets');
/* Corresponde al RAV4 2018 BLANCO del servidor simulado (`BNY963`) y a ningún otro vehículo. */
const FIXTURE = path.join(CON_LICENCIA, 'toyota__rav4__2015-2020__white.png');

/**
 * Los tres vehículos sembrados y qué imagen de PROTOTIPO les toca.
 *
 * <p>Se escribe la clave esperada —no «alguna imagen»— porque el defecto que importa es mostrar el
 * vehículo de otra persona: un Yaris gris con la foto de la SUV blanca pasaría una comprobación
 * que sólo exigiera «hay un img».</p>
 */
const SEMBRADOS = [
  { placa: 'BHL019', descripcion: 'Toyota Yaris 2015 gris, CAR', clave: 'sedan-gris' },
  { placa: 'BNY963', descripcion: 'Toyota RAV4 2018 blanco, CAR', clave: 'suv-compacta-blanco' },
  /*
    La pick-up, y es el caso que más vale de los tres. Desde `V16_0` el contrato NO tiene un tipo
    PICKUP: esta Hilux llega declarada `CAR`, igual que el Yaris, y la única forma de distinguirla
    es su modelo. Si la tabla de modelos se rompe, este caso lo dice y los otros dos no.
  */
  { placa: 'CL1234', descripcion: 'Toyota Hilux 2021 plata, declarada CAR', clave: 'pickup-plata' },
];
const CON_FOTO_LICENCIADA = 'BNY963';

/**
 * El vehículo sembrado donde el tipo del servidor y la tabla de modelos se contradicen.
 *
 * <p>`TEST01` está sembrado como marca Toyota, modelo Corolla y tipo **MOTORCYCLE**. O sea que su
 * modelo está en la tabla de carrocerías —como sedán— pero el servidor dijo que es una moto. Es
 * exactamente el caso en que una tabla escrita a mano podría contradecir al servidor.</p>
 *
 * <p>Hasta el 22-10-2026 esta prueba exigía el <b>dibujo</b>, porque entre las carrocerías de la
 * biblioteca no había moto. Esa noche llegaron nueve fotos de motocicleta y la exigencia dejó de
 * ser cierta: TEST01 es negro, y `moto-negro.webp` existe. <b>La prueba falló, que es exactamente
 * lo que tenía que hacer</b>, y por eso se reescribe en lugar de borrarse.</p>
 *
 * <p>Lo que se exige ahora es lo que nunca cambia y es lo que de verdad protege al usuario: una
 * motocicleta recibe el dibujo o un archivo `moto-…`, <b>nunca</b> la foto de un automóvil.
 * Ponerle un sedán a un motociclista sería mostrarle un vehículo que no es el suyo, y eso sigue
 * prohibido tenga la biblioteca los archivos que tenga.</p>
 */
const MOTO_SEMBRADA = { placa: 'TEST01', descripcion: 'sembrado MOTORCYCLE con modelo de automóvil' };

const TAMANOS = [
  { nombre: 'móvil estándar', width: 390, height: 844, movil: true },
  { nombre: 'laptop', width: 1280, height: 800, movil: false },
];

let fallos = 0;
let pasadas = 0;
const ok = (cond, texto, detalle) => {
  if (cond) { pasadas += 1; } else { fallos += 1; console.log(`  ✗   ${texto}${detalle ? ' — ' + detalle : ''}`); }
};

/**
 * Un PNG de color plano, escrito a mano: sin dependencias y sin binario guardado en el repositorio.
 *
 * <p>Magenta, un color que no existe en la paleta de la aplicación: si alguna vez aparece en una
 * captura se sabe al instante que es de una prueba y no un activo.</p>
 */
function pngPlano(ancho, alto, [r, g, b]) {
  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // 8 bits por canal
  ihdr[9] = 2;   // color verdadero, sin alfa
  const fila = Buffer.concat([Buffer.from([0]),
    Buffer.concat(Array.from({ length: ancho }, () => Buffer.from([r, g, b])))]);
  const bruto = Buffer.concat(Array.from({ length: alto }, () => fila));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(bruto)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

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
  const hijo = spawn('npm',
    ['run', 'dev', '--workspace=@luparx/citizen', '--', '--port', String(PUERTO), '--strictPort', 'false'], {
      cwd: RAIZ, detached: true, env: { ...process.env, VITE_USE_MOCKS: 'true', VITE_BASE_PATH: '/' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  for (let i = 0; i < 90; i += 1) {
    if (await puertoOcupado(PUERTO)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return async () => { try { process.kill(-hijo.pid, 'SIGTERM'); } catch { /* ya no está */ } };
}

/** Lo que se puede saber de cada hueco de vehículo de la pantalla, medido en el navegador. */
const AUDITAR = () => {
  const huecos = [...document.querySelectorAll('.lx-vehicle-thumb')].map((m) => {
    const caja = m.getBoundingClientRect();
    const img = m.querySelector('img');
    const svg = m.querySelector('svg');
    const dentro = img || svg;
    const cajaDentro = dentro ? dentro.getBoundingClientRect() : null;
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
    const placa = hermano ? (hermano.textContent || '').trim() : null;
    const cajaPlaca = hermano ? hermano.getBoundingClientRect() : null;
    return {
      placa,
      tiene: img ? 'foto' : (svg ? 'dibujo' : 'nada'),
      src: img ? img.currentSrc || img.src : null,
      cargo: img ? img.naturalWidth > 0 && img.naturalHeight > 0 : null,
      perezosa: img ? img.getAttribute('loading') : null,
      decodificacion: img ? img.getAttribute('decoding') : null,
      alto: Math.round(caja.height * 10) / 10,
      ancho: Math.round(caja.width * 10) / 10,
      cabe: cajaDentro
        ? cajaDentro.width <= caja.width + 1 && cajaDentro.height <= caja.height + 1
          && cajaDentro.width > 0 && cajaDentro.height > 0
        : false,
      solapaPlaca: cajaPlaca
        ? cajaPlaca.left < caja.right - 1 && cajaPlaca.right > caja.left + 1
          && cajaPlaca.top < caja.bottom - 1 && cajaPlaca.bottom > caja.top + 1
        : false,
      placaRecortada: hermano ? hermano.scrollWidth > hermano.clientWidth + 1 : false,
    };
  });
  return { huecos, desbordeH: document.documentElement.scrollWidth - window.innerWidth };
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

async function irAVehiculos(page) {
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  // Las imágenes son perezosas: hay que llegar a verlas para que se descarguen.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

(async () => {
  // 1 · El instrumento. Se crea ANTES del servidor para que el catálogo lo tenga.
  fs.mkdirSync(CON_LICENCIA, { recursive: true });
  fs.writeFileSync(FIXTURE, pngPlano(160, 120, [255, 0, 170]));
  console.log(`\n·· foto con licencia de prueba: ${path.basename(FIXTURE)} (${fs.statSync(FIXTURE).size} bytes)`);

  let apagar = async () => {};
  let browser = null;
  try {
    if (await puertoOcupado(PUERTO)) {
      console.log(`  ✗   el puerto ${PUERTO} está ocupado: hay que bajar ese proceso antes de medir`);
      fallos += 1;
    } else {
      apagar = await levantar();
      browser = await chromium.launch({ executablePath: EJECUTABLE, args: ['--no-sandbox'] });

      for (const tam of TAMANOS) {
        console.log(`\n══ ${tam.nombre} (${tam.width}×${tam.height}) ══`);
        const ctx = await browser.newContext({
          viewport: { width: tam.width, height: tam.height }, locale: 'es-CR',
          hasTouch: Boolean(tam.movil), isMobile: Boolean(tam.movil),
        });
        const page = await ctx.newPage();

        /*
          Sólo las descargas de tipo imagen. En desarrollo el empaquetador sirve además un módulo
          JavaScript con la MISMA ruta y `?import&url` que no es la imagen sino la cadena con su
          dirección; contarlo sería contar dos veces, y en producción ese módulo no existe.
        */
        const pedidas = [];
        page.on('request', (r) => {
          if (r.resourceType() === 'image' && /vehicleImages/.test(r.url())) pedidas.push(r.url());
        });
        await page.route('**/*', (r) => {
          const u = r.request().url();
          return (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
        });

        await entrar(page);
        await irAVehiculos(page);

        const { huecos, desbordeH } = await page.evaluate(AUDITAR);
        const porPlaca = (p) => huecos.find((h) => h.placa === p);

        console.log(`  ·· placas vistas: ${huecos.map((h) => h.placa).filter(Boolean).join(', ') || '(ninguna)'}`);

        // 2 · El escalón 1 gana: la foto con licencia, no la de prototipo.
        const licenciado = porPlaca(CON_FOTO_LICENCIADA);
        ok(Boolean(licenciado), `${tam.nombre}: aparece la fila de ${CON_FOTO_LICENCIADA}`);
        if (licenciado) {
          ok(licenciado.tiene === 'foto', `${tam.nombre}: ${CON_FOTO_LICENCIADA} muestra una fotografía`,
            `muestra «${licenciado.tiene}»`);
          ok(/toyota__rav4/.test(licenciado.src || ''),
            `${tam.nombre}: la foto CON LICENCIA gana sobre la de prototipo`,
            String(licenciado.src));
          ok(!/suv-compacta/.test(licenciado.src || ''),
            `${tam.nombre}: y no se usó la de prototipo teniendo la del modelo`, String(licenciado.src));
          // Lo que separa «hay un <img>» de «se ve la imagen»: un roto también es un <img>.
          ok(licenciado.cargo === true, `${tam.nombre}: la foto con licencia cargó de verdad`,
            'naturalWidth es 0: el archivo no llegó o no se pudo decodificar');
        }

        /*
          3 · El escalón 2: cada vehículo con SU carrocería y SU color, no con la de otro. Es la
          comprobación que justifica el arnés: un Yaris gris con la imagen de la SUV blanca pasaría
          cualquier prueba que sólo exigiera «hay una imagen».
        */
        for (const v of SEMBRADOS) {
          if (v.placa === CON_FOTO_LICENCIADA) continue;
          const h = porPlaca(v.placa);
          ok(Boolean(h), `${tam.nombre}: aparece la fila de ${v.placa}`);
          if (!h) continue;
          ok(h.tiene === 'foto', `${tam.nombre}: ${v.placa} (${v.descripcion}) muestra la imagen de prototipo`,
            `muestra «${h.tiene}»`);
          ok(new RegExp(v.clave).test(h.src || ''),
            `${tam.nombre}: ${v.placa} usa «${v.clave}» y no la imagen de otro vehículo`,
            String(h.src));
          ok(h.cargo === true, `${tam.nombre}: la imagen de ${v.placa} cargó de verdad`);
        }

        /*
          3b · El tipo del servidor gana sobre la tabla de modelos. `TEST01` dice Toyota Corolla
          —que la tabla conoce como sedán— pero el servidor lo declaró MOTORCYCLE, así que no
          puede terminar con la foto de un sedán ni con ninguna otra de automóvil.
        */
        const moto = porPlaca(MOTO_SEMBRADA.placa);
        ok(Boolean(moto), `${tam.nombre}: aparece la fila de ${MOTO_SEMBRADA.placa}`);
        if (moto) {
          const nombreArchivo = (moto.src || '').split('/').pop() || '';
          ok(moto.tiene === 'dibujo' || /^moto-/.test(nombreArchivo),
            `${tam.nombre}: ${MOTO_SEMBRADA.placa} (${MOTO_SEMBRADA.descripcion}) recibe dibujo o un archivo «moto-», nunca un automóvil`,
            `muestra «${moto.tiene}»${moto.src ? ' → ' + moto.src : ''}`);
          ok(moto.cabe, `${tam.nombre}: la imagen de ${MOTO_SEMBRADA.placa} entra en su hueco`);
          const esperado = Math.round(moto.alto * 2);
          ok(Math.abs(moto.ancho - esperado) <= 1,
            `${tam.nombre}: ocupa el MISMO hueco 2:1 que cualquier otra fila`,
            `${moto.ancho}×${moto.alto}, se esperaba ancho ${esperado}`);
        }

        // 4 · Lo que vale para todas las fotos de la pantalla.
        for (const h of huecos.filter((x) => x.tiene === 'foto' && x.placa)) {
          ok(h.perezosa === 'lazy', `${tam.nombre}: ${h.placa} se descarga perezosa`, String(h.perezosa));
          ok(h.decodificacion === 'async', `${tam.nombre}: ${h.placa} se decodifica sin bloquear`,
            String(h.decodificacion));
          const esperado = Math.round(h.alto * 2);
          ok(Math.abs(h.ancho - esperado) <= 1, `${tam.nombre}: el hueco de ${h.placa} mantiene 2:1`,
            `${h.ancho}×${h.alto}, se esperaba ancho ${esperado}`);
          ok(h.cabe, `${tam.nombre}: la imagen de ${h.placa} entra en su hueco sin desbordarlo`);
          ok(!h.solapaPlaca, `${tam.nombre}: la imagen no se solapa con la placa ${h.placa}`);
          ok(!h.placaRecortada, `${tam.nombre}: la placa ${h.placa} no sale recortada`);
        }

        ok(desbordeH <= 1, `${tam.nombre}: la página no se sale de lado`, `${desbordeH}px`);

        const unicas = [...new Set(pedidas)];
        ok(unicas.length <= huecos.length,
          `${tam.nombre}: no se descarga más de una imagen por vehículo`,
          `${unicas.length} imágenes para ${huecos.length} huecos`);

        /*
          5 · Y si el archivo se va —borrado, movido, bloqueado por la red—, la fila no se queda con
          un roto: el `onError` baja un escalón. Se corta sólo la IMAGEN: con la misma ruta viaja,
          en desarrollo, el módulo que lleva su dirección, y tumbarlo rompería la aplicación entera
          en vez de probar el respaldo.
        */
        await page.route('**/vehicleImages/**', (r) => (
          r.request().resourceType() === 'image' ? r.abort() : r.continue()
        ));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2600);
        if (!/\/vehicles/.test(page.url())) { await entrar(page); }
        await irAVehiculos(page);
        const tras = await page.evaluate(AUDITAR);
        const rotos = tras.huecos.filter((h) => h.placa && h.tiene !== 'dibujo');
        ok(rotos.length === 0,
          `${tam.nombre}: sin ninguna imagen, TODAS las filas vuelven al dibujo`,
          rotos.map((h) => `${h.placa}:${h.tiene}`).join(', '));
        ok(tras.desbordeH <= 1, `${tam.nombre}: tras el fallo la página sigue sin salirse de lado`,
          `${tras.desbordeH}px`);

        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await apagar();
    // 6 · Se retira el instrumento, pase lo que pase.
    try { fs.unlinkSync(FIXTURE); } catch { /* ya no estaba */ }
    ok(!fs.existsSync(FIXTURE), 'la foto de prueba quedó borrada al terminar', `todavía está en ${FIXTURE}`);
  }

  console.log(`\n${pasadas + fallos} comprobaciones · ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  try { fs.unlinkSync(FIXTURE); } catch { /* ya no estaba */ }
  console.error('ERR', e.message);
  process.exit(1);
});
