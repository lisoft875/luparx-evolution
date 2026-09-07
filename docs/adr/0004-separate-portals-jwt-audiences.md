# 0004 — Portales separados con audiencias JWT distintas

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

LupaRX tiene tres portales con perfiles de riesgo y usuario muy distintos: ciudadano (público,
auto-registro abierto), administración municipal (backoffice, datos sensibles y financieros) e
inspección (aplicación móvil de campo, con evidencia y ubicación). `CONTRACT.md` §0/§3 exige login
separado (sin página de entrada ni token compartido) y que un token de un portal no sirva en otro.

## Alternativas consideradas

1. **Un solo login y un solo token para los tres portales**, con el rol determinando qué se
   puede ver. Más simple de implementar, pero un token robado del portal ciudadano (superficie de
   ataque más expuesta, tráfico público) serviría para intentar acceder al backoffice si el rol
   coincidiera, y cualquier bug de autorización en un portal compromete a los otros dos.
2. **Portales separados con audiencias JWT distintas (elegida)**: cada portal emite tokens con
   `aud = luparx:portal:{citizen|admin|inspector}`; el resource server valida `aud` contra el
   prefijo de ruta (`/api/v1/{portal}/**`) además del rol/permiso.

## Decisión

Cada portal tiene su propia raíz de autenticación (`/api/v1/auth/{portal}/...`) y su propia
audiencia JWT. El filtro de seguridad rechaza cualquier request cuyo `aud` no corresponda al
prefijo de ruta invocado, incluso si el `sub` (usuario) y los roles serían válidos en general.
El almacenamiento de tokens en el frontend es aislado por app (cada app de `frontend/apps/*` tiene
su propio storage — ver `packages/auth` y `SECURITY.md`), de forma que un XSS en una app no puede
leer el token de otra aunque compartan dominio o dispositivo.

## Consecuencias / trade-offs

- (+) Compromiso de un portal (p. ej. XSS en la SPA ciudadana) no otorga acceso al backoffice ni
  a la app de inspección, incluso si la misma persona tiene membresías en los tres.
- (+) Permite políticas de seguridad distintas por portal (MFA obligatorio en admin/inspector,
  opcional en citizen; expiración de sesión distinta; CORS/CSP distintos — ver `SECURITY.md`).
- (+) El cambio de municipalidad activa (`POST /{portal}/session/tenant`) emite tokens nuevos con
  el mismo `aud` pero `tid`/roles actualizados, sin necesidad de reautenticación completa.
- (−) Un usuario con membresías en dos portales (p. ej. citizen + admin) debe autenticarse por
  separado en cada uno; se acepta como trade-off de seguridad, no se implementa "single sign-on"
  entre portales en v0.1.
- (−) Duplica lógica de login/refresh en el cliente (mitigado con `packages/api-client` y
  `packages/auth` compartidos entre las tres apps del frontend).

## Impacto de migración

Ninguno (decisión de arranque).

## Estrategia de rollback

Si en el futuro se requiere SSO entre portales para un mismo usuario, se añadiría un flujo de
"token exchange" explícito y auditado (nunca aceptar un token de una audiencia como válido para
otra) — no se relaja la validación de `aud` como atajo.
