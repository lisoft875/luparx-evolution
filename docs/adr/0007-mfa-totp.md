# 0007 — MFA TOTP (RFC 6238) con códigos de recuperación; obligatorio para admin e inspector

- **Estado**: **Reemplazado por [ADR 0016](0016-remove-mfa.md)** (2026-09-09) — el segundo factor se
  retiró del producto sin haberse encendido nunca. Este documento se conserva como registro de la
  decisión original y de por qué se eligió TOTP; nada de lo que describe sigue en el código.
- **Fecha**: 2026-09-07

## Contexto

Los portales `admin` e `inspector` manejan datos sensibles (usuarios, finanzas municipales,
evidencia de fiscalización) y sus cuentas son objetivos de mayor valor que una cuenta ciudadana.
Se necesita segundo factor sin depender de SMS (costo, fraude de SIM-swap, cobertura
internacional desigual).

## Alternativas consideradas

1. **SMS OTP**: familiar para usuarios, pero costoso a escala internacional, vulnerable a
   SIM-swapping, y depende de proveedores de SMS por país (fricción de expansión internacional).
2. **WebAuthn/Passkeys** como único segundo factor: más seguro y sin fricción, pero requiere
   soporte de dispositivo/navegador más variable en el parque de dispositivos de inspectores de
   campo (apps Capacitor) — se deja como extensión futura, no como base de v0.1.
3. **TOTP RFC 6238 (elegida)**: estándar abierto, compatible con apps ya instaladas por los
   usuarios (Google Authenticator, Authy, etc.), sin costo por verificación y sin dependencia de
   un proveedor externo por país.

## Decisión

MFA TOTP obligatorio para roles de portal `admin` e `inspector` desde el primer login exitoso
(bloqueante hasta activarlo); opcional para `citizen`. Secreto TOTP almacenado cifrado en reposo
(`user_mfa_totp.secret_encrypted`, no en claro — ver `SECURITY.md`). Flujo: `POST /me/mfa/setup`
devuelve `secret` + `otpauthUri` (para QR) + `recoveryCodes[]` (de un solo uso, ver abajo);
`POST /me/mfa/activate {code}` confirma la primera verificación antes de marcar `status=ACTIVE`.
Login con MFA activo: `login` devuelve `mfaRequired:true` + `mfaToken` de corta vida; el cliente
completa con `POST /mfa/verify {mfaToken, code}` (ver secuencia en `docs/ARCHITECTURE.md` §3).

**Códigos de recuperación**: generados junto con el secreto, de un solo uso, almacenados
hasheados con Argon2id (`user_mfa_recovery_codes.code_hash`), marcados `used_at` al consumirse.
Permiten recuperar acceso si el dispositivo TOTP se pierde, sin exponer el secreto ni requerir
soporte manual para el caso común.

Un admin (`ROLE_ASSIGN`/`USER_WRITE`) puede forzar `mfa_required` en `users` vía
`POST /admin/users/{id}/mfa/require {required:boolean}` — por ejemplo, para exigir MFA a un
`CITIZEN` con permisos elevados excepcionales.

## Consecuencias / trade-offs

- (+) Sin dependencia de proveedor externo de SMS por país; funciona igual en cualquier mercado
  de expansión internacional.
- (+) Costo marginal cero por verificación.
- (+) Códigos de recuperación evitan bloqueo permanente de cuenta sin depender de soporte manual.
- (−) Requiere que el usuario tenga una app autenticadora instalada — fricción de onboarding para
  `admin`/`inspector` (aceptado dado el perfil de riesgo de esos portales).
- (−) El secreto TOTP cifrado en reposo depende de la gestión correcta de la clave de cifrado
  (fuera del código, en el gestor de secretos del entorno — ver `SECURITY.md` y
  `infra/.env.example`).

## Impacto de migración

Ninguno (decisión de arranque).

## Estrategia de rollback

Si TOTP resultara inviable operativamente para un segmento de usuarios, se podría relajar
temporalmente la obligatoriedad vía `mfa_required` por rol a nivel de configuración, sin cambio de
esquema; no se recomienda como política permanente para `admin`/`inspector`.
