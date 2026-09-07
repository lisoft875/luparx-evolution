import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime } from '@luparx/i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconCar,
  IconChevronRight,
  IconFine,
  IconPark,
  IconWallet,
  ListRow,
  Timer,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { extendMockSession, useActiveSession, type MockActiveSession } from '../mocks/parkingDomain';

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Badge tone={remainingSeconds <= 600 ? 'warning' : 'success'}>{t('citizen.home.activeSession.title')}</Badge>
            <p className="lx-text-card-title" style={{ marginTop: 'var(--lx-space-2)' }}>
              {t('citizen.home.activeSession.plateLabel')}: {session.vehiclePlate}
            </p>
            <p className="lx-text-meta">
              {t('citizen.home.activeSession.zoneLabel')}: {session.zoneName} · {session.spaceCode}
            </p>
          </div>
          <Timer
            remainingSeconds={remainingSeconds}
            aria-label={t('citizen.home.activeSession.title')}
          />
        </div>
        <p className="lx-text-meta">
          {t('citizen.home.activeSession.expiresLabel')} {formatDateTime(session.expiresAt, locale)}
        </p>
        <Button type="button" onClick={() => extendMockSession(30)}>
          {t('citizen.home.activeSession.extend')}
        </Button>
      </div>
    </Card>
  );
}

export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me } = useAuth();
  const navigate = useNavigate();
  // TODO(domain): backed by an in-memory mock store (apps/citizen/src/mocks/parkingDomain.ts) until
  // module-parking ships `/api/v1/citizen/parking-sessions` (CONTRACT.md §4).
  const session = useActiveSession();

  return (
    <CitizenShell>
      <h1 className="lx-text-greeting">{t('citizen.home.greeting', { name: me?.user.givenName ?? '' })}</h1>

      {session ? (
        <ActiveSessionCard session={session} />
      ) : (
        <Card>
          <EmptyState
            icon={<IconPark size={28} />}
            title={t('citizen.home.noSession.title')}
            description={t('citizen.home.noSession.description')}
            action={
              <Button type="button" onClick={() => navigate('/park')}>
                {t('citizen.home.noSession.cta')}
              </Button>
            }
          />
        </Card>
      )}

      <section>
        <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-2) 0' }}>
          {t('citizen.home.quickAccess.title')}
        </p>
        <Card>
          <ListRow
            icon={<IconCar size={18} />}
            title={t('nav.vehicles')}
            onClick={() => navigate('/vehicles')}
            value={<IconChevronRight size={16} />}
          />
          <ListRow
            icon={<IconFine size={18} />}
            title={t('nav.fines')}
            onClick={() => navigate('/fines')}
            value={<IconChevronRight size={16} />}
          />
          <ListRow
            icon={<IconWallet size={18} />}
            title={t('nav.wallet')}
            onClick={() => navigate('/wallet')}
            value={<IconChevronRight size={16} />}
          />
        </Card>
      </section>
    </CitizenShell>
  );
}
