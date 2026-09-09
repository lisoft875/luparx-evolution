import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AddressInput, AdminLevelCatalogEntry, AdministrativeDivision } from '@luparx/api-client';
import { FormField } from './FormField';
import { Select } from './Select';
import { Input } from './Input';

export type AddressLevelId = 'level1Id' | 'level2Id' | 'level3Id';

function fieldForLevel(level: number): AddressLevelId | null {
  if (level === 1) return 'level1Id';
  if (level === 2) return 'level2Id';
  if (level === 3) return 'level3Id';
  return null; // CONTRACT.md §2/§5 caps the address DTO at 3 administrative levels.
}

export interface AddressFieldsProps {
  /** The country's admin-levels catalog (`GET /catalog/countries/{code}/admin-levels`) — drives how many cascading selects render, so labels are never hardcoded per country. */
  adminLevels: AdminLevelCatalogEntry[];
  value: AddressInput;
  onChange: (value: AddressInput) => void;
  /** Loads divisions for one level given its parent id (null for the top level) — injected so @luparx/ui stays decoupled from any specific data-fetching library. */
  loadDivisions: (level: number, parentId: string | null) => Promise<AdministrativeDivision[]>;
  /** Resolves a catalog `labelKey` (e.g. "address.level.province") to display text — injected so this package doesn't depend on a specific i18n runtime. */
  resolveLabel: (labelKey: string) => string;
  line1Label: string;
  line2Label: string;
  postalCodeLabel: string;
  optionalLabel: string;
  /** Shown in a level's select while it has no selection yet. */
  selectPlaceholder: string;
  /** Shown under a level whose divisions could not be loaded, next to {@link retryLabel}. */
  loadErrorLabel: string;
  retryLabel: string;
  errors?: Partial<Record<AddressLevelId | 'line1' | 'line2' | 'postalCode', string>>;
}

/**
 * Generic N-level administrative-division cascade (province/canton/district,
 * state/county/city, etc. — CONTRACT.md §2/§5): it renders exactly the
 * levels the catalog returns for the given country, in order, resetting and
 * reloading every descendant level whenever an ancestor selection changes.
 *
 * The load reacts to the *levels* as well as to the selections. The catalog answers over the
 * network, so on the account screen — where the country is already known from the saved profile —
 * the first render has the country and no levels at all; a cascade that only watched the
 * selections would run once against an empty level list, never see the levels arrive, and leave
 * every select permanently empty. That was exactly the "province, canton and district don't load"
 * report: nothing failed, the request was simply never made.
 *
 * A level that fails to load says so and offers a retry rather than sitting on an empty list that
 * looks like a country with no provinces.
 */
