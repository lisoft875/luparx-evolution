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

function Motocicleta({ p, id }: { p: Pintura; id: string }): React.JSX.Element {
  return (
    <g>
      <ellipse cx="60" cy="72" rx="36" ry="6" fill={`url(#${id}-piso)`} />
      {/* Las dos ruedas y, entre ellas, el cuadro: en una moto el dibujo es la estructura. */}
      <ellipse cx="30" cy="58" rx="13" ry="12" fill={GOMA} />
      <ellipse cx="30" cy="58" rx="6" ry="5.5" fill={LLANTA} opacity="0.8" />
      <ellipse cx="92" cy="58" rx="14" ry="13" fill={GOMA} />
      <ellipse cx="92" cy="58" rx="6.5" ry="6" fill={LLANTA} opacity="0.8" />
      <path d="M30 58 L48 42 L70 40 L92 58" fill="none" stroke={p.medio} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48 42 L62 56 L92 58" fill="none" stroke={p.sombra} strokeWidth="5" strokeLinecap="round" />
      {/* Depósito y asiento. */}
      <path d="M44 38 L62 36 Q70 36 72 40 L52 44 Q45 44 44 38 Z" fill={`url(#${id}-techo)`} />
      <path d="M70 40 L86 38 Q90 38 90 41 L72 44 Z" fill={p.sombra} />
      {/* Manillar y faro. */}
      <path d="M84 36 L96 30" stroke={LLANTA} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="97" cy="42" rx="4" ry="3.4" fill={FARO} opacity="0.9" />
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
