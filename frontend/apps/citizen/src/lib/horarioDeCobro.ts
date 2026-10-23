import type { ParkingSchedule, Weekday } from '@luparx/api-client';

/**
 * El horario de cobro de la municipalidad, dicho en una línea — o nada.
 *
 * <h2>Por qué puede no decir nada</h2>
 *
 * <p>El servidor publica el horario como siete días con sus franjas, y eso admite formas que no
 * caben en una línea: franjas distintas cada día, dos tramos con pausa de mediodía, excepciones
 * por feriado. La ficha de la zona pide «horario … <b>sólo si está disponible</b>», y la lectura
 * honesta de «disponible» no es «hay datos», sino <b>«se puede decir entero y sin mentir»</b>.</p>
 *
 * <p>Así que esta función responde en tres casos y calla en los demás:</p>
 *
 * <ol>
 *   <li>se cobra a toda hora;</li>
 *   <li>todos los días que cobran lo hacen en <b>una sola franja y la misma</b>, y los días que no
 *       cobran son el resto;</li>
 *   <li>no se cobra ningún día.</li>
 * </ol>
 *
 * <p>Cualquier otra cosa devuelve <code>undefined</code> y la fila del horario no aparece. Media
 * verdad sobre cuándo se cobra es peor que el silencio: quien lea «7:00–18:00» donde en realidad
 * hay una pausa de doce a una va a volver a su carro creyendo que debe dinero, o creyendo que no.
 * El aviso de «ahora no se está cobrando», que es un dato puntual y exacto, se sigue dando aparte.</p>
 *
 * <p>Las excepciones —un feriado— no se callan ni se detallan: se anuncian. Callar la línea entera
 * porque la municipalidad tenga configurado el 15 de setiembre la haría desaparecer prácticamente
 * siempre, que fue el primer intento y era inútil. Detallarlas pediría evaluar fechas y recurrencias
 * en el cliente. Lo que sí es cierto los 365 días es «esto es lo que rige, salvo feriados», y eso es
 * lo que se dice cuando hay alguna.</p>
 */

/** El orden en que se nombran los días, que es el de la semana y no el del servidor. */
const ORDEN: Weekday[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];

export interface TextosDeHorario {
  /** «Se cobra a toda hora.» */
  todoElDia: string;
  /** «No se cobra ningún día.» */
  nunca: string;
  /**
   * Un tramo corrido de días: recibe `{ desde, hasta, inicio, fin }`.
   * Ejemplo: «Lunes a sábado, 7:00–18:00».
   */
  corrido: (v: { desde: string; hasta: string; inicio: string; fin: string }) => string;
  /** Un solo día: recibe `{ dia, inicio, fin }`. Ejemplo: «Domingo, 8:00–14:00». */
  unDia: (v: { dia: string; inicio: string; fin: string }) => string;
  /** El nombre de cada día, ya traducido. */
  dias: Record<Weekday, string>;
  /**
   * Cómo decir la línea cuando la municipalidad tiene feriados configurados. Recibe `{ base }`,
   * la línea ya escrita, y devuelve la misma con el «salvo feriados» que la hace cierta todo el año.
   */
  conFeriados: (v: { base: string }) => string;
}

/** Los minutos desde medianoche, escritos como los lee una persona. */
function comoHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function horarioDeCobro(
  horario: ParkingSchedule | undefined,
  textos: TextosDeHorario,
): string | undefined {
  if (!horario) return undefined;
  // Los feriados no borran la línea: la matizan. Ver la nota de arriba.
  const matizar = (linea: string): string => (horario.exceptions.length > 0
    ? textos.conFeriados({ base: linea })
    : linea);
  if (horario.chargesAllDay) return matizar(textos.todoElDia);

  const porDia = new Map(horario.week.map((d) => [d.weekday, d.bands]));
  const conCobro = ORDEN.filter((d) => (porDia.get(d) ?? []).length > 0);
  if (conCobro.length === 0) return matizar(textos.nunca);

  // Una sola franja por día, y la misma en todos los días que cobran. Si no, no cabe en una línea.
  const primera = porDia.get(conCobro[0]!)![0]!;
  const todasIguales = conCobro.every((d) => {
    const franjas = porDia.get(d)!;
    return franjas.length === 1
      && franjas[0]!.startMinute === primera.startMinute
      && franjas[0]!.endMinute === primera.endMinute;
  });
  if (!todasIguales) return undefined;

  // Y los días que cobran tienen que ser corridos: «lunes a sábado» es cierto, «lunes, miércoles y
  // sábado» no se puede escribir como un tramo y esta función no lo intenta.
  const indices = conCobro.map((d) => ORDEN.indexOf(d));
  const corridos = indices.every((n, i) => i === 0 || n === indices[i - 1]! + 1);
  if (!corridos) return undefined;

  const inicio = comoHora(primera.startMinute);
  const fin = comoHora(primera.endMinute);
  if (conCobro.length === 1) {
    return matizar(textos.unDia({ dia: textos.dias[conCobro[0]!], inicio, fin }));
  }
  return matizar(textos.corrido({
    desde: textos.dias[conCobro[0]!],
    hasta: textos.dias[conCobro[conCobro.length - 1]!],
    inicio,
    fin,
  }));
}
