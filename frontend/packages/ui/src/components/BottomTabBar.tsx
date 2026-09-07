import * as React from 'react';

export interface BottomTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  current?: boolean;
}

export interface BottomTabBarProps {
  tabs: BottomTab[];
  className?: string;
}

/**
 * Fixed 5-destination bottom navigation (DESIGN_SYSTEM.md §3): icon + label
 * always visible, active tab in `--lx-primary`, >=44px touch target, and
 * `env(safe-area-inset-bottom)` padding baked into `.lx-bottom-tab-bar`.
 */
export function BottomTabBar({ tabs, className }: BottomTabBarProps): React.JSX.Element {
  return (
    <nav className={['lx-bottom-tab-bar', className].filter(Boolean).join(' ')} aria-label="primary">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className="lx-bottom-tab-bar__tab"
          aria-current={tab.current ? 'page' : undefined}
          onClick={tab.onSelect}
        >
          <span className="lx-bottom-tab-bar__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="lx-bottom-tab-bar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
