/**
 * El catálogo de imágenes de vehículos: cómo se nombra un archivo y cuál se elige.
 *
 * <h2>Por qué esto vive aparte del componente</h2>
 *
 * <p>Acá no se importa React ni Vite. Es la regla —qué imagen le corresponde a qué vehículo— y se
 * puede comprobar sin navegador y sin empaquetador, que es lo que permite afirmar que un Corolla
 * rojo nunca va a salir con la foto de uno blanco. El descubrimiento de los archivos vive en
 * `galeria.ts`, que es la parte que sí depende del empaquetador.</p>
 *
 * <h2>Cómo se nombra un archivo</h2>
 *
 * <pre>
 *   marca__modelo__años__color.webp
 *
 *   toyota__rav4__2019-2024__white.webp     el RAV4 blanco de esa generación
 *   toyota__rav4__2019-2024__cualquiera.webp   el RAV4 de esa generación, sirva el color que sirva
 *   hyundai__tucson__cualquiera__gray.webp  el Tucson gris, cualquier año
 * </pre>
 *
 * <p>Cuatro campos separados por doble guion bajo. El color usa <b>las claves del catálogo del
 * servidor</b> —{@code WHITE}, {@code GRAY}, {@code RED}…— en minúscula, para no traducir nada por
 * el camino. Los años son un rango inclusivo, que es lo que permite compartir una imagen entre los
 * años de una misma generación. {@code cualquiera} vale en el campo de años y en el de color.</p>
 *
 * <p>Agregar un vehículo es dejar un archivo con ese nombre en la carpeta. No hay que tocar ningún
 * componente ni ninguna lista: la galería los descubre.</p>
 *
 * <h2>La regla del color, que es la que importa</h2>
 *
 * <p>Si el vehículo declara color y no hay imagen de ESE color, no se usa la de otro: se cae al
 * dibujo, que sí se tiñe del color declarado. Un carro gris con la foto de uno blanco es una
 * imagen equivocada del carro de esa persona, y el dibujo —que no pretende ser una foto— dice la
 * verdad.</p>
 *
 * <p>Quien arma el catálogo puede decidir lo contrario para un modelo concreto nombrando el
 * archivo {@code …__cualquiera.webp}. Esa decisión queda en el nombre del archivo y no en el
 * código.</p>
 */

export interface EntradaCatalogo {
  /** Marca normalizada: minúscula, sin tildes ni separadores. */
  marca: string;
  /** Modelo normalizado, igual. */
  modelo: string;
  /** Primer año de la generación, o null si la imagen sirve para cualquier año. */
  desde: number | null;
  /** Último año, inclusive. */
  hasta: number | null;
  /** Clave de color del servidor en minúscula, o null si sirve para cualquier color. */
  color: string | null;
  /** De dónde sale el archivo, ya resuelto por el empaquetador. */
  url: string;
}

export interface VehiculoParaImagen {
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
}

/** `RAV-4`, `Rav 4` y `rav4` son el mismo modelo escrito por tres personas distintas. */
export function normalizar(texto: string | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    // Las marcas diacríticas del rango combinante: así «Citroën» y «Citroen» se encuentran.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CUALQUIERA = 'cualquiera';

/**
 * Lee un nombre de archivo y devuelve la entrada, o null si el nombre no sigue la convención.
 *
 * <p>Un archivo mal nombrado se ignora en silencio a propósito: la alternativa es que una foto
 * suelta en la carpeta haga fallar la pantalla de vehículos de todo el mundo. Lo que sí hace
 * ruido es la comprobación de `__checks__`, que corre en cada compuerta.</p>
 */
export function analizarNombre(archivo: string, url: string): EntradaCatalogo | null {
  const base = archivo.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  const partes = base.split('__');
  if (partes.length !== 4) return null;

  const [marcaBruta, modeloBruto, aniosBruto, colorBruto] = partes as [string, string, string, string];
  const marca = normalizar(marcaBruta);
  const modelo = normalizar(modeloBruto);
  if (!marca || !modelo) return null;

  let desde: number | null = null;
  let hasta: number | null = null;
  if (aniosBruto !== CUALQUIERA) {
    const rango = /^(\d{4})-(\d{4})$/.exec(aniosBruto);
    if (!rango) return null;
    desde = Number(rango[1]);
    hasta = Number(rango[2]);
    if (desde > hasta) return null;
  }

  const color = colorBruto === CUALQUIERA ? null : normalizar(colorBruto);
  if (colorBruto !== CUALQUIERA && !color) return null;

  return { marca, modelo, desde, hasta, color, url };
}

function cubreElAnio(entrada: EntradaCatalogo, anio: number | undefined): boolean {
  if (entrada.desde === null || entrada.hasta === null) return true;
  // Un vehículo sin año declarado no puede caer en una entrada acotada a una generación: no
  // sabemos de cuál es.
  if (anio === undefined) return false;
  return anio >= entrada.desde && anio <= entrada.hasta;
}

/**
 * La imagen que le corresponde a este vehículo, o null si no hay ninguna que no mienta.
 *
 * <p>Orden de preferencia, y cada paso es más específico que el siguiente:</p>
 *
 * <ol>
 *   <li>marca + modelo + año dentro de la generación + <b>el color declarado</b>;</li>
 *   <li>marca + modelo + año dentro de la generación, con una imagen marcada para cualquier color;</li>
 *   <li>lo mismo sin acotar el año, para catálogos que no distinguen generaciones;</li>
 *   <li>nada: la pantalla dibuja la silueta teñida del color declarado.</li>
 * </ol>
 */
export function elegirImagen(
  entradas: EntradaCatalogo[],
  vehiculo: VehiculoParaImagen,
): string | null {
  const marca = normalizar(vehiculo.brand);
  const modelo = normalizar(vehiculo.model);
  if (!marca || !modelo) return null;

  const delModelo = entradas.filter((e) => e.marca === marca && e.modelo === modelo);
  if (delModelo.length === 0) return null;

  const color = normalizar(vehiculo.color) || null;

  // 1 · el color exacto, dentro de la generación
  if (color) {
    const exacta = delModelo.find((e) => e.color === color && cubreElAnio(e, vehiculo.year));
    if (exacta) return exacta.url;
  }

  // 2 · una imagen que el catálogo declaró válida para cualquier color
  const deCualquierColor = delModelo.find((e) => e.color === null && cubreElAnio(e, vehiculo.year));
  if (deCualquierColor) return deCualquierColor.url;

  /*
    3 · sin acotar el año.

    Sólo entra acá lo que ya pasó el filtro de color: si el vehículo declara uno y el catálogo no
    lo tiene, se devuelve null y manda el dibujo. Mostrar un carro blanco donde hay uno gris sería
    una imagen equivocada del carro de esa persona, y eso no lo arregla que la foto sea bonita.
  */
  const sinAnio = delModelo.find((e) => e.desde === null
    && (color ? e.color === color : e.color === null));
  return sinAnio ? sinAnio.url : null;
}
