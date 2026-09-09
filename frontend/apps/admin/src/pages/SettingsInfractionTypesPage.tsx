import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation, formatCurrencyMinor, minorToMajor, majorToMinor } from '@luparx/i18n';
import type { InfractionType, InfractionTypeDraft } from '@luparx/api-client';
import { Alert, Badge, Button, Card, Checkbox, FormField, Input, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useInfractionTypes, useUpdateInfractionTypes } from '../lib/queries';

/**
 * What this municipality fines, and for how much.
 *
 * <h2>Whole-catalogue semantics, on purpose</h2>
 *
 * The screen edits a table — rows added, rows changed, rows taken out — and saves it once, which is
 * exactly what `PUT /admin/enforcement/infraction-types` expects. A row taken out is **deactivated,
 * never deleted**: citations from previous years reference it, and deleting it would orphan acts
 * that people are still paying or contesting. That is why "Desactivar" is the only removal here and
 * why a deactivated row stays visible and can be brought back.
 *
 * <h2>The money</h2>
 *
 * The amount is entered in major units because that is how a municipal ordinance is written, and
 * stored in integer minor units because that is the only way to store money (ADR 0009). The
 * conversion happens once, at the edge, through `@luparx/i18n`'s own helpers — never with a
 * hand-written `* 100`, which is wrong for the currencies that do not have two decimals. The
 * currency itself is not editable: it is the municipality's, and a catalogue holding two currencies
 * is a report that adds up wrong.
 */
interface RowState {
  key: string;
  id?: string;
  code: string;
  name: string;
  description: string;
  /** Major units as typed. Converted to minor units exactly once, on save. */
  amount: string;
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  discountDays: string;
  discountPercent: string;
  dueDays: string;
  active: boolean;
}

function toRow(type: InfractionType): RowState {
  return {
    key: type.id,
    id: type.id,
    code: type.code,
    name: type.name,
    description: type.description ?? '',
    amount: String(minorToMajor(type.fineMinor, type.currencyCode)),
    requiresPhoto: type.requiresPhoto,
    allowsAppeal: type.allowsAppeal,
    discountDays: type.discountDays == null ? '' : String(type.discountDays),
    discountPercent: type.discountPercent == null ? '' : String(type.discountPercent),
    dueDays: String(type.dueDays),
    active: type.active,
  };
}

