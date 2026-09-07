import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatDateTime, formatTime, type TranslationKey } from '@luparx/i18n';
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
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { MOVEMENT_ICON } from '../lib/movementPresentation';
import {
  MOCK_CURRENCY_CODE,
  MOCK_MOVEMENTS,
  MOCK_PROFILE,
  MOCK_TENANT_TIME_ZONE,
  extendMockSession,
  primaryVehicle,
  useActiveSession,
  useWalletBalanceMinor,
  type MockActiveSession,
} from '../mocks/parkingDomain';

function useRemainingSeconds(expiresAt: string): number {
  const compute = (): number => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return remaining;
}

function ActiveSessionCard({ session }: { session: MockActiveSession }): React.JSX.Element {
  const { t, locale } = useTranslation();
  const remainingSeconds = useRemainingSeconds(session.expiresAt);

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
          {session.vehiclePlate}
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
            time: formatTime(session.expiresAt, locale, { timeZone: MOCK_TENANT_TIME_ZONE }),
          })}
        </p>
        <Button type="button" variant="outline" fullWidth onClick={() => extendMockSession(30)}>
          <IconPlus size={16} /> {t('citizen.home.activeSession.extendCta')}
        </Button>
      </div>
    </Card>
  );
}

export function HomePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  // TODO(domain): backed by the in-memory mock store (apps/citizen/src/mocks/parkingDomain.ts) until
  // module-parking/module-wallet ship their citizen-facing endpoints (CONTRACT.md §4).
  const session = useActiveSession();
  const balanceMinor = useWalletBalanceMinor();
  const vehicle = primaryVehicle();
  // Non-null: MOCK_MOVEMENTS is a non-empty compile-time constant.
  const recentMovement = MOCK_MOVEMENTS[0]!;

  return (
    <CitizenShell>
      <div>
        <h1 className="lx-text-greeting" style={{ margin: 0 }}>
          {t('citizen.home.greeting', { name: MOCK_PROFILE.givenName })}
        </h1>
        <p className="lx-text-meta" style={{ margin: 'var(--lx-space-1) 0 0 0' }}>
          {session ? t('citizen.home.subtitle.activeSession') : t('citizen.home.subtitle.noSession')}
        </p>
      </div>

      {session ? (
        <ActiveSessionCard session={session} />
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
        <BalanceRow
          label={t('citizen.wallet.balanceLabel')}
          balanceMinor={balanceMinor}
          currencyCode={MOCK_CURRENCY_CODE}
          locale={locale}
          actionLabel={t('citizen.home.balanceCard.action')}
          onAction={() => navigate('/wallet')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--lx-card-gap)' }}>
          <StatCard
            className="lx-stat-card--compact"
            label={t('citizen.wallet.balanceLabel')}
            value={formatCurrencyMinor(balanceMinor, MOCK_CURRENCY_CODE, locale)}
            action={
              <Button type="button" variant="solid" onClick={() => navigate('/wallet')}>
                {t('citizen.home.balanceCard.action')}
              </Button>
            }
          />
          <StatCard
            className="lx-stat-card--compact"
            label={t('citizen.home.vehicleCard.label')}
            value={vehicle.plate}
            hint={`${vehicle.brand} ${vehicle.model} · ${vehicle.year}`}
            action={
              <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
                {t('citizen.home.vehicleCard.changeCta')}
              </Button>
            }
          />
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
          <ListRow
            icon={MOVEMENT_ICON[recentMovement.kind]}
            title={t(recentMovement.titleKey as TranslationKey)}
            meta={formatDateTime(recentMovement.occurredAt, locale, { timeZone: MOCK_TENANT_TIME_ZONE })}
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
        </Card>
      </div>
    </CitizenShell>
  );
}
