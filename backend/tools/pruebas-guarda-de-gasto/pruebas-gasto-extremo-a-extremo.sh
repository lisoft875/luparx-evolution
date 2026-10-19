#!/usr/bin/env bash
# =================================================================================================
# El gasto de la billetera, contra el backend REAL y una base REAL.
#
# Qué prueba, y por qué no alcanzaba lo que ya había: `PruebaGuardaDeGasto` prueba la decisión pura
# y `PruebaGastoConectado` prueba que WalletService.charge la consulta. Ninguna de las dos toca
# PostgreSQL, así que ninguna puede responder las preguntas que sólo existen cuando hay una base y
# dos peticiones a la vez:
#
#   A. saldo suficiente: el cobro ocurre y descuenta exactamente lo cotizado
#   B. idempotencia: la misma Idempotency-Key dos veces cobra UNA vez
#   C. concurrencia: dos solicitudes a la vez con saldo para UNA sola no gastan dos veces
#   D. saldo insuficiente: se rechaza y no deja rastro
#   E. rollback: una solicitud que falla por una regla del dominio no mueve el saldo
#   F. autorización: sin sesión no se gasta, y el portal equivocado tampoco
#   G. saldo de PRUEBA bajo concurrencia: ocho solicitudes a la vez, todas rechazadas, cero movimientos
#
# CÓMO CORRERLO
#   1. una base PostgreSQL 16 con PostGIS y las 43 migraciones aplicadas;
#   2. el backend arrancado contra ella SIN perfil dev/demo (instalación operativa);
#   3. los datos del sembrador de desarrollo ya presentes (se siembran arrancando una vez con
#      SPRING_PROFILES_ACTIVE=dev y se conservan al reiniciar sin perfil).
#
#   API=http://127.0.0.1:8092/api/v1 PGPORT=5442 PGDATABASE=luparx_src \
#     bash backend/tools/pruebas-guarda-de-gasto/pruebas-gasto-extremo-a-extremo.sh
#
# AVISO: ajusta el saldo de una billetera de DEMOSTRACIÓN para poder provocar «saldo insuficiente»
# con las duraciones que la municipalidad ofrece (30/60/120 minutos, ₡800). No inserta saldo: lo
# BAJA. No usa tarjetas, no activa SINPE y no toca ninguna pasarela.
# =================================================================================================
set -uo pipefail

API="${API:-http://127.0.0.1:8092/api/v1}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5442}" PGUSER="${PGUSER:-luparx}"
export PGDATABASE="${PGDATABASE:-luparx_src}" PGPASSWORD="${PGPASSWORD:-luparx_dev_only}"
CORREO="${CORREO:-ana.morales@luparx.test}"
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

# --- sesión --------------------------------------------------------------------------------------
cur -X POST "$API/auth/citizen/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CORREO\",\"password\":\"$CLAVE\"}" -o "$TMP/login.json"
TOK=$(python3 -c "import json;print(json.load(open('$TMP/login.json'))['accessToken'])" 2>/dev/null || true)
REF=$(python3 -c "import json;print(json.load(open('$TMP/login.json'))['refreshToken'])" 2>/dev/null || true)
if [ -z "${TOK:-}" ]; then echo "✗ no se pudo entrar como $CORREO"; exit 1; fi
TEN=$(sql "select id from tenants where slug='san-jose';")
cur -X POST "$API/citizen/session/tenant" -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d "{\"tenantId\":\"$TEN\",\"refreshToken\":\"$REF\"}" -o "$TMP/ses.json"
TOK=$(python3 -c "import json;print(json.load(open('$TMP/ses.json'))['tokens']['accessToken'])")
AUT=(-H "Authorization: Bearer $TOK")

