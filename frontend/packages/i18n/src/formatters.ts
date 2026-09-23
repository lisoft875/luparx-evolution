import type { SupportedLocale } from './locale';
import { minorToMajor } from './currency';
import { applyNumberSymbolOverrides, currencyDisplayFractionDigits, localeHourCycle } from './presentation';

/**
 * Los campos que `Intl` NO deja convivir con `dateStyle`/`timeStyle`.
 *
 * <p>Pedir «mes corto y día» junto a un estilo entero no es una combinación rara: es un
 * {@code TypeError} en el constructor. Y como estos ayudantes traen el estilo por omisión, bastaba
 * con pedir `{ day: 'numeric', month: 'short' }` —una llamada que se lee perfectamente válida— para
 * que reventara. El 23-09-2026 eso dejó el portal de administración COMPLETAMENTE en blanco: no hay
 * error boundary, así que un formateo mal armado desmonta la aplicación entera.</p>
 */
const CAMPOS_SUELTOS = [
  'weekday',
  'era',
  'year',
  'month',
  'day',
  'dayPeriod',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'timeZoneName',
] as const;

/**
 * El estilo por omisión, salvo que quien llama esté pidiendo campos sueltos.
 *
 * <p>Ese «salvo» es el punto: un valor por omisión que no se puede quitar no es un valor por
 * omisión, es una trampa. Quien pide `{ month: 'short', day: 'numeric' }` está diciendo con
 * claridad que no quiere el estilo entero, y hasta ahora la única forma de decirlo era además
 * acordarse de escribir `dateStyle: undefined`.</p>
 */
function conEstilo(
  porOmision: Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (!options) return porOmision;
  const pideCampos = CAMPOS_SUELTOS.some((campo) => options[campo] !== undefined);
  return pideCampos ? { ...options } : { ...porOmision, ...options };
}

/** Locale-aware date formatting. Pass `timeZone` explicitly for tenant/user-zone conversion; UTC is the storage format. */
export function formatDate(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, conEstilo({ dateStyle: 'medium' }, options)).format(date);
}

/**
 * `hourCycle` defaults to the platform's per-locale clock convention
 * (`presentation.ts` — `es-CR` reads 24h, `en-US` 12h) — pass `hourCycle`
 * in `options` to override it for a specific call.
 */
export function formatDateTime(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    hourCycle: localeHourCycle(locale),
    ...conEstilo({ dateStyle: 'medium', timeStyle: 'short' }, options),
  }).format(date);
}

/**
 * Time-only formatting (e.g. an active session's expiry clock) — always
 * Intl, never a hand-built "HH:MM". `hourCycle` defaults the same way as
 * {@link formatDateTime}.
 */
export function formatTime(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    hourCycle: localeHourCycle(locale),
    ...conEstilo({ timeStyle: 'short' }, options),
  }).format(date);
}

/**
 * «Hace 8 minutos», en el idioma de quien mira.
 *
 * <p>Existe para las listas de actividad, donde la pregunta es <em>qué tan reciente</em> y no
 * <em>cuándo exactamente</em>. Un rastro de seis filas con la fecha completa en cada una obliga a
 * restar mentalmente seis veces para contestar lo único que se estaba preguntando.</p>
 *
 * <p>Se corta en la semana: más allá de eso «hace 23 días» ya no ubica a nadie y la fecha sí, así
 * que devuelve `null` y quien llama imprime la fecha. El corte es de este lado —y no una decisión
 * de cada pantalla— para que dos listas no elijan distinto.</p>
 *
 * <p>El futuro se formatea igual, sin caso especial: un reloj desincronizado por unos segundos
 * produce instantes «por venir», y tratarlos como error mostraría un hueco donde va un dato.</p>
 */
export function formatRelativeTime(
  value: Date | string,
  locale: SupportedLocale,
  now: Date = new Date(),
): string | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;

  const segundos = Math.round((date.getTime() - now.getTime()) / 1000);
  const magnitud = Math.abs(segundos);
  const formato = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (magnitud < 45) return formato.format(0, 'second');
  if (magnitud < 3600) return formato.format(Math.round(segundos / 60), 'minute');
  if (magnitud < 86_400) return formato.format(Math.round(segundos / 3600), 'hour');
  if (magnitud < 7 * 86_400) return formato.format(Math.round(segundos / 86_400), 'day');
  return null;
}

