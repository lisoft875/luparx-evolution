# LupaRX — Convención de puertos

**Regla: puerto por defecto del servicio + 10.** Evita chocar con instancias que ya corran en la
máquina (otro Postgres, otro Spring Boot, otro Vite) y hace obvio, al ver un puerto, si se está
hablando con LupaRX o con otra cosa.

| Servicio | Puerto por defecto | **LupaRX (default + 10)** | Dónde se configura |
|---|---|---|---|
| API backend (Spring Boot) | 8080 | **8090** | `SERVER_PORT` · `backend/app/src/main/resources/application.yml` |
| PostgreSQL | 5432 | **5442** | `POSTGRES_PORT` · `infra/docker-compose.yml` (dentro del contenedor sigue siendo 5432) |
| Mailpit SMTP | 1025 | **1035** | `MAILPIT_SMTP_PORT` / `SMTP_PORT` |
| Mailpit UI web | 8025 | **8035** | `MAILPIT_UI_PORT` |
| Adminer (perfil `tools`) | 8081 | **8091** | `ADMINER_PORT` |
| Vite — app `citizen` | 5173 | **5183** | `frontend/apps/citizen/vite.config.ts` |
| Vite — app `admin` | 5174 | **5184** | `frontend/apps/admin/vite.config.ts` |
| Vite — app `inspector` | 5175 | **5185** | `frontend/apps/inspector/vite.config.ts` |
| Vite — app `platform` | 5176 | **5186** | `frontend/apps/platform/vite.config.ts` |

URLs de desarrollo:

- API: `http://localhost:8090` · OpenAPI `http://localhost:8090/v3/api-docs` · JWKS `http://localhost:8090/.well-known/jwks.json`
- Correos capturados: `http://localhost:8035`
- Adminer: `http://localhost:8091` (servidor `postgres`)
- Apps: ciudadano `:5183` · municipal `:5184` · fiscalización `:5185` · plataforma `:5186`

Notas:

1. Los puertos **dentro** de los contenedores no cambian (Postgres escucha 5432, Mailpit 1025/8025,
   Adminer 8080): sólo se remapea la publicación al host. Así las imágenes siguen siendo estándar.
2. Cada app Vite usa `strictPort: true`: si el puerto está ocupado, falla en vez de saltar a otro
   silenciosamente y dejar el CORS del backend apuntando al puerto equivocado.
3. Los orígenes CORS y las `app.base-url` por portal del backend ya apuntan a estos puertos
   (`CORS_ALLOWED_ORIGIN_*`, `APP_BASE_URL_*` en `infra/.env.example`).
4. Si algún puerto también está ocupado, cámbialo por variable de entorno; no lo edites en el código.
