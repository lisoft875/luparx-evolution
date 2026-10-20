/**
 * El estado de la estadía en el Inicio: niveles de urgencia y —desde el 19-10-2026— los textos que
 * la pantalla dice sobre una estadía vencida.
 *
 *   node apps/citizen/src/lib/__checks__/sessionUrgency.check.mjs
 *
 * <h2>Por qué compila el TypeScript real</h2>
 *
 * Esta comprobación transcribía la lógica a mano: cuatro líneas de JavaScript que repetían lo que
 * decía `sessionUrgency.ts`. Una prueba contra una transcripción comprueba la transcripción, no el
 * código que se despliega, y el 19-10-2026 se vio para qué sirve esa diferencia: la contradicción
 * del Inicio —«Expirado» y «Estacionamiento activo» a cuatro píxeles— no la habría detectado nunca,
 * porque la copia no sabía nada de títulos. Ahora se compila el archivo real, como ya hacía
 * `packages/ui/src/map/__checks__/zoneGeometry.check.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sessionurgency-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--skipLibCheck', '--outDir', dir,
     join(raiz, 'apps/citizen/src/lib/sessionUrgency.ts')],
    { stdio: 'pipe' },
  );
} catch (e) {
  const salida = String(e.stdout || '') + String(e.stderr || '');
  if (!salida.includes('Cannot find module') && !salida.includes('TS2307')) {
    console.error(salida);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
}

const { urgencyOf, cardToneFor, urgencyMessageKey, homeSessionState } =
  await import(join(dir, 'sessionUrgency.js'));

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos += 1; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

// ---- Los cuatro niveles, que es lo que esta comprobación ya hacía -----------------------------

console.log('\n── Niveles de urgencia ──');
const casos = [
  [3600, 'calm', 'success', null],
  [601, 'calm', 'success', null],
  [600, 'warning', 'warning', 'citizen.home.activeSession.urgency.warning'],
  [301, 'warning', 'warning', 'citizen.home.activeSession.urgency.warning'],
  [300, 'critical', 'warning', 'citizen.home.activeSession.urgency.critical'],
  [1, 'critical', 'warning', 'citizen.home.activeSession.urgency.critical'],
  [0, 'expired', 'danger', null],
  [-5, 'expired', 'danger', null],
];
for (const [segundos, nivelEsperado, tonoEsperado, mensajeEsperado] of casos) {
  const nivel = urgencyOf(segundos);
  const tono = cardToneFor(nivel);
  const mensaje = urgencyMessageKey(nivel);
  ok(
    `${String(segundos).padStart(5)}s → ${nivel} · ${tono} · ${mensaje ?? '(sin texto)'}`,
    nivel === nivelEsperado && tono === tonoEsperado && mensaje === mensajeEsperado,
  );
}

// ---- El estado del Inicio: la contradicción del 19-10 no debe poder representarse --------------

console.log('\n── El estado del Inicio ──');

const estado = (segundos, pasados = 0, gracia = 5, hay = true) =>
  homeSessionState({
    hasSession: hay,
    remainingSeconds: segundos,
    secondsPastExpiry: pasados,
    graceMinutes: gracia,
  });

const vigente = estado(600);
ok('vigente: el título dice activo', vigente.titleKey === 'citizen.home.activeSession.title');
ok('vigente: el saludo dice activo', vigente.subtitleKey === 'citizen.home.subtitle.activeSession');
ok('vigente: «Vence hoy a las …» en futuro', vigente.expiresAtKey === 'citizen.home.activeSession.expiresAt');
ok('vigente: se escribe «tiempo restante»', vigente.showRemainingLabel === true);
ok('vigente: no hay mensaje de vencida', vigente.expiredMessage === null);

const enGracia = estado(0, 60, 5);
ok('vencida en gracia: el título dice vencido', enGracia.titleKey === 'citizen.home.activeSession.titleExpired');
ok('vencida en gracia: el saludo dice vencido', enGracia.subtitleKey === 'citizen.home.subtitle.expiredSession');
ok('vencida en gracia: «Venció hoy a las …» en pasado', enGracia.expiresAtKey === 'citizen.home.activeSession.expiredAt');
ok('vencida en gracia: NO se escribe «tiempo restante»', enGracia.showRemainingLabel === false);
ok('vencida en gracia: se nombra la tolerancia', enGracia.expiredMessage === 'withinGrace');
ok('vencida en gracia: la tarjeta va en rojo', enGracia.tone === 'danger');

ok(
  'la tolerancia termina al cumplirse el último minuto, no después',
  estado(0, 5 * 60 - 1, 5).expiredMessage === 'withinGrace'
    && estado(0, 5 * 60, 5).expiredMessage === 'graceOver',
);

ok(
  'sin tolerancia configurada no se promete ninguna',
  estado(0, 1, 0).expiredMessage === 'graceOver',
);

ok(
  'sin estadía el saludo invita a estacionar y no afirma nada sobre una estadía',
  estado(0, 0, 5, false).subtitleKey === 'citizen.home.subtitle.noSession'
    && estado(0, 0, 5, false).expiredMessage === null,
);

// ---- La invariante, que es el P0 del 19-10 convertido en comprobación --------------------------

console.log('\n── La invariante: el Inicio no puede contradecirse ──');

const combinaciones = [];
for (const segundos of [-600, -1, 0, 1, 299, 300, 599, 600, 601, 3600]) {
  for (const pasados of [0, 1, 299, 300, 301, 3600]) {
    for (const gracia of [0, 1, 5, 10]) {
      combinaciones.push(estado(segundos, pasados, gracia));
    }
  }
}

const tituloDiceVencido = (e) => e.titleKey === 'citizen.home.activeSession.titleExpired';
const saludoDiceVencido = (e) => e.subtitleKey === 'citizen.home.subtitle.expiredSession';

ok(
  `en ${combinaciones.length} combinaciones, el título y el saludo nunca discrepan`,
  combinaciones.every((e) => tituloDiceVencido(e) === saludoDiceVencido(e)),
);
ok(
  'y el verbo de la hora de vencimiento va siempre con ellos',
  combinaciones.every((e) => tituloDiceVencido(e) === (e.expiresAtKey === 'citizen.home.activeSession.expiredAt')),
);
ok(
  'nunca se escribe «tiempo restante» en una estadía vencida',
  combinaciones.every((e) => !(tituloDiceVencido(e) && e.showRemainingLabel)),
);
ok(
  'ni se deja sin mensaje una estadía vencida',
  combinaciones.every((e) => tituloDiceVencido(e) === (e.expiredMessage !== null)),
);
ok(
  'ni se pinta de verde una estadía vencida',
  combinaciones.every((e) => !(tituloDiceVencido(e) && e.tone === 'success')),
);

rmSync(dir, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLOS` : '\ntodas las comprobaciones pasaron');
process.exit(fallos === 0 ? 0 : 1);
