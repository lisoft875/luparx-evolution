import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCurrencyMinor, formatNumber, useTranslation } from '@luparx/i18n';
import { formatBytes } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import type { InfractionType } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  IconCheck,
  IconPin,
  Input,
  Modal,
  SectionHeader,
  Select,
  Textarea,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useCitationQueue, useInfractionTypes, useKnownZones } from '../lib/queries';
import { apiErrorMessage } from '../lib/apiErrors';
import {
  MAX_EVIDENCE_BYTES,
  MAX_PHOTOS_PER_CITATION,
  enqueueCitation,
} from '../lib/citationQueue';
import {
  hasNativeCamera,
  requestCameraPermission,
  requestLocationPermission,
  takeNativePhoto,
  takePosition,
} from '../lib/capture';
import { preparePhoto, type PreparedPhoto } from '../lib/evidencePreparation';

interface PrefilledLocation {
  plate?: string;
  zoneId?: string;
  spaceId?: string;
  spaceCode?: string;
  /**
   * The lookup this citation is being written from (CONTRACT.md v0.29).
   *
   * It is what links "he looked" to "he looked and then fined", and answers the other direction:
   * "they fined me without coming to see the car".
   */
  checkId?: string;
}

/**
 * Writing a citation.
 *
 * <h2>Nothing is sent from this screen</h2>
 *
 * Pressing "emitir" writes the capture into the local queue and returns immediately; the queue
 * sends it, now or when the signal comes back (see lib/citationQueue). That is not an optimisation:
 * it is the difference between an app that works in a street and one that works in an office. The
 * officer sees what happened either way — "sent" or "saved to send" — and never a spinner that
 * depends on a bar of signal.
 *
 * <h2>The photograph rule is stated before it is enforced</h2>
 *
 * When the chosen infraction type demands a photograph, this screen says so the moment the type is
 * chosen and disables the submit until one is attached. Finding out at submit time — after walking
 * away from the car — is how an officer ends up with a draft they cannot close.
 *
 * <h2>Coordinates are taken, or they are not</h2>
 *
 * The permission is explained before it is asked for, and a refusal is a normal outcome: the
 * citation goes out without coordinates and says so, on the screen and on the record. A last-known
 * position, a zone centroid or a zero would all be inventions, and inventing a position on an
 * administrative act is the worst thing this screen could do.
 */
