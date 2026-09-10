-- V24_0 — precio propio por duración: la escalera de tarifas (CONTRACT.md v0.24).
--
-- Hasta ahora una zona tenía UNA tarifa: un monto por bloque de minutos, cobrado por bloque
-- empezado. Eso sólo puede expresar un precio lineal — 30 minutos siempre cuesta la mitad que una
-- hora — y las municipalidades no cobran así: 45 minutos a ₡400 junto a 60 minutos a ₡500 es lo
-- normal, y hoy es inexpresable.
--
-- FASE DE EXPANSIÓN (ADR 0010). Sólo agrega: una columna con default y dos índices. Ninguna fila
-- existente cambia de significado —todas quedan 'BLOCK', que es lo que ya eran— y una instancia
-- vieja que inserte sin nombrar la columna sigue escribiendo una fila válida.

-- Qué es esta fila: la base lineal de la zona, o el precio de una duración concreta.
--
-- 'BLOCK'  el monto cubre `minutes` minutos y se cobra por bloque empezado. Es el cimiento: sigue
--          siendo obligatorio, y es lo que responde por cualquier duración que no esté en la
--          escalera — incluidos los minutos guardados de un ciudadano, que son un número cualquiera
--          (CONTRACT.md v0.12) y por definición no pueden tener una entrada propia.
-- 'EXACT'  el monto ES el precio de una estadía de exactamente `minutes` minutos. No se multiplica
--          por nada. Gana sobre la base cuando la duración pedida coincide, y no hay nada que
--          desempatar: la coincidencia exacta es más específica que la fórmula, siempre.
ALTER TABLE parking_rates
    ADD COLUMN kind varchar(8) NOT NULL DEFAULT 'BLOCK';

ALTER TABLE parking_rates
    ADD CONSTRAINT ck_parking_rates_kind CHECK (kind IN ('BLOCK', 'EXACT'));

-- Los dos invariantes, en la base y no sólo en el servicio.
--
-- El proyecto de referencia deja esto a una comprobación en Java sobre el conjunto de reglas
-- activas, y el resultado es que dos altas concurrentes de la misma duración pasan las dos y dejan
-- la zona con un conflicto permanente que se manifiesta como un 409 en CADA cotización. Un índice
-- parcial único cuesta una línea y hace ese estado inalcanzable.
CREATE UNIQUE INDEX uq_parking_rates_open_block
    ON parking_rates (tenant_id, zone_id)
    WHERE valid_to IS NULL AND kind = 'BLOCK';

CREATE UNIQUE INDEX uq_parking_rates_open_exact
    ON parking_rates (tenant_id, zone_id, minutes)
    WHERE valid_to IS NULL AND kind = 'EXACT';

COMMENT ON COLUMN parking_rates.kind IS
    'BLOCK: monto por bloque empezado de `minutes` minutos (la base lineal de la zona, obligatoria). '
    'EXACT: el monto es el precio de una estadía de exactamente `minutes` minutos, sin multiplicar. '
    'Una coincidencia exacta gana sobre la base; lo que no esté en la escalera lo cobra la base.';
