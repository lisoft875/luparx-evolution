import type { MeResponse, MembershipSummary, SwitchTenantResponse, TenantCatalogEntry } from './types/domain';

/**
 * One place where a municipality's `logoUrl` becomes something an `<img src>` can load.
 *
 * CONTRACT.md v0.4 says the server resolves `logo_asset_key` into `logoUrl` so that the catalogue,
 * the membership list and the active-municipality badge can never disagree about where a logo
 * lives. What the server sends today for its own generated monogram is a **root-relative** path
 * (`/api/v1/catalog/tenants/{id}/logo.svg`), which is correct on the wire and wrong in a browser
 * that is served from a different origin than the API — a Vite dev server on :5183 would resolve it
 * against :5183 and render a broken image. Absolutising it here, at the transport boundary and
 * against the API base URL the client was constructed with, keeps every screen unaware of the
 * question. A municipality that hosts its own emblem sends an absolute `https://…` URL and this
 * function returns it untouched.
 *
 * Only `https:` (and, for a developer laptop, the API's own `http://localhost`) can survive: a
 * plain-http logo on an https page is blocked by the browser as mixed content, and any other scheme
 * — `javascript:`, `data:`, `blob:` — has no business being fed into an `<img src>` from a value
 * that ultimately came out of a database row. Anything unacceptable degrades to null, which every
 * caller already understands as "no emblem yet, draw the monogram".
 */
export function resolveTenantLogoUrl(logoUrl: string | null | undefined, apiBaseUrl: string): string | null {
  if (!logoUrl) return null;
  const trimmed = logoUrl.trim();
  if (trimmed.length === 0) return null;

  // `URL` needs an absolute base; apiBaseUrl may itself be relative ('' or '/api') in a
  // same-origin deployment, so fall back to the document's own origin when there is one.
  const origin = typeof window !== 'undefined' ? window.location.href : 'http://localhost';
  let resolved: URL;
  try {
    resolved = new URL(trimmed, new URL(apiBaseUrl || '/', origin));
  } catch {
    return null;
  }

  if (resolved.protocol === 'https:') return resolved.toString();
  // A developer laptop serves the API over plain http on localhost; the browser does not treat
  // that as mixed content, and refusing it would leave every logo broken in development only.
  if (resolved.protocol === 'http:' && isLoopbackHost(resolved.hostname)) return resolved.toString();
  return null;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/** Returns the entry with its `logoUrl` made loadable; the object is copied, never mutated in place. */
export function withResolvedTenantLogo<T extends TenantCatalogEntry | null | undefined>(
  tenant: T,
  apiBaseUrl: string,
): T {
  if (!tenant) return tenant;
  return { ...tenant, logoUrl: resolveTenantLogoUrl(tenant.logoUrl, apiBaseUrl) } as T;
}

/** Same, for the flattened branding a membership carries. */
export function withResolvedMembershipLogo(membership: MembershipSummary, apiBaseUrl: string): MembershipSummary {
  return { ...membership, tenantLogoUrl: resolveTenantLogoUrl(membership.tenantLogoUrl, apiBaseUrl) };
}

export function withResolvedMeLogos(me: MeResponse, apiBaseUrl: string): MeResponse {
  return {
    ...me,
    memberships: me.memberships.map((membership) => withResolvedMembershipLogo(membership, apiBaseUrl)),
    activeTenant: withResolvedTenantLogo(me.activeTenant ?? null, apiBaseUrl),
  };
}

export function withResolvedSwitchTenantLogo(
  response: SwitchTenantResponse,
  apiBaseUrl: string,
): SwitchTenantResponse {
  return { ...response, activeTenant: withResolvedTenantLogo(response.activeTenant ?? null, apiBaseUrl) };
}
