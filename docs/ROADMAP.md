# LupaRX — Roadmap

> Fases cortas, alcance concreto por fase. Las decisiones marcadas "pendiente de definir con el
> usuario" no deben resolverse por defecto sin confirmación explícita: son supuestos de negocio o
> regulatorios, no técnicos.

## v0.1 — Identidad, membresías, portal de administración de usuarios

**Alcance**: `platform-core`, `module-geo`, `module-identity`, `module-tenancy` completos.
Auto-registro en los tres portales (§2 del contrato), login local + MFA + federación (Google/
Microsoft/Facebook), cambio de municipalidad activa, portal de administración de usuarios
(alta/baja, bloqueo, reseteo de contraseña, forzar MFA, roles, aprobación de membresías,
auditoría, reporte de registrados), catálogos públicos (países, divisiones, tipos de documento,
tenants publicables). `module-parking` existe sólo como módulo vacío con su frontera declarada
(sin lógica de dominio).

**Riesgos**:
- Validación de documentos de identidad por país+tipo (regex/checksum) puede no cubrir todos los
  casos reales al lanzar un país nuevo — mitigado con `identity_document_types` como catálogo
  editable sin despliegue de código.
- El flujo de aprobación manual (`PENDING_APPROVAL`) puede ser un cuello de botella operativo para
  municipalidades sin `TENANT_ADMIN` activo todavía — depende del proceso de alta de la primera
  municipalidad, no sólo del software.
- Sincronizar `CONTRACT.md` con la implementación real del backend/frontend en dos repositorios de
  trabajo paralelo (otros agentes en `backend/`/`frontend/`) — mitigado tratando `CONTRACT.md`
  como fuente de verdad de sólo lectura para todos.

**Pendiente de definir con el usuario**:
- Política de retención de `audit_events` y de datos personales por jurisdicción de lanzamiento
  (no hay un plazo legal único aplicable a todos los países de expansión futura).
- Flujo de recuperación de acceso para un usuario cuya única identidad es federada (sin
  contraseña local) y pierde acceso a su proveedor externo.
- Qué constituye "municipalidad publicable" en `GET /catalog/tenants` (¿todo tenant activo, o un
  subconjunto curado?).

## v0.2 — Zonas, tarifas, sesiones de parqueo

**Alcance**: primeras entidades reales de `module-parking`: zonas de parqueo (asociadas a
divisiones administrativas del tenant), tarifas por zona (con vigencia temporal), inicio/fin de
sesión de parqueo desde el portal ciudadano (`/api/v1/citizen/vehicles`,
`/api/v1/citizen/parking-sessions`). Sin cobro real todavía (v0.3).

**Riesgos**:
- Modelar tarifas con vigencia temporal y excepciones (feriados, tarifa nocturna) sin sobre-
  diseñar antes de tener un caso real de un tenant — riesgo de construir configurabilidad que
  nadie usa.
- Concurrencia en inicio/fin de sesión de parqueo por vehículo (una persona no debería poder tener
  dos sesiones activas simultáneas en el mismo vehículo) — requiere invariante a nivel de base de
  datos (constraint o `EXCLUDE`), no sólo validación de aplicación.

**Pendiente de definir con el usuario**:
- Modelo de tarifa: ¿por tiempo fijo, por tramo, con tope diario? Afecta directamente el esquema
  de `rates`.
- Si un vehículo se identifica por placa única global o única por país (placas duplicadas entre
  países en la expansión internacional).

## v0.3 — Pagos multi-proveedor y finanzas por municipalidad

**Alcance**: integración con al menos un proveedor de pago (arquitectura preparada para múltiples,
por país/tenant), cobro de sesiones de parqueo, reembolsos, `outbox_events` con publicador real
activo, idempotencia end-to-end (ADR 0012), reportes financieros por tenant
(`/api/v1/admin/finance/*`), exportes asíncronos (`POST /admin/exports` más allá del CSV síncrono
≤10k filas de v0.1).

