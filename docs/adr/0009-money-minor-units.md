# 0009 — Dinero en unidades menores enteras + código de moneda; prohibición de punto flotante

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

El dominio de parquímetros (tarifas, sesiones de parqueo, pagos, finanzas por municipalidad,
v0.3+) maneja montos de dinero que deben ser exactos y auditables, en un sistema que eventualmente
soportará múltiples monedas simultáneamente (expansión internacional).

## Alternativas consideradas

1. **`float`/`double`**: representación binaria inexacta para valores decimales; puede producir
   errores de redondeo acumulados en sumas de muchas transacciones — inaceptable para dinero.
   Explícitamente prohibido por `CONTRACT.md` §5 y por las instrucciones del proyecto.
2. **`DECIMAL`/`BigDecimal` en unidad mayor** (p. ej. colones o dólares con decimales): exacto,
   pero requiere definir escala/precisión por moneda (no todas las monedas tienen 2 decimales;
   ISO 4217 define "minor unit" distinto por moneda) y complica comparaciones entre lenguajes/ORM.
3. **Entero en unidad menor + código de moneda (elegida)**: `amount_minor bigint` (la unidad
   menor de la moneda, p. ej. céntimos) + `currency_code char(3)` (ISO 4217), siguiendo el
   estándar de la mayoría de plataformas de pago.

## Decisión

Todo campo monetario en base de datos es un par `amount_minor bigint` + `currency_code char(3)`.
El tipo `Money` en `platform-core` encapsula ambos campos, expone operaciones aritméticas seguras
(sólo entre montos de la misma moneda; suma/resta entre monedas distintas lanza error explícito,
nunca conversión implícita) y es el único tipo permitido para representar dinero en el dominio.
Nunca se usa `float`/`double` para dinero en ninguna capa (backend, DTO, frontend, exportes).
La cantidad de decimales por moneda (número de "minor units") se resuelve desde el catálogo ISO
4217, no hardcodeada por moneda en el código de negocio.

## Consecuencias / trade-offs

- (+) Aritmética exacta, sin errores de redondeo acumulado.
- (+) Compatible por diseño con la mayoría de proveedores de pago externos (que también trabajan
  en unidad menor), reduciendo conversión en la integración de pagos (v0.3, ADR 0012).
- (+) Soporta multi-moneda desde el modelo de datos sin cambio de esquema al agregar un país con
  otra moneda.
- (−) La UI debe formatear el monto (dividir por la potencia de 10 correspondiente y aplicar
  formato local) en vez de mostrar el campo crudo — requiere una función de formato centralizada
  en `packages/i18n`/`packages/ui`, no formateo ad-hoc por pantalla.
- (−) Operaciones que "parecen" simples (mostrar un total en un reporte) requieren agrupar
  primero por moneda antes de sumar — el tipo `Money` fuerza esto explícitamente.

## Impacto de migración

Ninguno (decisión de arranque; el dominio de parquímetros es un stub en v0.1).

## Estrategia de rollback

No aplica: es un invariante de integridad de datos financieros, no una decisión reversible sin
riesgo de corrupción de montos ya almacenados.
