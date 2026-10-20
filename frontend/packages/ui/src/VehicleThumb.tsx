import * as React from 'react';

/**
 * La miniatura del vehículo del boceto, dibujada con lo que el dominio sabe (20-10-2026).
 *
 * <h2>Por qué es un dibujo y no una fotografía</h2>
 *
 * <p>El boceto muestra fotos de carros concretos —un Toyota RAV4 blanco, un Hyundai Tucson gris—.
 * El dominio no tiene foto: un {@code Vehicle} trae placa, nombre, marca, modelo, año, tipo y
 * color, y nada más. Poner una fotografía exigiría una de dos cosas, y las dos están prohibidas por
 * la orden: inventar marca y modelo para elegir la imagen, o traer imágenes de un tercero sin
 * derechos claros.</p>
 *
 * <p>Lo que sí hay es <b>tipo</b> y <b>color</b>, y los dos son datos reales del servidor. Con eso
 * se dibuja una silueta por categoría teñida del color declarado: no afirma nada que el servidor no
 * haya dicho. Un carro gris se ve como un carro gris; una moto roja, como una moto roja. Si el
 * dueño no declaró color, la silueta va en el gris neutro de la interfaz en lugar de elegir uno.</p>
 *
 * <h2>Por qué SVG en línea</h2>
 *
 * <p>Sin petición de red, así que no hay salto de maquetación ni espera: la miniatura está dibujada
 * cuando la fila aparece. El contenedor fija su proporción de todas formas —4:3— porque una lista
 * que reserva el hueco no se mueve bajo el dedo mientras carga el resto.</p>
 *
 * <p>Decorativa: {@code aria-hidden}. La fila ya dice la placa y la descripción, y un lector de
 * pantalla no gana nada con «silueta de automóvil gris» repitiendo lo que el texto dirá mejor.</p>
 */

/** Los colores del catálogo `GET /catalog/vehicle-colors`, como se ven en un vehículo. */
const PINTURA: Record<string, { cuerpo: string; sombra: string }> = {
  WHITE: { cuerpo: '#E8EDF5', sombra: '#B9C4D4' },
  BLACK: { cuerpo: '#2B3340', sombra: '#171C25' },
  GRAY: { cuerpo: '#8A95A5', sombra: '#5E6878' },
  GREY: { cuerpo: '#8A95A5', sombra: '#5E6878' },
  SILVER: { cuerpo: '#C3CCDA', sombra: '#949EAE' },
  RED: { cuerpo: '#D4505F', sombra: '#9B3340' },
  BLUE: { cuerpo: '#4A7FD4', sombra: '#2F569B' },
  GREEN: { cuerpo: '#4FA97B', sombra: '#2F7854' },
  YELLOW: { cuerpo: '#D8B341', sombra: '#A2831F' },
};

/** Sin color declarado no se elige uno: gris de interfaz, que no afirma nada sobre el vehículo. */
const SIN_COLOR = { cuerpo: '#6C7889', sombra: '#49525F' };

const VIDRIO = '#0E1B2C';
const RUEDA = '#1A2230';
const LLANTA = '#49525F';

export interface VehicleThumbProps {
  /** Clave del catálogo de tipos: CAR, MOTORCYCLE, PICKUP, VAN, OTHER… */
  type?: string;
  /** Clave del catálogo de colores. Ausente cuando el dueño no lo declaró. */
  color?: string;
  /** Alto en píxeles; el ancho sale de la proporción 4:3. */
  size?: number;
  className?: string;
}

function Carro({ cuerpo, sombra }: { cuerpo: string; sombra: string }): React.JSX.Element {
  return (
    <>
      <path d="M10 42 L18 28 Q20 24 25 24 L55 24 Q60 24 63 28 L72 42 Z" fill={cuerpo} />
      <path d="M22 29 L27 40 L44 40 L44 29 Z M46 29 L46 40 L62 40 L57 29 Z" fill={VIDRIO} />
      <rect x="6" y="40" width="68" height="10" rx="5" fill={cuerpo} />
      <rect x="6" y="46" width="68" height="4" rx="2" fill={sombra} />
      <circle cx="22" cy="51" r="7" fill={RUEDA} />
      <circle cx="22" cy="51" r="3" fill={LLANTA} />
      <circle cx="58" cy="51" r="7" fill={RUEDA} />
      <circle cx="58" cy="51" r="3" fill={LLANTA} />
    </>
  );
}

