-- =================================================================================================
-- Un mes de datos de demostración para poder MIRAR los gráficos del tablero.
--
-- Qué problema resuelve
-- ---------------------
-- `DevDashboardSeeder` (config/DevDashboardSeeder.java) siembra SIETE días de recaudación y las
-- estadías activas de la ocupación, una sola vez, al arrancar el backend. Es idempotente a
-- propósito, así que la semana que sembró se queda donde quedó y la ventana del gráfico se corre
-- hacia adelante sin ella: a los pocos días la ocupación sigue llena y la recaudación sale vacía.
-- Eso es exactamente lo que se ve hoy en Montes de Oca, y no es un defecto de la pantalla.
--
-- Esto escribe TREINTA días que terminan hoy, y además lo que aquel sembrador nunca tocó: boletas,
-- revisiones de fiscalización y estadías terminadas. Con eso ocho de los nueve agregados del Panel
-- —los de `DashboardService`— dejan de estar en cero. El noveno es la billetera, que no se puede
-- sembrar sin romper una invariante de contrato: la sección 8 dice por qué.
--
-- Cómo se corre, desde el Mac, en un solo comando
-- -----------------------------------------------
--     ssh luparx-staging 'docker exec -i luparx-staging-postgres-1 psql -U luparx -d luparx -q' \
--       < scripts/tablero-demo.sql
--
--   Otra municipalidad:  ... psql ... -v municipio=Escazu' < scripts/tablero-demo.sql
--   Otra ventana:        ... psql ... -v dias=60'          < scripts/tablero-demo.sql
--
-- Cómo se borra
-- -------------
--     ssh luparx-staging 'docker exec -i luparx-staging-postgres-1 psql -U luparx -d luparx -q' \
--       < scripts/tablero-demo-borrar.sql
--
-- Volver a correr este script es seguro: lo primero que hace es borrar lo suyo, así que la ventana
-- vuelve a terminar hoy en vez de acumularse.
--
-- Cómo se reconoce lo que escribe
-- -------------------------------
-- Todo lleva marcador, y los marcadores son también las condiciones que lo borran:
--
--     pagos                provider = 'demo-mes'
--     estadías             plate_snapshot LIKE 'DMX%'
--     boletas              number LIKE 'DEMO-%'
--     revisiones           plate LIKE 'DMX%'
--
-- `DMX` y no `DMO`: `DMO` es el marcador del sembrador de Java, y sus estadías activas son las que
-- hoy dibujan el 62% de ocupación. Usar su mismo prefijo haría que el borrado de acá se llevara por
-- delante la ocupación que él sembró, que es un dato existente y no mío.
--
-- Lo que NO escribe, y por qué
-- ----------------------------
--   * AUDITORÍA. La misma razón que ya está escrita en `DevDashboardSeeder`: el rastro es la única
--     tabla de esta plataforma que existe para ser creída. «Actividad reciente» se llena sola en
--     cuanto alguien use el portal; mientras tanto su estado vacío es la verdad.
--   * CONCILIACIÓN. Los pagos van con `reconciliation_status = 'NOT_APPLICABLE'`, que en este
--     dominio significa «nadie va a reportar esta plata». Entran en lo recaudado, que es lo que la
--     pantalla tiene que mostrar, y quedan fuera de «lo que el proveedor todavía debe», que es la
--     cifra que un descuadre arruinaría.
--   * BILLETERA. `wallet_transactions` es de SOLO ANEXADO: la base rechaza el DELETE
--     (CONTRACT.md v0.32). Lo que se escriba ahí no se puede quitar, y la regla de los datos de
--     demostración es que todo lo sembrado se pueda deshacer — así que no se siembra. La sección 8
--     lo cuenta entero. «Billetera por tipo» del Panel se queda vacío a propósito.
--   * NADA EXISTENTE. No hay un solo UPDATE ni un DELETE sobre filas que no sean de este script.
-- =================================================================================================

