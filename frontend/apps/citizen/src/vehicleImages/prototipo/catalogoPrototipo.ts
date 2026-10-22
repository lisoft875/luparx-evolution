/**
 * La biblioteca de prototipo: qué carrocería y qué color le toca a un vehículo del dominio.
 *
 * <h2>Qué es esto y qué NO es</h2>
 *
 * <p>Son 100 imágenes —10 carrocerías × 10 colores— entregadas por Javier el 22-10-2026. El propio
 * paquete las define así, en su `vehicles.manifest.json`: <i>«derivadas de 10 recortes de láminas
 * de referencia… recoloración aproximada; NO renders individuales originales»</i>. Son
 * <b>recursos de prototipo</b>, no fotografías oficiales de ningún fabricante, y así se tratan
 * acá: ninguna afirma marca ni modelo, sólo <b>forma</b> y <b>color</b>.</p>
 *
 * <p>Eso es exactamente lo que ya afirmaba `VehicleThumb`, el dibujo: tipo y color, los dos del
 * servidor. La imagen de prototipo dice lo mismo con mejor acabado. Lo que sigue sin existir —y
 * por eso la carpeta `../assets` sigue vacía— es una fotografía con licencia del modelo concreto.</p>
 *
 * <h2>Lo que el dominio puede decir, que es mucho menos de lo que la biblioteca ofrece</h2>
 *
 * <p><b>`GET /catalog/vehicle-types` devuelve DOS valores: `CAR` y `MOTORCYCLE`.</b> Ni uno más.
 * `PICKUP`, `VAN` y `OTHER` existieron y se retiraron en `V16_0__vehicle_type_car_or_motorcycle`,
 * porque ninguna tarifa, ningún reporte y ninguna regla de fiscalización los distinguía. Y
 * `GET /catalog/vehicle-colors` devuelve DOCE, no ocho.</p>
 *
 * <p>Esto hay que decirlo porque la primera versión de este archivo no lo sabía: se escribió
 * leyendo `mocks/data.ts` —el transporte simulado, que llevaba dieciocho versiones desactualizado—
 * en vez de los enums `VehicleType` y `VehicleColor` del backend. El resultado era que las veinte
 * imágenes de `pickup` y `van-comercial` eran inalcanzables (el servidor nunca emite esas claves) y
 * que un carro beige o naranja caía al dibujo teniendo su imagen disponible. Ninguna prueba lo vio,
 * porque todas corrían contra esa misma transcripción.</p>
 *
 * <p>La consecuencia de diseño es importante: con un solo tipo para todo lo que no es moto,
 * <b>marca + modelo es la ÚNICA vía</b> para saber si algo es una SUV, una pick-up o un hatchback.
 * Son texto libre y opcionales, así que un vehículo sin ellos se dibuja como sedán, que es la forma
 * más común y la que menos afirma.</p>
 *
 * <p>No se agrega ningún campo al contrato para arreglar esto: la orden lo prohíbe en letra, y
 * además sería volver a poner en el formulario lo que `V16_0` quitó con razones. Lo que no se puede
 * saber, no se inventa; se cae al dibujo.</p>
 *
 * <h2>Las tres carrocerías que NO se usan</h2>
 *
 * <p>Revisadas las 70 combinaciones alcanzables desde el contrato, tres filas enteras salieron mal
 * recoloreadas y se ven en la pantalla, no en una medición de laboratorio:</p>
 *
 * <ul>
 *   <li><b>coupe</b>: blanco, plata y gris salen ROSA;</li>
 *   <li><b>suv-grande</b>: blanco, plata y gris salen prácticamente NEGROS;</li>
 *   <li><b>suv-premium</b>: blanco, plata y gris salen VERDE OSCURO.</li>
 * </ul>
 *
 * <p>Mostrarle a alguien su carro blanco pintado de negro es peor que mostrarle un dibujo, así que
 * esas tres se sustituyen por la carrocería equivalente más cercana entre las que sí funcionan
 * (ver {@link EQUIVALENCIAS}). El día que lleguen activos corregidos, se vacía ese objeto y las
 * tres vuelven a usarse sin tocar nada más.</p>
 */

