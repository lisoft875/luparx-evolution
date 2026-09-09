-- =============================================================================================
-- V21_0 — Estacionar el carro de otra persona (CONTRACT.md v0.11).
--
-- Hasta aquí una sesión exigía un vehículo registrado por el ciudadano, así que prestarle el
-- servicio a un amigo obligaba a meter la placa ajena en la lista propia y dejarla ahí para
-- siempre. Ahora la sesión puede llevar una placa escrita en el momento y ningún vehículo detrás.
--
-- Dos columnas cambian:
--
--   vehicle_id    pasa a ser opcional. NULL significa exactamente una cosa —«placa escrita, no es
--                 un vehículo de este ciudadano»— y por eso no hace falta una bandera aparte.
--
--   vehicle_type  se copia en la sesión, no se resuelve por join, por la misma razón que
--                 plate_snapshot: es lo que el fiscalizador tiene enfrente en ese momento, y el
--                 ciudadano puede editar su vehículo después. Para una placa ajena es además el
--                 único lugar donde el dato existe.
--
-- La columna nueva entra con DEFAULT para que una instancia de la versión anterior, que todavía
-- inserta sin conocerla, siga escribiendo filas válidas durante un despliegue rodante
-- (expand-and-contract). El código nuevo siempre la escribe explícitamente.
-- =============================================================================================

ALTER TABLE parking_sessions ALTER COLUMN vehicle_id DROP NOT NULL;

ALTER TABLE parking_sessions ADD COLUMN vehicle_type varchar(32) NOT NULL DEFAULT 'CAR';

-- Las sesiones que ya existen sí tienen vehículo: se copia su tipo actual, que es lo más cercano a
-- lo que había cuando empezaron. El DEFAULT cubre lo que no se pueda resolver.
UPDATE parking_sessions s
   SET vehicle_type = v.type
  FROM vehicles v
 WHERE v.id = s.vehicle_id
   AND v.type IS NOT NULL;

ALTER TABLE parking_sessions
    ADD CONSTRAINT ck_parking_sessions_vehicle_type CHECK (vehicle_type IN ('CAR', 'MOTORCYCLE'));

COMMENT ON COLUMN parking_sessions.vehicle_id IS
    'El vehículo registrado del ciudadano, o NULL cuando la sesión se abrió con una placa escrita '
    'en el momento (el carro de un tercero). NULL no es un dato faltante: es el caso de uso.';
COMMENT ON COLUMN parking_sessions.vehicle_type IS
    'Copia del tipo de vehículo al iniciar la sesión, por la misma razón que plate_snapshot: es lo '
    'que el fiscalizador ve, y para una placa ajena es el único lugar donde el dato existe.';

-- Dos sesiones activas sobre la misma placa escrita, en la misma municipalidad, serían el mismo
-- carro cobrado dos veces. El índice sólo cubre las placas escritas (vehicle_id IS NULL): entre
-- vehículos registrados la plataforma ya acepta que dos ciudadanos tengan la misma placa
-- (CONTRACT.md v0.2, regla 2), y estrechar eso aquí cambiaría el comportamiento de datos que ya
-- existen. El solape entre una placa escrita y un vehículo registrado lo refusa el servicio dentro
-- de la transacción; cerrarlo también en el esquema exige antes revisar los datos de producción.
CREATE UNIQUE INDEX uq_parking_sessions_active_guest_plate
    ON parking_sessions (tenant_id, plate_snapshot)
    WHERE status = 'ACTIVE' AND vehicle_id IS NULL;
