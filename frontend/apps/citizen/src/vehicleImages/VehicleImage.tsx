import * as React from 'react';
import { useState } from 'react';
import { VehicleThumb } from '@luparx/ui';
import { CATALOGO_VEHICULOS } from './galeria';
import { elegirImagen } from './catalogo';
import { elegirPrototipo } from './prototipo/catalogoPrototipo';
import { PROTOTIPOS } from './prototipo/galeriaPrototipo';
import { useCarroceriaElegida } from './carroceriaElegida';

/**
 * La imagen de un vehículo: la mejor de las tres que haya, y nunca una que mienta.
 *
 * <h2>Las tres fuentes, en orden</h2>
 *
 * <ol>
 *   <li><b>Fotografía con licencia</b> del modelo concreto (`vehicleImages/assets`), buscada por
 *       marca, modelo, año y color. Hoy esa carpeta está vacía: no hay imágenes compradas todavía.</li>
 *   <li><b>Imagen de prototipo</b> por carrocería y color (`vehicleImages/prototipo/assets`), las
 *       cien entregadas el 22-10-2026. Afirma forma y color, nunca marca ni modelo.</li>
 *   <li><b>El dibujo</b> `VehicleThumb`, silueta por categoría teñida del color declarado, que es
 *       lo que había antes y sigue siendo la red de abajo.</li>
 * </ol>
 *
 * <p>Cada escalón afirma menos que el anterior, y el último no afirma nada que el servidor no haya
 * dicho. Por eso el orden es ése y no al revés.</p>
 *
 * <h2>Cuándo NO hay imagen</h2>
 *
 * <p>Una motocicleta no tiene imagen en la biblioteca —no está entre las diez carrocerías—, y
 * tampoco la tienen los colores `YELLOW`, `BROWN` y `OTHER`. En todos esos casos se dibuja, en vez
 * de elegir «un sedán gris» por omisión: eso sería inventarle forma o color al vehículo de alguien.
 * El dibujo sí tiene silueta de moto y, desde el 22-10-2026, los doce colores del catálogo.</p>
 *
 * <h2>Lo que hace que no pese</h2>
 *
 * <ul>
 *   <li>`loading="lazy"`: una lista de diez vehículos descarga lo que se ve, no los diez;</li>
 *   <li>`decoding="async"`: decodificar no bloquea el desplazamiento;</li>
 *   <li>el hueco tiene su tamaño desde el primer cuadro, así que la fila no salta al cargar;</li>
 *   <li>el empaquetador tiene prohibido incrustar estas imágenes en el JavaScript, así que no
 *       viajan con la aplicación sino cuando se van a ver.</li>
 * </ul>
 *
 * <h2>Si la imagen falla</h2>
 *
 * <p>Un archivo que no cargue —borrado, corrupto, bloqueado por la red— no deja un roto en la
 * pantalla: se baja un escalón y la fila sigue igual de legible.</p>
 */

/**
 * Proporción del hueco, 2:1.
 *
 * <p>Es la de las imágenes de prototipo una vez recortadas (560×266). El dibujo está hecho en 4:3
 * y se centra dentro con `preserveAspectRatio`, así que las dos fuentes ocupan EL MISMO hueco: en
 * una lista donde unos vehículos tienen imagen y otros no, las filas no quedan de anchos
 * distintos.</p>
 */
const PROPORCION = 2;

/**
 * Qué dibujo le toca cuando no hay ninguna imagen: el del tipo, afinado por la carrocería elegida.
 *
 * <h2>Para qué sirve, si ya hay fotografías</h2>
 *
 * <p>Para los tres colores que la biblioteca no trae —amarillo, café y «otro»—. Un carro amarillo
 * no tiene archivo y cae al dibujo, y hasta hoy el dibujo era siempre un automóvil genérico aunque
 * su dueño hubiera dicho que es una pick-up. `VehicleThumb` tiene desde el principio un dibujo de
 * pick-up y uno de furgoneta que el contrato dejó de alcanzar cuando `V16_0` retiró esos tipos;
 * esto los vuelve a usar, que es exactamente para lo que se conservaron.</p>
 *
 * <p>El tipo del servidor sigue mandando: si dijo MOTORCYCLE, se dibuja una moto y la carrocería
 * guardada no se mira.</p>
 */
function dibujoDe(type: string | undefined, carroceria: string | null): string | undefined {
  if ((type ?? '').toUpperCase() !== 'CAR' || !carroceria) return type;
  if (carroceria === 'pickup') return 'PICKUP';
  if (carroceria === 'van-comercial' || carroceria === 'minivan') return 'VAN';
  return type;
}

