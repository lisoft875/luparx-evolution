import type { CitationStatus, Fine } from '@luparx/api-client';

/**
 * Qué cuenta como multa «abierta» y qué como multa «por pagar», en un solo lugar.
 *
 * Vivían dentro de `FinesPage`, y mientras tanto el Inicio tenía la respuesta escrita a mano: la
 * tarjeta de multas decía siempre «Sin multas pendientes», en verde y con un tic, sin consultar
 * nada. Alguien con una boleta impaga veía «al día» en la primera pantalla y sólo se enteraba si
 * entraba a Más → Multas (reportado el 2026-09-19). Dos pantallas que responden la misma pregunta
 * tienen que responderla con el mismo código.
 *
 * La distinción entre las dos listas no es cosmética:
 *
 *   - ABIERTAS incluye `APPEALED`, porque «Historial» es donde uno deja de mirar y una defensa
 *     esperando respuesta es justo lo que la persona va a volver a revisar (CONTRACT.md v0.17).
 *   - POR PAGAR **excluye** `APPEALED`: una multa apelada no debe nada hoy. Cobrarla en el
 *     contador del Inicio sería pedir plata por algo que la municipalidad todavía no resolvió.
 *
 * `CANCELLED`, `DISMISSED` y `PAID` no aparecen en ninguna de las dos: no necesitan nada de nadie.
 */
const ABIERTAS: ReadonlySet<CitationStatus> = new Set<CitationStatus>([
  'ISSUED',
  'UPHELD',
  'EXPIRED',
  'APPEALED',
]);

/** El conjunto pagable del servidor, sin `APPEALED`. */
const POR_PAGAR: ReadonlySet<CitationStatus> = new Set<CitationStatus>(['ISSUED', 'UPHELD', 'EXPIRED']);

/** ¿Sigue abierto el asunto para esta persona? Es el criterio de la pestaña «Pendientes». */
export function estaAbierta(fine: Pick<Fine, 'status'>): boolean {
  return ABIERTAS.has(fine.status);
}

/** ¿Se debe plata por esta multa hoy? Es el criterio del contador del Inicio. */
export function estaPorPagar(fine: Pick<Fine, 'status'>): boolean {
  return POR_PAGAR.has(fine.status);
}

/** Cuántas de estas multas se deben hoy, cuánto suman y en qué moneda. */
export function resumenPorPagar(fines: readonly Fine[]): {
  cantidad: number;
  totalMinor: number;
  currencyCode: string | null;
} {
  const deudas = fines.filter(estaPorPagar);
  return {
    cantidad: deudas.length,
    // `amountPayableMinor` y no `fineMinor`: lo que hay que pagar HOY, que con un descuento por
    // pronto pago vigente no es el monto nominal de la boleta.
    totalMinor: deudas.reduce((suma, fine) => suma + fine.amountPayableMinor, 0),
    // Una municipalidad cobra en una sola moneda, así que la de la primera deuda vale para todas;
    // null cuando no hay ninguna, que es cuando no se muestra monto.
    currencyCode: deudas[0]?.currencyCode ?? null,
  };
}
