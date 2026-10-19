\set ON_ERROR_STOP on
\echo '-- A · marcado de las DEMO y aislamiento municipal --'
select afirmar(geom_source = 'DEMO' and geom_status = 'REJECTED',
  'San José / SJ-MERCADO (el polígono LITERAL de la V41_0) queda DEMO/REJECTED')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select afirmar(geom_source = 'ADMIN_DRAWING' and geom_status = 'UNVERIFIED',
  'OTRA municipalidad, MISMO código, MISMO polígono: NO se marca (la cláusula que a la V41_0 le falta)')
from parking_zones where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select afirmar(geom_source = 'ADMIN_DRAWING' and geom_status = 'UNVERIFIED',
  'una zona REDIBUJADA ya no es la semilla y no se toca')
from parking_zones where id = 'cccccccc-0000-0000-0000-000000000003';
select afirmar(geom_source is null and geom_status = 'UNVERIFIED'
               and geom_verified_by is null and geom_verified_at is null,
  'una zona sin dibujar queda limpia: sin procedencia y sin sello')
from parking_zones where id = 'dddddddd-0000-0000-0000-000000000004';
select afirmar(count(*) = 0, 'la migración NO deja ninguna fila VERIFIED')
from parking_zones where geom_status = 'VERIFIED';
select afirmar(count(*) = 3, 'las tres zonas dibujadas CONSERVAN su polígono: nada se borró')
from parking_zones where geom is not null;
select afirmar(count(*) = 1, 'el índice parcial por estado quedó creado')
from pg_indexes where indexname = 'ix_parking_zones_geom_status';

\echo ''
\echo '-- B · una DEMO no asciende a oficial --'
do $$ begin
  begin
    update parking_zones set geom_status = 'VERIFIED',
           geom_verified_by = 'eeeeeeee-0000-0000-0000-000000000005', geom_verified_at = now()
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLÓ: la base aceptó una DEMO como VERIFIED';
  exception when check_violation then
    perform afirmar(true, 'cambiarle el estado a una DEMO se rechaza (CHECK ck_..._demo_never_verified)');
  end;
end $$;
do $$ begin
  begin
    -- El atajo de UN SOLO PASO: reescribir la procedencia Y aprobar en la MISMA sentencia.
    -- El CHECK solo NO lo veía, porque la fila que queda ya no dice DEMO. Lo cierra el disparador.
    update parking_zones set geom_source = 'MUNICIPAL_OFFICIAL', geom_status = 'VERIFIED',
           geom_verified_by = 'eeeeeeee-0000-0000-0000-000000000005', geom_verified_at = now()
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLÓ: rebautizar la procedencia y aprobar en la misma sentencia pasó';
  exception when check_violation then
    perform afirmar(true, 'rebautizarla Y aprobarla en la misma sentencia se rechaza (disparador trg_...)');
  end;
end $$;
do $$ begin
  begin
    update parking_zones set geom_status = 'VERIFIED'
     where id = 'cccccccc-0000-0000-0000-000000000003';
    raise exception 'FALLÓ: la base aceptó un VERIFIED sin autor ni fecha';
  exception when check_violation then
    perform afirmar(true, 'un VERIFIED sin autor ni fecha es imposible (ck_..._verified_complete)');
  end;
end $$;
do $$ begin
  begin
    update parking_zones set geom_source = 'ADMIN_DRAWING'
     where id = 'dddddddd-0000-0000-0000-000000000004';
    raise exception 'FALLÓ: la base aceptó procedencia sin geometría';
  exception when check_violation then
    perform afirmar(true, 'sin polígono no se puede declarar procedencia (ck_..._absent_is_clean)');
  end;
end $$;
do $$ begin
  begin
    update parking_zones set geom_status = 'OFICIAL' where id = 'cccccccc-0000-0000-0000-000000000003';
    raise exception 'FALLÓ: la base aceptó un estado inventado';
  exception when check_violation then
    perform afirmar(true, 'un estado inventado se rechaza (ck_..._geom_status)');
  end;
end $$;
select afirmar(geom_source = 'DEMO' and geom_status = 'REJECTED',
  'después de los cinco intentos, la DEMO sigue DEMO/REJECTED y con su polígono')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo ''
