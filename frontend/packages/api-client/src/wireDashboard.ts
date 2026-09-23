import type { Dashboard, RevenueSeries } from './types/domain';

/**
 * Wire adapter for the dashboard (v0.36).
 *
 * Every amount crosses wrapped (ADR 0009) and every one is unwrapped here. On this screen it matters
 * twice over: the figures sit next to each other, so one rendered from `undefined` would not look
 * broken — it would look like a zero, on a screen a municipality reads to decide something.
 */
interface WireMoney {
  amountMinor: number;
  currencyCode: string;
}

export interface WireDashboard {
  from: string;
  to: string;
  now: string;
  revenue: {
    capturedGross: WireMoney;
    capturedNet: WireMoney;
    settledGross: WireMoney;
    unsettledGross: WireMoney;
    capturedCount: number;
  };
  transactions?: { type: string; labelKey: string; count: number; total: WireMoney }[] | null;
  parking?: { paymentStatus: string | null; labelKey: string; count: number; total: WireMoney }[] | null;
  occupancy: {
    activeSessions: number;
    unzonedActive: number;
    zones?:
      | {
          zoneId: string;
          code: string;
          name: string;
          activeSessions: number;
          baysInService: number;
          percent: number | null;
        }[]
      | null;
  };
  checks?: { verdict: string; labelKey: string; count: number }[] | null;
  citations?: { status: string; labelKey: string; count: number; total: WireMoney }[] | null;
  exemptions?: { status: string; labelKey: string; count: number }[] | null;
  inspectors?:
    | { inspectorUserId: string; name: string | null; checks: number; citations: number; lastCheckAt: string | null }[]
    | null;
  paymentFailures: {
    count: number;
    amount: WireMoney;
    byReason?: { code: string; reason: string; count: number; amount: WireMoney }[] | null;
  };
}

export function toDashboard(wire: WireDashboard): Dashboard {
  return {
    from: wire.from,
    to: wire.to,
    now: wire.now,
    currencyCode: wire.revenue.capturedGross.currencyCode,
    revenue: {
      capturedGrossMinor: wire.revenue.capturedGross.amountMinor,
      capturedNetMinor: wire.revenue.capturedNet.amountMinor,
      settledGrossMinor: wire.revenue.settledGross.amountMinor,
      unsettledGrossMinor: wire.revenue.unsettledGross.amountMinor,
      capturedCount: wire.revenue.capturedCount,
    },
    transactions: (wire.transactions ?? []).map((row) => ({
      type: row.type,
      labelKey: row.labelKey,
      count: row.count,
      totalMinor: row.total.amountMinor,
    })),
    parking: (wire.parking ?? []).map((row) => ({
      paymentStatus: row.paymentStatus,
      labelKey: row.labelKey,
      count: row.count,
      totalMinor: row.total.amountMinor,
    })),
    occupancy: {
      activeSessions: wire.occupancy.activeSessions,
      unzonedActive: wire.occupancy.unzonedActive,
      zones: (wire.occupancy.zones ?? []).map((zone) => ({
        zoneId: zone.zoneId,
        code: zone.code,
        name: zone.name,
        activeSessions: zone.activeSessions,
        baysInService: zone.baysInService,
        // Null stays null: a zone with no numbered bays has no percentage, which is not 0%.
        percent: zone.percent ?? null,
      })),
    },
    checks: (wire.checks ?? []).map((row) => ({
      verdict: row.verdict,
      labelKey: row.labelKey,
      count: row.count,
    })),
    citations: (wire.citations ?? []).map((row) => ({
      status: row.status,
      labelKey: row.labelKey,
      count: row.count,
      totalMinor: row.total.amountMinor,
    })),
    exemptions: (wire.exemptions ?? []).map((row) => ({
      status: row.status,
      labelKey: row.labelKey,
      count: row.count,
    })),
    inspectors: (wire.inspectors ?? []).map((row) => ({
      inspectorUserId: row.inspectorUserId,
      name: row.name ?? null,
      checks: row.checks,
      citations: row.citations,
      lastCheckAt: row.lastCheckAt ?? null,
    })),
    paymentFailures: {
      count: wire.paymentFailures.count,
      amountMinor: wire.paymentFailures.amount.amountMinor,
      byReason: (wire.paymentFailures.byReason ?? []).map((row) => ({
        code: row.code,
        reason: row.reason,
        count: row.count,
        amountMinor: row.amount.amountMinor,
      })),
    },
  };
}

export interface WireRevenueSeries {
  from: string;
  to: string;
  zone: string;
  days?: { date: string; total: WireMoney; count: number }[] | null;
  total: WireMoney;
}

/**
 * La serie diaria de recaudación.
 *
 * <p>La moneda sale del total y no de la primera barra: un rango donde el primer día no recaudó
 * nada trae igual su moneda —el servidor escribe el cero con ella— pero depender de una fila que
 * podría no existir es cómo se cuela un `undefined` en un eje de dinero.</p>
 */
export function toRevenueSeries(wire: WireRevenueSeries): RevenueSeries {
  return {
    from: wire.from,
    to: wire.to,
    zone: wire.zone,
    currencyCode: wire.total.currencyCode,
    totalMinor: wire.total.amountMinor,
    days: (wire.days ?? []).map((day) => ({
      date: day.date,
      totalMinor: day.total.amountMinor,
      count: day.count,
    })),
  };
}
