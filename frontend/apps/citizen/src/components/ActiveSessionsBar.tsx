import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import { IconCar, Modal, Timer } from '@luparx/ui';
import type { ParkingSession } from '@luparx/api-client';
import { useActiveParkingSessions } from '../lib/queries';

const WARNING_THRESHOLD_SECONDS = 600;

function remainingSecondsOf(session: ParkingSession): number {
  return Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
}

/**
 * Owns its own 1-second interval so a tick re-renders only this small leaf — never the bar
 * container, the sessions-list modal, or any page content (CONTRACT.md v0.2 rule 3 "actualizarse
 * cada segundo sin re-renderizar toda la app"). `onWarningChange` fires only when the threshold is
 * crossed (entering or leaving warning), not every tick, so the parent can drive both the bar's
 * tone and a moderate `aria-live` announcement.
 */
function SessionCountdown({
  session,
  onWarningChange,
}: {
  session: ParkingSession;
  onWarningChange?: (isWarning: boolean) => void;
}): React.JSX.Element {
  const [remaining, setRemaining] = useState(() => remainingSecondsOf(session));
  const wasWarningRef = useRef<boolean | null>(null);

  useEffect(() => {
    wasWarningRef.current = null;
    function tick(): void {
      const next = remainingSecondsOf(session);
      setRemaining(next);
      const isWarning = next <= WARNING_THRESHOLD_SECONDS;
      if (wasWarningRef.current !== isWarning) {
        wasWarningRef.current = isWarning;
        onWarningChange?.(isWarning);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // `onWarningChange` is a fresh closure per render in the caller; re-subscribing on it would
    // restart the interval every render. Only the session identity should reset the ticker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.expiresAt]);

  return <Timer remainingSeconds={remaining} warningThresholdSeconds={WARNING_THRESHOLD_SECONDS} aria-label={session.plateSnapshot} />;
}

/**
 * Fixed bar shown just above the bottom tab bar on every screen while at least one parking
 * session is active (CONTRACT.md v0.2 rule 3). Shows the plate + countdown of whichever session
 * expires first; a `+N` chip opens the full list when there's more than one.
 */
export function ActiveSessionsBar(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { data: sessions } = useActiveParkingSessions();
  const [listOpen, setListOpen] = useState(false);
  const [isPrimaryWarning, setIsPrimaryWarning] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const sorted = useMemo(
    () => (sessions ?? []).slice().sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
    [sessions],
  );
  const primary = sorted[0];
  const extraCount = sorted.length - 1;

  if (!primary) return null;

  function handlePrimaryWarningChange(isWarning: boolean): void {
    setIsPrimaryWarning(isWarning);
    if (isWarning) setAnnouncement(t('citizen.timerBar.announce.warning', { plate: primary!.plateSnapshot }));
  }

  return (
    <>
      <div
        className={['lx-sticky-timer-bar', isPrimaryWarning ? 'lx-sticky-timer-bar--warning' : ''].filter(Boolean).join(' ')}
        role="group"
        aria-label={t('citizen.home.activeSession.title')}
      >
        <span className="lx-sticky-timer-bar__icon" aria-hidden="true">
          <IconCar size={18} />
        </span>
        <span className="lx-sticky-timer-bar__body">
          <span className="lx-sticky-timer-bar__plate">{primary.plateSnapshot}</span>
          <span className="lx-sticky-timer-bar__meta">
            {primary.zoneName} · {primary.spaceCode}
          </span>
        </span>
        <SessionCountdown session={primary} onWarningChange={handlePrimaryWarningChange} />
        {extraCount > 0 ? (
          <button
            type="button"
            className="lx-sticky-timer-bar__more"
            onClick={() => setListOpen(true)}
            aria-label={t('citizen.timerBar.moreLabel')}
          >
            {t('citizen.timerBar.moreCount', { count: extraCount })}
          </button>
        ) : null}
        <span className="lx-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </span>
      </div>

      <Modal open={listOpen} onClose={() => setListOpen(false)} title={t('citizen.timerBar.listTitle')} closeLabel={t('common.close')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          {sorted.map((session) => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
              <div style={{ minWidth: 0 }}>
                <p className="lx-text-card-title" style={{ margin: 0 }}>
                  {session.plateSnapshot}
                </p>
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {session.zoneName} · {session.spaceCode}
                </p>
              </div>
              <SessionCountdown session={session} />
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
