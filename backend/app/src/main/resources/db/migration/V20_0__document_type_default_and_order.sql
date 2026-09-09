-- =============================================================================================
-- V20_0 — cuál tipo de documento viene preseleccionado, y en qué orden se ofrecen.
--
-- El formulario de registro abría con el desplegable vacío y el cliente no tenía de dónde saber
-- cuál preseleccionar, así que la regla ("en Costa Rica, cédula") terminaba escrita a mano en el
-- frontend — es decir, en el lugar donde no se puede cambiar sin desplegar, y donde el segundo país
-- la hereda equivocada.
--
-- DOS COLUMNAS Y NO UNA. La alternativa era usar sólo `sort_order` y declarar que el primero es el
-- predeterminado. Se descartó por dos razones concretas:
--
--   1. Son dos hechos distintos. "Se muestra primero" y "viene marcado" coinciden hoy, pero un país
--      puede querer ofrecer el pasaporte arriba porque su portal lo usan sobre todo extranjeros y
--      aun así preseleccionar la cédula. Con una sola columna eso no se puede decir.
--   2. Con dos columnas el invariante es verificable por la base: un índice único parcial garantiza
--      **como máximo un predeterminado por país**. Con `sort_order = 0` como convención, reordenar
--      la lista cambiaría el predeterminado sin que nadie lo pidiera, que es exactamente la clase
--      de efecto secundario que un formulario de identidad no debe tener.
--
-- Ambas columnas llegan con DEFAULT, así que las filas existentes quedan válidas sin backfill y una
-- versión anterior de la aplicación sigue funcionando contra este esquema (despliegue en rolling).
-- =============================================================================================

ALTER TABLE identity_document_types
    ADD COLUMN sort_order integer NOT NULL DEFAULT 100,
    ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- El invariante, donde tiene que estar. Si mañana alguien marca dos predeterminados para un país,
-- falla el INSERT y no la interfaz. Parcial porque "ninguno marcado" es legítimo: un país nuevo
-- puede quedar sin preselección hasta que alguien decida cuál corresponde.
CREATE UNIQUE INDEX uq_identity_document_types_default
    ON identity_document_types (country_code)
    WHERE is_default;

COMMENT ON COLUMN identity_document_types.sort_order IS
    'Orden de presentación, ascendente. NO es alfabético: el documento que usa la mayoría va '
    'primero y OTHER va al final, porque un desplegable ordenado por casualidad hace que la opción '
    'más común quede en medio de la lista.';
COMMENT ON COLUMN identity_document_types.is_default IS
    'El que el formulario trae marcado al abrir. Como máximo uno por país, garantizado por '
    'uq_identity_document_types_default.';

-- Orden de presentación. Los huecos entre valores son a propósito: insertar un tipo nuevo entre dos
-- existentes no obliga a renumerar la tabla entera.
UPDATE identity_document_types SET sort_order = 10 WHERE type = 'NATIONAL_ID';
UPDATE identity_document_types SET sort_order = 20 WHERE type = 'FOREIGN_RESIDENT_ID';
UPDATE identity_document_types SET sort_order = 30 WHERE type = 'PASSPORT';
UPDATE identity_document_types SET sort_order = 40 WHERE type = 'TAX_ID';
UPDATE identity_document_types SET sort_order = 90 WHERE type = 'OTHER';

-- Predeterminado por país.
--
-- Costa Rica: NATIONAL_ID, la cédula de identidad — lo que pidió el usuario y lo que carga la
-- inmensa mayoría de quien va a estacionar en el país.
--
-- Para los demás países sembrados se aplica el mismo criterio, que se deja escrito porque es un
-- juicio y no un dato: **el documento que porta la mayoría residente**, nunca el pasaporte. El
-- pasaporte es de quien viene de visita; preseleccionarlo obligaría a cada residente a cambiar el
-- campo, que es el error contrario y más frecuente.
--
--   ES  NATIONAL_ID  el DNI. Quien reside sin DNI usa el NIE, que está un renglón más abajo.
--   MX  NATIONAL_ID  la CURP, que es la que identifica a una persona física ante cualquier trámite.
--   PA  NATIONAL_ID  la cédula panameña.
--   US  NATIONAL_ID  el SSN, y aquí con una salvedad honesta: en Estados Unidos el documento que
--                    una persona muestra para un trámite de tránsito es la licencia de conducir, y
--                    el catálogo todavía no tiene ese tipo. Se marca NATIONAL_ID para que el
--                    formulario no abra vacío, y queda anotado que este país hay que revisarlo el
--                    día que sea un mercado real: la corrección es una fila, no un despliegue.
UPDATE identity_document_types
   SET is_default = true
 WHERE type = 'NATIONAL_ID'
   AND country_code IN ('CR', 'ES', 'MX', 'PA', 'US')
   AND active;