\set ON_ERROR_STOP on
\pset pager off

-- Parámetros, con valor por omisión sólo si no vinieron por -v.
\if :{?municipio} \else \set municipio 'Montes de Oca' \endif
\if :{?dias}      \else \set dias 30                   \endif

begin;

-- Los parámetros viajan en una tabla y no como variables de psql, porque psql NO sustituye
-- `:'variable'` dentro de un bloque `$$ ... $$` —ahí el texto es literal— y los guardias de abajo
-- necesitan nombrar la municipalidad en el mensaje de error. Una tabla la leen los dos lados.
create temporary table param on commit drop as
select :'municipio'::text as municipio, :dias::int as dias;

-- -------------------------------------------------------------------------------------------------
-- 1. Resolver el contexto, y negarse si no cuadra.
--
-- Nada de identificadores pegados a mano: un UUID copiado de una consulta de ayer es la forma más
-- fácil de sembrarle a la municipalidad equivocada. Se resuelve acá y se exige que sea UNA.
-- -------------------------------------------------------------------------------------------------
-- `tenants` NO tiene columna `name`: tiene `legal_name` («Municipalidad de Montes de Oca»),
-- `display_name` («Montes de Oca») y `short_name` («M. de Oca»). Se busca en las tres y en el slug,
-- porque quien escribe el parámetro no tiene por qué saber en cuál quedó el nombre que recuerda.
create temporary table ctx on commit drop as
select t.id as tenant_id, t.slug, t.display_name as nombre, t.time_zone as tz,
       t.currency_code as moneda,
       (now() at time zone t.time_zone)::date as hoy
from tenants t
where (t.display_name ilike '%' || (select municipio from param) || '%'
    or t.legal_name   ilike '%' || (select municipio from param) || '%'
    or coalesce(t.short_name, '') ilike '%' || (select municipio from param) || '%'
    or t.slug         ilike '%' || replace(lower((select municipio from param)), ' ', '-') || '%');

do $guardia$
declare n int; m text;
begin
  select count(*) into n from ctx;
  select municipio into m from param;
  if n = 0 then
    raise exception 'Ninguna municipalidad coincide con «%». Mirá: select slug, display_name from tenants;', m;
  elsif n > 1 then
    raise exception 'Coinciden % municipalidades con «%». Afiná con -v municipio=''...''.', n, m;
  end if;
end
$guardia$;

-- Los actores. Una estadía sin dueño, una boleta sin inspector y una boleta sin causal no existen en
-- este dominio, así que se buscan y se exige que estén antes de escribir nada.
create temporary table actores on commit drop as
select c.tenant_id,
       (select m.user_id from tenant_memberships m
         where m.tenant_id = c.tenant_id and m.portal = 'INSPECTOR' and m.status = 'ACTIVE'
         order by m.user_id limit 1) as inspector_id,
       -- El ciudadano: primero el que ya carga las estadías sembradas, y si no, cualquier afiliado.
       coalesce(
         (select s.user_id from parking_sessions s
           where s.tenant_id = c.tenant_id and s.plate_snapshot like 'DMO%' limit 1),
         (select m.user_id from tenant_memberships m
           where m.tenant_id = c.tenant_id and m.portal = 'CITIZEN' and m.status = 'ACTIVE'
           order by m.user_id limit 1)) as ciudadano_id
from ctx c;

do $guardia$
declare a record; nz int; nb int; ni int;
begin
  select * into a from actores;
  select count(*) into nz from parking_zones where tenant_id = a.tenant_id;
  select count(*) into nb from parking_spaces where tenant_id = a.tenant_id and zone_id is not null;
  select count(*) into ni from infraction_types where tenant_id = a.tenant_id and active;
  if a.ciudadano_id is null then
    raise exception 'La municipalidad no tiene ningún ciudadano afiliado; una estadía sin dueño no existe.';
  end if;
  if nz = 0 or nb = 0 then
    raise exception 'La municipalidad tiene % zonas y % bahías con zona: sin parque no hay nada que ocupar.', nz, nb;
  end if;
  -- Estas dos no abortan: sin inspector o sin causales se siembra todo lo demás y se avisa. Es la
  -- diferencia entre «falta un dato» y «la municipalidad no está configurada para boletas».
  if a.inspector_id is null then
    raise warning 'Sin inspector ACTIVE: no se crean boletas ni revisiones de fiscalización.';
  end if;
  if ni = 0 then
    raise warning 'Sin tipos de infracción activos: no se crean boletas.';
  end if;
