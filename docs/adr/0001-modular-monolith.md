# 0001 — Monolito modular con fronteras explícitas (vs microservicios)

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

LupaRX es una plataforma municipal multi-tenant de fiscalización vial/parquímetros pensada para
expansión internacional a mediano plazo, pero que arranca con un equipo pequeño y sin tráfico de
producción. El dominio ya está segmentado conceptualmente en geo, identidad, tenencia y
parquímetros (`CONTRACT.md` §6). Hay que decidir la unidad de despliegue: un solo backend, o
varios servicios independientes desde el inicio.

## Alternativas consideradas

1. **Microservicios desde v0.1**: un servicio por contexto (geo, identity, tenancy, parking).
   Escala de forma independiente y permite despliegues desacoplados por equipo.
2. **Monolito no modular**: un único módulo Java sin fronteras internas explícitas. Rápido al
   inicio, pero degrada a "big ball of mud" al crecer el dominio (zonas, tarifas, pagos, multi-país).
3. **Monolito modular (elegida)**: módulos Maven independientes (`platform-core`, `module-geo`,
   `module-identity`, `module-tenancy`, `module-parking`) desplegados como un único artefacto
   Spring Boot (`app`), con reglas de dependencia explícitas y sin ciclos.

## Decisión

Adoptar un monolito modular. Cada módulo Maven tiene su propio `pom.xml`, su propio paquete raíz
y una API interna explícita hacia los demás módulos (sin acceso directo a tablas de otro módulo).
`app` es el único módulo que depende de todos y arranca Spring Boot, seguridad, controllers,
Flyway y OpenAPI.

## Consecuencias / trade-offs

- (+) Una sola base de datos permite transacciones ACID entre módulos (p. ej. aprobar membresía +
  auditoría en el mismo commit), sin sagas.
- (+) Despliegue y observabilidad simples: un solo proceso, un solo pipeline de CI, un solo lugar
  donde correlacionar logs.
- (+) El costo de coordinación entre "servicios" es cero porque son llamadas Java in-process.
- (−) Todo el backend escala como una unidad: no se puede escalar `module-parking` de forma
  independiente de `module-identity` sin escalar el proceso completo.
- (−) Requiere disciplina de equipo para no crear dependencias circulares o atajos que accedan a
  tablas de otro módulo directamente (mitigado con revisión de arquitectura y, cuando el volumen
  de código lo justifique, un linter de arquitectura tipo ArchUnit).

## Impacto de migración

Ninguno: es la decisión de arranque del proyecto.

## Estrategia de rollback

No aplica como rollback de código; el "rollback" conceptual sería *no* modularizar, lo cual se
descarta explícitamente porque el costo de mantenimiento futuro sería mayor. Si en el futuro se
decide extraer un módulo a servicio, ver `docs/ARCHITECTURE.md` §5 para el camino de migración
(no es un rollback de esta decisión sino su evolución esperada).
