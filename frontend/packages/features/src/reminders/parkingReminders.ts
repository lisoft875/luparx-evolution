import type { ParkingSession } from '@luparx/api-client';

/**
 * What the phone should have scheduled for the stays that are running, and what it must forget.
 *
 * <h2>Why the device and not the server</h2>
 *
 * The instant a stay ends is known the moment it starts, so the warning does not need a network at
 * all: the phone sets its own alarm. That matters because the moment a citizen most needs the
 * warning — parked underground, about to overstay — is exactly where a push notification does not
 * arrive. The server-side notifications (ADR 0021) stay as they are and cover the cases the device
 * cannot know about on its own; these are the ones that work with the phone in airplane mode.
 *
 * <h2>Reconciliation, not events</h2>
 *
 * The obvious implementation schedules on "stay started" and cancels on "stay finished". It is
 * wrong in three ordinary situations: the citizen extends from another device, the app was closed
 * when something changed, or they reinstalled. In all three the alarms on the phone and the truth on
 * the server drift apart, and a reminder for a stay that already ended is worse than no reminder —
 * it teaches people to ignore the notifications.
 *
 * So this module answers one question instead: given the stays the server says are running, and what
 * is currently scheduled on this phone, what must be added and what must be dropped? The caller runs
 * it whenever the active stays change, which includes app start.
 *
 * Pure on purpose: no plugin, no clock, no I/O. It is where the rules live and what the tests read.
 */

/** A single alarm the phone should hold. `at` is an absolute instant, never a wall-clock string. */
export interface ParkingReminder {
  /** Stable across recomputations — the same stay and moment always produce the same id. */
  id: number;
  sessionId: string;
  kind: 'EXPIRING' | 'EXPIRED';
  at: Date;
  /** Filled by the caller, which owns the translations. */
  plate: string;
  spaceCode: string;
  /** Minutes left when the warning fires; 0 for the one at expiry. */
  minutesBefore: number;
}

export interface ReminderPlan {
  schedule: ParkingReminder[];
  cancelIds: number[];
}

/**
 * Notification ids are integers on both platforms, so the stay's UUID is folded into one
 * deterministically (FNV-1a, then the kind mixed in). Deterministic is the whole point: rescheduling
 * the same stay must overwrite its own alarm rather than add a second one, and cancelling must be
 * possible without having kept a list anywhere.
 *
 * A collision would mean one stay silently overwriting another's reminder. With 31 usable bits and
 * the handful of stays a person can run at once, that is remote; the reconciliation also corrects it
 * on the next pass, because a stay whose id is missing gets rescheduled.
 */
export function reminderId(sessionId: string, kind: ParkingReminder['kind']): number {
  let hash = 0x811c9dc5;
  const input = `${sessionId}:${kind}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV-1a's 32-bit prime, written as shifts because a plain multiplication overflows into
    // floating point and stops being deterministic across engines.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  // Positive and within 31 bits: Android rejects ids outside the signed-int range.
  return hash & 0x7fffffff;
}

/** What the device currently holds: the plugin reports both the id and the instant it will fire. */
export interface PendingReminder {
  id: number;
  at: Date;
}

export interface ReminderPlanInput {
  /** Stays the server says are running. */
  activeSessions: readonly ParkingSession[];
  /**
   * What is scheduled on this device right now — id **and** instant.
   *
   * The instant is not optional detail: extending a stay moves `expiresAt` without changing the
   * stay's id, so the reminder id is the same and only the time differs. Comparing ids alone would
   * conclude "already scheduled" and leave the phone ringing at the old hour, which is the one bug
   * this whole mechanism exists to avoid.
   */
  pending: readonly PendingReminder[];
  /** From the municipality's policy (`ParkingPolicy.expiryWarningBeforeMinutes`); 0 disables the early warning. */
  warningBeforeMinutes: number;
  /** Injected rather than read from the clock, so the rules are testable. */
  now: Date;
}

export function planParkingReminders(input: ReminderPlanInput): ReminderPlan {
  const { activeSessions, pending, warningBeforeMinutes, now } = input;

  const wanted = new Map<number, ParkingReminder>();
  for (const session of activeSessions) {
    const expiresAt = new Date(session.expiresAt);
    // A malformed or absent instant must not take the whole reconciliation down with it: the other
    // stays still deserve their reminders.
    if (Number.isNaN(expiresAt.getTime())) continue;

    const candidates: Array<{ kind: ParkingReminder['kind']; at: Date; minutesBefore: number }> = [];
    if (warningBeforeMinutes > 0) {
      candidates.push({
        kind: 'EXPIRING',
        at: new Date(expiresAt.getTime() - warningBeforeMinutes * 60_000),
        minutesBefore: warningBeforeMinutes,
      });
    }
    candidates.push({ kind: 'EXPIRED', at: expiresAt, minutesBefore: 0 });

    for (const candidate of candidates) {
      // An alarm in the past is not scheduled. Both platforms would fire it immediately, so a citizen
      // starting a stay shorter than the warning window would be told "15 minutes left" at the very
      // moment of paying.
      if (candidate.at.getTime() <= now.getTime()) continue;
      const id = reminderId(session.id, candidate.kind);
      wanted.set(id, {
        id,
        sessionId: session.id,
        kind: candidate.kind,
        at: candidate.at,
        plate: session.plateSnapshot,
        spaceCode: session.spaceCode,
        minutesBefore: candidate.minutesBefore,
      });
    }
  }

  const pendingAt = new Map(pending.map((entry) => [entry.id, entry.at.getTime()]));

  // Scheduled only when it is missing, or when it is there for a DIFFERENT instant (an extension).
  // Re-writing an alarm that already matches would be harmless — same id replaces — but it would
  // happen on every refresh of the active stays, several times a minute, for nothing.
  const schedule = [...wanted.values()].filter((reminder) => {
    const already = pendingAt.get(reminder.id);
    return already === undefined || already !== reminder.at.getTime();
  });

  // Anything on the phone that no longer corresponds to a running stay: finished early, already
  // expired, or belonging to an account that is no longer signed in here.
  const cancelIds = pending.filter((entry) => !wanted.has(entry.id)).map((entry) => entry.id);

  return { schedule, cancelIds };
}