/**
 * Las carrocerías de la biblioteca, tal y como se llaman los archivos.
 *
 * <p>Las diez primeras son las que el paquete del 22-10-2026 entregó. <b>`moto` está declarada y
 * no tiene ni un archivo todavía</b>, y es deliberado: así el día que lleguen los activos basta
 * con dejarlos en la carpeta con su nombre —`moto-rojo.webp`— y empiezan a verse sin tocar una
 * línea. Mientras no estén, la búsqueda no encuentra archivo y manda el dibujo, que es lo correcto.
 * Lo que NO puede pasar nunca es que una moto reciba la foto de un automóvil: la clave que se
 * busca es `moto-…`, y sólo un archivo `moto-…` puede responder a ella.</p>
 */
export const CARROCERIAS = [
  'sedan', 'suv-compacta', 'pickup', 'hatchback', 'suv-grande',
  'coupe', 'minivan', 'van-comercial', 'electrico', 'suv-premium',
  'moto',
] as const;

/** Las carrocerías que el paquete entregó con archivos. `moto` no está. */
export const CARROCERIAS_ENTREGADAS = CARROCERIAS.filter((c) => c !== 'moto');
export type Carroceria = (typeof CARROCERIAS)[number];

/** Los diez colores de la biblioteca. Sólo siete son alcanzables desde el catálogo del servidor. */
export const COLORES_PROTOTIPO = [
  'blanco', 'plata', 'gris', 'negro', 'rojo',
  'azul', 'azul-oscuro', 'verde', 'beige', 'naranja',
] as const;
export type ColorPrototipo = (typeof COLORES_PROTOTIPO)[number];

/**
 * Carrocerías cuyas imágenes están mal recoloreadas, y por cuál se sustituye cada una.
 *
 * <p>La sustitución no es un parche cosmético: las diez carrocerías ya son una generalización —un
 * RAV4 y un Tucson comparten dibujo—, así que representar un Prado con la SUV compacta está dentro
 * de lo que la biblioteca ya afirma. Lo que NO está dentro es pintar de negro un carro blanco.</p>
 *
 * <p>Vaciar este objeto vuelve a habilitar las tres. Los archivos siguen en la carpeta.</p>
 */
export const EQUIVALENCIAS: Partial<Record<Carroceria, Carroceria>> = {
  coupe: 'sedan',
  'suv-grande': 'suv-compacta',
  'suv-premium': 'suv-compacta',
};

/**
 * `GET /catalog/vehicle-types` → carrocería de partida. **Son dos valores, no cinco.**
 *
 * <p>`CAR` abre en sedán y lo afina {@link POR_MODELO}: es el punto de partida más común y el que
 * menos afirma. `MOTORCYCLE` devuelve `null` —«no hay imagen para esto»— porque entre las diez
 * carrocerías de la biblioteca <b>no hay moto</b>, y manda el dibujo, que sí tiene su silueta.
 * Dibujar una moto como si fuera un automóvil sería el error más visible de toda la integración, y
 * es exactamente lo que hacía el componente que venía en el paquete, con su `?? 'sedan'`.</p>
 *
 * <p>Un valor que esta tabla no conozca —porque el catálogo del servidor crezca— también devuelve
 * `null`. Un tipo nuevo sin imagen pensada es un tipo que se dibuja, no uno al que se le adivina la
 * forma.</p>
 */
const POR_TIPO: Record<string, Carroceria | null> = {
  CAR: 'sedan',
  /*
    Apunta a `moto`, una carrocería declarada y SIN archivos. Hoy la búsqueda no encuentra nada y
    manda el dibujo —el mismo resultado que antes—, pero el cableado ya está hecho y probado: el
    día que lleguen los activos aprobados se dejan en la carpeta y aparecen solos.
  */
  MOTORCYCLE: 'moto',
};

