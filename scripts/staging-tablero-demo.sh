#!/usr/bin/env bash
# =================================================================================================
# EL INICIO DEL ADMINISTRADOR CON DATOS, PARA UNA DEMOSTRACIÓN — staging y demo, nunca producción
#
# PARA QUÉ EXISTE
#
# El sembrador de siempre crea municipios, zonas, bahías, estadías pasadas y boletas, pero NUNCA
# crea un pago ni una estadía corriendo. Por eso el Inicio del administrador sale en cero donde más
# se mira: «Ocupación en tiempo real» 0%, «Ingresos esta semana» plano y «Zonas más utilizadas» sin
# una sola barra. Para enseñarle el producto a alguien, esa pantalla es la primera que ve.
#
# El backend ya trae lo que hace falta: `DevDashboardSeeder`, apagado salvo que se pida. Esto es el
# interruptor, con sus frenos y con el número que de verdad importa — CUÁNTO DURA.
#
# LO QUE HAY QUE SABER ANTES DE USARLO (leer esto, no es un detalle)
#
#   Las estadías se siembran escalonadas hacia atrás, de hace 1 minuto a hace 90, y cada una dura
#   120 minutos. Es decir: la ocupación EMPIEZA A BAJAR a los 30 minutos y a las 2 horas no queda
#   ninguna. No es un defecto del sembrador —escalonarlas es lo que evita que la pantalla pase de
#   llena a vacía de golpe—, pero sí decide cuándo hay que correr esto:
#
#       ENCENDELO 10 O 15 MINUTOS ANTES DE LA DEMOSTRACIÓN, NO LA NOCHE ANTERIOR.
#
#   Si la demostración se alarga, `refrescar` vuelve a llenar el parque sin tocar los pagos.
#
# LO QUE NO HACE, Y NO ES POR PRUDENCIA DECORATIVA
#
#   · No siembra boletas. «Multas emitidas» se queda en el número real, y está bien que así sea:
#     una boleta es un acto administrativo y fabricarlas es lo único de esta pantalla que no se
#     puede deshacer con un `delete`. Para que ese recuadro no salga en cero, emití dos o tres
#     desde el portal de fiscalización antes de empezar: tardan un minuto, quedan en el rastro de
#     auditoría como lo que son, y de paso «Actividad reciente» se llena sola.
#   · No toca la auditoría. Es la única tabla de la plataforma que existe para ser creída.
#   · No toca producción: se niega a correr si el ambiente no dice staging, demo, dev o local.
#   · No despliega, no compila, no hace commit, push ni pull.
#
# ÓRDENES
#
#   estado      lee y cuenta; no escribe nada
#   encender    pone la variable, recrea el backend, siembra, y dice hasta cuándo dura
#   refrescar   borra las estadías sembradas y las vuelve a crear con la hora de ahora
#   apagar      quita la variable, recrea el backend y borra TODO lo sembrado
#
# QUÉ SE BORRA AL APAGAR, exactamente y nada más:
#
#   delete from parking_sessions where plate_snapshot like 'DMO%';
#   delete from payments where provider = 'demo-seed';
#
# Ninguna de las dos condiciones puede alcanzar por accidente a una fila que no sea del sembrador:
# `demo-seed` no es un proveedor de pagos y ninguna placa de Costa Rica empieza por DMO.
# =================================================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="${LUPARX_COMPOSE_FILE:-infra/docker-compose.deploy.yml}"
ENV_FILE="${LUPARX_ENV_FILE:-infra/.env}"
VARIABLE="LUPARX_DEV_SEED_DASHBOARD_DEMO"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[2m%s\033[0m\n' "$*"; }
fallar() { rojo "✗ $*"; exit 1; }

[[ -f "$ENV_FILE" ]] || fallar "falta $ENV_FILE."
[[ -f "$COMPOSE_FILE" ]] || fallar "falta $COMPOSE_FILE."

# El valor de una variable del archivo de entorno, sin exportarlo ni evaluar nada de lo que diga:
# estos archivos llevan contraseñas, y `source` sobre ellos es cómo se filtran a un log.
leer_env() {
  local clave="$1"
  sed -n "s/^${clave}=//p" "$ENV_FILE" | tail -n 1
}

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

psql_en_postgres() {
  local usuario base
  usuario="$(leer_env POSTGRES_USER)"
  base="$(leer_env POSTGRES_DB)"
  [[ -n "$usuario" && -n "$base" ]] || fallar "no encuentro POSTGRES_USER o POSTGRES_DB en $ENV_FILE."
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$usuario" -d "$base" "$@"
}

consulta() { psql_en_postgres -tAq -c "$1"; }

exigir_no_produccion() {
  local ambiente
  ambiente="$(leer_env LUPARX_ENVIRONMENT)"
  ambiente="${ambiente:-staging}"
  case "$ambiente" in
    staging|demo|dev|local) gris "ambiente: $ambiente" ;;
    *) fallar "LUPARX_ENVIRONMENT=$ambiente. Esto es sólo para staging o demo. En producción no se
   siembran datos de demostración, y menos pagos." ;;
  esac
}

