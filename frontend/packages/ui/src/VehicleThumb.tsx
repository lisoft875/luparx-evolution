import * as React from 'react';

/**
 * La miniatura del vehículo del boceto, dibujada con lo que el dominio sabe.
 *
 * <h2>Por qué es un dibujo y no una fotografía</h2>
 *
 * <p>El boceto muestra fotos de carros concretos —un Toyota RAV4 blanco, un Hyundai Tucson gris—.
 * El dominio tiene marca, modelo, año, tipo y color; lo que no tiene es <b>imagen</b>. Para poner
 * una fotografía harían falta archivos con licencia comercial por marca y modelo, y no los hay: la
 * propia orden del 21-10-2026 pide «recursos licenciados/autorizados» y, cuando no los haya,
 * «miniatura genérica realista por categoría, sin fingir marca/modelo». Esto es eso.</p>
 *
 * <p>Lo que cambió el 21-10-2026 es el dibujo. Antes era una silueta lateral plana —la usuaria la
 * describió como «carrito plano genérico tipo emoji»— y ahora es una vista en tres cuartos con
 * volumen: capó, parabrisas, hombro iluminado, sombra en el suelo y ruedas con llanta. No es una
 * foto y no lo finge; es un vehículo dibujado de la categoría y el color que el servidor dijo.</p>
 *
 * <h2>Lo que afirma y lo que no</h2>
 *
 * <p>Afirma <b>tipo</b> y <b>color</b>, los dos del servidor. No afirma marca ni modelo: un RAV4 y
 * un Tucson se dibujan igual si los dos son automóviles blancos, porque de la forma real de cada
 * uno no se sabe nada. Sin color declarado va en el gris neutro de la interfaz en lugar de elegir
 * uno.</p>
 *
 * <h2>Por qué SVG en línea</h2>
 *
 * <p>Sin petición de red —ni a nuestro servidor ni, sobre todo, a terceros: la orden lo prohíbe en
 * letra—, así que no hay salto de maquetación ni espera. El contenedor fija su proporción 4:3 de
 * todas formas, porque una lista que reserva el hueco no se mueve bajo el dedo mientras carga el
 * resto.</p>
 *
 * <p>Decorativa: {@code aria-hidden}. La fila ya dice la placa y la descripción, y un lector de
 * pantalla no gana nada con «dibujo de automóvil gris» repitiendo lo que el texto dirá mejor.</p>
 */

/** Los colores del catálogo `GET /catalog/vehicle-colors`, como se ven en un vehículo. */
const PINTURA: Record<string, Pintura> = {
  WHITE: { claro: '#FBFCFE', medio: '#E4EAF2', sombra: '#AEB9C8' },
  BLACK: { claro: '#434E5E', medio: '#2A313C', sombra: '#161B22' },
  GRAY: { claro: '#A7B2C0', medio: '#8A95A5', sombra: '#5C6676' },
  GREY: { claro: '#A7B2C0', medio: '#8A95A5', sombra: '#5C6676' },
  SILVER: { claro: '#DCE3EC', medio: '#C3CCDA', sombra: '#8F9AA9' },
  RED: { claro: '#E8697A', medio: '#D4505F', sombra: '#8E2E3A' },
  BLUE: { claro: '#6C9BE6', medio: '#4A7FD4', sombra: '#2B4F8E' },
  GREEN: { claro: '#6FC296', medio: '#4FA97B', sombra: '#2B6B4B' },
  YELLOW: { claro: '#EBCB63', medio: '#D8B341', sombra: '#95761C' },
  /*
    Los tres que faltaban (22-10-2026). El catálogo del servidor publica DOCE colores y esta tabla
    tenía nueve: un carro café, beige o naranja se dibujaba en el gris de «no lo dijo», que es una
    respuesta distinta —y equivocada— para alguien que sí lo dijo. Se encontró al comparar esta
    tabla con el enum `VehicleColor` del backend en vez de con el transporte simulado.
  */
  ORANGE: { claro: '#F0A05A', medio: '#E07A28', sombra: '#94480F' },
  BROWN: { claro: '#A3785A', medio: '#7A5537', sombra: '#4A3220' },
  BEIGE: { claro: '#E8DCC4', medio: '#D4C3A3', sombra: '#9A8B6E' },
};

