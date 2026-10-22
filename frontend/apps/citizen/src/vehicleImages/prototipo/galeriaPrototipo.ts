/// <reference types="vite/client" />
import { claveDeArchivo } from './catalogoPrototipo';

/**
 * Las cien imágenes de la biblioteca de prototipo, descubiertas por el empaquetador.
 *
 * <h2>Por qué están acá y no en `public/`</h2>
 *
 * <p>El paquete original las servía desde `public/vehicles/` con la ruta escrita a mano
 * (`/vehicles/{tipo}-{color}.webp`). Acá no, y por dos razones concretas de esta aplicación:</p>
 *
 * <ul>
 *   <li><b>El prefijo de despliegue.</b> El mismo artefacto se publica en la raíz de un subdominio
 *       o bajo una ruta (`VITE_BASE_PATH`), así que una ruta absoluta escrita a mano se rompe en la
 *       mitad de las instalaciones. Por acá el empaquetador la reescribe solo.</li>
 *   <li><b>La caché.</b> Un archivo de `public/` se sirve con su nombre tal cual; si alguna vez se
 *       reemplaza una imagen por una corregida, los navegadores que ya la tienen siguen mostrando
 *       la vieja. Por acá cada archivo lleva su huella en el nombre y eso no puede pasar.</li>
 * </ul>
 *
 * <p>Lo que entra en el paquete es la RUTA de cada archivo, no su contenido: cien cadenas, unos
 * pocos kilobytes. El navegador descarga únicamente la imagen que termina dibujando, y el
 * `loading="lazy"` del componente se encarga del resto.</p>
 */
/*
  La llamada va LITERAL, igual que en `../galeria.ts`, y por el mismo fallo real: escrita con un
  `cast` —`(import.meta as X).glob?.(…)`— Vite NO la reconoce, compila sin error, el catálogo queda
  vacío y las imágenes jamás se emiten. Comprobado el 22-10-2026.
*/
const ARCHIVOS = import.meta.glob('./assets/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** `sedan-blanco` → la dirección del archivo. */
export const PROTOTIPOS: Record<string, string> = (() => {
  const mapa: Record<string, string> = {};
  for (const [ruta, url] of Object.entries(ARCHIVOS)) {
    const clave = claveDeArchivo(ruta);
    if (clave) mapa[clave] = url;
  }
  return mapa;
})();

/** Los archivos cuyo nombre no sigue la convención, para que la comprobación pueda señalarlos. */
export const PROTOTIPOS_IGNORADOS: string[] = Object.keys(ARCHIVOS)
  .filter((ruta) => claveDeArchivo(ruta) === null);
