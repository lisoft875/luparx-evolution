import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { AuditChange } from '@luparx/api-client';
import { Alert, Badge, Card, Input, Pagination, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/**
 * The audit trail (CONTRACT.md §7, v0.32).
 *
 * <p>Two things changed in v0.32 and both are on this screen. Every entry now carries <b>what
 * changed, field by field</b> — "the policy was updated" is not auditable, "sessionMaxMinutes 480 →
 * 120, by Carlos, on Tuesday" is. And the trail carries a <b>chain</b>, so that "an administrator
 * must not be able to delete this silently" is something anybody can check rather than something the
 * platform asserts about itself.</p>
 *
 * <p>The chain is stated at the top, in words, before the table. Somebody who opens this screen in
 * front of an auditor should be able to point at one line.</p>
 */
export function AuditPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['admin', 'audit-events', { action, page }],
    queryFn: () => apiClient.adminAudit.list({ action: action || undefined, page, size: PAGE_SIZE }),
  });
  const chainQuery = useQuery({
    queryKey: ['admin', 'audit-events', 'chain'],
    queryFn: () => apiClient.adminAudit.chain(),
  });
  const data = query.data;
  const chain = chainQuery.data;

  return (
    <AdminShell>
      <h1>{t('admin.audit.title')}</h1>

      {/* --- the chain, said before anything else ------------------------------------------------ */}
      <Card>
        <SectionHeader
          title={t('admin.audit.chain.title')}
          description={t('admin.audit.chain.description')}
        />
        {chain ? (
          <>
            <Alert tone={chain.intact ? 'success' : 'danger'}>
              {chain.intact
                ? t('admin.audit.chain.intact', {
                    entries: chain.entryCount,
                    seals: chain.sealCount,
                  })
                : t('admin.audit.chain.broken', { problems: chain.problems.length })}
            </Alert>
            {/* Not a verdict on its own: entries newer than this are protected by the database but
                not yet covered by a seal, and saying so is what stops the green badge being read as
                "everything ever written is proven". */}
            <p className="lx-text-meta">
              {chain.sealedThrough
                ? t('admin.audit.chain.sealedThrough', {
                    date: formatDateTime(chain.sealedThrough, locale),
                  })
                : t('admin.audit.chain.notSealedYet')}
            </p>
            {chain.problems.map((problem) => (
              <p key={`${problem.seq}-${problem.kind}`} className="lx-text-meta">
                <strong>#{problem.seq}</strong> · {t(`admin.audit.chain.problem.${problem.kind}` as TranslationKey)}{' '}
                · {problem.detail}
              </p>
            ))}
            {chain.recentSeals.length > 0 ? (
              <p className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t('admin.audit.chain.lastSeal', {
                  seq: chain.recentSeals[0]!.seq,
                  digest: chain.recentSeals[0]!.digest.slice(0, 16),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="lx-text-meta">{t('common.loading')}</p>
        )}
      </Card>

      <Input
        placeholder={t('admin.audit.filter.action')}
        value={action}
        onChange={(e) => {
          setPage(0);
          setAction(e.target.value);
        }}
        aria-label={t('admin.audit.filter.action')}
        style={{ margin: '16px 0' }}
      />
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.audit.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          { key: 'actor', header: t('admin.audit.column.actor'), render: (row) => row.actorUserId },
          { key: 'action', header: t('admin.audit.column.action'), render: (row) => row.action },
          {
            key: 'resource',
            header: t('admin.audit.column.resource'),
            render: (row) => `${row.resourceType}/${row.resourceId}`,
          },
          {
            key: 'changes',
            header: t('admin.audit.column.changes'),
            // The column this version exists for. An action with nothing in it is not a gap: most
            // audited acts create or read something rather than altering a value.
            render: (row) =>
              (row.changes ?? []).length === 0 ? (
                <span className="lx-text-meta">—</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(row.changes ?? []).map((change) => (
                    <ChangeLine key={change.field} change={change} maskedLabel={t('admin.audit.masked')} />
                  ))}
                </div>
              ),
          },
          {
            key: 'occurredAt',
            header: t('admin.audit.column.occurredAt'),
            render: (row) => formatDateTime(row.occurredAt, locale),
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
    </AdminShell>
  );
}

/**
 * One changed field, as "name: before → after".
 *
 * <p>An empty value is written as an em dash rather than left blank: "→" with nothing after it reads
 * as a rendering failure, and it means the field was cleared — which is often the change that
 * matters.</p>
 */
function ChangeLine({ change, maskedLabel }: { change: AuditChange; maskedLabel: string }): React.JSX.Element {
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      <strong>{change.field}</strong>: {change.oldValue ?? '—'} → {change.newValue ?? '—'}{' '}
      {/* Without this a reader takes a masked value for the address itself. */}
      {change.masked ? <Badge tone="neutral">{maskedLabel}</Badge> : null}
    </span>
  );
}
