#!/usr/bin/env bash
# =================================================================================================
# Las zonas de demostración de San José en el mapa del ciudadano.
#
# QUÉ PROBLEMA RESUELVE
#
# El mapa del ciudadano dibuja los perímetros de zona que el servidor publica, y el servidor
# publica SÓLO las geometrías verificadas. En staging no hay ninguna verificada —los polígonos que
# existen son los de demostración que siembra la migración V41_0 sobre San José—, así que el mapa
# abre sin nada que dibujar. No es un defecto del mapa: es qué se publica.
#
# Esto NO verifica geometrías ni toca datos municipales. Abre la publicación en staging para que
# incluya también las no verificadas, que el portal pinta en violeta, con borde punteado y la
# palabra «DEMO · no oficial» encima del nombre de la zona.
#
# ÓRDENES
#
#   ./scripts/staging-zonas-demo.sh preflight    sólo lee: dice qué hay y qué falta
#   ./scripts/staging-zonas-demo.sh sembrar      pone la geometría DEMO que falte (idempotente)
#   ./scripts/staging-zonas-demo.sh activar      publica también UNVERIFIED y reinicia el backend
#   ./scripts/staging-zonas-demo.sh postcheck    comprueba lo que quedó
#   ./scripts/staging-zonas-demo.sh revertir     vuelve a publicar sólo VERIFIED
#
# ORDEN DE EJECUCIÓN RECOMENDADO
#
#   1. preflight      → mirar la salida antes de decidir nada
#   2. sembrar        → SÓLO si el preflight muestra San José sin geometría
#   3. activar        → cambia la variable y recrea el backend
#   4. postcheck      → confirma que no se rompió el aislamiento ni se verificó nada
#   5. abrir la aplicación y mirar el mapa
#
# Y si algo sale mal: `revertir` deja la publicación como estaba. `sembrar` no se deshace solo
# porque escribe geometría donde no había; el respaldo que toma `deploy.sh` antes de cada
# despliegue es el camino de vuelta, y el postcheck comprueba que no hizo falta.
#
# QUÉ NO HACE
#
#   · No marca nada como VERIFIED. Verificar es un acto de la municipalidad.
#   · No borra ni vacía nada: ningún DELETE, TRUNCATE ni DROP en ninguna de sus consultas.
#   · No toca otra municipalidad que no sea san-jose.
#   · No despliega. No hace commit, push ni pull.
#   · No toca producción: se niega a correr si el ambiente no dice staging o demo.
# =================================================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="${LUPARX_COMPOSE_FILE:-infra/docker-compose.deploy.yml}"
ENV_FILE="${LUPARX_ENV_FILE:-infra/.env}"
SQL_DIR="infra/sql"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[2m%s\033[0m\n' "$*"; }
fallar() { rojo "✗ $*"; exit 1; }

[[ -f "$ENV_FILE" ]] || fallar "falta $ENV_FILE. Copialo de infra/.env.deploy.example y llenalo."
[[ -f "$COMPOSE_FILE" ]] || fallar "falta $COMPOSE_FILE."

# El valor de una variable del archivo de entorno, sin exportarlo ni evaluar nada de lo que diga:
# estos archivos llevan contraseñas, y `source` sobre ellos es cómo se filtran a un log.
leer_env() {
  local clave="$1"
  sed -n "s/^${clave}=//p" "$ENV_FILE" | tail -n 1
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

psql_en_postgres() {
  local usuario base
  usuario="$(leer_env POSTGRES_USER)"
  base="$(leer_env POSTGRES_DB)"
  [[ -n "$usuario" && -n "$base" ]] || fallar "no encuentro POSTGRES_USER o POSTGRES_DB en $ENV_FILE."
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$usuario" -d "$base" "$@"
}

# Producción no se toca. El ambiente lo declara el propio despliegue en LUPARX_ENVIRONMENT, y si
# dice cualquier otra cosa este script no sigue: es el único freno que no depende de acordarse.
exigir_no_produccion() {
  local ambiente
  ambiente="$(leer_env LUPARX_ENVIRONMENT)"
  ambiente="${ambiente:-staging}"
  case "$ambiente" in
    staging|demo|dev|local) gris "ambiente: $ambiente" ;;
    *) fallar "LUPARX_ENVIRONMENT=$ambiente. Esto es sólo para staging o demo; en producción las
   geometrías de demostración no se publican. Si de verdad querés hacerlo, cambialo a mano." ;;
  esac
}

# El valor de la variable en el archivo de entorno, escrito de forma idempotente: se borra la línea
# si existía y se vuelve a escribir. Correrlo dos veces deja el archivo igual que correrlo una.
fijar_variable() {
  local valor="$1"
  local respaldo="${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$respaldo"
  gris "respaldo del archivo de entorno: $respaldo"
  grep -v '^GEO_CITIZEN_GEOMETRY_STATUSES=' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  printf 'GEO_CITIZEN_GEOMETRY_STATUSES=%s\n' "$valor" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  verde "GEO_CITIZEN_GEOMETRY_STATUSES=$valor"
}

# Recrear el contenedor y no reiniciarlo: una variable de entorno se lee al crear el contenedor, y
# `restart` lo deja con las de antes. Es el tropiezo que ya documentan los comentarios del compose.
recrear_backend() {
  gris "recreando el backend para que tome la variable…"
  compose up -d --force-recreate --no-deps backend
  gris "esperando a que el backend quede sano…"
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

orden="${1:-}"
case "$orden" in
  preflight)
    gris "sólo lectura: esto no escribe nada."
    psql_en_postgres -f - < "$SQL_DIR/zonas-demo-preflight.sql"
    echo
    gris "variable actual en $ENV_FILE: $(leer_env GEO_CITIZEN_GEOMETRY_STATUSES || echo '(sin definir → el backend usa VERIFIED)')"
    gris "variable dentro del contenedor:"
    compose exec -T backend sh -lc 'echo "  ${GEO_CITIZEN_GEOMETRY_STATUSES:-(sin definir)}"' 2>/dev/null \
      || gris "  (el backend no está levantado)"
    ;;

  sembrar)
    exigir_no_produccion
    gris "siembra idempotente, sólo donde geom IS NULL y sólo en san-jose."
    psql_en_postgres -f - < "$SQL_DIR/zonas-demo-sembrar-faltantes.sql"
    verde "listo. Corré el postcheck."
    ;;

  activar)
    exigir_no_produccion
    fijar_variable "VERIFIED,UNVERIFIED"
    recrear_backend
    gris "comprobando qué quedó adentro del contenedor:"
    compose exec -T backend sh -lc 'echo "  GEO_CITIZEN_GEOMETRY_STATUSES=${GEO_CITIZEN_GEOMETRY_STATUSES:-(sin definir)}"'
    echo
    psql_en_postgres -f - < "$SQL_DIR/zonas-demo-postcheck.sql"
    verde "activado. Abrí la aplicación y mirá el mapa."
    ;;

  postcheck)
    psql_en_postgres -f - < "$SQL_DIR/zonas-demo-postcheck.sql"
    ;;

  revertir)
    fijar_variable "VERIFIED"
    recrear_backend
    verde "revertido: el ciudadano vuelve a ver sólo geometrías verificadas."
    ;;

  *)
    sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
