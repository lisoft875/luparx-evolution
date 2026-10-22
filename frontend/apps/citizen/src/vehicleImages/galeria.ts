/// <reference types="vite/client" />
import { analizarNombre, type EntradaCatalogo } from './catalogo';

/**
 * Los archivos de la carpeta, descubiertos por el empaquetador.
 *
 * <h2>Por qué un glob y no una lista escrita a mano</h2>
 *
 * <p>La orden pide que agregar un vehículo no obligue a tocar componentes. Con una lista habría
 * que editarla en cada alta, y una lista desincronizada de la carpeta es una imagen que no
 * aparece sin que nadie entienda por qué. Acá la carpeta ES el catálogo: se deja el archivo con el
 * nombre que manda la convención y ya está.</p>
 *
 * <h2>Por qué no pesa nada</h2>
 *
 * <p>`query: '?url'` hace que lo que se importe sea la RUTA de cada archivo, no su contenido: el
 * paquete crece en unos pocos bytes por imagen —una cadena— y el navegador descarga únicamente las
 * que termina dibujando. El `eager` es sobre esas cadenas, no sobre los archivos.</p>
 *
 * <p>Con la carpeta vacía esto es un objeto vacío y todo cae al dibujo: hoy, sin ninguna imagen
 * con licencia todavía, la aplicación se ve exactamente igual que antes de este cambio.</p>
 */
/*
  La llamada va LITERAL, y esto no es cosmético: comprobado el 22-10-2026, escrita con un `cast`
  —`(import.meta as X).glob?.(…)`— Vite NO la reconoce. Se compila sin un error, el catálogo queda
  vacío y la imagen jamás se emite al paquete. Se descubrió poniendo un archivo de prueba y
  mirando el `dist`: ni el archivo ni su URL aparecían.

  Vite busca la expresión `import.meta.glob(` en el árbol del módulo; un acceso opcional o
  envuelto en un `cast` deja de ser esa expresión. Por eso los tipos entran por la referencia de
  arriba y no envolviendo la llamada.
*/
const ARCHIVOS = import.meta.glob('./assets/*.{webp,avif,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** El catálogo ya analizado. Los nombres que no siguen la convención quedan fuera. */
export const CATALOGO_VEHICULOS: EntradaCatalogo[] = Object.entries(ARCHIVOS)
  .map(([ruta, url]) => analizarNombre(ruta, url))
  .filter((e): e is EntradaCatalogo => e !== null);

/** Los nombres que el analizador rechazó, para que la comprobación pueda señalarlos. */
export const ARCHIVOS_IGNORADOS: string[] = Object.keys(ARCHIVOS)
  .filter((ruta) => analizarNombre(ruta, '') === null);
