-- =============================================================================================
-- V40_0 — la dirección deja de ser obligatoria.
--
-- POR QUÉ. El formulario de registro pedía país, provincia, cantón, distrito y dos líneas de
-- dirección antes de dejar avanzar. Además de ser largo, tenía un efecto medible: al elegir la
-- provincia el foco salta al campo «dirección 2 (opcional)», y la gente lee «opcional», asume que
-- lo que sigue también lo es y abandona el resto del formulario. Un registro que se abandona a la
-- mitad no es un dato incompleto: es un ciudadano menos.
--
-- Y el dato no se usa. Para cobrar un parqueo hace falta la placa, el espacio y el medio de pago.
-- Para notificar, el correo. La dirección no participa de ninguna regla de negocio hoy —ninguna
-- consulta la lee— así que se estaba pidiendo por si acaso, que es la peor razón para pedir un
-- dato personal. Pedir menos también es una decisión de privacidad: lo que no se guarda no se
-- puede filtrar.
--
-- QUÉ NO SE HACE: borrar las columnas. Esto es la fase de EXPANSIÓN (ADR 0010). Las direcciones ya
-- registradas se conservan, la aplicación anterior sigue funcionando contra este esquema, y si
-- mañana una municipalidad necesita la dirección —para notificar una boleta por correo postal, por
-- ejemplo— el campo vuelve a la pantalla sin migrar nada. La contracción, si alguna vez llega, será
-- otra migración con su propia decisión detrás.
-- =============================================================================================

ALTER TABLE users
    ALTER COLUMN address_country_code DROP NOT NULL,
    ALTER COLUMN address_line1        DROP NOT NULL;

COMMENT ON COLUMN users.address_country_code IS
    'Opcional desde la V40_0. El registro dejó de pedir dirección: no participa de ninguna regla de '
    'negocio y su presencia en el formulario hacía que la gente lo abandonara a la mitad.';
COMMENT ON COLUMN users.address_line1 IS
    'Opcional desde la V40_0 — ver address_country_code.';
