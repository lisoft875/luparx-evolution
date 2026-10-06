import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Card, Checkbox, FormField, Input, SectionHeader } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useSpaceFormat, useUpdateSpaceFormat } from '../lib/queries';

const MIN_DIGITS = 1;
const MAX_DIGITS = 12;

/**
 * How a bay code is written in this municipality (CONTRACT.md v0.3 §"Formato del código de
 * espacio"): a prefix, how many characters follow it, and whether letters are allowed.
 *
 * The preview below the fields is built locally *only to show what the choice looks like* — the
 * regex the server actually validates against, and the example the citizen's field uses as its
 * placeholder, are both derived server-side and echoed back after saving. That is what the
 * "stored" line shows: the difference between the two lines is the difference between what you
 * are about to save and what is in force right now.
 */
export function SettingsSpaceFormatPage(): React.JSX.Element {
  const { t } = useTranslation();
  const formatQuery = useSpaceFormat();
  const updateMutation = useUpdateSpaceFormat();

  const [prefix, setPrefix] = useState('');
  // Texto y no número: `Number('')` es 0, así que un campo vacío a medio escribir se convertía en
  // un cero que dispara el error de rango antes de que la persona termine de teclear.
  const [digitsText, setDigitsText] = useState('4');
  const [allowLetters, setAllowLetters] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const digits = Number(digitsText);

  /*
    El error de rango se calcula, no se guarda (06-10-2026).

    Antes vivía en un `useState` que sólo se escribía al pulsar Guardar y sólo se limpiaba al pulsar
    Guardar otra vez: se escribía 13, salía el error, se corregía a 4 y el mensaje rojo seguía ahí
    contradiciendo lo que el campo mostraba. El informe lo pide explícitamente: «al volver a un valor
    válido o guardar correctamente, el error debe desaparecer».

    Derivado del valor actual, eso no puede pasar: el mensaje existe exactamente mientras el valor
    sea inválido. Lo que sí sigue en estado es el error del SERVIDOR, que no se puede derivar de
    nada que esté en pantalla.
  */
  const rangoInvalido = digitsText.trim() === '' || !Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS;
  const errorDeRango = rangoInvalido
    ? t('admin.settings.spaceFormat.error.digitsRange', { min: MIN_DIGITS, max: MAX_DIGITS })
    : null;

  useEffect(() => {
    const stored = formatQuery.data;
    if (!stored) return;
    setPrefix(stored.prefix ?? '');
    setDigitsText(String(stored.digits));
    setAllowLetters(stored.allowLetters);
  }, [formatQuery.data]);

  /*
    Sólo ilustración: el patrón que de verdad valida vuelve del servidor al guardar.

    Con un valor fuera de rango no se dibuja nada en vez de dibujar un ejemplo imposible: `'0'.repeat`
    de un número negativo lanza, y con 13 caracteres el ejemplo sugiere que algo que el servidor va a
    rechazar es válido.
  */
  const previewExample = rangoInvalido ? null : `${prefix}${'0'.repeat(Math.max(0, digits - 1))}1`;
  const previewPattern = rangoInvalido
    ? null
    : `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${allowLetters ? '[0-9A-Z]' : '[0-9]'}{${digits}}$`;

  async function handleSave(): Promise<void> {
    setSaveError(null);
    setSaved(false);
    // El botón ya está deshabilitado en este caso; la guarda queda igual, porque un botón
    // deshabilitado no es una validación, es una comodidad.
    if (rangoInvalido) return;
    try {
      await updateMutation.mutateAsync({ prefix: prefix.trim(), digits, allowLetters });
      setSaved(true);
    } catch {
      setSaveError(t('common.error.generic'));
    }
  }

  return (
    <AdminShell>
      <h1>{t('admin.settings.spaceFormat.title')}</h1>
      <Card>
        <SectionHeader
          title={t('admin.settings.spaceFormat.title')}
          description={t('admin.settings.spaceFormat.description')}
        />
        {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
        {/* El éxito desaparece en cuanto se vuelve a tocar un campo: «Cambios guardados» sobre un
            formulario que ya no coincide con lo guardado es una afirmación falsa. */}
        {saved ? <Alert tone="success">{t('admin.settings.saved')}</Alert> : null}
        {formatQuery.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <FormField
              label={t('admin.settings.spaceFormat.prefixLabel')}
              hint={t('admin.settings.spaceFormat.prefixHint')}
              optionalLabel={t('common.optional')}
            >
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={prefix}
                  maxLength={8}
                  onChange={(event) => {
                    setSaved(false);
                    setPrefix(event.target.value.toUpperCase());
                  }}
                />
              )}
            </FormField>
            <FormField
              label={t('admin.settings.spaceFormat.digitsLabel')}
              hint={t('admin.settings.spaceFormat.digitsHint')}
              error={errorDeRango ?? undefined}
            >
              {({ inputId, describedBy }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  type="number"
                  inputMode="numeric"
                  min={MIN_DIGITS}
                  max={MAX_DIGITS}
                  invalid={rangoInvalido}
                  value={digitsText}
                  onChange={(event) => {
                    setSaved(false);
                    setDigitsText(event.target.value);
                  }}
                />
              )}
            </FormField>
            <Checkbox
              label={t('admin.settings.spaceFormat.allowLettersLabel')}
              hint={t('admin.settings.spaceFormat.allowLettersHint')}
              checked={allowLetters}
              onChange={(event) => {
                setSaved(false);
                setAllowLetters(event.target.checked);
              }}
            />
            <div style={{ marginTop: 'var(--lx-space-4)' }}>
              <p className="lx-text-card-title" style={{ margin: 0 }}>
                {t('admin.settings.spaceFormat.previewLabel')}
              </p>
              <p
                data-testid="space-format-preview"
                style={{ fontSize: 24, fontWeight: 700, margin: 'var(--lx-space-2) 0', letterSpacing: '0.08em' }}
              >
                {previewExample ?? '—'}
              </p>
              {previewPattern ? (
                <p className="lx-text-meta" style={{ wordBreak: 'break-all' }}>
                  {previewPattern}
                </p>
              ) : null}
              {formatQuery.data ? (
                <p className="lx-text-meta">
                  {t('admin.settings.spaceFormat.stored', {
                    example: formatQuery.data.example,
                    pattern: formatQuery.data.pattern,
                  })}
                </p>
              ) : null}
            </div>
            <Button type="button" onClick={handleSave} loading={updateMutation.isPending} disabled={rangoInvalido}>
              {t('common.save')}
            </Button>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
