# LupaRX

> **Levantar en local:** `./scripts/dev-setup.sh` y luego lo que imprime — detalle en [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
>
> **Puertos:** este proyecto usa el puerto por defecto de cada servicio **+ 10** (API `8090`, Postgres `5442`, Vite `5183`–`5186`). Ver [`docs/PORTS.md`](docs/PORTS.md).


Plataforma municipal multi-tenant de **fiscalización vial / parquímetros**, diseñada desde el
inicio para expansión internacional (multi-país, multi-moneda, multi-idioma). Tres portales con
login separado — ciudadano, administración municipal y fiscalización — sobre una identidad global
única por persona y acceso a cada municipalidad modelado como membresía.

El contrato normativo de dominio, datos y API vive en [`docs/CONTRACT.md`](docs/CONTRACT.md); este
README es la puerta de entrada, no la fuente de verdad.

## Arquitectura en 10 líneas

- Monolito modular: Java 21 + Spring Boot 3.5 (Maven multi-módulo) sobre PostgreSQL 16 + Flyway.
- Módulos con fronteras explícitas y sin ciclos: `platform-core`, `module-geo`, `module-identity`,
  `module-tenancy`, `module-parking` (stub), orquestados por `app`.
- Identidad global (`users`) + membresías por municipalidad (`tenant_memberships`); ningún dato
  operativo o financiero existe sin `tenant_id`, aplicado en cada capa (repositorio, servicio,
  API, jobs, caché, exportes, logs).
- Autenticación local Argon2id + JWT RS256 por portal (audiencias distintas, un token de un
  portal no sirve en otro) + refresh opaco con rotación, más federación (Google, Microsoft Entra
  ID, Facebook) y MFA TOTP obligatorio en admin/inspector.
- Internacionalización de fondo: catálogos ISO 3166/4217, BCP 47, IANA y un árbol genérico de
  divisiones administrativas de N niveles — Costa Rica es sólo el país configurado por defecto,
  nunca un supuesto de código.
- Dinero en unidades menores enteras + código de moneda, nunca punto flotante.
- API REST versionada (`/api/v1`) con errores RFC 9457 Problem Details, idempotencia en escrituras
  sensibles y outbox transaccional para eventos que cruzan módulos.
- Frontend: React + Vite + Capacitor en un monorepo npm workspaces, tres apps independientes
  (`citizen`, `admin`, `inspector`) con storage de tokens aislado por app.
- Observabilidad: logs estructurados con `traceId` + `tenantId`, métricas Micrometer, health
  checks por grupo (`liveness`/`readiness`).
- Detalle completo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y las decisiones registradas
  en [`docs/adr/`](docs/adr/README.md).

## Estructura del monorepo

```
luparx-evolution/
  backend/                      Maven multi-módulo, Java 21, Spring Boot 3.5
    platform-core/              kernel compartido: ids, errores RFC 9457, dinero, tenant context, auditoría
    module-geo/                 países, divisiones administrativas, documentos, teléfonos
    module-identity/             usuarios, credenciales, MFA, federación, tokens
    module-tenancy/             municipalidades, membresías, roles/permisos
    module-parking/             stub del dominio (frontera declarada)
    app/                        arranque Spring Boot, seguridad, controllers, Flyway, OpenAPI
  frontend/                     npm workspaces
    packages/config/            tsconfig/eslint compartidos
    packages/i18n/               claves + locales es-CR, en-US
    packages/api-client/        cliente tipado del contrato
    packages/auth/              almacenamiento de tokens por portal, refresh, guardas
    packages/ui/                design system mínimo (tokens, campos, layout)
    apps/citizen/               React + Vite + Capacitor
    apps/inspector/             React + Vite + Capacitor
    apps/admin/                 React + Vite (web)
  docs/                         arquitectura, ADRs, seguridad, modelo de datos, roadmap
  infra/                        docker-compose, .env de ejemplo
  .github/workflows/            CI (backend + frontend)
```

> Estado actual: `frontend/` tiene el scaffold de workspaces y apps en curso; `backend/` está en
> desarrollo por otro equipo/agente en paralelo. Este README asume la estructura final descrita
> en `docs/CONTRACT.md` §6.

## Cómo levantar el entorno local

Ver [`infra/README.md`](infra/README.md) para el detalle completo (PostgreSQL 16, Mailpit, Adminer
opcional). Resumen:

```bash
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# Backend (cuando exista backend/)
cd backend && mvn -pl app -am spring-boot:run

# Frontend
cd frontend && npm ci
npm run dev:citizen    # http://localhost:5183
npm run dev:admin      # http://localhost:5184
npm run dev:inspector  # http://localhost:5185
```

## Los tres portales

| Portal | App | Audiencia JWT | Registro |
|---|---|---|---|
| Ciudadano | `frontend/apps/citizen` (React + Capacitor) | `luparx:portal:citizen` | Auto-registro público |
| Administración municipal | `frontend/apps/admin` (web) | `luparx:portal:admin` | Auto-registro + membresía aprobada |
| Fiscalización | `frontend/apps/inspector` (React + Capacitor) | `luparx:portal:inspector` | Auto-registro + membresía aprobada |

Cada portal tiene su propio login, su propio token (un token de un portal no sirve en otro — ver
ADR 0004) y su propio storage de sesión en el frontend. Una misma persona puede tener membresías
en varias municipalidades y cambiar de municipalidad activa desde la sesión ya iniciada
(`POST /api/v1/{portal}/session/tenant`).

## Documentación

- [`docs/CONTRACT.md`](docs/CONTRACT.md) — contrato normativo de dominio, datos y API (fuente de
  verdad; sólo lectura para el resto de la documentación).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — contextos delimitados, diagramas C4/módulos,
  flujo de autenticación, aislamiento multi-tenant, observabilidad, despliegue.
- [`docs/adr/README.md`](docs/adr/README.md) — índice de Architecture Decision Records (0001–0013).
- [`docs/SECURITY.md`](docs/SECURITY.md) — modelo de amenazas, controles OWASP ASVS 5 / Top 10,
  checklist previo a producción.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — diagrama entidad-relación e invariantes de base de
  datos.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — fases v0.1–v0.5, riesgos y decisiones pendientes.

## Estado actual

**v0.1 (scaffold)**: contrato de dominio congelado, documentación de arquitectura/ADRs/seguridad
completa, infraestructura local (`infra/`) y CI (`.github/workflows/ci.yml`) definidos. Backend y
frontend en construcción según `docs/CONTRACT.md`.
