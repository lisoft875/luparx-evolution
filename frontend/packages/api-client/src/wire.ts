/**
 * Wire ⇄ domain adapters.
 *
 * The server speaks its own shapes: money always travels as `{amountMinor, currencyCode}`
 * (CONTRACT.md §5 — an amount is never sent without its currency), and every collection that
 * could grow travels inside a page envelope, "una forma por endpoint" even when the list is
 * short (`GET /citizen/parking/sessions`).
 *
 * The apps, on the other hand, work with flat domain objects. Translating between the two is the
 * api-client's job and only the api-client's job: this is the anti-corruption layer at the
 * infrastructure boundary, so a wire change lands in one file instead of in twenty components.
 * Nothing here invents or recomputes business values — the server owns the arithmetic
 * (CONTRACT.md v0.2 §Invariantes); these functions only rename and unwrap.
 */

import type {
  ParkingQuoteResponse,
  ParkingSession,
  ParkingSessionStatus,
  TimeCreditsResponse,
  WalletResponse,
  WalletTransaction,
} from './types/domain';
import type { PagedResponse } from './types/http';

/** Money as the server always sends it (`MoneyDto`). */
export interface WireMoney {
  amountMinor: number;
  currencyCode: string;
}

export interface WireParkingSession {
  id: string;
  vehicleId: string;
  plateSnapshot: string;
  zoneId: string;
  zoneName: string;
  spaceId: string;
  spaceCode: string;
  startedAt: string;
  expiresAt: string;
  endedAt?: string | null;
  status: ParkingSessionStatus;
  bookedMinutes: number;
  remainingMinutes: number;
  amount: WireMoney;
  creditMinutesApplied: number;
}

export interface WireQuote {
  minutes: number;
  chargeableMinutes: number;
  amount: WireMoney;
  creditMinutesApplied: number;
  payableMinutes: number;
  payable: WireMoney;
}

export interface WireWalletTransaction {
  id: string;
  type: WalletTransaction['type'];
  amount: WireMoney;
  balanceAfter: WireMoney;
  reference?: string | null;
  createdAt: string;
}

export interface WireWallet {
  balance: WireMoney;
  transactions: PagedResponse<WireWalletTransaction>;
}

export interface WireTimeCreditLot {
  id: string;
  source: string;
  minutes: number;
  remainingMinutes: number;
  sessionId?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface WireTimeCredits {
  balanceMinutes: number;
  lots: WireTimeCreditLot[];
}

export function toParkingSession(wire: WireParkingSession): ParkingSession {
  return {
    id: wire.id,
    zoneId: wire.zoneId,
    zoneName: wire.zoneName,
    spaceId: wire.spaceId,
    spaceCode: wire.spaceCode,
    vehicleId: wire.vehicleId,
    plateSnapshot: wire.plateSnapshot,
    minutes: wire.bookedMinutes,
    remainingMinutes: wire.remainingMinutes,
    amountMinor: wire.amount.amountMinor,
    currencyCode: wire.amount.currencyCode,
    creditMinutesApplied: wire.creditMinutesApplied,
    status: wire.status,
    startedAt: wire.startedAt,
    expiresAt: wire.expiresAt,
    endedAt: wire.endedAt ?? null,
  };
}

/** Unwraps the page envelope the sessions endpoint always returns, ACTIVE included. */
export function toParkingSessions(wire: PagedResponse<WireParkingSession>): ParkingSession[] {
  return (wire?.items ?? []).map(toParkingSession);
}

export function toQuote(wire: WireQuote): ParkingQuoteResponse {
  return {
    minutes: wire.minutes,
    chargeableMinutes: wire.chargeableMinutes,
    amountMinor: wire.amount.amountMinor,
    currencyCode: wire.amount.currencyCode,
    creditMinutesApplied: wire.creditMinutesApplied,
    payableMinutes: wire.payableMinutes,
    payableMinor: wire.payable.amountMinor,
  };
}

export function toWallet(wire: WireWallet): WalletResponse {
  return {
    balanceMinor: wire.balance.amountMinor,
    currencyCode: wire.balance.currencyCode,
    transactions: (wire.transactions?.items ?? []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountMinor: tx.amount.amountMinor,
      currencyCode: tx.amount.currencyCode,
      balanceAfterMinor: tx.balanceAfter.amountMinor,
      reference: tx.reference ?? null,
      createdAt: tx.createdAt,
    })),
  };
}

/**
 * The balance is the server's; `expiresAt` is the earliest lot that still has minutes left —
 * the only date worth putting in front of the citizen, because it is the first one they can lose.
 */
export function toTimeCredits(wire: WireTimeCredits): TimeCreditsResponse {
  const expiries = (wire.lots ?? [])
    .filter((lot) => lot.remainingMinutes > 0 && Boolean(lot.expiresAt))
    .map((lot) => lot.expiresAt as string)
    .sort();
  return {
    minutes: wire.balanceMinutes,
    expiresAt: expiries[0] ?? null,
  };
}
