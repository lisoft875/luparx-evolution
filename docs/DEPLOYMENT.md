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
./scripts/gen-jwt-keys.sh
```

El archivo de ejemplo trae **vacíos** los valores que no pueden tener uno por omisión — es
deliberado: una contraseña de ejemplo que funciona es una contraseña que sobrevive hasta producción.
Para la prueba local hay que llenar cinco, y compose se niega a arrancar (no arranca a medias) si
falta alguno:

```bash
COMPOSE_PROJECT_NAME=luparx-local
LUPARX_ENVIRONMENT=local
PUBLIC_BASE_URL=http://localhost:8093
POSTGRES_PASSWORD=$(openssl rand -base64 24)
IP_HASH_PEPPER=$(openssl rand -hex 32)
```

Antes incluso de construir, la configuración de nginx se valida sola en dos segundos:

```bash
docker run --rm --entrypoint nginx \
  -v "$PWD/infra/nginx/luparx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/infra/nginx/security-headers.inc:/etc/nginx/conf.d/security-headers.inc:ro" \
  nginx:1.27-alpine -t
```

`--entrypoint nginx` es necesario: la imagen oficial trae un entrypoint que, antes de pasarle el
control a nginx, intenta reescribir `default.conf` para escuchar en IPv6 — y el archivo está montado
en sólo lectura. Sin saltárselo, lo que se ve es un aviso confuso sobre un *read-only file system*.

Y el Caddyfile, si vas a usar el perfil `edge`:

```bash
docker run --rm -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e PUBLIC_HOST=localhost -e ACME_EMAIL=nadie@localhost -e CADDY_TLS="tls internal" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Vale la pena: un Caddyfile inválido no impide que el despliegue termine — el backend y el web
levantan igual—, sólo deja a Caddy reiniciándose en bucle y **nada escuchando en 80/443**. Desde
afuera se ve como un sitio que no responde, sin ningún error que lo explique salvo en su log.

Y recién entonces, construir y levantar:

```bash
docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env.local up -d --build
```

Abrí `http://localhost:8093` (ciudadano), `/admin/`, `/inspector/` y `/platform/`. Si los cuatro
portales cargan y el login contra `/api/` responde, las imágenes están bien y el despliegue en la
instancia es el mismo comando con otro `.env`.

Para bajarlo sin perder nada: `docker compose -f infra/docker-compose.deploy.yml --env-file
infra/.env.local down` (sin `-v`, que borraría la base).

## 1. Requisitos de la instancia

### Crear la instancia en Lightsail

- **Plan de 2 GB ($12/mes) como mínimo**, y **dedicada a LupaRX**. Compartir máquina con otro sitio
  en ese plan no funciona: sólo LupaRX en reposo usa 700 MB–1 GB entre la JVM y PostgreSQL, y el pico
  no es ese sino el build —Maven más cuatro compilaciones de Vite—, que en una máquina ajustada hace
  que el OOM killer elija una víctima por tamaño y no por importancia. El vecino puede ser el muerto.
- **Blueprint: Ubuntu 24.04 LTS**, "OS Only" (no las imágenes con aplicaciones preinstaladas).
- **Arquitectura x86_64**, no ARM: la imagen `postgis/postgis:16-3.4` publica amd64 y sus etiquetas
  arm64 van por detrás. En ARM hay que fijar otra etiqueta en `POSTGRES_IMAGE` **antes** del primer
  arranque, nunca cuando la base ya tiene datos.
- **IP estática** asignada desde la consola (en Lightsail es gratis mientras esté adjunta a una
  instancia). Sin ella, un reinicio cambia la IP y el DNS deja de resolver.
- **Puertos 80 y 443 abiertos** en Networking. Es un cortafuegos distinto del `ufw` del sistema; que
  el sistema los tenga abiertos no basta.
- **Snapshot automático** activado. Es la única copia que sobrevive a perder la instancia entera.

Docker no viene en el blueprint:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && exec su -l "$USER"   # para no usar sudo en cada comando
```

### Lo que el despliegue necesita

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

Quién termina el TLS se decide con `COMPOSE_PROFILES` en `infra/.env`, no con banderas en la línea de
comandos — si dependiera de acordarse de escribir `--profile edge`, el primer despliegue que alguien
hiciera sin esa bandera dejaría la instancia sin nada escuchando en 80/443, y el script reportaría
éxito porque el backend sí levantó.

### Instancia dedicada (no hay otro proxy): Caddy

```bash
# en infra/.env
COMPOSE_PROFILES=edge,demo-mail
PUBLIC_HOST=staging.luparx.com
ACME_EMAIL=vos@luparx.com
```

Caddy toma los puertos 80 y 443, saca el certificado y lo renueva solo.

**El DNS tiene que estar listo ANTES del primer arranque.** Let's Encrypt verifica conectándose al
dominio: si el registro A todavía no apunta a esta instancia, el intento falla, y varios fallos
seguidos consumen la cuota del dominio por una hora. El orden correcto es: registro A → esperar a que
resuelva (`dig +short staging.luparx.com` debe devolver la IP de la instancia) → recién entonces
desplegar.

En Lightsail hay **dos** cortafuegos: el del sistema operativo y el de la consola de AWS. Abrir 80 y
443 en el panel de Networking de la instancia es un paso aparte que se olvida seguido; el síntoma es
que el certificado nunca se emite y Caddy reintenta en el log.

### Instancia compartida con otro sitio: el proxy que ya está

Dejá `COMPOSE_PROFILES` vacío — este despliegue no debe pelear por los puertos — y agregá un `server`
al nginx existente:

```nginx
server {
    listen 443 ssl http2;
    server_name staging.luparx.com;

    ssl_certificate     /etc/letsencrypt/live/staging.luparx.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.luparx.com/privkey.pem;

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

Con Traefik o Caddy propios, el equivalente: reenviar el host a `127.0.0.1:8093` pasando
`X-Forwarded-Proto`.

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