/**
 * `marca modelo` normalizado → carrocería.
 *
 * <p><b>Esta tabla es el corazón del emparejamiento</b>, y no por elegancia: desde `V16_0` el
 * contrato sólo distingue automóvil de moto, así que una pick-up, una SUV y un hatchback llegan
 * todos como `CAR`. Sin esta tabla, las veinte imágenes de `pickup` y `van-comercial` y las de
 * `hatchback` no las alcanzaría ningún vehículo real.</p>
 *
 * <p>Sólo afina lo que el tipo ya dijo que es un automóvil: un modelo de acá no convierte en
 * automóvil algo que el servidor declaró motocicleta. El servidor sabe más que una tabla escrita a
 * mano.</p>
 *
 * <p>Las claves van normalizadas (minúscula, sin tildes ni separadores), así que «RAV4», «Rav-4» y
 * «rav 4» caen todas en `toyotarav4`. Un modelo que no esté se queda en sedán; agregar uno es una
 * línea acá y nada más.</p>
 */
const POR_MODELO: Record<string, Carroceria> = {
  // --- pick-ups. Llegan como CAR, así que ésta es la única vía para reconocerlas. ---
  toyotahilux: 'pickup', toyotatacoma: 'pickup',
  nissanfrontier: 'pickup', nissannp300: 'pickup',
  fordranger: 'pickup', mitsubishil200: 'pickup',
  isuzudmax: 'pickup', chevroletdmax: 'pickup', mazdabt50: 'pickup',
  greatwallpoer: 'pickup', greatwallwingle: 'pickup', jact8: 'pickup',
  volkswagenamarok: 'pickup',

  // --- furgonetas de carga y pasajeros ---
  toyotahiace: 'van-comercial', nissanurvan: 'van-comercial',
  hyundaih1: 'van-comercial', hyundaistarex: 'van-comercial',
  fordtransit: 'van-comercial', mercedesbenzsprinter: 'van-comercial',
  renaultkangoo: 'van-comercial', chevroletn300: 'van-comercial',

  // --- monovolúmenes ---
  toyotasienna: 'minivan', hondaodyssey: 'minivan', kiacarnival: 'minivan',
  chryslerpacifica: 'minivan', toyotaavanza: 'minivan',

  // --- SUV compactas y crossovers, el grupo más numeroso en Costa Rica ---
  toyotarav4: 'suv-compacta', toyotacorollacross: 'suv-compacta',
  toyotayariscross: 'suv-compacta', toyotarush: 'suv-compacta',
  suzukivitara: 'suv-compacta', suzukigrandvitara: 'suv-compacta',
  suzukijimny: 'suv-compacta', suzukisx4: 'suv-compacta',
  hondacrv: 'suv-compacta', hondahrv: 'suv-compacta',
  hyundaitucson: 'suv-compacta', hyundaicreta: 'suv-compacta',
  hyundaikona: 'suv-compacta', hyundaivenue: 'suv-compacta',
  kiasportage: 'suv-compacta', kiaseltos: 'suv-compacta', kiasonet: 'suv-compacta',
  nissankicks: 'suv-compacta', nissanxtrail: 'suv-compacta', nissanqashqai: 'suv-compacta',
  mazdacx5: 'suv-compacta', mazdacx30: 'suv-compacta', mazdacx3: 'suv-compacta',
  mitsubishioutlander: 'suv-compacta', mitsubishiasx: 'suv-compacta',
  fordescape: 'suv-compacta', fordecosport: 'suv-compacta',
  volkswagentcross: 'suv-compacta', volkswagentiguan: 'suv-compacta',
  chevrolettracker: 'suv-compacta', chevroletcaptiva: 'suv-compacta',
  cherytiggo2: 'suv-compacta', cherytiggo4: 'suv-compacta',
  havaljolion: 'suv-compacta', havalh6: 'suv-compacta',
  subaruforester: 'suv-compacta', subaruxv: 'suv-compacta',
  jeeprenegade: 'suv-compacta', jeepcompass: 'suv-compacta',

  // --- SUV grandes. Se sustituyen por la compacta: ver EQUIVALENCIAS. ---
  toyotaprado: 'suv-grande', toyotalandcruiser: 'suv-grande',
  toyotafortuner: 'suv-grande', toyota4runner: 'suv-grande',
  cherytiggo8: 'suv-grande',
  mitsubishimontero: 'suv-grande', fordexplorer: 'suv-grande',
  chevrolettahoe: 'suv-grande', cherytiggo8pro: 'suv-grande',
  kiasorento: 'suv-grande', hyundaisantafe: 'suv-grande', nissanpathfinder: 'suv-grande',

  // --- hatchbacks ---
  suzukiswift: 'hatchback', suzukicelerio: 'hatchback', suzukialto: 'hatchback',
  kiapicanto: 'hatchback', kiario: 'hatchback',
  hyundaii10: 'hatchback', hyundaii20: 'hatchback', hyundaigrandi10: 'hatchback',
  nissanmarch: 'hatchback', nissannote: 'hatchback',
  hondafit: 'hatchback', mazda2: 'hatchback', chevroletspark: 'hatchback',
  toyotaaygo: 'hatchback', volkswagengol: 'hatchback', volkswagenpolo: 'hatchback',
  byddolphin: 'hatchback',

  // --- sedanes. Están para que una marca conocida no dependa del respaldo. ---
  toyotacorolla: 'sedan', toyotayaris: 'sedan', toyotacamry: 'sedan',
  hondacivic: 'sedan', hondaaccord: 'sedan',
  hyundaielantra: 'sedan', hyundaiaccent: 'sedan',
  kiaforte: 'sedan', kiacerato: 'sedan',
  nissansentra: 'sedan', nissanversa: 'sedan', nissanaltima: 'sedan',
  mazda3: 'sedan', mazda6: 'sedan',
  mitsubishilancer: 'sedan', volkswagenjetta: 'sedan', volkswagenvirtus: 'sedan',
  chevroletonix: 'sedan', bydseal: 'sedan', teslamodel3: 'sedan',

  /*
    Eléctricos con forma de crossover.

    La carrocería `electrico` de la biblioteca NO es «un eléctrico»: es una forma, la de un
    crossover moderno. Se usa modelo por modelo y nunca por la propulsión —la propia orden del
    paquete lo prohíbe: «no inferir carrocería por propulsión eléctrica»—. Un Leaf es un hatchback
    y está arriba; un Model 3 es un sedán y está arriba.
  */
  teslamodely: 'electrico', bydyuanplus: 'electrico', bydatto3: 'electrico',
  geelyex5: 'electrico', volvoex30: 'electrico', mgzsev: 'electrico',
  nissanleaf: 'hatchback',
};