export function AddressFields({
  adminLevels,
  value,
  onChange,
  loadDivisions,
  resolveLabel,
  line1Label,
  line2Label,
  postalCodeLabel,
  optionalLabel,
  selectPlaceholder,
  loadErrorLabel,
  retryLabel,
  errors,
}: AddressFieldsProps): React.JSX.Element {
  const sortedLevels = useMemo(() => [...adminLevels].sort((a, b) => a.level - b.level), [adminLevels]);
  const [optionsByLevel, setOptionsByLevel] = useState<Record<number, AdministrativeDivision[]>>({});
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);
  const [failedLevels, setFailedLevels] = useState<Record<number, boolean>>({});
  const [reloadToken, setReloadToken] = useState(0);

  const { countryCode, level1Id, level2Id } = value;
  // A primitive the effect can actually compare: the array identity changes on every render of the
  // parent, the shape of the cascade does not.
  const levelsKey = sortedLevels.map((entry) => entry.level).join('|');

  const parentIdForLevel = useCallback(
    (level: number): string | null => {
      if (level <= 1) return null;
      if (level === 2) return level1Id ?? null;
      if (level === 3) return level2Id ?? null;
      return null;
    },
    [level1Id, level2Id],
  );

  useEffect(() => {
    let cancelled = false;
    const levels = levelsKey ? levelsKey.split('|').map(Number) : [];
    async function loadAll(): Promise<void> {
      for (const level of levels) {
        const parentId = parentIdForLevel(level);
        if (level > 1 && !parentId) {
          if (!cancelled) {
            setOptionsByLevel((prev) => ({ ...prev, [level]: [] }));
            setFailedLevels((prev) => ({ ...prev, [level]: false }));
          }
          continue;
        }
        if (!cancelled) setLoadingLevel(level);
        try {
          const divisions = await loadDivisions(level, parentId);
          if (!cancelled) {
            setOptionsByLevel((prev) => ({ ...prev, [level]: divisions }));
            setFailedLevels((prev) => ({ ...prev, [level]: false }));
          }
        } catch {
          // One level failing must not silently abort the levels under it: each says so on its own.
          if (!cancelled) {
            setOptionsByLevel((prev) => ({ ...prev, [level]: [] }));
            setFailedLevels((prev) => ({ ...prev, [level]: true }));
          }
        } finally {
          if (!cancelled) setLoadingLevel(null);
        }
      }
    }
    void loadAll();
    return () => {
      cancelled = true;
    };
    // Re-runs when the country, the level catalog, or any ancestor selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, levelsKey, level1Id, level2Id, reloadToken]);

  function handleLevelChange(level: number, divisionId: string): void {
    const field = fieldForLevel(level);
    if (!field) return;
    const next: AddressInput = { ...value, [field]: divisionId };
    // Cascade reset: any deeper level's prior selection is now for a stale parent.
    if (level < 3) next.level3Id = undefined;
    if (level < 2) next.level2Id = undefined;
    onChange(next);
  }

  return (
    <div className="lx-address-fields">
      {sortedLevels.map((entry) => {
        const field = fieldForLevel(entry.level);
        if (!field) return null;
        const options = optionsByLevel[entry.level] ?? [];
        const failed = failedLevels[entry.level] === true;
        const disabled = entry.level > 1 && !parentIdForLevel(entry.level);
        return (
          <FormField key={entry.level} label={resolveLabel(entry.labelKey)} error={errors?.[field]}>
            {({ inputId, describedBy }) => (
              <>
                <Select
                  id={inputId}
                  aria-describedby={describedBy}
                  invalid={!!errors?.[field] || failed}
                  placeholder={selectPlaceholder}
                  value={value[field] ?? ''}
                  disabled={disabled || loadingLevel === entry.level}
                  onChange={(value) => handleLevelChange(entry.level, value)}
                  options={options.map((division) => ({ value: division.id, label: division.name }))}
                />
                {/* The way out sits with the sentence explaining why it is there — a retry floating
                    between the control and its own error message reads as belonging to neither. */}
                {failed ? (
                  <p
                    role="alert"
                    className="lx-field__error"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}
                  >
                    <span>{loadErrorLabel}</span>
                    <button type="button" className="lx-link-button" onClick={() => setReloadToken((n) => n + 1)}>
                      {retryLabel}
                    </button>
                  </p>
                ) : null}
              </>
            )}
          </FormField>
        );
      })}
      <FormField label={line1Label} error={errors?.line1}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors?.line1}
            value={value.line1}
            onChange={(event) => onChange({ ...value, line1: event.target.value })}
            autoComplete="address-line1"
          />
        )}
      </FormField>
      <FormField label={line2Label} optionalLabel={optionalLabel} error={errors?.line2}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors?.line2}
            value={value.line2 ?? ''}
            onChange={(event) => onChange({ ...value, line2: event.target.value })}
            autoComplete="address-line2"
          />
        )}
      </FormField>
      <FormField label={postalCodeLabel} optionalLabel={optionalLabel} error={errors?.postalCode}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors?.postalCode}
            value={value.postalCode ?? ''}
            onChange={(event) => onChange({ ...value, postalCode: event.target.value })}
            autoComplete="postal-code"
          />
        )}
      </FormField>
    </div>
  );
}
