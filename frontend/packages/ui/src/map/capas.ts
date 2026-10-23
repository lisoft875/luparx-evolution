/**
 * Las capas con que se dibujan los perímetros de zona, aparte del componente.
 *
 * <p>Viven acá, y no dentro del `useEffect` que crea el mapa, para que la regla que de verdad
 * importa —qué se pinta como límite oficial y qué no— se pueda comprobar sin navegador y sin
 * librería de mapas. Es la misma razón por la que `zoneGeometry.ts` está separado.</p>
 */

/** Lo que el servidor considera un límite oficial. Cualquier otro estado se rotula. */
export const VERIFICADA = 'VERIFIED';

/** El identificador de la fuente GeoJSON que alimenta las capas. */
export const FUENTE = 'zonas';

/**
 * La capa que recibe el toque.
 *
 * <p>Es el relleno, no el contorno: el dedo apunta al interior de la zona, y acertarle a una línea
 * de 2 px en un teléfono no es razonable. Se exporta porque el componente la necesita para
 * registrar el manejador y el cursor, y escribir el literal dos veces es cómo se desincronizan.</p>
 */
export const CAPA_RELLENO = 'zonas-relleno';

/** El anillo de la zona elegida. Sólo existe cuando hay una. */
export const CAPA_ELEGIDA = 'zonas-elegida';

/** La propiedad que lleva el rótulo ya compuesto: nombre, tarifa y, si toca, el aviso de DEMO. */
export const PROP_ETIQUETA = 'lxEtiqueta';

export interface CapaDeZonas {
  id: string;
  type: 'fill' | 'line' | 'symbol';
  source: string;
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint: Record<string, unknown>;
}

export interface OpcionesDeCapas {
  /** El relleno y el borde de una zona verificada. */
  colorOficial: string;
  /** El de una geometría que no lo está. */
  colorNoOficial: string;
  /** Color del rótulo. */
  colorTexto: string;
  /** Borde del rótulo, para que se lea sobre cualquier calle. */
  colorBordeTexto: string;
  /**
   * La familia tipográfica del propio estilo del proveedor.
   *
   * No se escribe un nombre a mano: si la fuente no está en el juego de glifos del proveedor,
   * MapLibre lanza un error, el componente lo recoge y la pantalla entera cae al aviso de fallo.
   * El componente lee la que ya usa el estilo cargado y la pasa por acá; cuando no hay ninguna,
   * manda `undefined` y la capa de rótulos sencillamente no se añade.
   */
  fuenteTexto?: string[];
  /**
   * El código de la zona que la persona tiene elegida, si tiene alguna.
   *
   * <p>Con un código acá se añade UNA capa más: un anillo alrededor de esa zona. Sin código no se
   * añade nada, y el mapa queda exactamente como estaba. Se filtra por `code` —que el servidor sí
   * publica en el GeoJSON— y no por el `id` del rasgo, porque el identificador interno de una zona
   * no tiene por qué llegar al cliente y el código es el que la persona ve escrito.</p>
   */
  codigoElegido?: string;
  /** El color de ese anillo. */
  colorElegida?: string;
}

/**
 * Las capas, en el orden en que se añaden.
 *
 * <h2>Neón, y por qué son cuatro y no una</h2>
 *
 * <p>El boceto pinta las zonas como superficies encendidas sobre el mapa oscuro: relleno
 * translúcido, contorno luminoso y el nombre con la tarifa encima. Eso no se consigue con un solo
 * borde: el resplandor es una línea ancha y difuminada por debajo del contorno nítido. Dos capas,
 * no una con sombra, porque MapLibre no tiene sombra de línea.</p>
 *
 * <h2>El color sigue significando algo</h2>
 *
 * <p>Azul eléctrico es un límite verificado; violeta, uno que no lo es. El boceto usa varios
 * colores sin que ninguno quiera decir nada, pero acá el color ya tiene trabajo y no se le puede
 * quitar: una geometría de demostración pintada igual que una oficial es exactamente lo que no
 * puede pasar. Y como el color no basta —quien no distingue azul de violeta se queda sin la
 * señal—, el contorno no oficial además va punteado y el rótulo lo dice con palabras.</p>
 *
 * <h2>Dos capas de borde y no una con expresión</h2>
 *
 * <p>`line-dasharray` NO admite valores controlados por los datos en MapLibre —no es una propiedad
 * «data-driven»—, y una expresión ahí hace que el estilo falle a validar y el mapa entero caiga al
 * aviso de error. El trazo se decide entonces por capa, y es el filtro el que reparte las zonas.</p>
 */
