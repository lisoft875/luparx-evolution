/**
 * Cómo se elige el proveedor de teselas, y cómo se oscurece su estilo.
 *
 * <h2>El proveedor NO está escrito en el código</h2>
 *
 * <p>Sale de `VITE_MAP_STYLE_URL`, y <b>no hay valor por omisión</b>. Sin esa variable el mapa no
 * se dibuja y lo dice: así una compilación de producción no empieza a pedirle teselas a un tercero
 * porque alguien se olvidó de configurarlo. OpenFreeMap se usa <b>sólo en desarrollo y pruebas</b>
 * (está puesto en `apps/citizen/.env.development`, no en `.env`), y antes de producción hay que
 * revisar licencia, atribución, CSP, disponibilidad y condiciones de uso.</p>
 *
 * <h2>Por qué se recolorea en el cliente</h2>
 *
 * <p>El diseño aprobado es oscuro —lienzo azul marino, calles grises, vías principales en ámbar— y
 * los estilos públicos de OpenFreeMap son claros. Recolorear las capas después de cargar el estilo
 * da las calles REALES del proveedor con la paleta aprobada, sin alojar un estilo propio ni pedir
 * nada a un cuarto sitio. Si algún día el proveedor sirve un estilo oscuro, se apunta la variable
 * ahí y esto se apaga con `recolorear={false}`.</p>
 *
 * <p>Los valores son los medidos sobre la imagen de referencia aprobada el 16-10-2026.</p>
 */

/** Paleta del diseño aprobado. */
export const PALETA_MAPA = {
  /** El lienzo: todo lo que no es calle ni agua. */
  fondo: '#0D1A2A',
  agua: '#071320',
  calleMenor: '#5E6E85',
  calleMayor: '#936A3C',
  /**
   * Lo que es una línea y no es calle ni agua: perímetro de parque, pista de aterrizaje, límite
   * administrativo. Medido: **1.39** sobre el lienzo —se ve si se busca— y **2.43** contra
   * `calleMenor`, que es lo que impide que el contorno de un parque se lea como una calle.
   * (Referencias: `calleMenor` da 3.38 sobre el lienzo y `calleMayor` 3.64.)
   */
  lineaApagada: '#243449',
  texto: '#D7E2F0',
  textoBorde: '#06101C',
  /** El relleno de una zona verificada. */
  zona: '#0079FB',
  /** El relleno de una geometría que NO es oficial. */
  zonaNoOficial: '#8B5CF6',
  /**
   * El contorno de la zona que la persona tiene elegida.
   *
   * <p>No sustituye al color del estado —azul oficial, violeta no oficial—, se le suma: la zona
   * elegida conserva su relleno y su borde, y encima lleva este anillo. Así «cuál elegí» y «es
   * oficial o no» siguen siendo dos preguntas con dos respuestas, en vez de un solo color que
   * intenta decir las dos cosas y acaba sin decir ninguna.</p>
   *
   * <p>Blanco cálido a propósito: es el único tono del mapa que no está ya tomado, y se distingue
   * del azul y del violeta sin depender de distinguir azul de violeta. El anillo además es casi
   * el doble de ancho, que es la señal que le queda a quien no ve el color.</p>
   */
  zonaElegida: '#F2F7FF',
} as const;

/**
 * La URL del estilo, o `null` cuando esta instalación no tiene proveedor configurado.
 *
 * El `cast` local es el mismo que usa `brandAssets.ts`: `import.meta.env` lo inyecta el
 * empaquetador de la aplicación que consume este paquete, y declararlo globalmente aquí
 * chocaría con los tipos `vite/client` que las aplicaciones ya traen. El `try` cubre el único
 * entorno sin empaquetador — una prueba de Node que importe el módulo directamente.
 */
