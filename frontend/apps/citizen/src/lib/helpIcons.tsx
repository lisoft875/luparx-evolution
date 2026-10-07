import * as React from 'react';
import { IconCar, IconFine, IconPark, IconSystem, IconWallet } from '@luparx/ui';
import type { ClaveCategoria } from './helpCenter';

/**
 * El icono de cada categoría del Centro de Ayuda.
 *
 * <p>Vive aparte de `helpCenter.ts` porque eso es una tabla de datos y esto es JSX; y aparte de las
 * pantallas porque las dos —las categorías y las opciones de una— dibujan el mismo icono, y dos
 * mapas iguales son dos mapas que algún día no lo serán.</p>
 */
export const ICONOS_CATEGORIA: Record<ClaveCategoria, React.ReactNode> = {
  parking: <IconPark />,
  payments: <IconWallet />,
  fines: <IconFine />,
  vehicles: <IconCar />,
  app: <IconSystem />,
};
