/**
 * Punto de entrada aparte: `@luparx/ui/map`.
 *
 * <p>El mapa NO se exporta desde `@luparx/ui` a secas. Si lo hiciera, MapLibre entraría en el
 * paquete de los cuatro portales, incluidos los tres que no dibujan ningún mapa. Con una entrada
 * propia, y con el `import()` perezoso que hace el componente, sólo paga quien lo abre.</p>
 */
export { ZoneMap } from './ZoneMap';
export type { ZoneMapProps, ZoneMapTextos } from './ZoneMap';
export { centroide, puntosDeZonas, encuadreDe } from './zoneGeometry';
export type { PuntoZona, Encuadre } from './zoneGeometry';
export { PALETA_MAPA, oscurecer, urlDelEstilo } from './estiloOscuro';
export { VERIFICADA, FUENTE, capasDeZonas } from './capas';
export type { CapaDeZonas } from './capas';
