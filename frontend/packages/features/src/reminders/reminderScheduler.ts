import type { ParkingReminder, PendingReminder } from './parkingReminders';

/**
 * The device's alarm clock, as this feature needs it.
 *
 * An interface and not a direct call to `@capacitor/local-notifications` for two reasons that are
 * not ceremony:
 *
 *  - **The portal runs in a browser too.** There is no local-notification plugin there, and a bare
 *    import would break the web build of a screen that otherwise works. The web implementation is a
 *    no-op that reports "unavailable", and every screen already has to handle that case — it is the
 *    same case as a citizen who denied the permission.
 *  - **The plugin is not installed yet.** The native projects do not exist in this repository yet
 *    (`npx cap add ios|android`), so wiring a hard dependency now would be a dependency on something
 *    that cannot be built. The rules, the reconciliation and the screens are finished and tested
 *    against this interface; the day the native projects land, the only new code is the adapter at
 *    the bottom of this file.
 */
export interface ReminderScheduler {
  /** False on the web, and on a device where the plugin is absent. Nothing else is called when false. */
  isAvailable(): boolean;
  /** Whether the citizen has already granted permission, without asking them. */
  hasPermission(): Promise<boolean>;
  /** Asks. Call it at a moment the request makes sense — never on app start. */
  requestPermission(): Promise<boolean>;
  pending(): Promise<PendingReminder[]>;
  schedule(reminders: readonly ScheduledReminder[]): Promise<void>;
  cancel(ids: readonly number[]): Promise<void>;
}

/** A reminder with its text already translated: this package does not own the citizen's language. */
export interface ScheduledReminder extends ParkingReminder {
  title: string;
  body: string;
}

/** Used by the web build and by tests. Reports itself unavailable and does nothing. */
export const unavailableScheduler: ReminderScheduler = {
  isAvailable: () => false,
  hasPermission: async () => false,
  requestPermission: async () => false,
  pending: async () => [],
  schedule: async () => {},
  cancel: async () => {},
};

/**
 * Wraps the Capacitor plugin, if it is there.
 *
 * The import is dynamic and failure is expected, not exceptional: on the web the module does not
 * exist, and in a native build made before the plugin was added it does not either. Both answer
 * "unavailable" and the app carries on with the on-screen countdown, which is not a degraded
 * experience — it is what a citizen with notifications denied sees, and it has to work.
 */
export async function createCapacitorScheduler(): Promise<ReminderScheduler> {
  let plugin: LocalNotificationsLike | undefined;
  try {
    // The specifier is built at runtime so TypeScript does not try to resolve it.
    //
    // The plugin is a dependency of the CITIZEN APP, not of this package — and that asymmetry is the
    // point. `@luparx/features` is shared by the four portals, and three of them (admin, inspector,
    // platform) are desktop back-offices that will never schedule a parking alarm. Declaring the
    // plugin here would put Capacitor in their dependency tree and in their bundles to satisfy a
    // screen they do not have.
    //
    // So the package depends on the CONTRACT (the interface below) and the citizen app supplies the
    // implementation by having the plugin installed. A portal without it gets `unavailableScheduler`,
    // which is the same path as a citizen who denied the permission — a path the app already
    // supports. `@vite-ignore` keeps the bundler from trying to resolve it statically.
    const specifier = ['@capacitor', 'local-notifications'].join('/');
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      LocalNotifications?: LocalNotificationsLike;
    };
    plugin = mod.LocalNotifications;
  } catch {
    return unavailableScheduler;
  }
  if (!plugin) return unavailableScheduler;
  const notifications = plugin;

  return {
    isAvailable: () => true,

    hasPermission: async () => (await notifications.checkPermissions()).display === 'granted',

    requestPermission: async () => (await notifications.requestPermissions()).display === 'granted',

    pending: async () => {
      const { notifications: list } = await notifications.getPending();
      return list
        .map((entry) => {
          const at = entry.schedule?.at ? new Date(entry.schedule.at) : undefined;
          return at && !Number.isNaN(at.getTime()) ? { id: entry.id, at } : undefined;
        })
        .filter((entry): entry is PendingReminder => entry !== undefined);
    },

    schedule: async (reminders) => {
      if (reminders.length === 0) return;
      await notifications.schedule({
        notifications: reminders.map((reminder) => ({
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          // `allowWhileIdle` is what makes Android fire it under Doze — without it a phone in a
          // pocket for two hours delivers the warning late, which for a parking reminder is the
          // same as not delivering it.
          schedule: { at: reminder.at, allowWhileIdle: true },
          // Carried so a tap can open the right stay, and so a later version can tell reminders
          // apart without parsing the text.
          extra: { sessionId: reminder.sessionId, kind: reminder.kind },
        })),
      });
    },

    cancel: async (ids) => {
      if (ids.length === 0) return;
      await notifications.cancel({ notifications: ids.map((id) => ({ id })) });
    },
  };
}

/**
 * The slice of the plugin's surface this feature uses, declared here so the package does not need
 * the plugin's types at build time — it is not a dependency until the native projects exist.
 */
interface LocalNotificationsLike {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  getPending(): Promise<{ notifications: { id: number; schedule?: { at?: string | Date } }[] }>;
  schedule(options: { notifications: unknown[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}