end
$guardia$;

-- -------------------------------------------------------------------------------------------------
-- 2. Borrar lo que este script escribió antes.
--
-- Por marcador y por municipalidad, en orden de dependencia. Ninguna de estas condiciones puede
-- alcanzar por accidente a una fila que no sea de acá.
-- -------------------------------------------------------------------------------------------------
delete from citations           where tenant_id = (select tenant_id from ctx) and number like 'DEMO-%';
delete from enforcement_checks  where tenant_id = (select tenant_id from ctx) and plate like 'DMX%';
delete from parking_sessions    where tenant_id = (select tenant_id from ctx) and plate_snapshot like 'DMX%';
delete from payments            where tenant_id = (select tenant_id from ctx) and provider = 'demo-mes';

-- -------------------------------------------------------------------------------------------------
-- 3. La rejilla de días.
--
-- En la zona horaria de la municipalidad y no en UTC, porque es así como `revenue-series` los va a
-- volver a agrupar: sembrar en UTC pone la recaudación de la tarde en el día siguiente y el gráfico
-- sale corrido un día.
-- -------------------------------------------------------------------------------------------------
create temporary table dias on commit drop as
select d::date                        as dia,
       extract(isodow from d)::int    as dow,          -- 1 lunes … 7 domingo
       row_number() over (order by d) as n
from generate_series((select hoy from ctx) - (:dias - 1), (select hoy from ctx), interval '1 day') d;

-- Las bahías disponibles para colgar estadías terminadas, numeradas para repartir por módulo.
create temporary table bahias on commit drop as
select ps.id as space_id, ps.zone_id, row_number() over (order by ps.id) as n
from parking_spaces ps
where ps.tenant_id = (select tenant_id from ctx) and ps.zone_id is not null;

-- -------------------------------------------------------------------------------------------------
-- 4. Pagos: la serie de recaudación.
--
-- `capturedByDay` agrupa por `requested_at` —no por `confirmed_at`—, así que la fecha que importa es
-- esa. Ocho cobros por día repartidos entre las 8 y las 22: todos a la medianoche en punto es lo que
-- delata un fixture a simple vista, y además amontona el día entero en una sola hora del Panel.
--
-- La forma del mes no es plana a propósito: el gráfico existe para que alguien vea CUÁL fue el
-- martes flojo. El factor por día de semana deja el fin de semana claramente por debajo, que es lo
-- que hace un parque municipal de verdad.
-- -------------------------------------------------------------------------------------------------
insert into payments (id, tenant_id, user_id, method, provider, provider_reference, idempotency_key,
                      status, gross_amount_minor, net_amount_minor, currency_code, purpose,
                      requested_at, confirmed_at, reconciliation_status, created_at, updated_at, version)
select gen_random_uuid(), c.tenant_id, a.ciudadano_id,
       (array['CARD','SINPE','COUNTER_CASH','CARD'])[1 + (s.slot % 4)],
       'demo-mes', ref.clave, ref.clave,
       'CAPTURED',
       s.peso * f.pct * 1000, s.peso * f.pct * 1000, c.moneda,
       case when s.slot % 5 = 0 then 'FINE' else 'WALLET_TOPUP' end,
       cuando.t, cuando.t, 'NOT_APPLICABLE', cuando.t, cuando.t, 0
