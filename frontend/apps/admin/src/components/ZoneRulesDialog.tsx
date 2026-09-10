import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError, type ChargingBand, type ChargingDay, type Weekday } from '@luparx/api-client';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, Checkbox, FormField, Input, Modal } from '@luparx/ui';
import { useUpdateZoneRules, useZoneRules } from '../lib/queries';

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const WEEKDAY_KEY: Record<Weekday, TranslationKey> = {
  MONDAY: 'weekday.monday',
  TUESDAY: 'weekday.tuesday',
  WEDNESDAY: 'weekday.wednesday',
  THURSDAY: 'weekday.thursday',
  FRIDAY: 'weekday.friday',
  SATURDAY: 'weekday.saturday',
  SUNDAY: 'weekday.sunday',
};

function toMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function band(startsAt: string, endsAt: string): ChargingBand {
  return { startsAt, endsAt, startMinute: toMinute(startsAt) ?? 0, endMinute: toMinute(endsAt) ?? 0 };
}

/** Blank means "follow the municipality"; a number means this zone departs. */
function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toList(value: string): number[] | undefined {
  const parts = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part > 0);
  return parts.length === 0 ? undefined : [...new Set(parts)].sort((a, b) => a - b);
}

/**
 * What one zone does differently from its municipality (CONTRACT.md v0.31).
 *
 * <p>Until v0.31 the tariff was the only thing a zone could set. But the tariff is the lever people
 * name, and the <b>hours</b> and the <b>maximum stay</b> are the ones that actually manage rotation:
 * the historic centre needs two hours and the hospital needs twenty-four, and they had to share one
 * number.</p>
 *
 * <p>Every field here is <b>empty by default and that means "follow the municipality"</b> — not zero.
 * The screen shows what the zone would apply either way, so somebody deciding whether to depart can
 * see what they are departing from. Emptying a field puts that one point back to following, which is
 * why the placeholder is the municipality's own number rather than a blank.</p>
 */
