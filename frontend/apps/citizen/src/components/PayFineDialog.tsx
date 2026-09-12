import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import { Alert, Button, Modal } from '@luparx/ui';
import type { Fine, FinePaymentResponse } from '@luparx/api-client';
import { usePayFine, useWallet } from '../lib/queries';
import { finePaymentErrorMessage, isInsufficientBalance } from '../lib/apiErrors';

export interface PayFineDialogProps {
  open: boolean;
  onClose: () => void;
  fine: Fine;
  /** True while a claim on this fine is still waiting for the municipality. */
  appealWaiting: boolean;
  /** Called with the server's answer once the money has actually moved. */
  onPaid: (result: FinePaymentResponse) => void;
}

/**
 * "¿Pagar esta multa?" — the one screen between a citizen and an irreversible movement of their own
 * money (CONTRACT.md v0.41).
 *
 * <h2>What it has to say before the button</h2>
 *
 * <p>Three facts, in this order: <b>how much</b> leaves the wallet, <b>what is left</b> afterwards,
 * and — when there is one — that paying <b>closes the claim</b>. The third is the reason this dialog
 * exists at all. The rule the municipality chose is that paying withdraws a waiting claim, and a
 * citizen who learns that from a history row the next day was not asked, they were processed.</p>
 *
 * <p>The amount shown is the server's {@code amountPayableMinor}, never a figure computed here, and
 * the request carries no amount at all. While the early-payment window is open that number is the
 * reduced one, so the dialog also says what it rises to and when: somebody about to spend the last
 * of their balance is entitled to know they are buying the discount.</p>
 *
 * <h2>Not enough balance</h2>
 *
 * <p>Refused, with the way out attached (ADR 0025): no partial payment — half a fine paid is a fine
 * unpaid with the money gone — and no card detour from here. The dialog turns into a "Recargar
 * saldo" exit to the wallet. The check is made twice on purpose: here against the balance the
 * screen already holds, so the citizen is told before they press, and on the server, which is the
 * only authority on what the balance is by the time the request lands. A wallet in another currency
 * is not compared at all — only the server can say what that means, so the button stays live and the
 * refusal, if there is one, comes from it.</p>
 */
export function PayFineDialog({
  open,
  onClose,
  fine,
  appealWaiting,
  onPaid,
}: PayFineDialogProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const wallet = useWallet();
  const pay = usePayFine(fine.id);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);

  const amountMinor = fine.amountPayableMinor;
  const amount = formatCurrencyMinor(amountMinor, fine.currencyCode, locale);

  // Only a wallet in the same currency can be compared with the fine. A different one is not
  // "insufficient", it is a question this screen cannot answer, and pretending otherwise would
  // block a payment the server might well accept.
  const comparable = wallet.data && wallet.data.currencyCode === fine.currencyCode ? wallet.data : null;
  const shortBefore = comparable !== null && comparable.balanceMinor < amountMinor;
  const short = shortBefore || refused;
  const balanceAfter = comparable && !shortBefore ? comparable.balanceMinor - amountMinor : null;

  const discounted = fine.discountUntil !== null && amountMinor < fine.fineMinor;

  function close(): void {
    setError(null);
    setRefused(false);
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      const result = await pay.mutateAsync();
      setRefused(false);
      onPaid(result);
    } catch (err) {
      // An insufficient balance is not an error message, it is a different offer: the dialog stops
      // asking for a confirmation nobody can give and offers the top-up instead.
      setRefused(isInsufficientBalance(err));
      setError(finePaymentErrorMessage(err, t));
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('citizen.fines.pay.confirmTitle')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <p className="lx-text-body" style={{ margin: 0 }}>
          {t('citizen.fines.pay.amount', { amount })}
        </p>

        {discounted && fine.discountUntil ? (
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('citizen.fines.pay.discountNotice', {
              date: formatDateTime(fine.discountUntil, locale),
              full: formatCurrencyMinor(fine.fineMinor, fine.currencyCode, locale),
            })}
          </p>
        ) : null}

        {balanceAfter !== null ? (
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('citizen.fines.pay.balanceAfter', {
              amount: formatCurrencyMinor(balanceAfter, fine.currencyCode, locale),
            })}
          </p>
        ) : null}

        {/* The warning, not a footnote: it is what the citizen gives up by pressing the button, and
            the only part of this dialog that paying again cannot undo. */}
        {appealWaiting ? <Alert tone="warning">{t('citizen.fines.pay.withdrawsAppeal')}</Alert> : null}

        {short ? (
          <>
            {/* When the refusal came from the server it is already stated above; repeating it here
                would tell the citizen the same thing twice in two boxes. */}
            {refused ? null : <Alert tone="danger">{t('citizen.fines.pay.error.INSUFFICIENT_BALANCE')}</Alert>}
            <div className="lx-dialog-actions">
              <Button type="button" variant="secondary" fullWidth onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/wallet')}>
                {t('citizen.fines.pay.topUp')}
              </Button>
            </div>
          </>
        ) : (
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" fullWidth loading={pay.isPending} onClick={handleSubmit}>
              {t('citizen.fines.pay.submit')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
