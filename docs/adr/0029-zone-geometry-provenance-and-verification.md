# 0029 — De dónde viene un polígono, y quién lo dio por bueno

- **Estado**: Aceptado
- **Fecha**: 2026-10-16
- **Amplía**: [0024](0024-zone-geometry-postgis.md) (la zona es un lugar: geometría en PostGIS)
- **Autorizado por Javier (2026-10-16)**

## Contexto

La 0024 puso geometría en el modelo: `parking_zones.geom`, un `MultiPolygon` en 4326, servido como
GeoJSON. La `V41_0` sembró después **ocho rectángulos de demostración** sobre barrios reales de San
José para que el mapa tuviera algo que dibujar. Su propio encabezado lo dice: *no son catastrales ni
oficiales; no sirven para cobrar, fiscalizar ni resolver un reclamo*.

El problema es que esa advertencia vive en un comentario de SQL. Lo que la API sirve en
`properties` es `code` y `name`, y nada más. **Ningún consumidor puede distinguir un perímetro
oficial de un rectángulo dibujado a ojo**: ni el ciudadano, ni QGIS, ni la propia municipalidad
mirando su portal.

Mientras esa distinción no exista en la base, cualquier intento de hacerla en el cliente es
adivinanza. Llegamos a proponer una: *«cuatro vértices y ángulos rectos, probablemente es demo»*.
Está mal por dos lados a la vez — hay zonas reales rectangulares, y un polígono de demostración se
vuelve irreconocible en cuanto alguien le mueve un vértice — pero sobre todo está mal de raíz: **que
un perímetro sea el límite oficial de una zona de cobro es un hecho administrativo, y ningún cálculo
sobre coordenadas puede establecerlo.**

## Decisión

Cuatro columnas en `parking_zones`, todas aditivas (`V43_0`):

| Columna | Qué responde |
|---|---|
| `geom_source` | de dónde salió: `MUNICIPAL_OFFICIAL`, `GIS_IMPORT`, `ADMIN_DRAWING`, `DEMO` |
| `geom_status` | si alguien lo revisó: `UNVERIFIED`, `PENDING_REVIEW`, `VERIFIED`, `REJECTED` |
| `geom_verified_by` | quién lo aprobó |
| `geom_verified_at` | cuándo |

Y cinco reglas, que son la decisión de verdad.

### 1. El estado lo pone una persona, nunca la forma del polígono

Ninguna regla de este diseño mira vértices. La heurística de rectángulos se retira y no vuelve.

### 2. Una geometría DEMO no asciende a oficial

Tres defensas, y una de ellas la puso una prueba que falló primero.

El `CHECK (geom_source IS DISTINCT FROM 'DEMO' OR geom_status <> 'VERIFIED')` prohíbe el **estado**
«DEMO y aprobada». Escribimos que con eso «un `UPDATE` a mano no puede saltársela», y al ejecutarlo
contra PostGIS resultó falso: un `UPDATE` que en la MISMA sentencia reescribe la procedencia y pone
`VERIFIED` pasa el CHECK sin ruido, porque la fila que queda ya no dice `DEMO`. Un CHECK sólo ve la
fila resultante.

Lo que cierra ese camino es un disparador, que sí ve la fila de antes:
`trg_parking_zones_demo_never_verified` rechaza aprobar una DEMO **si el polígono no cambió en esa
misma sentencia**. Eso es literalmente la regla de negocio: para volver oficial un rectángulo de
demostración hay que redibujarlo o importarlo, y cambiarle el adjetivo no es dibujarlo. Mismo patrón
que `luparx_refuse_mutation()` de la V31_0.

Y el servicio se niega antes, con `ZONE_GEOMETRY_DEMO_NOT_VERIFIABLE`, mirando la procedencia
**guardada** y no la que declara la petición, para que quien lo intente reciba un motivo y no una
violación de integridad.

**Lo que no se pretende:** alguien con acceso directo a la tabla puede reescribir la procedencia en
una sentencia y aprobar en la siguiente. En ese punto ya falsificó el dato; ninguna restricción de
esquema lo impide, y para eso están los permisos de base y la bitácora. Lo que se cierra es el
atajo de un solo paso, que es el que alguien da sin darse cuenta.

Las ocho DEMO **se conservan**. El ambiente de pruebas las necesita; la migración las etiqueta
(`DEMO` / `REJECTED`), no las borra.

### 3. Redibujar degrada el sello

`replaceGeometry` pone `geom_status = 'UNVERIFIED'` y limpia autor y fecha **en el mismo UPDATE** que
escribe el polígono. Sin esto, quien verifica un perímetro correcto y después lo cambia por otro se
queda con la aprobación puesta: es el agujero clásico de todo flujo de aprobación, y se cierra con
cuatro líneas dentro de una sentencia que ya existía. En el mismo UPDATE y no en un segundo, porque
dos sentencias dejan una ventana en la que el polígono nuevo ya está guardado y todavía figura como
aprobado.

