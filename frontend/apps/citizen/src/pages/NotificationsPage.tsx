import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CitizenNotification, NotificationCategory } from '@luparx/api-client';
import { formatCurrencyMinor, formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconBell,
  IconClock,
  IconFine,
  IconTopUp,
  ListRow,
  Modal,
  Pagination,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useTenantTimeZone,
  useUpdateNotificationPreferences,
} from '../lib/queries';

const PAGE_SIZE = 20;

/**
 * Where a notification takes you.
 *
 * <p>Derived from `subjectType` and not from a URL the server sent: routes are the client's business
 * and an API that shipped them would have to be redeployed to move a screen. A subject with no screen
 * of its own returns null and the row simply does not navigate — which is honest, and better than a
 * row that looks pressable and goes nowhere.</p>
 */
function routeFor(notification: CitizenNotification): string | null {
  switch (notification.subjectType) {
    case 'CITATION':
      return `/fines/${notification.subjectId}`;
    case 'WALLET_TRANSACTION':
    case 'TIME_CREDIT':
      return '/wallet';
    case 'PARKING_SESSION':
      return '/';
    default:
      return null;
  }
}

function iconFor(category: NotificationCategory): React.JSX.Element {
  switch (category) {
    case 'FINES':
      return <IconFine />;
    case 'WALLET':
      return <IconTopUp />;
    default:
      return <IconClock />;
  }
}

/**
 * The citizen's inbox — what the bell finally points at (CONTRACT.md v0.38).
 *
 * <h2>El texto se arma aquí</h2>
 *
 * <p>The server sends a stable `type` and raw `params`: a plate, an ISO instant, an amount in minor
 * units. The sentence is built here, from this app's own bundle and this reader's locale, which is
 * what makes a history written in Spanish readable in English the day somebody switches languages.
 * It is the same rule the emails follow, resolved a second time on the server for the inbox.</p>
 */
