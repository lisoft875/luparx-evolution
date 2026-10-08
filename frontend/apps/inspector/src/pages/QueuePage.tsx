import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Badge, Button, Card, EmptyState, IconCheck, Modal, SummaryList, SummaryRow } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useCitationQueue, useIsOnline } from '../lib/queries';
import { discardQueued, type QueuedCitationState } from '../lib/citationQueue';
import { codeMessage } from '../lib/apiErrors';
import { useAuth } from '@luparx/auth';

const STATE_KEYS: Record<QueuedCitationState, TranslationKey> = {
  PENDING: 'inspector.queue.state.pending',
  SENDING: 'inspector.queue.state.sending',
  FAILED: 'inspector.queue.state.failed',
  SENT: 'inspector.queue.state.sent',
};

const STATE_TONES: Record<QueuedCitationState, 'neutral' | 'warning' | 'danger' | 'success'> = {
  PENDING: 'warning',
  SENDING: 'neutral',
  FAILED: 'danger',
  SENT: 'success',
};

/**
 * What the device still owes the server.
 *
 * This screen exists because an officer needs to be able to answer "did that citation actually go
 * through?" without asking the office. Every row states which act it is, what state it is in, how
 * many times it has been tried and, when it failed, the server's own error code — not a shrug.
 *
 * The device identifier is shown, and the fact that resending never duplicates is stated in words,
 * because the alternative is an officer who is afraid to press retry and therefore does not.
 */
export function QueuePage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const { activeTenant } = useAuth();
  const queue = useCitationQueue();
  const online = useIsOnline();
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('inspector.queue.title')}</h1>

      {queue.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<IconCheck size={28} />} tone="success" title={t('inspector.queue.empty')} />
        </Card>
      ) : (
        <>
          <Alert tone="info">{t('inspector.queue.duplicateSafe')}</Alert>
          {/*
            Una fila compacta por boleta, no una ficha (08-10-2026, paso 7 de la especificación
            visual responsive: «listas compactas»).

            Antes cada boleta en cola era una tarjeta con cuatro filas de `SummaryList` —infracción,
            fecha, fotos pendientes y el identificador del aparato— más dos botones: unos 220px cada
            una. Con cinco pendientes eso son 1.100px de desplazamiento para contestar una pregunta
            que se contesta de un vistazo: ¿cuáles no salieron y cuál está trabada?

            No se pierde NADA. Lo que se lee de un vistazo queda arriba: placa, estado, infracción y
            hora. El error de la que está trabada sigue visible y a la vista, porque es lo único que
            pide una acción. Y el identificador del aparato —el valor que hace seguro reenviar y que
            se puede dictar a la oficina— sigue estando, en un desplegable: a un toque, no borrado.
          */}
          {queue.rows.map((row) => {
            const pendingPhotos = row.photos.filter((photo) => !photo.uploaded).length;
            return (
              <Card key={row.id} tone={row.state === 'SENT' ? 'success' : 'default'} className="lx-card--dense">
                <div className="lx-queue-item">
                  <div className="lx-queue-item__head">
                    <strong className="lx-queue-item__plate">{row.payload.plate}</strong>
                    <Badge tone={STATE_TONES[row.state]}>{t(STATE_KEYS[row.state])}</Badge>
                    {row.number ? <Badge tone="neutral">{row.number}</Badge> : null}
                    <span className="lx-queue-item__when">{formatDateTime(row.createdAt, locale)}</span>
                  </div>
                  <p className="lx-queue-item__meta">
                    {row.infractionName}
                    {' · '}
                    {tPlural('inspector.queue.attempts', row.attempts)}
                    {pendingPhotos > 0 ? ` · ${tPlural('inspector.queue.photosPending', pendingPhotos)}` : ''}
                  </p>
                  {/* El error se queda a la vista: es lo único de esta fila que pide una decisión. */}
                  {row.state === 'FAILED' && row.lastErrorCode ? (
                    <Alert tone="danger">{codeMessage(row.lastErrorCode, t)}</Alert>
                  ) : null}
                  <details className="lx-queue-item__more">
                    <summary>{t('inspector.queue.technical')}</summary>
                    <SummaryList>
                      <SummaryRow label={t('citation.field.occurredAt')} value={formatDateTime(row.createdAt, locale)} />
                      {/* Mostrado a propósito: es el valor que hace seguro un reenvío, y quien lo
                          puede leer lo puede dictar a la oficina. */}
                      <SummaryRow label={t('inspector.queue.deviceId')} value={row.deviceCitationId} />
                    </SummaryList>
                  </details>
                  {row.citationId || row.state !== 'SENT' ? (
                    <div className="lx-queue-item__actions">
                      {row.citationId ? (
                        <Button type="button" variant="secondary" onClick={() => navigate(`/citations/${row.citationId}`)}>
                          {t('inspector.cite.viewCitation')}
                        </Button>
                      ) : null}
                      {row.state !== 'SENT' ? (
                        <Button type="button" variant="ghost" onClick={() => setConfirmDiscard(row.id)}>
                          {t('inspector.queue.discard')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
          <Button
            type="button"
            fullWidth
            disabled={!online || queue.pending === 0}
            onClick={() => queue.retryAll()}
          >
            {t('inspector.queue.retryAll')}
          </Button>
          {!online ? <p className="lx-text-meta">{t('inspector.cite.queuedHint')}</p> : null}
        </>
      )}

      <Modal
        open={confirmDiscard !== null}
        onClose={() => setConfirmDiscard(null)}
        title={t('inspector.queue.discard')}
        closeLabel={t('common.close')}
        description={t('inspector.queue.discardConfirm')}
      >
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            fullWidth
            onClick={() => {
              if (confirmDiscard && activeTenant) void discardQueued(activeTenant.id, confirmDiscard);
              setConfirmDiscard(null);
            }}
          >
            {t('inspector.queue.discard')}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setConfirmDiscard(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </InspectorShell>
  );
}
