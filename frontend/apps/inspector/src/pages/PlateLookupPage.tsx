import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import { plateVerdictKey } from '@luparx/features';
import type { PlateVerdict } from '@luparx/api-client';
import { Alert, Button, Card, FormField, Input, ListRow, SectionHeader, Select, type CardTone } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { VerdictMark, verdictTone } from '../components/VerdictMark';
import { useKnownZones, usePlateLookup } from '../lib/queries';
import { lookupErrorMessage } from '../lib/apiErrors';

/**
 * The screen this app exists for: "has this plate paid, on this bay, right now?".
 *
 * Three decisions shape it. The **plate field is the largest thing on the screen** because it is
 * typed standing up, one-handed, sometimes with gloves. The **bay is asked for on the same screen
 * and not behind a step**, because without it the server refuses to say "covered" at all and a
 * lookup that comes back `AMBIGUOUS` has wasted the officer's walk. And the **answer is a shape
 * before it is a colour** (see VerdictMark), readable from a metre away, because that is the
 * distance between an officer's eyes and a phone held at waist height.
 *
 * `BAY_MISMATCH` gets the longest sentence of the four on purpose: it is the case where fining
 * wrongly is easiest, so the screen states what actually happened — "paid for bay 0042, not for
 * this one" — instead of a bare label the officer has to interpret.
 *
 * The **answer sits above the form**, not under it. The form is what the officer has just filled
 * in and does not need to read again; the answer is the whole reason they are holding the phone,
 * and putting it below a five-field card meant scrolling to find out whether to write a ticket.
 */
