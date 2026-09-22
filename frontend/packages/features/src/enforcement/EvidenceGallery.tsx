import * as React from 'react';
import { useEffect, useState } from 'react';
import type { CitationEvidence } from '@luparx/api-client';
import { formatDateTime, formatNumber, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Card, EmptyState, IconEye, SectionHeader } from '@luparx/ui';
import { evidenceKindKey, formatBytes } from './labels';

export interface EvidenceGalleryProps {
  evidence: readonly CitationEvidence[];
  /**
   * Fetches the bytes of one photograph. Supplied by the portal, because the three of them read
   * evidence through three different, separately authorised routes and this component must not be
   * the place that decides which.
   */
  loadContent: (evidenceId: string) => Promise<Blob>;
  /**
   * `true` cuando la boleta SÍ tiene pruebas pero esta persona no puede verlas.
   *
   * Sin esto la pantalla se contradecía: «Esta boleta no tiene pruebas adjuntas» arriba y «Prueba
   * adjuntada» en el historial, que son dos fuentes de datos independientes (auditoría del
   * 22-09-2026, P0). Y la contradicción es REAL, no un error de datos: desde que la boleta de una
   * placa compartida se ve desde varias cuentas, quien no tiene el vehículo vinculado recibe
   * `evidence: []` a propósito, mientras el historial sigue contando lo que pasó.
   *
   * Decirlo en voz alta es mejor que las dos alternativas: esconder el historial sería ocultarle a
   * la persona lo que le hicieron a su boleta, y dejar la contradicción enseña a no leer la
   * pantalla.
   */
  evidenceWithheld?: boolean;
  timeZone?: string;
}

/**
 * The evidence behind a citation: what it is, when it was taken, and the digest that proves months
 * later that the photograph is the one the officer took.
 *
 * Photographs are fetched through the API client and shown from an object URL, never as a bare
 * `<img src>` pointing at the endpoint: those bytes are served with `Cache-Control: no-store`
 * behind a bearer token, and a plain `src` would be an unauthenticated request that renders as a
 * broken image. Every URL created here is revoked when the component unmounts.
 */
export function EvidenceGallery({ evidence, loadContent, evidenceWithheld, timeZone }: EvidenceGalleryProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const photos = evidence.filter((item) => item.kind === 'PHOTO');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      for (const photo of photos) {
        try {
          const blob = await loadContent(photo.id);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((current) => ({ ...current, [photo.id]: url }));
        } catch {
          if (!cancelled) setFailed((current) => ({ ...current, [photo.id]: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // `photos` is derived per render; the identity that matters is which evidence ids are present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence.map((item) => item.id).join(','), loadContent]);

  return (
    <Card>
      <SectionHeader title={t('citation.evidence.title')} />
      {evidence.length === 0 ? (
        <EmptyState
          title={t(evidenceWithheld ? 'citation.evidence.withheld' : 'citation.evidence.empty')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          {evidence.map((item) => (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                <Badge tone="neutral" icon={<IconEye size={14} />}>
                  {t(evidenceKindKey(item.kind))}
                </Badge>
                <span className="lx-text-meta">
                  {formatDateTime(item.capturedAt ?? item.createdAt, locale, timeZone ? { timeZone } : undefined)}
                </span>
              </div>
              {item.kind === 'NOTE' ? (
                <p className="lx-text-body" style={{ margin: 0 }}>
                  {item.note}
                </p>
              ) : failed[item.id] ? (
                <Alert tone="danger">{t('citation.evidence.loadError')}</Alert>
              ) : urls[item.id] ? (
                <img
                  src={urls[item.id]}
                  alt={`${t('citation.evidence.photo')} — ${item.sha256?.slice(0, 12) ?? item.id}`}
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    borderRadius: 'var(--lx-radius-md)',
                    border: '1px solid var(--lx-border)',
                  }}
                />
              ) : (
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t('common.loading')}
                </p>
              )}
              {item.kind === 'PHOTO' ? (
                <dl
                  style={{
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: 'var(--lx-space-3)',
                    rowGap: 'var(--lx-space-1)',
                  }}
                >
                  {item.byteSize != null ? (
                    <>
                      <dt className="lx-text-meta">{t('citation.evidence.size')}</dt>
                      <dd className="lx-text-meta" style={{ margin: 0 }}>
                        {formatBytes(item.byteSize, (value) => formatNumber(value, locale))}
                      </dd>
                    </>
                  ) : null}
                  {item.sha256 ? (
                    <>
                      <dt className="lx-text-meta">{t('citation.evidence.digest')}</dt>
                      {/* The digest is the point of the metadata: it is what distinguishes "the
                          photograph the officer took" from "a photograph somebody added later", so
                          it is shown in full rather than truncated into something unverifiable. */}
                      <dd
                        className="lx-text-meta"
                        style={{ margin: 0, fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }}
                      >
                        {item.sha256}
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
