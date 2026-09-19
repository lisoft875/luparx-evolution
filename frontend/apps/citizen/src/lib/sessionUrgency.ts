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
