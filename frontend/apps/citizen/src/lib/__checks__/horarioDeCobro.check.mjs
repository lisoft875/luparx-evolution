/**
 * El horario de cobro escrito en una línea — y, sobre todo, cuándo NO se escribe.
 *
 *   node apps/citizen/src/lib/__checks__/horarioDeCobro.check.mjs
 *
 * <h2>Qué protege</h2>
 *
 * <p>La ficha de la zona pide «horario … sólo si está disponible». La trampa está en leer
 * «disponible» como «hay datos»: el servidor SIEMPRE manda siete días con sus franjas, así que
 * siempre hay datos y siempre se podría escribir algo. Lo que hace falta comprobar es lo
 * contrario: que cuando el horario no cabe entero en una línea —franjas distintas por día, pausa
 * de mediodía, un feriado— la función <b>calle</b> en vez de escribir media verdad.</p>
 *
 * <p>Media verdad sobre cuándo se cobra es peor que el silencio: quien lea «7:00–18:00» donde hay
 * una pausa de doce a una vuelve a su carro con una idea equivocada de lo que debe.</p>
 *
 * <p>Compila el TypeScript real, no una transcripción.</p>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'horario-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--skipLibCheck', '--outDir', dir,
     join(raiz, 'apps/citizen/src/lib/horarioDeCobro.ts')],
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

const { horarioDeCobro } = await import(join(dir, 'horarioDeCobro.js'));

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos += 1; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const DIAS = {
  MONDAY: 'Lunes', TUESDAY: 'Martes', WEDNESDAY: 'Miércoles', THURSDAY: 'Jueves',
  FRIDAY: 'Viernes', SATURDAY: 'Sábado', SUNDAY: 'Domingo',
};
const TEXTOS = {
  todoElDia: 'Se cobra a toda hora.',
  nunca: 'No se cobra ningún día.',
  corrido: ({ desde, hasta, inicio, fin }) => `${desde} a ${hasta}, ${inicio}–${fin}`,
  unDia: ({ dia, inicio, fin }) => `${dia}, ${inicio}–${fin}`,
  dias: DIAS,
  conFeriados: ({ base }) => `${base} · salvo feriados`,
};

const franja = (desdeMin, hastaMin) => ({
  startMinute: desdeMin, endMinute: hastaMin, startsAt: '', endsAt: '',
});
const semana = (mapa) => Object.keys(DIAS).map((weekday) => ({
  weekday, bands: mapa[weekday] ?? [],
}));
const horario = (extra) => ({
  timeZone: 'America/Costa_Rica',
  chargesAllDay: false,
  week: semana({}),
  exceptions: [],
  chargingNow: true,
  nextChargingStartsAt: null,
  ...extra,
});

const LAB = { MONDAY: [franja(420, 1080)], TUESDAY: [franja(420, 1080)], WEDNESDAY: [franja(420, 1080)],
  THURSDAY: [franja(420, 1080)], FRIDAY: [franja(420, 1080)], SATURDAY: [franja(420, 1080)] };

console.log('\n── Lo que sí se puede decir ──');
ok('sin horario no hay línea', horarioDeCobro(undefined, TEXTOS) === undefined);
ok('a toda hora se dice con su frase',
  horarioDeCobro(horario({ chargesAllDay: true }), TEXTOS) === TEXTOS.todoElDia);
ok('lunes a sábado, 7:00–18:00, es un tramo corrido',
  horarioDeCobro(horario({ week: semana(LAB) }), TEXTOS) === 'Lunes a Sábado, 7:00–18:00',
  String(horarioDeCobro(horario({ week: semana(LAB) }), TEXTOS)));
ok('un solo día se dice sin «a»',
  horarioDeCobro(horario({ week: semana({ SUNDAY: [franja(480, 840)] }) }), TEXTOS)
    === 'Domingo, 8:00–14:00',
  String(horarioDeCobro(horario({ week: semana({ SUNDAY: [franja(480, 840)] }) }), TEXTOS)));
ok('una semana sin ninguna franja dice que no se cobra',
  horarioDeCobro(horario({}), TEXTOS) === TEXTOS.nunca);
ok('los minutos se escriben con dos cifras',
  horarioDeCobro(horario({ week: semana({ MONDAY: [franja(425, 1085)] }) }), TEXTOS)
    === 'Lunes, 7:05–18:05',
  String(horarioDeCobro(horario({ week: semana({ MONDAY: [franja(425, 1085)] }) }), TEXTOS)));

console.log('\n── Lo que hay que callar ──');
ok('con pausa de mediodía NO se escribe una franja corrida',
  horarioDeCobro(horario({
    week: semana({ MONDAY: [franja(420, 720), franja(780, 1080)] }),
  }), TEXTOS) === undefined);
ok('con franjas distintas por día tampoco',
  horarioDeCobro(horario({
    week: semana({ MONDAY: [franja(420, 1080)], TUESDAY: [franja(480, 1020)] }),
  }), TEXTOS) === undefined);
ok('con días salteados tampoco: «lunes, miércoles y sábado» no es un tramo',
  horarioDeCobro(horario({
    week: semana({ MONDAY: [franja(420, 1080)], WEDNESDAY: [franja(420, 1080)],
      SATURDAY: [franja(420, 1080)] }),
  }), TEXTOS) === undefined);
/*
  Los feriados NO borran la línea.

  El primer intento la callaba en cuanto la municipalidad tuviera una excepción configurada, y eso
  la hacía desaparecer prácticamente siempre: cualquier municipalidad de Costa Rica tiene el 15 de
  setiembre cargado. Lo que es cierto los 365 días del año es «esto rige, salvo feriados», y eso es
  lo que tiene que decir. Lo que NO se hace es detallar cuáles: eso pediría evaluar fechas y
  recurrencias en el cliente, y equivocarse ahí es decirle a alguien que hoy no se cobra.
*/
ok('con feriados configurados la línea se escribe, matizada',
  horarioDeCobro(horario({
    week: semana(LAB),
    exceptions: [{ date: '2026-12-25', bands: [] }],
  }), TEXTOS) === 'Lunes a Sábado, 7:00–18:00 · salvo feriados',
  String(horarioDeCobro(horario({ week: semana(LAB), exceptions: [{ date: '2026-12-25', bands: [] }] }), TEXTOS)));
