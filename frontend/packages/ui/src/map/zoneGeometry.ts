/**
 * Geometría de zona → lo que un mapa necesita dibujar.
 *
 * Puro y sin dependencias: acá no entra MapLibre ni ninguna librería de mapas. Eso permite probar el
 * cálculo sin navegador y, sobre todo, cambiar de librería sin reescribir la lógica — que es la
 * razón por la que el centroide y el encuadre se calculan acá y no dentro del componente.
 */

import type { GeoJsonGeometry, ZoneGeoJsonFeatureCollection } from '@luparx/api-client';

export interface PuntoZona {
  id: string;
  code: string;
  name: string;
  /** Centroide: dónde va el pin. */
  lon: number;
  lat: number;
}

export interface Encuadre {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Lo que el servidor considera un límite oficial. */
const VERIFICADA = 'VERIFIED';

/**
 * El rótulo que va encima de la zona en el mapa: nombre, tarifa y, cuando toca, el aviso.
 *
 * <p>El boceto escribe «Zona Centro» y debajo «₡450/h». El nombre viene en el GeoJSON; la tarifa
 * NO —el servidor manda código, nombre, procedencia y estado, y ningún precio—, así que la pone
 * quien la tiene a mano. Si no la tiene, el rótulo es sólo el nombre: media verdad es peor que
 * una línea menos.</p>
 *
 * <p>Y si la geometría no está verificada, el rótulo lo dice con palabras. El contorno punteado y
 * el color ya lo señalan, pero ninguno de los dos se lee en una captura de pantalla reenviada por
 * WhatsApp, que es como viajan estas imágenes.</p>
 */
export function etiquetaDeZona(
  nombre: string,
  tarifa: string | undefined,
  estado: string,
): string {
  const lineas = [nombre];
  if (tarifa) lineas.push(tarifa);
  if (estado !== VERIFICADA) lineas.push('DEMO · no oficial');
  return lineas.join('\n');
}

/** Todas las coordenadas de una geometría, sin importar si es Polygon o MultiPolygon. */
function coordenadas(geom: GeoJsonGeometry): [number, number][] {
  if (geom.type === 'Polygon') {
    return geom.coordinates.flat() as [number, number][];
  }
  return geom.coordinates.flat(2) as [number, number][];
}

/**
 * Centroide del polígono por promedio de vértices.
 *
 * NO es el centroide de área (el de Green), que pondera por superficie. Para un pin sobre un barrio
 * la diferencia es de metros y no justifica la complejidad; si algún día una zona tiene forma de L
 * o de anillo, el pin podría caer fuera del polígono y ahí sí habría que usar `ST_PointOnSurface`
 * del lado del servidor, que garantiza un punto interior.
 */
export function centroide(geom: GeoJsonGeometry): { lon: number; lat: number } | null {
  const pts = coordenadas(geom);
  if (pts.length === 0) return null;
  // El primer y el último vértice de un anillo GeoJSON son el mismo punto: contarlo dos veces
  // sesgaría el promedio hacia esa esquina.
  const unicos = pts.length > 1 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1]
    ? pts.slice(0, -1)
    : pts;
  if (unicos.length === 0) return null;
  let sLon = 0;
  let sLat = 0;
  for (const [lon, lat] of unicos) {
    sLon += lon;
    sLat += lat;
  }
  return { lon: sLon / unicos.length, lat: sLat / unicos.length };
}

/** Un pin por zona con geometría. Las zonas sin dibujar se omiten: no se inventa una posición. */
export function puntosDeZonas(fc: ZoneGeoJsonFeatureCollection | undefined): PuntoZona[] {
  if (!fc?.features?.length) return [];
  const out: PuntoZona[] = [];
  for (const f of fc.features) {
    const c = f.geometry ? centroide(f.geometry) : null;
    if (!c) continue;
    out.push({ id: f.id, code: f.properties.code, name: f.properties.name, lon: c.lon, lat: c.lat });
  }
  return out;
}

/**
 * Encuadre que contiene todas las zonas, con un margen para que ningún pin quede pegado al borde.
 *
 * Devuelve `null` cuando no hay geometría, y el componente decide qué hacer: mostrar el mapa en su
 * posición por defecto es una decisión de presentación, no de cálculo.
 */
export function encuadreDe(fc: ZoneGeoJsonFeatureCollection | undefined, margen = 0.15): Encuadre | null {
  if (!fc?.features?.length) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const f of fc.features) {
    if (!f.geometry) continue;
    for (const [lon, lat] of coordenadas(f.geometry)) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon)) return null;
  // Una sola zona da un rectángulo de ancho cero; el margen relativo sería cero y el mapa quedaría
  // con un zoom imposible. De ahí el mínimo absoluto.
  const dLon = Math.max((maxLon - minLon) * margen, 0.002);
  const dLat = Math.max((maxLat - minLat) * margen, 0.002);
  return {
    minLon: minLon - dLon,
    minLat: minLat - dLat,
    maxLon: maxLon + dLon,
    maxLat: maxLat + dLat,
  };
}
