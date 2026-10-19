import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatDate, formatDateTime } from '@luparx/i18n';
import { Alert, AmountText, Badge, Card, CardStack, IconClock, IconCreditCard, IconPlus, ListRow, SectionHeader } from '@luparx/ui';
import type { CheckoutResult } from '@luparx/api-client';
import { TopUpSheet } from '../components/TopUpSheet';
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { MOVEMENT_ICON, MOVEMENT_ICON_TONE, MOVEMENT_TITLE_KEY } from '../lib/movementPresentation';
import { useCheckoutReturn, useTenantTimeZone, useTimeCredits, useWallet } from '../lib/queries';
import { hayMovimientosDePrueba } from '../lib/movementPresentation';
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
  const saldoDePrueba = hayMovimientosDePrueba(wallet?.transactions ?? []);

  const [recargaAbierta, setRecargaAbierta] = useState(false);
  const [params, setParams] = useSearchParams();
  const [resultado, setResultado] = useState<CheckoutResult | null>(null);
  const vuelta = useCheckoutReturn();

  /*
    La vuelta de la página del proveedor.

    El token llega en la dirección, se canjea UNA vez y se borra de la barra: si se quedara,
    recargar la pantalla intentaría canjearlo otra vez y el servidor respondería «token inválido»
    sobre un pago que sí ocurrió. Lo que se muestra sale del servidor, no de haber vuelto: un
    regreso a esta pantalla no significa que se haya pagado.
  */
  const token = params.get('token');
  /*
    El token es de UN SOLO USO y hay que canjearlo una sola vez.

    Sin esta marca el efecto corre dos veces —React lo hace a propósito en desarrollo—: el primer
    canje acredita y el segundo recibe «token inválido», que es la respuesta correcta del servidor
    y borraba el resultado recién mostrado. El saldo subía y la pantalla no decía nada. La marca
    va en una `ref` y no en estado porque tiene que valer ya en el mismo ciclo, antes de que un
    segundo efecto llegue a mirarla.
  */
  const canjeado = useRef<string | null>(null);
  useEffect(() => {
    if (!token || canjeado.current === token) return;
    canjeado.current = token;
    const siguiente = new URLSearchParams(params);
    siguiente.delete('token');
    siguiente.delete('checkout');
    setParams(siguiente, { replace: true });
    // Un fallo acá no borra lo ya mostrado: se queda sin resultado, que es lo honesto.
    vuelta.mutate(token, { onSuccess: setResultado });
    // Sólo cuando cambia el token: lo demás es estado de la propia pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <CitizenShell heading={<h1 className="lx-text-screen-title">{t('citizen.wallet.title')}</h1>}>

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
          onAction={() => setRecargaAbierta(true)}
        />
      ) : null}

      {/* Saldo creado por el simulador: se dice, y se dice arriba de todo. */}
      {saldoDePrueba ? (
        <Alert tone="warning">
          <strong>{t('citizen.wallet.testMoney.badge')}</strong> {t('citizen.wallet.testMoney.notice')}
        </Alert>
      ) : null}

      {resultado ? (
        <Alert tone={resultado.credited ? 'success' : resultado.paymentState === 'PENDING' ? 'info' : 'danger'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-1)' }}>
            <strong>
              {resultado.credited
                ? t('citizen.topup.result.credited')
                : resultado.paymentState === 'PENDING'
                  ? t('citizen.topup.result.pending')
                  : resultado.paymentState === 'CANCELLED'
                    ? t('citizen.topup.result.cancelled')
                    : t('citizen.topup.result.failed')}
            </strong>
            <span>
              {resultado.credited
                ? t('citizen.topup.result.creditedDetail', {
                    amount: formatCurrencyMinor(resultado.amountMinor, resultado.currencyCode, locale),
                  })
                : resultado.paymentState === 'PENDING'
                  ? t('citizen.topup.result.pendingDetail')
                  : t('citizen.topup.result.noCharge')}
            </span>
            {/* El motivo que dio el proveedor, traducido cuando se conoce; el texto del servidor si no. */}
            {resultado.failureCode ? (
              <span data-motivo={resultado.failureCode}>
                {resultado.failureReason ?? resultado.failureCode}
              </span>
            ) : null}
            {resultado.cardLast4 ? (
              <span>{t('citizen.topup.result.card', { last4: resultado.cardLast4 })}</span>
            ) : null}
          </div>
        </Alert>
      ) : null}

      <TopUpSheet open={recargaAbierta} onClose={() => setRecargaAbierta(false)} />

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
          /*
            Sin acción: el «Ver todos» tenía `onClick: () => undefined` —un enlace que no llevaba a
            ninguna parte— y sólo hay una tarjeta. Un control que no hace nada gasta la confianza en
            todos los demás. Vuelve cuando exista la pantalla de métodos de pago.
          */
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
