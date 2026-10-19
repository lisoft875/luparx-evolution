import * as React from 'react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor } from '@luparx/i18n';
import { Alert, Button, Card, RadioCardGroup, SectionHeader } from '@luparx/ui';
import { useAuth } from '@luparx/auth';
import { useCheckoutStatus } from '../lib/queries';

/**
 * La «página del proveedor», cuando el proveedor es el simulador.
 *
 * <h2>Por qué esto existe y por qué no viaja a producción</h2>
 *
 * <p>El pago con tarjeta es un traspaso ALOJADO: el servidor abre el cobro y devuelve la dirección
 * de una página que no es nuestra, el ciudadano teclea ahí su tarjeta, y vuelve. Contra el backend
 * de desarrollo esa página la sirve el propio servidor (`/dev/payments/checkout/**`). Contra el
 * transporte simulado no hay servidor que la sirva, así que la sirve la aplicación — y esta ruta
 * se monta SÓLO cuando `VITE_USE_MOCKS=true`, de modo que una compilación de producción no la
 * contiene.</p>
 *
 * <p>No pide un número de tarjeta: se elige de una lista qué desenlace se quiere probar. Son los
 * seis mismos escenarios que el backend ofrece en `SimulatedTestCard`, por el mismo nombre.</p>
 */

const ESCENARIOS = [
  'VISA_APPROVED',
  'MASTERCARD_APPROVED',
  'DECLINED',
  'INSUFFICIENT_FUNDS',
  'THREE_DS_CHALLENGE',
  'EXPIRED_CARD',
] as const;

type Escenario = (typeof ESCENARIOS)[number];

export function SimulatedCheckoutPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { reference } = useParams<{ reference: string }>();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { apiClient } = useAuth();
  const estado = useCheckoutStatus(reference ?? null);
  const [escenario, setEscenario] = useState<Escenario>('VISA_APPROVED');
  const [enDesafio, setEnDesafio] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const monto = estado.data
    ? formatCurrencyMinor(estado.data.amountMinor, estado.data.currencyCode, locale)
    : '';

  /** Llama al simulador y vuelve a la billetera con el token, igual que haría el proveedor. */
  async function resolver(cuerpo: { escenario?: string; aprobar?: boolean; cancelar?: boolean }): Promise<void> {
    setEnviando(true);
    try {
      await apiClient.citizenCheckouts.simularResolucion(reference ?? '', cuerpo);
    } finally {
      setEnviando(false);
      navigate(`/wallet?checkout=${encodeURIComponent(reference ?? '')}&token=${encodeURIComponent(token)}`);
    }
  }

  return (
    <main
      className="lx-pago-simulado"
      style={{ padding: 'var(--lx-space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}
    >
      <h1 className="lx-text-screen-title">{t('citizen.simulatedPay.title')}</h1>
      <Alert tone="warning">{t('citizen.simulatedPay.notice')}</Alert>

      <Card>
        <SectionHeader title={t('citizen.simulatedPay.amount', { amount: monto })} />

        {enDesafio ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <SectionHeader title={t('citizen.simulatedPay.challengeTitle')} />
            <p className="lx-text-meta">{t('citizen.simulatedPay.challengeDetail')}</p>
            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={enviando}
              onClick={() => void resolver({ escenario, aprobar: true })}
            >
              {t('citizen.simulatedPay.challengeApprove')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={enviando}
              onClick={() => void resolver({ escenario, aprobar: false })}
            >
              {t('citizen.simulatedPay.challengeReject')}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <RadioCardGroup
              name="escenario-pago"
              legend={t('citizen.simulatedPay.scenarioLegend')}
              value={escenario}
              onChange={(v) => setEscenario(v as Escenario)}
              options={ESCENARIOS.map((nombre) => ({
                value: nombre,
                label: t(`citizen.simulatedPay.scenario.${nombre}` as 'citizen.simulatedPay.scenario.VISA_APPROVED'),
              }))}
            />
            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={enviando}
              onClick={() => {
                // El escenario de autenticación añade un paso, como lo haría el banco de verdad.
                if (escenario === 'THREE_DS_CHALLENGE') {
                  setEnDesafio(true);
                  return;
                }
                void resolver({ escenario });
              }}
            >
              {t('citizen.simulatedPay.pay')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              disabled={enviando}
              onClick={() => void resolver({ cancelar: true })}
            >
              {t('citizen.simulatedPay.cancel')}
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