# Idempotente: se borra la línea si existía y se vuelve a escribir. Correrlo dos veces deja el
# archivo igual que correrlo una. Con respaldo fechado, porque este archivo lleva credenciales que
# alguien cargó a mano y perderlas cuesta una tarde.
fijar_variable() {
  local valor="$1" respaldo
  respaldo="${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$respaldo"
  gris "respaldo del archivo de entorno: $respaldo"
  grep -v "^${VARIABLE}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  if [[ -n "$valor" ]]; then
    printf '%s=%s\n' "$VARIABLE" "$valor" >> "${ENV_FILE}.tmp"
  fi
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  verde "${VARIABLE}=${valor:-(quitada)}"
}

# Recrear y no reiniciar: una variable de entorno se lee al CREAR el contenedor, y `restart` lo deja
# con las de antes. El sembrador, además, sólo corre al arrancar.
recrear_backend() {
  gris "recreando el backend…"
  compose up -d --force-recreate --no-deps backend
  gris "esperando a que quede sano…"
  local intentos=0
  until [[ "$(compose ps -q backend | xargs -r docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo desconocido)" == "healthy" ]]; do
    intentos=$((intentos + 1))
    if (( intentos > 60 )); then
      rojo "el backend no quedó sano en 5 minutos. Últimas líneas del log:"
      compose logs --tail 40 backend
      fallar "abortado: revisá el log de arriba."
    fi
    sleep 5
  done
  verde "backend sano"
}

borrar_estadias() {
  gris "borrando las estadías sembradas (placas DMO)…"
  consulta "DELETE FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';" >/dev/null
}

