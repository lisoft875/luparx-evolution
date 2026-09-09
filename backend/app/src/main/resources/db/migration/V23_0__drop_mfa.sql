-- V23_0 — retira el segundo factor del modelo de datos (CONTRACT.md v0.20, ADR 0016).
--
-- FASE DE CONTRACCIÓN (ADR 0010). Esta migración BORRA datos y estructura, así que va DESPUÉS del
-- despliegue del código que dejó de leerlas, nunca junto con él en un despliegue progresivo: una
-- instancia vieja que todavía inserte `users.mfa_required` falla en cuanto la columna no está.
--
-- Se puede ejecutar de una sola vez, y no en dos pasos como exige la regla general, porque la
-- funcionalidad nunca estuvo activa en ningún ambiente: `luparx.security.mfa-enforced-portals`
-- siempre estuvo vacío, ningún portal la exigía y no hay una sola fila en las dos tablas. No hay
-- estado de usuario que preservar ni ventana en la que alguien pierda el acceso a su cuenta.
--
-- Si esto se estuviera retirando de un sistema donde SÍ hubiera inscripciones activas, el orden
-- sería el contrario y en tres pasos: primero dejar de exigir el factor, después esperar a que
-- ningún usuario dependa de él para entrar, y sólo entonces borrar. Borrar de una es correcto aquí
-- justamente porque no hay nadie del otro lado.

-- Primero la tabla que apunta a la otra por usuario, aunque ambas cuelgan de `users` y no entre sí:
-- el orden hace la intención legible y no depende de que el motor resuelva las FK.
DROP TABLE IF EXISTS user_mfa_recovery_codes;
DROP TABLE IF EXISTS user_mfa_totp;

-- La bandera por usuario. `IF EXISTS` para que la migración sea idempotente frente a una base que
-- ya la hubiera perdido por otra vía.
ALTER TABLE users DROP COLUMN IF EXISTS mfa_required;
