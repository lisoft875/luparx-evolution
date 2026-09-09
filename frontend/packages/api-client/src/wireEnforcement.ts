/**
 * Wire ⇄ domain adapters for enforcement (CONTRACT.md v0.7).
 *
 * Same job as ./wire and the same rule: nothing here computes a business value. The server owns
 * the arithmetic — which amount is payable today, whether the discount window is still open, what
 * a citation may transition to — and these functions only unwrap `MoneyDto` pairs and normalise
 * the server's absent fields to `null`, so a screen never has to ask whether a missing key means
 * "zero" or "not applicable".
 *
 * Money is unwrapped into minor units plus one `currencyCode` per record on purpose: a citation's
 * fine, its discounted amount and the amount payable are by construction the same currency (the
 * municipality's — the catalogue refuses to hold two), so carrying three copies of the code would
 * invite a screen to render two of them and disagree with itself.
 */

import type {
  AppealStatus,
  Citation,
  CitationAppeal,
  CitationDetail,
  CitationEvent,
  CitationEvidence,
  Fine,
  FineDetail,
  InfractionType,
  PlateStatus,
} from './types/domain';
import type { WireMoney } from './wire';

export interface WireInfractionType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  fine: WireMoney;
  discountedFine?: WireMoney | null;
  discountDays?: number | null;
  discountPercent?: number | null;
  dueDays: number;
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  active: boolean;
}

export interface WireBay {
  spaceId: string;
  spaceCode: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
}

export interface WireStay {
  sessionId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  spaceId: string;
  spaceCode: string;
  startedAt: string;
  expiresAt: string;
}

export interface WirePlateStatus {
  plate: string;
  plateNormalized: string;
  verdict: PlateStatus['verdict'];
  verdictLabelKey: string;
  requiresBay: boolean;
  bay?: WireBay | null;
  coveringStay?: WireStay | null;
  otherStays?: WireStay[] | null;
  checkedAt: string;
}

export interface WireCitation {
  id: string;
  number?: string | null;
  seriesYear?: number | null;
  status: Citation['status'];
  statusLabelKey: string;
  statusReason?: string | null;
  plate: string;
  vehicleId?: string | null;
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  spaceId?: string | null;
  spaceCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracyM?: number | null;
  addressText?: string | null;
  infractionTypeId: string;
  infractionCode: string;
  infractionName: string;
  fine: WireMoney;
  amountPayable: WireMoney;
  discountedFine?: WireMoney | null;
  discountUntil?: string | null;
  dueAt?: string | null;
  occurredAt: string;
  issuedAt?: string | null;
  deviceClockSkewSeconds?: number | null;
  inspectorUserId?: string | null;
  parkingSessionId?: string | null;
  notes?: string | null;
  evidenceCount: number;
}

export interface WireEvidence {
  id: string;
  kind: CitationEvidence['kind'];
  contentType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  note?: string | null;
  capturedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  contentUrl?: string | null;
}

export interface WireCitationEvent {
  id: string;
  action: CitationEvent['action'];
  actionLabelKey: string;
  fromStatus?: Citation['status'] | null;
  toStatus?: Citation['status'] | null;
  actorUserId?: string | null;
  actorPortal?: CitationEvent['actorPortal'];
  reason?: string | null;
  occurredAt: string;
}

export interface WireCitationDetail {
  citation: WireCitation;
  evidence?: WireEvidence[] | null;
  history?: WireCitationEvent[] | null;
}

export interface WireFine {
  id: string;
  number?: string | null;
  status: Citation['status'];
  statusLabelKey: string;
  plate: string;
  infractionCode: string;
  infractionName: string;
  zoneName?: string | null;
  spaceCode?: string | null;
  addressText?: string | null;
  fine: WireMoney;
  amountPayable: WireMoney;
  discountUntil?: string | null;
  dueAt?: string | null;
  occurredAt: string;
  issuedAt?: string | null;
  appealable: boolean;
  evidenceCount: number;
}

export interface WireFineDetail {
  fine: WireFine;
  evidence?: WireEvidence[] | null;
  history?: WireCitationEvent[] | null;
  appeal?: WireAppeal | null;
}

export function toInfractionType(wire: WireInfractionType): InfractionType {
  return {
    id: wire.id,
    code: wire.code,
    name: wire.name,
    description: wire.description ?? null,
    fineMinor: wire.fine.amountMinor,
    currencyCode: wire.fine.currencyCode,
    discountedFineMinor: wire.discountedFine?.amountMinor ?? null,
    discountDays: wire.discountDays ?? null,
    discountPercent: wire.discountPercent ?? null,
    dueDays: wire.dueDays,
    requiresPhoto: wire.requiresPhoto,
    allowsAppeal: wire.allowsAppeal,
    active: wire.active,
  };
}

export function toPlateStatus(wire: WirePlateStatus): PlateStatus {
  return {
    plate: wire.plate,
    plateNormalized: wire.plateNormalized,
    verdict: wire.verdict,
    verdictLabelKey: wire.verdictLabelKey,
    requiresBay: wire.requiresBay,
    bay: wire.bay ?? null,
    coveringStay: wire.coveringStay ?? null,
    otherStays: wire.otherStays ?? [],
    checkedAt: wire.checkedAt,
  };
}

