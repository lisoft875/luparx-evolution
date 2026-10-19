/**
 * El transporte simulado del repositorio, servido por HTTP de verdad.
 *
 * <p>Por qué existe: con `VITE_USE_MOCKS=true` el simulador se inyecta como `fetchImpl` dentro de
 * la aplicación, así que NINGUNA petición sale al navegador. Eso basta para ver pantallas, pero
 * deja fuera de alcance justo lo que hay que probar de una pantalla que depende de la red —que se
 * pida una sola vez, que el estado de carga se vea, que un 503 lleve al aviso con reintento— y
 * también impide comprobar que no se contacta a ningún tercero.</p>
 *
 * <p>Esto NO es un segundo simulador escrito a mano: envuelve `mockFetch`, el mismo módulo que usa
 * la aplicación, compilado con esbuild. Si el simulador cambia, esto cambia con él.</p>
 *
 * <p>No sustituye a la integración con el backend real: sigue siendo el simulador. Lo que añade es
 * que las peticiones existan como peticiones.</p>
 *
 *   node tests/responsive/servidor-simulado.cjs [puerto]
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.resolve(__dirname, '..', '..');

/** Compila el simulador real a CommonJS y lo carga. */
function cargarSimulador() {
  const esbuild = require(path.join(RAIZ, 'node_modules/esbuild'));
  const salida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'simul-')), 'mocks.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(RAIZ, 'packages/api-client/src/mocks/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: salida,
    logLevel: 'silent',
  });
  // eslint-disable-next-line global-require
  return require(salida).mockFetch;
}

const CABECERAS_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
  'access-control-max-age': '600',
};

function crearServidor(mockFetch) {
  return http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CABECERAS_CORS);
      res.end();
      return;
    }
    const trozos = [];
    req.on('data', (d) => trozos.push(d));
    req.on('end', async () => {
      const cuerpo = Buffer.concat(trozos);
      const cabeceras = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string' && !['host', 'connection', 'content-length'].includes(k)) cabeceras[k] = v;
      }
      try {
        const respuesta = await mockFetch(`http://localhost${req.url}`, {
          method: req.method,
          headers: cabeceras,
          body: cuerpo.length ? cuerpo.toString('utf8') : undefined,
        });
        const salientes = { ...CABECERAS_CORS };
        respuesta.headers.forEach((valor, clave) => { salientes[clave] = valor; });
        const texto = await respuesta.text();
        res.writeHead(respuesta.status, salientes);
        res.end(texto);
      } catch (e) {
        res.writeHead(500, { ...CABECERAS_CORS, 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      }
    });
  });
}

/** Levanta el servidor y devuelve `{ puerto, cerrar }`. */
async function levantarSimulado(puerto) {
  const servidor = crearServidor(cargarSimulador());
  await new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, '127.0.0.1', resolve);
  });
  return {
    puerto: servidor.address().port,
    cerrar: () => new Promise((r) => servidor.close(r)),
  };
}

module.exports = { levantarSimulado };

if (require.main === module) {
  const puerto = Number(process.argv[2] || 5190);
  levantarSimulado(puerto).then(({ puerto: p }) => {
    console.log(`Transporte simulado por HTTP en http://localhost:${p}`);
  });
}