export interface VehicleImageProps {
  /**
   * Identificador del vehículo, para leer la carrocería que su dueño eligió.
   *
   * <p>Va acá y no como una carrocería ya resuelta a propósito: la imagen se dibuja en cuatro
   * pantallas —la lista, el Inicio, la sesión activa y el selector de Estacionar— y si cada una
   * tuviera que buscar la carrocería y pasarla, bastaría olvidarse en una para que el mismo
   * vehículo saliera distinto en dos sitios. Con el identificador, la regla vive en un solo lugar
   * y las cuatro pantallas dicen lo mismo sin ponerse de acuerdo.</p>
   *
   * <p>Sin él, la imagen se elige sola por marca y modelo, que es lo que hacía antes.</p>
   */
  vehicleId?: string;
  /** Clave de `GET /catalog/vehicle-types`, que hoy tiene dos valores: `CAR` y `MOTORCYCLE`. */
  type?: string;
  /** Clave del catálogo de colores. Elige el color de la imagen y tiñe el dibujo. */
  color?: string;
  brand?: string;
  model?: string;
  year?: number;
  /** Alto en píxeles; el ancho sale de la proporción 2:1. Se ignora con {@link relleno}. */
  size?: number;
  /**
   * Llena el ancho que le dé el contenedor, manteniendo la proporción 2:1.
   *
   * <p>Para la tarjeta de estacionamiento activo, que cambia de ancho entre un teléfono de 320 px
   * y una laptop. Con un tamaño en píxeles habría que elegir un número por aparato, que es lo que
   * la guía del proyecto prohíbe.</p>
   */
  relleno?: boolean;
  className?: string;
  /**
   * Texto alternativo. Por omisión la imagen es decorativa —la fila ya dice la placa y la
   * descripción—, y un lector de pantalla no gana nada repitiéndolo.
   */
  alt?: string;
}

export function VehicleImage({
  vehicleId,
  type,
  color,
  brand,
  model,
  year,
  size = 44,
  relleno,
  className,
  alt,
}: VehicleImageProps): React.JSX.Element {
  // Se suscribe: al guardar una carrocería en el formulario, esta imagen se redibuja sola, sin
  // esperar a que la pantalla se vuelva a montar.
  const carroceria = useCarroceriaElegida(vehicleId);
  /*
    Qué escalones ya fallaron al cargar. Se guarda la URL y no un booleano: si la pantalla cambia
    de vehículo, el fallo del anterior no debe arrastrarse al nuevo.
  */
  const [fallidas, setFallidas] = useState<readonly string[]>([]);

  const conLicencia = elegirImagen(CATALOGO_VEHICULOS, { brand, model, year, color });
  const prototipo = elegirPrototipo({ type, brand, model, color, carroceria: carroceria ?? undefined });
  const delPrototipo = prototipo ? (PROTOTIPOS[prototipo.clave] ?? null) : null;

  const url = [conLicencia, delPrototipo].find((u) => u !== null && !fallidas.includes(u)) ?? null;

  const ancho = Math.round(size * PROPORCION);

  /*
    El marco va en los DOS caminos, y no sólo en la fotografía.

    Las imágenes de la biblioteca traen su propio fondo opaco, así que necesitan un marco para no
    leerse como un recorte pegado. El dibujo no lo necesita… pero en una lista donde unas filas
    tienen foto y otras dibujo, unas enmarcadas y otras no, la columna de imágenes se ve
    desalineada. Visto en la lámina del 22-10-2026 con siete vehículos: saltaba a la vista.
  */
  const marco = ['lx-vehicle-thumb--marco', className].filter(Boolean).join(' ');

  if (!url) {
    return (
      <VehicleThumb
        type={dibujoDe(type, carroceria)}
        color={color}
        size={size}
        ancho={ancho}
        relleno={relleno}
        className={marco}
      />
    );
  }

  return (
    <span
      className={[
        'lx-vehicle-thumb',
        relleno ? 'lx-vehicle-thumb--relleno' : '',
        marco,
      ].filter(Boolean).join(' ')}
      style={relleno ? undefined : { height: size, width: ancho }}
      aria-hidden={alt ? undefined : 'true'}
    >
      <img
        src={url}
        alt={alt ?? ''}
        width={ancho}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={() => setFallidas((previas) => (previas.includes(url) ? previas : [...previas, url]))}
      />
    </span>
  );
}
