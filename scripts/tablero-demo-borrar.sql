-- =================================================================================================
-- Deshacer `tablero-demo.sql`.
--
--     ssh luparx-staging 'docker exec -i luparx-staging-postgres-1 psql -U luparx -d luparx -q' \
--       < scripts/tablero-demo-borrar.sql
--
-- Borra SÓLO lo que aquel script escribió, por marcador y por municipalidad, en orden de
-- dependencia. Ninguna de estas condiciones puede alcanzar a una fila que no sea de él:
--
--     provider = 'demo-mes'            los pagos
--     plate_snapshot LIKE 'DMX%'       las estadías terminadas
--     plate LIKE 'DMX%'                las revisiones
--     number LIKE 'DEMO-%'             las boletas
--
-- No hay nada que borrar en `wallet_transactions`: `tablero-demo.sql` no escribe ahí, porque esa
-- tabla es de solo anexado y lo que entra no se puede quitar (CONTRACT.md v0.32).
--
-- Lo que NO toca, a propósito:
--   * las estadías de placa `DMO%`, que son las que sembró `DevDashboardSeeder` y las que hoy
--     dibujan la ocupación;
--   * los pagos de `provider = 'demo-seed'`, que son de ese mismo sembrador;
--   * cualquier fila real.
--
-- Para barrer también lo del sembrador de Java —la ocupación se vaciaría— la condición está escrita
-- en su propio javadoc y es otra:
--     delete from parking_sessions where plate_snapshot like 'DMO%';
--     delete from payments where provider = 'demo-seed';
-- =================================================================================================

\set ON_ERROR_STOP on
\pset pager off
\if :{?municipio} \else \set municipio 'Montes de Oca' \endif

begin;

-- Misma razón que en `tablero-demo.sql`: psql no sustituye dentro de `$$ ... $$`.
create temporary table param on commit drop as select :'municipio'::text as municipio;

-- `tenants` no tiene `name`: ver la nota en `tablero-demo.sql`.
create temporary table ctx on commit drop as
select t.id as tenant_id, t.display_name as nombre
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
  if n <> 1 then
    raise exception 'Se esperaba UNA municipalidad que coincida con «%»; coinciden %.', m, n;
  end if;
end
$guardia$;

delete from citations           where tenant_id = (select tenant_id from ctx) and number like 'DEMO-%';
delete from enforcement_checks  where tenant_id = (select tenant_id from ctx) and plate like 'DMX%';
delete from parking_sessions    where tenant_id = (select tenant_id from ctx) and plate_snapshot like 'DMX%';
delete from payments            where tenant_id = (select tenant_id from ctx) and provider = 'demo-mes';

commit;

\echo ''
\echo '=== lo que queda con marcador de demo-mes (tiene que ser todo cero) ==='
with t as (select id from tenants
            where display_name ilike '%' || :'municipio' || '%'
               or legal_name   ilike '%' || :'municipio' || '%'
               or coalesce(short_name, '') ilike '%' || :'municipio' || '%'
               or slug         ilike '%' || replace(lower(:'municipio'), ' ', '-') || '%')
select 'pagos' as pieza,      count(*)::text as quedan from payments           where tenant_id = (select id from t) and provider = 'demo-mes'
union all select 'estadías',  count(*)::text           from parking_sessions   where tenant_id = (select id from t) and plate_snapshot like 'DMX%'
union all select 'revisiones',count(*)::text           from enforcement_checks where tenant_id = (select id from t) and plate like 'DMX%'
union all select 'boletas',   count(*)::text           from citations          where tenant_id = (select id from t) and number like 'DEMO-%';
