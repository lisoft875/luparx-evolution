// Comprobaciones del final de la cola: qué error deja de reintentar y qué error sigue reintentando.
//
//   cd ~/Development/Proyectos/luparx-evolution/frontend
//   node apps/inspector/src/lib/__checks__/citationQueueTerminal.check.mjs
//
// Por qué existe. `send()` lanza `new Error('EVIDENCE_BYTES_MISSING')` cuando los bytes de la
// fotografía ya no están en el aparato. Ese error NO es un `ApiError`, de modo que `describe()` lo
// aplanaba a `UNKNOWN_ERROR`, que no está en `TERMINAL_CODES`: la fila reintentaba con espera
// exponencial contra un fallo que ningún reintento puede arreglar. Añadir el código a
// `TERMINAL_CODES` no bastaba, porque el código no llegaba nunca a compararse.
//
// Qué prueba y qué no. La decisión se transcribe aquí en JavaScript plano —es la convención de
// `__checks__` en este repositorio, que corre con `node` y sin empaquetador— y además se LEE el
// archivo real para exigir que las tres piezas sigan estando donde la transcripción supone. Si
// alguien quita `CODIGOS_PROPIOS`, o saca el código de `TERMINAL_CODES`, o deja de comprobarlo en
// `describe`, esta comprobación falla. Lo que no prueba es el módulo compilado corriendo en un
// navegador: eso le toca al arnés de Playwright.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = readFileSync(resolve(AQUI, '../citationQueue.ts'), 'utf8');

let fallos = 0;
const ok = (c, m) => { if (!c) { console.log('  FALLA:', m); fallos += 1; } else console.log('  ok  ', m); };

// ── Lo que el archivo real tiene que seguir diciendo ──────────────────────────────────────────
console.log('el archivo real');
ok(/const CODIGOS_PROPIOS = new Set\(\['EVIDENCE_BYTES_MISSING'\]\)/.test(FUENTE),
   'CODIGOS_PROPIOS existe y nombra EVIDENCE_BYTES_MISSING');
ok(/CODIGOS_PROPIOS\.has\(error\.message\)/.test(FUENTE),
   'describe() compara el mensaje del Error contra esa lista');
ok(/TERMINAL_CODES = new Set\(\[[\s\S]*?'EVIDENCE_BYTES_MISSING',[\s\S]*?\]\)/.test(FUENTE),
   'EVIDENCE_BYTES_MISSING sigue dentro de TERMINAL_CODES');
ok(/throw new Error\('EVIDENCE_BYTES_MISSING'\)/.test(FUENTE),
   'y send() sigue lanzándolo cuando getPhoto() no devuelve bytes');
ok(/nextAttemptAt: terminal \? Number\.MAX_SAFE_INTEGER :/.test(FUENTE),
   'un error terminal aparca la fila en vez de darle una próxima cita');

// ── La decisión, transcrita ───────────────────────────────────────────────────────────────────
class ApiError extends Error { constructor(code) { super(code); this.code = code; } }
class NetworkError extends Error {}
const CODIGOS_PROPIOS = new Set(['EVIDENCE_BYTES_MISSING']);
const TERMINAL_CODES = new Set([
  'VALIDATION_FAILED', 'INFRACTION_TYPE_NOT_FOUND', 'INFRACTION_TYPE_INACTIVE',
  'PARKING_SPACE_NOT_FOUND', 'EVIDENCE_TYPE_NOT_ALLOWED', 'EVIDENCE_TOO_LARGE',
  'ACCESS_DENIED', 'IDEMPOTENCY_KEY_CONFLICT', 'EVIDENCE_BYTES_MISSING',
]);
const describe = (error) => {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof NetworkError) return { code: 'NETWORK_ERROR', message: error.message };
  if (error instanceof Error && CODIGOS_PROPIOS.has(error.message)) {
    return { code: error.message, message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : String(error) };
};
const esTerminal = (error) => TERMINAL_CODES.has(describe(error).code);
const proximoIntento = (error, intentos) =>
  esTerminal(error) ? Number.MAX_SAFE_INTEGER : Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(intentos, 5));

console.log('\nlos bytes de la fotografía que ya no están');
const sinBytes = new Error('EVIDENCE_BYTES_MISSING');
ok(describe(sinBytes).code === 'EVIDENCE_BYTES_MISSING',
   'conserva su nombre en vez de aplanarse a UNKNOWN_ERROR');
ok(esTerminal(sinBytes), 'y por eso es terminal');
ok(proximoIntento(sinBytes, 1) === Number.MAX_SAFE_INTEGER, 'la fila queda aparcada al primer fallo');
ok(proximoIntento(sinBytes, 40) === Number.MAX_SAFE_INTEGER, 'y sigue aparcada al intento 40: no hay bucle');

console.log('\nel defecto que esto corrige');
const aplanado = (e) => (e instanceof ApiError ? e.code : e instanceof NetworkError ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR');
ok(!TERMINAL_CODES.has(aplanado(sinBytes)),
   'con el código viejo caía en UNKNOWN_ERROR, que NO es terminal — de ahí el reintento infinito');

console.log('\nlo que sí tiene que seguir reintentando');
ok(!esTerminal(new NetworkError('offline')), 'una red caída no es terminal: el acto no se puede tirar a la basura');
ok(!esTerminal(new ApiError('INTERNAL_ERROR')), 'un 5xx tampoco');
ok(!esTerminal(new Error('algo raro')), 'y un error desconocido tampoco: ante la duda, se reintenta');
ok(proximoIntento(new NetworkError('offline'), 0) < Date.now() + 61_000, 'su espera está acotada a un minuto');

console.log('\nlo que ya era terminal y sigue siéndolo');
for (const codigo of ['VALIDATION_FAILED', 'ACCESS_DENIED', 'EVIDENCE_TOO_LARGE', 'IDEMPOTENCY_KEY_CONFLICT']) {
  ok(esTerminal(new ApiError(codigo)), `${codigo} espera a una persona`);
}

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
