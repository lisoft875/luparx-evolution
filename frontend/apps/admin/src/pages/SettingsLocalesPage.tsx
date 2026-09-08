import * as React from 'react';
import { useEffect, useState } from 'react';
import type { TenantLocaleSetting } from '@luparx/api-client';
import { SUPPORTED_LOCALES, localeEndonym, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Button, Card, Checkbox, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useTenantLocaleSettings, useUpdateTenantLocales } from '../lib/queries';

/**
 * Languages this municipality offers, and which one it falls back to
 * (CONTRACT.md v0.3 §"Idiomas por municipalidad").
 *
 * The row set is the union of what the municipality already has stored and what the platform can
 * render, so a language enabled by a previous administrator stays visible and switchable off even
 * if this build has no dictionary for it. Two rules are enforced here before the request leaves,
 * and again by the server: at least one language stays enabled, and exactly one of the enabled
 * ones is the default — a portal with no language to fall back to has no deterministic answer to
 * give (v0.3: user preference → enabled → tenant default → platform default).
 */
export function SettingsLocalesPage(): React.JSX.Element {
  const { t } = useTranslation();
  const settingsQuery = useTenantLocaleSettings();
  const updateMutation = useUpdateTenantLocales();
  const [rows, setRows] = useState<TenantLocaleSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = settingsQuery.data?.locales;
    if (!stored) return;
    const known = new Map(stored.map((row) => [row.locale, row]));
    for (const locale of SUPPORTED_LOCALES) {
      if (!known.has(locale)) {
        known.set(locale, { locale, enabled: false, isDefault: false, sortOrder: known.size });
      }
    }
    setRows([...known.values()].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [settingsQuery.data]);

  function toggleEnabled(locale: string, enabled: boolean): void {
    setSaved(false);
    setRows((current) =>
      (current ?? []).map((row) =>
        row.locale === locale
          ? // Turning a language off cannot leave it as the default: the default has to be a
            // language the portals will actually serve.
            { ...row, enabled, isDefault: enabled ? row.isDefault : false }
          : row,
      ),
    );
  }

  function makeDefault(locale: string): void {
    setSaved(false);
    setRows((current) =>
      (current ?? []).map((row) => ({ ...row, isDefault: row.locale === locale, enabled: row.locale === locale ? true : row.enabled })),
    );
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setSaved(false);
    const current = rows ?? [];
    const enabled = current.filter((row) => row.enabled);
    if (enabled.length === 0) {
      setError(t('admin.settings.locales.error.noneEnabled'));
      return;
    }
    if (enabled.filter((row) => row.isDefault).length !== 1) {
      setError(t('admin.settings.locales.error.defaultRequired'));
      return;
    }
    try {
      await updateMutation.mutateAsync({
        locales: current.map((row, index) => ({ ...row, sortOrder: index })),
      });
      setSaved(true);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <AdminShell>
      <h1>{t('admin.settings.locales.title')}</h1>
      <Card>
        <SectionHeader title={t('admin.settings.locales.title')} description={t('admin.settings.locales.description')} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}
        {settingsQuery.isLoading || !rows ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
              {rows.map((row) => (
                <li
                  key={row.locale}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)', flexWrap: 'wrap' }}
                >
                  <Checkbox
                    label={localeEndonym(row.locale)}
                    checked={row.enabled}
                    onChange={(event) => toggleEnabled(row.locale, event.target.checked)}
                  />
                  <span className="lx-text-meta">{row.locale}</span>
                  {row.isDefault ? (
                    <Badge tone="success">{t('admin.settings.locales.defaultBadge')}</Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!row.enabled}
                      onClick={() => makeDefault(row.locale)}
                    >
                      {t('admin.settings.locales.makeDefault')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="lx-text-meta">
              {t('admin.settings.locales.platformDefault', {
                locale: localeEndonym(settingsQuery.data?.platformDefaultLocale ?? ''),
              })}
            </p>
            <Button type="button" onClick={handleSave} loading={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
