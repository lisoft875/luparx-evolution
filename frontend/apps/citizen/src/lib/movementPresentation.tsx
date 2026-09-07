import * as React from 'react';
import { IconCar, IconCreditCard, IconFine, type ListRowIconTone } from '@luparx/ui';
import type { MockMovementKind } from '../mocks/parkingDomain';

/** Icon + icon-box tone per ledger movement kind — shared by Home, Wallet and Movements so the three lists agree. */
export const MOVEMENT_ICON: Record<MockMovementKind, React.ReactNode> = {
  parking: <IconCar size={18} />,
  parkingExtension: <IconCar size={18} />,
  topup: <IconCreditCard size={18} />,
  fine: <IconFine size={18} />,
};

export const MOVEMENT_ICON_TONE: Record<MockMovementKind, ListRowIconTone> = {
  parking: 'primary',
  parkingExtension: 'primary',
  topup: 'success',
  fine: 'danger',
};