/** Sin color declarado no se elige uno: gris de interfaz, que no afirma nada sobre el vehículo. */
const SIN_COLOR: Pintura = { claro: '#8792A3', medio: '#6C7889', sombra: '#424B57' };

interface Pintura {
  /** Donde pega la luz: capó y hombro. */
  claro: string;
  /** El color del vehículo, el que lee la persona. */
  medio: string;
  /** Los planos que no ven la luz: faldón y bajos. */
  sombra: string;
}

const VIDRIO_ALTO = '#1C3047';
const VIDRIO_BAJO = '#0C1828';
const GOMA = '#161C26';
const LLANTA = '#7D8899';
const FARO = '#F4F7D8';
/** Metal sin pintar: motor, escape y horquilla de la motocicleta. No es el color del vehículo. */
const MOTOR = '#39414E';

export interface VehicleThumbProps {
  /**
   * Clave del catálogo `GET /catalog/vehicle-types`, que hoy tiene **dos** valores: `CAR` y
   * `MOTORCYCLE`.
   *
   * <p>Los dibujos de `PICKUP` y `VAN` se conservan aunque el contrato ya no emita esas claves
   * —`V16_0` las retiró— porque el enum del backend está escrito para poder crecer: «un valor, una
   * clave de traducción y un CHECK más ancho». El día que vuelva una, el dibujo ya está. Un tipo
   * que esta tabla no conozca cae en el volumen neutro.</p>
   */
  type?: string;
  /** Clave del catálogo de colores. Ausente cuando el dueño no lo declaró. */
  color?: string;
  /** Alto en píxeles; el ancho sale de la proporción 4:3 salvo que se pase {@link ancho}. */
  size?: number;
  /**
   * Ancho del hueco, para cuando lo manda quien llama.
   *
   * <p>Existe por `VehicleImage`: allí el hueco es 2:1 —el de las imágenes de prototipo— y el
   * dibujo tiene que ocupar EXACTAMENTE el mismo, o en una lista donde unos vehículos tienen
   * imagen y otros no las filas quedarían de anchos distintos. El dibujo se centra dentro con
   * `preserveAspectRatio` en vez de estirarse.</p>
   */
  ancho?: number;
  /**
   * Llena el hueco que le dé el contenedor en vez de medir en píxeles.
   *
   * <p>Para una tarjeta que cambia de ancho con la pantalla: medir en píxeles obligaría a elegir
   * un número para el teléfono y otro para la laptop, que es exactamente lo que la guía del
   * proyecto prohíbe. Quien lo use tiene que darle al contenedor su proporción.</p>
   */
  relleno?: boolean;
  className?: string;
}

/** La sombra del suelo: lo que hace que el vehículo esté apoyado y no flotando. */
function Piso({ id }: { id: string }): React.JSX.Element {
  return <ellipse cx="60" cy="74" rx="48" ry="7" fill={`url(#${id}-piso)`} />;
}

/**
 * Una rueda en tres cuartos: elipse, no círculo.
 *
 * El eje delantero se ve de frente y el trasero de lado, así que la de atrás va más estrecha. Es
 * lo que da la sensación de profundidad; dos círculos iguales devuelven el dibujo a plano.
 */
function Rueda({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }): React.JSX.Element {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={GOMA} />
      <ellipse cx={cx} cy={cy} rx={rx * 0.52} ry={ry * 0.52} fill={LLANTA} opacity="0.85" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.2} ry={ry * 0.2} fill={GOMA} opacity="0.7" />
    </g>
  );
}