/**
 * `GET /catalog/vehicle-colors` → color de la biblioteca. **Son doce valores, no ocho.**
 *
 * <p>Nueve de los doce tienen imagen. Los otros tres devuelven `null` y van al dibujo, cada uno por
 * su razón:</p>
 *
 * <ul>
 *   <li><b>`YELLOW`</b> y <b>`BROWN`</b>: la biblioteca no trae esos colores. Pintar un carro café
 *       de beige porque «se parece» sería decirle a alguien que su carro es de otro color.</li>
 *   <li><b>`OTHER`</b>: el servidor guarda literalmente «no lo dijo». El componente del paquete
 *       caía a gris con un `?? 'gris'`; acá no, porque un carro de color desconocido pintado de
 *       gris es una afirmación falsa. El dibujo usa un gris de interfaz que no afirma nada.</li>
 * </ul>
 *
 * <p>Queda una imagen por color sin usar, `azul-oscuro`: el catálogo del servidor no distingue azul
 * de azul marino. No se fuerza la equivalencia por la misma razón de siempre.</p>
 */
const POR_COLOR: Record<string, ColorPrototipo | null> = {
  WHITE: 'blanco',
  SILVER: 'plata',
  GRAY: 'gris',
  GREY: 'gris',
  BLACK: 'negro',
  RED: 'rojo',
  BLUE: 'azul',
  GREEN: 'verde',
  BEIGE: 'beige',
  ORANGE: 'naranja',
  YELLOW: null,
  BROWN: null,
  OTHER: null,
};

