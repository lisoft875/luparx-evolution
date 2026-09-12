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

/** Front-facing car — DESIGN_SYSTEM.md §3, used for the vehicle nav tab, parking/movement rows and the active-session card. */
export const IconCar = iconFactory(
  <>
    <path d="M4 15.2v-2.4a1.6 1.6 0 0 1 .18-.73l1.7-3.2A2 2 0 0 1 7.64 7.8h8.72a2 2 0 0 1 1.76 1.07l1.7 3.2c.12.22.18.47.18.73v2.4" />
    <path d="M4 15.2h16" />
    <path d="M6.4 12.1h11.2" />
    <circle cx="8" cy="15.6" r="1.5" />
    <circle cx="16" cy="15.6" r="1.5" />
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

export const IconPin = iconFactory(
  <>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.25" />
  </>,
);

export const IconUser = iconFactory(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </>,
);

export const IconMail = iconFactory(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
);

export const IconPhone = iconFactory(
  <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 5 5.1 1.5 1.5 0 0 1 6.5 3.5Z" />,
);

export const IconIdCard = iconFactory(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="11" r="2" />
    <path d="M6 16a2.5 2.5 0 0 1 5 0M13.5 9.5h5M13.5 13h5" />
  </>,
);

export const IconShield = iconFactory(
  <>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    <path d="M13 8.5h-2.2L9.5 12H12l-1 3.5 4-5h-2.4l.5-2Z" />
  </>,
);

export const IconGlobe = iconFactory(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
  </>,
);

export const IconPlus = iconFactory(<path d="M12 5v14M5 12h14" />);

export const IconCreditCard = iconFactory(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h4" />
  </>,
);

export const IconEye = iconFactory(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const IconEyeOff = iconFactory(
  <>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.4 4.2M6.8 7.3A15.4 15.4 0 0 0 2.5 12S6 18.5 12 18.5a9.9 9.9 0 0 0 3.6-.66" />
    <path d="M9.9 10.1a3 3 0 0 0 4 4" />
  </>,
);

export const IconList = iconFactory(
  <>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </>,
);

