import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { AppealStatus, CitationAppeal } from '@luparx/api-client';
import { Alert, Badge, Button, Card, Modal, Pagination, Select, Table, Textarea } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

const STATUS_TONE: Record<AppealStatus, 'warning' | 'success' | 'danger'> = {
  SUBMITTED: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
};

/**
 * The moderation queue for defences (CONTRACT.md v0.17).
 *
 * <p>This screen is the answer to a promise the platform has been making since v0.8: a citizen can
 * file a defence against a citation, and until now there was nowhere for the municipality to read it.
 * An appeal with nobody at the other end is worse than no appeal at all.</p>
 *
 * <p><b>Oldest first</b>, which is the server's order and not a preference: a queue sorted
 * newest-first is one where the oldest case is never reached.</p>
 *
 * <p>Resolving is one decision with two outcomes — accept and the citation is void, reject and it
 * stands — so it is one dialog with two buttons, not two flows. The reason is mandatory either way,
 * and the dialog says where it goes: to the citizen, and to the citation's own history.</p>
 */
export function AppealsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<AppealStatus | 'ALL'>('SUBMITTED');
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState<CitationAppeal | null>(null);
  const [deciding, setDeciding] = useState<{ appeal: CitationAppeal; accept: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'appeals', { status, page }],
    queryFn: () => apiClient.adminEnforcement.appeals({ status, page, size: PAGE_SIZE }),
  });

  const resolveMutation = useMutation({
    mutationFn: (decision: { appeal: CitationAppeal; accept: boolean }) =>
      apiClient.adminEnforcement.resolveAppeal(decision.appeal.citationId, {
        accept: decision.accept,
        reason: reason.trim(),
      }),
    onSuccess: (_result, decision) => {
      setDeciding(null);
      setReading(null);
      setReason('');
      setError(null);
      setFeedback(t(decision.accept ? 'admin.appeals.accepted' : 'admin.appeals.rejected'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'citations'] });
    },
    onError: () => {
      setFeedback(null);
      setError(t('admin.appeals.error'));
    },
  });

  const data = query.data;

  return (
    <AdminShell>
      <h1>{t('admin.appeals.title')}</h1>
      <p className="lx-text-meta">{t('admin.appeals.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ maxWidth: 280, margin: '12px 0' }}>
        <Select
          aria-label={t('admin.appeals.filter.status')}
          value={status}
          onChange={(value) => {
            setPage(0);
            setStatus(value as AppealStatus | 'ALL');
          }}
          options={[
            { value: 'SUBMITTED', label: t('admin.appeals.status.SUBMITTED') },
            { value: 'ACCEPTED', label: t('admin.appeals.status.ACCEPTED') },
            { value: 'REJECTED', label: t('admin.appeals.status.REJECTED') },
            { value: 'ALL', label: t('admin.appeals.filter.all') },
          ]}
        />
      </div>

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t(status === 'SUBMITTED' ? 'admin.appeals.emptyQueue' : 'admin.appeals.empty')}
        rows={data?.items ?? []}
        rowKey={(appeal) => appeal.id}
        columns={[
          {
            key: 'filed',
            header: t('admin.appeals.column.filed'),
            render: (appeal) => (
              <>
                <div>{formatDateTime(appeal.submittedAt, locale)}</div>
                <div className="lx-text-meta">
                  {t('admin.appeals.noticeVersion', { version: appeal.noticeVersion })}
                </div>
              </>
            ),
          },
          {
            key: 'body',
            header: t('admin.appeals.column.body'),
            // Truncated here and read whole in the dialog: a queue is for triage, and a cell holding
            // a thousand characters is a queue nobody can scan. Two lines and a hard width, because
            // a single 140-character line is wider than the table and pushes the status and the
            // actions — the two columns triage actually needs — off the right edge.
            render: (appeal) => (
              <span className="lx-text-body lx-table-cell-clamp">{appeal.body}</span>
            ),
          },
          {
            key: 'images',
            header: t('admin.appeals.column.images'),
            render: (appeal) => appeal.images.length,
          },
          {
            key: 'status',
            header: t('admin.zones.column.status'),
            render: (appeal) => (
              <>
                <Badge tone={STATUS_TONE[appeal.status]}>
                  {t(`admin.appeals.status.${appeal.status}` as TranslationKey)}
                </Badge>
                {appeal.resolutionReason ? (
                  <div className="lx-text-meta">{appeal.resolutionReason}</div>
                ) : null}
              </>
            ),
          },
          {
            key: 'actions',
            header: t('admin.staff.column.actions'),
            render: (appeal) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => setReading(appeal)}>
                  {t('admin.appeals.action.read')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(`/enforcement/citations/${appeal.citationId}`)}
                >
                  {t('admin.appeals.action.citation')}
                </Button>
              </div>
            ),
          },
        ]}
      />
      {data ? (
        <Pagination
          page={data.page}
          size={data.size}
          totalPages={data.totalPages}
          totalElements={data.totalElements}
          onPageChange={setPage}
          previousLabel={t('pagination.previous')}
          nextLabel={t('pagination.next')}
          pageLabel={t('pagination.page')}
          ofLabel={t('pagination.of')}
          resultCountLabel={t('pagination.resultCount.other', { count: data.totalElements })}
        />
      ) : null}

      {/* Reading the whole defence, with its photographs. The decision lives here rather than in the
          list, because deciding without having read the thing is exactly what a row of buttons in a
          table invites. */}
      <Modal
        open={reading !== null}
        onClose={() => setReading(null)}
        title={t('admin.appeals.read.title')}
        closeLabel={t('common.close')}
      >
        {reading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {formatDateTime(reading.submittedAt, locale)} ·{' '}
              {t('admin.appeals.noticeVersion', { version: reading.noticeVersion })}
            </p>
            <Card nested>
              <p className="lx-text-body" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {reading.body}
              </p>
            </Card>

            {reading.images.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {reading.images.map((image) => (
                  <a
                    key={image.id}
                    href={image.contentUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="lx-text-body"
                  >
                    {t('admin.appeals.image')}
                  </a>
                ))}
              </div>
            ) : (
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('admin.appeals.noImages')}
              </p>
            )}

            {reading.status === 'SUBMITTED' ? (
              <RequirePermission permission="CITATION_VOID">
                <div className="lx-dialog-actions">
                  <Button
                    type="button"
                    variant="danger"
                    fullWidth
                    onClick={() => {
                      setReason('');
                      setDeciding({ appeal: reading, accept: false });
                    }}
                  >
                    {t('admin.appeals.action.reject')}
                  </Button>
                  <Button
                    type="button"
                    fullWidth
                    onClick={() => {
                      setReason('');
                      setDeciding({ appeal: reading, accept: true });
                    }}
                  >
                    {t('admin.appeals.action.accept')}
                  </Button>
                </div>
              </RequirePermission>
            ) : (
              <Alert tone="info">
                {t('admin.appeals.alreadyResolved', {
                  outcome: t(`admin.appeals.status.${reading.status}` as TranslationKey),
                  date: reading.resolvedAt ? formatDateTime(reading.resolvedAt, locale) : '',
                })}
              </Alert>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={t(deciding?.accept ? 'admin.appeals.accept.title' : 'admin.appeals.reject.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t(deciding?.accept ? 'admin.appeals.accept.body' : 'admin.appeals.reject.body')}
          </p>
          {/* The reason is mandatory in both directions, and the sentence says why: the citizen
              reads it, and so does whoever audits the municipality months later. */}
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.appeals.reasonNotice')}
          </p>
          <Textarea
            aria-label={t('admin.appeals.reasonLabel')}
            placeholder={t('admin.appeals.reasonPlaceholder')}
            maxLength={1000}
            rows={5}
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
          />
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setDeciding(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant={deciding?.accept ? 'solid' : 'danger'}
              fullWidth
              loading={resolveMutation.isPending}
              disabled={reason.trim().length === 0}
              onClick={() => deciding && resolveMutation.mutate(deciding)}
            >
              {t(deciding?.accept ? 'admin.appeals.action.accept' : 'admin.appeals.action.reject')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
