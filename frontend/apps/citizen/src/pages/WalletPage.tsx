import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatDate, formatDateTime } from '@luparx/i18n';
import { AmountText, Badge, Card, CardStack, IconClock, IconCreditCard, IconPlus, ListRow, SectionHeader } from '@luparx/ui';
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { MOVEMENT_ICON, MOVEMENT_ICON_TONE, MOVEMENT_TITLE_KEY } from '../lib/movementPresentation';
import { useTenantTimeZone, useTimeCredits, useWallet } from '../lib/queries';
import { MOCK_PAYMENT_CARDS } from '../mocks/parkingDomain';

export function WalletPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const { data: timeCredits } = useTimeCredits();
  const timeZone = useTenantTimeZone();
  // Real ledger: the wallet endpoint returns the balance together with its movements, newest
  // first. Only the saved payment cards stay mocked — CONTRACT.md defines no endpoint for those yet.
  const recentMovements = (wallet?.transactions ?? []).slice(0, 2);

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.wallet.title')}</h1>}>

      {wallet ? (
        <BalanceRow
          label={t('citizen.wallet.balanceLabel')}
          balanceMinor={wallet.balanceMinor}
          currencyCode={wallet.currencyCode}
          locale={locale}
          actionLabel={
            <>
              <IconPlus size={16} /> {t('citizen.wallet.topUpCta')}
            </>
          }
          onAction={() => undefined}
        />
      ) : null}

      <Card>
        <ListRow
          icon={<IconClock size={18} />}
          title={t('citizen.wallet.timeCredits.title')}
          meta={
            timeCredits && timeCredits.minutes > 0
              ? t('citizen.wallet.timeCredits.expiresLabel', {
                  date: timeCredits.expiresAt ? formatDate(timeCredits.expiresAt, locale) : t('citizen.wallet.timeCredits.noExpiry'),
                })
              : t('citizen.wallet.timeCredits.empty')
          }
          value={
            timeCredits && timeCredits.minutes > 0 ? (
              <span style={{ color: 'var(--lx-success)' }}>{tPlural('citizen.wallet.timeCredits.value', timeCredits.minutes)}</span>
            ) : undefined
          }
        />
      </Card>

      <div>
        <SectionHeader
          title={t('citizen.wallet.paymentMethods.title')}
          action={{ label: t('citizen.wallet.paymentMethods.viewAllCta'), onClick: () => undefined }}
        />
        <Card>
          {MOCK_PAYMENT_CARDS.map((card) => (
            <ListRow
              key={card.id}
              // TODO(asset): generic line-art card icon until the client supplies a licensed
              // network-brand mark (Mastercard/Visa) to render per `card.brand` instead.
              icon={<IconCreditCard size={18} />}
              title={`•••• ${card.last4}`}
              meta={t('citizen.wallet.paymentMethods.expiresLabel', {
                date: `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}`,
              })}
              value={card.isPrimary ? <Badge tone="success">{t('citizen.wallet.paymentMethods.primaryBadge')}</Badge> : undefined}
            />
          ))}
          <ListRow
            icon={<IconPlus size={18} />}
            title={t('citizen.wallet.paymentMethods.addCta')}
            onClick={() => undefined}
          />
        </Card>
      </div>

      <div>
        <SectionHeader
          title={t('citizen.movements.title')}
          action={{ label: t('citizen.wallet.movements.viewAllCta'), onClick: () => navigate('/movements') }}
        />
        <CardStack>
          {recentMovements.map((movement) => (
            <Card key={movement.id} nested>
              <ListRow
                icon={MOVEMENT_ICON[movement.type]}
                iconTone={MOVEMENT_ICON_TONE[movement.type]}
                title={t(MOVEMENT_TITLE_KEY[movement.type])}
                meta={formatDateTime(movement.createdAt, locale, { timeZone })}
                value={
                  <AmountText
                    amountMinor={movement.amountMinor}
                    currencyCode={movement.currencyCode}
                    locale={locale}
                  />
                }
              />
            </Card>
          ))}
        </CardStack>
      </div>
    </CitizenShell>
  );
}
