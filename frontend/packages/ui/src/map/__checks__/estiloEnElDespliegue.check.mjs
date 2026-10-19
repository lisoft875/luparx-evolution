/**
 * El mapa del ciudadano tiene estilo de teselas EN LA IMAGEN DESPLEGADA, no sólo en `npm run dev`.
 *
 * <p>Qué defecto pin esta comprobación, medido el 17-10-2026: el estilo sale de
 * `VITE_MAP_STYLE_URL` y `estiloOscuro.ts` <b>no tiene valor por omisión</b> —decisión correcta: un
 * mapa sin estilo no debe inventarse uno—. El único lugar donde esa variable existía era
 * `apps/citizen/.env.development`, y `.dockerignore` deja afuera CUALQUIER `.env`. Resultado: la
 * imagen de despliegue nunca vio la variable, el mapa no cargaba en la instancia, y funcionaba
 * perfecto en la laptop. Un síntoma que no apunta a su causa cuesta un día.</p>
 *
 * <p>La cadena tiene cuatro eslabones y basta que se rompa uno para volver al mismo día perdido:
 * el `ARG` del Dockerfile, su paso a `vite build`, el argumento de build del compose, y el valor
 * del entorno de desarrollo. Los cuatro se comprueban acá, sin red y sin navegador.</p>
 *
 * <p>Lo que esto NO comprueba, y nadie debería creer que sí: que la URL configurada responda, que
 * sirva Costa Rica, ni que su licencia permita el uso. Eso exige red y se verifica contra el
 * proveedor.</p>
 *
 *   node packages/ui/src/map/__checks__/estiloEnElDespliegue.check.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const frontend = new URL('../../../../..', import.meta.url).pathname;
const repo = new URL('../../../../../..', import.meta.url).pathname;

/**
 * Lee, o explica. Esta comprobación cruza la frontera de `frontend/` a propósito —el defecto que
 * fija vive entre el Dockerfile y el compose del despliegue—, así que necesita el repositorio
 * completo. Desde una copia parcial fallaba con un ENOENT crudo, que no dice nada; falla igual,
 * porque saltársela es cómo sobrevivió el defecto, pero ahora dice por qué.
 */
const leer = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      console.log(`  FALLA: no encontré ${p}`);
      console.log('         Esta comprobación necesita el repositorio completo (frontend/ e infra/),');
      console.log('         porque lo que fija es la cadena entre el Dockerfile y el compose del');
      console.log('         despliegue. Córrela desde la raíz del repositorio.');
      process.exit(1);
    }
    throw e;
  }
};

let fallos = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    fallos += 1;
    console.log(`  FALLA: ${msg}`);
  }
};

const dockerfile = leer(join(frontend, 'Dockerfile'));
const dockerignore = leer(join(frontend, '.dockerignore'));
const compose = leer(join(repo, 'infra/docker-compose.deploy.yml'));
const estilo = leer(join(frontend, 'packages/ui/src/map/estiloOscuro.ts'));
const envDesarrollo = leer(join(frontend, 'apps/citizen/.env.development'));

console.log('de dónde sale el estilo');
ok(/VITE_MAP_STYLE_URL/.test(estilo),
  'estiloOscuro.ts lee VITE_MAP_STYLE_URL');
ok(!/https?:\/\/[^\s'"`]*tiles/i.test(estilo),
  'y NO trae una URL de teselas por omisión: un mapa sin estilo no se inventa uno');

console.log('\npor qué no basta el .env');
ok(/^\*\*\/\.env$/m.test(dockerignore),
  '.dockerignore deja afuera **/.env, así que la imagen no puede recibir la variable por ahí');
ok(/^\*\*\/\.env\.development$/m.test(dockerignore),
  'y tampoco por **/.env.development — que es exactamente donde vivía');

console.log('\nla cadena del despliegue');
ok(/^ARG MAP_STYLE_URL=/m.test(dockerfile),
  'el Dockerfile declara ARG MAP_STYLE_URL');
ok(/VITE_MAP_STYLE_URL="\$MAP_STYLE_URL"/.test(dockerfile),
  'y lo pasa como VITE_MAP_STYLE_URL al compilar');

const posPaso = dockerfile.indexOf('VITE_MAP_STYLE_URL="$MAP_STYLE_URL"');
const posBuild = dockerfile.indexOf('npx vite build');
ok(posPaso > 0 && posBuild > 0 && posPaso < posBuild,
  'y el paso ocurre en la MISMA sentencia que corre vite build, no suelto en otra capa');

ok(/MAP_STYLE_URL:\s*\$\{MAP_STYLE_URL:-\}/.test(compose),
  'el compose de despliegue pasa MAP_STYLE_URL como argumento de build');

const bloqueWeb = compose.slice(compose.indexOf('\n  web:'));
const bloqueWebArgs = bloqueWeb.slice(0, bloqueWeb.indexOf('\n    image:'));
ok(/MAP_STYLE_URL/.test(bloqueWebArgs),
  'y lo pasa al servicio web, que es el que construye los cuatro portales');

console.log('\ny el desarrollo sigue funcionando');
ok(/^VITE_MAP_STYLE_URL=\S+/m.test(envDesarrollo),
  'apps/citizen/.env.development conserva un valor, para que npm run dev tenga mapa');

console.log('\nel valor vacío es seguro');
ok(/ARG MAP_STYLE_URL=\s*$/m.test(dockerfile),
  'el ARG queda vacío por omisión: sin decisión de despliegue no hay mapa, y el resto del portal funciona');

console.log(fallos === 0 ? '\ntodas las comprobaciones pasaron' : `\n${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
