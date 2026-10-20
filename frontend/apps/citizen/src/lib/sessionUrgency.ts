/**
 * Cuán urgente es una estadía activa, en un solo lugar.
 *
 * El umbral de 600 s vivía como literal en tres archivos —`ActiveSessionsBar`, `HomePage` y el
 * valor por omisión de `Timer`—, así que cambiarlo exigía acordarse de los tres y una discrepancia
 * no la habría notado nadie: la barra podía estar en advertencia y la tarjeta del Inicio en verde.
 *
 * Y había un solo nivel. La guía de auditoría pide avisos PROGRESIVOS y que no dependan sólo del
 * color: diez minutos y treinta segundos eran el mismo estado visual, cuando la acción que
 * corresponde es distinta —«andá pensando en extender» contra «extendé ahora o te van a boletear».
 */
export type SessionUrgency = 'expired' | 'critical' | 'warning' | 'calm';

/** Cinco minutos: el punto donde ya no alcanza para volver al carro sin apurarse. */
export const CRITICAL_THRESHOLD_SECONDS = 300;

/** Diez minutos: el aviso que ya existía, ahora con un nivel por debajo. */
export const WARNING_THRESHOLD_SECONDS = 600;

export function urgencyOf(remainingSeconds: number): SessionUrgency {
  if (remainingSeconds <= 0) return 'expired';
  if (remainingSeconds <= CRITICAL_THRESHOLD_SECONDS) return 'critical';
  if (remainingSeconds <= WARNING_THRESHOLD_SECONDS) return 'warning';
  return 'calm';
}

/**
 * El tono de tarjeta que le toca a cada nivel.
 *
 * `critical` comparte `warning` con el nivel de arriba a propósito: el rojo queda reservado para
 * lo que YA pasó (vencido), y gastarlo en «faltan cuatro minutos» le quita el significado al
 * estado en que la persona puede recibir una boleta. Lo que distingue a `critical` no es el color
 * sino el texto, que es justamente lo que pedía la auditoría.
 */
export function cardToneFor(urgency: SessionUrgency): 'default' | 'success' | 'warning' | 'danger' {
  switch (urgency) {
    case 'expired':
      return 'danger';
    case 'critical':
    case 'warning':
      return 'warning';
    case 'calm':
      return 'success';
  }
}

/**
 * La clave del texto visible para cada nivel, o `null` cuando no hay nada que decir.
 *
 * Que exista este texto es el punto: un color más intenso no dice qué hacer, y quien no distingue
 * bien los colores —o mira la pantalla al sol— no ve ningún cambio.
 */
export function urgencyMessageKey(
  urgency: SessionUrgency,
): 'citizen.home.activeSession.urgency.critical' | 'citizen.home.activeSession.urgency.warning' | null {
  if (urgency === 'critical') return 'citizen.home.activeSession.urgency.critical';
  if (urgency === 'warning') return 'citizen.home.activeSession.urgency.warning';
  return null;
}

/** Todo lo que el Inicio dice sobre la estadía, decidido de una sola vez. */
export interface HomeSessionState {
  urgency: SessionUrgency;
  tone: 'default' | 'success' | 'warning' | 'danger';
  titleKey: 'citizen.home.activeSession.title' | 'citizen.home.activeSession.titleExpired';
  subtitleKey:
    | 'citizen.home.subtitle.noSession'
    | 'citizen.home.subtitle.activeSession'
    | 'citizen.home.subtitle.expiredSession';
  expiresAtKey: 'citizen.home.activeSession.expiresAt' | 'citizen.home.activeSession.expiredAt';
  /** «tiempo restante» no se escribe debajo de «Expirado»: ahí no hay tiempo restante. */
  showRemainingLabel: boolean;
  /** Qué decir una vez vencida, o `null` mientras siga vigente. */
  expiredMessage: 'withinGrace' | 'graceOver' | null;
}

/**
 * El estado del Inicio, en una sola función (19-10-2026).
 *
 * <h2>Por qué una sola</h2>
 *
 * <p>El P0 de hoy fue que la pantalla se contradecía: la insignia decía «Expirado» y el título
 * «Estacionamiento activo», con el saludo afirmando «Tu estacionamiento está activo» más arriba.
 * Ninguna de las tres frases estaba mal escrita; lo que estaba mal era que cada una decidía su
 * estado por su cuenta, y tres decisiones separadas sobre el mismo hecho tarde o temprano
 * discrepan.</p>
 *
 * <p>Por eso no es una función que devuelve «está vencida sí o no» y después cada bloque arma su
 * texto, sino una que devuelve <b>todos los textos juntos</b>. La contradicción deja de ser un
 * error que hay que recordar no cometer y pasa a ser un estado que no se puede representar: no
 * existe un {@link HomeSessionState} con el título en vencido y el saludo en activo.</p>
 *
 * @param graceMinutes la tolerancia que manda el servidor en la política de la municipalidad. Cero
 *                     es cero: una municipalidad sin tolerancia no debe ver ninguna promesa de
 *                     tolerancia.
 */
export function homeSessionState(params: {
  hasSession: boolean;
  remainingSeconds: number;
  secondsPastExpiry: number;
  graceMinutes: number;
}): HomeSessionState {
  const { hasSession, remainingSeconds, secondsPastExpiry, graceMinutes } = params;
  const urgency = urgencyOf(remainingSeconds);
  const vencida = hasSession && urgency === 'expired';
  const dentroDeLaGracia = vencida && graceMinutes > 0 && secondsPastExpiry < graceMinutes * 60;
  return {
    urgency,
    tone: cardToneFor(urgency),
    titleKey: vencida ? 'citizen.home.activeSession.titleExpired' : 'citizen.home.activeSession.title',
    subtitleKey: !hasSession
      ? 'citizen.home.subtitle.noSession'
      : vencida
        ? 'citizen.home.subtitle.expiredSession'
        : 'citizen.home.subtitle.activeSession',
    expiresAtKey: vencida ? 'citizen.home.activeSession.expiredAt' : 'citizen.home.activeSession.expiresAt',
    showRemainingLabel: !vencida,
    expiredMessage: !vencida ? null : dentroDeLaGracia ? 'withinGrace' : 'graceOver',
  };
}
