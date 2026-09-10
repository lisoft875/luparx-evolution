import * as React from 'react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CitationFacts, CitationHistory, EvidenceGallery } from '@luparx/features';
import { useAuth, usePermissions } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Card, FormField, Modal, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useCancelCitation, useEnforcementCitation } from '../lib/queries';

/**
 * One citation, everything about it, and the single thing that can be done to it.
 *
 * There is no edit and no delete on this screen because there is none in the API: an issued
 * citation is annulled with a reason and nothing else (CONTRACT.md v0.7). The reason is mandatory
 * in the dialog for the same reason it is mandatory on the server — it lands on the act, in its
 * history, and in front of the person who was fined.
 *
 * The annul button is gated on `CITATION_VOID`, which finance and support do not hold. That is not
 * decoration: the officer who wrote a citation is not the person who should be able to erase it,
 * and hiding the control from someone the server will refuse anyway is the difference between a
 * clear screen and a mysterious 403.
 */
export function EnforcementCitationDetailPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const permissions = usePermissions();
  const query = useEnforcementCitation(id);
  const cancelMutation = useCancelCitation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadEvidence = useCallback(
    (evidenceId: string) => apiClient.adminEnforcement.evidenceContent(id as string, evidenceId),
    [apiClient, id],
  );

  const citation = query.data?.citation;
  // The transition table lives on the server; these are the states it accepts CANCELLED from.
  const cancellable =
    citation !== undefined &&
    // A mirrored citation is not annulled here whatever state it is in: the act lives in the other
    // system and annulling our copy would leave the municipality holding two answers (v0.34).
    citation.managedHere !== false &&
    ['DRAFT', 'ISSUED', 'APPEALED', 'UPHELD', 'EXPIRED'].includes(citation.status);

  async function confirmCancel(): Promise<void> {
    if (reason.trim().length === 0) {
      setReasonError(t('admin.enforcement.citation.cancel.required'));
      return;
    }
    setReasonError(null);
    try {
      await cancelMutation.mutateAsync({ id: id as string, reason: reason.trim() });
      setDialogOpen(false);
      setDone(true);
      setReason('');
    } catch {
      setReasonError(t('common.error.generic'));
    }
  }

  return (
    <AdminShell>
      <Button type="button" variant="ghost" onClick={() => navigate('/enforcement/citations')}>
        {t('admin.enforcement.citation.back')}
      </Button>
      {query.isError ? (
        <Alert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}>
            <span>{t('common.error.generic')}</span>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : query.isLoading || !query.data || !citation ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <h1>{t('admin.enforcement.citation.title', { number: citation.number ?? '—' })}</h1>
          {done ? <Alert tone="success">{t('admin.enforcement.citation.cancel.done')}</Alert> : null}
          <CitationFacts citation={citation} showInternal />
          <EvidenceGallery evidence={query.data.evidence} loadContent={loadEvidence} />
          <CitationHistory events={query.data.history} />

          <Card>
            <SectionHeader title={t('admin.enforcement.citation.cancel')} />
            {!permissions.has('CITATION_VOID') ? (
              <Alert tone="info">{t('admin.enforcement.citation.noVoidPermission')}</Alert>
            ) : citation.managedHere === false ? (
              // Its own sentence, not the generic "cannot be annulled in this state": the reason is
              // not the state, and telling somebody the wrong reason sends them to the wrong place.
              <Alert tone="info">{t('admin.enforcement.citation.notManagedHere')}</Alert>
            ) : !cancellable ? (
              <Alert tone="info">{t('admin.enforcement.citation.notCancellable')}</Alert>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(true)}>
                {t('admin.enforcement.citation.cancel')}
              </Button>
            )}
          </Card>
        </>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t('admin.enforcement.citation.cancel.title')}
        closeLabel={t('common.close')}
        description={t('admin.enforcement.citation.cancel.reasonHint')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <FormField label={t('admin.enforcement.citation.cancel.reason')} error={reasonError ?? undefined}>
            {({ inputId, describedBy }) => (
              <textarea
                id={inputId}
                aria-describedby={describedBy}
                className="lx-input"
                name="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  // The complaint was "this is empty"; it stops being true the moment they type.
                  if (reasonError) setReasonError(null);
                }}
                maxLength={500}
                rows={3}
                style={{ resize: 'vertical', minHeight: 88 }}
              />
            )}
          </FormField>
          <Button type="button" onClick={() => void confirmCancel()} loading={cancelMutation.isPending}>
            {t('admin.enforcement.citation.cancel.confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </AdminShell>
  );
}