**Riesgos**:
- Reconciliación entre el estado interno y el del proveedor de pago tras un webhook perdido o
  fuera de orden — requiere un job de reconciliación periódico, no sólo el webhook.
- Un solo proveedor de pago integrado primero puede introducir supuestos implícitos (moneda,
  método de cobro) que no generalicen al segundo proveedor — mitigar con una interfaz de puerto de
  pagos desde el primer proveedor, aunque sólo haya un adaptador.
- Manejo de impuestos/retenciones que varían por país — alcance no trivial, depende de definición
  legal por mercado.

**Pendiente de definir con el usuario**:
- Qué proveedor(es) de pago integrar primero y en qué país(es).
- Política de reembolso (ventana de tiempo, quién autoriza, montos parciales).
- Moneda(s) de operación real en el lanzamiento inicial (afecta datos semilla de `tenants`, no el
  modelo, que ya es multi-moneda desde ADR 0009).

## v0.4 — Fiscalización en campo con evidencia y offline

**Alcance**: `module-parking` completo del lado de inspección: patrullas, citaciones
(`/api/v1/inspector/patrols`, `/api/v1/inspector/citations`), captura de evidencia (foto/ubicación)
desde la app Capacitor de `inspector`, soporte de operación offline con sincronización posterior.

**Riesgos**:
- Conflictos de sincronización offline (una citación creada sin conectividad que choca con datos
  cambiados mientras el inspector estaba desconectado) — requiere estrategia explícita de
  resolución de conflictos, no sólo "el último que sincroniza gana".
- Subida de evidencia (fotos) introduce superficie de ataque nueva (ver `SECURITY.md` §9) que no
  existía en v0.1–v0.3.
- Geolocalización de inspectores es un dato sensible adicional (ubicación de una persona) que
  requiere su propia política de minimización/retención.

**Pendiente de definir con el usuario**:
- Tiempo máximo aceptable de operación offline antes de bloquear la app (¿24h? ¿sin límite?).
- Qué evidencia es obligatoria por citación (¿foto sola, foto + geolocalización, video?) y su
  retención (relevante si se usa como evidencia legal ante un reclamo del ciudadano).
- Formato/proveedor de almacenamiento de evidencia (objeto almacenado en el propio backend vs.
  almacenamiento de objetos externo).

## v0.5 — Multi-país

**Alcance**: primer país adicional configurado (nuevos `countries`, `country_admin_levels`,
`administrative_divisions`, `identity_document_types` como datos semilla, sin cambio de esquema —
ADR 0008); validación real de que ningún texto o regla de negocio asume Costa Rica como único país
(auditoría de código contra `CONTRACT.md` §7); soporte de segundo idioma end-to-end (UI, emails,
recibos/PDFs) más allá de `es-CR`/`en-US` si el país nuevo lo requiere.

**Riesgos**:
- Encontrar hardcodeos residuales de Costa Rica (`+506`, `CRC`, "Provincia/Cantón/Distrito") que
  hayan quedado en código de fases anteriores pese a la regla — requiere una auditoría explícita
  antes de cerrar esta fase, no sólo confiar en la disciplina de code review previa.
- Regulación financiera/fiscal del país nuevo puede requerir campos o reglas no anticipadas (p. ej.
  un identificador fiscal distinto, reglas de facturación electrónica).
- Formato de dirección del país nuevo puede no encajar en el árbol de N niveles genérico si tiene
  una estructura muy distinta (ADR 0008 asume jerarquía estricta parent-child).

**Pendiente de definir con el usuario**:
- Qué país es el segundo mercado objetivo (determina qué reglas de documento/dirección/moneda hay
  que validar primero).
- Requisitos legales de facturación/impuestos del país nuevo.
- Si el segundo país comparte alguna municipalidad/tenant con el primero o son completamente
  independientes desde el catálogo de tenants.
