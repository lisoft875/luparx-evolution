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
  ParkingExtensionOption,
  ParkingQuoteResponse,
  ParkingRate,
  RateKind,
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
  /** Null when the stay was opened with a plate typed on the spot — somebody else's car (v0.11). */
  vehicleId: string | null;
  plateSnapshot: string;
  vehicleType: string;
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

export interface WireExtensionOption {
  minutes: number;
  chargeableMinutes: number;
  amount: WireMoney;
  creditMinutesApplied: number;
  payableMinutes: number;
  payable: WireMoney;
  newExpiresAt: string;
  allowed: boolean;
  unavailableReason?: string | null;
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
    vehicleId: wire.vehicleId ?? null,
    plateSnapshot: wire.plateSnapshot,
    vehicleType: wire.vehicleType,
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

/**
 * A tariff window as the server sends it.
 *
 * <p>The money arrives WRAPPED — `amount: {amountMinor, currencyCode}` — like every other amount on
 * this API. It had no adapter until v0.22, so `ParkingRate` was read straight off the wire and its
 * `amountMinor` and `currencyCode` were both `undefined` at runtime. That is not a cosmetic gap:
 * `formatCurrencyMinor` hands `currency: undefined` to `Intl.NumberFormat`, which throws, and the
 * throw unmounts the tree — the administrator sees a blank Tarifas screen with no error anywhere.
 * Every wrapped amount goes through an adapter for exactly this reason; this one was the omission.</p>
 */
export interface WireParkingRate {
  id: string;
  zoneId: string;
  /** Absent on servers older than v0.24; those only ever had the linear base. */
  kind?: RateKind | null;
  amount: WireMoney;
  minutes: number;
  validFrom: string;
  validTo?: string | null;
}

export function toParkingRate(wire: WireParkingRate): ParkingRate {
  return {
    id: wire.id,
    zoneId: wire.zoneId,
    kind: wire.kind ?? 'BLOCK',
    amountMinor: wire.amount.amountMinor,
    currencyCode: wire.amount.currencyCode,
    minutes: wire.minutes,
    validFrom: wire.validFrom,
    validTo: wire.validTo ?? null,
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

/** Unwraps the two money objects and normalises the absent reason to null. No arithmetic. */
export function toExtensionOption(wire: WireExtensionOption): ParkingExtensionOption {
  return {
    minutes: wire.minutes,
    chargeableMinutes: wire.chargeableMinutes,
    amountMinor: wire.amount.amountMinor,
    currencyCode: wire.amount.currencyCode,
    creditMinutesApplied: wire.creditMinutesApplied,
    payableMinutes: wire.payableMinutes,
    payableMinor: wire.payable.amountMinor,
    newExpiresAt: wire.newExpiresAt,
    allowed: wire.allowed,
    unavailableReason: wire.unavailableReason ?? null,
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
