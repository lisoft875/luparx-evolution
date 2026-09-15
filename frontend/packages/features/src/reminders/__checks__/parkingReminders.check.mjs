/**
 * Rules check for the parking reminder reconciliation.
 *
 * <h2>Why a script and not a test file</h2>
 *
 * This monorepo has no test runner on the front end yet — no vitest, no jest, no `npm test`. Adding
 * one is a decision with consequences for every package (config, CI time, a matcher vocabulary the
 * whole team then writes against) and it is not this feature's to make. What IS this feature's
 * responsibility is not shipping untested reconciliation rules, because they are the kind that fail
 * silently: an alarm that never fires looks exactly like an alarm nobody needed.
 *
 * So the rules are checked here with `node:assert` and no dependencies. From `frontend/`:
 *
 *   node packages/features/src/reminders/__checks__/parkingReminders.check.mjs
 *
 * It compiles the module itself into a temporary directory, using the TypeScript that every package
 * here already depends on. esbuild would be faster and was the first attempt; it installs a
 * platform-specific binary, so it breaks the moment the same checkout is used from a Mac and from a
 * Linux container, which is exactly how this repository is worked on.
 *
 * When a runner does arrive, this becomes a test file by rewriting the assertions and deleting this
 * comment. Until then it is the executable record of what the rules promise.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'parkingReminders.ts');
const outDir = mkdtempSync(join(tmpdir(), 'luparx-reminders-'));

execFileSync(
  'npx',
  ['tsc', source, '--outDir', outDir, '--module', 'es2022', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck'],
  { stdio: 'inherit' },
);

const { planParkingReminders, reminderId } = await import(
  pathToFileURL(join(outDir, 'parkingReminders.js')).href
);

const now = new Date('2026-09-15T10:00:00Z');
const sesion = (id, expiresAt) => ({
  id, expiresAt, plateSnapshot: 'BHL019', spaceCode: '1203',
});

// 1. Estadía nueva: se agendan los dos avisos.
let plan = planParkingReminders({
  activeSessions: [sesion('s1', '2026-09-15T11:00:00Z')],
  pending: [], warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 2, 'dos avisos');
assert.deepEqual(plan.schedule.map(r => r.at.toISOString()).sort(),
  ['2026-09-15T10:45:00.000Z', '2026-09-15T11:00:00.000Z']);
console.log('1 ok  estadía nueva agenda aviso previo + vencimiento');

// 2. Idempotencia: ya agendados, no se reagenda nada.
const yaAgendados = plan.schedule.map(r => ({ id: r.id, at: r.at }));
plan = planParkingReminders({
  activeSessions: [sesion('s1', '2026-09-15T11:00:00Z')],
  pending: yaAgendados, warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 0, 'nada que reagendar');
assert.equal(plan.cancelIds.length, 0, 'nada que cancelar');
console.log('2 ok  no reagenda lo que ya está');

// 3. EXTENSIÓN: mismo id, otra hora → hay que reescribir.
plan = planParkingReminders({
  activeSessions: [sesion('s1', '2026-09-15T12:00:00Z')],
  pending: yaAgendados, warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 2, 'los dos se reescriben tras extender');
assert.deepEqual(plan.schedule.map(r => r.at.toISOString()).sort(),
  ['2026-09-15T11:45:00.000Z', '2026-09-15T12:00:00.000Z']);
console.log('3 ok  extender reescribe la hora (el bug que motivó todo)');

// 4. Terminada antes: se cancelan los avisos huérfanos.
plan = planParkingReminders({
  activeSessions: [], pending: yaAgendados, warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 0);
assert.deepEqual(plan.cancelIds.sort(), yaAgendados.map(r => r.id).sort());
console.log('4 ok  estadía terminada cancela sus avisos');

// 5. Estadía más corta que la ventana de aviso: no suena "le quedan 15" al pagar.
plan = planParkingReminders({
  activeSessions: [sesion('s2', '2026-09-15T10:10:00Z')],
  pending: [], warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 1, 'sólo el de vencimiento');
assert.equal(plan.schedule[0].kind, 'EXPIRED');
console.log('5 ok  no agenda avisos en el pasado');

// 6. Municipalidad que no avisa antes (0): sólo el vencimiento.
plan = planParkingReminders({
  activeSessions: [sesion('s3', '2026-09-15T11:00:00Z')],
  pending: [], warningBeforeMinutes: 0, now,
});
assert.equal(plan.schedule.length, 1);
assert.equal(plan.schedule[0].kind, 'EXPIRED');
console.log('6 ok  warningBeforeMinutes=0 desactiva el aviso previo');

// 7. expiresAt inválido no tumba al resto.
plan = planParkingReminders({
  activeSessions: [sesion('malo', 'no-es-fecha'), sesion('s4', '2026-09-15T11:00:00Z')],
  pending: [], warningBeforeMinutes: 15, now,
});
assert.equal(plan.schedule.length, 2, 'la sesión sana igual se agenda');
console.log('7 ok  una fecha corrupta no arrastra a las demás');

// 8. Ids deterministas, positivos y de 31 bits.
const id = reminderId('11111111-2222-3333-4444-555555555555', 'EXPIRING');
assert.equal(id, reminderId('11111111-2222-3333-4444-555555555555', 'EXPIRING'));
assert.notEqual(id, reminderId('11111111-2222-3333-4444-555555555555', 'EXPIRED'));
assert.ok(id > 0 && id <= 0x7fffffff, 'cabe en un int de Android');
console.log('8 ok  ids deterministas, positivos, 31 bits');

// 9. Varias estadías a la vez, cada una con sus ids.
plan = planParkingReminders({
  activeSessions: [sesion('a', '2026-09-15T11:00:00Z'), sesion('b', '2026-09-15T12:00:00Z')],
  pending: [], warningBeforeMinutes: 15, now,
});
assert.equal(new Set(plan.schedule.map(r => r.id)).size, 4, 'cuatro ids distintos');
console.log('9 ok  dos estadías simultáneas no se pisan');

console.log('\nTodas las reglas pasan.');
