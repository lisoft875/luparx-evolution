import * as React from 'react';
import { useEffect, useState } from 'react';
import type {
  ChargingBand,
  ChargingDay,
  ChargingException,
  ExceptionRecurrence,
  HolidayCatalogEntry,
  Weekday,
} from '@luparx/api-client';
import { formatDate, formatWeekdayTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DateField,
  FormField,
  Input,
  SectionHeader,
  Select,
} from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useCountryHolidays, useParkingScheduleSettings, useUpdateParkingSchedule } from '../lib/queries';

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

/**
 * The moveable feasts, as distances from Easter Sunday.
 *
 * A short list rather than a free number: these are the days a municipality actually suspends
 * charging for, and asking somebody to type "-2" would be asking them to know the arithmetic.
 */
const EASTER_OFFSETS: { days: number; key: TranslationKey }[] = [
  { days: -3, key: 'admin.settings.schedule.exceptions.easter.maundyThursday' },
  { days: -2, key: 'admin.settings.schedule.exceptions.easter.goodFriday' },
  { days: 0, key: 'admin.settings.schedule.exceptions.easter.sunday' },
  { days: 1, key: 'admin.settings.schedule.exceptions.easter.monday' },
];

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
  const holidaysQuery = useCountryHolidays();
  const updateMutation = useUpdateParkingSchedule();

  const [chargesAllDay, setChargesAllDay] = useState(false);
  const [week, setWeek] = useState<ChargingDay[]>([]);
  const [exceptions, setExceptions] = useState<ChargingException[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  /**
   * Switching the rule clears the fields of the shape being left behind.
   *
   * Carrying a stale date on an annual rule would send the server a body it refuses, and — worse —
   * would leave a number on screen that no longer means anything.
   */
  function setRecurrence(index: number, recurrence: ExceptionRecurrence): void {
    const today = new Date();
    updateException(index, {
      recurrence,
      date: recurrence === 'ONCE' ? (exceptions[index]?.date ?? today.toISOString().slice(0, 10)) : null,
      month: recurrence === 'ANNUAL' ? (exceptions[index]?.month ?? today.getMonth() + 1) : null,
      day: recurrence === 'ANNUAL' ? (exceptions[index]?.day ?? today.getDate()) : null,
      easterOffsetDays: recurrence === 'EASTER' ? (exceptions[index]?.easterOffsetDays ?? -2) : null,
    });
  }

  /**
   * Copies a holiday out of the country catalogue into this municipality's own exceptions.
   *
   * A copy and never a link: from here on the row is the municipality's, and editing or deleting it
   * owes the platform no explanation. `charges: false` because a public holiday suspends charging —
   * a municipality that does charge on one can say so by ticking the box afterwards.
   */
  function addHoliday(holiday: HolidayCatalogEntry): void {
    setSaved(false);
    setExceptions((current) => [
      ...current,
      {
        date: null,
        charges: false,
        chargesAllDay: false,
        label: holiday.name,
        bands: [],
        recurrence: holiday.kind === 'EASTER' ? 'EASTER' : 'ANNUAL',
        month: holiday.month,
        day: holiday.day,
        easterOffsetDays: holiday.easterOffsetDays,
        observance: holiday.observance,
        holidayCode: holiday.code,
      },
    ]);
  }

  /*
    Validar y guardar eran lo mismo; ahora validar abre la confirmación. El horario decide cuándo
    se le cobra a todo el cantón, y se guardaba con un clic sin decir qué cambiaba (auditoría del
    22-09-2026, P0 de confirmación + auditoría).
  */
  function pedirConfirmacion(): void {
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
    setConfirmOpen(true);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setSaved(false);
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
              <FormField label={t('admin.settings.schedule.exceptions.repeatLabel')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={entry.recurrence ?? 'ONCE'}
                    onChange={(value) => setRecurrence(index, value as ExceptionRecurrence)}
                    options={[
                      { value: 'ONCE', label: t('admin.settings.schedule.exceptions.repeat.once') },
                      { value: 'ANNUAL', label: t('admin.settings.schedule.exceptions.repeat.annual') },
                      { value: 'EASTER', label: t('admin.settings.schedule.exceptions.repeat.easter') },
                    ]}
                  />
                )}
              </FormField>
              {/* Each shape asks for exactly its own data, and nothing else is shown: a month and a
                  day next to a full date would be two answers to one question. */}
              {(entry.recurrence ?? 'ONCE') === 'ONCE' ? (
                <FormField label={t('admin.settings.schedule.exceptions.dateLabel')}>
                  {({ inputId }) => (
                    <DateField
                      id={inputId}
                      value={entry.date ?? ''}
                      onChange={(event) => updateException(index, { date: event.target.value })}
                    />
                  )}
                </FormField>
              ) : null}
              {entry.recurrence === 'ANNUAL' ? (
                <>
                  <FormField label={t('admin.settings.schedule.exceptions.monthLabel')}>
                    {({ inputId }) => (
                      <Input
                        id={inputId}
                        type="number"
                        min={1}
                        max={12}
                        style={{ width: 90 }}
                        value={entry.month ?? ''}
                        onChange={(event) => updateException(index, { month: Number(event.target.value) || null })}
                      />
                    )}
                  </FormField>
                  <FormField label={t('admin.settings.schedule.exceptions.dayLabel')}>
                    {({ inputId }) => (
                      <Input
                        id={inputId}
                        type="number"
                        min={1}
                        max={31}
                        style={{ width: 90 }}
                        value={entry.day ?? ''}
                        onChange={(event) => updateException(index, { day: Number(event.target.value) || null })}
                      />
                    )}
                  </FormField>
                  <Checkbox
                    label={t('admin.settings.schedule.exceptions.mondayLabel')}
                    checked={entry.observance === 'MONDAY'}
                    onChange={(event) =>
                      updateException(index, { observance: event.target.checked ? 'MONDAY' : 'EXACT' })
                    }
                  />
                </>
              ) : null}
              {entry.recurrence === 'EASTER' ? (
                <FormField label={t('admin.settings.schedule.exceptions.easterLabel')}>
                  {({ inputId }) => (
                    <Select
                      id={inputId}
                      value={String(entry.easterOffsetDays ?? -2)}
                      onChange={(value) => updateException(index, { easterOffsetDays: Number(value) })}
                      options={EASTER_OFFSETS.map((offset) => ({
                        value: String(offset.days),
                        label: t(offset.key),
                      }))}
                    />
                  )}
                </FormField>
              ) : null}
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
            {/* When the rule actually lands next. The server computes it — a person reading
                "Jueves Santo, se repite" should not have to work out Easter in their head. */}
            {entry.nextDate ? (
              <p className="lx-text-meta" style={{ margin: '4px 0 0' }}>
                {t('admin.settings.schedule.exceptions.nextDate', {
                  date: formatDate(entry.nextDate, locale),
                })}
              </p>
            ) : null}
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
              {
                date: new Date().toISOString().slice(0, 10),
                charges: false,
                chargesAllDay: false,
                label: '',
                bands: [],
                recurrence: 'ONCE',
                observance: 'EXACT',
              },
            ]);
          }}
        >
          {t('admin.settings.schedule.exceptions.add')}
        </Button>
      </Card>

      {/* --- the country's holidays, offered rather than typed (v0.31) ------------------------- */}
      <Card>
        <SectionHeader
          title={t('admin.settings.schedule.holidays.title')}
          description={t('admin.settings.schedule.holidays.description')}
        />
        {/* Said on the screen and not only in a manual: what a canton charges on is the canton's
            answer to give, and this list is where it starts, not where it ends. */}
        <Alert tone="info">{t('admin.settings.schedule.holidays.notice')}</Alert>
        {(holidaysQuery.data ?? []).length === 0 ? (
          <p className="lx-text-meta">{t('admin.settings.schedule.holidays.empty')}</p>
        ) : null}
        {(holidaysQuery.data ?? []).map((holiday) => {
          const added = holiday.alreadyAdded || exceptions.some((e) => e.holidayCode === holiday.code);
          return (
            <div
              key={holiday.code}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                borderTop: '1px solid var(--lx-border)',
                padding: 'var(--lx-space-2) 0',
              }}
            >
              <div>
                <div>{holiday.name}</div>
                <div className="lx-text-meta">
                  {holiday.thisYear ? formatDate(holiday.thisYear, locale) : '—'}
                  {holiday.observance === 'MONDAY'
                    ? ` · ${t('admin.settings.schedule.exceptions.mondayLabel')}`
                    : ''}
                </div>
              </div>
              {added ? (
                <Badge tone="success">{t('admin.settings.schedule.holidays.added')}</Badge>
              ) : (
                <Button type="button" variant="secondary" onClick={() => addHoliday(holiday)}>
                  {t('admin.settings.schedule.holidays.add')}
                </Button>
              )}
            </div>
          );
        })}
      </Card>

      <Button type="button" onClick={pedirConfirmacion} loading={updateMutation.isPending}>
        {t('common.save')}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('admin.settings.schedule.confirm.title')}
        message={t('admin.settings.schedule.confirm.body')}
        /*
          Un resumen de lo que queda, no el formulario entero: cuántos días cobran, si es 24 horas
          y cuántas excepciones hay. Quien llegó hasta acá ya vio el detalle; lo que necesita antes
          de confirmar es comprobar que no tocó algo sin querer.
        */
        changes={[
          {
            label: t('admin.settings.schedule.confirm.allDay'),
            after: chargesAllDay ? t('common.yes') : t('common.no'),
          },
          {
            label: t('admin.settings.schedule.confirm.days'),
            after: String(week.filter((day) => day.bands.length > 0).length),
          },
          {
            label: t('admin.settings.schedule.confirm.exceptions'),
            after: String(exceptions.length),
          },
        ]}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        closeLabel={t('common.close')}
        loading={updateMutation.isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSave();
        }}
      />
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
