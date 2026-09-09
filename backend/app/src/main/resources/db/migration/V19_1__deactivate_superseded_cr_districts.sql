-- =============================================================================================
-- V19_1 — dos distritos que dejaron de existir cuando se crearon Monteverde y Puerto Jiménez.
--
-- V19_0 cargó el árbol a partir de una instantánea de 2020 (82 cantones, 482 distritos) y le agregó
-- los cantones Monteverde (6-12, Ley 9903 de 2021) y Puerto Jiménez (6-13, Ley 10276 de 2022) con
-- su distrito único. Pero esos dos cantones no nacieron de la nada: se segregaron de un distrito que
-- ya existía. Al conservar también las filas viejas, el árbol quedó ofreciendo el mismo territorio
-- dos veces:
--
--   6-01-09 «Monte Verde»     (distrito de Puntarenas)  ->  hoy es el cantón 6-12 Monteverde
--   6-07-02 «Puerto Jiménez»  (distrito de Golfito)     ->  hoy es el cantón 6-13 Puerto Jiménez
--
-- En un formulario de dirección eso significa que un vecino de Monteverde encuentra su distrito en
-- dos lugares distintos y que dos personas del mismo pueblo terminan con direcciones que no
-- coinciden.
--
-- SE DESACTIVAN, NO SE BORRAN. El catálogo sólo ofrece filas activas, así que dejan de aparecer en
-- cualquier desplegable; y la fila sobrevive porque puede haber direcciones ya guardadas que la
-- referencian por identificador, y borrarla las rompería. Es la misma razón por la que un tipo de
-- infracción retirado se desactiva en vez de eliminarse.
--
-- =============================================================================================
-- LO QUE FALTA DEL ÁRBOL, ANOTADO AQUÍ Y NO EN V19_0 A PROPÓSITO
--
-- Flyway valida el checksum de cada migración ya aplicada: editar el encabezado de V19_0 rompería
-- el arranque de cualquier base donde ya corrió. Por eso la anotación que pidió el coordinador vive
-- en este archivo nuevo, que es aditivo y no puede romper nada.
--
-- Conteo real después de V19_0 + V19_1:
--   7 provincias, 84 cantones, 484 filas de distrito, de las cuales 482 quedan activas
--   (las dos de arriba se desactivan) y 482 son territorios distintos.
--
-- La DTA vigente declara 494 distritos, así que **faltan 12 territorios**, todos creados después de
-- la instantánea de 2020. NO se nombran aquí: este entorno no tiene acceso a una fuente oficial
-- (la lista de egreso permite registros de paquetes y raw.githubusercontent.com; el IGN, el INEC y
-- Wikipedia están bloqueados) y el único conjunto de datos disponible en npm es exactamente la
-- misma instantánea de 2020 de la que salió V19_0 —se verificó descargando el paquete: 7/82/482—.
-- Inventar nombres de distritos sería peor que la falta: quedarían escritos en direcciones reales.
--
-- Para completarlos, quien tenga la DTA a mano compara con esta consulta y carga la diferencia por
-- el back-office de plataforma (POST /api/v1/platform/countries/CR/divisions), sin otra migración:
--
--   SELECT c.code AS canton, c.name, count(d.*) AS distritos
--     FROM administrative_divisions c
--     LEFT JOIN administrative_divisions d
--            ON d.country_code = 'CR' AND d.level = 3 AND d.active AND left(d.code, 3) = c.code
--    WHERE c.country_code = 'CR' AND c.level = 2
--    GROUP BY c.code, c.name
--    ORDER BY c.code;
-- =============================================================================================

UPDATE administrative_divisions
   SET active = false
 WHERE country_code = 'CR'
   AND level = 3
   AND code IN ('60109', '60702');

COMMENT ON COLUMN administrative_divisions.active IS
    'Si la división se ofrece o no en los catálogos. Una división que dejó de existir se desactiva '
    'y no se borra: puede haber direcciones guardadas que la referencian, y el histórico de una '
    'dirección no se reescribe porque cambió la división territorial.';
