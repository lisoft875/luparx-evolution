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
