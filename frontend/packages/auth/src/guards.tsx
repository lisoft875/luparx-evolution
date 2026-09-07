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
