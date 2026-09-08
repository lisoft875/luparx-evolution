# LupaRX — Levantar el entorno local

Requisitos: **Java 21**, **Maven 3.9**, **Node 20+**, **Docker** y `openssl`.
Puertos: los de cada servicio **+10** (ver [`PORTS.md`](PORTS.md)).

## Camino corto

```bash
./scripts/dev-setup.sh
```

Verifica requisitos, levanta PostgreSQL y Mailpit, genera el par RSA para firmar tokens y las claves
de desarrollo en `infra/secrets/` (ignorado por git), instala el frontend y te dice qué correr.
Es idempotente: no regenera claves ni pisa `infra/.env` si ya existen.

Después, en dos terminales:

```bash
# API en http://localhost:8090  (Swagger UI en /swagger-ui.html)
source infra/secrets/dev-env.sh
cd backend
# -am reconstruye los modulos de los que depende `app` en el mismo reactor:
# sin eso, `-pl app` los toma de ~/.m2 y compila contra jars viejos.
mvn -pl app -am spring-boot:run -Dspring-boot.run.profiles=dev

# Apps
cd frontend
npm run dev:citizen     # http://localhost:5183
npm run dev:admin       # http://localhost:5184
npm run dev:inspector   # http://localhost:5185
npm run dev:platform    # http://localhost:5186
```

Flyway crea el esquema y las semillas de catálogo en el primer arranque.
Los correos de verificación y de reseteo se leen en Mailpit: <http://localhost:8035>.

## Sólo frontend, sin backend

Cada app corre contra un transporte simulado en memoria:

```bash
echo "VITE_USE_MOCKS=true" >> frontend/apps/citizen/.env
npm run dev:citizen --prefix frontend
```

Usuarios de prueba en `frontend/packages/api-client/src/mocks/data.ts`
(contraseña `Password123!`, código MFA `123456`). Sirve para trabajar la UI mientras el backend
avanza, y es lo que usan las vistas previas publicadas.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| La app arranca y muestra "VITE_API_BASE_URL no está configurado" | Falta el `.env` de esa app. Copiá su `.env.example`, o dejá el `.env.development` que ya trae la URL local. |
| `Port 5183 is already in use` | Las apps usan `strictPort`: liberá el puerto o cambialo en su `vite.config.ts`. Nunca lo cambies sólo en un lado: el backend valida el origen CORS. |
| El backend no arranca por falta de `MFA_TOTP_ENCRYPTION_KEY` | Los secretos no tienen default por diseño. `source infra/secrets/dev-env.sh` antes de `mvn`. |
| `InvalidKeySpecException` al firmar tokens | La llave privada quedó en PKCS#1. Convertila: `openssl pkcs8 -topk8 -nocrypt -in vieja.pem -out nueva.pem`. |
| `cannot find symbol` de clases de otro modulo | Se compiló `-pl app` sin `-am`, contra los jars viejos de `~/.m2`. Usá siempre `-pl app -am`, o `mvn -DskipTests install` desde `backend/` antes. |
| Flyway falla con "relation already exists" | Base sucia de un intento anterior: `cd infra && docker compose down -v && docker compose up -d`. |
| El login federado responde `FEDERATION_NOT_CONFIGURED` | Falta el `client id` del proveedor en `infra/.env`. El callback a registrar es `http://localhost:8090/api/v1/auth/{portal}/oauth2/{provider}/callback`. |
