import * as React from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

function iconFactory(children: React.ReactNode): React.FC<IconProps> {
  return function Icon({ size = 20, className }: IconProps): React.JSX.Element {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        {children}
      </svg>
    );
  };
}

/**
 * Minimal line-icon set shared by every portal (DESIGN_SYSTEM.md components
 * take icons as `React.ReactNode`, so any of these — or a bespoke SVG — can
 * be passed to <AppBar>, <BottomTabBar>, <ListRow>, etc.).
 */
export const IconHome = iconFactory(
  <>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </>,
);

export const IconPark = iconFactory(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
  </>,
);

export const IconCar = iconFactory(
  <>
    <path d="M4 16V11l2-5h12l2 5v5" />
    <path d="M2 16h20" />
    <circle cx="7" cy="17.5" r="1.5" />
    <circle cx="17" cy="17.5" r="1.5" />
  </>,
);

export const IconWallet = iconFactory(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14" r="1" />
  </>,
);

export const IconMore = iconFactory(
  <>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </>,
);

export const IconBell = iconFactory(
  <>
    <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </>,
);

export const IconFine = iconFactory(
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </>,
);

export const IconTopUp = iconFactory(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8.5 11.5 12 8l3.5 3.5" />
  </>,
);

export const IconClock = iconFactory(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>,
);

export const IconCheck = iconFactory(<path d="M4.5 12.5 9 17l10-11" />);

export const IconChevronRight = iconFactory(<path d="M9 5l7 7-7 7" />);

export const IconArrowLeft = iconFactory(<path d="M15 18l-6-6 6-6" />);

export const IconOffline = iconFactory(
  <>
    <path d="M3 3l18 18" />
    <path d="M8.5 9.5a7 7 0 0 1 9.5 1M5.5 7.5A11 11 0 0 1 12 5c1.7 0 3.3.4 4.7 1.1" />
    <path d="M11.5 13.5a3 3 0 0 1 3.2.6" />
    <circle cx="12" cy="18" r="1" />
  </>,
);

export const IconBuilding = iconFactory(
  <>
    <rect x="4" y="3" width="10" height="18" rx="1" />
    <path d="M14 9h6v12h-6" />
    <path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1" />
  </>,
);

export const IconUsers = iconFactory(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17.5" cy="9" r="2.5" />
    <path d="M15.5 13a5 5 0 0 1 5.5 5" />
  </>,
);

export const IconAudit = iconFactory(
  <>
    <path d="M7 3h8l4 4v14H7z" />
    <path d="M15 3v4h4" />
    <path d="M9.5 12h5M9.5 15.5h5" />
  </>,
);

export const IconReports = iconFactory(
  <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>,
);

export const IconCatalog = iconFactory(
  <>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </>,
);

export const IconSystem = iconFactory(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </>,
);

export const IconLogout = iconFactory(
  <>
    <path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" />
    <path d="M3 12h11M11 8l4 4-4 4" />
  </>,
);