export function capasDeZonas(opciones: OpcionesDeCapas): CapaDeZonas[] {
  const {
    colorOficial, colorNoOficial, colorTexto, colorBordeTexto, fuenteTexto,
    codigoElegido, colorElegida,
  } = opciones;
  const esOficial = ['==', ['get', 'status'], VERIFICADA];
  const porEstado = ['case', esOficial, colorOficial, colorNoOficial];

  const capas: CapaDeZonas[] = [
    {
      id: CAPA_RELLENO,
      type: 'fill',
      source: FUENTE,
      paint: {
        'fill-color': porEstado,
        // Translúcido a propósito: el perímetro importa, pero tapar las calles que hay debajo
        // deja al ciudadano sin la referencia que vino a buscar.
        'fill-opacity': 0.3,
      },
    },
    {
      // El resplandor: ancha, tenue y difuminada. Va DEBAJO del contorno nítido, que es lo que la
      // hace leerse como luz y no como un borde grueso.
      id: 'zonas-resplandor',
      type: 'line',
      source: FUENTE,
      paint: {
        'line-color': porEstado,
        'line-width': 9,
        'line-blur': 6,
        'line-opacity': 0.55,
      },
    },
    {
      id: 'zonas-borde',
      type: 'line',
      source: FUENTE,
      filter: esOficial,
      paint: { 'line-color': colorOficial, 'line-width': 2.2 },
    },
    {
      id: 'zonas-borde-no-oficial',
      type: 'line',
      source: FUENTE,
      filter: ['!=', ['get', 'status'], VERIFICADA],
      paint: {
        'line-color': colorNoOficial,
        'line-width': 2.2,
        // Punteado para lo que no es oficial: se distingue sin depender del color, que es lo que
        // necesita quien no distingue azul de violeta.
        'line-dasharray': [2, 1.5],
      },
    },
  ];

  /*
    El anillo de la elegida, encima de los dos contornos y debajo del rótulo.

    Va como capa aparte y no como expresión en el borde por la misma razón que hay dos bordes: el
    trazo no se puede decidir por los datos, y el ancho de la elegida tiene que poder ser distinto
    tanto en la oficial como en la que no lo es. Como capa, además, desaparece sola cuando no hay
    zona elegida: sin código no se añade, y no queda un filtro imposible dibujando nada.
  */
  if (codigoElegido && colorElegida) {
    capas.push({
      id: CAPA_ELEGIDA,
      type: 'line',
      source: FUENTE,
      filter: ['==', ['get', 'code'], codigoElegido],
      paint: {
        'line-color': colorElegida,
        // Casi el doble que un contorno normal: la señal que le queda a quien no ve el color.
        'line-width': 4,
        'line-opacity': 0.95,
      },
    });
  }

  if (fuenteTexto && fuenteTexto.length > 0) {
    capas.push({
      id: 'zonas-etiqueta',
      type: 'symbol',
      source: FUENTE,
      layout: {
        // El rótulo viene compuesto desde el componente, que es quien tiene la tarifa: el GeoJSON
        // del servidor trae código, nombre, procedencia y estado, y ningún precio.
        'text-field': ['get', PROP_ETIQUETA],
        'text-font': fuenteTexto,
        'text-size': 13,
        'text-line-height': 1.25,
        'text-anchor': 'center',
        // Que no se amontonen: antes que dos rótulos encima, uno.
        'text-allow-overlap': false,
        'text-padding': 6,
        'text-max-width': 10,
      },
      paint: {
        'text-color': colorTexto,
        'text-halo-color': colorBordeTexto,
        'text-halo-width': 1.6,
        'text-halo-blur': 0.4,
      },
    });
  }

  return capas;
}
