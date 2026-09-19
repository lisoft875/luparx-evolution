import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import { IconCar, Modal, Timer } from '@luparx/ui';
import type { ParkingSession } from '@luparx/api-client';
import { useParkingReminders } from '@luparx/features';
import { useActiveParkingSessions, useParkingPolicy } from '../lib/queries';

const WARNING_THRESHOLD_SECONDS = 600;

/**
 * Always floored, never rounded (CONTRACT.md v0.10). A countdown that rounds to nearest shows
 * 45:00 while 44:59.6 remain, and the number the citizen is watching has to be one the server would
 * agree with: the credit granted on an early finish is `Duration.toMinutes()`, which truncates. Any
 * rounding up here is the app promising a minute that the municipality will not give back.
 */
function remainingSecondsOf(session: ParkingSession): number {
  return Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
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
  const { t } = useTranslation();
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

  return (
    <Timer
      remainingSeconds={remaining}
      warningThresholdSeconds={WARNING_THRESHOLD_SECONDS}
      // A cero se dice la palabra: «00:00» no distingue «venció» de «está por vencer».
      expiredLabel={t('citizen.timer.expired')}
      aria-label={session.plateSnapshot}
    />
  );
}

/**
 * The running-stay bar: pinned to the **top** of every screen while at least one parking session is
 * active (CONTRACT.md v0.2 rule 3, moved up in v0.10). Shows the plate + countdown of whichever
 * session expires first; a `+N` chip opens the full list when there's more than one.
 *
 * <p>It used to sit above the bottom tab bar, which put the one number the citizen actually wants
 * to see in the corner of the screen the thumb rests over, competing with five destinations for
 * attention. At the top it is the first thing on every screen and reads as the state of the app
 * rather than as a sixth tab. `CitizenShell` is what makes it stick there.</p>
 */
export function ActiveSessionsBar(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { data: sessions } = useActiveParkingSessions();
  const { data: policy } = useParkingPolicy();
  const [listOpen, setListOpen] = useState(false);
  const [isPrimaryWarning, setIsPrimaryWarning] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const sorted = useMemo(
    () => (sessions ?? []).slice().sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
    [sessions],
  );
  const primary = sorted[0];
  const extraCount = sorted.length - 1;

  // Keeps the phone's own alarms in step with the stays that are running: scheduled on the device,
  // so the warning arrives in an underground car park with no signal. It lives here because this
  // component is mounted on every screen for as long as there is a stay, which makes it the one
  // place that sees every change — including those made from another device.
  //
  // Above the early return on purpose: hooks cannot be conditional, and this one must also run when
  // the list empties out, which is precisely when the stale reminders have to be cancelled.
  useParkingReminders({
    activeSessions: sessions,
    warningBeforeMinutes: policy?.expiryWarningBeforeMinutes,
  });

  if (!primary) return null;

  function handlePrimaryWarningChange(isWarning: boolean): void {
    setIsPrimaryWarning(isWarning);
    if (isWarning) setAnnouncement(t('citizen.timerBar.announce.warning', { plate: primary!.plateSnapshot }));
  }

  return (
    <>
      <div
        className={['lx-sticky-timer-bar', isPrimaryWarning ? 'lx-sticky-timer-bar--warning' : ''].filter(Boolean).join(' ')}
        // Top chrome now, not bottom: a dropdown that flips upwards must stop below this bar
        // instead of running beneath it (see Select's `measure`).
        data-lx-top-chrome=""
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
