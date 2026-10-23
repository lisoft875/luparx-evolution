import type { QueuedCitation } from './citationQueue';

/**
 * ¿Es posible que esta boleta sea la MISMA que una que ya se capturó?
 *
 * <h2>Qué problema resuelve, y cuál no</h2>
 *
 * <p>`deviceCitationId` e `Idempotency-Key` protegen el *reenvío*: la misma captura mandada dos
 * veces produce una sola boleta. Lo que ninguno de los dos puede ver es **dos capturas distintas
 * del mismo hecho** —el fiscalizador vuelve a la pantalla porque no está seguro de haber guardado,
 * o dos personas marcan el mismo carro—, porque cada captura nace con identificadores propios y
 * para el servidor son dos actos.</p>
 *
 * <p>Esto no lo impide. **Avisa**, y nada más. La diferencia es deliberada: una regla que bloquee
 * puede impedir una multa legítima —el mismo carro puede infringir dos veces en la misma cuadra en
 * media hora, y eso es exactamente lo que una zona de rotación castiga— y el costo de equivocarse
 * hacia ese lado es peor que el de una boleta repetida, que la municipalidad puede anular. Quien
 * decide es la persona que está mirando el carro.</p>
 *
 * <h2>De dónde sale el dato</h2>
 *
 * <p>De la cola de este aparato, que es el único origen fiable sin señal: contiene lo pendiente y
 * —durante el rato que sobreviven— lo ya enviado. No se consulta al servidor: un aviso que sólo
 * aparece con cobertura no serviría justo cuando más hace falta, y la pantalla de captura no puede
 * esperar una petición.</p>
 *
 * <p>Por eso el aviso dice «en este aparato». Lo que otro aparato capturó hace cinco minutos no se
 * ve desde acá, y afirmar lo contrario sería prometer una garantía que no existe.</p>
 */

/** La misma regla del contrato (CONTRACT.md §«Vehículos»): mayúsculas, sin espacios ni guiones. */
export function normalizarPlaca(cruda: string): string {
  return cruda.toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Cuánto hacia atrás se mira una boleta YA ENVIADA.
 *
 * <p>Media hora: es la escala de un hecho repetido por error —volver a la pantalla, dudar, volver a
 * capturar— y no la de dos infracciones de verdad. Una fila todavía pendiente se avisa sin importar
 * su edad: si no ha salido del aparato, sigue siendo la misma jornada.</p>
 */
export const VENTANA_MS = 30 * 60 * 1000;

export interface PosibleDuplicado {
  /** La captura anterior que se parece a ésta. */
  anterior: QueuedCitation;
  /** Minutos enteros transcurridos, para poder decirlo en una frase. */
  minutos: number;
  /** `true` cuando además coincide la bahía, que es la señal más fuerte. */
  mismaBahia: boolean;
}

export interface Candidata {
  plate: string;
  zoneId?: string | null;
  spaceCode?: string | null;
}

/**
 * La captura anterior que podría ser el mismo hecho, o `null`.
 *
 * <p>Se compara por PLACA, que es lo único que identifica al vehículo y lo único que siempre está.
 * La bahía refina el aviso pero no decide: un carro mal estacionado puede ser fotografiado desde
 * dos bahías contiguas y seguir siendo un solo hecho.</p>
 *
 * <p>Devuelve la coincidencia MÁS RECIENTE: es la que el fiscalizador recuerda y la que hace la
 * frase útil.</p>
 */
export function posibleDuplicado(
  filas: readonly QueuedCitation[],
  candidata: Candidata,
  ahoraMs: number = Date.now(),
): PosibleDuplicado | null {
  const placa = normalizarPlaca(candidata.plate.trim());
  if (placa.length === 0) return null;

  let mejor: PosibleDuplicado | null = null;
  for (const fila of filas) {
    if (normalizarPlaca(fila.payload.plate ?? '') !== placa) continue;
    const creada = Date.parse(fila.createdAt);
    if (!Number.isFinite(creada)) continue;
    // Una fila que todavía no salió del aparato se avisa siempre; una ya enviada, sólo si es
    // reciente. Pasada la ventana, dos boletas de la misma placa son dos hechos, no un error.
    const enviada = fila.state === 'SENT';
    const edad = ahoraMs - creada;
    if (enviada && (edad < 0 || edad > VENTANA_MS)) continue;

    const minutos = Math.max(0, Math.floor(edad / 60_000));
    const mismaBahia =
      Boolean(candidata.spaceCode) &&
      Boolean(fila.payload.spaceCode) &&
      candidata.spaceCode!.trim().toUpperCase() === fila.payload.spaceCode!.trim().toUpperCase();

    if (!mejor || creada > Date.parse(mejor.anterior.createdAt)) {
      mejor = { anterior: fila, minutos, mismaBahia };
    }
  }
  return mejor;
}