from ctx c
cross join actores a
cross join dias di
cross join (select * from unnest(array[18,24,31,27,35,22,29,16]) with ordinality as u(peso, slot)) s
join       (select * from unnest(array[100,104,98,106,112,74,58]) with ordinality as v(pct, dow)) f
             on f.dow = di.dow
cross join lateral (select ((di.dia + ((6 + s.slot * 2) || ' hours')::interval)::timestamp
                            at time zone c.tz) as t) cuando
cross join lateral (select 'demo-mes:' || c.slug || ':' || di.dia || ':' || s.slot as clave) ref
-- El día de hoy está a medias: son las cinco de la tarde, no las diez de la noche. Un cobro con
-- fecha futura entra igual en la suma del día y deja «Ingresos del día» contando plata que todavía
-- no existe, que es exactamente la clase de cifra que nadie vuelve a creerse.
where cuando.t <= now();

-- Los cobros que fallaron. Sin ellos «Fallos de cobro» del Panel no tiene nada que dibujar, y un
-- tablero donde ese bloque siempre está vacío no prueba que sepa mostrarlo. Van sin `confirmed_at`
-- porque un cobro fallido no se confirmó: la base lo exige (`ck_payments_failed_not_confirmed`).
insert into payments (id, tenant_id, user_id, method, provider, provider_reference, idempotency_key,
                      status, failure_code, failure_reason,
                      gross_amount_minor, currency_code, purpose,
                      requested_at, reconciliation_status, created_at, updated_at, version)
select gen_random_uuid(), c.tenant_id, a.ciudadano_id, 'CARD', 'demo-mes',
       'demo-mes:fallo:' || di.dia, 'demo-mes:fallo:' || di.dia,
       'FAILED',
       -- `di.n / 3` y no `di.n % 3`: el filtro de abajo ya se queda sólo con los múltiplos de tres,
       -- así que el resto módulo tres es CERO en todas las filas y el tablero salía con un único
       -- código de fallo repetido diez veces. Visto en la verificación local.
       (array['INSUFFICIENT_FUNDS','CARD_DECLINED','GATEWAY_TIMEOUT'])[1 + ((di.n / 3) % 3)],
       (array['Fondos insuficientes','Tarjeta rechazada por el emisor','La pasarela no respondió a tiempo'])[1 + ((di.n / 3) % 3)],
       (12 + (di.n % 7)) * 1000 * 100, c.moneda, 'WALLET_TOPUP',
       cuando.t, 'NOT_APPLICABLE', cuando.t, cuando.t, 0
from ctx c cross join actores a cross join dias di
cross join lateral (select ((di.dia + interval '15 hours')::timestamp at time zone c.tz) as t) cuando
where di.n % 3 = 0 and cuando.t <= now();

-- -------------------------------------------------------------------------------------------------
-- 5. Estadías terminadas: «Estadías por estado de pago» del Panel.
--
-- `countByPaymentStatus` agrupa por `startedAt`. Veinte por día, repartidas entre las bahías del
-- parque por módulo. No chocan con la ocupación actual: el índice único de una estadía por bahía es
-- PARCIAL, sólo sobre las ACTIVE (`uq_parking_sessions_active_space`), y éstas nacen terminadas.
--
-- Tres estados, y los tres significan algo distinto que la pantalla tiene que saber distinguir:
-- cobrada, sin cobro por cortesía o crédito, y pendiente de cobro. `ck_parking_sessions_paid_has_amount`
-- obliga a que una PAID traiga monto, y `ck_parking_sessions_no_charge_coherent` a que el motivo de
-- no cobro sólo exista cuando no se cobró.
-- -------------------------------------------------------------------------------------------------
insert into parking_sessions (id, tenant_id, user_id, plate_snapshot, zone_id, space_id,
                              started_at, expires_at, ended_at, status, amount_minor, currency_code,
                              payment_status, no_charge_reason, credit_minutes_applied,
                              created_at, updated_at, version)
