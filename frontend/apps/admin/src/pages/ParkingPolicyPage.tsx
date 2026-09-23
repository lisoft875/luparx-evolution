import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ParkingPolicy } from '@luparx/api-client';
import { RequirePermission } from '@luparx/auth';
import { formatDurationLabel, formatDurationWithMinutes } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  SectionHeader,
  SummaryList,
  SummaryRow,
} from '@luparx/ui';
import type { ConfirmChange } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useParkingPolicy, useUpdateParkingPolicy } from '../lib/queries';

/**
 * Canonicalises a list of minute options exactly as `MinuteIncrements` does on the server: positive
 * only, sorted, duplicate-free. Done here so the chips an administrator sees are the row that will
 * be stored — a screen that let `60, 30, 60` look different from `30, 60` would be showing a state
 * the database cannot hold.
 */
function canonical(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

interface MinuteListProps {
  values: number[];
  onChange: (values: number[]) => void;
  label: string;
  addLabel: string;
  removeLabel: (minutes: string) => string;
  emptyLabel: string;
  disabled?: boolean;
  format: (minutes: number) => string;
}

/**
 * The editor for one ladder of minute options.
 *
 * <p>Chips and a number field rather than the comma-separated text the column actually stores: the
 * stored form is a serialisation detail, and asking an administrator to type <code>15,30,60,120</code>
 * is asking them to make a syntax error that comes back as a validation code. Each chip is a real
 * button with its own label, so removing an option is one click and one unambiguous announcement.</p>
 */
function MinuteList({
  values,
  onChange,
  label,
  addLabel,
  removeLabel,
  emptyLabel,
  disabled,
  format,
}: MinuteListProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const parsed = Number(draft);
  const canAdd = Number.isInteger(parsed) && parsed > 0 && !values.includes(parsed);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--lx-space-3)' }}>
        {values.length === 0 ? (
          <span className="lx-text-meta">{emptyLabel}</span>
        ) : (
          values.map((value) => (
            <button
              key={value}
              type="button"
              className="lx-chip"
              disabled={disabled}
              aria-label={removeLabel(format(value))}
              onClick={() => onChange(values.filter((candidate) => candidate !== value))}
            >
              {format(value)} ×
            </button>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 140 }}>
          <FormField label={label}>
            {({ inputId }) => (
              <Input
                id={inputId}
                type="number"
                min={1}
                inputMode="numeric"
                disabled={disabled}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAdd) {
                    event.preventDefault();
                    onChange(canonical([...values, parsed]));
                    setDraft('');
                  }
                }}
              />
            )}
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !canAdd}
          onClick={() => {
            onChange(canonical([...values, parsed]));
            setDraft('');
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * What this municipality sells, and under what rules (CONTRACT.md v0.18, simplified in v0.23).
 *
 * <p>Everything a citizen can do with a stay is decided here: which durations they may buy, whether
 * they may extend, whether finishing early gives the unused minutes back, and how long after
 * expiry a car is still not fineable. It is the screen with the widest blast radius in the portal.</p>
 *
 * <h2>It previews the citizen's picker</h2>
 *
 * <p>The ladder is not a list of numbers, it is the dropdown a person will open in the street. The
 * preview is drawn with the same formatter the citizen app uses ({@code formatDurationLabel} in
 * `@luparx/features`), because a preview with its own copy of the rule is a preview that can
 * disagree with the thing it previews.</p>
 *
 * <h2>The list is the floor and the ceiling</h2>
 *
 * <p>{@code sessionMinMinutes} and {@code sessionMaxMinutes} used to be their own fields, and the
 * three could disagree: a municipality selling 15 minutes with a minimum of 30 showed the citizen an
 * option the server then refused with {@code INVALID_INCREMENT}, and nobody found out until somebody
 * in the street could not park. The screen had grown a warning to detect a contradiction the screen
 * itself was inviting.</p>
 *
 * <p>Since v0.23 both are <b>derived</b> from the durations on sale — the first and the last of them.
 * The contradiction is now unrepresentable, so the warning is gone rather than merely silenced. They
 * are still sent, because the server still stores them and the extension ceiling is still measured
 * against the maximum; they are just no longer a second place to say what the list already says.</p>
 *
 * <h2>It replaces the whole policy</h2>
 *
 * <p>`PUT /admin/parking/policy` takes every field, so this is one form with one save and not eleven
 * inline edits: a policy is coherent as a whole — the extension ceiling has to clear the session
 * maximum, credit needs early finish — and field-at-a-time saving would walk through states the
 * server has to refuse.</p>
 */
export function ParkingPolicyPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const policyQuery = useParkingPolicy();
  const updateMutation = useUpdateParkingPolicy();

  const [form, setForm] = useState<ParkingPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Lo que se va a mandar, esperando un «sí». `null` cuando no hay confirmación abierta. */
  const [confirmando, setConfirmando] = useState<ParkingPolicy | null>(null);

  useEffect(() => {
    const stored = policyQuery.data;
    if (!stored) return;
    // The list is narrowed to what the stored floor and ceiling actually allowed, ONCE, on load.
    //
    // A municipality configured before v0.23 can hold a contradiction — 15 minutes on the list with a
    // minimum of 30 — where the 15 is offered to the citizen and then refused. Deriving the floor
    // from the list without this would make that dead option start working the moment somebody opened
    // this screen and pressed save: the municipality would begin selling quarter-hour stays without
    // anyone deciding to. A settings screen must not change what is sold merely by being opened.
    //
    // So what loads is what is effectively on sale today. Wanting the 15 back is one click, and it is
    // then an act somebody took.
    setForm({
      ...stored,
      sessionIncrementsMinutes: stored.sessionIncrementsMinutes.filter(
        (minutes) => minutes >= stored.sessionMinMinutes && minutes <= stored.sessionMaxMinutes,
      ),
    });
  }, [policyQuery.data]);

  const format = (minutes: number): string => formatDurationLabel(minutes, tPlural);

  function patch(changes: Partial<ParkingPolicy>): void {
    setSaved(false);
    setForm((current) => (current ? { ...current, ...changes } : current));
  }

  /**
   * What the citizen is offered: the list, canonicalised, and nothing else.
   *
   * <p>Until v0.23 a floor and a ceiling were configured separately, and the three could disagree —
   * a municipality selling 15 minutes with a minimum of 30 showed the citizen an option the server
   * then refused with {@code INVALID_INCREMENT}. The screen had to grow a warning to detect a
   * contradiction it was itself inviting. Now <b>the list is the floor and the ceiling</b>: they are
   * derived below, so the contradiction is unrepresentable and there is nothing left to warn about.</p>
   */
  const offered = useMemo(() => canonical(form?.sessionIncrementsMinutes ?? []), [form]);

  /**
   * The floor and ceiling the server still requires, computed from the list. They keep meaning what
   * they meant — the shortest and longest stay sold in one go — they are just no longer a second
   * place to say it.
   */
  const derivedMin = offered[0] ?? 0;
  const derivedMax = offered[offered.length - 1] ?? 0;

  /**
   * Valida y abre la confirmación. NO guarda.
   *
   * <p>Esta pantalla decide qué duraciones se venden, cuánto dura la gracia antes de una boleta y
   * cuántos días vive el crédito de un ciudadano: todo eso cambia para el cantón entero en el
   * instante en que se manda, y hasta la auditoría del 22-09-2026 se mandaba con un clic. El
   * resumen que ya existía abajo decía cómo va a quedar; lo que faltaba era decir de qué estado se
   * viene, que es lo único que deja notar un 5 tecleado donde iba 15.</p>
   */
  function pedirConfirmacion(): void {
    if (!form) return;
    setError(null);
    setSaved(false);
    // A municipality that sells nothing is the one state the derived floor and ceiling cannot
    // express, and the server refuses it too — say so here, in words, rather than let it go and come
    // back as a field code.
    if (offered.length === 0) {
      setError(t('admin.policy.error.emptyList'));
      return;
    }
    // The remaining rule the server refuses outright: the ceiling including extensions has to clear
    // the longest stay on sale. Checked here as well so the answer is a sentence about the
    // municipality's own numbers rather than a field code from an HTTP response.
    if (form.extensionEnabled && form.extensionMaxTotalMinutes < derivedMax) {
      setError(t('admin.policy.error.extensionCeiling', { max: format(derivedMax) }));
      return;
    }
    // Lo canonicalizado y lo derivado se calculan ACÁ y no al confirmar: lo que se muestra en el
    // diálogo tiene que ser byte por byte lo que se manda, o la confirmación estaría confirmando
    // otra cosa.
    setConfirmando({
      sessionIncrementsMinutes: offered,
      sessionMinMinutes: derivedMin,
      sessionMaxMinutes: derivedMax,
      extensionEnabled: form.extensionEnabled,
      extensionIncrementsMinutes: canonical(form.extensionIncrementsMinutes),
      extensionMaxTotalMinutes: form.extensionMaxTotalMinutes,
      earlyFinishEnabled: form.earlyFinishEnabled,
      creditOnEarlyFinishEnabled: form.creditOnEarlyFinishEnabled,
      creditMinRemainingMinutes: form.creditMinRemainingMinutes,
      creditExpiryDays: form.creditExpiryDays,
      graceMinutes: form.graceMinutes,
      overlappingStaysEnabled: form.overlappingStaysEnabled,
    });
  }

  async function handleSave(payload: ParkingPolicy): Promise<void> {
    try {
      await updateMutation.mutateAsync(payload);
      setConfirmando(null);
      setSaved(true);
    } catch {
      // El error vuelve al formulario: lo que hay que corregir está ahí, no en el diálogo.
      setConfirmando(null);
      setError(t('admin.policy.error.generic'));
    }
  }

  /**
   * Sólo lo que de verdad cambia.
   *
   * <p>Listar los doce campos en cada confirmación sería una pantalla que nadie lee dos veces. Lo
   * que no se tocó no aparece, así que lo que aparece es exactamente lo que hay que revisar.</p>
   *
   * <p>Un campo puede figurar sin que nadie lo haya tocado: al cargar, la pantalla recorta la lista
   * de duraciones a lo que el piso y el techo guardados permitían de verdad. Ese recorte ES un
   * cambio que se va a guardar, y por eso se muestra en vez de esconderse.</p>
   */
  function cambiosDe(nuevo: ParkingPolicy): ConfirmChange[] {
    const previo = policyQuery.data;
    if (!previo) return [];
    const lista = (minutos: readonly number[]): string =>
      minutos.length > 0 ? minutos.map(format).join(' · ') : t('admin.policy.preview.none');
    const siNo = (valor: boolean): string => (valor ? t('common.yes') : t('common.no'));
    const dias = (cantidad: number): string => tPlural('admin.policy.confirm.days', cantidad);

    const filas: ConfirmChange[] = [];
    const comparar = (label: string, antes: string, despues: string): void => {
      if (antes !== despues) filas.push({ label, before: antes, after: despues });
    };

    comparar(
      t('admin.policy.summary.session'),
      lista(previo.sessionIncrementsMinutes),
      lista(nuevo.sessionIncrementsMinutes),
    );
    comparar(t('admin.policy.confirm.extension'), siNo(previo.extensionEnabled), siNo(nuevo.extensionEnabled));
    comparar(
      t('admin.policy.confirm.extensionList'),
      lista(previo.extensionIncrementsMinutes),
      lista(nuevo.extensionIncrementsMinutes),
    );
    comparar(
      t('admin.policy.confirm.extensionMax'),
      format(previo.extensionMaxTotalMinutes),
      format(nuevo.extensionMaxTotalMinutes),
    );
    comparar(t('admin.policy.confirm.earlyFinish'), siNo(previo.earlyFinishEnabled), siNo(nuevo.earlyFinishEnabled));
    comparar(
      t('admin.policy.confirm.credit'),
      siNo(previo.creditOnEarlyFinishEnabled),
      siNo(nuevo.creditOnEarlyFinishEnabled),
    );
    comparar(
      t('admin.policy.confirm.creditMin'),
      format(previo.creditMinRemainingMinutes),
      format(nuevo.creditMinRemainingMinutes),
    );
    comparar(t('admin.policy.confirm.creditExpiry'), dias(previo.creditExpiryDays), dias(nuevo.creditExpiryDays));
    comparar(t('admin.policy.summary.grace'), format(previo.graceMinutes), format(nuevo.graceMinutes));
    comparar(
      t('admin.policy.summary.overlap'),
      siNo(previo.overlappingStaysEnabled),
      siNo(nuevo.overlappingStaysEnabled),
    );
    return filas;
  }

  if (!form) {
    return (
      <AdminShell>
        <h1>{t('admin.policy.title')}</h1>
        <p className="lx-text-meta">{policyQuery.isLoading ? t('common.loading') : t('admin.policy.error.generic')}</p>
      </AdminShell>
    );
  }

  /*
    Todo número de esta pantalla es una cantidad de MINUTOS, así que el sufijo va acá y no campo
    por campo: uno solo que se olvide vuelve a dejar un «720» que hay que adivinar. El sufijo se
    puede sobreescribir para los pocos que no son minutos (los días de vencimiento del crédito).
  */
  const number = (
    value: number,
    onChange: (next: number) => void,
    min = 0,
    disabled = false,
    suffix: React.ReactNode = t('common.unit.minutes'),
  ) => (
    <Input
      type="number"
      min={min}
      inputMode="numeric"
      disabled={disabled}
      value={String(value)}
      onChange={(event) => onChange(Number(event.target.value))}
      suffix={suffix}
    />
  );

  return (
    <AdminShell>
      <h1>{t('admin.policy.title')}</h1>
      <p className="lx-text-meta">{t('admin.policy.description')}</p>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}

      {/* What the citizen will actually be offered, before any of the editing below. It is the
          answer to the only question this screen exists to settle. */}
      <Card>
        <SectionHeader title={t('admin.policy.preview.title')} description={t('admin.policy.preview.description')} />
        {offered.length === 0 ? (
          <Alert tone="danger">{t('admin.policy.preview.none')}</Alert>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {offered.map((minutes) => (
              <span key={minutes} className="lx-chip" aria-hidden="false">
                {format(minutes)}
              </span>
            ))}
          </div>
        )}
      </Card>

      <RequirePermission permission="TENANT_MANAGE">
        <Card>
          <SectionHeader title={t('admin.policy.session.title')} description={t('admin.policy.session.description')} />
          <MinuteList
            values={form.sessionIncrementsMinutes}
            onChange={(values) => patch({ sessionIncrementsMinutes: values })}
            label={t('admin.policy.minuteField')}
            addLabel={t('admin.policy.addOption')}
            removeLabel={(minutes) => t('admin.policy.removeOption', { option: minutes })}
            emptyLabel={t('admin.policy.session.empty')}
            format={format}
          />
          {/* Read out rather than edited. The server still stores a floor and a ceiling, and this
              says what they will be — so the two numbers stay visible without being a second place
              to set them, which is what made them contradict the list. */}
          {offered.length > 0 ? (
            <p className="lx-text-meta" style={{ marginBottom: 0 }}>
              {t('admin.policy.session.range', { min: format(derivedMin), max: format(derivedMax) })}
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionHeader
            title={t('admin.policy.extension.title')}
            description={t('admin.policy.extension.description')}
          />
          <Checkbox
            label={t('admin.policy.extension.enabled')}
            hint={t('admin.policy.extension.enabledHint')}
            checked={form.extensionEnabled}
            onChange={(event) => patch({ extensionEnabled: event.target.checked })}
          />
          {/* Dimmed rather than removed: what a municipality has switched off is part of what this
              screen tells whoever opens it next. */}
          <div style={{ opacity: form.extensionEnabled ? 1 : 0.5, marginTop: 'var(--lx-space-3)' }}>
            <MinuteList
              values={form.extensionIncrementsMinutes}
              onChange={(values) => patch({ extensionIncrementsMinutes: values })}
              label={t('admin.policy.minuteField')}
              addLabel={t('admin.policy.addOption')}
              removeLabel={(minutes) => t('admin.policy.removeOption', { option: minutes })}
              emptyLabel={t('admin.policy.extension.empty')}
              disabled={!form.extensionEnabled}
              format={format}
            />
            <div style={{ width: 240, marginTop: 'var(--lx-space-4)' }}>
              <FormField
                label={t('admin.policy.field.extensionMaxTotal')}
                /*
                  La ayuda dice además cuánto es ESE número en horas: «12 horas (720 min)». Quien
                  escribe un techo en minutos no debería tener que dividir entre 60 para saber si
                  se pasó — y 720 es justo el valor donde el error no se nota.
                */
                hint={`${t('admin.policy.field.extensionMaxTotalHint')} ${formatDurationWithMinutes(
                  form.extensionMaxTotalMinutes,
                  tPlural,
                  t,
                )}.`}
              >
                {() =>
                  number(
                    form.extensionMaxTotalMinutes,
                    (value) => patch({ extensionMaxTotalMinutes: value }),
                    1,
                    !form.extensionEnabled,
                  )
                }
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.credit.title')} description={t('admin.policy.credit.description')} />
          <Checkbox
            label={t('admin.policy.credit.earlyFinish')}
            hint={t('admin.policy.credit.earlyFinishHint')}
            checked={form.earlyFinishEnabled}
            onChange={(event) =>
              // Turning early finish off takes the credit switch with it: minutes are earned by
              // finishing early, so crediting them without it is a state the server refuses and a
              // promise the citizen could never collect on.
              patch({
                earlyFinishEnabled: event.target.checked,
                creditOnEarlyFinishEnabled: event.target.checked && form.creditOnEarlyFinishEnabled,
              })
            }
          />
          <Checkbox
            label={t('admin.policy.credit.enabled')}
            hint={t('admin.policy.credit.enabledHint')}
            checked={form.creditOnEarlyFinishEnabled}
            disabled={!form.earlyFinishEnabled}
            onChange={(event) => patch({ creditOnEarlyFinishEnabled: event.target.checked })}
          />
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 'var(--lx-space-3)',
              opacity: form.creditOnEarlyFinishEnabled ? 1 : 0.5,
            }}
          >
            <div style={{ width: 220 }}>
              <FormField label={t('admin.policy.field.creditMin')} hint={t('admin.policy.field.creditMinHint')}>
                {() =>
                  number(
                    form.creditMinRemainingMinutes,
                    (value) => patch({ creditMinRemainingMinutes: value }),
                    0,
                    !form.creditOnEarlyFinishEnabled,
                  )
                }
              </FormField>
            </div>
            <div style={{ width: 220 }}>
              <FormField label={t('admin.policy.field.creditExpiry')} hint={t('admin.policy.field.creditExpiryHint')}>
                {() =>
                  number(
                    form.creditExpiryDays,
                    (value) => patch({ creditExpiryDays: value }),
                    0,
                    !form.creditOnEarlyFinishEnabled,
                    // Este campo son DÍAS, no minutos: el único del formulario que rompe la regla.
                    t('common.unit.days'),
                  )
                }
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.grace.title')} description={t('admin.policy.grace.description')} />
          <div style={{ width: 220 }}>
            <FormField label={t('admin.policy.field.grace')} hint={t('admin.policy.field.graceHint')}>
              {() => number(form.graceMinutes, (value) => patch({ graceMinutes: value }), 0)}
            </FormField>
          </div>
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Alert tone="info">{t('admin.policy.grace.notice', { minutes: format(form.graceMinutes) })}</Alert>
          </div>
        </Card>

        {/* The bay that nobody released (v0.37, ADR 0020). Its own card and not a line under the
            tolerance: the tolerance is about time running out, this is about a space that is free on
            the street and taken in the database, and the two are answered differently. */}
        <Card>
          <SectionHeader
            title={t('admin.policy.overlap.title')}
            description={t('admin.policy.overlap.description')}
          />
          <Checkbox
            label={t('admin.policy.overlap.enabled')}
            hint={t('admin.policy.overlap.enabledHint')}
            checked={form.overlappingStaysEnabled}
            onChange={(event) => patch({ overlappingStaysEnabled: event.target.checked })}
          />
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            {/* Both notices state a consequence for enforcement, because that is the only place the
                choice is felt. Turning it off is not neutral — it is a decision that the second
                citizen parks uncovered — and the screen says so rather than leaving it to be found
                out from a citation. */}
            <Alert tone={form.overlappingStaysEnabled ? 'info' : 'warning'}>
              {form.overlappingStaysEnabled
                ? t('admin.policy.overlap.notice')
                : t('admin.policy.overlap.offNotice')}
            </Alert>
          </div>
        </Card>

        <Card>
          <SectionHeader title={t('admin.policy.summary.title')} />
          <SummaryList>
            <SummaryRow
              label={t('admin.policy.summary.session')}
              value={offered.length > 0 ? offered.map(format).join(' · ') : t('admin.policy.preview.none')}
            />
            <SummaryRow
              label={t('admin.policy.summary.extension')}
              value={
                form.extensionEnabled
                  ? form.extensionIncrementsMinutes.map(format).join(' · ') || t('admin.policy.extension.empty')
                  : t('admin.policy.summary.off')
              }
            />
            <SummaryRow
              label={t('admin.policy.summary.credit')}
              value={
                form.creditOnEarlyFinishEnabled
                  ? t('admin.policy.summary.creditOn', {
                      min: format(form.creditMinRemainingMinutes),
                      days: form.creditExpiryDays,
                    })
                  : t('admin.policy.summary.off')
              }
            />
            <SummaryRow label={t('admin.policy.summary.grace')} value={format(form.graceMinutes)} />
            <SummaryRow
              label={t('admin.policy.summary.overlap')}
              value={
                form.overlappingStaysEnabled
                  ? t('admin.policy.summary.overlapOn')
                  : t('admin.policy.summary.off')
              }
            />
          </SummaryList>
          <div style={{ marginTop: 'var(--lx-space-4)' }}>
            <Button type="button" loading={updateMutation.isPending} onClick={() => pedirConfirmacion()}>
              {t('common.save')}
            </Button>
          </div>
        </Card>
      </RequirePermission>

      <ConfirmDialog
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        title={t('admin.policy.confirm.title')}
        message={
          confirmando && cambiosDe(confirmando).length === 0
            ? t('admin.policy.confirm.noChanges')
            : t('admin.policy.confirm.body')
        }
        changes={confirmando ? cambiosDe(confirmando) : undefined}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        closeLabel={t('common.close')}
        loading={updateMutation.isPending}
        onConfirm={() => confirmando && void handleSave(confirmando)}
      />
    </AdminShell>
  );
}
