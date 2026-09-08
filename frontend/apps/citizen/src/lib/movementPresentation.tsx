import * as React from 'react';
import type { WalletTransaction, WalletTransactionType } from '@luparx/api-client';
import type { TranslationKey } from '@luparx/i18n';
import { IconCar, IconCreditCard, type ListRowIconTone } from '@luparx/ui';

/**
 * One presentation of a wallet movement, shared by Home, Wallet and Movements so the three lists
 * agree on what a charge looks like. The wallet endpoint is the ledger (CONTRACT.md v0.2 rule 6:
 * finances are per tenant), so the movement kind comes from the server's transaction type and is
 * never inferred from the sign of the amount.
 */
export const MOVEMENT_ICON: Record<WalletTransactionType, React.ReactNode> = {
  SESSION_CHARGE: <IconCar size={18} />,
  EXTENSION_CHARGE: <IconCar size={18} />,
  TOP_UP: <IconCreditCard size={18} />,
  ADJUSTMENT: <IconCreditCard size={18} />,
};

export const MOVEMENT_ICON_TONE: Record<WalletTransactionType, ListRowIconTone> = {
  SESSION_CHARGE: 'primary',
  EXTENSION_CHARGE: 'primary',
  TOP_UP: 'success',
  ADJUSTMENT: 'primary',
};

export const MOVEMENT_TITLE_KEY: Record<WalletTransactionType, TranslationKey> = {
  SESSION_CHARGE: 'citizen.movements.item.parking',
  EXTENSION_CHARGE: 'citizen.movements.item.parkingExtension',
  TOP_UP: 'citizen.movements.item.topup',
  ADJUSTMENT: 'citizen.movements.item.adjustment',
};

export type MovementFilter = 'all' | 'parking' | 'topups' | 'fines';

/**
 * Fines are not wallet movements in this version — the ledger the wallet returns only carries
 * parking charges, top-ups and adjustments — so the "fines" filter legitimately comes back empty
 * rather than being dropped from the tab row: the tab exists in the design and citation charges
 * will land in the same ledger.
 */
const FILTER_TYPES: Record<MovementFilter, WalletTransactionType[] | null> = {
  all: null,
  parking: ['SESSION_CHARGE', 'EXTENSION_CHARGE'],
  topups: ['TOP_UP', 'ADJUSTMENT'],
  fines: [],
};

export function filterMovements(movements: WalletTransaction[], filter: MovementFilter): WalletTransaction[] {
  const types = FILTER_TYPES[filter];
  return types ? movements.filter((movement) => types.includes(movement.type)) : movements;
}