select gen_random_uuid(), c.tenant_id, a.ciudadano_id,
       'DMX' || lpad((((di.n - 1) * 20 + k) % 900 + 1)::text, 3, '0'),
       b.zone_id, b.space_id,
       ini.t, ini.t + interval '2 hours', ini.t + ((45 + (k * 7) % 70) || ' minutes')::interval,
       'FINISHED',
       case when caso.estado = 'NO_CHARGE' then 0 else (6 + (k % 5)) * 100 * 100 end,
       c.moneda,
       caso.estado,
       case when caso.estado = 'NO_CHARGE'
            then (array['COURTESY','CREDIT','OUTSIDE_HOURS'])[1 + (k % 3)] end,
       case when caso.estado = 'NO_CHARGE' and k % 3 = 1 then 30 else 0 end,
       ini.t, ini.t, 0
from ctx c
cross join actores a
cross join dias di
cross join generate_series(1, 20) k
cross join lateral (select * from bahias bb
                     where bb.n = 1 + (((di.n - 1) * 20 + k) % (select count(*) from bahias))) b
cross join lateral (select ((di.dia + ((7 + (k % 13)) || ' hours')::interval)::timestamp
                            at time zone c.tz) as t) ini
cross join lateral (select case when k % 10 = 0 then 'PENDING'
                                when k % 7  = 0 then 'NO_CHARGE'
                                else 'PAID' end as estado) caso
-- Terminadas de verdad: la estadía entera —inicio y cierre— tiene que haber ocurrido ya.
where ini.t + interval '2 hours' <= now();

-- -------------------------------------------------------------------------------------------------
-- 6. Revisiones de fiscalización: «Consultas por veredicto» y la productividad por inspector.
--
-- `countByVerdict` agrupa por `occurredAt`. Los seis veredictos del dominio con pesos distintos,
-- porque seis barras iguales no comprueban que la escala funcione, y un puñado de RECHAZOS —consulta
-- a una zona no asignada—, que también son resultados y también se registran.
--
-- La ubicación no se inventa: `ck_enforcement_checks_location` exige que haya coordenadas si y sólo
-- si hubo fijación, así que los casos sin señal y sin permiso van sin coordenadas, que es la verdad
-- de lo que pasó en la calle.
-- -------------------------------------------------------------------------------------------------
insert into enforcement_checks (id, tenant_id, inspector_user_id, plate_raw, plate, zone_id,
                                space_code, verdict, refusal_code, location_state,
                                latitude, longitude, location_accuracy_m, user_agent, occurred_at)
select gen_random_uuid(), c.tenant_id, a.inspector_id,
       placa.p, placa.p, b.zone_id, 'A-' || lpad((k % 60 + 1)::text, 3, '0'),
       res.verdicto, res.rechazo, res.ubicacion,
       case when res.ubicacion = 'FIX' then 9.936000 + (k % 20) * 0.000700 end,
       case when res.ubicacion = 'FIX' then -84.052000 - (k % 17) * 0.000900 end,
       case when res.ubicacion = 'FIX' then 8 + (k % 12) end,
       'Mozilla/5.0 (Linux; Android 14) demo-mes',
       cuando.t
from ctx c
cross join actores a
cross join dias di
cross join generate_series(1, 22) k
cross join lateral (select 'DMX' || lpad((((di.n - 1) * 22 + k) % 900 + 1)::text, 3, '0') as p) placa
cross join lateral (select * from bahias bb
                     where bb.n = 1 + (((di.n - 1) * 22 + k) % (select count(*) from bahias))) b
cross join lateral (
  select case when k % 13 = 0 then null
              when (k * 7 + di.n) % 100 < 58 then 'COVERED'
              when (k * 7 + di.n) % 100 < 74 then 'EXPIRED'
              when (k * 7 + di.n) % 100 < 86 then 'NOT_COVERED'
              when (k * 7 + di.n) % 100 < 94 then 'BAY_MISMATCH'
              when (k * 7 + di.n) % 100 < 98 then 'EXEMPT'
              else 'AMBIGUOUS' end as verdicto,
         case when k % 13 = 0 then 'ZONE_NOT_ASSIGNED' end as rechazo,
         case when k % 13 = 0 then 'NOT_GRANTED'
              when k % 11 = 0 then 'NO_FIX'
              else 'FIX' end as ubicacion) res
