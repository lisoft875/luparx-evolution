import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParkingSession } from '@luparx/api-client';
import { useTranslation } from '@luparx/i18n';
import { planParkingReminders, type ParkingReminder } from './parkingReminders';
import {
  createCapacitorScheduler,
  unavailableScheduler,
  type ReminderScheduler,
  type ScheduledReminder,
} from './reminderScheduler';

export interface UseParkingRemindersOptions {
  /** The stays the server says are running. Straight from the query — this hook re-reconciles on every change. */
  activeSessions: readonly ParkingSession[] | undefined;
  /** `ParkingPolicy.expiryWarningBeforeMinutes`; undefined while the policy loads, 0 disables the early warning. */
  warningBeforeMinutes: number | undefined;
  /** Injected in tests. Defaults to the Capacitor adapter, which reports itself unavailable on the web. */
  scheduler?: ReminderScheduler;
}

export interface ParkingRemindersState {
  /** False on the web and wherever the plugin is absent: the screen should then offer nothing. */
  available: boolean;
  granted: boolean;
  /** Asks the citizen. Call it from a button or when they start their first stay — never on mount. */
  requestPermission: () => Promise<boolean>;
}

/**
 * Keeps the phone's alarms in step with the stays that are actually running.
 *
 * Reconciliation rather than events, for the reasons written in `parkingReminders.ts`: the app is
 * not the only way a stay changes, and alarms that outlive their stay teach people to ignore them.
 * Since every mutation already invalidates the active-stays query, running this whenever that list
 * changes covers starting, extending, finishing — and opening the app after any of it happened
 * somewhere else.
 */
export function useParkingReminders(options: UseParkingRemindersOptions): ParkingRemindersState {
  const { activeSessions, warningBeforeMinutes } = options;
  const { t, locale } = useTranslation();

  const [scheduler, setScheduler] = useState<ReminderScheduler>(options.scheduler ?? unavailableScheduler);
  const [granted, setGranted] = useState(false);

  // Resolved once. On the web this settles immediately on the no-op implementation.
  useEffect(() => {
    if (options.scheduler) return;
    let cancelled = false;
    void createCapacitorScheduler().then(async (created) => {
      if (cancelled) return;
      setScheduler(created);
      if (created.isAvailable()) setGranted(await created.hasPermission());
    });
    return () => {
      cancelled = true;
    };
  }, [options.scheduler]);

  const requestPermission = useCallback(async () => {
    if (!scheduler.isAvailable()) return false;
    const ok = await scheduler.requestPermission();
    setGranted(ok);
    return ok;
  }, [scheduler]);

  // Two reconciliations must never overlap: both would read the same "pending" list and schedule the
  // same reminder twice. A flag is enough — this runs on one thread, in one component.
  const running = useRef(false);

  useEffect(() => {
    if (!scheduler.isAvailable() || !granted) return;
    if (activeSessions === undefined || warningBeforeMinutes === undefined) return;
    if (running.current) return;

    running.current = true;
    void (async () => {
      try {
        const pending = await scheduler.pending();
        const { schedule, cancelIds } = planParkingReminders({
          activeSessions,
          pending,
          warningBeforeMinutes,
          now: new Date(),
        });

        // Cancelled first: an extension rewrites the same id, and cancelling afterwards would undo
        // the reminder that was just written.
        if (cancelIds.length > 0) await scheduler.cancel(cancelIds);
        if (schedule.length > 0) await scheduler.schedule(schedule.map(withText));
      } catch {
        // A phone that refuses to schedule must not take the screen down with it. The stay is still
        // on screen with its countdown, which is the part that always works.
      } finally {
        running.current = false;
      }
    })();

    function withText(reminder: ParkingReminder): ScheduledReminder {
      const values = {
        plate: reminder.plate,
        space: reminder.spaceCode,
        minutes: reminder.minutesBefore,
      };
      return {
        ...reminder,
        title: t(
          reminder.kind === 'EXPIRING'
            ? 'citizen.reminder.expiring.title'
            : 'citizen.reminder.expired.title',
          values,
        ),
        body: t(
          reminder.kind === 'EXPIRING'
            ? 'citizen.reminder.expiring.body'
            : 'citizen.reminder.expired.body',
          values,
        ),
      };
    }
    // `locale` is a dependency on purpose: changing language must rewrite the pending reminders, or
    // the citizen keeps receiving them in the language they just left.
  }, [scheduler, granted, activeSessions, warningBeforeMinutes, t, locale]);

  return { available: scheduler.isAvailable(), granted, requestPermission };
}