export function toCitation(wire: WireCitation): Citation {
  return {
    id: wire.id,
    number: wire.number ?? null,
    seriesYear: wire.seriesYear ?? null,
    status: wire.status,
    statusLabelKey: wire.statusLabelKey,
    statusReason: wire.statusReason ?? null,
    plate: wire.plate,
    vehicleId: wire.vehicleId ?? null,
    zoneId: wire.zoneId ?? null,
    zoneCode: wire.zoneCode ?? null,
    zoneName: wire.zoneName ?? null,
    spaceId: wire.spaceId ?? null,
    spaceCode: wire.spaceCode ?? null,
    latitude: wire.latitude ?? null,
    longitude: wire.longitude ?? null,
    locationAccuracyM: wire.locationAccuracyM ?? null,
    addressText: wire.addressText ?? null,
    infractionTypeId: wire.infractionTypeId,
    infractionCode: wire.infractionCode,
    infractionName: wire.infractionName,
    fineMinor: wire.fine.amountMinor,
    amountPayableMinor: wire.amountPayable.amountMinor,
    discountedFineMinor: wire.discountedFine?.amountMinor ?? null,
    currencyCode: wire.fine.currencyCode,
    discountUntil: wire.discountUntil ?? null,
    dueAt: wire.dueAt ?? null,
    occurredAt: wire.occurredAt,
    issuedAt: wire.issuedAt ?? null,
    deviceClockSkewSeconds: wire.deviceClockSkewSeconds ?? null,
    inspectorUserId: wire.inspectorUserId ?? null,
    parkingSessionId: wire.parkingSessionId ?? null,
    notes: wire.notes ?? null,
    evidenceCount: wire.evidenceCount,
  };
}

export function toEvidence(wire: WireEvidence): CitationEvidence {
  return {
    id: wire.id,
    kind: wire.kind,
    contentType: wire.contentType ?? null,
    byteSize: wire.byteSize ?? null,
    sha256: wire.sha256 ?? null,
    note: wire.note ?? null,
    capturedAt: wire.capturedAt ?? null,
    latitude: wire.latitude ?? null,
    longitude: wire.longitude ?? null,
    createdAt: wire.createdAt,
    contentUrl: wire.contentUrl ?? null,
  };
}

export interface WireAppeal {
  id: string;
  citationId: string;
  status: AppealStatus;
  statusLabelKey: string;
  body: string;
  submittedAt: string;
  resolvedAt?: string | null;
  resolutionReason?: string | null;
  noticeVersion: number;
  maxImages: number;
  images?: WireEvidence[] | null;
}

export function toAppeal(wire: WireAppeal): CitationAppeal {
  return {
    id: wire.id,
    citationId: wire.citationId,
    status: wire.status,
    statusLabelKey: wire.statusLabelKey,
    body: wire.body,
    submittedAt: wire.submittedAt,
    resolvedAt: wire.resolvedAt ?? null,
    resolutionReason: wire.resolutionReason ?? null,
    noticeVersion: wire.noticeVersion,
    maxImages: wire.maxImages,
    images: (wire.images ?? []).map(toEvidence),
  };
}

export function toCitationEvent(wire: WireCitationEvent): CitationEvent {
  return {
    id: wire.id,
    action: wire.action,
    actionLabelKey: wire.actionLabelKey,
    fromStatus: wire.fromStatus ?? null,
    toStatus: wire.toStatus ?? null,
    actorUserId: wire.actorUserId ?? null,
    actorPortal: wire.actorPortal ?? null,
    reason: wire.reason ?? null,
    occurredAt: wire.occurredAt,
  };
}

export function toCitationDetail(wire: WireCitationDetail): CitationDetail {
  return {
    citation: toCitation(wire.citation),
    evidence: (wire.evidence ?? []).map(toEvidence),
    history: (wire.history ?? []).map(toCitationEvent),
  };
}

export function toFine(wire: WireFine): Fine {
  return {
    id: wire.id,
    number: wire.number ?? null,
    status: wire.status,
    statusLabelKey: wire.statusLabelKey,
    plate: wire.plate,
    infractionCode: wire.infractionCode,
    infractionName: wire.infractionName,
    zoneName: wire.zoneName ?? null,
    spaceCode: wire.spaceCode ?? null,
    addressText: wire.addressText ?? null,
    fineMinor: wire.fine.amountMinor,
    amountPayableMinor: wire.amountPayable.amountMinor,
    currencyCode: wire.fine.currencyCode,
    discountUntil: wire.discountUntil ?? null,
    dueAt: wire.dueAt ?? null,
    occurredAt: wire.occurredAt,
    issuedAt: wire.issuedAt ?? null,
    appealable: wire.appealable,
    evidenceCount: wire.evidenceCount,
  };
}

export function toFineDetail(wire: WireFineDetail): FineDetail {
  return {
    fine: toFine(wire.fine),
    evidence: (wire.evidence ?? []).map(toEvidence),
    history: (wire.history ?? []).map(toCitationEvent),
    appeal: wire.appeal ? toAppeal(wire.appeal) : null,
  };
}