cross join lateral (select ((di.dia + ((7 + (k % 11)) || ' hours')::interval
                                    + ((k * 137 % 60) || ' minutes')::interval)::timestamp
                            at time zone c.tz) as t) cuando
where a.inspector_id is not null and cuando.t <= now();

-- -------------------------------------------------------------------------------------------------
-- 7. Boletas: «Multas emitidas» del Inicio y «Boletas por estado» del Panel.
--
-- `countByStatusIn` agrupa por `occurredAt`. El código, el nombre y el monto se COPIAN del tipo de
-- infracción, que es lo que hace el dominio de verdad (V17_0): el catálogo es configuración y se va
-- a editar, y subir una multa el año que viene no puede cambiar lo que le cobraron a alguien este.
--
-- El consecutivo sale de una banda alta (900000+) y el contador de la municipalidad NO se toca: así
-- la próxima boleta real sigue tomando el número que le toca y no choca con éstas
-- (`uq_citations_series`). El prefijo DEMO- del número es a la vez el marcador que las borra.
-- -------------------------------------------------------------------------------------------------
insert into citations (id, tenant_id, number, series_year, sequence_number,
                       plate, plate_normalized, zone_id, space_id, space_code,
                       infraction_type_id, infraction_code, infraction_name,
                       fine_amount_minor, currency_code, due_at,
                       occurred_at, issued_at, inspector_user_id, inspector_name_snapshot,
                       status, paid_at, source, created_at, updated_at, version)
select gen_random_uuid(), c.tenant_id,
       'DEMO-' || extract(year from di.dia)::int || '-' || lpad((900000 + (di.n - 1) * 3 + k)::text, 6, '0'),
       extract(year from di.dia)::int, 900000 + (di.n - 1) * 3 + k,
       placa.p, placa.p, b.zone_id, b.space_id, 'A-' || lpad((k % 60 + 1)::text, 3, '0'),
       it.id, it.code, it.name, it.fine_amount_minor, it.currency_code,
       cuando.t + (it.due_days || ' days')::interval,
       cuando.t, cuando.t, a.inspector_id, u.given_name || ' ' || u.family_name,
       est.estado,
       case when est.estado = 'PAID' then cuando.t + interval '3 days' end,
       'LUPARX', cuando.t, cuando.t, 0
from ctx c
cross join actores a
join users u on u.id = a.inspector_id
cross join dias di
cross join generate_series(1, 3) k
cross join lateral (select 'DMX' || lpad((((di.n - 1) * 3 + k) % 900 + 1)::text, 3, '0') as p) placa
cross join lateral (select * from bahias bb
                     where bb.n = 1 + (((di.n - 1) * 3 + k) % (select count(*) from bahias))) b
cross join lateral (select * from infraction_types t2
                     where t2.tenant_id = c.tenant_id and t2.active
                     order by t2.sort_order, t2.code
                     offset ((di.n + k) % greatest(1, (select count(*) from infraction_types
                                                        where tenant_id = c.tenant_id and active)))
                     limit 1) it
cross join lateral (select ((di.dia + ((8 + (k * 4) % 10) || ' hours')::interval)::timestamp
                            at time zone c.tz) as t) cuando
cross join lateral (
  select case when (di.n * 5 + k) % 100 < 45 then 'ISSUED'
              when (di.n * 5 + k) % 100 < 75 then 'PAID'
              when (di.n * 5 + k) % 100 < 83 then 'APPEALED'
              when (di.n * 5 + k) % 100 < 90 then 'DISMISSED'
              when (di.n * 5 + k) % 100 < 95 then 'CANCELLED'
              else 'EXPIRED' end as estado) est