function Automovil({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <Piso id={id} />
      {/* Costado: del faro trasero al morro, con la caída del techo. */}
      <path
        d="M14 62 L14 50 Q14 45 19 43 L30 40 Q38 28 50 26 L70 26 Q80 27 86 34 L98 40 Q106 43 108 50 L108 62 Q108 66 103 66 L19 66 Q14 66 14 62 Z"
        fill={`url(#${id}-chapa)`}
      />
      {/* Capó y techo: el plano que mira al cielo. */}
      <path d="M30 40 Q38 28 50 26 L70 26 Q80 27 86 34 L84 40 Q74 33 66 32 L48 32 Q38 33 30 40 Z" fill={`url(#${id}-techo)`} />
      {/* Luna y ventanilla, separadas por el montante. */}
      <path d="M34 40 Q41 32 50 31 L62 31 L62 41 Z" fill={`url(#${id}-vidrio)`} />
      <path d="M65 31 L70 31 Q78 32 83 38 L83 41 L65 41 Z" fill={VIDRIO_BAJO} />
      {/* Faldón: el plano bajo, siempre en sombra. */}
      <path d="M14 58 L108 58 L108 62 Q108 66 103 66 L19 66 Q14 66 14 62 Z" fill={p.sombra} />
      {/* Hombro: la línea de luz que recorre el costado. */}
      <path d="M16 48 Q58 44 106 49" stroke={p.claro} strokeWidth="1.6" fill="none" opacity="0.75" />
      <ellipse cx="104" cy="50" rx="4" ry="3" fill={FARO} opacity="0.9" />
      <Rueda cx={33} cy={64} rx={11} ry={9} />
      <Rueda cx={92} cy={64} rx={12} ry={10} />
    </g>
  );
}

function Pickup({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <Piso id={id} />
      {/* Cabina corta adelante y cajón atrás: el perfil que distingue la categoría. */}
      <path
        d="M12 62 L12 46 L46 46 Q50 30 60 28 L76 28 Q84 29 90 36 L100 42 Q108 45 108 52 L108 62 Q108 66 103 66 L17 66 Q12 66 12 62 Z"
        fill={`url(#${id}-chapa)`}
      />
      {/* El cajón, un plano más oscuro porque mira hacia arriba y hacia atrás. */}
      <path d="M12 46 L46 46 L46 58 L12 58 Z" fill={p.sombra} opacity="0.85" />
      <path d="M46 46 L46 30 Q50 30 60 28 L76 28 Q84 29 90 36 L88 42 Q78 34 70 33 L58 33 Q50 35 46 46 Z" fill={`url(#${id}-techo)`} />
      <path d="M50 44 Q55 34 62 33 L72 33 L72 44 Z" fill={`url(#${id}-vidrio)`} />
      <path d="M75 33 L78 33 Q84 35 88 40 L88 44 L75 44 Z" fill={VIDRIO_BAJO} />
      <path d="M12 58 L108 58 L108 62 Q108 66 103 66 L17 66 Q12 66 12 62 Z" fill={p.sombra} />
      <path d="M14 50 Q58 47 106 51" stroke={p.claro} strokeWidth="1.6" fill="none" opacity="0.7" />
      <ellipse cx="104" cy="51" rx="4" ry="3" fill={FARO} opacity="0.9" />
      <Rueda cx={30} cy={64} rx={11} ry={9} />
      <Rueda cx={92} cy={64} rx={12} ry={10} />
    </g>
  );
}

function Furgoneta({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <Piso id={id} />
      {/* Una caja alta con el morro corto: nada de caída de techo. */}
      <path
        d="M12 62 L12 30 Q12 25 18 25 L74 25 Q84 26 92 34 L102 42 Q108 45 108 52 L108 62 Q108 66 103 66 L17 66 Q12 66 12 62 Z"
        fill={`url(#${id}-chapa)`}
      />
      <path d="M12 30 Q12 25 18 25 L74 25 Q84 26 92 34 L90 38 Q80 31 72 31 L12 31 Z" fill={`url(#${id}-techo)`} />
      <path d="M18 34 L52 34 L52 46 L18 46 Z" fill={VIDRIO_BAJO} opacity="0.75" />
      <path d="M56 34 L74 34 Q82 35 88 41 L88 46 L56 46 Z" fill={`url(#${id}-vidrio)`} />
      <path d="M12 58 L108 58 L108 62 Q108 66 103 66 L17 66 Q12 66 12 62 Z" fill={p.sombra} />
      <path d="M14 50 Q58 47 106 51" stroke={p.claro} strokeWidth="1.6" fill="none" opacity="0.65" />
      <ellipse cx="104" cy="51" rx="4" ry="3" fill={FARO} opacity="0.9" />
      <Rueda cx={30} cy={64} rx={11} ry={9} />
      <Rueda cx={92} cy={64} rx={12} ry={10} />
    </g>
  );
}

/** Los cinco radios de la llanta, en grados. Fijos: el mismo dibujo en las dos ruedas. */
const RADIOS_LLANTA = [18, 90, 162, 234, 306];

