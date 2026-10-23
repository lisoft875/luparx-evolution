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
/*
  La pregunta «¿hay mapa?» se exporta también acá por comodidad de quien ya importa el mapa,
  pero su entrada propia es `@luparx/ui/map-disponibilidad`: una pantalla que sólo quiere PREGUNTAR
  —para no ofrecer un botón que promete un mapa que no va a aparecer— no debe arrastrar ZoneMap al
  paquete inicial sólo por preguntar.
*/
export { sePuedeDibujarElMapa, hayProveedorDeMapa } from './disponibilidad';
