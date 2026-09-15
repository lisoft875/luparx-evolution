#!/usr/bin/env bash
# =================================================================================================
# Genera el par de llaves RSA con el que esta instancia firma los tokens.
#
# Se corre UNA vez, EN EL SERVIDOR, y la llave privada no sale de ahí: no se copia a la laptop, no
# se versiona, no viaja por chat. Si se pierde, se genera otra y todo el mundo vuelve a entrar; si
# se filtra, cualquiera puede fabricar un token de administrador de plataforma.
#
# Rotar: generá el par nuevo con otro JWT_KEY_ID, dejá el público viejo publicado en
# JWT_PREVIOUS_PUBLIC_KEYS ("<kid>:<ruta>") mientras expiran los tokens emitidos, y recién después
# borralo (docs/SECURITY.md §5).
# =================================================================================================
set -euo pipefail

# A la raíz del repositorio, como hace deploy.sh. Sin esto el destino por omisión es relativo a DONDE
# SE INVOQUE el script: corrido desde infra/ o desde scripts/, escribe las llaves en un
# `infra/secrets/deploy` anidado, informa "Listo" con una ruta que parece correcta, y deploy.sh
# después no las encuentra — un fallo que se lee como "faltan las llaves" justo después de haberlas
# generado.
cd "$(dirname "$0")/.."

DEST="${1:-infra/secrets/deploy}"
PRIVATE="$DEST/jwt-private.pem"
PUBLIC="$DEST/jwt-public.pem"

if [[ -f "$PRIVATE" ]]; then
  echo "Ya existe $PRIVATE — no se toca." >&2
  echo "Para rotar, movelo a un nombre con fecha y volvé a correr esto con un JWT_KEY_ID nuevo." >&2
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST"

# RSA 2048 en PKCS#8, que es lo que lee RsaJwtKeySource.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE"
openssl rsa -in "$PRIVATE" -pubout -out "$PUBLIC"

# El contenedor del backend corre como uid 10001 y monta este directorio en sólo lectura.
#
# Lo ideal es que la llave privada sea legible SÓLO por ese uid (chown 10001 + 0640). Si no se puede
# —falta sudo, o es un macOS donde el uid del contenedor no significa nada porque Docker Desktop
# traduce los permisos— se cae a 0644: legible por cualquier usuario de la máquina, que en una
# laptop de desarrollo es aceptable y en el servidor NO lo es.
chmod 644 "$PUBLIC"
if chown 10001:10001 "$PRIVATE" "$PUBLIC" 2>/dev/null; then
  chmod 640 "$PRIVATE"
  OWNERSHIP="uid 10001 (el del contenedor), permisos 0640"
else
  chmod 644 "$PRIVATE"
  OWNERSHIP="$(id -un), permisos 0644 — NO se pudo asignar el uid del contenedor"
  cat >&2 <<'WARN'

AVISO: la llave privada quedó legible por cualquier usuario de esta máquina.
  * En tu laptop: está bien, seguí.
  * En el SERVIDOR: volvé a correr esto con sudo, o arreglalo a mano:
      sudo chown 10001:10001 infra/secrets/deploy/jwt-private.pem
      sudo chmod 640 infra/secrets/deploy/jwt-private.pem
    Si no, cualquier cuenta de la instancia puede firmar tokens de administrador de plataforma.

WARN
fi

echo "Listo:"
echo "  privada: $(cd "$(dirname "$PRIVATE")" && pwd)/$(basename "$PRIVATE")  ($OWNERSHIP)"
echo "           no la copies a ningún lado"
echo "  pública: $PUBLIC"
echo
echo "Acordate de poner un JWT_KEY_ID en infra/.env, por ejemplo: deploy-$(date +%Y-%m)"