### 4. En desarrollo las DEMO se ven, rotuladas

`application-dev.yml` abre el filtro a `VERIFIED,UNVERIFIED,REJECTED`, de modo que en desarrollo el
mapa del ciudadano recibe también las ocho de demostración y se puede trabajar sobre un mapa que
tiene algo dibujado. No las habilita como oficiales y no podría: cada polígono viaja con su `source`
y su `status`, así que una DEMO llega rotulada `DEMO`/`REJECTED`, y las tres defensas de la decisión
2 siguen en pie. Lo que esa línea cambia es **qué se envía**, nunca qué es oficial. En producción no
se pone: rige el valor por omisión, `VERIFIED` a secas.

### 5. El filtro vive en el servidor, y falla cerrado

`luparx.geo.citizen-geometry-statuses`, por omisión `VERIFIED`. El `WHERE` del mapa del ciudadano
añade `AND z.geom_status IN (:estados)`: **una geometría no verificada sencillamente no existe para
el ciudadano**, así que no hay nada que un cliente mal configurado pueda rotular mal ni mostrar de
más. Un valor inventado en la configuración se descarta y se cae a `VERIFIED`; nunca a «todo».

Consecuencia que hay que decir antes y no después: **al cerrar el filtro, el mapa del ciudadano queda
vacío hasta que una municipalidad verifique sus zonas.** Dado que hoy las únicas geometrías que
existen son las ocho de demostración, eso es exactamente lo correcto.

### 6. La evidencia es un evento sellado, no una columna

Verificar o rechazar escribe en `audit_events` —append-only, con la cadena de `audit_seals` por
municipalidad— con la acción, el recurso, el actor, el antes y el después, la procedencia declarada
y la nota de quien revisó. Nunca el polígono: un antes y un después de dos mil coordenadas en una
tabla que no se puede reescribir entierra el rastro que viene a hacer legible. Las dos columnas de la
zona existen sólo para no recorrer la bitácora cada vez que se dibuja una pantalla.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Deducir «es demo» de la forma del polígono | Hay zonas reales rectangulares, y un vértice movido rompe la heurística. Y sobre todo: lo oficial es un hecho administrativo |
| Un tipo `enum` de PostgreSQL | Agregar un valor a un `CHECK` es una migración trivial; a un `enum` no. Es la convención que el repositorio ya usa |
| Una tabla de revisiones aparte | `audit_events` ya es append-only y sellada, y `AUDIT_READ` ya existe. Inventar una segunda bitácora es tener dos que se contradicen |
| Filtrar por estado en el cliente | Confía en que ningún cliente mal configurado muestre de más. El servidor que no envía es más fuerte que el cliente que no pinta |
| Corregir la `V41_0` en su sitio | Ya está aplicada y Flyway valida su suma de verificación. La cláusula de inquilino que le falta va en la `V43_0` |

## Consecuencias

- El mapa del ciudadano queda **vacío** hasta que alguien verifique. Hay que avisarlo antes.
- Una municipalidad grande necesita saber **qué le falta** por verificar. El índice
  `(tenant_id, geom_status)` está puesto; el extremo que lista pendientes queda pendiente.
- **Dibujar y aprobar son dos permisos.** Dibujar exige `TENANT_MANAGE`; aprobar exige
  `ZONE_GEOMETRY_VERIFY`, y el extremo autoriza sobre ese permiso y nunca sobre un nombre de rol.
  Hoy la tabla le da los dos a `TENANT_ADMIN`, porque si no nadie podría verificar nada y el mapa
  quedaría vacío para siempre: la separación está **disponible, no aplicada**. La municipalidad que
  quiera que no apruebe quien dibuja se lo quita a ese rol y se lo da a otro — una línea en
  `RolePermissions`, sin tocar ningún controlador.
- El flujo `PENDING_REVIEW` existe en el vocabulario y **no es alcanzable todavía**: el extremo de
  revisión acepta `VERIFIED` o `REJECTED` y nada más. Mandar a revisión trae su propia pregunta —a
  quién le toca, y qué pasa si nadie contesta— y aceptarlo hoy sólo escribiría en la bitácora una
  «decisión» que no decidió nada.

## Lo que NO cambia

Tarifas, cobros, sesiones de estacionamiento, validación de bahías y `GET /citizen/parking/zones`
siguen exactamente igual. `ParkingSessionService.requireUsableSpace` resuelve por código y compara
`zone_id`: **no mira geometría**. La entidad JPA `ParkingZone` no mapea `geom` ni las columnas
nuevas, así que Hibernate no se entera.