export function NotificationsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const timeZone = useTenantTimeZone();
  const [page, setPage] = useState(0);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const query = useNotifications(page, PAGE_SIZE);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadOnPage = useMemo(
    () => (query.data?.items ?? []).filter((item) => !item.readAt).length,
    [query.data],
  );

  /**
   * One line, in the reader's language.
   *
   * <p>Every parameter is formatted here rather than interpolated raw: a plate goes in as it is, an
   * instant becomes a time in the municipality's own clock, and an amount becomes money in the
   * municipality's own currency. A template that pasted `1500` and `2026-09-10T21:00:00Z` into a
   * sentence would be a screen written for whoever wrote the row.
   */
  function describe(notification: CitizenNotification): string {
    const params = notification.params ?? {};
    const when = typeof params.expiresAt === 'string'
      ? formatDateTime(params.expiresAt, locale, timeZone ? { timeZone } : undefined)
      : '';
    const amount = typeof params.amountMinor === 'number' && typeof params.currencyCode === 'string'
      ? formatCurrencyMinor(params.amountMinor, params.currencyCode, locale)
      : '';
    return t(`notification.type.${notification.type}` as TranslationKey, {
      plate: typeof params.plate === 'string' ? params.plate : '',
      spaceCode: typeof params.spaceCode === 'string' ? params.spaceCode : '',
      citationNumber: typeof params.citationNumber === 'string' ? params.citationNumber : '',
      minutes: typeof params.minutes === 'number' ? String(params.minutes) : '',
      when,
      amount,
    });
  }

  function open(notification: CitizenNotification): void {
    // Marked read on the way out and not awaited: the person asked to see the thing, not to wait for
    // a bookkeeping call. If it fails the row stays unread, which is the harmless direction to err.
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    const route = routeFor(notification);
    if (route) {
      navigate(route);
    }
  }

  return (
    <CitizenShell
      title={t('citizen.notifications.title')}
      subtitle={t('citizen.notifications.subtitle')}
      onBack={() => navigate('/more')}
    >
      <div style={{ display: 'flex', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" onClick={() => setPreferencesOpen(true)}>
          {t('citizen.notifications.preferences.open')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={unreadOnPage === 0}
          loading={markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          {t('citizen.notifications.markAllRead')}
        </Button>
      </div>

      <QueryBoundary
        query={query}
        errorTitle={t('citizen.notifications.title')}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<IconBell />}
            tone="success"
            title={t('citizen.notifications.empty.title')}
            description={t('citizen.notifications.empty.description')}
          />
        }
      >
        {(data) => (
          <>
            <Card>
              {data.items.map((notification) => (
                <ListRow
                  key={notification.id}
                  icon={iconFor(notification.category)}
                  iconTone={notification.readAt ? 'success' : 'primary'}
                  title={describe(notification)}
                  meta={formatDateTime(notification.createdAt, locale, timeZone ? { timeZone } : undefined)}
                  value={notification.readAt ? undefined : <span aria-label={t('citizen.notifications.unread')}>●</span>}
                  onClick={() => open(notification)}
                />
              ))}
            </Card>
            {data.totalPages > 1 ? (
              <Pagination
                page={data.page}
                size={data.size}
                totalPages={data.totalPages}
                totalElements={data.totalElements}
                onPageChange={setPage}
                previousLabel={t('pagination.previous')}
                nextLabel={t('pagination.next')}
                pageLabel={t('pagination.page')}
                ofLabel={t('pagination.of')}
                resultCountLabel={t('pagination.resultCount.other', { count: data.totalElements })}
              />
            ) : null}
          </>
        )}
      </QueryBoundary>

      <NotificationPreferencesDialog open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </CitizenShell>
  );
}

/**
 * The master switch and its ticks.
 *
 * <p>A dialog rather than a screen of its own: it is one switch and three checkboxes, and a route
 * would be a page the person visits once. The categories come from the server's own
 * `availableCategories`, so a category added next year appears here without shipping a client.</p>
 */
function NotificationPreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [error, setError] = useState<string | null>(null);

  const preferences = query.data;
  const [draft, setDraft] = useState<{ emailEnabled: boolean; categories: NotificationCategory[] } | null>(null);
  const current = draft ?? (preferences
    ? { emailEnabled: preferences.emailEnabled, categories: preferences.emailCategories }
    : null);

  function toggleCategory(category: NotificationCategory, checked: boolean): void {
    if (!current) return;
    setDraft({
      emailEnabled: current.emailEnabled,
      categories: checked
        ? [...current.categories, category]
        : current.categories.filter((value) => value !== category),
    });
  }

  async function save(): Promise<void> {
    if (!current) return;
    setError(null);
    try {
      await update.mutateAsync({ emailEnabled: current.emailEnabled, emailCategories: current.categories });
      setDraft(null);
      onClose();
    } catch {
      setError(t('citizen.notifications.preferences.error'));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('citizen.notifications.preferences.title')}
      description={t('citizen.notifications.preferences.description')}
      closeLabel={t('common.close')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {!current ? (
          <p className="lx-text-meta" style={{ margin: 0 }}>{t('common.loading')}</p>
        ) : (
          <>
            <Checkbox
              label={t('citizen.notifications.preferences.emailEnabled')}
              hint={t('citizen.notifications.preferences.emailEnabledHint')}
              checked={current.emailEnabled}
              onChange={(event) => setDraft({ emailEnabled: event.target.checked, categories: current.categories })}
            />
            {/* The ticks stay reachable but visibly inert while the master switch is off: hiding them
                would make turning email back on feel like it lost the choices, which it does not. */}
            <div style={{ opacity: current.emailEnabled ? 1 : 0.5 }}>
              <p className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-2) 0' }}>
                {t('citizen.notifications.preferences.categories')}
              </p>
              {(preferences?.availableCategories ?? []).map((category) => (
                <Checkbox
                  key={category}
                  label={t(`notification.category.${category}` as TranslationKey)}
                  checked={current.categories.includes(category)}
                  disabled={!current.emailEnabled}
                  onChange={(event) => toggleCategory(category, event.target.checked)}
                />
              ))}
            </div>
            <div className="lx-dialog-actions">
              <Button type="button" variant="secondary" fullWidth onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                loading={update.isPending}
                onClick={() => void save()}
              >
                {t('common.save')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
