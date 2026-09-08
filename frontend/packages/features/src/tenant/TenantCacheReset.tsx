import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';

/**
 * Drops every cached server answer the moment the active municipality changes.
 *
 * Practically everything a portal reads is scoped to one municipality — zones, tariffs, the
 * bay-code format, the wallet balance, the charging timetable, the vehicle's session history — and
 * none of it is interchangeable. Leaving a stale entry in the cache does not merely look wrong: a
 * price from the previous municipality on a screen about to charge someone in this one is a
 * correctness bug, and a bay code validated against the wrong format is a stay that fails at the
 * moment it matters.
 *
 * `removeQueries` rather than `invalidateQueries` for exactly that reason. Invalidation marks
 * entries stale and keeps serving them while a refetch is in flight, which is precisely the window
 * where the previous municipality's numbers would still be on screen. Removing them makes every
 * mounted query re-enter its loading state, so a screen shows a spinner rather than a wrong figure.
 *
 * Mounted once per app, next to the other cross-cutting sync components. It renders nothing.
 */
export function TenantCacheReset(): null {
  const { subscribeToTenantChange } = useAuth();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeToTenantChange(() => {
        queryClient.removeQueries();
      }),
    [queryClient, subscribeToTenantChange],
  );

  return null;
}
