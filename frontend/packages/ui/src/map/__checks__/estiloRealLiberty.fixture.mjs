/**
 * Capas REALES del estilo del proveedor, capturadas para poder comprobar el recoloreado sin red.
 *
 * <h2>Procedencia (importa, y por eso va escrita acá)</h2>
 *
 * Capturadas el **16-10-2026** de `https://tiles.openfreemap.org/styles/liberty`, que ese día
 * servía un estilo MapLibre v8 de **111 capas**. No es una copia a mano ni un estilo inventado:
 * son los objetos del proveedor, recortados a los **cuatro campos que `oscurecer` lee**
 * (`id`, `type`, `source-layer`, `paint`). Cualquier otro campo —filtros, zooms, `layout`— no
 * interviene en el recoloreado, así que no está.
 *
 * <h2>Por qué existe este archivo</h2>
 *
 * El arnés de navegador intercepta la URL del estilo y responde uno **mínimo local**. Eso prueba
 * que el mapa se dibuja, y no prueba nada sobre el estilo que el ciudadano va a ver de verdad: los
 * diez defectos de recoloreado del 16-10 estaban todos en capas que el estilo mínimo no tiene
 * (ríos como línea, contorno de parque, pistas de aterrizaje, relieve ráster, patrones).
 *
 * La selección son las capas que delataron esos defectos más una de cada clase que sí funcionaba
 * (`water` como relleno, `highway-name-major` como texto, `landuse_hospital` como relleno sin
 * clasificar), para que una corrección no pueda romper lo que ya estaba bien.
 *
 * Si el proveedor cambia su estilo, esto NO se actualiza solo — y es correcto: lo que fija es que
 * el recoloreado resuelve estas formas de capa. Volver a capturar es una decisión, no un descuido.
 */
export const CAPAS_REALES_LIBERTY = [
  { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
  {
    id: 'natural_earth',
    type: 'raster',
    paint: { 'raster-opacity': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.6, 6, 0.1] },
  },
  {
    id: 'park',
    type: 'fill',
    'source-layer': 'park',
    paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.7, 'fill-outline-color': 'rgba(95, 208, 100, 1)' },
  },
  {
    id: 'park_outline',
    type: 'line',
    'source-layer': 'park',
    paint: { 'line-color': 'rgba(228, 241, 215, 1)', 'line-dasharray': [1, 1.5] },
  },
  {
    id: 'landcover_wetland',
    type: 'fill',
    'source-layer': 'landcover',
    paint: { 'fill-antialias': true, 'fill-opacity': 0.8, 'fill-pattern': 'wetland_bg_11', 'fill-translate-anchor': 'map' },
  },
  { id: 'landuse_hospital', type: 'fill', 'source-layer': 'landuse', paint: { 'fill-color': '#fde' } },
  {
    id: 'waterway_tunnel',
    type: 'line',
    'source-layer': 'waterway',
    paint: {
      'line-color': '#a0c8f0',
      'line-dasharray': [3, 3],
      'line-gap-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 20, 6],
      'line-opacity': 1,
      'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 1, 20, 2],
    },
  },
  {
    id: 'waterway_river',
    type: 'line',
    'source-layer': 'waterway',
    paint: { 'line-color': '#a0c8f0', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.5, 20, 6] },
  },
  { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': 'rgb(158,189,255)' } },
  {
    id: 'aeroway_runway',
    type: 'line',
    'source-layer': 'aeroway',
    paint: { 'line-color': '#f0ede9', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 3, 20, 16] },
  },
  {
    id: 'aeroway_taxiway',
    type: 'line',
    'source-layer': 'aeroway',
    paint: { 'line-color': '#f0ede9', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.5, 20, 6] },
  },
  { id: 'road_area_pattern', type: 'fill', 'source-layer': 'transportation', paint: { 'fill-pattern': 'pedestrian_polygon' } },
  {
    id: 'boundary_3',
    type: 'line',
    'source-layer': 'boundary',
    paint: { 'line-color': 'hsl(0,0%,70%)', 'line-dasharray': [1, 1], 'line-width': ['interpolate', ['linear', 1], ['zoom'], 7, 1, 11, 2] },
  },
  {
    id: 'highway-name-major',
    type: 'symbol',
    'source-layer': 'transportation_name',
    paint: { 'text-color': '#666', 'text-halo-blur': 0.5, 'text-halo-width': 1 },
  },
];

/** Cuántas capas tenía el estilo completo el día de la captura, para que el recorte se note. */
export const CAPAS_DEL_ESTILO_COMPLETO = 111;
