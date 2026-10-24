/**
 * ¿Se puede dibujar un mapa, de verdad? — y por qué esto vive en su propio archivo.
 *
 * <h2>El defecto que lo obligó</h2>
 *
 * <p>El 23-10-2026 Javier fotografió en staging la pantalla «¡Listo!» con un botón que decía
 * «Ocultar el mapa» y ningún mapa debajo. Ocultar y volver a mostrar no lo arreglaba, porque no
 * había nada que ocultar ni que mostrar.</p>
 *
 * <p>El botón no estaba roto: guardaba la intención de la persona —«quiero verlo»— mientras el
 * componente, por su lado y con otros datos, decidía que no había nada que dibujar. Dos verdades
 * sobre la misma pantalla, y la que se leía era la equivocada. La regla se saca acá para que quien
 * OFRECE el control y quien DIBUJA el mapa contesten lo mismo a la misma pregunta.</p>
 *
 * <h2>Por qué un módulo aparte y no dentro de ZoneMap</h2>
 *
 * <p>Porque quien necesita preguntar es la pantalla, y la pantalla carga el mapa con `import()`
 * perezoso: MapLibre pesa 800 kB y la mayoría de las sesiones no abren el mapa. Importar la
 * pregunta desde `@luparx/ui/map` arrastraría `ZoneMap` al paquete inicial —el paquete no declara
 * `sideEffects: false`, así que el empaquetador no puede descartarlo— y se perdería justamente lo
 * que la carga perezosa protege. Este archivo no importa nada del mapa, así que se puede preguntar
 * sin pagar el mapa.</p>
 */

/**
 * La URL del estilo, o `null` cuando esta instalación no tiene proveedor configurado.
 *
 * <p>Repetida a propósito de `estiloOscuro.urlDelEstilo`, y sólo esto: traerla de allá importaría
 * `oscurecer` y la paleta, que son del dibujo. Las dos leen la MISMA variable y aplican la MISMA
 * regla, y `disponibilidad.check.mjs` compara los dos archivos para que no se separen en silencio.
 * Si esta copia se vuelve una tercera cosa, esa comprobación falla.</p>
 */
export function hayProveedorDeMapa(): boolean {
  let bruta = '';
  try {
    bruta = (
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
        ?.VITE_MAP_STYLE_URL ?? ''
    ).trim();
  } catch {
    return false;
  }
  if (!bruta) return false;
  try {
    return new URL(bruta).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * La condición única: hay mapa si hay proveedor **y** hay dónde centrarlo.
 *
 * <p>«Dónde centrarlo» son los polígonos, o un centro real dado. Sin ninguno de los dos no se
 * dibuja, y eso no es pereza: centrar en el país ya se probó el 21-10 y lo que apareció debajo de
 * «Barrio Amón» fue un mapa de Costa Rica y Panamá. La orden del 22-10 lo prohíbe con todas las
 * letras, y la del 23-10 —«mostrar calles sin polígonos»— se cumple pasando `hayCentro`, no
 * quitando la condición.</p>
 */
export function sePuedeDibujarElMapa(datos: {
  /** ¿Está configurado el proveedor de teselas? */
  estiloConfigurado: boolean;
  /** ¿Llegó al menos un polígono? */
  hayGeometrias: boolean;
  /** ¿Hay un centro real con el que encuadrar sin polígonos? */
  hayCentro?: boolean;
}): boolean {
  if (!datos.estiloConfigurado) return false;
  return datos.hayGeometrias || Boolean(datos.hayCentro);
}

/** Un centro de mapa: dónde mirar cuando no hay ningún polígono que encuadrar. */
export interface CentroDeMapa {
  lon: number;
  lat: number;
  zoom?: number;
}

/**
 * Los centros por municipalidad que configuró quien despliega.
 *
 * <h2>Por qué existe esto, y por qué NO lo rellena Claude</h2>
 *
 * <p>La orden del 23-10-2026 pide calles debajo del selector de Zona «aun sin polígonos». Para
 * dibujar un mapa hace falta saber dónde mirar, y <b>ese dato no existe en ninguna parte del
 * sistema</b>: revisadas las migraciones, `tenants` no guarda coordenadas (`V4_0__tenancy.sql`),
 * `administrative_divisions` tampoco (`V2_0__geo.sql`), y las únicas de la base son
 * `parking_zones.geom` y las de Fiscalización. La misma orden prohíbe fabricar posiciones.</p>
 *
 * <p>La salida honesta no es inventarlo ni esperar a un cambio de contrato: es dejar que lo
 * aporte quien SÍ lo sabe, de la misma forma en que ya se aporta el proveedor de teselas — una
 * variable de despliegue. Las coordenadas las pone Javier o la municipalidad y se pueden
 * verificar; acá no hay ninguna escrita.</p>
 *
 * <p>Formato, una municipalidad por coma, identificada por su `slug`:</p>
 *
 * <pre>VITE_MAP_CENTERS="&lt;slug&gt;:&lt;lon&gt;,&lt;lat&gt;[,&lt;zoom&gt;];&lt;slug&gt;:&lt;lon&gt;,&lt;lat&gt;"</pre>
 *
 * <p>El ejemplo va con marcadores y no con números de verdad a propósito: una coordenada escrita
 * acá, aunque sea «sólo un comentario», es una coordenada que alguien copia. `estiloEnElDespliegue`
 * comprueba que este archivo no contenga ninguna, y esa comprobación cazó la primera versión de
 * este mismo bloque.</p>
 *
 * <p>El zoom es opcional. Un trozo mal escrito se descarta en silencio y los demás siguen
 * valiendo: media configuración es mejor que ninguna, y un mapa de menos no rompe el
 * estacionamiento.</p>
 *
 * <p><b>Esto es un puente, no el destino.</b> El día que el contrato publique un centro por
 * municipalidad —o que la municipalidad cargue sus perímetros, que es mejor todavía— esta
 * variable se queda vacía y nadie la echa de menos.</p>
 */
export function centroConfigurado(slug: string | null | undefined): CentroDeMapa | null {
  if (!slug) return null;
  let bruta = '';
  try {
    bruta = (
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
        ?.VITE_MAP_CENTERS ?? ''
    ).trim();
  } catch {
    return null;
  }
  if (!bruta) return null;

  for (const trozo of bruta.split(';')) {
    const corte = trozo.indexOf(':');
    if (corte < 0) continue;
    if (trozo.slice(0, corte).trim() !== slug) continue;
    const partes = trozo.slice(corte + 1).split(',').map((n) => Number(n.trim()));
    const [lon, lat, zoom] = partes;
    /*
      Se validan los rangos y no sólo que sean números: un `lat` y un `lon` cambiados de orden —el
      error más común al copiar coordenadas, porque GeoJSON los escribe al revés que casi todo lo
      demás— caen fuera de rango para Costa Rica y se descartan en vez de llevar el mapa al océano
      Índico. Latitud ±90, longitud ±180, y NaN fuera.
    */
    if (lon === undefined || lat === undefined) return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const conZoom = zoom !== undefined && Number.isFinite(zoom) && zoom > 0 && zoom <= 22;
    return conZoom ? { lon, lat, zoom } : { lon, lat };
  }
  return null;
}
