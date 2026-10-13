/**
 * Abrir la posición comprobada en Google Maps o en Waze.
 *
 * <h2>Por qué esto es un módulo y no dos plantillas dentro de la pantalla</h2>
 *
 * <p>Porque la parte difícil no es la pantalla, es el FORMATO de las coordenadas, y es el tipo de
 * cosa que se escribe mal una vez y nadie vuelve a mirar. Dos trampas concretas:</p>
 *
 * <ul>
 *   <li><b>El separador decimal.</b> En Costa Rica la coma es el separador decimal, y cualquier
 *       función de formato con configuración regional escribiría «9,933000». Las dos URL esperan
 *       un punto y la coma SEPARA la latitud de la longitud, así que una coordenada formateada
 *       para leerse manda a la otra punta del mundo. Por eso acá se usa `toFixed`, que no mira la
 *       configuración regional nunca.</li>
 *   <li><b>La precisión.</b> Seis decimales son ~11cm, que es más de lo que cualquier receptor da
 *       y lo mismo que guarda una boleta. Mandar el número con quince decimales no añade nada y
 *       ensucia el enlace.</li>
 * </ul>
 *
 * <h2>Las dos direcciones son las oficiales</h2>
 *
 * <p>Google Maps URLs API y Waze deep links, las dos documentadas por su fabricante y las dos
 * pensadas para funcionar igual en teléfono y en escritorio: en un teléfono con la aplicación
 * instalada la abren, y si no, abren su web. No hace falta detectar el aparato ni mantener dos
 * variantes, que es justo el tipo de código que envejece mal.</p>
 *
 * <ul>
 *   <li>https://developers.google.com/maps/documentation/urls/get-started</li>
 *   <li>https://developers.google.com/waze/deeplinks/</li>
 * </ul>
 */

/** Seis decimales y punto decimal, pase lo que pase con la configuración regional. */
function coordenada(valor: number): string {
  return valor.toFixed(6);
}

/**
 * ¿Es una posición que se puede mandar a un mapa?
 *
 * <p>Se comprueba, y no es paranoia: un `NaN` o un infinito producirían una URL que el mapa abre
 * igual, en el punto que le dé la gana. Y el (0, 0) del Golfo de Guinea es el resultado clásico de
 * un receptor que contestó sin tener nada — el encargo prohíbe «construir una ruta con coordenadas
 * ficticias», y ésa es la ficticia más común.</p>
 */
export function posicionUsable(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}

/** Google Maps: una chincheta en el punto, sin ruta. El inspector decide si navega. */
export function enlaceGoogleMaps(lat: number, lon: number): string | null {
  if (!posicionUsable(lat, lon)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${coordenada(lat)},${coordenada(lon)}`;
}

/**
 * Waze: el punto, y `navigate=yes` para que ofrezca la ruta.
 *
 * <p>La coma va codificada (`%2C`) porque es el separador del propio parámetro `ll` y Waze
 * documenta así el enlace.</p>
 */
export function enlaceWaze(lat: number, lon: number): string | null {
  if (!posicionUsable(lat, lon)) return null;
  return `https://waze.com/ul?ll=${coordenada(lat)}%2C${coordenada(lon)}&navigate=yes`;
}
