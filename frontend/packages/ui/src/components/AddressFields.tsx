import * as React from 'react';
import { useEffect, useState } from 'react';
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
  errors?: Partial<Record<AddressLevelId | 'line1' | 'line2' | 'postalCode', string>>;
}

/**
 * Generic N-level administrative-division cascade (province/canton/district,
 * state/county/city, etc. — CONTRACT.md §2/§5): it renders exactly the
 * levels the catalog returns for the given country, in order, resetting and
 * reloading every descendant level whenever an ancestor selection changes.
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
  errors,
}: AddressFieldsProps): React.JSX.Element {
  const sortedLevels = [...adminLevels].sort((a, b) => a.level - b.level);
  const [optionsByLevel, setOptionsByLevel] = useState<Record<number, AdministrativeDivision[]>>({});
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);

  const parentIdForLevel = (level: number): string | null => {
    if (level <= 1) return null;
    const parentField = fieldForLevel(level - 1);
    return (parentField ? value[parentField] : undefined) ?? null;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadAll(): Promise<void> {
      for (const entry of sortedLevels) {
        const parentId = parentIdForLevel(entry.level);
        if (entry.level > 1 && !parentId) {
          if (!cancelled) {
            setOptionsByLevel((prev) => ({ ...prev, [entry.level]: [] }));
          }
          continue;
        }
        setLoadingLevel(entry.level);
        try {
          const divisions = await loadDivisions(entry.level, parentId);
          if (!cancelled) setOptionsByLevel((prev) => ({ ...prev, [entry.level]: divisions }));
        } finally {
          if (!cancelled) setLoadingLevel(null);
        }
      }
    }
    void loadAll();
    return () => {
      cancelled = true;
    };
    // Re-run whenever the country or any ancestor selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.countryCode, value.level1Id, value.level2Id]);

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
        const disabled = entry.level > 1 && !parentIdForLevel(entry.level);
        return (
          <FormField key={entry.level} label={resolveLabel(entry.labelKey)} error={errors?.[field]}>
            {({ inputId, describedBy }) => (
              <Select
                id={inputId}
                aria-describedby={describedBy}
                invalid={!!errors?.[field]}
                value={value[field] ?? ''}
                disabled={disabled || loadingLevel === entry.level}
                onChange={(event) => handleLevelChange(entry.level, event.target.value)}
                options={options.map((division) => ({ value: division.id, label: division.name }))}
              />
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
