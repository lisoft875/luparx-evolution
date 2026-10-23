/**
 * El aviso de posible boleta repetida, comprobado sin navegador.
 *
 * <p>Lo que se protege acá es un equilibrio, no una regla: el aviso tiene que aparecer cuando es
 * probable que sean dos capturas del mismo hecho, y tiene que NO aparecer cuando son dos
 * infracciones de verdad. Equivocarse hacia el segundo lado bloquea multas legítimas, que es lo que
 * la orden del 22-10-2026 prohíbe expresamente, así que las dos mitades se afirman por separado.</p>
 *
 *   node apps/inspector/src/lib/__checks__/posibleDuplicado.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'duplicado-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir,
      join(raiz, 'apps/inspector/src/lib/posibleDuplicado.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  const salida = String(e.stdout || '') + String(e.stderr || '');
  // El módulo importa un TIPO de citationQueue; sin sus dependencias `tsc` se queja de no
  // encontrarlas y aun así emite el JavaScript, que es lo único que esta comprobación necesita.
  if (!salida.includes('Cannot find module') && !salida.includes('TS2307')) {
    console.error(salida);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
}

const { posibleDuplicado, normalizarPlaca, VENTANA_MS } = await import(join(dir, 'posibleDuplicado.js'));

let fallos = 0;
const ok = (cond, msg, detalle) => {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    fallos += 1;
    console.log(`  ✗   ${msg}${detalle ? ` — ${detalle}` : ''}`);
  }
};

const AHORA = Date.parse('2026-10-22T15:00:00Z');
const hace = (minutos) => new Date(AHORA - minutos * 60_000).toISOString();

const fila = (over = {}) => ({
  id: over.id ?? 'f1',
  tenantId: 't1',
  deviceCitationId: 'd1',
  idempotencyKey: 'k1',
  issueIdempotencyKey: 'k2',
  createdAt: over.createdAt ?? hace(3),
  payload: { plate: over.plate ?? 'SJP123', spaceCode: over.spaceCode, infractionTypeId: 'i1' },
  photos: [],
  requiresPhoto: false,
  infractionName: 'Estacionar en zona de carga',
  state: over.state ?? 'PENDING',
  attempts: 0,
  lastErrorCode: null,
  lastErrorMessage: null,
  nextAttemptAt: 0,
  citationId: null,
  number: null,
  status: null,
  sentAt: over.state === 'SENT' ? over.createdAt ?? hace(3) : null,
});

console.log('la placa se compara normalizada');
ok(normalizarPlaca(' sjp-123 ') === 'SJP123', 'minúsculas, guiones y espacios no hacen una placa distinta',
  normalizarPlaca(' sjp-123 '));
ok(posibleDuplicado([fila({ plate: 'SJP123' })], { plate: 'sjp-123' }, AHORA) !== null,
  'así que «sjp-123» encuentra la captura de «SJP123»');

console.log('\ncuándo SÍ avisa');
ok(posibleDuplicado([fila({ state: 'PENDING', createdAt: hace(2) })], { plate: 'SJP123' }, AHORA) !== null,
  'una captura pendiente de hace dos minutos');
ok(posibleDuplicado([fila({ state: 'FAILED', createdAt: hace(90) })], { plate: 'SJP123' }, AHORA) !== null,
  'una pendiente ANTIGUA también: si no salió del aparato, sigue siendo la misma jornada');
ok(posibleDuplicado([fila({ state: 'SENT', createdAt: hace(5) })], { plate: 'SJP123' }, AHORA) !== null,
  'una ya enviada hace cinco minutos');
const conBahia = posibleDuplicado(
  [fila({ spaceCode: '0007' })], { plate: 'SJP123', spaceCode: '0007' }, AHORA);
ok(conBahia?.mismaBahia === true, 'y marca cuando coincide la bahía, que es la señal más fuerte');
ok(posibleDuplicado([fila({ createdAt: hace(7) })], { plate: 'SJP123' }, AHORA)?.minutos === 7,
  'informa los minutos transcurridos, para que la frase sea útil',
  String(posibleDuplicado([fila({ createdAt: hace(7) })], { plate: 'SJP123' }, AHORA)?.minutos));

console.log('\ncuándo NO avisa — la mitad que protege las multas legítimas');
ok(posibleDuplicado([fila({ plate: 'ABC999' })], { plate: 'SJP123' }, AHORA) === null,
  'otra placa no es un duplicado');
ok(posibleDuplicado([fila({ state: 'SENT', createdAt: hace(45) })], { plate: 'SJP123' }, AHORA) === null,
  'una enviada hace 45 minutos no: dos boletas separadas por media hora son dos hechos');
ok(posibleDuplicado([], { plate: 'SJP123' }, AHORA) === null, 'sin capturas previas no hay aviso');
ok(posibleDuplicado([fila()], { plate: '   ' }, AHORA) === null,
  'una placa vacía no dispara nada: el formulario todavía se está escribiendo');
ok(posibleDuplicado([fila({ createdAt: 'no es una fecha' })], { plate: 'SJP123' }, AHORA) === null,
  'una fila con fecha ilegible se ignora en vez de reventar');
ok(posibleDuplicado([fila({ state: 'SENT', createdAt: new Date(AHORA + 60_000).toISOString() })],
  { plate: 'SJP123' }, AHORA) === null,
  'una enviada «en el futuro» —reloj corrido— se ignora en vez de contar minutos negativos');

console.log('\nla ventana es la documentada');
ok(VENTANA_MS === 30 * 60 * 1000, 'media hora, el mismo número que dice el comentario', String(VENTANA_MS));
ok(posibleDuplicado([fila({ state: 'SENT', createdAt: hace(29) })], { plate: 'SJP123' }, AHORA) !== null,
  'a los 29 minutos todavía avisa');
ok(posibleDuplicado([fila({ state: 'SENT', createdAt: hace(31) })], { plate: 'SJP123' }, AHORA) === null,
  'a los 31 ya no');

console.log('\nde varias coincidencias, la más reciente');
const varias = posibleDuplicado(
  [fila({ id: 'vieja', createdAt: hace(20) }), fila({ id: 'nueva', createdAt: hace(2) })],
  { plate: 'SJP123' }, AHORA);
ok(varias?.anterior.id === 'nueva', 'es la que el fiscalizador recuerda', varias?.anterior.id);

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
