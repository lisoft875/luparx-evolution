# 0017 — Identidad del actor y origen en la bitácora

- **Estado**: Aceptado
- **Fecha**: 2026-09-10
- **Amplía**: [0013](0013-audit-trail.md)

## Contexto

La ADR 0013 definió *qué* se guarda. La v0.32 agregó el antes y el después de cada campo y el
candado de base de datos con cadena de sellos. Queda pendiente lo que un comprador de gobierno pide
literalmente: **quién** realizó cada acción y **desde dónde**, en una pantalla que una persona pueda
leer delante de un auditor.

Hasta la v0.32 la bitácora guardaba `actor_user_id` (un UUID), `ip_hash` y `user_agent`, y la
pantalla mostraba el UUID y **nada** del origen. Es decir: los datos estaban, la respuesta no.

Son dos decisiones distintas y cada una tiene una tensión propia.

---

## Decisión 1 — El nombre del actor se resuelve al leer, no se copia al escribir

### Alternativas consideradas

1. **Copiar el nombre dentro de la fila de auditoría**, como una boleta copia el nombre del
   infractor. Una sola consulta, y el nombre queda congelado tal como era el día del acto.
2. **Resolver contra `users` al leer, en una consulta por página (elegida).**
3. Guardar ambos: copia congelada más enlace.

### Decisión

Se resuelve al leer. `AuditActorResolver` recoge los ids de una página de resultados y hace **una**
consulta; el DTO expone `actorName` y `actorActive`.

### Razones

- La tabla **no se puede actualizar** — ese es todo el sentido de la v0.32. Un nombre copiado
  adentro es un nombre que nunca podrá corregirse: ni un cambio de nombre legal, ni un nombre
  escrito mal. La plataforma quedaría permanentemente incapaz de corregir su propio registro de una
  persona.
- Una boleta es un documento **notificado a alguien**: lo que decía el día que se entregó es parte
  del acto, por eso se congela. Una entrada de bitácora es el registro de que alguien hizo algo, y
  quién es esa persona no cambia porque su nombre se haya tecleado con un error.
- Congelar el nombre pondría un identificador personal en cada una de las filas más numerosas del
  sistema, en la única tabla sin ruta de borrado, para ahorrar una consulta indexada por página.
- **Un funcionario nunca se borra al desactivarlo** (CONTRACT.md v0.28). Esa regla es lo que hace
  segura la resolución al leer, y no es casualidad: existe precisamente para que la historia
  conserve a sus autores.

### Costo aceptado

La pantalla muestra el nombre **de hoy**, no el del día del acto. Para "quién hizo esto" el nombre
de hoy es la respuesta correcta: es cómo el auditor va a encontrar a la persona. Si algún día una
jurisdicción exige el nombre histórico, la vía es un documento firmado y exportado en su momento, no
una copia congelada dentro de la bitácora.

Un id que no resuelve se muestra abreviado en lugar de en blanco: la entrada sigue siendo rastreable.

---

## Decisión 2 — La dirección IP se sigue sin guardar, y se coteja bajo demanda

### El problema

`ip_hash` guarda `sha256(dirección + pimienta de la instalación)` y nunca la dirección
(`SECURITY.md` §11). Es lo correcto, y hace la columna **inútil** el día que la municipalidad tiene
una pregunta de verdad: *la denuncia dice que las consultas salieron de esta dirección, ¿fue así?*
Sin respuesta, la presión natural es empezar a guardar direcciones en claro, y la bitácora se
convierte en una lista de dónde estuvo cada persona.

### Alternativas consideradas

1. **Guardar la dirección en claro** para las entradas de funcionarios. Rechazada: un respaldo
   robado se vuelve un mapa de personas, y la excepción "sólo para funcionarios" no sobrevive al
   primer requerimiento.
2. **Dejar la columna como está y no mostrarla.** Es el estado hasta la v0.32: cumple en el papel y
   no responde nada.
3. **Mostrar una huella y permitir cotejar una dirección que el consultante ya trae (elegida).**

### Decisión

- La pantalla muestra `IpFingerprint`: los primeros 12 hexadecimales del hash. Alcanza para ver que
  cuarenta consultas salieron del mismo lugar, que es la pregunta real de la columna.
- `POST /admin/audit-events/ip-fingerprint` recibe una dirección **en el cuerpo**, la hashea con la
  misma pimienta y responde cuántas entradas coinciden. La dirección no se guarda en ninguna parte
  —tampoco en la entrada de bitácora que el propio cotejo escribe, que registra la huella y el
  número de coincidencias.
- El filtro del listado viaja como `ipHash` (64 hexadecimales), que sí puede ir en la URL: es
  irreversible y no identifica a nadie.

### Por qué POST

Cambia nada y por método debería ser GET. Una dirección es dato personal y el dato personal no viaja
en una URL, donde queda escrito en cada log de proxy, en el historial del navegador y en el
`Referer`. La regla de privacidad gana sobre el verbo.

### Qué entrega y qué no

Sólo confirma o descarta una dirección que el consultante **ya tenía**; nunca produce una. Es la
misma forma que la búsqueda exacta de personas de la v0.26 y tiene el mismo modo de fallo —inofensiva
una vez, herramienta de enumeración si se puede correr diez mil veces—, así que se acota con el mismo
techo por persona (`DirectoryLookupRateLimiter`, contando su propia acción) y queda auditada.

12 hexadecimales son 48 bits: dos direcciones distintas chocan recién en el orden de dieciséis
millones de direcciones distintas en una sola municipalidad, y una colisión cuesta una pista falsa,
no un registro falso — el filtro compara el hash completo.

---

## Consecuencias

- La pantalla de auditoría responde las cinco preguntas del pliego sin que nadie tenga que traducir
  un UUID ni leer una cabecera `User-Agent` de cuatrocientos caracteres.
- `DeviceSummary` es un resumen derivado **al leer**: mejorarlo cambia lo que dice la pantalla y no
  puede cambiar lo que la cadena demuestra. Por eso `user_agent` sigue guardado tal cual —es la
  evidencia— y sigue fuera del digest del sello.
- Aparece una dependencia nueva: la vista de auditoría lee `users`. Es lectura, por página, y con el
  id ya restringido al tenant por la propia consulta de auditoría.
