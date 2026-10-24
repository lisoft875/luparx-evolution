import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import { CameraCaptureModal, soporteDeCamara } from '@luparx/features';
import { Alert, Badge, Button, Card, SectionHeader, Textarea } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { FINE_KEYS, useFine } from '../lib/queries';
import { MAX_IMAGENES_RECLAMO, prepararImagenReclamo } from '../lib/imagenReclamo';

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

  /*
    La cámara, en el único flujo del ciudadano que adjunta evidencia (09-10-2026).

    Hasta ahora el único camino era `<input type="file">`: en un teléfono eso ofrece la cámara
    entre otras cosas, y en una computadora abre un selector de archivos y nada más. Quien impugna
    una multa desde una laptop con cámara no tenía cómo usarla.

    El botón sólo aparece donde la cámara puede existir —`soporteDeCamara()` responde sin pedirle
    nada a nadie—, y el de adjuntar un archivo sigue estando siempre: es la alternativa cuando el
    permiso se deniega, cuando no hay cámara y cuando la foto ya estaba tomada, que es el caso más
    común de todos.
  */
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const hayCamara = soporteDeCamara() === 'ok';

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

  // --- Evidencia opcional, elegida en la MISMA pantalla de presentar (24-10-2026) ---------------
  // Selector de galería (input file), nunca la cámara: la orden pide no pedir permiso de cámara ni
  // forzar captura. Las imágenes se preparan (se reducen a <=1 MB) al elegirlas y se suben una por
  // una DESPUÉS de crear el reclamo; lo que falle se reintenta en la pantalla del reclamo ya
  // presentado, que sigue teniendo su propio adjuntador.
  interface ImagenElegida {
    key: string;
    blob: Blob;
    nombre: string;
    bytes: number;
    reducida: boolean;
    url: string;
  }
  const [imagenes, setImagenes] = useState<ImagenElegida[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const seleccionRef = useRef<HTMLInputElement>(null);

  // Revocar las URL de previsualización al desmontar, sin revocar las que siguen en uso.
  const imagenesRef = useRef(imagenes);
  imagenesRef.current = imagenes;
  useEffect(() => () => imagenesRef.current.forEach((im) => URL.revokeObjectURL(im.url)), []);

  const agregarImagenes = async (lista: FileList | null): Promise<void> => {
    if (!lista || lista.length === 0) return;
    setPreparando(true);
    setError(null);
    const nuevas: ImagenElegida[] = [];
    for (const file of Array.from(lista)) {
      if (imagenes.length + nuevas.length >= MAX_IMAGENES_RECLAMO) {
        setError(t('citizen.appeal.attach.error.max', { max: MAX_IMAGENES_RECLAMO }));
        break;
      }
      const r = await prepararImagenReclamo(file);
      if ('error' in r) {
        setError(t(r.error === 'tipo' ? 'citizen.appeal.attach.error.type' : 'citizen.appeal.attach.error.prepare'));
        continue;
      }
      nuevas.push({
        key: `${file.name}-${Date.now()}-${Math.random()}`,
        blob: r.blob,
        nombre: r.nombre,
        bytes: r.bytes,
        reducida: r.reducida,
        url: URL.createObjectURL(r.blob),
      });
    }
    if (nuevas.length > 0) setImagenes((prev) => [...prev, ...nuevas]);
    setPreparando(false);
  };

  const quitarImagen = (key: string): void => {
    setImagenes((prev) => {
      const quitada = prev.find((im) => im.key === key);
      if (quitada) URL.revokeObjectURL(quitada.url);
      return prev.filter((im) => im.key !== key);
    });
  };

  const presentar = async (): Promise<void> => {
    const notice = noticeQuery.data;
    if (!notice) return;
    setSubiendo(true);
    setError(null);
    try {
      await apiClient.citizenFines.fileAppeal(id as string, { body: body.trim(), acceptedNoticeId: notice.id });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'APPEAL_NOTICE_OUTDATED') {
        void noticeQuery.refetch();
        setError(t('citizen.appeal.error.noticeOutdated'));
      } else {
        setError(t(code === 'APPEAL_ALREADY_FILED' ? 'citizen.appeal.error.alreadyFiled' : 'citizen.appeal.error.generic'));
      }
      setSubiendo(false);
      return;
    }
    // Reclamo creado. Subir las imágenes; lo que falle queda para reintento en la fase ya presentada.
    for (const im of imagenes) {
      try {
        await apiClient.citizenFines.attachAppealImage(id as string, im.blob, im.nombre);
      } catch {
        /* una imagen perdida no pierde el reclamo; se reintenta en la pantalla siguiente */
      }
    }
    imagenes.forEach((im) => URL.revokeObjectURL(im.url));
    setImagenes([]);
    setBody('');
    void queryClient.invalidateQueries({ queryKey: FINE_KEYS.detail(id ?? '') });
    void queryClient.invalidateQueries({ queryKey: FINE_KEYS.all });
    setSubiendo(false);
  };

  return (
    <CitizenShell title={t('citizen.appeal.title')} onBack={() => navigate(`/fines/${id}`)}>
      <QueryBoundary query={fineQuery} errorTitle={t('citizen.appeal.title')}>
        {(detail) => {
          const appeal = detail.appeal;

          // Already filed: this screen is now where it is read, and where the answer arrives.
          if (appeal) {
            const resolved = appeal.status !== 'SUBMITTED';
            // Withdrawn is neither a win nor a loss: the citizen paid and closed it themselves
            // (v0.41). It reaches this screen as resolved, so without this split it would render
            // the municipality's rejection sentence over an empty reason — a decision nobody made.
            const withdrawn = appeal.status === 'WITHDRAWN';
            return (
              <>
                <Card>
                  <SectionHeader
                    title={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                        <span>{t('citizen.appeal.filed.title')}</span>
                        <Badge
                          tone={
                            appeal.status === 'ACCEPTED'
                              ? 'success'
                              : withdrawn
                                ? 'neutral'
                                : resolved
                                  ? 'danger'
                                  : 'warning'
                          }
                        >
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

                {withdrawn ? (
                  /* No "Resolución de la municipalidad" header here: there was no resolution. The
                     claim is kept on screen in full — it is still what the citizen wrote — with one
                     line saying who closed it and why it stopped waiting. */
                  <Card>
                    <SectionHeader
                      title={t('citizen.appeal.filed.title')}
                      description={appeal.resolvedAt ? formatDateTime(appeal.resolvedAt, locale) : undefined}
                    />
                    <Alert tone="info">{t('citizen.appeal.withdrawn')}</Alert>
                  </Card>
                ) : resolved ? (
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
                        {hayCamara ? (
                          <Button
                            type="button"
                            fullWidth
                            disabled={
                              appeal.images.length >= appeal.maxImages || attachMutation.isPending
                            }
                            onClick={() => setCamaraAbierta(true)}
                          >
                            {t('citizen.appeal.images.camera')}
                          </Button>
                        ) : null}
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
                      </div>
                      <CameraCaptureModal
                        open={camaraAbierta}
                        onClose={() => setCamaraAbierta(false)}
                        onAttachFile={() => fileInputRef.current?.click()}
                        onCapture={(foto) =>
                          attachMutation.mutate(
                            new File([foto.blob], foto.fileName, { type: foto.blob.type }),
                          )
                        }
                      />
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
          const canSubmit = body.trim().length > 0 && notice !== undefined && !subiendo;

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
                  rows={5}
                  maxLength={MAX_BODY}
                  showCount
                  countLabel={t('citizen.appeal.write.count', { used: body.length, max: MAX_BODY })}
                  value={body}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                />

                {/* Evidencia opcional: selector de galería, sin cámara (orden del 24-10-2026). */}
                <div style={{ marginTop: 'var(--lx-space-3)' }}>
                  <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-1) 0' }}>
                    {t('citizen.appeal.attach.title')}
                  </p>
                  <p className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-2) 0' }}>
                    {t('citizen.appeal.attach.hint')}
                  </p>
                  <input
                    ref={seleccionRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      const lista = event.target.files;
                      event.target.value = '';
                      void agregarImagenes(lista);
                    }}
                  />
                  {imagenes.length > 0 ? (
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: '0 0 var(--lx-space-2) 0',
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--lx-space-2)',
                      }}
                    >
                      {imagenes.map((im) => (
                        <li key={im.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
                          <img
                            src={im.url}
                            alt=""
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                          />
                          <span
                            className="lx-text-meta"
                            style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {im.nombre} · {(im.bytes / 1024).toFixed(0)} KB
                            {im.reducida ? ` · ${t('citizen.appeal.attach.reduced')}` : ''}
                          </span>
                          <Button type="button" variant="ghost" onClick={() => quitarImagen(im.key)}>
                            {t('citizen.appeal.attach.remove')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    loading={preparando}
                    disabled={imagenes.length >= MAX_IMAGENES_RECLAMO}
                    onClick={() => seleccionRef.current?.click()}
                  >
                    {t('citizen.appeal.attach.select')} ({imagenes.length}/{MAX_IMAGENES_RECLAMO})
                  </Button>
                </div>

                {error ? <Alert tone="danger">{error}</Alert> : null}
                {/* The sentence under the button, not a dialog after it: what accepting means has
                    to be readable while deciding, not confirmed once it is too late to read. */}
                <p className="lx-text-meta">{t('citizen.appeal.acceptNotice')}</p>
                <Button
                  type="button"
                  fullWidth
                  loading={subiendo}
                  disabled={!canSubmit}
                  onClick={() => void presentar()}
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