\echo '-- C · el camino legítimo, y que redibujar degrade el sello --'
-- Redibujar la DEMO (la MISMA sentencia que ejecuta replaceGeometry): deja de ser la semilla.
update parking_zones
   set geom = ST_Multi(ST_GeomFromGeoJSON(cast('{"type":"Polygon","coordinates":[[[-84.084,9.934],[-84.077,9.934],[-84.077,9.929],[-84.084,9.929],[-84.084,9.934]]]}' as text))),
       geom_source = 'ADMIN_DRAWING', geom_status = 'UNVERIFIED',
       geom_verified_by = null, geom_verified_at = null, updated_at = now(), version = version + 1
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select afirmar(geom_source = 'ADMIN_DRAWING' and geom_status = 'UNVERIFIED',
  'REDIBUJAR una DEMO la convierte en un dibujo del portal: ese sí es el camino para volverla oficial')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update parking_zones
   set geom_source = 'MUNICIPAL_OFFICIAL', geom_status = 'VERIFIED',
       geom_verified_by = 'eeeeeeee-0000-0000-0000-000000000005', geom_verified_at = now(),
       updated_at = now(), version = version + 1
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select afirmar(geom_status = 'VERIFIED' and geom_verified_by is not null and geom_verified_at is not null,
  'y entonces sí se aprueba, firmada')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';

update parking_zones
   set geom = ST_Multi(ST_GeomFromGeoJSON(cast('{"type":"Polygon","coordinates":[[[-84.09,9.95],[-84.08,9.95],[-84.08,9.94],[-84.09,9.94],[-84.09,9.95]]]}' as text))),
       geom_source = 'ADMIN_DRAWING', geom_status = 'UNVERIFIED',
       geom_verified_by = null, geom_verified_at = null, updated_at = now(), version = version + 1
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select afirmar(geom_status = 'UNVERIFIED' and geom_verified_by is null and geom_verified_at is null,
  'REDIBUJAR una zona APROBADA degrada el sello en el mismo UPDATE')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';

update parking_zones
   set geom = null, geom_source = null, geom_status = 'UNVERIFIED',
       geom_verified_by = null, geom_verified_at = null, updated_at = now(), version = version + 1
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select afirmar(geom is null and geom_source is null and geom_status = 'UNVERIFIED',
  'BORRAR el perímetro deja la fila limpia y el CHECK de coherencia lo acepta')
from parking_zones where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo ''
\echo '-- D · qué recibe el ciudadano (la consulta REAL del repositorio) --'
-- Se aprueba la zona de la OTRA municipalidad, para probar el aislamiento del mapa.
update parking_zones set geom_source = 'MUNICIPAL_OFFICIAL', geom_status = 'VERIFIED',
       geom_verified_by = 'eeeeeeee-0000-0000-0000-000000000005', geom_verified_at = now()
 where id = 'bbbbbbbb-0000-0000-0000-000000000002';

select afirmar(count(*) = 0,
  'San José no tiene ninguna verificada, así que su mapa sale VACÍO (filtro por omisión)')
from parking_zones z
where z.tenant_id = '11111111-1111-1111-1111-111111111111'
  and z.active and z.geom is not null and z.geom_status in ('VERIFIED');

select afirmar(count(*) = 1,
  'el mapa de la OTRA municipalidad sí trae la suya')
from parking_zones z
where z.tenant_id = '22222222-2222-2222-2222-222222222222'
  and z.active and z.geom is not null and z.geom_status in ('VERIFIED');

select afirmar(count(*) = 1,
  'y el mapa de San José nunca ve la zona ajena, ni con el filtro de desarrollo abierto')
from parking_zones z
where z.tenant_id = '11111111-1111-1111-1111-111111111111'
  and z.active and z.geom is not null
  and z.geom_status in ('VERIFIED', 'UNVERIFIED', 'REJECTED');

select afirmar(source = 'MUNICIPAL_OFFICIAL' and status = 'VERIFIED' and verifiedat is not null,
  'la proyección del mapa devuelve procedencia, estado y fecha en ISO-8601')
from (select z.geom_source as source, z.geom_status as status,
             to_char(z.geom_verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as verifiedat
        from parking_zones z where z.id = 'bbbbbbbb-0000-0000-0000-000000000002') p;
