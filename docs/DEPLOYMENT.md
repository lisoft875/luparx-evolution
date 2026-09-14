# Desplegar LupaRX en una instancia

Guía para publicar la aplicación en una máquina con Docker — AWS Lightsail y equivalentes. La
topología y el porqué de cada decisión están en [ADR 0026](adr/0026-deployment-topology.md); esto es
el procedimiento.

Lo que queda publicado, todo bajo un mismo dominio:

| Ruta | Qué es |
| --- | --- |
| `/` | Portal del ciudadano |
| `/admin/` | Portal de municipalidad |
| `/inspector/` | Portal de fiscalización |
| `/platform/` | Back-office de plataforma |
| `/api/` | La API (`/api/v1/…`, CONTRACT.md §4) |

`/actuator`, `/v3/api-docs` y `/swagger-ui` **no** se enrutan: existen, pero sólo dentro de la red de
Docker.

---

## 0. Probar las imágenes en tu máquina, antes de tocar el servidor

El servidor compila lo que le mandes, así que el primer despliegue no es el lugar para descubrir que
una imagen no construye. Con Docker Desktop corriendo, desde la raíz del repositorio:

```bash
cp infra/.env.deploy.example infra/.env.local
# en infra/.env.local:
#   PUBLIC_BASE_URL=http://localhost:8093
#   COMPOSE_PROJECT_NAME=luparx-local
#   POSTGRES_PASSWORD / IP_HASH_PEPPER  → cualquier valor, es tu máquina
./scripts/gen-jwt-keys.sh
docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env.local up -d --build
```

Antes incluso de construir, la configuración de nginx se valida sola en dos segundos:

```bash
docker run --rm \
  -v "$PWD/infra/nginx/luparx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/infra/nginx/security-headers.inc:/etc/nginx/conf.d/security-headers.inc:ro" \
  nginx:1.27-alpine nginx -t
```

Abrí `http://localhost:8093` (ciudadano), `/admin/`, `/inspector/` y `/platform/`. Si los cuatro
portales cargan y el login contra `/api/` responde, las imágenes están bien y el despliegue en la
instancia es el mismo comando con otro `.env`.

Para bajarlo sin perder nada: `docker compose -f infra/docker-compose.deploy.yml --env-file
infra/.env.local down` (sin `-v`, que borraría la base).

## 1. Requisitos de la instancia

- Docker Engine 24+ con Compose v2 (`docker compose`, sin guion).
- **2 GB de RAM como mínimo**, y aun así conviene swap: el servidor compila el backend con Maven y
  los cuatro portales con Vite. Con 1 GB y sin swap, el build muere por falta de memoria a mitad de
  camino. Agregar 2 GB de swap:

  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

- Unos 10 GB de disco libre (imágenes, capas intermedias, base y respaldos).
- Acceso de lectura al repositorio. Si es privado, una **deploy key** de sólo lectura:

  ```bash
  ssh-keygen -t ed25519 -C "luparx-deploy" -f ~/.ssh/luparx_deploy -N ""
  cat ~/.ssh/luparx_deploy.pub   # pegar en GitHub → Settings → Deploy keys (sin acceso de escritura)
  printf 'Host github.com\n  IdentityFile ~/.ssh/luparx_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
  ```

## 2. Primera instalación (staging)

```bash
git clone git@github.com:lisoft875/luparx-evolution.git
cd luparx-evolution

# Configuración de la instancia
cp infra/.env.deploy.example infra/.env
chmod 600 infra/.env
${EDITOR:-nano} infra/.env         # COMPOSE_PROJECT_NAME, PUBLIC_BASE_URL, contraseñas,
                                   # JWT_KEY_ID, IP_HASH_PEPPER

# Secretos que se generan acá y no salen de acá
openssl rand -base64 32            # → POSTGRES_PASSWORD
openssl rand -hex 32               # → IP_HASH_PEPPER
./scripts/gen-jwt-keys.sh          # → infra/secrets/deploy/jwt-{private,public}.pem

# Despliegue
./scripts/deploy.sh --no-pull
```

El primer despliegue tarda: baja las dependencias de Maven y de npm desde cero. Los siguientes
reutilizan capas y son minutos.

Cuando termina, la aplicación escucha en `127.0.0.1:8093` (o el `WEB_HTTP_PORT` que hayas puesto).
Todavía no es accesible desde afuera: falta el paso 3.

## 3. Ponerla en internet

### Si la instancia YA tiene un proxy sirviendo otros sitios

Es el caso normal cuando la máquina comparte con otro proyecto. Agregá un `server` al nginx que ya
está, y **no** levantes el perfil `edge`:

```nginx
server {
    listen 443 ssl http2;
    server_name demo.tu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/demo.tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/demo.tu-dominio.com/privkey.pem;

    # Los documentos de un permiso llegan hasta 20 MB; con menos, el 413 lo da el proxy y el
    # ciudadano ve un error crudo en vez del mensaje del contrato.
    client_max_body_size 24m;

    location / {
        proxy_pass http://127.0.0.1:8093;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        # Sin esto, los enlaces de los correos salen en http:// y apuntando al contenedor.
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_read_timeout 120s;
    }
}
```

Con Traefik o Caddy, el equivalente: reenviar el host a `127.0.0.1:8093` pasando `X-Forwarded-Proto`.

### Si la instancia no tiene proxy

```bash
docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env --profile edge up -d
```

Caddy toma los puertos 80 y 443 y saca el certificado solo, con `PUBLIC_HOST` y `ACME_EMAIL` del
`.env`. En Lightsail hay que abrir esos puertos en el firewall de la consola, además del del sistema.

## 4. Despliegues siguientes

```bash
cd luparx-evolution && ./scripts/deploy.sh
```

