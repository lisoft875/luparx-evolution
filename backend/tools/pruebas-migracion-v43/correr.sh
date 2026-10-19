#!/usr/bin/env bash
# =================================================================================================
# Prueba de migración y aislamiento municipal de la V43_0 (CONTRACT.md v0.44, ADR 0029).
#
# QUÉ HACE
#   1. Crea una base DESECHABLE (por omisión `luparx_pruebas_v43`), aparte de la de desarrollo.
#   2. Aplica V1_0 .. V42_0 con psql, en orden de versión.
#   3. Siembra dos municipalidades con el MISMO código de zona y el MISMO polígono de demostración,
#      una zona redibujada y una sin dibujar.
#   4. Toma un respaldo (`pg_dump -Fc`) ANTES de tocar el esquema.
#   5. Aplica la V43_0.
#   6. Corre 21 afirmaciones: marcado de las DEMO, aislamiento municipal, las tres defensas contra
#      aprobar una DEMO, la degradación del sello al redibujar, y qué recibe el mapa del ciudadano.
#   7. Restaura el respaldo y comprueba que la base vuelve al estado anterior.
#
# QUÉ NO HACE
#   No toca staging, ni producción, ni la base de desarrollo. Se niega a correr contra un host que
#   no sea local, y se niega a usar una base que no sea la desechable.
#
#   bash correr.sh                       # localhost:5442, base luparx_pruebas_v43
#   PGPORT=5432 PGUSER=otro bash correr.sh
# =================================================================================================
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5442}"
PGUSER="${PGUSER:-luparx}"
BASE="${BASE:-luparx_pruebas_v43}"
MIG="${MIG:-$(cd "$(dirname "$0")/../../app/src/main/resources/db/migration" && pwd)}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
# Fuera del repositorio a propósito: un volcado de base no se deja en el árbol de fuentes.
RESPALDO="${RESPALDO:-${TMPDIR:-/tmp}/luparx-respaldo-antes-de-v43.dump}"

case "$PGHOST" in
  localhost|127.0.0.1|::1) ;;
  *) echo "✗ $PGHOST no es local. Esta prueba CREA Y BORRA una base; no corre contra nada remoto." >&2
     exit 2 ;;
esac
case "$BASE" in
  *pruebas*|*test*) ;;
  *) echo "✗ «$BASE» no parece una base desechable (se espera algo con «pruebas» o «test» en el" >&2
     echo "  nombre). No se va a borrar una base que podría ser la suya." >&2
     exit 2 ;;
esac

psql() { command psql -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "== 0. base desechable $BASE en $PGHOST:$PGPORT =="
psql -d postgres -c "drop database if exists $BASE;" -c "create database $BASE;"

echo "== 1. V1_0 .. V42_0 =="
for f in $(ls "$MIG" | sort -t_ -k1.2,1n -k2,2n); do
  [ "$f" = "V43_0__zone_geometry_provenance.sql" ] && continue
  psql -d "$BASE" -f "$MIG/$f" > /dev/null
done
echo "   ok  $(ls "$MIG" | grep -vc V43_0) migraciones aplicadas"

echo "== 2. datos de prueba =="
psql -d "$BASE" -f "$AQUI/fixture.sql" 2>&1 \
  | sed 's/^psql:[^ ]* //; s/^NOTICE:  //' | grep -E '^ +ok' || true

echo "== 3. respaldo previo =="
pg_dump -Fc -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$BASE" -f "$RESPALDO"
echo "   ok  $RESPALDO ($(wc -c < "$RESPALDO") bytes)"

echo "== 4. aplicar V43_0 =="
psql -d "$BASE" -f "$MIG/V43_0__zone_geometry_provenance.sql" > /dev/null
echo "   ok  aplicada"

echo "== 5. afirmaciones =="
psql -d "$BASE" -f "$AQUI/afirmaciones.sql" 2>&1 \
  | grep -vE '^( *$|-+$|\(1 row\)| afirmar|DO$|UPDATE)' \
  | sed 's/^psql:[^ ]* //; s/^NOTICE:  //'

echo "== 6. el respaldo es recuperable =="
psql -d postgres -c "drop database $BASE;" -c "create database $BASE;"
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$BASE" "$RESPALDO"
COLS=$(psql -t -d "$BASE" -c "select count(*) from information_schema.columns where table_name='parking_zones' and column_name like 'geom\\_%';" | tr -d ' ')
TRG=$(psql -t -d "$BASE" -c "select count(*) from pg_trigger where tgname='trg_parking_zones_demo_never_verified';" | tr -d ' ')
ZONAS=$(psql -t -d "$BASE" -c "select count(*) from parking_zones;" | tr -d ' ')
GEOM=$(psql -t -d "$BASE" -c "select count(geom) from parking_zones;" | tr -d ' ')
[ "$COLS" = "0" ] && [ "$TRG" = "0" ] && [ "$ZONAS" = "4" ] && [ "$GEOM" = "3" ] \
  && echo "   ok  vuelve al estado anterior: 0 columnas geom_*, 0 disparador, 4 zonas, 3 con polígono" \
  || { echo "   ✗  el restaurado NO devolvió el estado anterior (cols=$COLS trg=$TRG zonas=$ZONAS geom=$GEOM)"; exit 1; }

echo
echo "✔ migración, aislamiento municipal y respaldo verificados sobre una base aislada."
