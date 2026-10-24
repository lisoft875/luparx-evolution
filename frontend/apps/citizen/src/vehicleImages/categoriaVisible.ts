/**
 * La categoría del vehículo, en palabras, tal como la tarjeta la muestra.
 *
 * <h2>El defecto que lo obligó</h2>
 *
 * <p>El 23-10-2026 Javier reportó que «los carros siguen apareciendo como automóvil sin sus
 * respectivas categorías». Medido en la aplicación, la queja era exacta y el sistema ya tenía la
 * respuesta:</p>
 *
 * <pre>
 *   BNY963  Toyota RAV4   → imagen suv-compacta-blanco.webp   insignia «Automóvil»
 *   CL1234  Toyota Hilux  → imagen pickup-plata.webp          insignia «Automóvil»
 * </pre>
 *
 * <p>Es decir: la tarjeta dibujaba una pick-up y, al lado, escribía «Automóvil». La categoría no
 * faltaba —la biblioteca de imágenes la resolvía para elegir el archivo— faltaba <b>decirla</b>.
 * Un dibujo de pick-up junto a la palabra «Automóvil» no es información incompleta, es una
 * contradicción, y quien la lee no sabe cuál de las dos cosas creerle.</p>
 *
 * <h2>Por qué un módulo propio y no una línea en la pantalla</h2>
 *
 * <p>Porque la imagen y la palabra tienen que salir de la MISMA resolución. Si la tarjeta calcula
 * la categoría por su cuenta, el día que cambie una regla de {@link carroceriaDe} —la tabla de
 * modelos, las equivalencias, el orden de mando— el dibujo y el texto se separan otra vez, y el
 * defecto vuelve con otra cara. Acá hay una sola función, la usan las dos, y la comprobación
 * `categoriaVisible.check.mjs` fija que para cada caso digan lo mismo.</p>
 *
 * <h2>Qué afirma, y qué no</h2>
 *
 * <p>La categoría puede venir de dos sitios, y la función <b>distingue cuál</b> en `declarada`:</p>
 *
 * <ul>
 *   <li><b>La persona la eligió</b> en el formulario: es su declaración, y manda.</li>
 *   <li><b>La dedujo la tabla de modelos</b> por marca y modelo: es una estimación.</li>
 * </ul>
 *
 * <p>Las dos se muestran, porque la imagen ya mostraba las dos y callar la estimación no la hacía
 * menos visible: la hacía menos comprobable. Lo que no se hace es presentarlas como lo mismo sin
 * avisar en ninguna parte — de eso se encarga la línea única que ya encabeza la lista.</p>
 *
 * <p><b>Nada de esto cambia el cobro.</b> La tarifa y la fiscalización se deciden por el `type` del
 * servidor, que tiene dos valores, `CAR` y `MOTORCYCLE`. Una pick-up se cobra como automóvil
 * porque <i>es</i> un automóvil; la categoría sólo dice cuál.</p>
 */
import { carroceriaDe, ETIQUETA_DE_CARROCERIA } from './prototipo/catalogoPrototipo';
import { esCarroceriaOfrecida } from './prototipo/catalogoPrototipo';

export interface CategoriaVisible {
  /** La clave i18n del rótulo: `citizen.vehicles.body.pickup`, etc. */
  claveDeEtiqueta: string;
  /** `true` si la persona la eligió; `false` si la dedujo la tabla de modelos. */
  declarada: boolean;
}

/**
 * La categoría que corresponde mostrar, o `null` si no hay ninguna que decir.
 *
 * <p>Devuelve `null` —y entonces la tarjeta se queda con el tipo del servidor, «Automóvil» o
 * «Motocicleta»— en los tres casos en que decir una categoría sería inventarla:</p>
 *
 * <ol>
 *   <li><b>Motocicleta.</b> `carroceriaDe` contesta `null` para `MOTORCYCLE`, y así tiene que
 *       quedar: entre las carrocerías de la biblioteca no hay moto, y una moto no es un sedán.</li>
 *   <li><b>Un tipo que el servidor agregue mañana</b> y esta tabla no conozca. Cae en `null`, no en
 *       «sedán»: es la misma regla que ya protege al dibujo.</li>
 *   <li><b>Una carrocería sin rótulo traducido</b> —`electrico` existe en la biblioteca pero no
 *       está entre las categorías que Javier pidió—. Sin texto que mostrar no se muestra ninguno,
 *       antes que enseñar una clave de traducción cruda.</li>
 * </ol>
 */
export function categoriaVisible(vehiculo: {
  type?: string;
  brand?: string;
  model?: string;
  /** La carrocería que la persona eligió, si eligió alguna. */
  carroceria?: string | null;
}): CategoriaVisible | null {
  const resuelta = carroceriaDe({
    type: vehiculo.type,
    brand: vehiculo.brand,
    model: vehiculo.model,
    carroceria: vehiculo.carroceria ?? undefined,
  });
  if (!resuelta) return null;

  const claveDeEtiqueta = ETIQUETA_DE_CARROCERIA[resuelta];
  if (!claveDeEtiqueta) return null;

  /*
    «Declarada» es que la persona eligió ESA, no que eligió algo. Si eligió una carrocería que las
    equivalencias traducen a otra —el coupé, que se dibuja como sedán— lo que se muestra ya no es
    lo que dijo, así que no se le atribuye a ella.
  */
  return {
    claveDeEtiqueta,
    declarada: esCarroceriaOfrecida(vehiculo.carroceria) && vehiculo.carroceria === resuelta,
  };
}
