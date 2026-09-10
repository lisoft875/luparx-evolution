-- V25_0 — el código de la bahía, congelado en la estadía (CONTRACT.md v0.25).
--
-- Hasta ahora el código de la bahía de una estadía se resolvía EN VIVO contra parking_spaces: el
-- comprobante de una estadía de hace un año decía el código que la bahía tiene hoy, no el que tenía
-- cuando el ciudadano parqueó. Mientras el código fue inmutable eso daba lo mismo. Deja de darlo en
-- cuanto la municipalidad pueda corregirlo — que es exactamente lo que abre esta versión.
--
-- Las boletas ya guardaban su copia desde V17_0 (citations.space_code): esta migración le da a las
-- estadías la misma garantía, por la misma razón y con la misma forma que plate_snapshot (V11_0).
-- Renumerar una bahía es un hecho del presente; no debe reescribir lo que ya se cobró.
--
-- FASE DE EXPANSIÓN (ADR 0010). Sólo agrega una columna ANULABLE y la rellena. Ninguna fila cambia
-- de significado: el relleno escribe el mismo código que el mapper venía resolviendo en vivo. Una
-- instancia vieja que inserte sin nombrar la columna sigue escribiendo una fila válida, y el mapper
-- de esta versión sabe leerla (cae al código vivo cuando la copia es NULL), que es lo que permite
-- desplegar sin detener el servicio. El NOT NULL es la fase de contracción, en otra versión, cuando
-- ya no queden instancias capaces de escribir NULL.

ALTER TABLE parking_sessions
    ADD COLUMN space_code_snapshot varchar(16);

COMMENT ON COLUMN parking_sessions.space_code_snapshot IS
    'The bay code AS IT WAS when the stay started. A copy, not a join, exactly like plate_snapshot: '
    'a municipality that repaints a bay changes the bay from today onwards, and a receipt already '
    'issued must keep naming the bay the citizen actually parked in. NULL only on rows written by a '
    'version older than V25_0, where the reader falls back to the live code.';

-- Relleno: el código de hoy es el mejor dato disponible para lo ya escrito, y es literalmente lo que
-- el lector venía mostrando para esas filas. Se hace ahora, antes de que exista forma de renombrar,
-- así que para toda fila histórica la copia es exacta y no una aproximación.
UPDATE parking_sessions s
   SET space_code_snapshot = p.code
  FROM parking_spaces p
 WHERE p.id = s.space_id
   AND s.space_code_snapshot IS NULL;
