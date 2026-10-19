\set ON_ERROR_STOP on
-- ================================================================================================
-- Fixture de la prueba de migración y aislamiento municipal de la V43_0.
-- Se siembra DESPUÉS de la V42_0 y ANTES de la V43_0, para que la V43_0 tenga qué encontrar.
-- ================================================================================================
create or replace function afirmar(ok boolean, que text) returns void as $$
begin
  if ok then raise notice '  ok  %', que;
  else raise exception 'FALLÓ: %', que;
  end if;
end;
$$ language plpgsql;

insert into tenants (id, slug, legal_name, display_name, country_code, currency_code, locale, time_zone, status, created_at, updated_at)
select '11111111-1111-1111-1111-111111111111', 'san-jose', 'Municipalidad de San José', 'San José',
       (select code from countries limit 1), 'CRC', 'es-CR', 'America/Costa_Rica', 'ACTIVE', now(), now();
insert into tenants (id, slug, legal_name, display_name, country_code, currency_code, locale, time_zone, status, created_at, updated_at)
select '22222222-2222-2222-2222-222222222222', 'otra-muni', 'Municipalidad de Otra Parte', 'Otra Parte',
       (select code from countries limit 1), 'CRC', 'es-CR', 'America/Costa_Rica', 'ACTIVE', now(), now();

-- A · San José, SJ-MERCADO, con EXACTAMENTE el polígono que escribió la V41_0.
insert into parking_zones (id, tenant_id, code, name, active, created_at, updated_at, geom) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SJ-MERCADO', 'Mercado Central', true, now(), now(),
  ST_Multi(ST_GeomFromText('POLYGON((-84.0830 9.9335, -84.0780 9.9335, -84.0780 9.9300, -84.0830 9.9300, -84.0830 9.9335))', 4326)));

-- B · OTRA municipalidad, MISMO código, MISMO polígono. Es la trampa del aislamiento: el código de
--     zona sólo es único DENTRO de una municipalidad, y a la V41_0 le falta esa cláusula.
insert into parking_zones (id, tenant_id, code, name, active, created_at, updated_at, geom) values
 ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'SJ-MERCADO', 'Mercado de Otra Parte', true, now(), now(),
  ST_Multi(ST_GeomFromText('POLYGON((-84.0830 9.9335, -84.0780 9.9335, -84.0780 9.9300, -84.0830 9.9300, -84.0830 9.9335))', 4326)));

-- C · San José, SJ-AMON, REDIBUJADA a mano: ya no es la semilla, así que no se toca.
insert into parking_zones (id, tenant_id, code, name, active, created_at, updated_at, geom) values
 ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SJ-AMON', 'Barrio Amón', true, now(), now(),
  ST_Multi(ST_GeomFromText('POLYGON((-84.0795 9.9390, -84.0725 9.9390, -84.0725 9.9340, -84.0795 9.9340, -84.0795 9.9390))', 4326)));

-- D · San José, SJ-COLON, sin dibujar.
insert into parking_zones (id, tenant_id, code, name, active, created_at, updated_at) values
 ('dddddddd-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'SJ-COLON', 'Paseo Colón', true, now(), now());

-- Un usuario, para poder firmar una verificación. Datos sintéticos: no es ninguna persona real.
insert into users (id, email, given_name, family_name, document_country_code, document_type,
                   document_number, document_number_normalized, phone_e164, phone_country_code,
                   nationality_code, birth_date, locale, time_zone, status, accepted_terms_version,
                   created_at, updated_at)
select 'eeeeeeee-0000-0000-0000-000000000005', 'revisor@luparx.test', 'Revisora', 'Municipal',
       (select code from countries limit 1), 'NATIONAL_ID', '900000001', '900000001',
       '+50688880000', (select code from countries limit 1), (select code from countries limit 1),
       '1985-01-01', 'es-CR', 'America/Costa_Rica', 'ACTIVE', 'v1', now(), now();

select afirmar(count(*) = 4, 'cuatro zonas sembradas') from parking_zones;
