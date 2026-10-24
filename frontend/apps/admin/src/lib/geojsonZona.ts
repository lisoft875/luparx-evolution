import type { GeoJsonGeometry } from '@luparx/api-client';

/**
 * Valida y resume un GeoJSON pegado para el perímetro de una zona, ANTES de mandarlo al servidor.
 *
 * El backend es la autoridad; esto evita el viaje perdido y, sobre todo, el error más común y más
 * caro de un perímetro mal pegado: invertir lon/lat. Un polígono con la latitud donde va la
 * longitud «valida» como JSON y cae en el océano Índico; acá se ve al instante en la caja y en el
 * aviso de «fuera de Costa Rica». No reencoda ni corrige: solo lee, valida forma y rangos, y resume.
 */
export interface ResumenGeometria {
  tipo: 'Polygon' | 'MultiPolygon';
  anillos: number;
  vertices: number;
  oeste: number;
  sur: number;
  este: number;
  norte: number;
  dentroDeCostaRica: boolean;
}

export type ResultadoValidacion =
  | { ok: true; geometry: GeoJsonGeometry; resumen: ResumenGeometria }
  | { ok: false; error: string };

// Caja aproximada de Costa Rica (continental + Isla del Coco queda fuera a propósito: un perímetro
// de parquímetros no está en el Coco). Es un AVISO, no un bloqueo.
const CR = { oeste: -86.0, sur: 8.0, este: -82.5, norte: 11.3 };

function esPosicion(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number';
}

function validarAnillo(anillo: unknown): string | Array<[number, number]> {
  if (!Array.isArray(anillo) || anillo.length < 4) {
    return 'un anillo necesita al menos 4 posiciones y cerrar sobre la primera';
  }
  const pts: Array<[number, number]> = [];
  for (const p of anillo) {
    if (!esPosicion(p)) return 'cada posición debe ser [lon, lat] numérico';
    const [lon, lat] = p;
    if (lon < -180 || lon > 180) return `longitud fuera de rango (${lon}); el orden GeoJSON es [lon, lat]`;
    if (lat < -90 || lat > 90) return `latitud fuera de rango (${lat}); el orden GeoJSON es [lon, lat]`;
    pts.push([lon, lat]);
  }
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) {
    return 'el anillo no cierra: la primera y la última posición deben coincidir';
  }
  return pts;
}

export function validarGeoJsonZona(texto: string): ResultadoValidacion {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'no es JSON válido' };
  }
  // Acepta una geometría suelta, o un Feature / FeatureCollection con exactamente una geometría.
  let geom = crudo as { type?: string; geometry?: unknown; features?: unknown; coordinates?: unknown };
  if (geom && geom.type === 'Feature') geom = geom.geometry as typeof geom;
  if (geom && geom.type === 'FeatureCollection') {
    const feats = Array.isArray(geom.features) ? geom.features : [];
    if (feats.length !== 1) {
      return { ok: false, error: 'un FeatureCollection debe traer exactamente una geometría' };
    }
    geom = (feats[0] as { geometry?: unknown })?.geometry as typeof geom;
  }
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
    return { ok: false, error: 'la geometría debe ser Polygon o MultiPolygon (WGS84, lon/lat)' };
  }
  const poligonos: unknown[] = geom.type === 'Polygon' ? [geom.coordinates] : (geom.coordinates as unknown[]);
  if (!Array.isArray(poligonos) || poligonos.length === 0) {
    return { ok: false, error: 'sin coordenadas' };
  }
  let anillos = 0;
  let vertices = 0;
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  for (const poli of poligonos) {
    if (!Array.isArray(poli) || poli.length === 0) {
      return { ok: false, error: 'un polígono necesita al menos un anillo exterior' };
    }
    for (const anillo of poli) {
      const r = validarAnillo(anillo);
      if (typeof r === 'string') return { ok: false, error: r };
      anillos += 1;
      vertices += r.length;
      for (const [lon, lat] of r) {
        if (lon < oeste) oeste = lon;
        if (lon > este) este = lon;
        if (lat < sur) sur = lat;
        if (lat > norte) norte = lat;
      }
    }
  }
  const dentroDeCostaRica = oeste >= CR.oeste && este <= CR.este && sur >= CR.sur && norte <= CR.norte;
  return {
    ok: true,
    geometry: geom as unknown as GeoJsonGeometry,
    resumen: { tipo: geom.type, anillos, vertices, oeste, sur, este, norte, dentroDeCostaRica },
  };
}
