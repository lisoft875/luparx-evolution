import * as React from 'react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Badge, Button, Card, SectionHeader, Textarea } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { FINE_KEYS, useFine } from '../lib/queries';

const MAX_BODY = 4000;

/**
 * Writing a defence against a fine (CONTRACT.md v0.8, completed in v0.17).
 *
 * <h2>Why the notice is a whole screen and not a checkbox</h2>
 *
 * <p>What the citizen accepts is a <em>version</em>, not a tick: the request carries the id of the
 * notice that was on screen, and the server refuses any other. So the text has to be visible —
 * accepting wording nobody displayed is exactly the thing this mechanism exists to make
 * impossible — and a stale tab is answered with `APPEAL_NOTICE_OUTDATED` and the new text, rather
 * than with a filing against a notice that is no longer in force.</p>
 *
 * <h2>Text first, photographs after</h2>
 *
 * <p>The defence exists the moment the words are saved. Images are attached afterwards, one call
 * each, and a failure there loses a photograph and not the case — which is the only acceptable
 * failure mode for someone filing from a phone on municipal wifi.</p>
 *
 * <p>Once filed, this screen becomes the place to read the defence and, later, the municipality's
 * reason. There is no editing: a document somebody is going to be judged on cannot change after it
 * was submitted.</p>
 */
