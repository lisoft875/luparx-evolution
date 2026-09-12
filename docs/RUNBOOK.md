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
(contraseña `Password123!`). Sirve para trabajar la UI mientras el backend
avanza, y es lo que usan las vistas previas publicadas.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| La app arranca y muestra "VITE_API_BASE_URL no está configurado" | Falta el `.env` de esa app. Copiá su `.env.example`, o dejá el `.env.development` que ya trae la URL local. |
| `Port 5183 is already in use` | Las apps usan `strictPort`: liberá el puerto o cambialo en su `vite.config.ts`. Nunca lo cambies sólo en un lado: el backend valida el origen CORS. |
| `InvalidKeySpecException` al firmar tokens | La llave privada quedó en PKCS#1. Convertila: `openssl pkcs8 -topk8 -nocrypt -in vieja.pem -out nueva.pem`. |
| `cannot find symbol` de clases de otro modulo | Se compiló `-pl app` sin `-am`, contra los jars viejos de `~/.m2`. Usá siempre `-pl app -am`, o `mvn -DskipTests install` desde `backend/` antes. |
| Flyway falla con "relation already exists" | Base sucia de un intento anterior: `cd infra && docker compose down -v && docker compose up -d`. |

## PostGIS (desde la v0.40)

La geometría de las zonas necesita la extensión `postgis` (ADR 0024). En desarrollo la trae la
imagen del compose (`postgis/postgis:16-3.4-alpine`) y la migración `V38_0` la crea sola: el usuario
que el contenedor da de alta es superusuario, así que `CREATE EXTENSION` le pasa.

**Cambiar de `postgres:16-alpine` a la imagen de PostGIS es en sitio.** Es el mismo PostgreSQL 16,
así que el volumen de datos existente sirve igual y no hay que recrear la base ni volver a sembrar:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
cd backend && mvn -DskipTests install && mvn -pl app spring-boot:run   # aplica la V38_0
```

**En un Postgres administrado** (RDS, Azure Database, Cloud SQL) el usuario de la aplicación
normalmente **no** puede crear extensiones. Los tres proveedores traen PostGIS, pero hay que
habilitarlo una vez con una cuenta con privilegio:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Hecho eso, la migración encuentra la extensión y su `CREATE EXTENSION IF NOT EXISTS` queda en
no-op. Si se despliega sin ese paso, Flyway falla en la `V38_0` con un error de permisos y **no
aplica nada más**: es un arranque que se cae, no una base a medio migrar.

### Cómo saber si está

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';
SELECT PostGIS_Version();
```

### Volver atrás

Revertir el código de la v0.40 deja la columna `parking_zones.geom` en su sitio, sin nadie que la
lea, y eso es todo lo que hace falta para operar: una columna nullable que ninguna consulta toca no
cuesta nada. **No hay que hacer `DROP EXTENSION`** — y no conviene, porque borrar la extensión
obligaría a borrar antes la columna, que es una migración de contracción y no un rollback.

---

## Publicar en una instancia

Este documento cubre la laptop. Para poner LupaRX en un servidor —imágenes Docker, un dominio con
rutas, perfil `demo`, respaldos y vuelta atrás— ver [`DEPLOYMENT.md`](DEPLOYMENT.md) y la decisión que
lo sustenta en [ADR 0026](adr/0026-deployment-topology.md).

Lo único que conviene repetir acá, porque es la confusión cara: **el perfil `dev` nunca va en un
servidor.** Genera un par de llaves de firma efímero si no encuentra el de disco (cada reinicio
invalida todas las sesiones y nadie custodia la llave privada), trae la pimienta del hash de IP
escrita en el repositorio y registra cada consulta SQL. Para una instancia publicada con datos de
prueba existe `demo`, que siembra lo mismo sin ninguna de esas concesiones.
