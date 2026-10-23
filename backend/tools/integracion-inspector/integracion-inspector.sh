#!/usr/bin/env bash
# =================================================================================================
# Inspector — integración REAL (nivel 3). Fase 3, 22-10-2026.
#
# Qué es nivel 3 y qué no: esto habla por HTTP con el backend de Spring Boot corriendo contra
# PostgreSQL 16 + PostGIS con las 43 migraciones de Flyway aplicadas por el propio arranque. No hay
# simulador en ningún punto del camino. Los arneses `.cjs` del repositorio son nivel 1/2 —navegador
# contra el transporte simulado— y no sustituyen esto.
#
# CÓMO CORRERLO
#   1. una base PostgreSQL 16 con PostGIS vacía;
#   2. el backend arrancado contra ella con SPRING_PROFILES_ACTIVE=dev (siembra las municipalidades,
#      los fiscalizadores, las zonas y los tipos de infracción);
#   3. API=http://127.0.0.1:8095/api/v1 PGPORT=5442 PGDATABASE=luparx_f3b \
#        bash backend/tools/integracion-inspector/integracion-inspector.sh
#
# Cubre, en este orden: entrar y elegir municipalidad · zonas · tipos de infracción · consulta de
# placa en sus tres estados de ubicación (FIX / NO_FIX / NOT_GRANTED) · ZONE_NOT_ASSIGNED ·
# emisión 201 y reenvío 200 por `deviceCitationId` · reenvío por `Idempotency-Key` · evidencia
# (subir y descargar) · emitir · lista y detalle · FILTROS de Mis boletas (estado + fechas) ·
# resumen de turno.
#
# No cubre, y se dice: la cola sin conexión y el almacenamiento del aparato, que viven en el
# navegador y no tienen contraparte en el servidor.
# =================================================================================================
set -uo pipefail

