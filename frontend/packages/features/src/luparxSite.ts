/**
 * La dirección de la web oficial de LuParX, en un solo lugar.
 *
 * <h2>Por qué acá y no en cada pantalla</h2>
 *
 * Las especificaciones del 24-09-2026 —la del menú «Más» de Fiscalización y la del ciudadano— piden
 * las dos lo mismo con las mismas palabras: «la URL debe estar centralizada/configurable en un
 * único lugar» y «no repetir la URL directamente en múltiples componentes». Cuatro portales con la
 * misma constante escrita cuatro veces es una dirección que el día que cambie va a quedar mal en
 * tres.
 *
 * <h2>Por qué una variable de entorno con valor por omisión</h2>
 *
 * `VITE_LUPARX_SITE_URL` la fija el despliegue, igual que `VITE_API_BASE_URL`. El valor por omisión
 * existe para que un desarrollo local o una prueba no necesiten configurar nada: el sitio oficial es
 * público y su dirección no es un secreto ni depende del entorno. Lo que sí depende es poder
 * apuntar a otra durante una demostración o si el dominio cambia.
 *
 * <h2>Por qué no es una página dentro de la aplicación</h2>
 *
 * Porque las dos especificaciones lo prohíben explícitamente: «no crear una página corporativa
 * duplicada dentro del módulo». Una copia de la web institucional dentro del portal es contenido
 * que nadie se acuerda de actualizar.
 */
const POR_OMISION = 'https://luparx.com';

function leerDelEntorno(): string | undefined {
  // `import.meta.env` no existe en una prueba de Node sin Vite, y leerlo a ciegas revienta el
  // módulo entero al importarlo. Vale más un `try` de tres líneas que un fallo en un contexto que
  // ni siquiera necesita la dirección.
  try {
    const valor = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_LUPARX_SITE_URL;
    return valor && valor.trim() !== '' ? valor.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** La web oficial. Absoluta y con esquema, lista para un `href`. */
export const LUPARX_SITE_URL: string = leerDelEntorno() ?? POR_OMISION;

/**
 * Los atributos con los que se abre un enlace externo desde cualquiera de los portales.
 *
 * <p>`noopener` no es decoración: sin él, la pestaña que se abre recibe una referencia a la nuestra
 * por `window.opener` y puede reescribir su dirección. `noreferrer` lo implica en los navegadores
 * actuales, pero se escriben los dos porque el que falte es el que importa en el navegador viejo
 * que alguien todavía usa.</p>
 */
export const ENLACE_EXTERNO = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;
