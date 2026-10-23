/**
 * La regla «¿hay mapa?», comprobada sin navegador.
 *
 * <h2>Qué fija, y de qué defecto viene</h2>
 *
 * <p>El 23-10-2026 Javier fotografió en staging la pantalla «¡Listo!»: un botón que decía «Ocultar
 * el mapa» y ningún mapa debajo. El botón guardaba la intención de la persona y el componente
 * decidía aparte si dibujaba; cuando las dos no coincidían, el rótulo mentía.</p>
 *
 * <p>Desde entonces la pregunta es UNA, vive en `disponibilidad.ts`, y la usan los dos. Acá se
 * fija su tabla de verdad completa, y además que la copia de la lectura del proveedor no se separe
 * en silencio de la de `estiloOscuro.ts` — porque son dos copias a propósito, para no arrastrar el
 * mapa al paquete inicial, y dos copias que se separan son un defecto esperando fecha.</p>
 *
 *   node packages/ui/src/map/__checks__/disponibilidad.check.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../../..', import.meta.url).pathname;

let fallos = 0;
const ok = (cond, msg, detalle = '') => {
  if (cond) console.log(`  ok  ${msg}`);
  else { fallos += 1; console.log(`  ✗   ${msg}${detalle ? ' — ' + detalle : ''}`); }
};

// --- 1. La tabla de verdad -----------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'disponibilidad-'));
let sePuedeDibujarElMapa;
try {
  execFileSync(
    join(raiz, 'node_modules/.bin/tsc'),
    ['--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
      '--skipLibCheck', '--outDir', dir,
      join(raiz, 'packages/ui/src/map/disponibilidad.ts')],
    { stdio: 'pipe' },
  );
  ({ sePuedeDibujarElMapa } = await import(join(dir, 'disponibilidad.js')));
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || '') || e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

console.log('\n── Cuándo hay mapa ──');

ok(sePuedeDibujarElMapa({ estiloConfigurado: true, hayGeometrias: true }) === true,
  'con proveedor y polígonos: se dibuja, encuadrado en ellos');
ok(sePuedeDibujarElMapa({ estiloConfigurado: true, hayGeometrias: false, hayCentro: true }) === true,
  'con proveedor y centro, SIN polígonos: se dibuja el mapa base — la corrección del 23-10');
ok(sePuedeDibujarElMapa({ estiloConfigurado: true, hayGeometrias: false }) === false,
  'con proveedor pero sin polígonos ni centro: NO se dibuja, porque no hay dónde centrarlo');
ok(sePuedeDibujarElMapa({ estiloConfigurado: true, hayGeometrias: false, hayCentro: false }) === false,
  'y un centro explícitamente ausente cuenta igual que no pasarlo');

/*
  Sin proveedor no hay mapa POR MUCHOS polígonos que lleguen. Esto es lo que impide la tentación
  de «si hay geometrías ya está»: sin estilo, MapLibre no tiene qué dibujar debajo.
*/
ok(sePuedeDibujarElMapa({ estiloConfigurado: false, hayGeometrias: true }) === false,
  'sin proveedor no hay mapa, aunque lleguen polígonos');
ok(sePuedeDibujarElMapa({ estiloConfigurado: false, hayGeometrias: true, hayCentro: true }) === false,
  'ni con polígonos y centro a la vez');
ok(sePuedeDibujarElMapa({ estiloConfigurado: false, hayGeometrias: false }) === false,
  'ni, obviamente, sin nada');

rmSync(dir, { recursive: true, force: true });

// --- 2. Las dos lecturas del proveedor no se separan ----------------------------------------
console.log('\n── Las dos copias de la lectura del proveedor ──');

const disponibilidad = readFileSync(join(raiz, 'packages/ui/src/map/disponibilidad.ts'), 'utf8');
const estiloOscuro = readFileSync(join(raiz, 'packages/ui/src/map/estiloOscuro.ts'), 'utf8');

for (const [nombre, texto] of [['disponibilidad.ts', disponibilidad], ['estiloOscuro.ts', estiloOscuro]]) {
  ok(texto.includes('VITE_MAP_STYLE_URL'),
    `${nombre} lee VITE_MAP_STYLE_URL`);
  ok(/\.trim\(\)/.test(texto),
    `${nombre} recorta los espacios: una variable con un espacio no es un proveedor`);
  ok(/protocol === 'https:'/.test(texto),
    `${nombre} exige https: es lo único que este componente le pide a un tercero`);
}

/*
  Y que nadie «arregle» la duplicación importando estiloOscuro desde disponibilidad: eso traería
  `oscurecer` y la paleta al paquete inicial del ciudadano, que es justo lo que este archivo evita.
  La duplicación es la decisión; esta comprobación es su precio.
*/
ok(!/from '\.\/estiloOscuro'/.test(disponibilidad),
  'disponibilidad.ts NO importa estiloOscuro: por eso se puede preguntar sin pagar el mapa');

// --- 3. El proveedor se diagnostica ANTES que la falta de zonas -----------------------------
console.log('\n── El orden del diagnóstico ──');

const zoneMap = readFileSync(join(raiz, 'packages/ui/src/map/ZoneMap.tsx'), 'utf8');
const cuerpo = zoneMap.slice(zoneMap.indexOf('let cuerpo: React.JSX.Element | null;'));
const posProveedor = cuerpo.indexOf('textos.sinProveedor');
const posSinZonas = cuerpo.indexOf('!hayQueDibujar && !hayCentro');
/*
  Hasta el 23-10 el orden era el contrario, y un portal compilado sin MAP_STYLE_URL —que es lo que
  pasa si el despliegue no define la variable, porque el compose la deja vacía por omisión— decía
  «esta municipalidad todavía no tiene zonas». Dos problemas distintos, dos responsables distintos:
  uno lo arregla quien despliega, el otro la municipalidad. El orden es la diferencia entre mandar
  a alguien a revisar una variable de entorno o a levantar perímetros con el catastro.
*/
ok(posProveedor !== -1 && posSinZonas !== -1 && posProveedor < posSinZonas,
  'falta de proveedor se dice ANTES que falta de zonas: no son el mismo problema',
  `proveedor en ${posProveedor}, sin-zonas en ${posSinZonas}`);

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
