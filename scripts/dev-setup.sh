#!/usr/bin/env bash
# Prepara el entorno de desarrollo local de LupaRX.
# Idempotente: se puede correr las veces que haga falta.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

echo "==> Requisitos"
command -v java >/dev/null || die "Falta Java 21 (https://adoptium.net)"
JAVA_MAJOR="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
[ "${JAVA_MAJOR:-0}" -ge 21 ] || die "Java $JAVA_MAJOR encontrado; se requiere 21 o superior"
ok "Java $JAVA_MAJOR"
command -v mvn  >/dev/null || die "Falta Maven (brew install maven)"
ok "Maven $(mvn -v 2>/dev/null | head -1 | cut -d' ' -f3)"
command -v node >/dev/null || die "Falta Node 20+ (brew install node)"
ok "Node $(node -v)"
command -v docker >/dev/null || die "Falta Docker (Docker Desktop / colima)"
docker info >/dev/null 2>&1 || die "Docker está instalado pero el daemon no responde; abrí Docker Desktop"
ok "Docker en marcha"
command -v openssl >/dev/null || die "Falta openssl"

echo "==> Infraestructura (PostgreSQL 5442, Mailpit 1035/8035)"
[ -f infra/.env ] || { cp infra/.env.example infra/.env; ok "infra/.env creado desde el ejemplo"; }
( cd infra && docker compose up -d )
printf '  esperando a PostgreSQL'
for _ in $(seq 1 60); do
  if ( cd infra && docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-luparx}" >/dev/null 2>&1 ); then
    printf '\n'; ok "PostgreSQL listo en localhost:5442"; break
  fi
  printf '.'; sleep 1
done

echo "==> Secretos de desarrollo (no se versionan)"
mkdir -p infra/secrets
if [ ! -f infra/secrets/jwt-private-dev.pem ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out infra/secrets/jwt-private-dev.pem 2>/dev/null
  openssl rsa -in infra/secrets/jwt-private-dev.pem -pubout -out infra/secrets/jwt-public-dev.pem 2>/dev/null
  chmod 600 infra/secrets/jwt-private-dev.pem
  ok "Par RSA para firmar tokens (PKCS#8)"
else
  ok "Par RSA ya existente"
fi
if [ ! -f infra/secrets/dev-env.sh ]; then
  cat > infra/secrets/dev-env.sh <<EOF
# Generado por scripts/dev-setup.sh — sólo para desarrollo local. No versionar.
# Credenciales de la base: unica fuente de verdad infra/.env (el mismo archivo que lee docker compose).
set -a
. "$ROOT/infra/.env"
set +a
export JWT_PRIVATE_KEY_PATH="$ROOT/infra/secrets/jwt-private-dev.pem"
export JWT_PUBLIC_KEY_PATH="$ROOT/infra/secrets/jwt-public-dev.pem"
export JWT_KEY_ID="dev-$(date +%Y%m%d)"
export JWT_ISSUER="http://localhost:8090"
export IP_HASH_PEPPER="$(openssl rand -hex 16)"
EOF
  chmod 600 infra/secrets/dev-env.sh
  ok "infra/secrets/dev-env.sh con las claves de desarrollo"
else
  ok "infra/secrets/dev-env.sh ya existente"
fi

echo "==> Frontend"
( cd frontend && npm install --no-audit --no-fund )
ok "Dependencias del frontend instaladas"

cat <<'EOF'

==> Todo listo. Abrí dos terminales:

  # 1) Backend (API en http://localhost:8090, Swagger en /swagger-ui.html)
  source infra/secrets/dev-env.sh
  cd backend
  mvn -pl app -am spring-boot:run -Dspring-boot.run.profiles=dev

  # 2) Frontend (elegí la app)
  cd frontend
  npm run dev:citizen     # http://localhost:5183
  npm run dev:admin       # http://localhost:5184
  npm run dev:inspector   # http://localhost:5185
  npm run dev:platform    # http://localhost:5186

Sin backend: poné VITE_USE_MOCKS=true en el .env de la app para correr contra datos simulados
(usuarios de prueba en frontend/packages/api-client/src/mocks/data.ts).
Correo capturado en http://localhost:8035 · Adminer opcional: docker compose --profile tools up -d

EOF