/**
 * Locale-aware number formatting. Grouping/decimal glyphs follow the
 * platform's per-locale presentation config (`presentation.ts`) rather than
 * whatever ICU's default CLDR data happens to pick — every other part of
 * the formatted string (digits, sign, any `options` requested) is still
 * entirely Intl's output, just re-assembled with `formatToParts` so only
 * those two glyphs are ever substituted.
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const parts = new Intl.NumberFormat(locale, options).formatToParts(value);
  return applyNumberSymbolOverrides(parts, locale);
}

/**
 * Formats an integer minor-unit amount (never a float) as a localized
 * currency string. Decimal digits *shown* follow the currency's display
 * policy (`presentation.ts` `currencyDisplayFractionDigits` — e.g. CRC is
 * shown with none) which is independent from `minorToMajor`'s ISO minor-unit
 * math used to derive the major-unit value in the first place. Grouping/
 * decimal glyphs follow the same locale-specific override as
 * {@link formatNumber}; the currency symbol's position and the sign are
 * still entirely ICU's decision for `locale`.
 */
export function formatCurrencyMinor(
  amountMinor: number,
  currencyCode: string,
  locale: SupportedLocale,
): string {
  // A currency ICU cannot use makes `Intl.NumberFormat` THROW, and a throw inside a render unmounts
  // the tree: the whole screen goes blank with nothing on it to explain why. That is exactly how the
  // municipal Tarifas screen failed in v0.21 — the server sends the amount wrapped and the adapter
  // that unwraps it was missing, so both numbers arrived `undefined`.
  //
  // The adapter is the fix (see WireParkingRate); this is the floor under it. A wrong-looking amount
  // is something an administrator can see, question and report. A blank page is not. The console line
  // is deliberate and unconditional: this can only happen when a response does not match its type, and
  // that has to be loud for whoever is looking at it.
  if (typeof currencyCode !== 'string' || !/^[A-Za-z]{3}$/.test(currencyCode)) {
    // eslint-disable-next-line no-console
    console.error(
      `formatCurrencyMinor: currency code ${JSON.stringify(currencyCode)} is not an ISO 4217 code.` +
        ' The amount is rendered without a symbol; the response almost certainly does not match its type.',
    );
    return Number.isFinite(amountMinor) ? formatNumber(amountMinor, locale) : '—';
  }
  const major = minorToMajor(amountMinor, currencyCode);
  const fractionDigits = currencyDisplayFractionDigits(currencyCode);
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).formatToParts(major);
  return applyNumberSymbolOverrides(parts, locale);
}

const pluralRulesCache = new Map<SupportedLocale, Intl.PluralRules>();

function pluralRulesFor(locale: SupportedLocale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Resolves the CLDR plural category for `count` in `locale` (zero/one/two/few/many/other).
 * Consumers look up `${baseKey}.${category}` in the dictionary, falling back to
 * `${baseKey}.other` when the specific category has no translation — deterministic,
 * never a runtime guess.
 */
export function pluralCategory(count: number, locale: SupportedLocale): Intl.LDMLPluralRule {
  return pluralRulesFor(locale).select(count);
}

/**
 * "lunes a las 7:00" — a weekday plus a clock time, for saying when something resumes
 * (CONTRACT.md v0.3 §"Horario de cobro": the citizen is told when charging starts again).
 *
 * Formatted in the municipality's time zone, not the device's: a schedule set by a municipality
 * is stated in that municipality's clock, or someone travelling reads the wrong hour. The
 * weekday is dropped when the instant falls on today, because "today at 7:00" is what a person
 * would say and "Tuesday at 7:00" makes them check a calendar.
 */
export function formatWeekdayTime(
  value: Date | string,
  locale: SupportedLocale,
  options: { timeZone?: string; now?: Date } = {},
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const timeZone = options.timeZone;
  const now = options.now ?? new Date();
  const sameDay =
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date) ===
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(now);
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    hourCycle: localeHourCycle(locale),
    timeZone,
  }).format(date);
  if (sameDay) return time;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone }).format(date);
  return `${weekday} · ${time}`;
}