function Pickup({ cuerpo, sombra }: { cuerpo: string; sombra: string }): React.JSX.Element {
  return (
    <>
      <path d="M8 42 L14 27 Q16 23 21 23 L40 23 L42 42 Z" fill={cuerpo} />
      <path d="M18 28 L23 39 L38 39 L37 28 Z" fill={VIDRIO} />
      <rect x="40" y="31" width="34" height="11" fill={cuerpo} />
      <rect x="40" y="31" width="34" height="3" fill={sombra} />
      <rect x="6" y="40" width="68" height="10" rx="4" fill={cuerpo} />
      <rect x="6" y="46" width="68" height="4" rx="2" fill={sombra} />
      <circle cx="22" cy="51" r="7.5" fill={RUEDA} />
      <circle cx="22" cy="51" r="3" fill={LLANTA} />
      <circle cx="60" cy="51" r="7.5" fill={RUEDA} />
      <circle cx="60" cy="51" r="3" fill={LLANTA} />
    </>
  );
}

function Furgoneta({ cuerpo, sombra }: { cuerpo: string; sombra: string }): React.JSX.Element {
  return (
    <>
      <path d="M8 44 L8 26 Q8 21 14 21 L58 21 Q64 21 68 26 L74 36 L74 44 Z" fill={cuerpo} />
      <path d="M14 26 L14 36 L34 36 L34 26 Z M38 26 L38 36 L60 36 L54 26 Z" fill={VIDRIO} />
      <rect x="8" y="40" width="66" height="5" fill={sombra} />
      <circle cx="23" cy="48" r="7.5" fill={RUEDA} />
      <circle cx="23" cy="48" r="3" fill={LLANTA} />
      <circle cx="60" cy="48" r="7.5" fill={RUEDA} />
      <circle cx="60" cy="48" r="3" fill={LLANTA} />
    </>
  );
}

function Moto({ cuerpo, sombra }: { cuerpo: string; sombra: string }): React.JSX.Element {
  return (
    <>
      <circle cx="20" cy="46" r="11" fill="none" stroke={RUEDA} strokeWidth="4" />
      <circle cx="60" cy="46" r="11" fill="none" stroke={RUEDA} strokeWidth="4" />
      <path d="M20 46 L34 32 L48 32 L60 46" fill="none" stroke={cuerpo} strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 32 L44 44 L60 46" fill="none" stroke={sombra} strokeWidth="4"
        strokeLinecap="round" />
      <path d="M30 28 L40 28 L44 33 L32 33 Z" fill={cuerpo} />
      <path d="M48 30 L56 26" stroke={LLANTA} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** Lo que no es ninguno de los anteriores: una silueta neutra, sin fingir que se sabe cuál es. */
function Generico({ cuerpo, sombra }: { cuerpo: string; sombra: string }): React.JSX.Element {
  return (
    <>
      <rect x="12" y="26" width="56" height="20" rx="6" fill={cuerpo} />
      <rect x="12" y="40" width="56" height="6" rx="3" fill={sombra} />
      <circle cx="26" cy="49" r="6.5" fill={RUEDA} />
      <circle cx="54" cy="49" r="6.5" fill={RUEDA} />
    </>
  );
}

const DIBUJOS: Record<string, (p: { cuerpo: string; sombra: string }) => React.JSX.Element> = {
  CAR: Carro,
  PICKUP: Pickup,
  VAN: Furgoneta,
  MOTORCYCLE: Moto,
};

export function VehicleThumb({ type, color, size = 44, className }: VehicleThumbProps): React.JSX.Element {
  const pintura = (color && PINTURA[color.toUpperCase()]) || SIN_COLOR;
  // Un tipo que el catálogo crezca y esta tabla no conozca cae en la silueta neutra, que es mejor
  // que dibujar un carro para algo que el servidor llamó de otra manera.
  const Dibujo = DIBUJOS[(type || '').toUpperCase()] ?? Generico;
  return (
    <span
      className={['lx-vehicle-thumb', className].filter(Boolean).join(' ')}
      style={{ height: size, width: Math.round((size * 4) / 3) }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 60" width="100%" height="100%" focusable="false">
        <Dibujo {...pintura} />
      </svg>
    </span>
  );
}