# -------------------------------------------------------------------------------------------------
# EL VEREDICTO. No «se sembró»: cuántas filas hay, en qué zonas, y —lo que de verdad hace falta
# saber antes de una demostración— hasta qué hora aguanta la ocupación.
# -------------------------------------------------------------------------------------------------
veredicto() {
  local pagos estadias vence_primera vence_ultima segundo_lock
  pagos="$(consulta "SELECT count(*) FROM payments WHERE provider = 'demo-seed';")"
  estadias="$(consulta "SELECT count(*) FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%' AND status = 'ACTIVE' AND expires_at > now();")"

  echo
  gris "─────────────────────────────────────────────────────────────────────"
  if [[ "${estadias:-0}" -eq 0 && "${pagos:-0}" -eq 0 ]]; then
    rojo "No hay nada sembrado. El Inicio va a salir en cero."
    segundo_lock="$(leer_env LUPARX_DEV_SEED_DEMO_DATA)"
    if [[ "${segundo_lock:-true}" == "false" ]]; then
      rojo "Causa probable: LUPARX_DEV_SEED_DEMO_DATA=false. El sembrador del tablero se apoya en"
      rojo "las zonas y bahías que crea el sembrador de siempre; sin ése, no tiene dónde sembrar."
    fi
    gris "─────────────────────────────────────────────────────────────────────"
    return
  fi

  verde "Pagos sembrados: ${pagos}   ·   Estadías corriendo ahora: ${estadias}"
  echo
  gris "Ocupación por zona (lo mismo que calcula la pantalla: activas / bahías en servicio):"
  psql_en_postgres -c "
    SELECT z.code AS zona,
           count(s.id) FILTER (WHERE s.status = 'ACTIVE' AND s.expires_at > now()) AS activas,
           count(DISTINCT e.id) AS bahias,
           round(100.0 * count(s.id) FILTER (WHERE s.status = 'ACTIVE' AND s.expires_at > now())
                 / NULLIF(count(DISTINCT e.id), 0)) AS pct
      FROM parking_zones z
      LEFT JOIN parking_spaces e ON e.zone_id = z.id AND e.status = 'AVAILABLE'
      LEFT JOIN parking_sessions s ON s.zone_id = z.id AND s.plate_snapshot LIKE 'DMO%'
     GROUP BY z.code
     HAVING count(s.id) > 0
     ORDER BY z.code;"

  if [[ "${estadias:-0}" -gt 0 ]]; then
    vence_primera="$(consulta "SELECT to_char(min(expires_at) AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%' AND status = 'ACTIVE' AND expires_at > now();")"
    vence_ultima="$(consulta "SELECT to_char(max(expires_at) AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%' AND status = 'ACTIVE' AND expires_at > now();")"
    echo
    verde "La ocupación EMPIEZA A BAJAR a las ${vence_primera} y queda en cero a las ${vence_ultima}."
    gris  "Si la demostración pasa de esa hora, corré:  ./scripts/staging-tablero-demo.sh refrescar"
  fi

  echo
  gris "«Multas emitidas» NO se siembra a propósito. Emití dos o tres desde el portal de"
  gris "fiscalización antes de empezar: tardan un minuto y además llenan «Actividad reciente»."
  gris "─────────────────────────────────────────────────────────────────────"
}

uso() {
  sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo "Uso: $0 {estado|encender|refrescar|apagar}"
}

orden="${1:-}"
case "$orden" in
  estado)
    gris "sólo lectura: esta orden no escribe nada."
    echo "${VARIABLE}=$(leer_env "$VARIABLE" || true)"
    echo "LUPARX_DEV_SEED_DEMO_DATA=$(leer_env LUPARX_DEV_SEED_DEMO_DATA || true)"
    veredicto
    ;;

  encender)
    exigir_no_produccion
    fijar_variable "true"
    recrear_backend
    # El sembrador corre al arrancar, pero el contenedor queda «sano» antes de que termine de
    # escribir. Un veredicto leído demasiado pronto dice «no hay nada» y manda a nadie a buscar un
    # problema que no existe.
    gris "dando unos segundos al sembrador…"
    sleep 8
    veredicto
    ;;

  refrescar)
    exigir_no_produccion
    # Las estadías se vuelven a crear con la hora de AHORA; los pagos no se tocan porque son siete
    # días de historia y volver a sembrarlos no cambiaría nada.
    borrar_estadias
    recrear_backend
    gris "dando unos segundos al sembrador…"
    sleep 8
    veredicto
    ;;

  apagar)
    exigir_no_produccion
    fijar_variable ""
    recrear_backend
    gris "borrando lo sembrado…"
    consulta "DELETE FROM parking_sessions WHERE plate_snapshot LIKE 'DMO%';" >/dev/null
    consulta "DELETE FROM payments WHERE provider = 'demo-seed';" >/dev/null
    verde "apagado y limpio. El Inicio vuelve a mostrar los datos reales del ambiente."
    veredicto
    ;;

  *)
    uso
    exit 1
    ;;
esac