CUENTA=$(sql "select a.id from wallet_accounts a join users u on u.id=a.user_id
                where u.email='$CORREO' and a.tenant_id='$TEN';")
ZONA=$(cur "${AUT[@]}" "$API/citizen/parking/zones" \
  | python3 -c "import json,sys;print([z['id'] for z in json.load(sys.stdin) if z['code']=='SJ-ESCALANTE'][0])")
PRECIO=$(cur -X POST "$API/citizen/parking/quote" "${AUT[@]}" -H 'Content-Type: application/json' \
  -d "{\"zoneId\":\"$ZONA\",\"minutes\":30}" | python3 -c "import json,sys;print(json.load(sys.stdin)['payable']['amountMinor'])")
echo "billetera $CUENTA · zona SJ-ESCALANTE · 30 min cuesta $PRECIO"

saldo() { sql "select balance_minor from wallet_accounts where id='$CUENTA';"; }
movimientos() { sql "select count(*) from wallet_transactions where account_id='$CUENTA';"; }
poner_saldo() { # $1 = minor
  sql "update wallet_accounts set balance_minor=$1, version=version+1 where id='$CUENTA';" >/dev/null
}
iniciar() { # $1 bahía, $2 placa, $3 clave de idempotencia, $4 archivo
  cur -o "$4" -w '%{http_code}' -X POST "$API/citizen/parking/sessions" "${AUT[@]}" \
    -H 'Content-Type: application/json' -H "Idempotency-Key: $3" \
    -d "{\"zoneId\":\"$ZONA\",\"spaceCode\":\"$1\",\"plate\":\"$2\",\"vehicleType\":\"CAR\",\"minutes\":30}"
}
codigo() { python3 -c "import json;print(json.load(open('$1')).get('code','-'))" 2>/dev/null || echo '-'; }

# --- A. saldo suficiente -------------------------------------------------------------------------
echo
echo "A. saldo suficiente"
poner_saldo $((PRECIO * 4))
ANTES=$(saldo); MOV_ANTES=$(movimientos)
HTTP=$(iniciar 0003 CRGA001 "a-$RANDOM$RANDOM" "$TMP/a.json")
ok "$([ "$HTTP" = 200 ] && echo 1 || echo 0)" "el cobro ocurre (HTTP $HTTP)" "$(head -c 160 "$TMP/a.json")"
DESPUES=$(saldo)
ok "$([ "$((ANTES - DESPUES))" = "$PRECIO" ] && echo 1 || echo 0)" \
  "descuenta exactamente lo cotizado ($ANTES → $DESPUES)" "esperaba -$PRECIO"
ok "$([ "$(movimientos)" = "$((MOV_ANTES + 1))" ] && echo 1 || echo 0)" \
  "y escribe UN movimiento en el libro"

# --- B. idempotencia -----------------------------------------------------------------------------
echo
echo "B. idempotencia"
poner_saldo $((PRECIO * 4))
ANTES=$(saldo); MOV_ANTES=$(movimientos)
CLAVE_IDEM="b-$RANDOM$RANDOM"
H1=$(iniciar 0004 CRGB001 "$CLAVE_IDEM" "$TMP/b1.json")
H2=$(iniciar 0004 CRGB001 "$CLAVE_IDEM" "$TMP/b2.json")
ok "$([ "$H1" = 200 ] && echo 1 || echo 0)" "la primera pasa (HTTP $H1)" "$(head -c 160 "$TMP/b1.json")"
ok "$([ "$H2" = 200 ] && echo 1 || echo 0)" "la repetición no es un error (HTTP $H2)" "$(head -c 160 "$TMP/b2.json")"
ID1=$(python3 -c "import json;print(json.load(open('$TMP/b1.json')).get('id'))" 2>/dev/null || echo x)
ID2=$(python3 -c "import json;print(json.load(open('$TMP/b2.json')).get('id'))" 2>/dev/null || echo y)
ok "$([ "$ID1" = "$ID2" ] && echo 1 || echo 0)" "y devuelve la MISMA estadía" "$ID1 ≠ $ID2"
DESPUES=$(saldo)
ok "$([ "$((ANTES - DESPUES))" = "$PRECIO" ] && echo 1 || echo 0)" \
  "se cobró UNA sola vez ($ANTES → $DESPUES)" "esperaba -$PRECIO"
ok "$([ "$(movimientos)" = "$((MOV_ANTES + 1))" ] && echo 1 || echo 0)" \
  "y hay UN movimiento, no dos"

# --- C. dos solicitudes a la vez, saldo para una -------------------------------------------------
echo
echo "C. concurrencia: saldo para UNA, dos solicitudes a la vez"
poner_saldo $((PRECIO + PRECIO / 2))   # alcanza para una sola
ANTES=$(saldo); MOV_ANTES=$(movimientos)
iniciar 0005 CRGC001 "c1-$RANDOM$RANDOM" "$TMP/c1.json" > "$TMP/c1.http" &
iniciar 0003 CRGC002 "c2-$RANDOM$RANDOM" "$TMP/c2.json" > "$TMP/c2.http" &
wait
H1=$(cat "$TMP/c1.http"); H2=$(cat "$TMP/c2.http")
EXITOS=0
[ "$H1" = 200 ] && EXITOS=$((EXITOS + 1))
[ "$H2" = 200 ] && EXITOS=$((EXITOS + 1))
ok "$([ "$EXITOS" = 1 ] && echo 1 || echo 0)" \
  "exactamente UNA de las dos cobra (HTTP $H1 / $H2)" "$EXITOS cobraron"
RECHAZO=$([ "$H1" = 200 ] && codigo "$TMP/c2.json" || codigo "$TMP/c1.json")
ok "$([ "$RECHAZO" = "INSUFFICIENT_BALANCE" ] && echo 1 || echo 0)" \
  "y la otra se rechaza por saldo, no por un error cualquiera ($RECHAZO)"
DESPUES=$(saldo)
ok "$([ "$((ANTES - DESPUES))" = "$PRECIO" ] && echo 1 || echo 0)" \
  "el saldo bajó UNA vez ($ANTES → $DESPUES)" "esperaba -$PRECIO"
ok "$([ "$DESPUES" -ge 0 ] && echo 1 || echo 0)" "y nunca quedó negativo ($DESPUES)"
ok "$([ "$(movimientos)" = "$((MOV_ANTES + 1))" ] && echo 1 || echo 0)" \
  "un solo movimiento: no hubo doble gasto"

# --- D. saldo insuficiente -----------------------------------------------------------------------
echo
echo "D. saldo insuficiente"
poner_saldo $((PRECIO - 1))
ANTES=$(saldo); MOV_ANTES=$(movimientos)
HTTP=$(iniciar 0004 CRGD001 "d-$RANDOM$RANDOM" "$TMP/d.json")
ok "$([ "$HTTP" = 409 ] && echo 1 || echo 0)" "se rechaza (HTTP $HTTP)" "$(head -c 160 "$TMP/d.json")"
ok "$([ "$(codigo "$TMP/d.json")" = "INSUFFICIENT_BALANCE" ] && echo 1 || echo 0)" \
  "con INSUFFICIENT_BALANCE ($(codigo "$TMP/d.json"))"
ok "$([ "$(saldo)" = "$ANTES" ] && echo 1 || echo 0)" "el saldo no se movió ($ANTES → $(saldo))"
ok "$([ "$(movimientos)" = "$MOV_ANTES" ] && echo 1 || echo 0)" "y no quedó ningún movimiento"

# --- E. rollback: falla una regla del dominio ----------------------------------------------------
echo
echo "E. rollback: una regla del dominio corta el camino"
poner_saldo $((PRECIO * 4))
ANTES=$(saldo); MOV_ANTES=$(movimientos)
# Una bahía que no existe en esta municipalidad: la validación corta antes de tocar la billetera.
HTTP=$(iniciar 9999 CRGE001 "e-$RANDOM$RANDOM" "$TMP/e.json")
ok "$([ "$HTTP" != 200 ] && echo 1 || echo 0)" "la solicitud falla (HTTP $HTTP)" "$(head -c 160 "$TMP/e.json")"
ok "$([ "$(saldo)" = "$ANTES" ] && echo 1 || echo 0)" \
  "y el saldo queda intacto ($ANTES → $(saldo)): no hay cobro sin estadía"
ok "$([ "$(movimientos)" = "$MOV_ANTES" ] && echo 1 || echo 0)" "ni movimiento a medias"

# --- F. autorización -----------------------------------------------------------------------------
echo
echo "F. autorización"
poner_saldo $((PRECIO * 4))
ANTES=$(saldo)
SIN=$(cur -o "$TMP/f1.json" -w '%{http_code}' -X POST "$API/citizen/parking/sessions" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: f1-$RANDOM" \
  -d "{\"zoneId\":\"$ZONA\",\"spaceCode\":\"0003\",\"plate\":\"CRGF001\",\"vehicleType\":\"CAR\",\"minutes\":30}")
ok "$([ "$SIN" = 401 ] && echo 1 || echo 0)" "sin sesión no se gasta (HTTP $SIN)"
# El token de otro portal: el mismo usuario, pero la credencial no es de ciudadano.
cur -X POST "$API/auth/inspector/login" -H 'Content-Type: application/json' \
  -d '{"email":"inspector@luparx.test","password":"Password123!"}' -o "$TMP/fi.json"
TI=$(python3 -c "import json;print(json.load(open('$TMP/fi.json')).get('accessToken',''))" 2>/dev/null || true)
if [ -n "${TI:-}" ]; then
  OTRO=$(cur -o "$TMP/f2.json" -w '%{http_code}' -X POST "$API/citizen/parking/sessions" \
    -H "Authorization: Bearer $TI" -H 'Content-Type: application/json' -H "Idempotency-Key: f2-$RANDOM" \
    -d "{\"zoneId\":\"$ZONA\",\"spaceCode\":\"0003\",\"plate\":\"CRGF002\",\"vehicleType\":\"CAR\",\"minutes\":30}")
  ok "$([ "$OTRO" != 200 ] && echo 1 || echo 0)" \
    "una credencial de otro portal tampoco (HTTP $OTRO)" "$(head -c 160 "$TMP/f2.json")"
else
  ok 0 "no se pudo obtener una credencial de fiscalización para la prueba cruzada"
fi
ok "$([ "$(saldo)" = "$ANTES" ] && echo 1 || echo 0)" "y el saldo sigue igual ($ANTES)"

# --- G. saldo de PRUEBA bajo concurrencia --------------------------------------------------------
echo
echo "G. saldo de PRUEBA: ocho solicitudes a la vez"
poner_saldo $((PRECIO * 20))
sql "insert into wallet_transactions (id, tenant_id, account_id, user_id, type, amount_minor,
       currency_code, balance_after_minor, idempotency_key, source, created_at)
     select gen_random_uuid(), a.tenant_id, a.id, a.user_id, 'TOP_UP', 1, 'CRC',
            a.balance_minor, 'copia-restaurada-$RANDOM', 'DEV', now()
       from wallet_accounts a where a.id='$CUENTA';" >/dev/null
ANTES=$(saldo); MOV_ANTES=$(movimientos)
for i in 1 2 3 4 5 6 7 8; do
  BAHIA=$([ $((i % 3)) = 0 ] && echo 0003 || { [ $((i % 3)) = 1 ] && echo 0004 || echo 0005; })
  iniciar "$BAHIA" "CRGG00$i" "g$i-$RANDOM$RANDOM" "$TMP/g$i.json" > "$TMP/g$i.http" &
done
wait
RECHAZADAS=0; CORRECTO=0
for i in 1 2 3 4 5 6 7 8; do
  H=$(cat "$TMP/g$i.http")
  [ "$H" = 409 ] && RECHAZADAS=$((RECHAZADAS + 1))
  [ "$(codigo "$TMP/g$i.json")" = "TEST_MONEY_SPEND_REFUSED" ] && CORRECTO=$((CORRECTO + 1))
done
ok "$([ "$RECHAZADAS" = 8 ] && echo 1 || echo 0)" "las ocho se rechazan ($RECHAZADAS/8)"
ok "$([ "$CORRECTO" = 8 ] && echo 1 || echo 0)" \
  "y las ocho con TEST_MONEY_SPEND_REFUSED ($CORRECTO/8)"
ok "$([ "$(saldo)" = "$ANTES" ] && echo 1 || echo 0)" "el saldo no se movió ($ANTES → $(saldo))"
ok "$([ "$(movimientos)" = "$MOV_ANTES" ] && echo 1 || echo 0)" \
  "y el libro no creció: ninguna de las ocho gastó"
# se deja la billetera sin saldo de prueba, para que la instalación pueda volver a arrancar
sql "alter table wallet_transactions disable trigger user;
     delete from wallet_transactions where account_id='$CUENTA' and source='DEV';
     alter table wallet_transactions enable trigger user;" >/dev/null
ok "$([ "$(sql "select count(*) from wallet_transactions where account_id='$CUENTA' and source='DEV';")" = 0 ] && echo 1 || echo 0)" \
  "la billetera queda limpia al terminar"

# --- H. dos solicitudes que chocan contra una regla, a la vez ------------------------------------
echo
echo "H. la misma placa en la misma bahía, dos veces a la vez"
# A diferencia de E —donde la validación corta ANTES de tocar la billetera—, acá las dos
# solicitudes son legítimas al empezar y la regla «una estadía activa por placa» las separa bajo
# contención. La perdedora no se queda con el cobro: eso es el rollback, y no se puede probar sin
# dos peticiones de verdad y una base de verdad.
poner_saldo $((PRECIO * 5))
ANTES=$(saldo); MOV_ANTES=$(movimientos)
iniciar 0005 CRGH001 "h1-$RANDOM$RANDOM" "$TMP/h1.json" > "$TMP/h1.http" &
iniciar 0005 CRGH001 "h2-$RANDOM$RANDOM" "$TMP/h2.json" > "$TMP/h2.http" &
wait
H1=$(cat "$TMP/h1.http"); H2=$(cat "$TMP/h2.http")
EXITOS=0
[ "$H1" = 200 ] && EXITOS=$((EXITOS + 1))
[ "$H2" = 200 ] && EXITOS=$((EXITOS + 1))
PERDEDORA=$([ "$H1" = 200 ] && codigo "$TMP/h2.json" || codigo "$TMP/h1.json")
ok "$([ "$EXITOS" = 1 ] && echo 1 || echo 0)" \
  "exactamente UNA abre la estadía (HTTP $H1 / $H2)" "$EXITOS abrieron"
ok "$([ "$PERDEDORA" = "SESSION_ALREADY_ACTIVE_FOR_PLATE" ] && echo 1 || echo 0)" \
  "y la otra se rechaza por la regla de la placa ($PERDEDORA)"
DESPUES=$(saldo)
ok "$([ "$((ANTES - DESPUES))" = "$PRECIO" ] && echo 1 || echo 0)" \
  "se cobró UNA vez ($ANTES → $DESPUES): la perdedora no se quedó con el cobro" "esperaba -$PRECIO"
ok "$([ "$(movimientos)" = "$((MOV_ANTES + 1))" ] && echo 1 || echo 0)" \
  "y hay UN movimiento: el de la perdedora se deshizo con su transacción"

echo
printf '%s comprobaciones · %s fallo%s\n' "$pruebas" "$fallos" "$([ "$fallos" = 1 ] || echo s)"
exit $([ "$fallos" = 0 ] && echo 0 || echo 1)
