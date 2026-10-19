/**
 * Las capas con que se dibujan los perímetros de zona, aparte del componente.
 *
 * <p>Viven acá, y no dentro del `useEffect` que crea el mapa, para que la regla que de verdad
 * importa —qué se pinta como límite oficial y qué no— se pueda comprobar sin navegador y sin
 * librería de mapas. Es la misma razón por la que `zoneGeometry.ts` está separado.</p>
 */

/** Lo que el servidor considera un límite oficial. Cualquier otro estado se rotula. */
export const VERIFICADA = 'VERIFIED';

/** El identificador de la fuente GeoJSON que alimenta las tres capas. */
export const FUENTE = 'zonas';

export interface CapaDeZonas {
  id: string;
  type: 'fill' | 'line';
  source: string;
  filter?: unknown[];
  paint: Record<string, unknown>;
}

/**
 * Las capas, en el orden en que se añaden.
 *
 * <p>Dos capas de borde y no una con expresión: `line-dasharray` NO admite valores controlados
 * por los datos en MapLibre —no es una propiedad «data-driven»—, y una expresión ahí hace que el
 * estilo falle a validar y el mapa entero caiga al aviso de error. El trazo se decide entonces
 * por capa, y es el filtro el que reparte las zonas.</p>
 *
 * @param colorOficial el relleno y el borde de una zona verificada
 * @param colorNoOficial el de una geometría que no lo está
 */
export function capasDeZonas(colorOficial: string, colorNoOficial: string): CapaDeZonas[] {
  const esOficial = ['==', ['get', 'status'], VERIFICADA];
  return [
    {
      id: 'zonas-relleno',
      type: 'fill',
      source: FUENTE,
      paint: {
        'fill-color': ['case', esOficial, colorOficial, colorNoOficial],
        // Translúcido a propósito: el perímetro importa, pero tapar las calles que hay debajo
        // deja al ciudadano sin la referencia que vino a buscar.
        'fill-opacity': 0.28,
      },
    },
    {
      id: 'zonas-borde',
      type: 'line',
      source: FUENTE,
      filter: esOficial,
      paint: { 'line-color': colorOficial, 'line-width': 2 },
    },
    {
      id: 'zonas-borde-no-oficial',
      type: 'line',
      source: FUENTE,
      filter: ['!=', ['get', 'status'], VERIFICADA],
      paint: {
        'line-color': colorNoOficial,
        'line-width': 2,
        // Punteado para lo que no es oficial: se distingue sin depender del color, que es lo que
        // necesita quien no distingue azul de violeta.
        'line-dasharray': [2, 1.5],
      },
    },
  ];
}