export function SettingsInfractionTypesPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const query = useInfractionTypes();
  const save = useUpdateInfractionTypes();

  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) setRows(query.data.map(toRow));
  }, [query.data]);

  // The municipality's currency, taken from what the server already sent rather than configured
  // here: this screen never gets to choose it.
  const currencyCode = query.data?.[0]?.currencyCode ?? 'CRC';

  function patch(key: string, changes: Partial<RowState>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function addRow(): void {
    setRows((current) => [
      ...current,
      {
        key: `new-${current.length}-${Date.now()}`,
        code: '',
        name: '',
        description: '',
        amount: '',
        // The safe defaults the server itself applies for an absent flag: demand a photograph, and
        // admit a defence.
        requiresPhoto: true,
        allowsAppeal: true,
        discountDays: '',
        discountPercent: '',
        dueDays: '30',
        active: true,
      },
    ]);
  }

  async function submit(): Promise<void> {
    setError(null);
    setSaved(false);
    const drafts: InfractionTypeDraft[] = [];
    for (const row of rows) {
      const amount = Number(row.amount);
      const dueDays = Number(row.dueDays);
      if (!row.code.trim() || !row.name.trim() || !Number.isFinite(amount) || !Number.isFinite(dueDays) || dueDays < 1) {
        setError(t('admin.enforcement.types.error.required'));
        return;
      }
      const discountDays = row.discountDays.trim() ? Number(row.discountDays) : null;
      const discountPercent = row.discountPercent.trim() ? Number(row.discountPercent) : null;
      // Both or neither — the server enforces the same pairing, and a half-configured discount is a
      // fine that changes value for reasons nobody can explain.
      if ((discountDays === null) !== (discountPercent === null)) {
        setError(t('admin.enforcement.types.discountBoth'));
        return;
      }
      drafts.push({
        id: row.id,
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
        description: row.description.trim() || undefined,
        fineAmountMinor: majorToMinor(amount, currencyCode),
        requiresPhoto: row.requiresPhoto,
        allowsAppeal: row.allowsAppeal,
        discountDays,
        discountPercent,
        dueDays,
        active: row.active,
      });
    }
    try {
      await save.mutateAsync(drafts);
      setSaved(true);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <AdminShell>
      <h1>{t('admin.enforcement.types.title')}</h1>
      <Card>
        <SectionHeader
          title={t('admin.enforcement.types.title')}
          description={t('admin.enforcement.types.description')}
        />
        <p className="lx-text-meta">{t('admin.enforcement.types.currencyNote', { currency: currencyCode })}</p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t('admin.enforcement.types.saved')}</Alert> : null}
        {query.isError ? (
          <Alert tone="danger">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}>
              <span>{t('common.error.generic')}</span>
              <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          </Alert>
        ) : query.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : null}
      </Card>

      {rows.map((row) => (
        <Card key={row.key} tone={row.active ? 'default' : 'warning'}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--lx-space-3)',
              marginBottom: 'var(--lx-space-3)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--lx-space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{row.name || t('admin.enforcement.types.add')}</strong>
              {!row.active ? <Badge tone="warning">{t('admin.enforcement.types.inactive')}</Badge> : null}
              {row.amount ? (
                <Badge tone="neutral">
                  {formatCurrencyMinor(majorToMinor(Number(row.amount) || 0, currencyCode), currencyCode, locale)}
                </Badge>
              ) : null}
            </div>
            <Button type="button" variant="ghost" onClick={() => patch(row.key, { active: !row.active })}>
              {row.active ? t('admin.enforcement.types.remove') : t('admin.enforcement.types.restore')}
            </Button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--lx-space-3)',
            }}
          >
            <FormField label={t('admin.enforcement.types.column.code')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.code}
                  onChange={(event) => patch(row.key, { code: event.target.value.toUpperCase() })}
                  maxLength={32}
                />
              )}
            </FormField>
            <FormField label={t('admin.enforcement.types.column.name')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.name}
                  onChange={(event) => patch(row.key, { name: event.target.value })}
                  maxLength={160}
                />
              )}
            </FormField>
            <FormField label={t('admin.enforcement.types.amountLabel', { currency: currencyCode })}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.amount}
                  onChange={(event) => patch(row.key, { amount: event.target.value })}
                  inputMode="decimal"
                />
              )}
            </FormField>
            <FormField label={t('admin.enforcement.types.dueDays')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.dueDays}
                  onChange={(event) => patch(row.key, { dueDays: event.target.value })}
                  inputMode="numeric"
                />
              )}
            </FormField>
            <FormField label={t('admin.enforcement.types.discountDays')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.discountDays}
                  onChange={(event) => patch(row.key, { discountDays: event.target.value })}
                  inputMode="numeric"
                />
              )}
            </FormField>
            <FormField label={t('admin.enforcement.types.discountPercent')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={row.discountPercent}
                  onChange={(event) => patch(row.key, { discountPercent: event.target.value })}
                  inputMode="numeric"
                />
              )}
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: 'var(--lx-space-4)', marginTop: 'var(--lx-space-3)', flexWrap: 'wrap' }}>
            <Checkbox
              checked={row.requiresPhoto}
              onChange={(event) => patch(row.key, { requiresPhoto: event.target.checked })}
              label={t('admin.enforcement.types.column.photo')}
            />
            <Checkbox
              checked={row.allowsAppeal}
              onChange={(event) => patch(row.key, { allowsAppeal: event.target.checked })}
              label={t('admin.enforcement.types.column.appeal')}
            />
          </div>
        </Card>
      ))}

      <div style={{ display: 'flex', gap: 'var(--lx-space-3)' }}>
        <Button type="button" variant="secondary" onClick={addRow}>
          {t('admin.enforcement.types.add')}
        </Button>
        <Button type="button" onClick={() => void submit()} loading={save.isPending} disabled={rows.length === 0}>
          {t('admin.enforcement.types.save')}
        </Button>
      </div>
    </AdminShell>
  );
}
