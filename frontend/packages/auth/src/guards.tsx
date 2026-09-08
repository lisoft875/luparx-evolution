import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission } from '@luparx/api-client';
import { useAuth } from './context';
import { usePermissions } from './usePermissions';

export interface RequireAuthProps {
  children: React.ReactNode;
  /** Route to bounce unauthenticated visitors to — each portal owns its own login route. */
  loginPath: string;
}

/** Blocks a route tree until the portal session is authenticated; never renders protected UI while loading. */
export function RequireAuth({ children, loginPath }: RequireAuthProps): React.JSX.Element | null {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (status !== 'authenticated') {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

export interface RequireTenantProps {
  children: React.ReactNode;
  /** Where the full-screen municipality picker is mounted in this app, e.g. '/select-tenant'. */
  selectTenantPath: string;
}

/**
 * Holds a tenant-scoped route until the session knows which municipality it is in.
 *
 * This is the first step after signing in for an account that belongs to several, and it is
 * deliberately not a step for an account that belongs to one: the server already scoped that
 * session, and asking someone to click the only option they have is a click that answers itself
 * (CONTRACT.md v0.4). An account with none is sent to the picker too, which is where the
 * "you do not belong to a municipality yet" state is explained.
 *
 * Like every other guard here this is UX, not authorization. The server refuses a tenant-scoped
 * request without a tenant context regardless of what the client renders (CONTRACT.md §7).
 */
export function RequireTenant({ children, selectTenantPath }: RequireTenantProps): React.JSX.Element | null {
  const { status, activeTenant, activeMemberships } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (status !== 'authenticated') return <>{children}</>;
  if (!activeTenant && activeMemberships.length !== 1) {
    return <Navigate to={selectTenantPath} replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

export interface RequirePermissionProps {
  children: React.ReactNode;
  permission: Permission;
  /** Rendered instead of children when the permission is missing (default: null). */
  fallback?: React.ReactNode;
}

/**
 * Client-side gate for hiding actions the user's role does not grant.
 * This is a UX convenience only — CONTRACT.md §7 requires the server to
 * authorize every request against the actual resource regardless of what
 * the client renders.
 */
export function RequirePermission({ children, permission, fallback = null }: RequirePermissionProps): React.JSX.Element {
  const { has } = usePermissions();
  return <>{has(permission) ? children : fallback}</>;
}
