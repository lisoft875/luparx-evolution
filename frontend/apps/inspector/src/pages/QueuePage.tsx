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
          {queue.rows.map((row) => {
            const pendingPhotos = row.photos.filter((photo) => !photo.uploaded).length;
            return (
              <Card key={row.id} tone={row.state === 'SENT' ? 'success' : 'default'}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <strong className="lx-text-card-title tabular-nums">
                    {row.payload.plate}
                  </strong>
                  <Badge tone={STATE_TONES[row.state]}>{t(STATE_KEYS[row.state])}</Badge>
                  {row.number ? <Badge tone="neutral">{row.number}</Badge> : null}
                  <span className="lx-text-meta">{tPlural('inspector.queue.attempts', row.attempts)}</span>
                </div>
                <SummaryList>
                  <SummaryRow label={t('citation.field.infraction')} value={row.infractionName} />
                  <SummaryRow label={t('citation.field.occurredAt')} value={formatDateTime(row.createdAt, locale)} />
                  {pendingPhotos > 0 ? (
                    <SummaryRow
                      label={t('citation.evidence.title')}
                      value={tPlural('inspector.queue.photosPending', pendingPhotos)}
                    />
                  ) : null}
                  {/* Shown deliberately: this is the value that makes a resend safe, and an officer
                      who can read it can also quote it to the office. */}
                  <SummaryRow label={t('inspector.queue.deviceId')} value={row.deviceCitationId} />
                </SummaryList>
                {row.state === 'FAILED' && row.lastErrorCode ? (
                  <Alert tone="danger">{codeMessage(row.lastErrorCode, t)}</Alert>
                ) : null}
                <div className="flex gap-3 mt-3">
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