export function urlDelEstilo(): string | null {
  let bruta = '';
  try {
    bruta = (
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
        ?.VITE_MAP_STYLE_URL ?? ''
    ).trim();
  } catch {
    return null;
  }
  if (!bruta) return null;
  // Sólo https y sólo un origen: una URL de estilo es lo único que este componente pide a un
  // tercero, y no se acepta `javascript:` ni un `data:` con capas arbitrarias dentro.
  try {
    const u = new URL(bruta);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Qué clase de capa es, mirando lo que el estilo declara y no su nombre. */
function clase(
  capa: Record<string, unknown>,
): 'fondo' | 'relieve' | 'agua' | 'calleMayor' | 'calleMenor' | 'texto' | 'otra' {
  const tipo = String(capa.type ?? '');
  const id = String(capa.id ?? '').toLowerCase();
  const fuente = String((capa as { 'source-layer'?: string })['source-layer'] ?? '').toLowerCase();
  if (tipo === 'background') return 'fondo';
  if (tipo === 'raster') return 'relieve';
  if (tipo === 'symbol') return 'texto';
  if (fuente === 'water' || id.includes('water') || id.includes('ocean')) return 'agua';
  if (fuente === 'transportation' || id.includes('road') || id.includes('highway') || id.includes('street')) {
    return /motorway|trunk|primary|highway/.test(id) ? 'calleMayor' : 'calleMenor';
  }
  return 'otra';
}

/**
 * Escribe el color en la propiedad que esa clase de capa usa **de verdad**.
 *
 * <p>Es la corrección del 16-10-2026, y el defecto que arregla no se podía ver antes: el arnés
 * prueba contra un estilo mínimo local, así que nadie había pasado `oscurecer` por el estilo real
 * del proveedor. En él los ríos y los canales son <b>líneas</b> (`waterway_river`,
 * `waterway_tunnel`), y escribirles `fill-color` —que es lo que hacía la rama del agua— las dejaba
 * con el celeste #A0C8F0 del proveedor dibujado sobre el lienzo oscuro.</p>
 *
 * <p>Una capa de un tipo que no sabemos pintar se deja intacta a propósito: inventarle una
 * propiedad de pintura es como MapLibre acaba rechazando el estilo entero, que es exactamente el
 * fallo que ya costó una corrida con `line-dasharray`.</p>
 */
function aplicarColor(pintura: Record<string, unknown>, tipo: string, color: string): void {
  if (tipo === 'line') pintura['line-color'] = color;
  else if (tipo === 'fill') pintura['fill-color'] = color;
  else if (tipo === 'fill-extrusion') pintura['fill-extrusion-color'] = color;
  else if (tipo === 'circle') pintura['circle-color'] = color;
}

/**
 * Devuelve una copia del estilo con la paleta aprobada.
 *
 * <p>Función pura sobre el objeto del estilo: se puede probar sin navegador, que es la razón de que
 * no viva dentro del componente.</p>
 */
export function oscurecer(estilo: unknown): unknown {
  if (!estilo || typeof estilo !== 'object') return estilo;
  const copia = JSON.parse(JSON.stringify(estilo)) as { layers?: Record<string, unknown>[] };
  if (!Array.isArray(copia.layers)) return copia;
  for (const capa of copia.layers) {
    const pintura = (capa.paint ?? {}) as Record<string, unknown>;
    const tipo = String(capa.type ?? '');
    switch (clase(capa)) {
      case 'fondo':
        pintura['background-color'] = PALETA_MAPA.fondo;
        break;
      case 'relieve':
        // El sombreado del proveedor (`natural_earth`) es un recurso de mapa CLARO: sobre el
        // lienzo oscuro sólo lo lava. Es una imagen, no un color, así que no hay nada que
        // recolorear — se apaga. A zoom de ciudad no se dibujaba igual (su maxzoom es 7), pero
        // una vista de país sí lo mostraba.
        pintura['raster-opacity'] = 0;
        break;
      case 'agua':
        aplicarColor(pintura, tipo, PALETA_MAPA.agua);
        break;
      case 'calleMayor':
        aplicarColor(pintura, tipo, PALETA_MAPA.calleMayor);
        break;
      case 'calleMenor':
        aplicarColor(pintura, tipo, PALETA_MAPA.calleMenor);
        break;
      case 'texto':
        pintura['text-color'] = PALETA_MAPA.texto;
        pintura['text-halo-color'] = PALETA_MAPA.textoBorde;
        pintura['text-halo-width'] = 1.2;
        break;
      default:
        // Parques, usos de suelo, edificios, pistas de aterrizaje, límites administrativos. Un
        // relleno se apaga hacia el lienzo y una LÍNEA al gris apagado: en el estilo real
        // `park_outline` es casi blanco (#E4F1D7) y las pistas son #F0EDE9, y una línea clara
        // sobre un lienzo oscuro se lee igual que una mancha clara — como un error de carga.
        if (tipo === 'fill' && pintura['fill-color'] !== undefined) {
          pintura['fill-color'] = PALETA_MAPA.fondo;
        }
        if (tipo === 'line' && pintura['line-color'] !== undefined) {
          pintura['line-color'] = PALETA_MAPA.lineaApagada;
        }
        break;
    }

    // El contorno de un relleno se pinta con su propia propiedad, y se estaba olvidando: en el
    // estilo real `park` conservaba un verde #5FD064 alrededor de un relleno ya apagado.
    if (pintura['fill-outline-color'] !== undefined) {
      pintura['fill-outline-color'] = pintura['fill-color'] ?? PALETA_MAPA.fondo;
    }

    // Un patrón es un sprite del proveedor, con sus colores claros dentro del PNG: no hay forma de
    // recolorearlo desde el estilo. Se retira y queda el lienzo debajo, que es la única respuesta
    // honesta — dejarlo puesto pinta un retazo claro (`wetland_bg_11`, `pedestrian_polygon`).
    if (pintura['fill-pattern'] !== undefined) {
      delete pintura['fill-pattern'];
      if (pintura['fill-color'] === undefined) pintura['fill-color'] = PALETA_MAPA.fondo;
    }

    capa.paint = pintura;
  }
  return copia;
}
