import type {
  BillingTotals,
  Payment,
  Reconciliation,
  Settlement,
  SettlementLine,
} from './types/domain';

/**
 * Wire adapters for billing (v0.35).
 *
 * Every amount crosses the wire wrapped as `{ amountMinor, currencyCode }` (ADR 0009), and every one
 * of them needs unwrapping here. This file exists because of the defect of v0.22: a wrapped amount
 * read as a bare number gives `undefined`, `Intl.NumberFormat` throws on an undefined currency, and
 * React unmounts the screen — which on this screen would be the one showing a municipality what it
 * is owed.
 */
interface WireMoney {
  amountMinor: number;
  currencyCode: string;
}

export interface WirePayment {
  id: string;
  method: Payment['method'];
  methodLabelKey: string;
  provider?: string | null;
  providerReference?: string | null;
  status: Payment['status'];
  statusLabelKey: string;
  purpose: Payment['purpose'];
  gross: WireMoney;
  fee?: WireMoney | null;
  net?: WireMoney | null;
  reconciliationStatus: Payment['reconciliationStatus'];
  reconciliationLabelKey: string;
  requestedAt: string;
  confirmedAt?: string | null;
  settledAt?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  userId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
}

export interface WireBillingTotals {
  capturedGross: WireMoney;
  capturedNet: WireMoney;
  settledGross: WireMoney;
  unsettledGross: WireMoney;
  capturedCount: number;
  failedCount: number;
  from: string;
  to: string;
}

export interface WireSettlement {
  id: string;
  provider: string;
  externalReference: string;
  periodStart: string;
  periodEnd: string;
  declaredGross: WireMoney;
  declaredFee: WireMoney;
  declaredNet: WireMoney;
  depositExpectedOn?: string | null;
  depositReference?: string | null;
  status: Settlement['status'];
  statusLabelKey: string;
  importedAt: string;
  reconciledAt?: string | null;
}

export interface WireSettlementLine {
  id: string;
  providerReference: string;
  gross: WireMoney;
  fee: WireMoney;
  net: WireMoney;
  occurredAt?: string | null;
  paymentId?: string | null;
  matchStatus: SettlementLine['matchStatus'];
  matchLabelKey: string;
}

export interface WireReconciliation {
  settlement: WireSettlement;
  lineCount: number;
  matched: number;
  unknownPayments: number;
  amountMismatches: number;
  duplicates: number;
  missingPayments: number;
  lineGross: WireMoney;
  lineFee: WireMoney;
  lineNet: WireMoney;
  declaredTotalsDisagree: boolean;
  hasFindings: boolean;
  findings?: WireSettlementLine[] | null;
}

export function toPayment(wire: WirePayment): Payment {
  return {
    id: wire.id,
    method: wire.method,
    methodLabelKey: wire.methodLabelKey,
    provider: wire.provider ?? null,
    providerReference: wire.providerReference ?? null,
    status: wire.status,
    statusLabelKey: wire.statusLabelKey,
    purpose: wire.purpose,
    grossMinor: wire.gross.amountMinor,
    // Null stays null. An unknown fee is not a fee of zero, and showing it as one would tell a
    // municipality it received the whole amount when nobody has said so yet.
    feeMinor: wire.fee?.amountMinor ?? null,
    netMinor: wire.net?.amountMinor ?? null,
    currencyCode: wire.gross.currencyCode,
    reconciliationStatus: wire.reconciliationStatus,
    reconciliationLabelKey: wire.reconciliationLabelKey,
    requestedAt: wire.requestedAt,
    confirmedAt: wire.confirmedAt ?? null,
    settledAt: wire.settledAt ?? null,
    failureCode: wire.failureCode ?? null,
    failureReason: wire.failureReason ?? null,
    userId: wire.userId ?? null,
    targetType: wire.targetType ?? null,
    targetId: wire.targetId ?? null,
  };
}

export function toBillingTotals(wire: WireBillingTotals): BillingTotals {
  return {
    capturedGrossMinor: wire.capturedGross.amountMinor,
    capturedNetMinor: wire.capturedNet.amountMinor,
    settledGrossMinor: wire.settledGross.amountMinor,
    unsettledGrossMinor: wire.unsettledGross.amountMinor,
    currencyCode: wire.capturedGross.currencyCode,
    capturedCount: wire.capturedCount,
    failedCount: wire.failedCount,
    from: wire.from,
    to: wire.to,
  };
}

export function toSettlement(wire: WireSettlement): Settlement {
  return {
    id: wire.id,
    provider: wire.provider,
    externalReference: wire.externalReference,
    periodStart: wire.periodStart,
    periodEnd: wire.periodEnd,
    declaredGrossMinor: wire.declaredGross.amountMinor,
    declaredFeeMinor: wire.declaredFee.amountMinor,
    declaredNetMinor: wire.declaredNet.amountMinor,
    currencyCode: wire.declaredGross.currencyCode,
    depositExpectedOn: wire.depositExpectedOn ?? null,
    depositReference: wire.depositReference ?? null,
    status: wire.status,
    statusLabelKey: wire.statusLabelKey,
    importedAt: wire.importedAt,
    reconciledAt: wire.reconciledAt ?? null,
  };
}

export function toSettlementLine(wire: WireSettlementLine): SettlementLine {
  return {
    id: wire.id,
    providerReference: wire.providerReference,
    grossMinor: wire.gross.amountMinor,
    feeMinor: wire.fee.amountMinor,
    netMinor: wire.net.amountMinor,
    currencyCode: wire.gross.currencyCode,
    occurredAt: wire.occurredAt ?? null,
    paymentId: wire.paymentId ?? null,
    matchStatus: wire.matchStatus,
    matchLabelKey: wire.matchLabelKey,
  };
}

export function toReconciliation(wire: WireReconciliation): Reconciliation {
  return {
    settlement: toSettlement(wire.settlement),
    lineCount: wire.lineCount,
    matched: wire.matched,
    unknownPayments: wire.unknownPayments,
    amountMismatches: wire.amountMismatches,
    duplicates: wire.duplicates,
    missingPayments: wire.missingPayments,
    lineGrossMinor: wire.lineGross.amountMinor,
    lineFeeMinor: wire.lineFee.amountMinor,
    lineNetMinor: wire.lineNet.amountMinor,
    currencyCode: wire.lineGross.currencyCode,
    declaredTotalsDisagree: wire.declaredTotalsDisagree,
    hasFindings: wire.hasFindings,
    findings: (wire.findings ?? []).map(toSettlementLine),
  };
}