ok('y sin feriados no se le cuelga el matiz',
  horarioDeCobro(horario({ week: semana(LAB) }), TEXTOS) === 'Lunes a Sábado, 7:00–18:00');
ok('el matiz también alcanza a «a toda hora»',
  horarioDeCobro(horario({ chargesAllDay: true, exceptions: [{ date: '2026-12-25', bands: [] }] }), TEXTOS)
    === 'Se cobra a toda hora. · salvo feriados');
/*
  Y lo que sí sigue callándose: un horario que no cabe entero en una línea. Un feriado se puede
  matizar con tres palabras; una pausa de mediodía no.
*/
ok('con pausa de mediodía se calla aunque haya feriados',
  horarioDeCobro(horario({
    week: semana({ MONDAY: [franja(420, 720), franja(780, 1080)] }),
    exceptions: [{ date: '2026-12-25', bands: [] }],
  }), TEXTOS) === undefined);

console.log('\n── El orden de los días es el de la semana ──');
/*
  El servidor puede mandar los días en cualquier orden. Si la función tomara el primero que llega
  como principio del tramo, un servidor que empiece por domingo diría «Domingo a Viernes».
*/
const desordenada = semana(LAB).slice().reverse();
ok('un servidor que manda los días al revés sigue dando «Lunes a Sábado»',
  horarioDeCobro(horario({ week: desordenada }), TEXTOS) === 'Lunes a Sábado, 7:00–18:00',
  String(horarioDeCobro(horario({ week: desordenada }), TEXTOS)));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
