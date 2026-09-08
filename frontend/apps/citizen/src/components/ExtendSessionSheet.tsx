import * as React from 'react';
import { useState } from 'react';
import { useTranslation, formatCurrencyMinor, formatTime } from '@luparx/i18n';
import { Alert, Button, ChipGroup, Modal } from '@luparx/ui';
import type { ParkingPolicy, ParkingSession } from '@luparx/api-client';
import { useExtendParkingSession } from '../lib/queries';
import { parkingErrorMessage } from '../lib/apiErrors';
import { formatDurationLabel } from '../lib/duration';

export interface ExtendSessionSheetProps {
  open: boolean;
  onClose: () => void;
  session: ParkingSession;
  policy: ParkingPolicy;
}

/**
 * Extension options always come from `policy.extensionIncrementsMinutes` (CONTRACT.md v0.2 rule
 * 4 — "el ciudadano elige cuánto extender, entre las opciones que configura la municipalidad").
 * Cost is an average of the flat zone rate already charged on this session (`amountMinor /
 * minutes`) — the same rate the server applies, so the preview matches the confirmed charge.
 */
export function ExtendSessionSheet({ open, onClose, session, policy }: ExtendSessionSheetProps): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const [minutes, setMinutes] = useState<number | null>(policy.extensionIncrementsMinutes[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const extend = useExtendParkingSession();

  const rateMinorPerMinute = session.minutes > 0 ? session.amountMinor / session.minutes : 0;
  const costMinor = minutes ? Math.round(rateMinorPerMinute * minutes) : 0;
  const newExpiry = minutes ? new Date(new Date(session.expiresAt).getTime() + minutes * 60_000) : null;

  async function handleSubmit(): Promise<void> {
    if (!minutes) return;
    setError(null);
    try {
      await extend.mutateAsync({ id: session.id, payload: { minutes } });
      onClose();
    } catch (err) {
      setError(parkingErrorMessage(err, t));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('citizen.parking.extend.title')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        <p className="lx-text-body" style={{ margin: 0, color: 'var(--lx-text-muted)' }}>
          {t('citizen.parking.extend.description')}
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <ChipGroup
          aria-label={t('citizen.parking.extend.title')}
          value={minutes !== null ? String(minutes) : ''}
          onChange={(value) => setMinutes(Number(value))}
          options={policy.extensionIncrementsMinutes.map((option) => ({
            value: String(option),
            label: formatDurationLabel(option, tPlural),
          }))}
        />
        {minutes !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <SummaryRow label={t('citizen.parking.extend.costLabel')} value={formatCurrencyMinor(costMinor, session.currencyCode, locale)} />
            {newExpiry ? (
              <SummaryRow label={t('citizen.parking.extend.newExpiryLabel')} value={formatTime(newExpiry, locale)} />
            ) : null}
          </div>
        ) : null}
        <Button type="button" variant="primary" fullWidth loading={extend.isPending} disabled={minutes === null} onClick={handleSubmit}>
          {t('citizen.parking.extend.submit')}
        </Button>
      </div>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
      <span className="lx-text-meta">{label}</span>
      <span className="lx-text-body" style={{ fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}
