import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Card, Checkbox, FormField, Input, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useSpaceFormat, useUpdateSpaceFormat } from '../lib/queries';

const MIN_DIGITS = 1;
const MAX_DIGITS = 12;

/**
 * How a bay code is written in this municipality (CONTRACT.md v0.3 §"Formato del código de
 * espacio"): a prefix, how many characters follow it, and whether letters are allowed.
 *
 * The preview below the fields is built locally *only to show what the choice looks like* — the
 * regex the server actually validates against, and the example the citizen's field uses as its
 * placeholder, are both derived server-side and echoed back after saving. That is what the
 * "stored" line shows: the difference between the two lines is the difference between what you
 * are about to save and what is in force right now.
 */
export function SettingsSpaceFormatPage(): React.JSX.Element {
  const { t } = useTranslation();
  const formatQuery = useSpaceFormat();
  const updateMutation = useUpdateSpaceFormat();

  const [prefix, setPrefix] = useState('');
  const [digits, setDigits] = useState(4);
  const [allowLetters, setAllowLetters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = formatQuery.data;
    if (!stored) return;
    setPrefix(stored.prefix ?? '');
    setDigits(stored.digits);
    setAllowLetters(stored.allowLetters);
  }, [formatQuery.data]);

  // Illustration only: the authoritative pattern comes back from the server on save.
  const previewExample = `${prefix}${'0'.repeat(Math.max(0, digits - 1))}1`;
  const previewPattern = `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${allowLetters ? '[0-9A-Z]' : '[0-9]'}{${digits}}$`;

  async function handleSave(): Promise<void> {
    setError(null);
    setSaved(false);
    if (digits < MIN_DIGITS || digits > MAX_DIGITS) {
      setError(t('admin.settings.spaceFormat.error.digitsRange', { min: MIN_DIGITS, max: MAX_DIGITS }));
      return;
    }
    try {
      await updateMutation.mutateAsync({ prefix: prefix.trim(), digits, allowLetters });
      setSaved(true);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <AdminShell>
      <h1>{t('admin.settings.spaceFormat.title')}</h1>
      <Card>
        <SectionHeader
          title={t('admin.settings.spaceFormat.title')}
          description={t('admin.settings.spaceFormat.description')}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}
        {formatQuery.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <FormField
              label={t('admin.settings.spaceFormat.prefixLabel')}
              hint={t('admin.settings.spaceFormat.prefixHint')}
              optionalLabel={t('common.optional')}
            >
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={prefix}
                  maxLength={8}
                  onChange={(event) => {
                    setSaved(false);
                    setPrefix(event.target.value.toUpperCase());
                  }}
                />
              )}
            </FormField>
            <FormField
              label={t('admin.settings.spaceFormat.digitsLabel')}
              hint={t('admin.settings.spaceFormat.digitsHint')}
            >
              {({ inputId }) => (
                <Input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={MIN_DIGITS}
                  max={MAX_DIGITS}
                  value={String(digits)}
                  onChange={(event) => {
                    setSaved(false);
                    setDigits(Number(event.target.value));
                  }}
                />
              )}
            </FormField>
            <Checkbox
              label={t('admin.settings.spaceFormat.allowLettersLabel')}
              hint={t('admin.settings.spaceFormat.allowLettersHint')}
              checked={allowLetters}
              onChange={(event) => {
                setSaved(false);
                setAllowLetters(event.target.checked);
              }}
            />
            <div style={{ marginTop: 'var(--lx-space-4)' }}>
              <p className="lx-text-card-title" style={{ margin: 0 }}>
                {t('admin.settings.spaceFormat.previewLabel')}
              </p>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 'var(--lx-space-2) 0', letterSpacing: '0.08em' }}>
                {previewExample}
              </p>
              <p className="lx-text-meta" style={{ wordBreak: 'break-all' }}>
                {previewPattern}
              </p>
              {formatQuery.data ? (
                <p className="lx-text-meta">
                  {t('admin.settings.spaceFormat.stored', {
                    example: formatQuery.data.example,
                    pattern: formatQuery.data.pattern,
                  })}
                </p>
              ) : null}
            </div>
            <Button type="button" onClick={handleSave} loading={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