export function FineAppealPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const fineQuery = useFine(id);
  const noticeQuery = useQuery({
    queryKey: ['citizen', 'appeal-notice'],
    queryFn: () => apiClient.citizenFines.appealNotice(),
    // Never cached, here as on the server: a municipality whose lawyer corrects the wording must
    // not have citizens accepting yesterday's from a cache.
    gcTime: 0,
    staleTime: 0,
  });

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachMutation = useMutation({
    mutationFn: (file: File) => apiClient.citizenFines.attachAppealImage(id as string, file, file.name),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: FINE_KEYS.detail(id ?? '') });
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      setError(
        t(
          code === 'APPEAL_IMAGE_LIMIT'
            ? 'citizen.appeal.error.imageLimit'
            : code === 'EVIDENCE_TOO_LARGE'
              ? 'citizen.appeal.error.imageTooLarge'
              : 'citizen.appeal.error.imageFailed',
        ),
      );
    },
  });

  const fileMutation = useMutation({
    mutationFn: () =>
      apiClient.citizenFines.fileAppeal(id as string, {
        body: body.trim(),
        acceptedNoticeId: noticeQuery.data?.id as string,
      }),
    onSuccess: () => {
      setError(null);
      setBody('');
      void queryClient.invalidateQueries({ queryKey: FINE_KEYS.detail(id ?? '') });
      void queryClient.invalidateQueries({ queryKey: FINE_KEYS.all });
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string })?.code;
      if (code === 'APPEAL_NOTICE_OUTDATED') {
        // The wording changed while they were writing. Re-fetch it and say so — the text they are
        // about to accept must be the text they can see.
        void noticeQuery.refetch();
        setError(t('citizen.appeal.error.noticeOutdated'));
        return;
      }
      setError(t(code === 'APPEAL_ALREADY_FILED' ? 'citizen.appeal.error.alreadyFiled' : 'citizen.appeal.error.generic'));
    },
  });

  return (
    <CitizenShell title={t('citizen.appeal.title')} onBack={() => navigate(`/fines/${id}`)}>
      <QueryBoundary query={fineQuery} errorTitle={t('citizen.appeal.title')}>
        {(detail) => {
          const appeal = detail.appeal;

          // Already filed: this screen is now where it is read, and where the answer arrives.
          if (appeal) {
            const resolved = appeal.status !== 'SUBMITTED';
            return (
              <>
                <Card>
                  <SectionHeader
                    title={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                        <span>{t('citizen.appeal.filed.title')}</span>
                        <Badge tone={appeal.status === 'ACCEPTED' ? 'success' : resolved ? 'danger' : 'warning'}>
                          {t(`appeal.status.${appeal.status.toLowerCase()}` as TranslationKey)}
                        </Badge>
                      </span>
                    }
                    description={t('citizen.appeal.filed.submittedAt', {
                      date: formatDateTime(appeal.submittedAt, locale),
                    })}
                  />
                  <p className="lx-text-body" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {appeal.body}
                  </p>
                </Card>

                {resolved ? (
                  <Card>
                    <SectionHeader
                      title={t('citizen.appeal.decision.title')}
                      description={
                        appeal.resolvedAt ? formatDateTime(appeal.resolvedAt, locale) : undefined
                      }
                    />
                    <Alert tone={appeal.status === 'ACCEPTED' ? 'success' : 'warning'}>
                      {t(appeal.status === 'ACCEPTED' ? 'citizen.appeal.decision.accepted' : 'citizen.appeal.decision.rejected')}
                    </Alert>
                    {/* The reason, verbatim. It is the part the citizen is entitled to, and the
                        part a court would ask for. */}
                    <p className="lx-text-body" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                      {appeal.resolutionReason}
                    </p>
                  </Card>
                ) : (
                  <>
                    <Alert tone="info">{t('citizen.appeal.waiting')}</Alert>
                    {/* Photographs are attached after the words are safe, and only while the case
                        is open: adding evidence to something already decided would be editing
                        history. The count is the municipality's, read from the defence itself. */}
                    <Card>
                      <SectionHeader
                        title={t('citizen.appeal.images.title')}
                        description={t('citizen.appeal.images.count', {
                          used: appeal.images.length,
                          max: appeal.maxImages,
                        })}
                      />
                      {appeal.images.length > 0 ? (
                        <ul className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-3) 0', paddingLeft: 18 }}>
                          {appeal.images.map((image, index) => (
                            <li key={image.id}>
                              {t('citizen.appeal.images.item', {
                                number: index + 1,
                                date: formatDateTime(image.createdAt, locale),
                              })}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {error ? <Alert tone="danger">{error}</Alert> : null}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) attachMutation.mutate(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth
                        loading={attachMutation.isPending}
                        disabled={appeal.images.length >= appeal.maxImages}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('citizen.appeal.images.add')}
                      </Button>
                    </Card>
                  </>
                )}
              </>
            );
          }

          if (!detail.fine.appealable) {
            return <Alert tone="warning">{t('citizen.appeal.notAppealable')}</Alert>;
          }

          const notice = noticeQuery.data;
          const canSubmit = body.trim().length > 0 && notice !== undefined && !fileMutation.isPending;

          return (
            <>
              <Card>
                <SectionHeader
                  title={t('citizen.appeal.notice.title')}
                  description={
                    notice
                      ? t('citizen.appeal.notice.version', {
                          version: notice.version,
                          date: formatDateTime(notice.effectiveFrom, locale),
                        })
                      : undefined
                  }
                />
                {noticeQuery.isLoading ? (
                  <p className="lx-text-meta" style={{ margin: 0 }}>
                    {t('common.loading')}
                  </p>
                ) : notice ? (
                  <p className="lx-text-body" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {notice.body}
                  </p>
                ) : (
                  <Alert tone="danger">{t('citizen.appeal.error.noticeUnavailable')}</Alert>
                )}
              </Card>

              <Card>
                <SectionHeader
                  title={t('citizen.appeal.write.title')}
                  description={t('citizen.appeal.write.description')}
                />
                <Textarea
                  aria-label={t('citizen.appeal.write.label')}
                  placeholder={t('citizen.appeal.write.placeholder')}
                  rows={8}
                  maxLength={MAX_BODY}
                  showCount
                  countLabel={t('citizen.appeal.write.count', { used: body.length, max: MAX_BODY })}
                  value={body}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                />
                {error ? <Alert tone="danger">{error}</Alert> : null}
                {/* The sentence under the button, not a dialog after it: what accepting means has
                    to be readable while deciding, not confirmed once it is too late to read. */}
                <p className="lx-text-meta">{t('citizen.appeal.acceptNotice')}</p>
                <Button
                  type="button"
                  fullWidth
                  loading={fileMutation.isPending}
                  disabled={!canSubmit}
                  onClick={() => fileMutation.mutate()}
                >
                  {t('citizen.appeal.submit')}
                </Button>
              </Card>
            </>
          );
        }}
      </QueryBoundary>
    </CitizenShell>
  );
}
