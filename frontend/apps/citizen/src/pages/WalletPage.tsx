import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor } from '@luparx/i18n';
import { Button, StatCard, IconWallet } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { useWalletBalanceMinor } from '../mocks/parkingDomain';

export function WalletPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  // TODO(domain): backed by the mock parking store until a real citizen wallet endpoint ships.
  const balanceMinor = useWalletBalanceMinor();

  return (
    <CitizenShell title={t('citizen.wallet.title')} onBack={() => navigate('/')}>
      <StatCard
        icon={<IconWallet size={20} />}
        label={t('citizen.wallet.balanceLabel')}
        value={<span className="lx-text-amount-lg">{formatCurrencyMinor(balanceMinor, 'CRC', locale)}</span>}
      />
      <div style={{ display: 'flex', gap: 'var(--lx-space-3)' }}>
        <Button type="button" fullWidth>
          {t('citizen.wallet.topUpCta')}
        </Button>
        <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/movements')}>
          {t('citizen.wallet.movementsCta')}
        </Button>
      </div>
    </CitizenShell>
  );
}
