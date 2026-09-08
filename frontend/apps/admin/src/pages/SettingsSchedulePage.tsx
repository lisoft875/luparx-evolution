import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ChargingBand, ChargingDay, ChargingException, Weekday } from '@luparx/api-client';
import { formatWeekdayTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Badge, Button, Card, Checkbox, DateField, FormField, Input, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useParkingScheduleSettings, useUpdateParkingSchedule } from '../lib/queries';

/** Monday first: the working week is what this screen is mostly about, and the free day should read as the exception it is. */
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

/** `HH:mm` → minutes from midnight. Returns null for anything a time input would not have produced. */
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

/**
 * When this municipality charges for parking (CONTRACT.md v0.3 §"Horario de cobro").
 *
 * Three levels, in the order the server resolves them: the round-the-clock switch wins over
 * everything; otherwise the weekly bands apply; and a dated exception overrides the weekday it
 * falls on. A weekday with no bands is a day that is not charged — which the screen states in
 * words next to the day, because an empty row is exactly the kind of thing an administrator reads
 * as "not configured yet" when it actually means "free parking every Sunday".
 *
 * Only the minutes inside a band are billed, so the citizen's parking flow reads the same
 * schedule and quotes accordingly; nothing here is duplicated as a rule in the app.
 */
export function SettingsSchedulePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const scheduleQuery = useParkingScheduleSettings();
  const updateMutation = useUpdateParkingSchedule();

  const [chargesAllDay, setChargesAllDay] = useState(false);
  const [week, setWeek] = useState<ChargingDay[]>([]);
  const [exceptions, setExceptions] = useState<ChargingException[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = scheduleQuery.data;
    if (!stored) return;
    setChargesAllDay(stored.chargesAllDay);
    setWeek(
      WEEKDAYS.map((weekday) => stored.week.find((day) => day.weekday === weekday) ?? { weekday, bands: [] }),
    );
    setExceptions(stored.exceptions ?? []);
  }, [scheduleQuery.data]);

  function updateDay(weekday: Weekday, bands: ChargingBand[]): void {
    setSaved(false);
    setWeek((current) => current.map((day) => (day.weekday === weekday ? { ...day, bands } : day)));
  }

  function updateException(index: number, patch: Partial<ChargingException>): void {
    setSaved(false);
    setExceptions((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setSaved(false);
    for (const day of week) {
      for (const slot of day.bands) {
        const start = toMinute(slot.startsAt);
        const end = toMinute(slot.endsAt);
        if (start === null || end === null || end <= start) {
          setError(t('admin.settings.schedule.error.invalidBand', { day: t(WEEKDAY_KEY[day.weekday]) }));
          return;
        }
      }
    }
    try {
      await updateMutation.mutateAsync({
        chargesAllDay,
        week: week.map((day) => ({
          weekday: day.weekday,
          bands: day.bands.map((slot) => band(slot.startsAt, slot.endsAt)),
        })),
        exceptions: exceptions.map((entry) => ({
          ...entry,
          bands: entry.bands.map((slot) => band(slot.startsAt, slot.endsAt)),
        })),
      });
      setSaved(true);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  const freeDays = week.filter((day) => day.bands.length === 0).map((day) => t(WEEKDAY_KEY[day.weekday]));

  return (
    <AdminShell>
      <h1>{t('admin.settings.schedule.title')}</h1>

      <Card>
        <SectionHeader
          title={t('admin.settings.schedule.title')}
          description={t('admin.settings.schedule.description', { timeZone: scheduleQuery.data?.timeZone ?? '—' })}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}
        {scheduleQuery.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <Checkbox
              label={t('admin.settings.schedule.allDayLabel')}
              hint={t('admin.settings.schedule.allDayHint')}
              checked={chargesAllDay}
              onChange={(event) => {
                setSaved(false);
                setChargesAllDay(event.target.checked);
              }}
            />

            {/* The at-a-glance answer to "which days are free?", stated before the editing grid so
                it is visible without reading seven rows. */}
            {!chargesAllDay ? (
              <Alert tone={freeDays.length > 0 ? 'info' : 'danger'}>
                {freeDays.length > 0
                  ? t('admin.settings.schedule.freeDaysSummary', { days: freeDays.join(', ') })
                  : t('admin.settings.schedule.noFreeDays')}
              </Alert>
            ) : null}

            <div
              aria-disabled={chargesAllDay}
              style={{ opacity: chargesAllDay ? 0.5 : 1, pointerEvents: chargesAllDay ? 'none' : undefined }}
            >
              {week.map((day) => (
                <div key={day.weekday} style={{ borderTop: '1px solid var(--lx-border)', padding: 'var(--lx-space-3) 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)', flexWrap: 'wrap' }}>
                    <strong style={{ minWidth: 110 }}>{t(WEEKDAY_KEY[day.weekday])}</strong>
                    {day.bands.length === 0 ? (
                      <Badge tone="neutral">{t('admin.settings.schedule.dayFree')}</Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => updateDay(day.weekday, [...day.bands, band('07:00', '18:00')])}
                    >
                      {t('admin.settings.schedule.addBand')}
                    </Button>
                  </div>
                  {day.bands.map((slot, index) => (
                    <div
                      key={`${day.weekday}-${index}`}
                      style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--lx-space-3)', flexWrap: 'wrap' }}
                    >
                      <FormField label={t('admin.settings.schedule.fromLabel')}>
                        {({ inputId }) => (
                          <Input
                            id={inputId}
                            type="time"
                            value={slot.startsAt}
                            onChange={(event) =>
                              updateDay(
                                day.weekday,
                                day.bands.map((b, i) => (i === index ? band(event.target.value, b.endsAt) : b)),
                              )
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={t('admin.settings.schedule.toLabel')}>
                        {({ inputId }) => (
                          <Input
                            id={inputId}
                            type="time"
                            value={slot.endsAt}
                            onChange={(event) =>
                              updateDay(
                                day.weekday,
                                day.bands.map((b, i) => (i === index ? band(b.startsAt, event.target.value) : b)),
                              )
                            }
                          />
                        )}
                      </FormField>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => updateDay(day.weekday, day.bands.filter((_, i) => i !== index))}
                      >
                        {t('admin.settings.schedule.removeBand')}
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          title={t('admin.settings.schedule.exceptions.title')}
          description={t('admin.settings.schedule.exceptions.description')}
        />
        {exceptions.length === 0 ? <p className="lx-text-meta">{t('admin.settings.schedule.exceptions.empty')}</p> : null}
        {exceptions.map((entry, index) => (
          <div
            key={`${entry.date}-${index}`}
            style={{ borderTop: '1px solid var(--lx-border)', padding: 'var(--lx-space-3) 0' }}
          >
            <div style={{ display: 'flex', gap: 'var(--lx-space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <FormField label={t('admin.settings.schedule.exceptions.dateLabel')}>
                {({ inputId }) => (
                  <DateField
                    id={inputId}
                    value={entry.date}
                    onChange={(event) => updateException(index, { date: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t('admin.settings.schedule.exceptions.labelLabel')} optionalLabel={t('common.optional')}>
                {({ inputId }) => (
                  <Input
                    id={inputId}
                    value={entry.label ?? ''}
                    onChange={(event) => updateException(index, { label: event.target.value })}
                  />
                )}
              </FormField>
              <Checkbox
                label={t('admin.settings.schedule.exceptions.chargesLabel')}
                checked={entry.charges}
                onChange={(event) =>
                  updateException(index, {
                    charges: event.target.checked,
                    // A day that is not charged has no hours to describe.
                    bands: event.target.checked ? entry.bands : [],
                    chargesAllDay: event.target.checked ? entry.chargesAllDay : false,
                  })
                }
              />
              {entry.charges ? (
                <Checkbox
                  label={t('admin.settings.schedule.exceptions.allDayLabel')}
                  checked={entry.chargesAllDay}
                  onChange={(event) =>
                    updateException(index, { chargesAllDay: event.target.checked, bands: event.target.checked ? [] : entry.bands })
                  }
                />
              ) : (
                <Badge tone="neutral">{t('admin.settings.schedule.dayFree')}</Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSaved(false);
                  setExceptions((current) => current.filter((_, i) => i !== index));
                }}
              >
                {t('admin.settings.schedule.exceptions.remove')}
              </Button>
            </div>
            {entry.charges && !entry.chargesAllDay ? (
              <div style={{ display: 'flex', gap: 'var(--lx-space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <FormField label={t('admin.settings.schedule.fromLabel')}>
                  {({ inputId }) => (
                    <Input
                      id={inputId}
                      type="time"
                      value={entry.bands[0]?.startsAt ?? '07:00'}
                      onChange={(event) =>
                        updateException(index, { bands: [band(event.target.value, entry.bands[0]?.endsAt ?? '18:00')] })
                      }
                    />
                  )}
                </FormField>
                <FormField label={t('admin.settings.schedule.toLabel')}>
                  {({ inputId }) => (
                    <Input
                      id={inputId}
                      type="time"
                      value={entry.bands[0]?.endsAt ?? '18:00'}
                      onChange={(event) =>
                        updateException(index, { bands: [band(entry.bands[0]?.startsAt ?? '07:00', event.target.value)] })
                      }
                    />
                  )}
                </FormField>
              </div>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSaved(false);
            setExceptions((current) => [
              ...current,
              { date: new Date().toISOString().slice(0, 10), charges: false, chargesAllDay: false, label: '', bands: [] },
            ]);
          }}
        >
          {t('admin.settings.schedule.exceptions.add')}
        </Button>
      </Card>

      <Button type="button" onClick={handleSave} loading={updateMutation.isPending}>
        {t('common.save')}
      </Button>
      {scheduleQuery.data ? (
        <p className="lx-text-meta">
          {scheduleQuery.data.chargingNow
            ? t('admin.settings.schedule.chargingNow')
            : t('admin.settings.schedule.notChargingNow', {
                resumesAt: scheduleQuery.data.nextChargingStartsAt
                  ? formatWeekdayTime(scheduleQuery.data.nextChargingStartsAt, locale, {
                      timeZone: scheduleQuery.data.timeZone,
                    })
                  : '—',
              })}
        </p>
      ) : null}
    </AdminShell>
  );
}
