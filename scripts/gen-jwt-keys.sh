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
chmod 640 "$PRIVATE"
chmod 644 "$PUBLIC"
chown -R 10001:10001 "$DEST" 2>/dev/null || \
  echo "Aviso: no se pudo cambiar el dueño a 10001 (corré con sudo si el backend no puede leer la llave)." >&2

echo "Listo:"
echo "  privada: $PRIVATE  (no la copies a ningún lado)"
echo "  pública: $PUBLIC"
echo
echo "Acordate de poner un JWT_KEY_ID en infra/.env, por ejemplo: deploy-$(date +%Y-%m)"
