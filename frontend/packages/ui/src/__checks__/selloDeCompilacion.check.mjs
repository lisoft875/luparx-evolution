/**
 * El sello de compilación, y sobre todo la regla que no se puede romper: en producción no existe.
 *
 *   node packages/ui/src/__checks__/selloDeCompilacion.check.mjs
 *
 * <h2>Qué protege</h2>
 *
 * <p>El sello se pidió «para los demos; para prod lo tenemos que borrar». Borrarlo a mano es lo
 * que se olvida, así que no se borra: no se dibuja. Esta comprobación existe para que esa promesa
 * siga siendo cierta cuando alguien agregue un entorno, cambie un nombre o invierta una condición
 * — y para que, si se rompe, se rompa acá y no delante de un ciudadano.</p>
 *
 * <p>Compila el TypeScript real, no una transcripción.</p>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sello-'));
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
     '--skipLibCheck', '--outDir', dir,
     join(raiz, 'packages/ui/src/selloDeCompilacion.ts')],
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

const { seMuestraElSello, consecutivoDeCompilacion, selloLegible, ENTORNOS_CON_SELLO } =
  await import(join(dir, 'selloDeCompilacion.js'));

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  if (cond) console.log(`  ok  ${nombre}`);
  else { fallos += 1; console.log(`  ✗   ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};

const AHORA = '2026-10-23T14:32:07.000Z';

console.log('\n── En producción NO se dibuja ──');
/*
  La lista de los que NO pueden mostrarlo incluye a propósito las formas en que alguien escribiría
  «producción» mal, y las formas en que la variable puede llegar sin llegar: con una lista de
  prohibidos, cada una de éstas caería del lado de mostrar.
*/
for (const entorno of ['production', 'produccion', 'producción', 'prod', 'PRODUCTION', 'Prod',
  'pro', 'live', 'main', '', ' ', null, undefined, 0, false, {}, []]) {
  ok(`«${String(entorno)}» no muestra sello`, seMuestraElSello(entorno) === false);
}

console.log('\n── Dónde sí ──');
for (const entorno of ENTORNOS_CON_SELLO) {
  ok(`«${entorno}» muestra sello`, seMuestraElSello(entorno) === true);
}
ok('no importan las mayúsculas ni los espacios', seMuestraElSello('  STAGING ') === true);
/*
  La lista es de PERMITIDOS, y esto lo deja escrito: si alguien la convierte en una lista de
  prohibidos —«todo menos production»— esta comprobación cae, porque un nombre inventado pasaría.
*/
ok('un entorno que nadie declaró no se muestra: la lista es de permitidos',
  seMuestraElSello('un-entorno-nuevo-que-nadie-previo') === false);
ok('producción no está en la lista', ENTORNOS_CON_SELLO.includes('production') === false);

console.log('\n── El consecutivo ──');
const c = consecutivoDeCompilacion(AHORA);
ok('tiene la forma AAAAMMDD-hhmm', /^\d{8}-\d{4}$/.test(String(c)), String(c));
ok('un instante posterior da un consecutivo mayor',
  String(consecutivoDeCompilacion('2026-10-23T15:00:00.000Z')) > String(c),
  `${consecutivoDeCompilacion('2026-10-23T15:00:00.000Z')} contra ${c}`);
ok('ordena entre días, no sólo entre horas',
  String(consecutivoDeCompilacion('2026-11-01T00:05:00.000Z'))
    > String(consecutivoDeCompilacion('2026-10-31T23:55:00.000Z')));
/*
  Un consecutivo inventado es peor que ninguno: se compara con otro y se saca una conclusión falsa
  sobre si el despliegue salió.
*/
for (const malo of [null, undefined, '', '   ', 'ayer', '2026-13-45T99:99:99Z', 42]) {
  ok(`«${String(malo)}» no produce consecutivo`, consecutivoDeCompilacion(malo) === null);
}

console.log('\n── El sello completo ──');
ok('en producción no hay sello aunque la fecha sea válida',
  selloLegible('production', AHORA, 'e584fe4') === null);
ok('sin fecha legible no hay sello aunque el entorno lo permita',
  selloLegible('staging', 'ayer', 'e584fe4') === null);
const s = selloLegible('staging', AHORA, 'e584fe4');
ok('en staging hay sello', s !== null);
ok('lleva el commit tal cual', s.commit === 'e584fe4', String(s && s.commit));
ok('y el entorno normalizado', s.entorno === 'staging');
/*
  El commit puede faltar —un build a mano no lo sabe— y el sello NO desaparece por eso: la hora
  sola ya contesta «el despliegue corrió», que es la mitad del trabajo.
*/
for (const sin of [null, undefined, '', '   ']) {
  const t = selloLegible('staging', AHORA, sin);
  ok(`sin commit («${String(sin)}») el sello sigue estando, sin commit`,
    t !== null && t.commit === null);
}

console.log('\n── El componente no puede dibujar lo que la lógica niega ──');
/*
  La comprobación barata que atrapa el refactor descuidado: que el componente siga decidiendo con
  `selloLegible` y no con una condición escrita a mano al lado.
*/
const componente = readFileSync(
  join(raiz, 'packages/ui/src/components/SelloDeCompilacion.tsx'), 'utf8');
ok('el componente decide con selloLegible', /selloLegible\(/.test(componente));
ok('y devuelve null cuando ésta dice que no', /if\s*\(!sello\)\s*return null;/.test(componente));
ok('no hay una lista de entornos escrita aparte dentro del componente',
  !/production|staging/.test(componente.replace(/\/\*[\s\S]*?\*\//g, '')));

rmSync(dir, { recursive: true, force: true });
console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