export function NewCitationPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTenant } = useAuth();
  const prefilled = (location.state ?? {}) as PrefilledLocation;

  const types = useInfractionTypes();
  const zones = useKnownZones();
  const queue = useCitationQueue();

  const [typeId, setTypeId] = useState('');
  const [plate, setPlate] = useState(prefilled.plate ?? '');
  const [zoneId, setZoneId] = useState(prefilled.zoneId ?? '');
  const [spaceCode, setSpaceCode] = useState(prefilled.spaceCode ?? '');
  const [addressText, setAddressText] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracyM: number | null } | null>(
    null,
  );
  const [locationAsked, setLocationAsked] = useState(false);
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [cameraPromptOpen, setCameraPromptOpen] = useState(false);
  const [cameraAsked, setCameraAsked] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ deviceCitationId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedType: InfractionType | undefined = useMemo(
    () => types.data?.find((candidate) => candidate.id === typeId),
    [types.data, typeId],
  );

  const typeOptions = useMemo(
    () =>
      (types.data ?? []).map((type) => ({
        value: type.id,
        label: type.name,
        // The amount belongs on the option itself: choosing the type and knowing what it costs the
        // citizen is one decision, and one glance.
        detail: t('inspector.cite.typeDetail', {
          amount: formatCurrencyMinor(type.fineMinor, type.currencyCode, locale),
          days: type.dueDays,
        }),
      })),
    [locale, t, types.data],
  );

  const zoneOptions = useMemo(
    () => zones.map((zone) => ({ value: zone.id, label: zone.name, detail: zone.code })),
    [zones],
  );

  const photoMissing = Boolean(selectedType?.requiresPhoto) && photos.length === 0;
  const canSubmit = Boolean(typeId) && plate.trim().length > 0 && !photoMissing && !busy;

  // The bay and the zone travel together for the citation too: sending one without the other
  // records half a location, which is worse than none because it looks complete.
  const bayIncomplete = Boolean(zoneId) !== Boolean(spaceCode.trim());

  // Nothing is ever pre-selected in the type picker: choosing what somebody is fined for is not a
  // default, and a default here would be the one the officer accidentally leaves in place.

  /**
   * The photograph, from whichever camera this build has.
   *
   * On a native build the first tap opens an explanation *before* the operating system's own
   * permission dialog — a prompt with no context is the one people refuse, and refusing it once on
   * a work phone is hard to undo. On the web there is no separate camera permission to ask for:
   * the file input with `capture` opens the OS picker, which is itself the explanation, so an extra
   * sheet there would be a tap that buys nothing.
   */
  function addPhotoFromCamera(): void {
    setPhotoError(null);
    if (hasNativeCamera() && !cameraAsked) {
      setCameraPromptOpen(true);
      return;
    }
    void openCamera();
  }

  async function openCamera(): Promise<void> {
    setCameraPromptOpen(false);
    if (!hasNativeCamera()) {
      fileInputRef.current?.click();
      return;
    }
    setCameraAsked(true);
    const outcome = await requestCameraPermission();
    if (outcome !== 'granted') {
      setCameraDenied(true);
      return;
    }
    setCameraDenied(false);
    const captured = await takeNativePhoto();
    if (!captured) return;
    await acceptPhoto(captured.blob, captured.fileName, captured.capturedAt);
  }

  async function acceptPhoto(blob: Blob, fileName: string, capturedAt: string): Promise<void> {
    if (photos.length >= MAX_PHOTOS_PER_CITATION) return;
    const prepared = await preparePhoto(blob, fileName, {
      capturedAt,
      latitude: position?.latitude,
      longitude: position?.longitude,
    });
    if (prepared.blob.size > MAX_EVIDENCE_BYTES) {
      setPhotoError(
        t('inspector.cite.photoTooLarge', {
          size: formatBytes(prepared.blob.size, (value) => formatNumber(value, locale)),
          max: formatBytes(MAX_EVIDENCE_BYTES, (value) => formatNumber(value, locale)),
        }),
      );
      return;
    }
    setPhotos((current) => [...current, prepared]);
  }

  /** Explain, then ask. A permission sheet with no context is the one people refuse. */
  function askForLocation(): void {
    if (locationAsked) {
      void captureLocation();
      return;
    }
    setLocationPromptOpen(true);
  }

  async function captureLocation(): Promise<void> {
    setLocationAsked(true);
    setLocationPromptOpen(false);
    const outcome = await requestLocationPermission();
    if (outcome === 'denied' || outcome === 'unavailable') {
      setLocationDenied(true);
      setPosition(null);
      return;
    }
    const fix = await takePosition();
    if (!fix) {
      setLocationDenied(true);
      setPosition(null);
      return;
    }
    setLocationDenied(false);
    setPosition({ latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM });
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedType || !activeTenant) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const row = await enqueueCitation({
        tenantId: activeTenant.id,
        payload: {
          infractionTypeId: selectedType.id,
          plate: plate.trim(),
          zoneId: bayIncomplete ? undefined : zoneId || undefined,
          spaceId: prefilled.spaceId && prefilled.zoneId === zoneId ? prefilled.spaceId : undefined,
          spaceCode: bayIncomplete ? undefined : spaceCode.trim() || undefined,
          latitude: position?.latitude,
          longitude: position?.longitude,
          locationAccuracyM: position?.accuracyM ?? undefined,
          addressText: addressText.trim() || undefined,
          // The officer's declaration of when it happened. The server never overwrites it, and
          // records the difference against its own clock as `deviceClockSkewSeconds`.
          occurredAt: new Date().toISOString(),
          // Only when the bay still matches the lookup it came from. An officer who arrived here
          // from a lookup and then retyped the zone is writing about a different car, and claiming
          // the earlier consultation covers it would be the one lie this field must not tell.
          enforcementCheckId:
            prefilled.checkId && prefilled.zoneId === zoneId ? prefilled.checkId : undefined,
          notes: notes.trim() || undefined,
        },
        photos: photos.map((photo) => ({
          blob: photo.blob,
          fileName: photo.fileName,
          capturedAt: photo.capturedAt,
          latitude: photo.latitude,
          longitude: photo.longitude,
          scaledDown: photo.scaledDown,
          originalByteSize: photo.originalByteSize,
        })),
        requiresPhoto: selectedType.requiresPhoto,
        infractionName: selectedType.name,
      });
      setSubmitted({ deviceCitationId: row.deviceCitationId });
      void queue.flush();
    } catch (error) {
      setSubmitError(apiErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setSubmitted(null);
    setTypeId('');
    setPlate('');
    setSpaceCode('');
    setAddressText('');
    setNotes('');
    setPhotos([]);
    setPosition(null);
    setLocationAsked(false);
    setLocationDenied(false);
  }

  if (submitted) {
    const row = queue.rows.find((candidate) => candidate.deviceCitationId === submitted.deviceCitationId);
    const sent = row?.state === 'SENT';
    return (
      <InspectorShell>
        <Card tone={sent ? 'success' : 'warning'}>
          <EmptyState
            icon={<IconCheck size={28} />}
            tone={sent ? 'success' : 'primary'}
            title={
              sent
                ? row?.number
                  ? t('inspector.cite.issued', { number: row.number })
                  : t('inspector.cite.draft')
                : t('inspector.cite.queued')
            }
            description={sent ? undefined : t('inspector.cite.queuedHint')}
          />
        </Card>
        <Button type="button" fullWidth onClick={reset}>
          {t('inspector.cite.reset')}
        </Button>
        {row?.citationId ? (
          <Button type="button" variant="secondary" fullWidth onClick={() => navigate(`/citations/${row.citationId}`)}>
            {t('inspector.cite.viewCitation')}
          </Button>
        ) : (
          <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/queue')}>
            {t('inspector.queue.title')}
          </Button>
        )}
      </InspectorShell>
    );
  }

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('inspector.cite.title')}</h1>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-card-gap)' }}>
        <Card>
          <SectionHeader title={t('inspector.cite.step.type')} />
          {types.isError ? (
            <Alert tone="danger">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}>
                <span>{apiErrorMessage(types.error, t)}</span>
                <Button type="button" variant="secondary" onClick={() => void types.refetch()}>
                  {t('common.retry')}
                </Button>
              </div>
            </Alert>
          ) : types.isLoading ? (
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('common.loading')}
            </p>
          ) : (
            <FormField label={t('inspector.cite.typeLabel')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={typeId}
                  onChange={setTypeId}
                  options={typeOptions}
                  placeholder={t('inspector.cite.typePlaceholder')}
                  aria-label={t('inspector.cite.typeLabel')}
                  required
                />
              )}
            </FormField>
          )}
          {selectedType ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--lx-space-2)', marginTop: 'var(--lx-space-3)' }}>
              <Badge tone="neutral">
                {formatCurrencyMinor(selectedType.fineMinor, selectedType.currencyCode, locale)}
              </Badge>
              <Badge tone={selectedType.requiresPhoto ? 'warning' : 'neutral'}>
                {selectedType.requiresPhoto
                  ? t('inspector.cite.typeRequiresPhoto')
                  : t('citation.evidence.photo')}
              </Badge>
              <Badge tone="neutral">
                {selectedType.allowsAppeal ? t('inspector.cite.typeAllowsAppeal') : t('inspector.cite.typeNoAppeal')}
              </Badge>
              {selectedType.discountPercent && selectedType.discountDays ? (
                <Badge tone="success">
                  {t('inspector.cite.typeDiscount', {
                    percent: selectedType.discountPercent,
                    days: selectedType.discountDays,
                  })}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <SectionHeader title={t('inspector.cite.step.where')} />
          <FormField label={t('inspector.lookup.plateLabel')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                name="plate"
                value={plate}
                onChange={(event) => setPlate(event.target.value.toUpperCase())}
                placeholder={t('inspector.lookup.platePlaceholder')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
                style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.06em', height: 60, textAlign: 'center' }}
              />
            )}
          </FormField>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--lx-space-3)',
              marginTop: 'var(--lx-space-3)',
            }}
          >
            <FormField label={t('inspector.lookup.zoneLabel')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={zoneId}
                  onChange={setZoneId}
                  options={zoneOptions}
                  placeholder={zoneOptions.length === 0 ? t('inspector.zones.empty') : t('common.select.placeholder')}
                  disabled={zoneOptions.length === 0}
                  aria-label={t('inspector.lookup.zoneLabel')}
                />
              )}
            </FormField>
            <FormField label={t('inspector.lookup.bayLabel')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  name="spaceCode"
                  value={spaceCode}
                  onChange={(event) => setSpaceCode(event.target.value.toUpperCase())}
                  placeholder={t('inspector.lookup.bayPlaceholder')}
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
                />
              )}
            </FormField>
          </div>
          {bayIncomplete ? (
            <Alert tone="warning">{t('inspector.lookup.bayIncomplete')}</Alert>
          ) : null}
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <FormField label={t('inspector.cite.addressLabel')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  name="addressText"
                  value={addressText}
                  onChange={(event) => setAddressText(event.target.value)}
                  placeholder={t('inspector.cite.addressPlaceholder')}
                  maxLength={300}
                />
              )}
            </FormField>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('inspector.cite.location')} />
          {position ? (
            <p className="lx-text-body" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              <IconPin size={16} />{' '}
              {t('inspector.cite.locationCaptured', {
                lat: position.latitude.toFixed(5),
                lon: position.longitude.toFixed(5),
                accuracy: position.accuracyM == null ? '—' : Math.round(position.accuracyM),
              })}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
              <p className="lx-text-body" style={{ margin: 0 }}>
                {t('inspector.cite.locationNone')}
              </p>
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {locationDenied ? t('inspector.permission.location.denied') : t('inspector.cite.locationNoneHint')}
              </p>
            </div>
          )}
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Button type="button" variant="secondary" fullWidth onClick={askForLocation}>
              {t('inspector.cite.locationCapture')}
            </Button>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title={t('inspector.cite.photos')}
            description={t('inspector.cite.photosCount', {
              count: photos.length,
              max: MAX_PHOTOS_PER_CITATION,
            })}
          />
          <p className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
            {t('inspector.cite.photoUnchanged')}
          </p>
          {photoMissing ? <Alert tone="warning">{t('inspector.cite.photoRequired')}</Alert> : null}
          {photoError ? <Alert tone="danger">{photoError}</Alert> : null}
          {cameraDenied ? <Alert tone="danger">{t('inspector.permission.camera.denied')}</Alert> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            {photos.map((photo, index) => (
              <PhotoRow
                key={`${photo.fileName}-${index}`}
                photo={photo}
                onRemove={() => setPhotos((current) => current.filter((_, position) => position !== index))}
              />
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void acceptPhoto(file, file.name, new Date(file.lastModified || Date.now()).toISOString());
            }}
          />
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={photos.length >= MAX_PHOTOS_PER_CITATION}
              onClick={addPhotoFromCamera}
            >
              {t('inspector.cite.addPhoto')}
            </Button>
          </div>
        </Card>

        <Card>
          <FormField label={t('inspector.cite.notesLabel')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Textarea
                id={inputId}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('inspector.cite.notesPlaceholder')}
                maxLength={2000}
                rows={3}
              />
            )}
          </FormField>
        </Card>

        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <Button type="submit" fullWidth disabled={!canSubmit} loading={busy}>
          {t('inspector.cite.submit')}
        </Button>
      </form>

      <Modal
        open={cameraPromptOpen}
        onClose={() => setCameraPromptOpen(false)}
        title={t('inspector.permission.title')}
        closeLabel={t('common.close')}
        description={t('inspector.permission.camera.why')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <Button type="button" fullWidth onClick={() => void openCamera()}>
            {t('inspector.permission.allow')}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setCameraPromptOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={locationPromptOpen}
        onClose={() => setLocationPromptOpen(false)}
        title={t('inspector.permission.title')}
        closeLabel={t('common.close')}
        description={t('inspector.permission.location.why')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <Button type="button" fullWidth onClick={() => void captureLocation()}>
            {t('inspector.permission.allow')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => {
              setLocationPromptOpen(false);
              setLocationAsked(true);
            }}
          >
            {t('inspector.permission.skip')}
          </Button>
        </div>
      </Modal>
    </InspectorShell>
  );
}

/** One attached photograph, with the honest note when the client had to shrink it. */
function PhotoRow({ photo, onRemove }: { photo: PreparedPhoto; onRemove: () => void }): React.JSX.Element {
  const { t, locale } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.blob]);

  return (
    <Card nested>
      <div style={{ display: 'flex', gap: 'var(--lx-space-3)', alignItems: 'flex-start' }}>
        {url ? (
          <img
            src={url}
            alt={photo.fileName}
            style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 'var(--lx-radius-sm)' }}
          />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-1)', minWidth: 0, flex: 1 }}>
          <span className="lx-text-meta">
            {formatBytes(photo.blob.size, (value) => formatNumber(value, locale))}
          </span>
          {photo.scaledDown ? (
            <Alert tone="warning">
              {t('inspector.cite.photoResized', {
                size: formatBytes(photo.originalByteSize, (value) => formatNumber(value, locale)),
                max: formatBytes(MAX_EVIDENCE_BYTES, (value) => formatNumber(value, locale)),
              })}
            </Alert>
          ) : null}
          <Button type="button" variant="ghost" onClick={onRemove}>
            {t('inspector.cite.removePhoto')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