export function PlateLookupPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const zones = useKnownZones();
  const lookup = usePlateLookup();

  const [plate, setPlate] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [bay, setBay] = useState('');
  const [pairError, setPairError] = useState(false);

  const zoneOptions = useMemo(
    () => zones.map((zone) => ({ value: zone.id, label: zone.name, detail: zone.code })),
    [zones],
  );
  const result = lookup.data;

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    runLookup(zoneId, bay);
  }

  /**
   * The zone and the bay travel together or not at all — half a pair is `VALIDATION_FAILED` on the
   * server. It is caught here so the officer is told before the round trip, not after it.
   */
  function runLookup(nextZoneId: string, nextBay: string): void {
    const trimmedBay = nextBay.trim();
    if (Boolean(nextZoneId) !== Boolean(trimmedBay)) {
      setPairError(true);
      return;
    }
    setPairError(false);
    lookup.mutate({
      plate: plate.trim(),
      zoneId: nextZoneId || undefined,
      spaceCode: trimmedBay || undefined,
    });
  }

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('inspector.lookup.title')}</h1>

      {result ? (
        <>
          {/* The surface tone only has `success` and `warning`; the other two verdicts carry their
              colour on the mark and the headline, and their meaning on the shape. */}
          <Card tone={cardToneFor(result.verdict)}>
            <div style={{ display: 'flex', gap: 'var(--lx-space-4)', alignItems: 'flex-start' }}>
              <span style={{ color: `var(--lx-${verdictTone(result.verdict)})`, flexShrink: 0 }}>
                <VerdictMark verdict={result.verdict} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: `var(--lx-${verdictTone(result.verdict)})`,
                  }}
                >
                  {t(plateVerdictKey(result.verdict))}
                </p>
                <p className="lx-text-body" style={{ margin: 0 }}>
                  {t(VERDICT_DETAIL_KEYS[result.verdict], {
                    bay: result.bay?.spaceCode ?? bay,
                    other: result.otherStays[0]?.spaceCode ?? '',
                  })}
                </p>
                <p className="lx-text-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {result.plateNormalized} · {t('inspector.lookup.checkedAt', { time: formatTime(result.checkedAt, locale) })}
                </p>
                {result.coveringStay ? (
                  <p className="lx-text-meta" style={{ margin: 0 }}>
                    {t('inspector.lookup.coveringStay', {
                      time: formatTime(result.coveringStay.expiresAt, locale),
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          {result.otherStays.length > 0 ? (
            <Card>
              <SectionHeader title={t('inspector.lookup.otherStays')} />
              {result.otherStays.map((stay) => (
                <ListRow
                  key={stay.sessionId}
                  title={t('inspector.lookup.stayRow', {
                    zone: stay.zoneName,
                    bay: stay.spaceCode,
                    time: formatTime(stay.expiresAt, locale),
                  })}
                  meta={t('inspector.lookup.useThisBay')}
                  // One tap turns an AMBIGUOUS answer into a conclusive one, with the bay the
                  // server itself just named — no retyping a code the officer never saw painted.
                  onClick={() => {
                    setZoneId(stay.zoneId);
                    setBay(stay.spaceCode);
                    runLookup(stay.zoneId, stay.spaceCode);
                  }}
                />
              ))}
            </Card>
          ) : null}

          {result.verdict !== 'COVERED' ? (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() =>
                navigate('/cite', {
                  state: {
                    plate: result.plateNormalized,
                    zoneId: result.bay?.zoneId ?? zoneId ?? '',
                    spaceCode: result.bay?.spaceCode ?? bay,
                    spaceId: result.bay?.spaceId ?? '',
                  },
                })
              }
            >
              {t('inspector.lookup.cite')}
            </Button>
          ) : null}
        </>
      ) : null}
      <Card>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <FormField label={t('inspector.lookup.plateLabel')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                name="plate"
                value={plate}
                onChange={(event) => setPlate(event.target.value.toUpperCase())}
                placeholder={t('inspector.lookup.platePlaceholder')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                required
                // The one field that is read at arm's length and typed without looking. Tabular
                // figures so a plate does not shift width as it is typed.
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textAlign: 'center',
                  height: 68,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            )}
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--lx-space-3)' }}>
            <FormField label={t('inspector.lookup.zoneLabel')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={zoneId}
                  onChange={setZoneId}
                  options={zoneOptions}
                  placeholder={
                    zoneOptions.length === 0 ? t('inspector.zones.empty') : t('common.select.placeholder')
                  }
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
                  value={bay}
                  onChange={(event) => setBay(event.target.value.toUpperCase())}
                  placeholder={t('inspector.lookup.bayPlaceholder')}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
              )}
            </FormField>
          </div>

          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.lookup.bayHint')}
          </p>
          {zoneOptions.length === 0 ? (
            <Alert tone="info">{t('inspector.zones.emptyHint')}</Alert>
          ) : null}
          {pairError ? <Alert tone="danger">{t('inspector.lookup.bayIncomplete')}</Alert> : null}
          {lookup.isError ? <Alert tone="danger">{lookupErrorMessage(lookup.error, t)}</Alert> : null}

          {/* The one CTA with glow on this screen, at the bottom, inside the thumb's arc. */}
          <Button type="submit" fullWidth loading={lookup.isPending} disabled={plate.trim().length === 0}>
            {t('inspector.lookup.submit')}
          </Button>
        </form>
      </Card>

    </InspectorShell>
  );
}

/**
 * The sentence under the verdict. Kept as a table of keys rather than built from fragments so
 * every language can rewrite the whole sentence — `BAY_MISMATCH` in particular needs both bay
 * numbers in an order Spanish and English do not agree on.
 */
function cardToneFor(verdict: PlateVerdict): CardTone {
  const tone = verdictTone(verdict);
  return tone === 'success' || tone === 'warning' ? tone : 'default';
}

const VERDICT_DETAIL_KEYS: Record<PlateVerdict, TranslationKey> = {
  COVERED: 'inspector.lookup.verdict.covered.detail',
  BAY_MISMATCH: 'inspector.lookup.verdict.bay_mismatch.detail',
  NOT_COVERED: 'inspector.lookup.verdict.not_covered.detail',
  AMBIGUOUS: 'inspector.lookup.verdict.ambiguous.detail',
};