/**
 * Marca y modelo, convertidos en algo con lo que se puede comparar sin equivocarse.
 *
 * <h2>Por qué no alcanza con pegar las letras</h2>
 *
 * <p>Hasta el 22-10-2026 la comparación era igualdad exacta sobre `marca+modelo` sin separadores.
 * Funciona para «RAV4», «Rav-4» y «rav 4», que es para lo que se escribió, y falla para todo lo
 * que la gente escribe de verdad: <b>«Mercedes-Benz Sprinter 519 CDI Furgón Largo» salía sedán</b>
 * porque no era exactamente `mercedesbenzsprinter`. Visto en la lámina del Paso 3.</p>
 *
 * <p>Y la solución fácil —buscar la entrada como subcadena— es peor que el problema: `kiario`
 * aparece dentro de «Kia Riojana», `mazda3` dentro de «Mazda 323». Eso le pondría a alguien la
 * imagen de otro carro, que es exactamente lo que todo este módulo existe para evitar.</p>
 *
 * <h2>Lo que se hace en cambio</h2>
 *
 * <p>Se guardan las dos cosas: la cadena pegada —para que los separadores no cuenten— y <b>dónde
 * terminaba cada palabra</b>. Una entrada del catálogo vale si es prefijo de la cadena <i>y</i> el
 * corte cae justo en el final de una palabra.</p>
 *
 * <pre>
 *   «Mercedes-Benz Sprinter 519 CDI Furgón Largo»
 *     cadena    mercedesbenzsprinter519cdifurgonlargo
 *     fronteras         8   12      20  23 26    32 37
 *     entrada   mercedesbenzsprinter            ← largo 20, y 20 ES frontera ⇒ van-comercial
 *
 *   «Kia Riojana»
 *     cadena    kiariojana
 *     fronteras    3      10
 *     entrada   kiario                          ← largo 6, y 6 NO es frontera ⇒ no coincide
 * </pre>
 */
interface MarcaYModelo {
  /** Minúsculas, sin tildes y sin separadores: `toyotarav4`. */
  cadena: string;
  /** Las posiciones donde termina cada palabra, para no cortar a mitad de una. */
  fronteras: Set<number>;
}

function analizarMarcaYModelo(marca: string | undefined, modelo: string | undefined): MarcaYModelo {
  const palabras = `${marca ?? ''} ${modelo ?? ''}`
    .normalize('NFD')
    // Las marcas diacríticas del rango combinante: «Furgón» y «Furgon» son la misma palabra.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const fronteras = new Set<number>();
  let largo = 0;
  for (const palabra of palabras) {
    largo += palabra.length;
    fronteras.add(largo);
  }
  return { cadena: palabras.join(''), fronteras };
}

/**
 * Las entradas del catálogo, de la más específica a la menos.
 *
 * <p>El orden importa: «Toyota Land Cruiser Prado» tiene que caer en `toyotalandcruiser` y no en
 * una entrada más corta que también sea prefijo. Se ordena una sola vez, al cargar el módulo.</p>
 */
const ENTRADAS_POR_ESPECIFICIDAD: ReadonlyArray<readonly [string, Carroceria]> =
  Object.entries(POR_MODELO)
    .sort(([a], [b]) => b.length - a.length);

/**
 * La carrocería que marca y modelo permiten afirmar, o null si ninguna.
 *
 * <p>Conservador a propósito: ante la duda, null, y manda la carrocería que el tipo ya dijo.</p>
 */
