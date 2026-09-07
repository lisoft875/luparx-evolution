# 0003 — Identidad global única con membresías por municipalidad

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Una misma persona puede necesitar acceso a varias municipalidades (p. ej. un inspector que
trabaja para dos cantones, o un ciudadano que se muda). Hay que decidir si la identidad de un
usuario existe una vez por municipalidad o una vez en todo el sistema.

## Alternativas consideradas

1. **Identidad por tenant**: un registro de usuario nuevo (con su propia fila) por cada
   municipalidad a la que se une. Simplifica el aislamiento de datos, pero obliga a re-registrar
   documento de identidad, teléfono, etc. por cada municipalidad y duplica el padrón, además de
   impedir un reporte de plataforma coherente (`usuarios registrados` global).
2. **Identidad global única con membresías por tenant (elegida)**: una fila en `users` por
   persona (clave natural: email), y el acceso a cada municipalidad se modela como una fila en
   `tenant_memberships (user_id, tenant_id, portal, role, status)`.

## Decisión

`users` es global y no lleva `tenant_id`. El acceso a una municipalidad específica se resuelve
exclusivamente vía `tenant_memberships`, con `UNIQUE(tenant_id, user_id, portal)`. Auto-registro:
`citizen` crea membresía `ACTIVE` inmediata (o ninguna, hasta que interactúe con un tenant);
`admin`/`inspector` crean membresía `PENDING_APPROVAL` que un `TENANT_ADMIN` o `PLATFORM_ADMIN`
debe aprobar (`self_registration_policy` por tenant: `OPEN | APPROVAL_REQUIRED | INVITE_ONLY`).

Consultas de usuarios desde un portal municipal se filtran siempre por membresía en el tenant
activo (join contra `tenant_memberships`); sólo `PLATFORM_ADMIN` puede consultar `users` sin ese
filtro. El reporte "usuarios registrados" existe en dos niveles: por municipalidad (agregando
`tenant_memberships`) y de plataforma (agregando `users`), nunca mezclados en la misma respuesta
sin que el rol del solicitante lo autorice explícitamente.

## Consecuencias / trade-offs

- (+) Un usuario no repite verificación de documento/teléfono/email al sumar una segunda
  municipalidad; sólo solicita una nueva membresía.
- (+) El padrón de plataforma es consistente por diseño (una fila = una persona real), habilitando
  reportes agregados sin deduplicación posterior.
- (+) Roles y permisos son independientes por membresía: la misma persona puede ser
  `TENANT_ADMIN` en un cantón e `INSPECTOR` en otro.
- (−) `users` es una tabla compartida entre tenants: cualquier query directa sobre ella sin pasar
  por el filtro de membresía es un riesgo de fuga entre tenants — mitigado exigiendo que todo
  acceso a `users` desde `module-tenancy`/controllers de portal municipal pase por un repositorio
  que aplique el join, nunca acceso directo desde controllers.
- (−) Cambiar el email de un usuario afecta su acceso a todas sus municipalidades simultáneamente
  (aceptado: el email es la identidad global de login).

## Impacto de migración

Ninguno (decisión de arranque). Si en el futuro un país exige identidades legalmente separadas
por jurisdicción, se evaluaría como excepción explícita, no como cambio de este modelo por defecto.

## Estrategia de rollback

Si se detecta que el modelo global genera fricción operativa grave, la migración a identidad por
tenant requeriría duplicar filas de `users` por cada membresía activa y reescribir referencias —
se documentaría como una migración expand-and-contract propia (ADR 0010) en su momento; no se
anticipa en v0.1.