export function ZoneRulesDialog({
  zoneId,
  zoneName,
  onClose,
}: {
  zoneId: string | null;
  zoneName: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const rulesQuery = useZoneRules(zoneId);
  const updateMutation = useUpdateZoneRules(zoneId);

  const [increments, setIncrements] = useState('');
  const [minMinutes, setMinMinutes] = useState('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [freeMinutes, setFreeMinutes] = useState('');
  const [ownSchedule, setOwnSchedule] = useState(false);
  const [week, setWeek] = useState<ChargingDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const rules = rulesQuery.data;
    if (!rules) return;
    setIncrements(rules.overrideSessionIncrementsMinutes?.join(', ') ?? '');
    setMinMinutes(rules.overrideSessionMinMinutes?.toString() ?? '');
    setMaxMinutes(rules.overrideSessionMaxMinutes?.toString() ?? '');
    setFreeMinutes(rules.overrideFreeMinutes?.toString() ?? '');
    setOwnSchedule(rules.hasOwnSchedule);
    setWeek(
      WEEKDAYS.map(
        (weekday) => rules.week.find((day) => day.weekday === weekday) ?? { weekday, bands: [] },
      ),
    );
    // Deliberately NOT clearing `saved` here. A successful save writes the server's answer straight
    // into the cache, which re-runs this effect — clearing the flag here wiped the confirmation the
    // save had just set, so the screen accepted the change and said nothing about it.
  }, [rulesQuery.data]);

  // Opening the dialog on another zone is a new conversation; the last one's confirmation is not.
  useEffect(() => {
    setSaved(false);
    setError(null);
  }, [zoneId]);

  async function handleSave(): Promise<void> {
    setError(null);
    setSaved(false);
    for (const day of week) {
      for (const slot of day.bands) {
        const start = toMinute(slot.startsAt);
        const end = toMinute(slot.endsAt);
        if (start === null || end === null || end <= start) {
          setError(t('admin.zones.rules.error.band', { day: t(WEEKDAY_KEY[day.weekday]) }));
          return;
        }
      }
    }
    try {
      await updateMutation.mutateAsync({
        sessionIncrementsMinutes: toList(increments),
        sessionMinMinutes: toNumber(minMinutes),
        sessionMaxMinutes: toNumber(maxMinutes),
        freeMinutes: toNumber(freeMinutes),
        ownSchedule,
        chargesAllDay: false,
        week: ownSchedule
          ? week.map((day) => ({
              weekday: day.weekday,
              bands: day.bands.map((slot) => band(slot.startsAt, slot.endsAt)),
            }))
          : [],
      });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'VALIDATION_FAILED'
          ? t('admin.zones.rules.error.invalid')
          : t('common.error.generic'),
      );
    }
  }

  const rules = rulesQuery.data;

  return (
    <Modal
      open={zoneId !== null}
      onClose={onClose}
      title={t('admin.zones.rules.title', { zone: zoneName })}
      closeLabel={t('common.close')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
        <Alert tone="info">{t('admin.zones.rules.notice')}</Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t('admin.zones.rules.saved')}</Alert> : null}

        <FormField
          label={t('admin.zones.rules.incrementsLabel')}
          hint={t('admin.zones.rules.inheritHint', {
            value: rules?.effectiveSessionIncrementsMinutes.join(', ') ?? '—',
          })}
        >
          {({ inputId, describedBy }) => (
            <Input
              id={inputId}
              aria-describedby={describedBy}
              value={increments}
              placeholder={rules?.effectiveSessionIncrementsMinutes.join(', ') ?? ''}
              onChange={(event) => setIncrements(event.target.value)}
            />
          )}
        </FormField>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <FormField
            label={t('admin.zones.rules.minLabel')}
            hint={t('admin.zones.rules.inheritHint', { value: rules?.effectiveSessionMinMinutes ?? '—' })}
          >
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                type="number"
                min={1}
                style={{ width: 120 }}
                value={minMinutes}
                placeholder={String(rules?.effectiveSessionMinMinutes ?? '')}
                onChange={(event) => setMinMinutes(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label={t('admin.zones.rules.maxLabel')}
            hint={t('admin.zones.rules.maxHint')}
          >
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                type="number"
                min={1}
                style={{ width: 120 }}
                value={maxMinutes}
                placeholder={String(rules?.effectiveSessionMaxMinutes ?? '')}
                onChange={(event) => setMaxMinutes(event.target.value)}
              />
            )}
          </FormField>
          <FormField label={t('admin.zones.rules.freeLabel')} hint={t('admin.zones.rules.freeHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                type="number"
                min={0}
                style={{ width: 120 }}
                value={freeMinutes}
                placeholder={String(rules?.effectiveFreeMinutes ?? 0)}
                onChange={(event) => setFreeMinutes(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <Checkbox
          label={t('admin.zones.rules.ownScheduleLabel')}
          checked={ownSchedule}
          onChange={(event) => {
            setSaved(false);
            setOwnSchedule(event.target.checked);
          }}
        />
        {ownSchedule ? (
          <>
            {/* A zone with its own timetable and no band at all never charges. Said in words,
                because an empty list reads as "not filled in yet" and it means "free". */}
            {week.every((day) => day.bands.length === 0) ? (
              <Alert tone="warning">{t('admin.zones.rules.freeZoneWarning')}</Alert>
            ) : null}
            {week.map((day) => (
              <div key={day.weekday} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 96 }}>{t(WEEKDAY_KEY[day.weekday])}</strong>
                {day.bands.length === 0 ? (
                  <span className="lx-text-meta">{t('admin.zones.rules.dayFree')}</span>
                ) : (
                  <>
                    <Input
                      aria-label={t('admin.settings.schedule.fromLabel')}
                      type="time"
                      value={day.bands[0]?.startsAt ?? '07:00'}
                      onChange={(event) =>
                        setWeek((current) =>
                          current.map((row) =>
                            row.weekday === day.weekday
                              ? { ...row, bands: [band(event.target.value, row.bands[0]?.endsAt ?? '18:00')] }
                              : row,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label={t('admin.settings.schedule.toLabel')}
                      type="time"
                      value={day.bands[0]?.endsAt ?? '18:00'}
                      onChange={(event) =>
                        setWeek((current) =>
                          current.map((row) =>
                            row.weekday === day.weekday
                              ? { ...row, bands: [band(row.bands[0]?.startsAt ?? '07:00', event.target.value)] }
                              : row,
                          ),
                        )
                      }
                    />
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setWeek((current) =>
                      current.map((row) =>
                        row.weekday === day.weekday
                          ? { ...row, bands: row.bands.length === 0 ? [band('07:00', '18:00')] : [] }
                          : row,
                      ),
                    )
                  }
                >
                  {t(
                    day.bands.length === 0
                      ? 'admin.settings.schedule.addBand'
                      : 'admin.settings.schedule.removeBand',
                  )}
                </Button>
              </div>
            ))}
          </>
        ) : null}

        <div className="lx-dialog-actions">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" fullWidth loading={updateMutation.isPending} onClick={() => void handleSave()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
