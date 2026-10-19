import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor } from '@luparx/i18n';
import { Alert, Button, Modal, RadioCardGroup } from '@luparx/ui';
import { useCardPaymentAvailability, useStartCheckout } from '../lib/queries';

export interface TopUpSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Los montos que se ofrecen, en céntimos. Nada de teclear un número suelto para una demostración. */
const MONTOS = [500000, 1000000, 2000000, 5000000];

/**
 * La recarga de saldo con tarjeta.
 *
 * <h2>Lo que esta pantalla NO hace</h2>
 *
 * <p>No pide el número de la tarjeta, ni el CVV, ni la fecha de vencimiento, y no hay en todo este
 * archivo un campo donde pudieran escribirse. El traspaso es alojado: el servidor abre el cobro y
 * devuelve una dirección del proveedor, y acá sólo se NAVEGA a ella. Guardar un PAN cambiaría el
 * alcance de cumplimiento de todo el producto, así que no se guarda ninguno.</p>
 *
 * <p>Tampoco decide si se pagó. Eso lo dice el servidor al volver, y lo dice con un solo campo:
 * `credited`.</p>
 */
export function TopUpSheet({ open, onClose }: TopUpSheetProps): React.JSX.Element | null {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const disponibilidad = useCardPaymentAvailability();
  const iniciar = useStartCheckout();
  const [montoMinor, setMontoMinor] = useState(MONTOS[1]!);
  const [error, setError] = useState(false);

  /*
    La clave de idempotencia se acuña UNA vez por intento de recarga, no por petición.

    Es lo que hace que un doble clic, o un reintento después de que se cayera la red, lleguen al
    MISMO traspaso en vez de abrir un segundo cobro. Generarla dentro del `onClick` serviría para
    el doble clic y para nada más.
  */
  const clave = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (open) {
      clave.current = crypto.randomUUID();
      setError(false);
    }
  }, [open]);

  if (!open) return null;

  const moneda = disponibilidad.data?.currencyCode ?? 'CRC';
  const simulado = disponibilidad.data?.provider === 'SIMULATED';
  const disponible = disponibilidad.data?.available === true;

  async function continuar(): Promise<void> {
    setError(false);
    try {
      const abierto = await iniciar.mutateAsync({ amountMinor: montoMinor, idempotencyKey: clave.current });
      /*
        Se NAVEGA a la dirección que dio el servidor; no se pide con `fetch`. Es una página de otro
        dominio en una instalación real, y pedirla desde acá no sólo no funcionaría: convertiría el
        traspaso alojado en un formulario nuestro, que es justo lo que se está evitando.

        Un traspaso alojado SIEMPRE sale a otro origen, y entonces hace falta una navegación del
        navegador. La única excepción es el simulador, que devuelve una dirección de esta misma
        aplicación: ahí se navega por dentro, porque una recarga completa de la página borraría la
        memoria del transporte simulado —el traspaso recién abierto incluido— y el ciudadano
        llegaría a una página que ya no sabe qué cobro es.
      */
      const destino = new URL(abierto.redirectUrl, window.location.origin);
      if (destino.origin === window.location.origin) {
        navigate(`${destino.pathname}${destino.search}`);
      } else {
        window.location.assign(destino.toString());
      }
    } catch {
      setError(true);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('citizen.topup.title')}
      closeLabel={t('citizen.topup.close')}
      variant="sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
        {simulado ? <Alert tone="warning">{t('citizen.topup.simulatedNotice')}</Alert> : null}

        {disponibilidad.isSuccess && !disponible ? (
          <Alert tone="info">{t('citizen.topup.unavailable')}</Alert>
        ) : (
          <>
            <RadioCardGroup
              name="topup-amount"
              legend={t('citizen.topup.amountLegend')}
              value={String(montoMinor)}
              onChange={(v) => setMontoMinor(Number(v))}
              options={MONTOS.map((minor) => ({
                value: String(minor),
                label: formatCurrencyMinor(minor, moneda, locale),
              }))}
            />
            {disponibilidad.data ? (
              <p className="lx-text-meta">
                {t('citizen.topup.range', {
                  min: formatCurrencyMinor(disponibilidad.data.minimumMinor, moneda, locale),
                  max: formatCurrencyMinor(disponibilidad.data.maximumMinor, moneda, locale),
                })}
              </p>
            ) : null}
            {error ? <Alert tone="danger">{t('citizen.topup.error')}</Alert> : null}
            <Button
              type="button"
              variant="primary"
              fullWidth
              loading={iniciar.isPending}
              disabled={!disponible || iniciar.isPending}
              onClick={() => void continuar()}
            >
              {iniciar.isPending ? t('citizen.topup.starting') : t('citizen.topup.continue')}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={onClose}>
              {t('citizen.topup.cancel')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
