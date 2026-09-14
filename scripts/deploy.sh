#!/usr/bin/env bash
# =================================================================================================
# Despliegue de LupaRX en la instancia. Se corre EN EL SERVIDOR, desde la raíz del repositorio:
#
#     ./scripts/deploy.sh              # trae main, reconstruye lo que cambió y levanta
#     ./scripts/deploy.sh --no-pull    # despliega lo que ya está en el árbol de trabajo
#     ./scripts/deploy.sh --rollback   # vuelve a las imágenes anteriores sin tocar git
#
# Qué hace, en orden, y por qué:
#
#   1. Verifica que estén las cosas sin las cuales el despliegue falla a la mitad (docker, compose,
#      infra/.env, las llaves). Fallar en el segundo 1 es infinitamente mejor que fallar en el 400,
#      con la aplicación abajo.
#   2. Respalda la base ANTES de tocar nada. Las migraciones de Flyway corren solas al arrancar el
#      backend y no todas son reversibles; el respaldo es lo que convierte un despliegue malo en un
#      susto en vez de una pérdida.
#   3. Construye las imágenes nuevas mientras las viejas siguen sirviendo.
#   4. Recambia los contenedores y espera a que el backend quede SANO. Si no queda, muestra el log
#      y termina con error, para que un despliegue roto no se reporte como exitoso.
#
# NO borra volúmenes. Nunca. Ni con --rollback.
# =================================================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

COMPOSE_FILE="infra/docker-compose.deploy.yml"
ENV_FILE="infra/.env"
BACKUP_DIR="infra/backups"
KEEP_BACKUPS=10

PULL=1
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)  PULL=0 ;;
    --rollback) ROLLBACK=1; PULL=0 ;;
    -h|--help)  sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. verificaciones -----------------------------------------------------------------------
say "Verificando el entorno"

command -v docker >/dev/null || fail "docker no está instalado."
docker compose version >/dev/null 2>&1 || fail "hace falta Docker Compose v2 (docker compose, sin guion)."
[[ -f "$ENV_FILE" ]] || fail "falta $ENV_FILE. Copialo de infra/.env.deploy.example y llenalo."
[[ -f "infra/secrets/deploy/jwt-private.pem" ]] || fail "faltan las llaves de firma. Corré scripts/gen-jwt-keys.sh."

# La llave privada firma los tokens de TODOS los portales, incluido el de plataforma. Si cualquier
# cuenta de la instancia puede leerla, cualquier cuenta puede fabricarse un administrador.
KEY_PERMS="$(stat -c '%a' infra/secrets/deploy/jwt-private.pem 2>/dev/null || stat -f '%Lp' infra/secrets/deploy/jwt-private.pem)"
case "$KEY_PERMS" in
  600|640|660) ;;
  *) fail "jwt-private.pem tiene permisos $KEY_PERMS: la puede leer cualquiera en esta máquina.
       sudo chown 10001:10001 infra/secrets/deploy/jwt-private.pem
       sudo chmod 640 infra/secrets/deploy/jwt-private.pem" ;;
esac

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${PUBLIC_BASE_URL:?falta PUBLIC_BASE_URL en $ENV_FILE}"
: "${POSTGRES_PASSWORD:?falta POSTGRES_PASSWORD en $ENV_FILE}"
: "${IP_HASH_PEPPER:?falta IP_HASH_PEPPER en $ENV_FILE}"
# `if` y no `[[ ... ]] && fail`: con `set -e`, esa forma devuelve 1 cuando la condición es falsa, y
# basta con que quede como última línea de un bloque para que el script muera sin explicar nada.
if [[ "${SPRING_PROFILES_ACTIVE:-}" == *dev* ]]; then
  fail "SPRING_PROFILES_ACTIVE contiene 'dev': ese perfil genera llaves efímeras y trae un pepper
       público, escrito en el repositorio. Usá 'demo' para datos de prueba, o dejalo vacío."
fi

# Los perfiles opcionales se declaran en el .env y no en la línea de comandos: si dependieran de que
# quien despliega se acuerde de escribir `--profile edge`, el primer despliegue que alguien haga sin
# esa bandera dejaría la instancia sin nada escuchando en 80/443 — y el script reportaría éxito,
# porque el backend y el web sí levantaron.
#
# COMPOSE_PROFILES es la variable que compose lee por su cuenta; se exporta arriba junto al resto
# del .env. Acá sólo se informa, para que la salida diga qué se está levantando de verdad.
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

if [[ -n "${COMPOSE_PROFILES:-}" ]]; then
  echo "Perfiles activos: $COMPOSE_PROFILES"
  if [[ "$COMPOSE_PROFILES" == *edge* ]]; then
    echo "  edge      → Caddy toma los puertos 80 y 443 y gestiona el certificado."
  fi
  if [[ "$COMPOSE_PROFILES" == *demo-mail* ]]; then
    echo "  demo-mail → Mailpit recibe los correos en ${MAILPIT_BIND_ADDRESS:-127.0.0.1}:${MAILPIT_UI_PORT:-8035}."
  fi
