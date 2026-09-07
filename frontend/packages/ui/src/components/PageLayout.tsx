import * as React from 'react';

export interface PageLayoutProps {
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

/** Generic app shell: optional top header, optional side navigation, and a main content region with a skip-link target. */
export function PageLayout({ header, sidebar, children }: PageLayoutProps): React.JSX.Element {
  return (
    <div className="lx-page-layout">
      {header ? <header className="lx-page-layout__header">{header}</header> : null}
      <div className="lx-page-layout__body">
        {sidebar ? (
          <nav className="lx-page-layout__sidebar" aria-label="primary">
            {sidebar}
          </nav>
        ) : null}
        <main id="main-content" className="lx-page-layout__content">
          {children}
        </main>
      </div>
    </div>
  );
}

export interface CenteredLayoutProps {
  children: React.ReactNode;
}

/** Centered single-column shell for auth screens (login/register/forgot password) — deliberately screen-specific, no shared nav. */
export function CenteredLayout({ children }: CenteredLayoutProps): React.JSX.Element {
  return (
    <div className="lx-centered-layout">
      <div className="lx-centered-layout__card">{children}</div>
    </div>
  );
}
