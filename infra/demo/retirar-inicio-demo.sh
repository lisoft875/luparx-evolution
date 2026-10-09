#!/usr/bin/env bash
# =================================================================================================
# Retirar los datos de demostración del Inicio. Se corre EN EL SERVIDOR:
#
#     ./infra/demo/retirar-inicio-demo.sh            # cuenta lo que borraría y NO borra
#     ./infra/demo/retirar-inicio-demo.sh --aplicar  # lo borra
#
# Borra exactamente dos cosas y nada más:
#
#     payments           con provider = 'demo-seed'
#     parking_sessions   con plate_snapshot LIKE 'DMO%'
#
# Esas dos condiciones son los marcadores que escribe `DevDashboardSeeder` y no pueden alcanzar por
# accidente a una fila que no sea suya: ningún proveedor de pago real se llama «demo-seed» y
# ninguna placa de Costa Rica empieza por DMO.
#
# Lo que NO hace, y es deliberado:
#
#   · No toca zonas, bahías, tarifas, municipios, cuentas, boletas ni auditoría. El sembrador no
#     escribió en ninguna de esas tablas, así que retirarlo tampoco.
#   · No usa CASCADE. Si algo colgara de un pago o de una estadía de demostración —una línea de
#     conciliación, un movimiento de billetera—, este guion se DETIENE y lo dice, en vez de
#     arrastrar una fila que no sembró. Eso sólo puede pasar si alguien usó esos registros desde
#     la aplicación; entonces ya no son desechables y la decisión es de una persona.
#   · No apaga el sembrador. Si `LUPARX_DEV_SEED_DASHBOARD_DEMO` sigue en true, el próximo arranque
#     del backend los vuelve a crear. El guion lo avisa al final.
# =================================================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE_FILE="infra/docker-compose.deploy.yml"
ENV_FILE="${LUPARX_ENV_FILE:-infra/.env}"
APLICAR="${1:-}"

[[ -f "$ENV_FILE" ]] || { echo "No está $ENV_FILE." >&2; exit 1; }

leer() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"''; }
DB="$(leer POSTGRES_DB)"
USUARIO="$(leer POSTGRES_USER)"
ENTORNO="$(leer LUPARX_ENVIRONMENT)"
SEMBRADO="$(leer LUPARX_DEV_SEED_DASHBOARD_DEMO)"

# Cerrojo de entorno. Vale la pena aunque el guion viva sólo en el servidor de staging: el día que
# alguien copie el repositorio a otra máquina, este `if` es lo único que queda entre un `--aplicar`
# distraído y una base que no era ésta.
if [[ -n "$ENTORNO" && "$ENTORNO" != "staging" ]]; then
  echo "LUPARX_ENVIRONMENT dice «$ENTORNO». Este guion sólo corre en staging." >&2
  exit 2
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
psql() { "${COMPOSE[@]}" exec -T postgres psql -U "$USUARIO" -d "$DB" -At -c "$1"; }

PAGOS="$(psql "SELECT count(*) FROM payments WHERE provider = 'demo-seed';")"
ESTADIAS="$(psql "SELECT count(*) FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';")"
MONTO="$(psql "SELECT to_char(coalesce(sum(gross_amount_minor),0)/100.0,'FM999G999G990D00') FROM payments WHERE provider = 'demo-seed';")"

echo "Datos de demostración encontrados:"
echo "  pagos    provider='demo-seed'   : $PAGOS  (suman $MONTO)"
echo "  estadías placa DMO###           : $ESTADIAS"

if [[ "$PAGOS" == "0" && "$ESTADIAS" == "0" ]]; then
  echo "No hay nada que retirar."
  exit 0
fi

# Nadie puede estar colgando de ellos.
COLGANDO=0
for comprobacion in \
  "SELECT count(*) FROM settlement_lines sl JOIN payments p ON p.id = sl.payment_id WHERE p.provider = 'demo-seed';|líneas de conciliación" \
  "SELECT count(*) FROM wallet_transactions wt JOIN payments p ON p.id = wt.payment_id WHERE p.provider = 'demo-seed';|movimientos de billetera" \
  "SELECT count(*) FROM parking_session_extensions e JOIN parking_sessions s ON s.id = e.session_id WHERE s.plate_snapshot LIKE 'DMO%';|extensiones de estadía"
do
  sql="${comprobacion%%|*}"; nombre="${comprobacion##*|}"
  n="$(psql "$sql" 2>/dev/null || echo 0)"
  if [[ "$n" != "0" ]]; then
    echo "  ⚠  $n $nombre cuelgan de los datos de demostración."
    COLGANDO=1
  fi
done

if [[ "$COLGANDO" == "1" ]]; then
  echo
  echo "DETENIDO. Algo que la aplicación creó se apoya en estos registros, así que ya no son" >&2
  echo "desechables. Revisá qué es antes de borrar nada; este guion no arrastra filas ajenas." >&2
  exit 3
fi

if [[ "$APLICAR" != "--aplicar" ]]; then
  echo
  echo "Esto fue un ensayo: no se borró nada. Para borrarlo de verdad:"
  echo "    ./infra/demo/retirar-inicio-demo.sh --aplicar"
  exit 0
fi

# Las dos borradas, en una transacción y en este orden: un pago puede estar referenciado desde una
# estadía, nunca al revés.
psql "BEGIN;
      DELETE FROM payments WHERE provider = 'demo-seed';
      DELETE FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';
      COMMIT;" >/dev/null

echo
echo "Retirados. Quedan:"
printf '  pagos demo-seed   : %s\n' "$(psql "SELECT count(*) FROM payments WHERE provider = 'demo-seed';")"
printf '  estadías DMO      : %s\n' "$(psql "SELECT count(*) FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';")"

if [[ "${SEMBRADO:-false}" == "true" ]]; then
  echo
  echo "AVISO: LUPARX_DEV_SEED_DASHBOARD_DEMO sigue en true en $ENV_FILE."
  echo "El próximo arranque del backend los vuelve a sembrar. Para que no vuelvan:"
  echo "    sed -i 's/^LUPARX_DEV_SEED_DASHBOARD_DEMO=true/LUPARX_DEV_SEED_DASHBOARD_DEMO=false/' $ENV_FILE"
  echo "    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --force-recreate backend"
fi
