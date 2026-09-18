import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatDateTime, formatTime } from '@luparx/i18n';
import {
  AmountText,
  Button,
  Card,
  HeroCard,
  IconCar,
  IconCheck,
  IconPark,
  IconPlus,
  ListRow,
  SectionHeader,
  StatCard,
  Timer,
} from '@luparx/ui';
import type { ParkingPolicy, ParkingSession, Vehicle } from '@luparx/api-client';
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { ExtendSessionSheet } from '../components/ExtendSessionSheet';
import { FinishSessionConfirm } from '../components/FinishSessionConfirm';
import { MOVEMENT_ICON, MOVEMENT_ICON_TONE, MOVEMENT_TITLE_KEY } from '../lib/movementPresentation';
import { useAuth } from '@luparx/auth';
import {
  useActiveParkingSessions,
  useParkingPolicy,
  useTenantTimeZone,
  useVehicles,
  useWallet,
} from '../lib/queries';


function useRemainingSeconds(expiresAt: string): number {
  // Floored, like every other countdown in the app: the number on screen must never be ahead of
  // the time the server will actually honour (see ActiveSessionsBar).
  const compute = (): number => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return remaining;
}

/**
 * Featured active-session card. When the citizen has more than one active session (CONTRACT.md
 * v0.2 rule 1), this shows whichever expires first — same one the sticky bar leads with; the
 * sticky bar's own "+N" list is how the rest are reached. Extend/Finish visibility is driven by
 * the *active* tenant's policy: a session belonging to a different municipality than the one
 * currently selected is a rare edge case this demo doesn't special-case (the server itself always
 * validates against the session's own tenant regardless of what the UI shows).
 */
