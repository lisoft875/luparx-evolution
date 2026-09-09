import * as React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation, formatDate } from '@luparx/i18n';
import { Alert, Button, Modal } from '@luparx/ui';
import type { ParkingPolicy, ParkingSession } from '@luparx/api-client';
import { useFinishParkingSession } from '../lib/queries';
import { parkingErrorMessage } from '../lib/apiErrors';

export interface FinishSessionConfirmProps {
  open: boolean;
  onClose: () => void;
  session: ParkingSession;
  policy: ParkingPolicy;
}

/**
 * "¿Terminar el estacionamiento?" — the reference dialog's two sentences, in this order and with
 * nothing between them: what happens to the stay, then what happens to the time not used.
 *
 * <p>The second sentence is the municipality's policy, not a house style. Where
 * `creditOnEarlyFinishEnabled` is on and enough minutes remain to clear
 * `creditMinRemainingMinutes`, it says how many minutes are credited and the date they lapse; where
 * it is off, or too little is left to qualify, it says plainly that they are lost. A single
 * "el tiempo no utilizado no se reembolsa" would be a lie in the first municipality and
 * "se te acreditan los minutos" a lie in the second, so neither is hardcoded.</p>
 *
 * <p>The parent renders this only when `policy.earlyFinishEnabled` is true — the same gate the
 * finish action itself is behind.</p>
 */
export function FinishSessionConfirm({ open, onClose, session, policy }: FinishSessionConfirmProps): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const finish = useFinishParkingSession();

  const remainingMinutes = useMemo(
    () => Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 60_000)),
    // Recomputed each time the dialog opens (open toggling to true), not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.expiresAt, open],
  );
  const willCredit = policy.creditOnEarlyFinishEnabled && remainingMinutes >= policy.creditMinRemainingMinutes;
  const creditExpiryDate =
    policy.creditExpiryDays > 0 ? new Date(Date.now() + policy.creditExpiryDays * 24 * 60 * 60 * 1000) : null;

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      await finish.mutateAsync(session.id);
      onClose();
    } catch (err) {
      setError(parkingErrorMessage(err, t));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('citizen.parking.finish.confirmTitle')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {/* Body copy, not an alert box: this is the description of an action the citizen asked
            for, and dressing it in a warning colour would make an ordinary early finish read as a
            failure. The consequence below carries the tone. */}
        <p className="lx-text-body" style={{ margin: 0 }}>
          {t('citizen.parking.finish.immediate', { space: session.spaceCode })}
        </p>

        <p className="lx-text-meta" style={{ margin: 0 }}>
          {willCredit
            ? t('citizen.parking.finish.confirmDescription.credited', {
                minutes: tPlural('citizen.parking.durationMinutes', remainingMinutes),
                date: creditExpiryDate ? formatDate(creditExpiryDate, locale) : t('citizen.wallet.timeCredits.noExpiry'),
              })
            : t('citizen.parking.finish.confirmDescription.lost', {
                minutes: tPlural('citizen.parking.durationMinutes', remainingMinutes),
              })}
        </p>

        <div className="lx-dialog-actions">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="danger" fullWidth loading={finish.isPending} onClick={handleSubmit}>
            {t('citizen.parking.finish.confirmSubmit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
