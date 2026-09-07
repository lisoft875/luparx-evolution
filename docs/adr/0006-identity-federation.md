# 0006 — Federación de identidad (Google, Microsoft Entra ID, Facebook) y vinculación segura de cuentas por email verificado

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Se quiere reducir fricción de registro permitiendo login federado, sin renunciar al modelo de
identidad global único (ADR 0003) ni crear cuentas duplicadas para la misma persona.

## Alternativas consideradas

1. **Sin federación, solo email/password**: menor complejidad, pero mayor fricción de registro y
   peor tasa de conversión, especialmente en el portal ciudadano.
2. **Una cuenta separada por proveedor federado (sin vinculación)**: simple, pero genera
   duplicados cuando la misma persona usa Google una vez y contraseña local otra vez, rompiendo
   el modelo de identidad global.
3. **Federación con vinculación automática por email, sin confirmación**: fricción mínima, pero
   riesgo de secuestro de cuenta si un proveedor federado no verifica el email de forma confiable
   o si un atacante controla un email que coincide.
4. **Federación con vinculación por email verificado + confirmación explícita cuando ya existe
   contraseña local (elegida)**.

## Decisión

Proveedores soportados en v0.1: Google (OIDC), Microsoft Entra ID (OIDC), Facebook (OAuth2 +
Graph API). Cada identidad federada se registra en `user_federated_identities (provider, subject,
user_id, email, linked_at)` con `UNIQUE(provider, subject)`. Reglas de vinculación:

- Si el email verificado del proveedor **no existe** en `users`, se crea un usuario nuevo con ese
  email ya marcado `email_verified_at` (el proveedor ya lo verificó) y se solicitan los campos de
  registro faltantes (§2 de `CONTRACT.md`) en un paso posterior si el proveedor no los entrega.
- Si el email **ya existe** con contraseña local (`user_credentials`), la vinculación exige una
  confirmación explícita del usuario (reautenticación con la contraseña local o flujo de
  verificación por correo) antes de crear la fila en `user_federated_identities` — nunca se
  vincula de forma automática y silenciosa.
- Los flujos de OAuth2/OIDC pasan por el backend (`GET /api/v1/auth/{portal}/oauth2/{provider}/
  start|callback`), nunca directamente del frontend al proveedor, para poder validar `state`/PKCE
  y aplicar la política de vinculación del lado servidor.

## Consecuencias / trade-offs

- (+) Reduce fricción de registro sin duplicar identidades.
- (+) El usuario mantiene control explícito sobre vincular un proveedor externo a una cuenta con
  contraseña ya existente (mitiga secuestro de cuenta vía proveedor federado comprometido).
- (−) Requiere manejar credenciales de cliente OAuth por proveedor y por entorno
  (`infra/.env.example`), y mantener el flujo de callback actualizado si un proveedor cambia su
  API (riesgo de mantenimiento externo, no controlable por el equipo).
- (−) Un usuario sin contraseña local (solo federado) que pierde acceso a su proveedor externo
  necesita un flujo de recuperación alterno (fuera de alcance v0.1, pendiente de definir con
  soporte manual vía `PLATFORM_ADMIN`/`TENANT_ADMIN`).

## Impacto de migración

Ninguno (decisión de arranque). Agregar un proveedor nuevo en el futuro es aditivo: nueva fila de
configuración, sin cambio de esquema.

## Estrategia de rollback

Deshabilitar un proveedor federado específico (p. ej. por incidente de seguridad del proveedor) es
una bandera de configuración por tenant/plataforma; no afecta a usuarios que ya vincularon otros
proveedores o que tienen contraseña local.