where a.inspector_id is not null
  and cuando.t <= now()
  and exists (select 1 from infraction_types where tenant_id = c.tenant_id and active);

-- -------------------------------------------------------------------------------------------------
-- 8. Movimientos de billetera: NO se siembran. Descubierto al verificar, 12-10-2026.
--
-- La primera versión de este script escribía cinco movimientos por día, con neto cero para no
-- descuadrar el saldo. Al correrlo contra el esquema REAL —el que levantan las migraciones, no una
-- copia mía— el segundo intento falló con el mensaje que la propia base tiene escrito:
--
--     «La tabla wallet_transactions es de solo anexado: no admite DELETE (CONTRACT.md v0.32). Lo
--      único que se puede completar después es payment_id cuando estaba nulo […]. Un error se
--      corrige agregando una fila que lo diga, nunca cambiando la que ya está.»
--
-- O sea que lo que se escriba ahí NO SE PUEDE BORRAR. Y la regla de los datos de demostración es
-- que todo lo que se siembre tenga una forma de quitarse; lo que no se puede quitar, no se siembra.
-- Desactivar el disparador para esquivarlo sería romper una invariante de contrato para poder
-- pintar una barra, que es exactamente al revés de para qué está esa invariante.
--
-- Consecuencia asumida: «Billetera por tipo» del Panel se queda vacío. Se llena solo en cuanto
-- alguien recargue o consuma desde el portal del ciudadano, que es la única forma honesta de
-- llenarlo.
-- -------------------------------------------------------------------------------------------------

commit;

-- -------------------------------------------------------------------------------------------------
-- 9. Lo que quedó. Esto es el informe, no parte del sembrado.
-- -------------------------------------------------------------------------------------------------
\echo ''
\echo '=== lo que escribió este script ==='
with t as (select id, display_name as nombre from tenants
            where display_name ilike '%' || :'municipio' || '%'
               or legal_name   ilike '%' || :'municipio' || '%'
               or coalesce(short_name, '') ilike '%' || :'municipio' || '%'
               or slug         ilike '%' || replace(lower(:'municipio'), ' ', '-') || '%')
select 'municipalidad' as pieza, (select nombre from t) as cuanto, '' as desde_hasta
union all
select 'pagos CAPTURED', count(*)::text,
       coalesce(min(requested_at)::date || ' → ' || max(requested_at)::date, '—')
  from payments where tenant_id = (select id from t) and provider = 'demo-mes' and status = 'CAPTURED'
union all
select '  recaudado (₡)', to_char(coalesce(sum(gross_amount_minor), 0) / 100, 'FM999,999,999'), ''
  from payments where tenant_id = (select id from t) and provider = 'demo-mes' and status = 'CAPTURED'
union all
select 'pagos FAILED', count(*)::text, ''
  from payments where tenant_id = (select id from t) and provider = 'demo-mes' and status = 'FAILED'
union all
select 'estadías terminadas', count(*)::text,
       coalesce(min(started_at)::date || ' → ' || max(started_at)::date, '—')
  from parking_sessions where tenant_id = (select id from t) and plate_snapshot like 'DMX%'
union all
select 'revisiones', count(*)::text,
       coalesce(min(occurred_at)::date || ' → ' || max(occurred_at)::date, '—')
  from enforcement_checks where tenant_id = (select id from t) and plate like 'DMX%'
union all
select 'boletas', count(*)::text,
       coalesce(min(occurred_at)::date || ' → ' || max(occurred_at)::date, '—')
  from citations where tenant_id = (select id from t) and number like 'DEMO-%'
union all
select 'ocupación en curso', count(*)::text, 'intactas: las sembró DevDashboardSeeder'
  from parking_sessions where tenant_id = (select id from t) and plate_snapshot like 'DMO%' and status = 'ACTIVE';
