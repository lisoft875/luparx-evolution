import * as React from 'react';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CitationFacts, CitationHistory, EvidenceGallery } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useCitation } from '../lib/queries';
import { apiErrorMessage } from '../lib/apiErrors';

/**
 * One of the officer's own citations, with its evidence and its history.
 *
 * The officer reads the same history the administration and the citizen read — there is only one
 * account of what happened to an act — and the internal facts they are entitled to (the device
 * clock offset in particular, which is what a defence is built out of) are shown here and nowhere
 * in the citizen's app.
 */
export function CitationDetailPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const query = useCitation(id);

  const loadEvidence = useCallback(
    (evidenceId: string) => apiClient.inspectorEnforcement.evidenceContent(id as string, evidenceId),
    [apiClient, id],
  );

  return (
    <InspectorShell title={t('inspector.citations.detail.title')} onBack={() => navigate('/citations')}>
      {query.isError ? (
        <Alert tone="danger">
          <div className="flex flex-col items-start gap-2">
            <span>{apiErrorMessage(query.error, t)}</span>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : query.isLoading || !query.data ? (
        <p className="lx-text-meta">{t('common.loading')}</p>
      ) : (
        <>
          <CitationFacts citation={query.data.citation} showInternal />
          <EvidenceGallery evidence={query.data.evidence} loadContent={loadEvidence} />
          <CitationHistory events={query.data.history} />
        </>
      )}
    </InspectorShell>
  );
}
