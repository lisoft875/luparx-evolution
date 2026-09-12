-- =============================================================================================
-- V34_0 — Una bahía puede sostener más de una estadía viva.
--
-- El caso real: alguien paga dos horas, se va a los quince minutos y no finaliza su estadía. La
-- bahía queda física y legítimamente libre, pero para la plataforma sigue ocupada durante una hora
-- y cuarenta y cinco minutos. Hasta la v0.37 el siguiente ciudadano recibía SPACE_OCCUPIED: la
-- plataforma le impedía pagar por un espacio en el que ya estaba parqueado, y lo dejaba —esto es lo
-- caro— sin nada que mostrarle al fiscalizador. No pagó porque no lo dejamos, y la boleta se la
-- lleva él.
--
-- No es la bahía la que está cubierta, es la placa. `PlateVerdict` (ADR 0014) ya resuelve la
-- consulta como «¿tiene ESTA placa una estadía viva en ESTA bahía?», recorriendo las estadías de la
-- placa y quedándose con la del `space_id` consultado. Dos estadías vivas en una misma bahía, de dos
-- placas distintas, dan COVERED cada una por su lado: ninguno de los dos carros es multado, que es
-- exactamente lo que se pide. Lo único que faltaba era permitir que la segunda estadía exista.
--
-- Esta migración hace dos cosas y sólo dos:
--
--   1. `parking_policies.overlapping_stays_enabled` — la decisión es del municipio, no de la
--      plataforma. Cobrarle a dos personas por la misma bahía en la misma ventana es defendible
--      (la culpa es de quien no finalizó) y también objetable (se cobró dos veces un espacio), y
--      esa discusión es política municipal. Como toda regla de negocio, es una columna y no una
--      constante en Java (CONTRACT.md v0.2).
--
--   2. Sustituye el invariante de esquema. `uq_parking_sessions_active_space` decía «una sola
--      estadía viva por bahía» y es justo lo que deja de ser cierto. Lo reemplaza uno más estrecho
--      y más útil: una misma PLACA no puede tener dos estadías vivas en la misma bahía. Eso sigue
--      resolviendo en la base la carrera entre dos réplicas para el único caso que corrompe algo
--      —cobrarle dos veces a la misma persona por el mismo espacio— y deja pasar el caso que
--      ahora es legítimo: dos placas distintas.
-- =============================================================================================

ALTER TABLE parking_policies
    ADD COLUMN overlapping_stays_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN parking_policies.overlapping_stays_enabled IS
    'Si esta municipalidad permite que una bahía sostenga más de una estadía viva a la vez. TRUE '
    'por defecto: el ciudadano que llega a un espacio libre puede pagarlo aunque el anterior no '
    'haya finalizado el suyo, y queda cubierto ante el fiscalizador por su propia placa. En FALSE '
    'el servicio responde SPACE_OCCUPIED, que es el comportamiento anterior a la v0.37.';

-- El invariante viejo. Se va con su comentario; a partir de aquí el esquema no opina sobre cuántas
-- estadías vivas caben en una bahía, porque la respuesta depende de la política del municipio y un
-- índice parcial no puede consultar otra tabla.
DROP INDEX uq_parking_sessions_active_space;

CREATE UNIQUE INDEX uq_parking_sessions_active_space_plate
    ON parking_sessions (space_id, plate_snapshot)
    WHERE status = 'ACTIVE';

COMMENT ON INDEX uq_parking_sessions_active_space_plate IS
    'Una placa no puede tener dos estadías vivas en la misma bahía. Dos placas distintas sí, desde '
    'la v0.37 y sujeto a parking_policies.overlapping_stays_enabled. Sustituye a '
    'uq_parking_sessions_active_space: dos réplicas que carreen sobre la misma bahía con la misma '
    'placa siguen perdiendo la carrera aquí y no en la memoria de la aplicación.';