function ActiveSessionCard({ session, policy }: { session: ParkingSession; policy: ParkingPolicy | undefined }): React.JSX.Element {
  const { t, locale } = useTranslation();
  const timeZone = useTenantTimeZone();
  const remainingSeconds = useRemainingSeconds(session.expiresAt);
  const [extendOpen, setExtendOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <Card tone={remainingSeconds <= 600 ? 'warning' : 'success'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon lx-list-row__icon--success" aria-hidden="true">
              <IconCar size={20} />
            </span>
            <p className="lx-text-card-title" style={{ margin: 0 }}>
              {t('citizen.home.activeSession.title')}
            </p>
          </div>
          <span
            className="lx-status-dot"
            role="status"
            aria-label={t('citizen.home.activeSession.statusActive')}
          />
        </div>
        <p className="lx-text-amount-lg" style={{ margin: 0 }}>
          {session.plateSnapshot}
        </p>
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.home.activeSession.zoneAndSpace', { zone: session.zoneName, space: session.spaceCode })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Timer remainingSeconds={remainingSeconds} aria-label={t('citizen.home.activeSession.title')} />
          <span className="lx-text-meta">{t('citizen.home.activeSession.remainingLabel')}</span>
        </div>
        <p className="lx-text-meta" style={{ margin: 0, textAlign: 'center' }}>
          {t('citizen.home.activeSession.expiresAt', {
            time: formatTime(session.expiresAt, locale, { timeZone }),
          })}
        </p>
        {/* `flex: 1` alone (basis 0) put both actions on one line whatever the width, and a flex
            item's default `min-width: auto` will not shrink below its own label — so at 320 and
            390 px "Extender tiempo" and "Finalizar ahora" ran off the right edge of the card and
            gave the whole page a horizontal scrollbar. A basis wide enough to be worth keeping
            side by side, plus wrapping, is what makes the row honest: two columns where they fit,
            two full-width rows on a phone, and never a button hanging off the screen. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--lx-space-2)' }}>
          {policy?.extensionEnabled ? (
            <Button type="button" variant="outline" style={{ flex: '1 1 200px' }} onClick={() => setExtendOpen(true)}>
              <IconPlus size={16} /> {t('citizen.home.activeSession.extendCta')}
            </Button>
          ) : null}
          {policy?.earlyFinishEnabled ? (
            <Button type="button" variant="secondary" style={{ flex: '1 1 200px' }} onClick={() => setFinishOpen(true)}>
              {t('citizen.home.activeSession.finishCta')}
            </Button>
          ) : null}
        </div>
      </div>
      {/* No policy needed: the options, their prices and whether each is allowed all come from
          `GET /sessions/{id}/extension-options`, which knows this stay and not just the rules. */}
      <ExtendSessionSheet open={extendOpen} onClose={() => setExtendOpen(false)} session={session} />
      {policy ? <FinishSessionConfirm open={finishOpen} onClose={() => setFinishOpen(false)} session={session} policy={policy} /> : null}
    </Card>
  );
}

function primaryVehicleOf(vehicles: Vehicle[] | undefined): Vehicle | undefined {
  return vehicles?.find((v) => v.isPrimary) ?? vehicles?.[0];
}

export function HomePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { data: sessions } = useActiveParkingSessions();
  const { data: policy } = useParkingPolicy();
  const walletQuery = useWallet();
  const vehiclesQuery = useVehicles();
  const { me } = useAuth();
  const timeZone = useTenantTimeZone();

  const session = [...(sessions ?? [])].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )[0];

  return (
    <CitizenShell>
      <div>
        <h1 className="lx-text-greeting" style={{ margin: 0 }}>
          {t('citizen.home.greeting', { name: me?.user.givenName ?? '' })}
        </h1>
        <p className="lx-text-meta" style={{ margin: 'var(--lx-space-1) 0 0 0' }}>
          {session ? t('citizen.home.subtitle.activeSession') : t('citizen.home.subtitle.noSession')}
        </p>
      </div>

      {session ? (
        <ActiveSessionCard session={session} policy={policy} />
      ) : (
        <HeroCard
          icon={<IconPark size={28} />}
          title={t('citizen.home.cta.title')}
          subtitle={t('citizen.home.cta.subtitle')}
          onClick={() => navigate('/park')}
        />
      )}

      {session ? (
        // Mockup screen 2: only the balance row repeats here (no vehicle card) once a session is active.
        <QueryBoundary query={walletQuery} errorTitle={t('citizen.wallet.balanceLabel')}>
          {(wallet) => (
            <BalanceRow
              label={t('citizen.wallet.balanceLabel')}
              balanceMinor={wallet.balanceMinor}
              currencyCode={wallet.currencyCode}
              locale={locale}
              actionLabel={t('citizen.home.balanceCard.action')}
              onAction={() => navigate('/wallet')}
            />
          )}
        </QueryBoundary>
      ) : (
        // Each card owns its own three outcomes. They used to fall back to "Cargando…" for any
        // absent value, which turned a failed wallet call and a citizen with no car into the same
        // permanent spinner; now a failure states itself and offers the retry, and "no vehicles
        // yet" says so and offers the way to add one.
        <div className="lx-grid-2" style={{ gap: 'var(--lx-card-gap)' }}>
          <QueryBoundary
            query={walletQuery}
            errorTitle={t('citizen.wallet.balanceLabel')}
            loading={
              <StatCard
                className="lx-stat-card--compact"
                label={t('citizen.wallet.balanceLabel')}
                value={t('common.loading')}
              />
            }
          >
            {(wallet) => (
              <StatCard
                className="lx-stat-card--compact"
                label={t('citizen.wallet.balanceLabel')}
                value={formatCurrencyMinor(wallet.balanceMinor, wallet.currencyCode, locale)}
                action={
                  <Button type="button" variant="solid" onClick={() => navigate('/wallet')}>
                    {t('citizen.home.balanceCard.action')}
                  </Button>
                }
              />
            )}
          </QueryBoundary>
          <QueryBoundary
            query={vehiclesQuery}
            errorTitle={t('citizen.home.vehicleCard.label')}
            isEmpty={(list) => list.length === 0}
            loading={
              <StatCard
                className="lx-stat-card--compact"
                label={t('citizen.home.vehicleCard.label')}
                value={t('common.loading')}
              />
            }
            empty={
              <StatCard
                className="lx-stat-card--compact"
                label={t('citizen.home.vehicleCard.label')}
                value={t('citizen.home.vehicleCard.empty')}
                action={
                  <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
                    {t('citizen.home.vehicleCard.addCta')}
                  </Button>
                }
              />
            }
          >
            {(vehicles) => {
              const vehicle = primaryVehicleOf(vehicles);
              return (
                <StatCard
                  className="lx-stat-card--compact"
                  label={t('citizen.home.vehicleCard.label')}
                  value={vehicle?.plate ?? t('citizen.home.vehicleCard.empty')}
                  hint={vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || undefined : undefined}
                  action={
                    <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
                      {t('citizen.home.vehicleCard.changeCta')}
                    </Button>
                  }
                />
              );
            }}
          </QueryBoundary>
        </div>
      )}

      <Card tone="success">
        <ListRow
          icon={<IconCheck size={18} />}
          iconTone="success"
          iconShape="circle"
          title={t('citizen.home.finesCard.label')}
          meta={
            <span style={{ color: 'var(--lx-success)', fontWeight: 700 }}>{t('citizen.home.finesCard.none')}</span>
          }
          onClick={() => navigate('/fines')}
        />
      </Card>

      <div>
        <SectionHeader
          title={t('citizen.home.activity.title')}
          action={{ label: t('citizen.home.activity.viewAllCta'), onClick: () => navigate('/movements') }}
        />
        <Card>
          {/* The wallet endpoint returns the balance together with the first page of movements,
              newest first — this row is simply the top of that ledger. */}
          <QueryBoundary
            query={walletQuery}
            errorTitle={t('citizen.home.activity.title')}
            isEmpty={(wallet) => wallet.transactions.length === 0}
            empty={
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('citizen.movements.empty.title')}
              </p>
            }
          >
            {(wallet) => {
              const recentMovement = wallet.transactions[0];
              if (!recentMovement) return null;
              return (
                <ListRow
                  icon={MOVEMENT_ICON[recentMovement.type]}
                  iconTone={MOVEMENT_ICON_TONE[recentMovement.type]}
                  title={t(MOVEMENT_TITLE_KEY[recentMovement.type])}
                  meta={formatDateTime(recentMovement.createdAt, locale, { timeZone })}
                  value={
                    <AmountText
                      amountMinor={recentMovement.amountMinor}
                      currencyCode={recentMovement.currencyCode}
                      locale={locale}
                      showSignPrefix={false}
                    />
                  }
                  onClick={() => navigate('/movements')}
                />
              );
            }}
          </QueryBoundary>
        </Card>
      </div>
    </CitizenShell>
  );
}
