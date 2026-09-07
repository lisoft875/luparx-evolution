# 0008 — Internacionalización: ISO 3166 / 4217 / BCP 47 / IANA, catálogo genérico de divisiones administrativas de N niveles, tipos de documento por país, teléfonos E.164

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

LupaRX debe soportar expansión a otros países sin reescritura, aunque el lanzamiento inicial sea
en un país concreto. Costa Rica no puede ser un supuesto del sistema: sólo un valor de
configuración por defecto (`CONTRACT.md` §7).

## Alternativas consideradas

1. **Modelar directamente provincia/cantón/distrito y cédula/DIMEX como campos fijos**: más rápido
   para el primer país, pero cada país nuevo requeriría cambio de esquema y de UI (hardcodear
   "Provincia"/"Cantón"/"Distrito" es exactamente lo prohibido en `CONTRACT.md` §7).
2. **Catálogo genérico parametrizado por país (elegida)**: divisiones administrativas como árbol
   de N niveles (`administrative_divisions`), etiquetas de nivel configurables por país
   (`country_admin_levels.label_key`), tipos de documento configurables por país+tipo con regex/
   normalizador (`identity_document_types`), teléfonos normalizados a E.164, y catálogos ISO como
   fuente de países/monedas/locales.

## Decisión

- **Países**: `countries(code PK char(2), ...)` con `code` ISO 3166-1 alpha-2; cada país trae sus
  defaults (`default_locale` BCP 47, `default_currency` ISO 4217, `default_time_zone` IANA).
- **Divisiones administrativas**: `administrative_divisions` es un árbol auto-referenciado
  (`parent_id -> self`) con `level int`, sin límite fijo de niveles; `country_admin_levels` define
  cuántos niveles tiene cada país y la clave i18n de la etiqueta de cada nivel (nunca el texto
  literal "Provincia"/"State"/"County"). La UI resuelve dinámicamente cuántos selectores mostrar y
  qué etiqueta poner, según el país elegido por el usuario.
- **Tipos de documento**: `identity_document_types(country_code, type, pattern, normalizer,
  example)` — el frontend valida con esa regex para UX, el backend siempre revalida contra el
  mismo catálogo (`CONTRACT.md` §7: "validación siempre en servidor"). Defaults de Costa Rica
  (`NATIONAL_ID` 9 dígitos, `FOREIGN_RESIDENT_ID` DIMEX 11–12, `PASSPORT` alfanumérico 6–12) son
  **datos semilla de un país configurado**, no lógica de código.
- **Teléfonos**: se almacena `phone_e164` normalizado (formato `+<código país><número>`),
  validado con libphonenumber (backend) y `libphonenumber-js` (frontend); el prefijo por defecto
  es el del país seleccionado en el formulario, no un valor fijo en código.
- **Nacionalidad**: `nationalityCode` ISO 3166-1 alpha-2; la bandera se deriva en frontend (emoji
  regional-indicator + fallback SVG) — no se almacenan imágenes de banderas.
- **Locale/zona horaria**: `locale` BCP 47 y `timeZone` IANA por usuario y por tenant; timestamps
  siempre en UTC en base de datos, convertidos en la capa de presentación.

## Consecuencias / trade-offs

- (+) Agregar un país nuevo es un `INSERT` de datos semilla (país, niveles administrativos,
  divisiones, tipos de documento), no un despliegue de código nuevo.
- (+) La UI de registro (§2 del contrato) es genérica: nunca hardcodea etiquetas ni formatos.
- (−) Mayor complejidad de modelado desde el día uno (árbol de divisiones, catálogo de documentos)
  frente a campos fijos — aceptado porque el retrabajo de migrar de campos fijos a genérico más
  adelante sería mucho más costoso (tocaría datos de producción de usuarios reales).
- (−) Requiere mantener datos semilla actualizados por país (cambios de división administrativa,
  nuevos tipos de documento) como proceso operativo continuo, no solo de desarrollo.

## Impacto de migración

Ninguno (decisión de arranque). Los defaults de Costa Rica se cargan como semilla del primer país
configurado, explícitamente etiquetados como configuración, nunca como supuesto de código.

## Estrategia de rollback

No aplica: revertir a campos fijos por país perdería la capacidad de expansión internacional que
es un requisito explícito del producto.
