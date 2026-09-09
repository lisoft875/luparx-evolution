import type { CitationAction, CitationStatus, EvidenceKind, PlateVerdict, Portal } from '@luparx/api-client';
import type { TranslationKey } from '@luparx/i18n';
import type { BadgeTone } from '@luparx/ui';

/**
 * How enforcement's server-side vocabulary is rendered, in one place for all three portals.
 *
 * The server sends `statusLabelKey`, `actionLabelKey` and `verdictLabelKey` — never a translated
 * word, because the officer and the citizen may read different languages. The client still keeps
 * its own key table rather than passing the server's string straight to `t()`: a key the server
 * knows and the dictionary does not must fail `tsc`, not appear on screen as raw text. The two
 * tables are the same by construction (`citation.status.` + lowercase name), and this is where
 * that agreement is checked.
 */

export function citationStatusKey(status: CitationStatus): TranslationKey {
  return CITATION_STATUS_KEYS[status];
}

const CITATION_STATUS_KEYS: Record<CitationStatus, TranslationKey> = {
  DRAFT: 'citation.status.draft',
  ISSUED: 'citation.status.issued',
  PAID: 'citation.status.paid',
  APPEALED: 'citation.status.appealed',
  UPHELD: 'citation.status.upheld',
  DISMISSED: 'citation.status.dismissed',
  CANCELLED: 'citation.status.cancelled',
  EXPIRED: 'citation.status.expired',
};

/**
 * The tone a status is drawn in. Never the only carrier of meaning: every place this is used pairs
 * it with the translated word (DESIGN_SYSTEM.md §2 — "nunca comunicar estado sólo por color").
 */
export function citationStatusTone(status: CitationStatus): BadgeTone {
  switch (status) {
    case 'PAID':
    case 'DISMISSED':
      return 'success';
    case 'DRAFT':
    case 'APPEALED':
      return 'warning';
    case 'CANCELLED':
      return 'neutral';
    case 'EXPIRED':
      return 'danger';
    default:
      return 'info';
  }
}

export function citationActionKey(action: CitationAction): TranslationKey {
  return CITATION_ACTION_KEYS[action];
}

const CITATION_ACTION_KEYS: Record<CitationAction, TranslationKey> = {
  DRAFTED: 'citation.action.drafted',
  ISSUED: 'citation.action.issued',
  EVIDENCE_ATTACHED: 'citation.action.evidence_attached',
  PAID: 'citation.action.paid',
  APPEALED: 'citation.action.appealed',
  APPEAL_UPHELD: 'citation.action.appeal_upheld',
  APPEAL_DISMISSED: 'citation.action.appeal_dismissed',
  CANCELLED: 'citation.action.cancelled',
  EXPIRED: 'citation.action.expired',
};

export function plateVerdictKey(verdict: PlateVerdict): TranslationKey {
  return PLATE_VERDICT_KEYS[verdict];
}

const PLATE_VERDICT_KEYS: Record<PlateVerdict, TranslationKey> = {
  COVERED: 'plate.verdict.covered',
  BAY_MISMATCH: 'plate.verdict.bay_mismatch',
  NOT_COVERED: 'plate.verdict.not_covered',
  AMBIGUOUS: 'plate.verdict.ambiguous',
};

export function evidenceKindKey(kind: EvidenceKind): TranslationKey {
  return kind === 'PHOTO' ? 'citation.evidence.photo' : 'citation.evidence.note';
}

export function actorPortalKey(portal: Portal | null): TranslationKey | null {
  if (!portal) return null;
  return ACTOR_PORTAL_KEYS[portal] ?? null;
}

const ACTOR_PORTAL_KEYS: Record<Portal, TranslationKey> = {
  citizen: 'citation.history.portal.citizen',
  admin: 'citation.history.portal.admin',
  inspector: 'citation.history.portal.inspector',
  platform: 'citation.history.portal.platform',
};

/** Bytes as a person reads them, locale-aware for the number and never for the unit symbol. */
export function formatBytes(bytes: number, format: (value: number) => string): string {
  if (bytes < 1024) return `${format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${format(Math.round((bytes / 1024) * 10) / 10)} kB`;
  return `${format(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
}
