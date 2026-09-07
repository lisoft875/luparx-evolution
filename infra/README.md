# LupaRX — Infraestructura local

> **Puertos:** este proyecto usa el puerto por defecto de cada servicio **+ 10** (API `8090`, Postgres `5442`, Vite `5183`–`5186`). Ver [`docs/PORTS.md`](../docs/PORTS.md).


Este directorio levanta las dependencias de infraestructura para desarrollar LupaRX localmente:
PostgreSQL 16, un servidor SMTP de pruebas (Mailpit) y, opcionalmente, Adminer.

## Requisitos

- Docker y Docker Compose v2 (`docker compose version`).
- Java 21 y Maven (para `backend/`, cuando exista).
- Node.js 22 y npm (para `frontend/`).

## 1. Configurar variables de entorno

```bash
cp infra/.env.example infra/.env
```

Editar `infra/.env` según necesidad. Ningún valor del `.env.example` es un secreto real — son
defaults de desarrollo. Para federación de identidad (Google/Microsoft/Facebook, ADR 0006),
completar `OAUTH_*_CLIENT_ID`/`OAUTH_*_CLIENT_SECRET` con credenciales de una app de prueba propia
si se va a probar ese flujo; si se dejan vacías, el login local sigue funcionando normalmente.

## 2. Generar el par de claves JWT de desarrollo (una sola vez)

```bash
mkdir -p infra/secrets
openssl genrsa -out infra/secrets/jwt-private-dev.pem 2048
openssl rsa -in infra/secrets/jwt-private-dev.pem -pubout -out infra/secrets/jwt-public-dev.pem
```

`infra/secrets/` está excluido de git (ver `.gitignore` en la raíz) — nunca commitear estas claves.

## 3. Levantar la infraestructura

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Esto levanta:

- **PostgreSQL 16** en `localhost:${POSTGRES_PORT:-5442}` (base `luparx`, ver credenciales en
  `infra/.env`), con volumen persistente `luparx_postgres_data` y healthcheck (`pg_isready`).
- **Mailpit** (SMTP de pruebas): el backend envía correos de verificación/reseteo a
  `localhost:${MAILPIT_SMTP_PORT:-1035}`; leerlos en la UI web `http://localhost:${MAILPIT_UI_PORT:-8035}`.
- **Adminer** (opcional, cliente web de base de datos): `docker compose --profile tools -f infra/docker-compose.yml up -d adminer`,
  disponible en `http://localhost:${ADMINER_PORT:-8091}` (servidor: `postgres`).

Verificar estado:

```bash
docker compose -f infra/docker-compose.yml ps
```

## 4. Backend (cuando exista `backend/`)

```bash
cd backend
mvn -pl app -am spring-boot:run
```

Flyway aplica las migraciones automáticamente al arrancar contra la base levantada en el paso 3.
El backend expone `/api/v1/**`, OpenAPI y `/actuator/health`.

## 5. Frontend

```bash
cd frontend
npm ci
npm run dev:citizen    # http://localhost:5183
npm run dev:admin      # http://localhost:5184
npm run dev:inspector  # http://localhost:5185
```

Cada app corre en su propio puerto y con su propio storage de tokens (ver `docs/SECURITY.md` §8);
los tres pueden correr simultáneamente.

## 6. Apagar / limpiar

```bash
docker compose -f infra/docker-compose.yml down        # detiene los contenedores, conserva el volumen
docker compose -f infra/docker-compose.yml down -v      # además borra los datos de PostgreSQL
```

## Notas

- Todos los defaults de este entorno (país, moneda, locale, zona horaria en
  `PLATFORM_DEFAULT_*`) son configuración de ejemplo, no supuestos del sistema — ver ADR 0008.
- No usar este `docker-compose.yml` ni sus valores en producción: no incluye réplicas, backups,
  TLS ni gestión de secretos — sólo desarrollo local.
