import type { ParkingZone } from '@luparx/api-client';

/**
 * La tarifa de una zona, escrita como la escribe el boceto: «₡450/h».
 *
 * <h2>El precio es del servidor, siempre</h2>
 *
 * <p>Una zona trae `durations`: una entrada por cada duración que esa municipalidad vende, con su
 * importe. El rótulo del mapa usa <b>la entrada de 60 minutos, tal cual</b>. No se divide el precio
 * de dos horas entre dos ni se multiplica el de media hora: el propio contrato advierte que la
 * escalera de precios casi nunca es lineal, y una cuenta así pondría sobre el mapa un número que la
 * municipalidad nunca cobró.</p>
 *
 * <p>Si esta zona no vende una hora, se rotula la duración más corta que sí vende, con su duración
 * escrita al lado —«₡225/30 min»— para que nadie lea por hora lo que no lo es. Y si no hay
 * ninguna, no hay rótulo de tarifa: el mapa muestra sólo el nombre de la zona.</p>
 *
 * @param formatear cómo escribir un importe; lo trae la pantalla, que conoce el idioma activo
 */
export function tarifaDeZona(
  zona: ParkingZone,
  formatear: (importeMenor: number, moneda: string) => string,
): string | undefined {
  const duraciones = zona.durations ?? [];
  if (duraciones.length === 0) return undefined;

  const unaHora = duraciones.find((d) => d.minutes === 60);
  if (unaHora) return `${formatear(unaHora.amountMinor, unaHora.currencyCode)}/h`;

  const masCorta = duraciones.reduce((menor, d) => (d.minutes < menor.minutes ? d : menor));
  return `${formatear(masCorta.amountMinor, masCorta.currencyCode)}/${masCorta.minutes} min`;
}

/** Las tarifas de todas las zonas, por código, que es la clave con la que viaja el GeoJSON. */
export function tarifasPorCodigo(
  zonas: ParkingZone[] | undefined,
  formatear: (importeMenor: number, moneda: string) => string,
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const zona of zonas ?? []) {
    const tarifa = tarifaDeZona(zona, formatear);
    if (tarifa) salida[zona.code] = tarifa;
  }
  return salida;
}
