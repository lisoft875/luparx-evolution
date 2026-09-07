import * as React from 'react';

export interface PlatformBannerProps {
  /** Already-translated banner text naming the environment/tenant under administration (DESIGN_SYSTEM.md §5). */
  children: React.ReactNode;
  className?: string;
}

/** Permanent banner marking every screen of `apps/platform` as operating at platform scope, never a municipal tenant. */
export function PlatformBanner({ children, className }: PlatformBannerProps): React.JSX.Element {
  return (
    <div className={['lx-platform-banner', className].filter(Boolean).join(' ')} role="status">
      {children}
    </div>
  );
}