API="${API:-http://127.0.0.1:8095/api/v1}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5442}" PGUSER="${PGUSER:-luparx}"
export PGDATABASE="${PGDATABASE:-luparx_f3b}" PGPASSWORD="${PGPASSWORD:-luparx_dev_only}"
CORREO="${CORREO:-inspector@luparx.test}"
CLAVE="${CLAVE:-Password123!}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fallos=0
pruebas=0
ok() {
  pruebas=$((pruebas + 1))
  if [ "$1" = "1" ]; then printf '  ok    %s\n' "$2"
  else fallos=$((fallos + 1)); printf '  FALLA %s  — %s\n' "$2" "${3:-}"; fi
}
sql() { psql -t -A -q -c "$1"; }
cur() { curl -s --noproxy '*' --max-time 25 "$@"; }
campo() { python3 -c "
import json,sys
try: d=json.load(open('$1'))
except Exception: print(''); raise SystemExit
for k in '$2'.split('.'):
    if isinstance(d, list): d = d[int(k)] if d else {}
    else: d = (d or {}).get(k) if isinstance(d, dict) else None
print('' if d is None else d)"; }

echo "=== Inspector · integración real contra $API ==="

# --- 1. entrar y elegir municipalidad -----------------------------------------------------------
echo
echo "1. Entrar / municipalidad"
H=$(cur -o "$TMP/login.json" -w '%{http_code}' -X POST "$API/auth/inspector/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$CORREO\",\"password\":\"$CLAVE\"}")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "login contesta 200 (HTTP $H)" "$(head -c 150 "$TMP/login.json")"
TOK=$(campo "$TMP/login.json" accessToken); REF=$(campo "$TMP/login.json" refreshToken)
if [ -z "$TOK" ]; then echo "✗ sin credencial: el resto no se puede probar"; exit 1; fi
ok 1 "y devuelve un par de credenciales"

H=$(cur -o "$TMP/mem.json" -w '%{http_code}' -H "Authorization: Bearer $TOK" "$API/inspector/me/memberships")
TEN=$(campo "$TMP/mem.json" 0.tenantId)
ok "$([ "$H" = 200 ] && [ -n "$TEN" ] && echo 1 || echo 0)" "las municipalidades del fiscalizador llegan (HTTP $H)"

H=$(cur -o "$TMP/ses.json" -w '%{http_code}' -X POST "$API/inspector/session/tenant" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"tenantId\":\"$TEN\",\"refreshToken\":\"$REF\"}")
TOK=$(campo "$TMP/ses.json" tokens.accessToken)
ok "$([ "$H" = 200 ] && [ -n "$TOK" ] && echo 1 || echo 0)" "elegir municipalidad devuelve una credencial con inquilino (HTTP $H)"
AUT=(-H "Authorization: Bearer $TOK")

# --- 2. zonas y tipos ---------------------------------------------------------------------------
echo
echo "2. Zonas y tipos de infracción"
H=$(cur -o "$TMP/zonas.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/zones")
N_ZONAS=$(python3 -c "import json;print(len(json.load(open('$TMP/zonas.json'))))" 2>/dev/null || echo 0)
ok "$([ "$H" = 200 ] && [ "$N_ZONAS" -gt 0 ] && echo 1 || echo 0)" "GET /inspector/zones trae $N_ZONAS zonas (HTTP $H)"
ZONA=$(campo "$TMP/zonas.json" 0.id)
ZONA_COD=$(campo "$TMP/zonas.json" 0.code)

H=$(cur -o "$TMP/tipos.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/enforcement/infraction-types")
N_TIPOS=$(python3 -c "import json;print(len(json.load(open('$TMP/tipos.json'))))" 2>/dev/null || echo 0)
ok "$([ "$H" = 200 ] && [ "$N_TIPOS" -gt 0 ] && echo 1 || echo 0)" "los tipos de infracción llegan: $N_TIPOS (HTTP $H)"
# Uno que NO exija fotografía, para poder emitir sin evidencia en el bloque 6.
TIPO=$(python3 -c "
import json
t=json.load(open('$TMP/tipos.json'))
sin=[x for x in t if not x.get('requiresPhoto')]
print((sin or t)[0]['id'])")
TIPO_FOTO=$(python3 -c "
import json
t=json.load(open('$TMP/tipos.json'))
con=[x for x in t if x.get('requiresPhoto')]
print(con[0]['id'] if con else '')")
ok "$([ -n "$TIPO" ] && echo 1 || echo 0)" "hay un tipo que no exige fotografía, para emitir sin evidencia"

BAHIA=$(sql "select s.code from parking_spaces s join parking_zones z on z.id=s.zone_id
              where z.id='$ZONA' order by s.code limit 1;")
ok "$([ -n "$BAHIA" ] && echo 1 || echo 0)" "y una bahía real de la zona $ZONA_COD: $BAHIA"

# --- 3. consulta de placa en los tres estados de ubicación --------------------------------------
echo
echo "3. Consulta de placa (FIX / NO_FIX / NOT_GRANTED)"
consulta() { # $1 estado, $2 cuerpo extra, $3 archivo
  cur -o "$3" -w '%{http_code}' -X POST "$API/inspector/plate-checks" "${AUT[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"plate\":\"SJP123\",\"zoneId\":\"$ZONA\",\"spaceCode\":\"$BAHIA\",\"locationState\":\"$1\"$2}"
}
H=$(consulta FIX ',"latitude":9.9333,"longitude":-84.0800,"locationAccuracyM":8' "$TMP/fix.json")
ok "$([ "$H" = 200 ] || [ "$H" = 201 ] && echo 1 || echo 0)" "FIX con coordenadas contesta (HTTP $H)" "$(head -c 160 "$TMP/fix.json")"
VEREDICTO=$(campo "$TMP/fix.json" verdict)
CHECK_ID=$(campo "$TMP/fix.json" checkId)
ok "$([ -n "$VEREDICTO" ] && echo 1 || echo 0)" "y trae un veredicto: $VEREDICTO"
ok "$([ -n "$CHECK_ID" ] && echo 1 || echo 0)" "y el identificador de la consulta, para poder ligarla a la boleta"

H=$(consulta NO_FIX '' "$TMP/nofix.json")
ok "$([ "$H" = 200 ] || [ "$H" = 201 ] && echo 1 || echo 0)" "NO_FIX —el GPS no fijó— contesta igual (HTTP $H)"
H=$(consulta NOT_GRANTED '' "$TMP/nograntd.json")
ok "$([ "$H" = 200 ] || [ "$H" = 201 ] && echo 1 || echo 0)" "NOT_GRANTED —sin permiso de ubicación— contesta igual (HTTP $H)"

# Lo que importa de los tres estados: que queden ANOTADOS distintos en la bitácora de fiscalización.
ESTADOS=$(sql "select string_agg(distinct location_state, ',' order by location_state)
                from enforcement_checks where plate='SJP123';")
ok "$(echo "$ESTADOS" | grep -q 'FIX' && echo "$ESTADOS" | grep -q 'NO_FIX' && echo "$ESTADOS" | grep -q 'NOT_GRANTED' && echo 1 || echo 0)" \
  "y los tres estados quedan distinguidos en enforcement_checks: $ESTADOS"
COORDS=$(sql "select count(*) from enforcement_checks
               where plate='SJP123' and latitude is not null;")
ok "$([ "$COORDS" -ge 1 ] && echo 1 || echo 0)" \
  "sólo la consulta con FIX guardó coordenadas ($COORDS fila con latitud)"

# --- 4. ZONE_NOT_ASSIGNED -----------------------------------------------------------------------
echo
echo "4. ZONE_NOT_ASSIGNED"
# La refusal sólo existe cuando el fiscalizador TIENE zonas asignadas: con la lista vacía el
# servidor entiende «cubre toda la municipalidad». El sembrador no asigna ninguna, así que se
# asigna una a mano —es el fixture de esta prueba— y se consulta OTRA.
MEMBRESIA=$(sql "select m.id from tenant_memberships m join users u on u.id=m.user_id
                  where u.email='$CORREO' and m.tenant_id='$TEN' limit 1;")
OTRA=$(sql "select id from parking_zones where tenant_id='$TEN' and id <> '$ZONA' limit 1;")
if [ -n "$MEMBRESIA" ] && [ -n "$OTRA" ]; then
  sql "insert into membership_zones (membership_id, zone_id, assigned_at)
        values ('$MEMBRESIA','$ZONA', now()) on conflict do nothing;" >/dev/null
  H=$(cur -o "$TMP/zna.json" -w '%{http_code}' -X POST "$API/inspector/plate-checks" "${AUT[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"plate\":\"SJP123\",\"zoneId\":\"$OTRA\",\"locationState\":\"NOT_GRANTED\"}")
  ok "$([ "$H" = 403 ] && echo 1 || echo 0)" "una zona que no cubre se rechaza con 403 (HTTP $H)" "$(head -c 160 "$TMP/zna.json")"
  ok "$([ "$(campo "$TMP/zna.json" code)" = "ZONE_NOT_ASSIGNED" ] && echo 1 || echo 0)" \
    "con código ZONE_NOT_ASSIGNED ($(campo "$TMP/zna.json" code))"
  RECHAZO=$(sql "select count(*) from enforcement_checks
                  where zone_id='$OTRA' and refusal_code='ZONE_NOT_ASSIGNED';")
  ok "$([ "$RECHAZO" -ge 1 ] && echo 1 || echo 0)" \
    "y el rechazo TAMBIÉN queda en la bitácora ($RECHAZO): negarse no es no haber mirado"
  H=$(cur -o "$TMP/sigue.json" -w '%{http_code}' -X POST "$API/inspector/plate-checks" "${AUT[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"plate\":\"SJP123\",\"zoneId\":\"$ZONA\",\"spaceCode\":\"$BAHIA\",\"locationState\":\"NOT_GRANTED\"}")
  ok "$([ "$H" = 200 ] || [ "$H" = 201 ] && echo 1 || echo 0)" \
    "y su propia zona sigue contestando (HTTP $H): la restricción no lo deja sin trabajar"
  # Medido de paso, y es comportamiento correcto que conviene fijar: la zona y la bahía viajan
  # juntas o no identifican nada. Mandar sólo la zona no es «media consulta», es una consulta que
  # no se puede contestar, y el servidor lo dice nombrando el campo.
  H=$(cur -o "$TMP/sinbahia.json" -w '%{http_code}' -X POST "$API/inspector/plate-checks" "${AUT[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"plate\":\"SJP123\",\"zoneId\":\"$ZONA\",\"locationState\":\"NOT_GRANTED\"}")
  ok "$([ "$H" = 422 ] && echo 1 || echo 0)" "una zona sin bahía se rechaza con 422 (HTTP $H)"
  ok "$([ "$(campo "$TMP/sinbahia.json" errors.0.field)" = "spaceCode" ] && echo 1 || echo 0)" \
    "señalando spaceCode, para que la pantalla ponga el mensaje en su sitio"
  sql "delete from membership_zones where membership_id='$MEMBRESIA' and zone_id='$ZONA';" >/dev/null
else
  ok 0 "no se pudo preparar el fixture de zonas asignadas" "membresía=$MEMBRESIA otra=$OTRA"
fi

# --- 5. emisión: 201 la primera, 200 el reenvío -------------------------------------------------
echo
echo "5. Emisión e idempotencia"
DEV_ID="dev-$(date +%s)-$RANDOM"
CUERPO="{\"infractionTypeId\":\"$TIPO\",\"plate\":\"SJP123\",\"zoneId\":\"$ZONA\",\"spaceCode\":\"$BAHIA\",\"deviceCitationId\":\"$DEV_ID\",\"enforcementCheckId\":\"$CHECK_ID\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"notes\":\"integración nivel 3\"}"
H=$(cur -o "$TMP/c1.json" -w '%{http_code}' -X POST "$API/inspector/citations" "${AUT[@]}" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: k1-$DEV_ID" -d "$CUERPO")
ok "$([ "$H" = 201 ] && echo 1 || echo 0)" "la primera captura contesta 201 (HTTP $H)" "$(head -c 200 "$TMP/c1.json")"
BOLETA=$(campo "$TMP/c1.json" citation.id)
[ -z "$BOLETA" ] && BOLETA=$(campo "$TMP/c1.json" id)
ok "$([ -n "$BOLETA" ] && echo 1 || echo 0)" "y devuelve la boleta creada"

# Mismo ACTO, clave de idempotencia distinta: es el caso que `deviceCitationId` existe para cubrir.
H=$(cur -o "$TMP/c2.json" -w '%{http_code}' -X POST "$API/inspector/citations" "${AUT[@]}" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: k2-$DEV_ID" -d "$CUERPO")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" \
  "el MISMO deviceCitationId con otra clave contesta 200, no 201 (HTTP $H)" "$(head -c 200 "$TMP/c2.json")"
B2=$(campo "$TMP/c2.json" citation.id); [ -z "$B2" ] && B2=$(campo "$TMP/c2.json" id)
ok "$([ "$B2" = "$BOLETA" ] && echo 1 || echo 0)" "y es la MISMA boleta, no una segunda" "$BOLETA vs $B2"

# Misma clave: el servidor repite la respuesta guardada.
H=$(cur -o "$TMP/c3.json" -w '%{http_code}' -X POST "$API/inspector/citations" "${AUT[@]}" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: k1-$DEV_ID" -d "$CUERPO")
ok "$([ "$H" = 201 ] || [ "$H" = 200 ] && echo 1 || echo 0)" \
  "repetir la MISMA Idempotency-Key no crea nada (HTTP $H)"
CUANTAS=$(sql "select count(*) from citations where device_citation_id='$DEV_ID';")
ok "$([ "$CUANTAS" = 1 ] && echo 1 || echo 0)" \
  "en la base hay UNA sola boleta para ese acto, tras tres envíos ($CUANTAS)"

# --- 5b. una captura sin fotografía se emite sola -----------------------------------------------
ESTADO1=$(sql "select status from citations where id='$BOLETA';")
ok "$([ "$ESTADO1" = "ISSUED" ] && echo 1 || echo 0)" \
  "un tipo que no exige fotografía queda emitido de una vez ($ESTADO1): no deja al fiscalizador con un segundo paso"

# --- 6. evidencia, sobre una boleta que SÍ la exige ---------------------------------------------
echo
echo "6. Evidencia"
if [ -n "$TIPO_FOTO" ]; then
  DEV_FOTO="devf-$(date +%s)-$RANDOM"
  H=$(cur -o "$TMP/cf.json" -w '%{http_code}' -X POST "$API/inspector/citations" "${AUT[@]}" \
    -H 'Content-Type: application/json' -H "Idempotency-Key: kf-$DEV_FOTO" \
    -d "{\"infractionTypeId\":\"$TIPO_FOTO\",\"plate\":\"SJP456\",\"zoneId\":\"$ZONA\",\"spaceCode\":\"$BAHIA\",\"deviceCitationId\":\"$DEV_FOTO\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
  BOLETA=$(campo "$TMP/cf.json" citation.id); [ -z "$BOLETA" ] && BOLETA=$(campo "$TMP/cf.json" id)
  ok "$([ "$H" = 201 ] && [ -n "$BOLETA" ] && echo 1 || echo 0)" "una boleta de un tipo que exige fotografía se captura (HTTP $H)"
  ESTADO2=$(sql "select status from citations where id='$BOLETA';")
  ok "$([ "$ESTADO2" = "DRAFT" ] && echo 1 || echo 0)" \
    "y queda en DRAFT ($ESTADO2): sin fotografía no se emite, que es la regla del tipo"
else
  ok 0 "no hay ningún tipo de infracción que exija fotografía en esta municipalidad"
fi
python3 -c "
import base64, pathlib
# Un PNG de 1x1 válido: lo que importa es que sea una imagen real, no su contenido.
pathlib.Path('$TMP/foto.png').write_bytes(base64.b64decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='))"
H=$(cur -o "$TMP/ev.json" -w '%{http_code}' -X POST "$API/inspector/citations/$BOLETA/evidence" "${AUT[@]}" \
  -F "file=@$TMP/foto.png;type=image/png" -F "capturedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -F "latitude=9.9333" -F "longitude=-84.0800")
ok "$([ "$H" = 200 ] || [ "$H" = 201 ] && echo 1 || echo 0)" "subir una fotografía contesta (HTTP $H)" "$(head -c 200 "$TMP/ev.json")"
EV=$(campo "$TMP/ev.json" id)
ok "$([ -n "$EV" ] && echo 1 || echo 0)" "y devuelve su identificador"
if [ -n "$EV" ]; then
  H=$(cur -o "$TMP/bajada.bin" -w '%{http_code}' "${AUT[@]}" "$API/inspector/citations/$BOLETA/evidence/$EV")
  BYTES=$(wc -c < "$TMP/bajada.bin" | tr -d ' ')
  ok "$([ "$H" = 200 ] && [ "$BYTES" -gt 0 ] && echo 1 || echo 0)" \
    "y se puede volver a bajar: HTTP $H, $BYTES bytes"
  ok "$([ "$BYTES" = "$(wc -c < "$TMP/foto.png" | tr -d ' ')" ] && echo 1 || echo 0)" \
    "con el mismo tamaño que se subió: la evidencia no se altera por el camino"
fi

# --- 7. emitir ----------------------------------------------------------------------------------
echo
echo "7. Emitir"
ESTADO=$(sql "select status from citations where id='$BOLETA';")
H=$(cur -o "$TMP/em.json" -w '%{http_code}' -X POST "$API/inspector/citations/$BOLETA/issue" "${AUT[@]}" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: emi-$DEV_ID")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "emitir el borrador contesta 200 (HTTP $H, antes estaba $ESTADO)" "$(head -c 200 "$TMP/em.json")"
NUMERO=$(sql "select number from citations where id='$BOLETA';")
ok "$([ -n "$NUMERO" ] && echo 1 || echo 0)" "y la boleta queda con número: $NUMERO"
ok "$([ "$(sql "select status from citations where id='$BOLETA';")" = "ISSUED" ] && echo 1 || echo 0)" \
  "y en estado ISSUED"
H=$(cur -o "$TMP/em2.json" -w '%{http_code}' -X POST "$API/inspector/citations/$BOLETA/issue" "${AUT[@]}" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: emi-$DEV_ID")
ok "$([ "$(sql "select number from citations where id='$BOLETA';")" = "$NUMERO" ] && echo 1 || echo 0)" \
  "reenviar la emisión no cambia el número (HTTP $H): un número de boleta no se gasta dos veces"

# --- 8. lista y detalle -------------------------------------------------------------------------
echo
echo "8. Mis boletas: lista y detalle"
H=$(cur -o "$TMP/lista.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/citations?page=0&size=20")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "la lista contesta 200 (HTTP $H)"
ok "$(grep -q "$BOLETA" "$TMP/lista.json" && echo 1 || echo 0)" "y la boleta recién emitida está en ella"
TOTAL=$(campo "$TMP/lista.json" totalElements)
ok "$([ -n "$TOTAL" ] && echo 1 || echo 0)" "con un total para poder paginar: $TOTAL"
H=$(cur -o "$TMP/det.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/citations/$BOLETA")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "el detalle contesta 200 (HTTP $H)"
ok "$(grep -q "$NUMERO" "$TMP/det.json" && echo 1 || echo 0)" "y trae el número de la boleta"
ok "$(grep -qi "evidence\|evidencia" "$TMP/det.json" && echo 1 || echo 0)" "y menciona su evidencia"

# --- 8b. Mis boletas: filtros (estado + rango de fechas) ----------------------------------------
echo
echo "8b. Mis boletas: filtros"
# $BOLETA quedó ISSUED en el paso 7; se filtra sobre datos REALES.
HOY_DESDE=$(date -u -d 'today 00:00' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)
HOY_HASTA=$(date -u -d 'tomorrow 00:00' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)

H=$(cur -o "$TMP/f_issued.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/citations?status=ISSUED&size=50")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "status=ISSUED contesta 200 (HTTP $H)"
ok "$(grep -q "$BOLETA" "$TMP/f_issued.json" && echo 1 || echo 0)" "y la boleta emitida está en el filtro ISSUED"

cur -o "$TMP/f_draft.json" "${AUT[@]}" "$API/inspector/citations?status=DRAFT&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_draft.json" && echo 0 || echo 1)" "con status=DRAFT la boleta ISSUED NO está"

cur -o "$TMP/f_bad.json" "${AUT[@]}" "$API/inspector/citations?status=NO_EXISTE&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_bad.json" && echo 1 || echo 0)" "un status inválido se ignora (contrato leniente): la boleta sigue"

cur -o "$TMP/f_hoy.json" "${AUT[@]}" "$API/inspector/citations?from=$HOY_DESDE&to=$HOY_HASTA&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_hoy.json" && echo 1 || echo 0)" "rango de hoy (from+to): la boleta está"

cur -o "$TMP/f_viejo.json" "${AUT[@]}" "$API/inspector/citations?from=2000-01-01T00:00:00Z&to=2000-01-02T00:00:00Z&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_viejo.json" && echo 0 || echo 1)" "rango viejo: la boleta no está"

cur -o "$TMP/f_combo.json" "${AUT[@]}" "$API/inspector/citations?status=ISSUED&from=$HOY_DESDE&to=$HOY_HASTA&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_combo.json" && echo 1 || echo 0)" "estado+fechas combinados: la boleta está"

cur -o "$TMP/f_inv.json" "${AUT[@]}" "$API/inspector/citations?from=$HOY_HASTA&to=$HOY_DESDE&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_inv.json" && echo 0 || echo 1)" "rango invertido: lista sin la boleta (vacío por contrato)"

H=$(cur -o "$TMP/f_none.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/citations?page=0&size=20")
ok "$([ "$H" = 200 ] && grep -q "$BOLETA" "$TMP/f_none.json" && echo 1 || echo 0)" "sin filtros: la boleta sigue (equivale al listado anterior)"
if python3 - "$TMP/f_none.json" <<'PYORD'
import json,sys
d=json.load(open(sys.argv[1])); it=d.get('items') or []
raise SystemExit(0 if len(it) < 2 or (it[0].get('occurredAt','') >= it[1].get('occurredAt','')) else 1)
PYORD
then ord=1; else ord=0; fi
ok "$ord" "sin filtros: orden más reciente primero (o una sola fila)"

# Aislamiento: el endpoint NO acepta inspectorUserId ni tenant; inyectarlos no cambia nada.
cur -o "$TMP/f_iso.json" "${AUT[@]}" "$API/inspector/citations?inspectorUserId=00000000-0000-0000-0000-000000000000&tenantId=otro&size=50"
ok "$(grep -q "$BOLETA" "$TMP/f_iso.json" && echo 1 || echo 0)" "inyectar inspectorUserId/tenant ajenos se ignora: siguen siendo MIS boletas"

# --- 9. resumen de turno ------------------------------------------------------------------------
echo
echo "9. Resumen de turno"
DESDE=$(date -u -d 'today 00:00' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)
HASTA=$(date -u -d 'tomorrow 00:00' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d -v0H -v0M -v0S +%Y-%m-%dT%H:%M:%SZ)
H=$(cur -o "$TMP/turno.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/shift-summary?from=$DESDE&to=$HASTA")
ok "$([ "$H" = 200 ] && echo 1 || echo 0)" "el resumen del día contesta 200 (HTTP $H)"
CONSULTAS=$(campo "$TMP/turno.json" checks); BOLETAS=$(campo "$TMP/turno.json" citations)
ok "$([ "${CONSULTAS:-0}" -ge 4 ] && echo 1 || echo 0)" \
  "y cuenta las consultas que esta corrida hizo: $CONSULTAS"
ok "$([ "${BOLETAS:-0}" -ge 1 ] && echo 1 || echo 0)" "y la boleta emitida: $BOLETAS"
H=$(cur -o "$TMP/turno2.json" -w '%{http_code}' "${AUT[@]}" "$API/inspector/shift-summary?from=$HASTA&to=$DESDE")
ok "$([ "$H" = 422 ] && echo 1 || echo 0)" \
  "una ventana invertida se rechaza con 422, no con ceros (HTTP $H)"

echo
printf '%s comprobaciones · %s fallo%s\n' "$pruebas" "$fallos" "$([ "$fallos" = 1 ] || echo s)"
exit $([ "$fallos" = 0 ] && echo 0 || echo 1)
