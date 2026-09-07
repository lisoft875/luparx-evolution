import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import { AmountText, Badge, Card, CardStack, IconCreditCard, IconPlus, ListRow, SectionHeader } from '@luparx/ui';
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { MOVEMENT_ICON, MOVEMENT_ICON_TONE } from '../lib/movementPresentation';
import {
  MOCK_CURRENCY_CODE,
  MOCK_MOVEMENTS,
  MOCK_PAYMENT_CARDS,
  MOCK_TENANT_TIME_ZONE,
  useWalletBalanceMinor,
} from '../mocks/parkingDomain';

export function WalletPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  // TODO(domain): backed by the mock parking store until real citizen wallet/payment-method endpoints ship.
  const balanceMinor = useWalletBalanceMinor();
  const recentMovements = MOCK_MOVEMENTS.slice(0, 2);

  return (
    <CitizenShell bare>
      <h1 className="lx-text-screen-title">{t('citizen.wallet.title')}</h1>

      <BalanceRow
        label={t('citizen.wallet.balanceLabel')}
        balanceMinor={balanceMinor}
        currencyCode={MOCK_CURRENCY_CODE}
        locale={locale}
        actionLabel={
          <>
            <IconPlus size={16} /> {t('citizen.wallet.topUpCta')}
          </>
        }
        onAction={() => undefined}
      />

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
                icon={MOVEMENT_ICON[movement.kind]}
                iconTone={MOVEMENT_ICON_TONE[movement.kind]}
                title={t(movement.titleKey as TranslationKey)}
                meta={formatDateTime(movement.occurredAt, locale, { timeZone: MOCK_TENANT_TIME_ZONE })}
                value={
                  <AmountText
                    amountMinor={movement.amountMinor}
                    currencyCode={movement.currencyCode}
                    locale={locale}
                    showSignPrefix={false}
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