/**
 * Una rueda de motocicleta: calada, no un disco.
 *
 * <p>En un automóvil la rueda es un detalle oscuro; en una moto ocupa un tercio del alto y es, en
 * buena medida, lo que la identifica. Dos cosas la hacen leer: el <b>grosor del neumático</b>, que
 * aquí es un anillo de goma y no un relleno, y el <b>hueco</b> —entre los radios se ve el fondo de
 * la tarjeta, como en una moto de verdad—. Una rueda rellena convierte la moto en un juguete.</p>
 */
function RuedaMoto({ cx, cy, r }: { cx: number; cy: number; r: number }): React.JSX.Element {
  return (
    <g>
      {/* Neumático: anillo, con el hueco interior transparente. */}
      <circle cx={cx} cy={cy} r={r - r * 0.17} fill="none" stroke={GOMA} strokeWidth={r * 0.34} />
      {/* Aro. */}
      <circle cx={cx} cy={cy} r={r * 0.61} fill="none" stroke={LLANTA} strokeWidth={r * 0.11} opacity="0.92" />
      {/* Disco de freno. */}
      <circle cx={cx} cy={cy} r={r * 0.38} fill="none" stroke={LLANTA} strokeWidth={r * 0.06} opacity="0.5" />
      {RADIOS_LLANTA.map((grados) => {
        const a = (grados * Math.PI) / 180;
        return (
          <line
            key={grados}
            x1={cx + Math.cos(a) * r * 0.17}
            y1={cy + Math.sin(a) * r * 0.17}
            x2={cx + Math.cos(a) * r * 0.58}
            y2={cy + Math.sin(a) * r * 0.58}
            stroke={LLANTA}
            strokeWidth={r * 0.09}
            opacity="0.8"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.17} fill={LLANTA} />
    </g>
  );
}

/**
 * La motocicleta. Tercera versión, 22-10-2026.
 *
 * <h2>Las dos que no funcionaron</h2>
 *
 * <p>La primera era de tubos finos y Javier la describió como «parece un grillo». La segunda le
 * puso masas —depósito, motor, asiento— y pasó a «parece una chapeadora»: seguía siendo un objeto
 * <b>largo y bajo</b>, con un tubo gris cruzándolo de punta a punta y una antena saliendo adelante.
 * Las dos tenían el mismo defecto de fondo: la silueta era casi toda horizontal.</p>
 *
 * <h2>Esta no se dibujó a ojo</h2>
 *
 * <p>Las proporciones salen de la moto que el catálogo usa de ejemplo, una Honda CB190, medidas
 * contra su distancia entre ejes (1356 mm = 62 unidades aquí):</p>
 *
 * <ul>
 *   <li>rueda 640 mm ≈ 0,47 de la distancia entre ejes → radio 14,5;</li>
 *   <li>alto al manillar 1100 mm ≈ 0,81 → el manillar llega a y=24, no a y=30;</li>
 *   <li>altura de asiento 795 mm ≈ 0,59 → asiento en y=36;</li>
 *   <li>largo total 2030 mm ≈ 1,50 → de x=16 a x=107.</li>
 * </ul>
 *
 * <p>Lo que cambia respecto a las anteriores es, sobre todo, que la silueta <b>sube</b>: horquilla
 * inclinada que llega hasta la tija, manillar por encima del depósito y un retrovisor que corona el
 * conjunto. Eso es lo que distingue una moto de una herramienta con ruedas.</p>
 *
 * <h2>El hueco también dibuja</h2>
 *
 * <p>Las ruedas van caladas y el triángulo entre el motor, el asiento y el basculante se deja
 * vacío: en una moto real se ve el fondo a través de ella, y rellenar esa zona es lo que convertía
 * el dibujo en un bulto. El escape es un tubo cónico que muere en el eje trasero, no una tabla.</p>
 *
 * <p>Perfil puro, mirando a la derecha como los demás dibujos. No afirma marca ni modelo: es una
 * motocicleta genérica del color que declaró el dueño.</p>
 */
function Motocicleta({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <ellipse cx="61" cy="73" rx="44" ry="5" fill={`url(#${id}-piso)`} />
      {/* Ejes a y=57,5: el suelo queda en y=72 con radio 14,5. */}
      <RuedaMoto cx={30} cy={57.5} r={14.5} />
      <RuedaMoto cx={92} cy={57.5} r={14.5} />
      {/* Corona y cadena. */}
      <circle cx="30" cy="57.5" r="5" fill="none" stroke={LLANTA} strokeWidth="1.3" opacity="0.7" />
      <path d="M31 53.8 L54 54.8" stroke={LLANTA} strokeWidth="1.3" opacity="0.6" />
      {/* Basculante: del pivote del motor al eje trasero. */}
      <path d="M55 54.5 L31 56 L31 60 L55 59.5 Z" fill={MOTOR} />
      {/* Amortiguador trasero, inclinado hacia adelante. */}
      <path d="M45 57.5 L49 44" stroke={LLANTA} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      {/* Cuadro: tubo de bajada hasta el motor y subchasis hacia el asiento. */}
      <path d="M80 38 L62 48.5" stroke={p.sombra} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M56 42.5 L33 40.5" stroke={p.sombra} strokeWidth="3" strokeLinecap="round" />
      {/* Escape: colector curvo desde la culata y silenciador cónico que muere en el eje trasero. */}
      <path d="M71 45 Q78 51.5 73 57.5 Q67 62.5 57 62.5" fill="none" stroke={LLANTA} strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      <path d="M52 60.8 Q38 59.3 27 58 Q23 57.6 23 60.4 Q23 63.4 27 63.2 Q38 62.8 52 64 Z" fill={LLANTA} opacity="0.95" />
      <ellipse cx="24" cy="60.6" rx="1.7" ry="3" fill={GOMA} opacity="0.75" />
      {/* Motor: cárter abajo, cilindro inclinado hacia adelante y culata encima. */}
      <path d="M55 51 Q52 51 52 55 L52 59 Q52 63.5 57 63.5 L68 63.5 Q74 63.5 74 58 L74 54 Q74 51 71 51 Z" fill={MOTOR} />
      <path d="M55 51 L71 51 Q74 51 74 54.5 L52 54.5 Q52 51 55 51 Z" fill={LLANTA} opacity="0.26" />
      <path d="M62 52.5 L64 43 Q64.4 41 67 41 L71 41.6 Q73.4 42 73 44.4 L71.6 53 Z" fill={MOTOR} />
      <path d="M63.4 48 L72.3 49 M63.8 45.8 L72.7 46.8 M64.2 43.6 L73 44.6" stroke={GOMA} strokeWidth="1.1" opacity="0.5" />
      <path d="M64 42.4 L72.9 43.4 L73.2 40.8 Q73.3 39.4 71.6 39.2 L66 38.6 Q64.2 38.4 64 39.8 Z" fill={MOTOR} />
      {/* Horquilla: dos barras con el ángulo de lanzamiento real (25° de la vertical). */}
      <path d="M79.5 33 L90.5 56" stroke={MOTOR} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M82.5 32 L93.5 55.5" stroke={LLANTA} strokeWidth="4" strokeLinecap="round" />
      <path d="M88.5 44 L93.5 55.5" stroke={MOTOR} strokeWidth="4.6" strokeLinecap="round" opacity="0.9" />
      <path d="M77.5 33.5 L85 30 L87 34 L79.5 37.5 Z" fill={MOTOR} />
      {/* Guardabarros delantero: arco concéntrico con la rueda, pintado. */}
      <path d="M81.4 44.9 A 16.5 16.5 0 0 1 102.6 44.9" fill="none" stroke={p.medio} strokeWidth="3.4" strokeLinecap="round" />
      {/* Colín pintado y asiento negro encima. */}
      <path d="M24.5 43.5 Q24 37.2 28.5 35.8 Q31 35.1 33 35.6 L46 37 L46 46.5 L30 46 Q25.2 45.6 24.5 43.5 Z" fill={`url(#${id}-chapa)`} />
      <path d="M35 35.9 L57 36.6 Q60 38 57.5 40.4 L38.5 40.3 Q34.2 40.2 34.3 38 Q34.4 36 35 35.9 Z" fill="#1B2129" />
      {/* Depósito: corto y alto, con la cintura marcada. Encima del tubo superior, no pegado al motor. */}
      <path d="M57 45.6 Q55.4 39 61 35.6 Q69 31 77.5 32 Q82 32.6 82 37.6 L82 41.6 Q78 46 69.5 46.6 L61 46.6 Q57.6 46.6 57 45.6 Z" fill={`url(#${id}-techo)`} />
      <path d="M62 37.6 Q69 34.2 78 34.8" stroke={p.claro} strokeWidth="1.5" fill="none" opacity="0.7" />
      {/* Faro redondo: la pieza que más rápido dice «moto» de frente o de lado. */}
      <circle cx="89.5" cy="34" r="5.8" fill={p.medio} />
      <circle cx="90.6" cy="34" r="4.2" fill={FARO} opacity="0.93" />
      {/* Manillar con puño, y retrovisor: lo que levanta la silueta por encima del depósito. */}
      <path d="M82.8 33 L83.2 27" stroke={MOTOR} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M76 28.2 L91 24.6" stroke={GOMA} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M86.5 25.7 L91 24.6" stroke="#0F141C" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M88 24.9 L93 19.6" stroke={GOMA} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="94.8" cy="18.4" rx="3.6" ry="2.4" fill={MOTOR} />
      <ellipse cx="94.8" cy="18.1" rx="2.4" ry="1.4" fill={LLANTA} opacity="0.6" />
    </g>
  );
}

/** Lo que no es ninguno de los anteriores: un volumen neutro, sin fingir que se sabe cuál es. */
function Generico({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <Piso id={id} />
      <path d="M16 62 L16 42 Q16 36 23 36 L92 36 Q104 38 106 46 L106 62 Q106 66 101 66 L21 66 Q16 66 16 62 Z" fill={p.medio} />
      <path d="M16 42 Q16 36 23 36 L92 36 Q100 37 104 42 L16 42 Z" fill={`url(#${id}-techo)`} />
      <path d="M16 58 L106 58 L106 62 Q106 66 101 66 L21 66 Q16 66 16 62 Z" fill={p.sombra} />
      <Rueda cx={34} cy={64} rx={10} ry={8} />
      <Rueda cx={90} cy={64} rx={11} ry={9} />
    </g>
  );
}

const DIBUJOS: Record<string, (p: { p: Pintura; id: string }) => React.JSX.Element> = {
  CAR: Automovil,
  PICKUP: Pickup,
  VAN: Furgoneta,
  MOTORCYCLE: Motocicleta,
};

export function VehicleThumb({ type, color, size = 44, ancho, relleno, className }: VehicleThumbProps): React.JSX.Element {
  // Un identificador por instancia: dos miniaturas en la misma lista no pueden compartir el
  // nombre de un degradado, o la segunda se pinta con la pintura de la primera.
  const id = React.useId().replace(/:/g, '');
  const pintura = (color && PINTURA[color.toUpperCase()]) || SIN_COLOR;
  // Un tipo que el catálogo crezca y esta tabla no conozca cae en el volumen neutro, que es mejor
  // que dibujar un automóvil para algo que el servidor llamó de otra manera.
  const Dibujo = DIBUJOS[(type || '').toUpperCase()] ?? Generico;
  return (
    <span
      className={['lx-vehicle-thumb', relleno ? 'lx-vehicle-thumb--relleno' : '', className]
        .filter(Boolean).join(' ')}
      style={relleno ? undefined : { height: size, width: ancho ?? Math.round((size * 4) / 3) }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 90" width="100%" height="100%" focusable="false" preserveAspectRatio="xMidYMid meet">
        {/*
          Los degradados son lo que separa un dibujo plano de algo con cuerpo: la chapa no es de un
          solo color, se aclara donde le pega la luz y se apaga hacia los bajos. El vidrio hace lo
          contrario —refleja el cielo arriba y se oscurece abajo— y la sombra del suelo se desvanece
          en vez de cortarse.
        */}
        <defs>
          <linearGradient id={`${id}-chapa`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pintura.claro} />
            <stop offset="55%" stopColor={pintura.medio} />
            <stop offset="100%" stopColor={pintura.sombra} />
          </linearGradient>
          <linearGradient id={`${id}-techo`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={pintura.claro} />
            <stop offset="100%" stopColor={pintura.medio} />
          </linearGradient>
          <linearGradient id={`${id}-vidrio`} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stopColor="#55789E" />
            <stop offset="45%" stopColor={VIDRIO_ALTO} />
            <stop offset="100%" stopColor={VIDRIO_BAJO} />
          </linearGradient>
          <radialGradient id={`${id}-piso`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.5" />
            <stop offset="65%" stopColor="#000000" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Dibujo p={pintura} id={id} />
      </svg>
    </span>
  );
}
