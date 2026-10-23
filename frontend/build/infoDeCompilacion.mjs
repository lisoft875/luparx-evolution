/**
 * Qué compilación es ésta, para los cuatro portales y desde un solo sitio.
 *
 * <p>Este bloque vivía sólo en `apps/inspector/vite.config.ts`, porque el «Acerca de» del Centro
 * de soporte fue lo primero que lo necesitó. Desde el 23-10-2026 lo necesitan los cuatro: el sello
 * de compilación que se dibuja al pie de cada vista existe para poder mirar una pantalla y saber
 * <b>si el despliegue salió y qué código quedó</b>. Cuatro copias del mismo bloque es cómo acaban
 * mostrando cosas distintas.</p>
 *
 * <h2>Por qué entra al compilar y no se lee en ejecución</h2>
 *
 * <p>El dato de verdad existe en el servidor —`/actuator/info` contesta `LUPARX_ENVIRONMENT`— pero
 * nginx NO enruta `/actuator`, y la razón escrita en `infra/nginx/luparx.conf` es buena: métricas y
 * esquema de la API son reconocimiento gratis para quien busque por dónde entrar. Abrir esa puerta
 * para pintar un renglón sería un mal negocio. Vite resuelve estos valores al compilar y quedan
 * como literales: no hay lectura en ejecución que pueda fallar.</p>
 *
 * <h2>De dónde sale cada uno</h2>
 *
 * <table>
 *   <tr><td>`LUPARX_BUILD`</td><td>el hash corto del commit; lo exporta `scripts/deploy.sh`</td></tr>
 *   <tr><td>`LUPARX_ENVIRONMENT`</td><td>ya vive en `infra/.env` para el backend</td></tr>
 *   <tr><td>`LUPARX_BUILT_AT`</td><td>UN instante para los cuatro portales, no cuatro</td></tr>
 * </table>
 *
 * <p>Lo de `LUPARX_BUILT_AT` importa más de lo que parece. El Dockerfile construye los cuatro
 * portales <b>uno detrás de otro</b> —en paralelo se comen la memoria de una instancia chica— así
 * que cada `vite build` arranca en un minuto distinto. Si cada uno se sellara con su propia hora,
 * los cuatro sellos de un mismo despliegue saldrían distintos y la pregunta que el sello existe
 * para responder —«¿salieron los cuatro?»— no se podría contestar comparándolos. Cuando la
 * variable no viene —un `npm run dev`, un build a mano— vale la hora de ESTE build, que es la
 * verdad disponible.</p>
 *
 * <p>`null` significa «esta compilación no lo supo», y eso es lo que la pantalla dice. Inventar el
 * dato está prohibido; no tenerlo, no.</p>
 */
/**
 * Si esto es `vite build` y no el servidor de desarrollo.
 *
 * <p>Se mira `process.argv` y no `NODE_ENV`: Vite fija `NODE_ENV` durante la resolución de la
 * configuración, o sea DESPUÉS de evaluar este módulo, así que leerlo acá da un valor que a veces
 * está y a veces no. El argumento del CLI está siempre, desde la primera línea.</p>
 */
const esBuild = process.argv.includes('build');

export function infoDeCompilacion(version) {
  /*
    Sin `LUPARX_ENVIRONMENT`, un `npm run dev` vale «local» y una compilación vale NADA.

    Es la asimetría que hace que el sello no se pueda colar a producción. En el servidor de
    desarrollo nadie exporta variables de despliegue y el sello tiene que verse igual, así que ahí
    se asume `local`. En un `vite build` sin entorno declarado —el caso de un artefacto que alguien
    construye a mano y acaba publicado— se deja `null`, y sin entorno no hay sello: el que falta en
    staging se nota y se arregla; el que sobra en producción lo ve un ciudadano.
  */
  const entorno = process.env.LUPARX_ENVIRONMENT || (esBuild ? null : 'local');
  return {
    __LUPARX_VERSION__: JSON.stringify(version),
    __LUPARX_BUILD__: JSON.stringify(process.env.LUPARX_BUILD || null),
    __LUPARX_ENV__: JSON.stringify(entorno),
    __LUPARX_BUILT_AT__: JSON.stringify(
      process.env.LUPARX_BUILT_AT || new Date().toISOString(),
    ),
  };
}