Trae `main`, **respalda la base**, construye, recambia y espera a que el backend quede sano. Si no
queda, muestra el log y termina con error.

Volver atrás:

```bash
./scripts/deploy.sh --rollback
```

Recupera las imágenes anteriores. **El esquema no vuelve**: si el despliegue fallido corrió
migraciones, hay que restaurar el respaldo (§6).

## 5. La instancia de demostración

Con `SPRING_PROFILES_ACTIVE=demo` se siembran cinco municipalidades con sus zonas, tarifas, horarios,
espacios numerados, boletas y unos ciudadanos con billetera. El sembrado es idempotente: si los datos
ya están, no hace nada.

Las cuentas y sus contraseñas quedan **en el log del backend al arrancar** (`docker compose -f
infra/docker-compose.deploy.yml logs backend | grep -A20 "DEMO SEED DATA"`). Son públicas por
definición: están escritas en el repositorio.

Por eso, y sin excepción: **una instancia con perfil `demo` no puede contener datos reales de
ninguna municipalidad ni de ninguna persona.** El día que esta instalación deje de ser una
demostración, se vacía la base y se despliega sin ese perfil.

Lo que el perfil `demo` deliberadamente **no** enciende: la pasarela de pago simulada, el checkout de
mentira y el endpoint que recarga saldo a mano. Son de `dev` y ahí se quedan — en una máquina pública
«regalar saldo» no puede ser una ruta HTTP. Los ciudadanos sembrados ya vienen con saldo, que es lo
que hace demostrable el estacionamiento. Si hiciera falta enseñar el pago con tarjeta, es agregar
`"demo"` al `@Profile` de `SimulatedPaymentGateway`, `DevSimulatedCheckoutController` y el bloque de
`PaymentEdgeSecurityConfig`, sabiendo lo que se abre.

Los correos de verificación van a Mailpit si levantás su perfil:

```bash
docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env --profile demo-mail up -d
ssh -L 8035:127.0.0.1:8035 usuario@instancia    # y abrir http://localhost:8035
```

Con correo real, poné las `SMTP_*` del proveedor y no levantes ese perfil.

## 6. Operación

```bash
C="docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env"

$C ps                      # estado y salud
$C logs -f backend         # log del backend
$C exec postgres psql -U luparx -d luparx     # consola SQL
```

**Respaldo manual** (el despliegue ya hace uno antes de cada migración, en `infra/backups/`):

```bash
$C exec -T postgres pg_dump -U luparx -d luparx --format=custom > respaldo.dump
```

**Restaurar**:

```bash
$C stop backend
cat respaldo.dump | $C exec -T postgres pg_restore -U luparx -d luparx --clean --if-exists
$C start backend
```

Los respaldos viven en el disco de la misma instancia, que no es un respaldo: si se pierde la
máquina, se pierden. Copialos afuera (S3, otra máquina) antes de que esta instalación importe.

**A la base desde tu computadora**, sin exponer el puerto:

```bash
ssh -L 5442:127.0.0.1:5432 usuario@instancia
```

## 7. Rotar las llaves de firma

```bash
mv infra/secrets/deploy/jwt-private.pem infra/secrets/deploy/jwt-private-$(date +%Y%m).pem
./scripts/gen-jwt-keys.sh
# en infra/.env: JWT_KEY_ID nuevo, y la pública vieja en
#   JWT_PREVIOUS_PUBLIC_KEYS=<kid-viejo>:/run/secrets/jwt/jwt-public-AAAAMM.pem
./scripts/deploy.sh --no-pull
```

La pública vieja se queda publicada mientras expiren los tokens ya emitidos; recién después se borra
(docs/SECURITY.md §5).

## 8. Staging y producción en la misma instancia

Todo lo que distingue un ambiente de otro está en `infra/.env`, no en el compose ni en las imágenes:

| Variable | staging | producción |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `luparx-staging` | `luparx-production` |
| `LUPARX_ENVIRONMENT` | `staging` | `production` |
| `SPRING_PROFILES_ACTIVE` | `demo` | *(vacío)* |
| `WEB_HTTP_PORT` | `8093` | `8094` |
| `PUBLIC_BASE_URL` | `https://staging.…` | `https://…` |

El nombre del proyecto prefija contenedores, redes y volúmenes, así que los dos ambientes conviven
sin verse: cada uno tiene su base, su volumen de evidencia y su red. Lo que **no** se comparte nunca
es el par de llaves de firma — se genera uno por ambiente, o un token de staging valdría en producción.

Dos cosas que hay que acordarse de cambiar al montar producción: quitar de `infra/nginx/luparx.conf`
la cabecera `X-Robots-Tag: noindex` (está puesta para que staging no aparezca en buscadores), y dejar
`SPRING_PROFILES_ACTIVE` vacío para que no se siembren las municipalidades de prueba.

## 9. Cuando esto deje de ser una demostración

Antes de que una municipalidad real cargue datos, en este orden:

1. **Un subdominio por portal** en vez de rutas — el origen compartido es lo único que hoy se acepta
   por conveniencia (ADR 0026, alternativa 1).
2. **Imágenes construidas en CI** y publicadas en un registro: hoy «lo que corre» es «lo que compiló
   el servidor», y una versión vieja sólo se recupera recompilando.
3. **Evidencia fuera del disco del contenedor** (almacenamiento de objetos): con dos instancias del
   backend detrás de un balanceador, un volumen local deja de servir.
4. **Respaldos fuera de la instancia**, con una restauración probada de verdad.
5. **Restringir por IP el portal de plataforma**: administra todas las municipalidades y no tiene
   segundo factor (riesgo aceptado por escrito, CONTRACT.md v0.20).
