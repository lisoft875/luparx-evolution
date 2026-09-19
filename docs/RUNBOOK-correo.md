# LupaRX — Correo en staging: diagnóstico y configuración

> Ambiente: `staging.luparx.com`, instancia Lightsail, alias SSH `luparx-staging`.
> El despliegue vive en **`/home/ubuntu/luparx-evolution/infra`** y el compose corre **desde ahí**,
> así que las rutas van sin prefijo `infra/`.

## Nombres reales de los contenedores

```
luparx-staging-backend-1
luparx-staging-postgres-1
luparx-staging-web-1
```

Filtrar por `name=app` **no funciona** y devuelve resultados vacíos que parecen un fallo de la
aplicación. Es el error que costó una sesión entera: cuatro bloques de diagnóstico salieron en blanco
y parecía que el correo no se mandaba, cuando en realidad los comandos no encontraban el contenedor.

## Proveedor actual: Purelymail (desde 2026-09-19)

Antes había un Mailpit (perfil `demo-mail`) que atrapaba los correos sin mandarlos. Se retiró: Javier
quiso correo real en staging. Consecuencia que hay que tener presente: **cualquier cuenta con un correo
real en la base recibe correos de verdad**. Antes de cargar datos de prueba, usar direcciones
`@luparx.test`.

```
SMTP_HOST=smtp.purelymail.com
SMTP_PORT=587                      # STARTTLS. El 465 (SSL implícito) NO sirve:
SMTP_AUTH=true                     # application.yml sólo mapea starttls.enable, no ssl.enable
SMTP_STARTTLS_ENABLED=true
SMTP_USERNAME=noreplystaging@luparx.com
SMTP_FROM_ADDRESS=noreplystaging@luparx.com
COMPOSE_PROFILES=edge              # sin `demo-mail`: Mailpit ya no se levanta
```

**`noreplystaging@` y no `noreply@`**, a propósito: si staging manda algo que no debía o alguien lo
marca como spam, no quema la reputación de la dirección que va a usar producción.

La contraseña **termina en comilla simple**. En el `.env` va **sin comillas alrededor** —Compose no
interpreta el shell, así que comillarla la metería literalmente en el valor y daría 535. En un
comando de shell hay que escaparla; la forma que no pelea es escribirla a un archivo con
`printf '%s' 'clave'"'"` y leerla desde ahí.

SPF y DKIM de `luparx.com` están correctos: el primer envío llegó a bandeja principal, no a spam.

## Probar que manda

Autenticación sola, sin tocar el backend:

```bash
ssh luparx-staging 'bash -s' <<'FIN'
printf '%s' 'LA_CLAVE'"'" > /tmp/p
docker run --rm -v /tmp/p:/p:ro python:3-alpine python3 -c '
import smtplib
s = smtplib.SMTP("smtp.purelymail.com", 587, timeout=20)
s.starttls()
s.login("noreplystaging@luparx.com", open("/p").read())
print("AUTENTICACION OK"); s.quit()'
rm -f /tmp/p
FIN
```

`535` = credencial o el usuario no existe como buzón. Purelymail autentica con la dirección completa,
así que un **alias** sin buzón propio falla así.

## Diagnóstico completo

```bash
ssh luparx-staging 'bash -s' <<'FIN'
BACKEND=luparx-staging-backend-1
PG=luparx-staging-postgres-1

echo "═══ SMTP cargado ═══"
docker exec $BACKEND env | grep -E '^SMTP_|^APP_BASE_URL_' | sed 's/^SMTP_PASSWORD=.*/SMTP_PASSWORD=<oculta>/'

echo; echo "═══ Errores de correo ═══"
docker logs --since 72h $BACKEND 2>&1 | grep -iE 'Unable to deliver|MailException|550|553|relay|AuthenticationFailed'

echo; echo "═══ Estados de cuenta ═══"
docker exec $PG psql -U luparx -d luparx -t -c "select status, count(*) from users group by status;"

echo; echo "═══ Tokens recientes ═══"
docker exec $PG psql -U luparx -d luparx -c \
  "select purpose, created_at, consumed_at is not null as usado, expires_at < now() as vencido
   from verification_tokens order by created_at desc limit 10;"

echo; echo "═══ Correos reales en la base (ojo: reciben de verdad) ═══"
docker exec $PG psql -U luparx -d luparx -c \
  "select email, status from users where email not like '%luparx.test';"
FIN
```

**Cómo leer el resultado.** `verification_tokens` se escribe ANTES de enviar
(`EmailVerificationService.issueToken`), así que:

| Token | Correo llegó | Dónde está el problema |
|---|---|---|
| Existe | No | El envío: SMTP, remitente rechazado, o spam |
| No existe | No | Antes del envío: el registro no llegó a emitirlo |

## Cambiar de proveedor

```bash
ssh luparx-staging 'bash -s' <<'FIN'
cd /home/ubuntu/luparx-evolution/infra
cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
# editar .env
docker compose -f docker-compose.deploy.yml --env-file .env up -d --force-recreate backend
sleep 30
docker exec luparx-staging-backend-1 env | grep -E '^SMTP_' | sed 's/^SMTP_PASSWORD=.*/<oculta>/'
FIN
```

Recrear el backend **reconstruye la imagen** (`luparx/backend:local` no está en ningún registro), así
que tarda. Con la caché de Maven caliente son unos segundos; en frío, varios minutos.

## Deuda conocida de este camino

**Un fallo de envío deja un WARN y nada más.** `SmtpNotificationSender.send` captura `MailException`,
la registra y sigue. No hay reintento, y el log **no registra la dirección** (por privacidad), así que
después no se puede saber a quién reenviarle. Con Mailpit era teórico; con un SMTP externo, un corte
de red deja a un ciudadano registrado sin su enlace y sin forma de pedirlo de nuevo.

`NotificationSender.sendOrThrow` ya existe para los envíos que deben fallar ruidosamente. La
verificación de correo es candidata: sin ese correo la cuenta es inutilizable. Lo correcto de verdad
es encolarlo por `outbox_events` como hace `NotificationEmailRelay` desde la v0.38 — reintento con
backoff y rastro de qué se entregó.

**`SMTP_FROM_ADDRESS` estuvo en `no-reply@tu-dominio.com`** (el valor de ejemplo del
`.env.deploy.example`) hasta el 2026-09-19. Con Mailpit no importaba. Vale revisar ese archivo por
otros valores de ejemplo que hayan quedado vivos.

**Mailpit guardaba en memoria**, sin volumen. Cada reinicio borraba todo. Por eso un correo de
verificación del 15/09 no aparecía el 18/09: se había mandado, y se perdió. Si algún día vuelve para
una demo, ponerle volumen.
