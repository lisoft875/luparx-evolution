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

/** La propiedad que lleva el tono neón de cada zona, decidido en TypeScript y no en el estilo. */
export const PROP_TONO = 'lxTono';

/**
 * Los tres tonos neón del boceto: azul eléctrico, violeta y cian.
 *
 * <h2>Qué significa ahora el color, y qué significaba antes</h2>
 *
 * <p>Hasta el 22-10-2026 el color decía <b>oficial o no</b>: azul una geometría verificada,
 * violeta una de demostración. Era una decisión defendible y tenía una buena razón detrás: una
 * geometría DEMO pintada como oficial es el error que no puede ocurrir.</p>
 *
 * <p>La orden del 23-10-2026 pide el aspecto del boceto, donde las zonas se distinguen ENTRE SÍ
 * por color —azul, violeta y cian— como hacen los mapas de zonas de todo el mundo. Con un solo
 * tono para todas las verificadas, tres zonas vecinas verificadas se leen como una sola mancha, y
 * «¿cuál es cuál?» es la pregunta que el mapa existe para contestar.</p>
 *
 * <p>Así que el color pasa a decir <b>qué zona es</b>, y lo que distingue una geometría de
 * demostración pasa a ser lo que ya la distinguía sin depender del color: el <b>contorno
 * punteado</b>, el <b>relleno más tenue</b> y la <b>palabra en el rótulo</b>. Quien no distingue
 * azul de violeta —que es a quien protegía la regla anterior— no pierde nada: nunca tuvo el color
 * y siempre tuvo el trazo y la palabra.</p>
 */
export const TONOS_DE_ZONA: readonly string[] = ['#0079FB', '#8B5CF6', '#22D3EE'];

/**
 * El tono de una zona, a partir de su código.
 *
 * <p>Determinista y no por orden de llegada: el servidor puede devolver las zonas en cualquier
 * orden, y un color que cambia de una carga a otra convierte «la azul» en una referencia inútil.
 * Con el código, la misma zona es del mismo color hoy y mañana, en el teléfono y en la
 * computadora.</p>
 */
export function tonoDeZona(codigo: string | null | undefined): string {
  const texto = typeof codigo === 'string' ? codigo : '';
  let suma = 0;
  for (let i = 0; i < texto.length; i += 1) suma = (suma * 31 + texto.charCodeAt(i)) % 100003;
  return TONOS_DE_ZONA[suma % TONOS_DE_ZONA.length]!;
}

export interface CapaDeZonas {
  id: string;
  type: 'fill' | 'line' | 'symbol';
  source: string;
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint: Record<string, unknown>;
}

export interface OpcionesDeCapas {
  /** El tono con que se pinta una zona sin `lxTono` propio. */
  colorOficial: string;
  /**
   * Ya no se usa para pintar.
   *
   * <p>Era el color de una geometría no verificada, cuando el color decía eso. Desde el 23-10-2026
   * el color dice QUÉ ZONA es —ver {@link TONOS_DE_ZONA}— y lo no oficial se distingue por el
   * trazo, el relleno y la palabra del rótulo. Se conserva en la firma para no romper a quien lo
   * pasa, y se ignora a propósito: quitarlo obligaría a tocar llamadas que no tienen nada que
   * decidir acá.</p>
   */
  colorNoOficial?: string;
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
    colorOficial, colorTexto, colorBordeTexto, fuenteTexto, codigoElegido, colorElegida,
  } = opciones;
  const esOficial = ['==', ['get', 'status'], VERIFICADA];
  /*
    El tono sale del propio rasgo. Se calcula en TypeScript —`tonoDeZona`, comprobable sin mapa— y
    viaja en la propiedad `lxTono` que el componente añade al copiar la colección. `coalesce` deja
    un camino de vuelta: un rasgo sin tono pintado con el color de siempre es preferible a un
    polígono invisible.
  */
  const tono = ['coalesce', ['get', PROP_TONO], colorOficial];
  const esElegida = codigoElegido
    ? ['==', ['get', 'code'], codigoElegido]
    : ['literal', false];

  const capas: CapaDeZonas[] = [
    {
      id: CAPA_RELLENO,
      type: 'fill',
      source: FUENTE,
      paint: {
        'fill-color': tono,
        /*
          Tres niveles, y los tres dejan ver la calle de abajo —que es la referencia que el
          ciudadano vino a buscar—: la elegida más encendida, el resto visible, y lo que no es
          oficial más tenue todavía. Esa última diferencia es la que sustituye al color: una
          geometría de demostración se nota apagada aunque su tono sea el mismo que el de al lado.
        */
        'fill-opacity': ['case', esElegida, 0.42, esOficial, 0.26, 0.16],
      },
    },
    {
      // El resplandor: ancha, tenue y difuminada. Va DEBAJO del contorno nítido, que es lo que la
      // hace leerse como luz y no como un borde grueso.
      id: 'zonas-resplandor',
      type: 'line',
      source: FUENTE,
      paint: {
        'line-color': tono,
        'line-width': ['case', esElegida, 14, 9],
        'line-blur': ['case', esElegida, 8, 6],
        'line-opacity': ['case', esElegida, 0.85, esOficial, 0.55, 0.35],
      },
    },
    {
      id: 'zonas-borde',
      type: 'line',
      source: FUENTE,
      filter: esOficial,
      paint: { 'line-color': tono, 'line-width': ['case', esElegida, 3, 2.2] },
    },
    {
      id: 'zonas-borde-no-oficial',
      type: 'line',
      source: FUENTE,
      filter: ['!=', ['get', 'status'], VERIFICADA],
      paint: {
        'line-color': tono,
        'line-width': ['case', esElegida, 3, 2.2],
        // Punteado para lo que no es oficial: se distingue sin depender del color, que es lo que
        // necesita quien no distingue azul de violeta — y lo que hace falta ahora que el color
        // dice qué zona es y no si está verificada.
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
  if (codigoElegido) {
    capas.push({
      id: CAPA_ELEGIDA,
      type: 'line',
      source: FUENTE,
      filter: ['==', ['get', 'code'], codigoElegido],
      paint: {
        /*
          EL ANILLO ES DEL TONO DE LA ZONA, NO BLANCO (23-10-2026).

          Nació blanco el 22-10, cuando el color decía «oficial o no» y hacía falta una señal que
          no fuera color. Con tres tonos por zona, un contorno blanco encima apaga justo lo que la
          orden pide ver: «contorno luminoso más intenso y relleno destacado». Medido en pantalla,
          la zona elegida se leía como una caja blanca apagada al lado de una azul encendida, que
          es lo contrario de lo que tiene que pasar.

          Lo que sustituye al blanco como señal sin color es el ANCHO —casi el doble que un
          contorno normal— más el relleno y el resplandor, que también suben. Tres señales que no
          dependen de distinguir un tono de otro.
        */
        'line-color': colorElegida || ['coalesce', ['get', PROP_TONO], colorOficial],
        'line-width': 4,
        'line-opacity': 1,
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