function carroceriaDelModelo(marca: string | undefined, modelo: string | undefined): Carroceria | null {
  const { cadena, fronteras } = analizarMarcaYModelo(marca, modelo);
  // Sin texto no hay nada que comparar; y una entrada vacía sería prefijo de todo.
  if (!cadena) return null;

  for (const [clave, carroceria] of ENTRADAS_POR_ESPECIFICIDAD) {
    if (!clave) continue;
    if (clave === cadena) return carroceria;
    if (cadena.startsWith(clave) && fronteras.has(clave.length)) return carroceria;
  }
  return null;
}

export interface VehiculoParaPrototipo {
  type?: string;
  brand?: string;
  model?: string;
  color?: string;
}

export interface EleccionPrototipo {
  carroceria: Carroceria;
  color: ColorPrototipo;
  /** `sedan-blanco`: la clave con la que la galería busca el archivo. */
  clave: string;
}

/**
 * La carrocería que le corresponde al vehículo, o null si no hay ninguna que no mienta.
 *
 * <p>Orden: el tipo del servidor decide primero —es el dato duro—, y marca+modelo sólo <b>afinan</b>
 * dentro de lo que el tipo ya permitió. Un vehículo declarado PICKUP cuyo modelo esté en la tabla
 * como sedán sigue siendo una pick-up: el servidor sabe más que una tabla escrita a mano.</p>
 */
export function carroceriaDe(vehiculo: VehiculoParaPrototipo): Carroceria | null {
  const tipo = (vehiculo.type ?? '').toUpperCase();
  /*
    Un tipo que el catálogo del servidor crezca y esta tabla no conozca NO cae en «sedán»: cae en
    el dibujo. Dibujar un automóvil para algo que el servidor llamó de otra manera es el error que
    `VehicleThumb` ya evita, y no se va a introducir acá.
  */
  const base = POR_TIPO[tipo];
  if (base === null || base === undefined) return null;

  /*
    El automóvil se afina por modelo, y es el único que lo necesita: desde `V16_0` el contrato no
    distingue una pick-up de un sedán, así que ES el caso general y no una excepción.
  */
  let elegida = base;
  if (base === 'sedan') {
    const delModelo = carroceriaDelModelo(vehiculo.brand, vehiculo.model);
    if (delModelo) elegida = delModelo;
  }

  return EQUIVALENCIAS[elegida] ?? elegida;
}

/** El color de la biblioteca que le corresponde, o null si el servidor no dijo uno que exista. */
export function colorDe(vehiculo: VehiculoParaPrototipo): ColorPrototipo | null {
  const clave = (vehiculo.color ?? '').toUpperCase();
  return POR_COLOR[clave] ?? null;
}

/**
 * La elección completa, o null si falta la carrocería o el color.
 *
 * <p>Hacen falta los dos. Con uno solo no hay archivo que buscar, y elegir el que falte —un gris
 * por omisión, un sedán por omisión— es inventar un dato del vehículo de alguien.</p>
 */
export function elegirPrototipo(vehiculo: VehiculoParaPrototipo): EleccionPrototipo | null {
  const carroceria = carroceriaDe(vehiculo);
  if (!carroceria) return null;
  const color = colorDe(vehiculo);
  if (!color) return null;
  return { carroceria, color, clave: `${carroceria}-${color}` };
}

/**
 * Lee el nombre de un archivo de la carpeta y devuelve su clave, o null si no la sigue.
 *
 * <p>No se parte por el último guion y no es un detalle: `suv-compacta-azul-oscuro` tiene tres, y
 * tanto la carrocería como el color llevan uno dentro. Se prueba cada carrocería conocida como
 * prefijo, que es la única lectura sin ambigüedad.</p>
 */
export function claveDeArchivo(ruta: string): string | null {
  const base = ruta.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  for (const carroceria of CARROCERIAS) {
    if (!base.startsWith(`${carroceria}-`)) continue;
    const color = base.slice(carroceria.length + 1);
    if ((COLORES_PROTOTIPO as readonly string[]).includes(color)) return base;
  }
  return null;
}