else
  echo "Sin perfiles opcionales: nada escucha en 80/443. Si esta instancia no tiene otro proxy"
  echo "delante, poné COMPOSE_PROFILES=edge en $ENV_FILE (ver docs/DEPLOYMENT.md §3)."
fi

# Memoria: cuatro builds de Vite y uno de Maven en una instancia chica terminan en OOM. Avisar antes
# es más útil que un contenedor muerto a media compilación.
TOTAL_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
SWAP_MB=$(awk '/SwapTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
if (( TOTAL_MB > 0 && TOTAL_MB + SWAP_MB < 3500 )); then
  echo "Aviso: ${TOTAL_MB} MB de RAM y ${SWAP_MB} MB de swap. La compilación puede quedarse sin memoria."
  echo "       docs/DEPLOYMENT.md explica cómo agregar swap (2 GB alcanzan)."
fi

# --- 2. rollback -------------------------------------------------------------------------------
if (( ROLLBACK )); then
  say "Volviendo a las imágenes anteriores"
  docker image inspect luparx/backend:previous >/dev/null 2>&1 || fail "no hay imagen luparx/backend:previous guardada."
  docker tag luparx/backend:previous "luparx/backend:${LUPARX_VERSION:-local}"
  docker tag luparx/web:previous     "luparx/web:${LUPARX_VERSION:-local}"
  "${COMPOSE[@]}" up -d --no-build backend web
  echo "Rollback aplicado. Ojo: si el despliegue anterior corrió migraciones, el esquema NO vuelve solo."
  exit 0
fi

# --- 3. código ---------------------------------------------------------------------------------
if (( PULL )); then
  say "Trayendo el código"
  git rev-parse --is-inside-work-tree >/dev/null || fail "esto no es un repositorio git."
  if [[ -n "$(git status --porcelain)" ]]; then
    fail "hay cambios sin commitear en el servidor. El servidor no es un lugar para editar: revertilos o commitealos."
  fi
  git fetch --prune origin
  git merge --ff-only "origin/$(git rev-parse --abbrev-ref HEAD)"
fi
COMMIT="$(git rev-parse --short HEAD)"
export LUPARX_VERSION="$COMMIT"
echo "Desplegando $COMMIT"

# --- 4. respaldo ---------------------------------------------------------------------------------
if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  say "Respaldando la base antes de migrar"
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  # Dentro del contenedor, porque la instancia no tiene por qué tener pg_dump instalado y la versión
  # del cliente debe coincidir con la del servidor.
  "${COMPOSE[@]}" exec -T postgres \
      pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
      > "$BACKUP_DIR/luparx-$STAMP-pre-$COMMIT.dump"
  echo "  $BACKUP_DIR/luparx-$STAMP-pre-$COMMIT.dump ($(du -h "$BACKUP_DIR/luparx-$STAMP-pre-$COMMIT.dump" | cut -f1))"
  # Se conservan los últimos; un disco lleno de respaldos también deja la instancia abajo.
  ls -1t "$BACKUP_DIR"/luparx-*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
else
  echo "postgres no está corriendo todavía: primer despliegue, no hay qué respaldar."
fi

# --- 5. construcción -------------------------------------------------------------------------------
say "Construyendo imágenes"
# Se guarda lo que está corriendo AHORA como :previous, para que --rollback tenga a dónde volver.
for svc in backend web; do
  current="$("${COMPOSE[@]}" images -q "$svc" 2>/dev/null | head -1)"
  [[ -n "$current" ]] && docker tag "$current" "luparx/$svc:previous" || true
done

"${COMPOSE[@]}" build backend
"${COMPOSE[@]}" build web

# --- 6. arranque -------------------------------------------------------------------------------
say "Levantando"
"${COMPOSE[@]}" up -d --remove-orphans

say "Esperando a que el backend quede sano"
DEADLINE=$(( SECONDS + 300 ))
while (( SECONDS < DEADLINE )); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q backend)" 2>/dev/null || echo starting)"
  case "$state" in
    healthy) echo "  sano"; break ;;
    unhealthy) "${COMPOSE[@]}" logs --tail 80 backend; fail "el backend quedó unhealthy." ;;
    *) printf '.'; sleep 5 ;;
  esac
done
(( SECONDS < DEADLINE )) || { "${COMPOSE[@]}" logs --tail 80 backend; fail "tiempo agotado esperando al backend."; }

say "Estado"
"${COMPOSE[@]}" ps
echo
echo "Publicado en ${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_HTTP_PORT:-8093} — el proxy de la instancia lo sirve como $PUBLIC_BASE_URL"
echo "Versión desplegada: $COMMIT"
