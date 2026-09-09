# 0005 — Autenticación: Argon2id + JWT RS256 con rotación de claves + refresh opaco con rotación y detección de reuso

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Se necesita un esquema de autenticación local (además de federación, ADR 0006) que resista
ataques comunes (fuerza bruta offline sobre hashes filtrados, robo de refresh token) y que escale
horizontalmente sin estado compartido en memoria (`docs/ARCHITECTURE.md` §7).

## Alternativas consideradas

1. **bcrypt/PBKDF2** para contraseñas: ampliamente soportado, pero más vulnerable a ataques con
   GPU/ASIC que Argon2id a igual costo configurado.
2. **JWT HS256 (secreto simétrico compartido)**: más simple, pero el mismo secreto que firma debe
   usarse para verificar, lo que impide exponer una verificación pública (JWKS) sin exponer también
   la capacidad de firmar.
3. **Sesiones de servidor (stateful) en vez de JWT**: requieren almacenamiento compartido de
   sesión entre instancias (Redis u otro), añadiendo una dependencia de estado compartido para
   cada request autenticado.
4. **Argon2id + JWT RS256 + refresh opaco con rotación (elegida)**.

## Decisión

- **Contraseñas**: Argon2id (parámetros de costo configurables por entorno, revisables sin
  migración de datos porque el hash almacena su propio algoritmo/parámetros — `user_credentials.
  algorithm`).
- **Access token**: JWT RS256, 15 minutos de vida, claims `iss, sub, aud, exp, iat, jti, portal,
  tid, roles[], perms[], locale, ver` (`CONTRACT.md` §3). Verificación pública vía JWKS en
  `/.well-known/jwks.json`; las claves privadas de firma nunca salen del backend. Rotación de
  claves: se publican múltiples claves activas en el JWKS (`kid` en el header del JWT) para poder
  rotar sin invalidar tokens ya emitidos hasta su expiración natural (máximo 15 min de solape
  necesario).
- **Refresh token**: opaco (no JWT), 30 días, almacenado como `token_hash` (nunca en claro),
  agrupado por `family_id`. Cada uso rota el refresh (el anterior se marca `revoked_at` +
  `replaced_by`); si un refresh ya usado se presenta de nuevo, se interpreta como robo y se revoca
  toda la familia, forzando reautenticación completa.
- **`ver` (versión de credenciales)**: incrementar `users.credentials_version` (p. ej. al cambiar
  contraseña o forzar reseteo desde admin) invalida de forma inmediata todos los access tokens
  emitidos antes del cambio, sin esperar su expiración de 15 minutos.
- **Rate limiting / bloqueo por intentos**: tabla `auth_attempts (email_hash, portal, ip_hash,
  success, occurred_at)`, consultada por el backend antes de procesar login — no depende de
  memoria local del proceso, por lo que funciona igual con una o con N instancias.

## Consecuencias / trade-offs

- (+) Sin estado de sesión compartido en memoria: cualquier instancia puede validar cualquier
  access token (verificación con clave pública) y cualquier refresh token (consulta a PostgreSQL).
- (+) Robo de un refresh token es detectable y contenible (revocación de familia completa).
- (+) Rotación de claves de firma sin downtime ni invalidar sesiones activas de golpe.
- (−) Verificar el refresh token siempre requiere una consulta a base de datos (no es stateless
  como el access token) — aceptado porque el refresh se usa con mucha menor frecuencia que el
  access token y es la única forma práctica de soportar revocación real.
- (−) Argon2id es más costoso en CPU que bcrypt a igual seguridad percibida; se mitiga tuneando
  parámetros de costo por entorno y limitando el rate de intentos de login.

## Impacto de migración

Ninguno (decisión de arranque). Rotar la clave de firma RS256 en producción es una operación
operativa recurrente, no una migración de esquema.

## Estrategia de rollback

Si Argon2id resultara demasiado costoso en CPU para el hardware disponible, `user_credentials.
algorithm` permite migrar el algoritmo por usuario de forma incremental (rehash al siguiente login
exitoso) sin invalidar contraseñas existentes ni requerir downtime.
