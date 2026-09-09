import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ParkingPolicy } from '@luparx/api-client';
import { RequirePermission } from '@luparx/auth';
import { formatDurationLabel } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Card, Checkbox, FormField, Input, SectionHeader, SummaryList, SummaryRow } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useParkingPolicy, useUpdateParkingPolicy } from '../lib/queries';

/**
 * Canonicalises a list of minute options exactly as `MinuteIncrements` does on the server: positive
 * only, sorted, duplicate-free. Done here so the chips an administrator sees are the row that will
 * be stored — a screen that let `60, 30, 60` look different from `30, 60` would be showing a state
 * the database cannot hold.
 */
function canonical(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

interface MinuteListProps {
  values: number[];
  onChange: (values: number[]) => void;
  label: string;
  addLabel: string;
  removeLabel: (minutes: string) => string;
  emptyLabel: string;
  disabled?: boolean;
  format: (minutes: number) => string;
}

/**
 * The editor for one ladder of minute options.
 *
 * <p>Chips and a number field rather than the comma-separated text the column actually stores: the
 * stored form is a serialisation detail, and asking an administrator to type <code>15,30,60,120</code>
 * is asking them to make a syntax error that comes back as a validation code. Each chip is a real
 * button with its own label, so removing an option is one click and one unambiguous announcement.</p>
 */
function MinuteList({
  values,
  onChange,
  label,
  addLabel,
  removeLabel,
  emptyLabel,
  disabled,
  format,
}: MinuteListProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const parsed = Number(draft);
  const canAdd = Number.isInteger(parsed) && parsed > 0 && !values.includes(parsed);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--lx-space-3)' }}>
        {values.length === 0 ? (
          <span className="lx-text-meta">{emptyLabel}</span>
        ) : (
          values.map((value) => (
            <button
              key={value}
              type="button"
              className="lx-chip"
              disabled={disabled}
              aria-label={removeLabel(format(value))}
              onClick={() => onChange(values.filter((candidate) => candidate !== value))}
            >
              {format(value)} ×
            </button>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 140 }}>
          <FormField label={label}>
            {({ inputId }) => (
              <Input
                id={inputId}
                type="number"
                min={1}
                inputMode="numeric"
                disabled={disabled}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAdd) {
                    event.preventDefault();
                    onChange(canonical([...values, parsed]));
                    setDraft('');
                  }
                }}
              />
            )}
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !canAdd}
          onClick={() => {
            onChange(canonical([...values, parsed]));
            setDraft('');
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * What this municipality sells, and under what rules (CONTRACT.md v0.18).
 *
 * <p>Everything a citizen can do with a stay is decided here: which durations they may buy, whether
 * they may extend, whether finishing early gives the unused minutes back, and how long after
 * expiry a car is still not fineable. It is the screen with the widest blast radius in the portal,
 * which is why it does three things beyond posting the form.</p>
 *
 * <h2>It previews the citizen's picker</h2>
 *
 * <p>The ladder is not a list of numbers, it is the dropdown a person will open in the street. The
 * preview is drawn with the same formatter the citizen app uses ({@code formatDurationLabel} in
 * `@luparx/features`), because a preview with its own copy of the rule is a preview that can
 * disagree with the thing it previews.</p>
 *
 * <h2>It names the options the rest of the policy kills</h2>
 *
 * <p>The server validates each field and the coherence between fields, but it accepts a policy that
 * offers 15 minutes with a minimum of 30: the option is on the list, the minimum refuses it, and the
 * citizen who picks it gets {@code INVALID_INCREMENT} from a picker their municipality filled. That
 * is not a validation error, it is a configuration mistake nobody sees until someone in the street
 * cannot park. So the screen says which options are unreachable, and why, without blocking the save
 * — the municipality may be mid-edit, and refusing to save a coherent-but-odd policy would be this
 * screen deciding policy instead of the municipality.</p>
 *
 * <h2>It replaces the whole policy</h2>
 *
 * <p>`PUT /admin/parking/policy` takes every field, so this is one form with one save and not eleven
 * inline edits: a policy is coherent as a whole — the extension ceiling has to clear the session
 * maximum, credit needs early finish — and field-at-a-time saving would walk through states the
 * server has to refuse.</p>
 */
export function ParkingPolicyPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const policyQuery = useParkingPolicy();
  const updateMutation = useUpdateParkingPolicy();

  const [form, setForm] = useState<ParkingPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (policyQuery.data) setForm(policyQuery.data);
  }, [policyQuery.data]);

  const format = (minutes: number): string => formatDurationLabel(minutes, tPlural);

  function patch(changes: Partial<ParkingPolicy>): void {
    setSaved(false);
    setForm((current) => (current ? { ...current, ...changes } : current));
  }

  /**
   * The options the policy offers and then refuses. Computed, never stored: it is a reading of the
   * three fields together, and caching a reading is how it goes stale.
   */
  const unreachable = useMemo(() => {
    if (!form) return [] as number[];
    return form.sessionIncrementsMinutes.filter(
      (minutes) => minutes < form.sessionMinMinutes || minutes > form.sessionMaxMinutes,
    );
  }, [form]);

  const offered = useMemo(() => {
    if (!form) return [] as number[];
    return form.sessionIncrementsMinutes.filter(
      (minutes) => minutes >= form.sessionMinMinutes && minutes <= form.sessionMaxMinutes,
    );
  }, [form]);

  async function handleSave(): Promise<void> {
    if (!form) return;
    setError(null);
    setSaved(false);
    // The two rules the server refuses outright, checked here as well so the answer is a sentence
    // about the municipality's own numbers rather than a field code from an HTTP response.
    if (form.sessionMaxMinutes < form.sessionMinMinutes) {
      setError(t('admin.policy.error.maxBelowMin'));
      return;
    }
    if (form.extensionEnabled && form.extensionMaxTotalMinutes < form.sessionMaxMinutes) {
      setError(t('admin.policy.error.extensionCeiling'));
      return;
    }
    try {
      await updateMutation.mutateAsync({
        sessionIncrementsMinutes: canonical(form.sessionIncrementsMinutes),
        sessionMinMinutes: form.sessionMinMinutes,
        sessionMaxMinutes: form.sessionMaxMinutes,
        extensionEnabled: form.extensionEnabled,
        extensionIncrementsMinutes: canonical(form.extensionIncrementsMinutes),
        extensionMaxTotalMinutes: form.extensionMaxTotalMinutes,
        earlyFinishEnabled: form.earlyFinishEnabled,
        creditOnEarlyFinishEnabled: form.creditOnEarlyFinishEnabled,
        creditMinRemainingMinutes: form.creditMinRemainingMinutes,
        creditExpiryDays: form.creditExpiryDays,
        graceMinutes: form.graceMinutes,
      });
      setSaved(true);
    } catch {
      setError(t('admin.policy.error.generic'));
    }
  }

  if (!form) {
    return (
      <AdminShell>
        <h1>{t('admin.policy.title')}</h1>
        <p className="lx-text-meta">{policyQuery.isLoading ? t('common.loading') : t('admin.policy.error.generic')}</p>
      </AdminShell>
    );
  }

  const number = (value: number, onChange: (next: number) => void, min = 0, disabled = false) => (
    <Input
      type="number"
      min={min}
      inputMode="numeric"
      disabled={disabled}
      value={String(value)}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );

  return (
    <AdminShell>
      <h1>{t('admin.policy.title')}</h1>
      <p className="lx-text-meta">{t('admin.policy.description')}</p>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}

      {/* What the citizen will actually be offered, before any of the editing below. It is the
          answer to the only question this screen exists to settle. */}
      <Card>
        <SectionHeader title={t('admin.policy.preview.title')} description={t('admin.policy.preview.description')} />
        {offered.length === 0 ? (
          <Alert tone="danger">{t('admin.policy.preview.none')}</Alert>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {offered.map((minutes) => (
              <span key={minutes} className="lx-chip" aria-hidden="false">
                {format(minutes)}
              </span>
            ))}
          </div>
        )}
        {unreachable.length > 0 ? (
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Alert tone="warning">
              {t('admin.policy.preview.unreachable', {
                options: unreachable.map(format).join(', '),
                min: format(form.sessionMinMinutes),
                max: format(form.sessionMaxMinutes),
              })}
            </Alert>
          </div>
        ) : null}
      </Card>

      <RequirePermission permission="TENANT_MANAGE">
        <Card>
          <SectionHeader title={t('admin.policy.session.title')} description={t('admin.policy.session.description')} />
          <MinuteList
            values={form.sessionIncrementsMinutes}
            onChange={(values) => patch({ sessionIncrementsMinutes: values })}
            label={t('admin.policy.minuteField')}
            addLabel={t('admin.policy.addOption')}
            removeLabel={(minutes) => t('admin.policy.removeOption', { option: minutes })}
            emptyLabel={t('admin.policy.session.empty')}
            format={format}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 'var(--lx-space-4)' }}>
            <div style={{ width: 200 }}>
              <FormField label={t('admin.policy.field.sessionMin')} hint={t('admin.policy.field.sessionMinHint')}>
                {() => number(form.sessionMinMinutes, (value) => patch({ sessionMinMinutes: value }), 1)}
              </FormField>
            </div>
            <div style={{ width: 200 }}>
              <FormField label={t('admin.policy.field.sessionMax')} hint={t('admin.policy.field.sessionMaxHint')}>
                {() => number(form.sessionMaxMinutes, (value) => patch({ sessionMaxMinutes: value }), 1)}
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title={t('admin.policy.extension.title')}
            description={t('admin.policy.extension.description')}
          />
          <Checkbox
            label={t('admin.policy.extension.enabled')}
            hint={t('admin.policy.extension.enabledHint')}
            checked={form.extensionEnabled}
            onChange={(event) => patch({ extensionEnabled: event.target.checked })}
          />
          {/* Dimmed rather than removed: what a municipality has switched off is part of what this
              screen tells whoever opens it next. */}
          <div style={{ opacity: form.extensionEnabled ? 1 : 0.5, marginTop: 'var(--lx-space-3)' }}>
            <MinuteList
              values={form.extensionIncrementsMinutes}
              onChange={(values) => patch({ extensionIncrementsMinutes: values })}
              label={t('admin.policy.minuteField')}
              addLabel={t('admin.policy.addOption')}
              removeLabel={(minutes) => t('admin.policy.removeOption', { option: minutes })}
              emptyLabel={t('admin.policy.extension.empty')}
              disabled={!form.extensionEnabled}
              format={format}
            />
            <div style={{ width: 240, marginTop: 'var(--lx-space-4)' }}>
              <FormField
                label={t('admin.policy.field.extensionMaxTotal')}
                hint={t('admin.policy.field.extensionMaxTotalHint')}
              >
                {() =>
                  number(
                    form.extensionMaxTotalMinutes,
                    (value) => patch({ extensionMaxTotalMinutes: value }),
                    1,
                    !form.extensionEnabled,
                  )
                }
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.credit.title')} description={t('admin.policy.credit.description')} />
          <Checkbox
            label={t('admin.policy.credit.earlyFinish')}
            hint={t('admin.policy.credit.earlyFinishHint')}
            checked={form.earlyFinishEnabled}
            onChange={(event) =>
              // Turning early finish off takes the credit switch with it: minutes are earned by
              // finishing early, so crediting them without it is a state the server refuses and a
              // promise the citizen could never collect on.
              patch({
                earlyFinishEnabled: event.target.checked,
                creditOnEarlyFinishEnabled: event.target.checked && form.creditOnEarlyFinishEnabled,
              })
            }
          />
          <Checkbox
            label={t('admin.policy.credit.enabled')}
            hint={t('admin.policy.credit.enabledHint')}
            checked={form.creditOnEarlyFinishEnabled}
            disabled={!form.earlyFinishEnabled}
            onChange={(event) => patch({ creditOnEarlyFinishEnabled: event.target.checked })}
          />
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 'var(--lx-space-3)',
              opacity: form.creditOnEarlyFinishEnabled ? 1 : 0.5,
            }}
          >
            <div style={{ width: 220 }}>
              <FormField label={t('admin.policy.field.creditMin')} hint={t('admin.policy.field.creditMinHint')}>
                {() =>
                  number(
                    form.creditMinRemainingMinutes,
                    (value) => patch({ creditMinRemainingMinutes: value }),
                    0,
                    !form.creditOnEarlyFinishEnabled,
                  )
                }
              </FormField>
            </div>
            <div style={{ width: 220 }}>
              <FormField label={t('admin.policy.field.creditExpiry')} hint={t('admin.policy.field.creditExpiryHint')}>
                {() =>
                  number(
                    form.creditExpiryDays,
                    (value) => patch({ creditExpiryDays: value }),
                    0,
                    !form.creditOnEarlyFinishEnabled,
                  )
                }
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.grace.title')} description={t('admin.policy.grace.description')} />
          <div style={{ width: 220 }}>
            <FormField label={t('admin.policy.field.grace')} hint={t('admin.policy.field.graceHint')}>
              {() => number(form.graceMinutes, (value) => patch({ graceMinutes: value }), 0)}
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Alert tone="info">{t('admin.policy.grace.notice', { minutes: format(form.graceMinutes) })}</Alert>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.summary.title')} />
          <SummaryList>
            <SummaryRow
              label={t('admin.policy.summary.session')}
              value={offered.length > 0 ? offered.map(format).join(' · ') : t('admin.policy.preview.none')}
            />
            <SummaryRow
              label={t('admin.policy.summary.extension')}
              value={
                form.extensionEnabled
                  ? form.extensionIncrementsMinutes.map(format).join(' · ') || t('admin.policy.extension.empty')
                  : t('admin.policy.summary.off')
              }
            />
            <SummaryRow
              label={t('admin.policy.summary.credit')}
              value={
                form.creditOnEarlyFinishEnabled
                  ? t('admin.policy.summary.creditOn', {
                      min: format(form.creditMinRemainingMinutes),
                      days: form.creditExpiryDays,
                    })
                  : t('admin.policy.summary.off')
              }
            />
            <SummaryRow label={t('admin.policy.summary.grace')} value={format(form.graceMinutes)} />
          </SummaryList>
          <div style={{ marginTop: 'var(--lx-space-4)' }}>
            <Button type="button" loading={updateMutation.isPending} onClick={() => void handleSave()}>
              {t('common.save')}
            </Button>
          </div>
        </Card>
      </RequirePermission>
    </AdminShell>
  );
}
