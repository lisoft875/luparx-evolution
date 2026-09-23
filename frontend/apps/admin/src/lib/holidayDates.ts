import type { HolidayObservance } from '@luparx/api-client';

/**
 * Un feriado tiene TRES fechas, y la pantalla las trataba como una sola.
 *
 * <p>La auditoría del portal (22-09-2026) lo marcó como P0 y tenía razón: el catálogo mostraba
 * «25 de julio · Se traslada al lunes» cuando la fecha impresa ya ERA el lunes. Quien lo leía
 * entendía lo contrario de lo que decía, y lo que está en juego es en qué día se deja de cobrar en
 * todo el cantón.</p>
 *
 * <p>Las tres, con el nombre que este módulo les da:</p>
 *
 * <ol>
 *   <li><b>Fecha de ley</b> — el día del año que dice la ley: 25 de julio. No lleva año porque no
 *       es de un año; es la regla. Para los feriados de Semana Santa no existe como día del año:
 *       se define por su distancia al Domingo de Resurrección, así que se nombra («Jueves Santo»)
 *       en vez de fecharse.</li>
 *   <li><b>Traslado</b> — si la ley lo corre al lunes siguiente. Un feriado que ya cae lunes se
 *       queda donde está.</li>
 *   <li><b>Fecha efectiva</b> — el día en que de verdad no se cobra, después del traslado. Es la
 *       única que le importa al ciudadano parqueado y la única que el servidor calcula
 *       (`nextDate` de la excepción, `thisYear` del catálogo). Con traslado, NO es la de ley.</li>
 * </ol>
 *
 * <p>Este módulo existe para poder imprimir la primera, que es la única que el servidor no manda
 * ya formateada: viaja como mes y día sueltos.</p>
 */

/** Un año bisiesto cualquiera: el 29 de febrero es una fecha de ley válida y tiene que formatearse. */
const ANIO_CUALQUIERA = 2024;

/**
 * «25 de julio» a partir del mes y el día, sin año.
 *
 * <p>Sin año a propósito: la fecha de ley es un día del calendario, no un día concreto, y ponerle
 * uno invitaría a confundirla con la fecha efectiva de este año, que es justamente el error que
 * este módulo viene a cerrar.</p>
 *
 * <p>Devuelve `null` cuando todavía no hay mes o día que formatear —una excepción a medio
 * escribir— o cuando el par no es una fecha real.</p>
 */
export function fechaDeLey(
  month: number | null | undefined,
  day: number | null | undefined,
  locale: string,
): string | null {
  if (month == null || day == null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fecha = new Date(Date.UTC(ANIO_CUALQUIERA, month - 1, day));
  // `Date` corrige en silencio un 31 de abril y lo vuelve 1 de mayo. Mostrar esa corrección sería
  // inventarle a la municipalidad una fecha que nadie escribió.
  if (fecha.getUTCMonth() !== month - 1 || fecha.getUTCDate() !== day) return null;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fecha);
}

/** Si la ley corre este feriado al lunes siguiente. */
export function seTraslada(observance: HolidayObservance | null | undefined): boolean {
  return observance === 'MONDAY';
}
