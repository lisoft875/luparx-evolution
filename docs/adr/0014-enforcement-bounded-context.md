# 0014 — Fiscalización como contexto propio (`module-enforcement`), con puerto hacia parqueo

- **Estado**: Aceptado
- **Fecha**: 2026-09-09

## Contexto

Una boleta no es "placa → pagó / no pagó": es un **acto administrativo** que alguien puede impugnar
meses o años después. Necesita placa, ubicación (bahía, zona, coordenadas y dirección escrita), tipo
de infracción, monto vigente en ese momento, hora declarada por el funcionario y hora de emisión,
evidencia fotográfica verificable, funcionario responsable, y un historial de todo lo que le pasó
después. Su ciclo de vida —emitida, impugnada, confirmada, anulada, pagada, vencida— dura órdenes de
magnitud más que el de una sesión de parqueo, que nace y muere la misma tarde.

Además, la mayoría de las boletas existen **precisamente porque no hay sesión**: modelar la boleta
como un apéndice de `parking_sessions` sería falso en el caso normal.

## Alternativas consideradas

1. **Tablas y servicios dentro de `module-parking`.** Menos ceremonia hoy. Pero mezcla dos ciclos de
   vida y dos vocabularios en un módulo que ya es el más grande del sistema, y hace que el candidato
   más obvio a extraerse como servicio (fiscalización, que un municipio puede querer operar con su
   propia infraestructura de evidencia) quede entrelazado con el cobro.
2. **Microservicio separado desde el inicio.** Rechazado por ADR 0001: no hay razón técnica ni
   organizativa medible todavía, y pagaríamos consistencia distribuida por adelantado.
3. **Módulo propio dentro del monolito modular, con dependencia directa a `module-parking`.**
   Correcto en fronteras, pero deja llamadas a `ParkingSessionService` repartidas por varios
   servicios: el día de la extracción hay que encontrarlas y reescribirlas todas.
4. **Módulo propio con un puerto hacia parqueo (elegida).**

## Decisión

- **`module-enforcement`** es un contexto acotado con sus propias entidades (`infraction_types`,
  `citations`, `citation_events`, `citation_evidence`, `citation_number_counters`), servicios y
  reglas. Depende de `platform-core` y `module-tenancy`; **no** depende de `module-parking`.
- Lo único que necesita de parqueo se declara como puerto: `ParkingStatusPort` (¿hay sesión vigente
  para esta placa?, ¿existe esta bahía?, ¿esta placa está registrada por exactamente una persona?).
  El adaptador vive en `app` (`ParkingStatusAdapter`) y hoy llama a los servicios de parqueo en el
  mismo proceso. El día de la extracción, ese adaptador pasa a ser un cliente HTTP y **nada** dentro
  del módulo cambia.
- **`EvidenceStorage`** es el segundo puerto: las fotografías no van a la base de datos. La
  implementación de desarrollo escribe en disco (`FilesystemEvidenceStorage`); un despliegue con más
  de una instancia debe sustituirla por un object store, porque dos backends detrás de un balanceador
  no comparten disco. El dominio valida tamaño y tipo **antes** de llamar al puerto, para que ninguna
  implementación pueda aplicar reglas distintas.
- **Consecutivo por municipalidad y año** en `citation_number_counters`, con la fila bloqueada
  (`SELECT … FOR UPDATE`) dentro de la misma transacción que inserta la boleta. Ver más abajo.
- **Doble idempotencia** al emitir: el header `Idempotency-Key` (ADR 0012) protege la *petición*, y
  `citations.device_citation_id` —único por municipalidad— protege el *acto* frente a un reenvío
  desde una app reinstalada con claves nuevas.
- **Append-only tras la emisión**: no hay edición ni borrado. Se cambia de estado con transiciones
  explícitas y cada cambio escribe un `citation_events`, que se devuelve junto con la boleta porque
  quien la impugna tiene derecho a leer qué pasó.

## Consecuencias / trade-offs

- **Contención del consecutivo**: emitir boletas en una municipalidad se serializa sobre una fila
  durante lo que dura un insert. A unos pocos actos por minuto es irrelevante; si algún día no lo
  fuera, la salida es una serie por zona o por funcionario (un cambio en el prefijo), no otro
  mecanismo. Se prefirió a una secuencia de base de datos porque una secuencia no puede ser por
  tenant-año sin DDL en tiempo de ejecución y, por diseño, **deja huecos** al hacer rollback: una
  municipalidad tiene que poder defender su numeración como completa.
- **Un salto extra** en las consultas de placa (dominio → puerto → adaptador → parqueo). A cambio,
  la frontera es visible y verificable: el compilador impide que fiscalización toque una entidad de
  parqueo.
- **Duplicación deliberada de datos**: la boleta copia código, nombre y monto de la infracción. Es
  intencional: subir una multa el año que viene no puede cambiar por cuánto multaron a alguien el
  año pasado.
- La evidencia en disco **no sirve para escalar horizontalmente**. Está dicho en el código y en
  `backend/README.md`, y es el primer cambio antes de una segunda instancia.

## Impacto de migración

`V17_0__enforcement.sql` sólo **agrega** tablas, índices y restricciones; no toca ninguna tabla
existente, así que una versión anterior de la aplicación sigue funcionando contra el esquema nuevo
(compatible con despliegue en rolling). El stub `501` de `/api/v1/inspector/citations/**` se eliminó
al aparecer las rutas reales: dos handlers en la misma ruta serían un mapeo ambiguo.

Se agregan cuatro permisos (`CITATION_ISSUE`, `CITATION_READ`, `CITATION_VOID`,
`ENFORCEMENT_MANAGE`) a `RolePermissions`. La tabla equivalente del frontend
(`frontend/packages/auth/src/permissions.ts`) debe recibir los mismos valores; el servidor es la
autoridad y no depende de que eso ocurra.

## Rollback

Revertir la aplicación a la versión anterior es suficiente: las tablas nuevas quedan sin uso y
ninguna tabla previa cambió de forma. Si además hiciera falta soltar el esquema, un `V17_1` que
elimine las cinco tablas en orden inverso de dependencia lo hace — pero eso destruye actos
administrativos, así que la decisión de correrlo es del municipio, no de una migración automática.
