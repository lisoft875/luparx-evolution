# 0024 — La zona es un lugar: geometría en PostGIS, GeoJSON en la API

- **Estado**: Aceptado
- **Fecha**: 2026-09-11
- **Contexto del plan**: punto 13, «integración GIS». No supersede a ninguna decisión anterior;
  extiende en lo territorial lo que la [ADR 0008](0008-internationalization-catalogs.md) dejó como
  catálogo administrativo sin contornos.

## Contexto

El punto 13 de la lista de Javier no pide una integración: pide **no tener que rehacer el modelo**
cuando una municipalidad la pida. Es la petición correcta, porque hoy el modelo no tiene dónde poner
un lugar.

Lo que hay al momento de escribir esto:

- **Fiscalización sí guarda coordenadas.** `citations`, `citation_evidence` y `enforcement_checks`
  tienen `latitude`/`longitude` en `numeric(9,6)` con `CHECK` de rango (V17_0, V28_0). Correcto para
  un punto suelto: dónde se levantó una boleta es un dato de la boleta.
- **Lo que un GIS querría no tiene geometría.** Una zona de cobro (`parking_zones`) es un código, un
  nombre y, opcionalmente, el id de un distrito. Una bahía es un código dentro de una zona. El
  `tenants` no tiene límite municipal y `administrative_divisions` —provincias, cantones, distritos—
  no tiene contornos.
- **No hay PostGIS.** La única extensión declarada es `citext` (V1_0).

La consecuencia práctica es que hoy no se puede responder ninguna de las preguntas que aparecen en
cuanto alguien mira un mapa: qué calles cubre esta zona, si esta bahía quedó dentro o fuera de ella,
cuántas boletas se levantaron en esta cuadra, qué zona contiene el punto donde el fiscalizador está
parado.

## Alternativas consideradas

Son dos decisiones independientes, y conviene separarlas porque se suelen confundir.

### Dónde vive la geometría

1. **Columnas numéricas y GeoJSON en `jsonb`.** Sin extensión, sin cambio de imagen, sin nada que
   pedirle a un DBA. Y sin índice espacial ni predicado geométrico: «¿qué zona contiene este punto?»
   se convierte en traer todas las zonas del inquilino y calcular en la aplicación. Es exactamente
   el modelo que habría que rehacer el día que alguien lo pida en serio, que es lo que el punto 13
   quiere evitar.
2. **PostGIS en un esquema espejo**, con la geometría en tablas aparte y las tablas de negocio
   intactas. Aísla la dependencia, y parte cada zona en dos filas que hay que mantener en sintonía:
   dos verdades, dos migraciones y una pregunta nueva cada vez («¿cuál manda?»). Más complejidad que
   la que ahorra.
3. **PostGIS en la tabla de negocio (elegida).**

### Cómo la ve la JVM

1. **`hibernate-spatial` + JTS**, con un `MultiPolygon` de JTS como campo de la entidad. Es el camino
   habitual y da geometría como objeto Java. Trae una dependencia nueva al módulo, un tipo
   contribuido al dialecto, y una segunda representación de la geometría que puede discrepar de la
   columna.
2. **GeoJSON de texto y SQL explícito (elegida).** PostGIS convierte en las dos direcciones
   (`ST_AsGeoJSON`, `ST_GeomFromGeoJSON`) y la aplicación transporta el texto. Ninguna librería de
   geometría entra a la JVM.

## Decisión

**PostGIS desde ahora, geometría en `parking_zones`, y GeoJSON como formato de la API.**

**Esquema (V38_0).** `parking_zones.geom geometry(MultiPolygon, 4326)`, nullable:

- **`MultiPolygon` y no `Polygon`**, porque una zona de cobro discontinua —dos cuadras que no se
  tocan— es lo normal. Elegir `Polygon` obliga a una migración el día que aparezca la segunda pieza.
  La API acepta `Polygon` y el servidor lo promueve con `ST_Multi`, así que quien dibuja una sola
  pieza no paga la decisión.
- **SRID 4326 (WGS84)**, que es lo que emite un GPS, lo que RFC 7946 exige para GeoJSON y lo que
  ArcGIS y QGIS leen sin traducir. Para medir metros se castea a `geography` en la consulta que lo
  necesite; guardar en 4326 mantiene gratis la interoperabilidad, que es el objetivo.
- **Nullable**, porque ya existen zonas sin geometría y una zona sin dibujar cobra igual. `NOT NULL`
  obligaría a inventar un polígono por fila existente: dato falso que después nadie distingue de uno
  real.
- **La validez la exige la base**: `ck_parking_zones_geom_valid` con `ST_IsValid` y `NOT ST_IsEmpty`.
  Un polígono autointersectado entra sin chistar en un `INSERT` ingenuo y después hace que
  `ST_Contains` conteste cosas sin sentido; el momento de rechazarlo es al escribirlo. Y el rango de
  coordenadas también (`ck_parking_zones_geom_bounds`), porque el SRID 4326 **no** acota valores:
  una longitud de 500 grados es geometría válida para PostGIS y un error de captura para cualquiera.
- **Índice GiST parcial** (`WHERE geom IS NOT NULL`): hoy todas las filas son NULL, y una zona sin
  dibujar nunca es respuesta de una consulta geométrica.

**La geometría no entra a la JVM.** El repositorio tiene cuatro consultas nativas y son el único
lugar del código donde aparece geometría. La razón práctica pesa más que la estética: todo predicado
geométrico tiene que ser SQL de todas formas para usar el índice, así que mapear el tipo en Hibernate
habría agregado una dependencia y una representación paralela sin quitar una sola línea de SQL.

**Dos validaciones, y ninguna reemplaza a la otra.** La **forma** del GeoJSON se valida en Java
(`GeoJsonGeometryValidator`), que es lo único capaz de decir *qué campo* está mal: un `Feature` en
vez de una geometría, un anillo sin cerrar, una posición con altitud, una longitud fuera de rango.
La **validez topológica** la dice PostGIS, y cuando la rechaza se le pregunta por qué
(`ST_IsValidReason`) para devolver «Self-intersection at or near point …» en vez de «inválida». Esa
segunda pregunta es una transacción nueva, porque la primera quedó abortada — por eso
`ZoneGeometryService` **no** es `@Transactional`, y está escrito ahí.

**Nada se repara.** Un anillo abierto no se cierra solo y un sentido de giro no se invierte: aceptar
un polígono que el cliente no dibujó es como una zona termina cobrando una calle que nadie aprobó.

**El cuerpo de la API es la geometría misma**, no un envoltorio propio: es lo que produce
`ST_AsGeoJSON`, lo que acepta `ST_GeomFromGeoJSON` y lo que un cliente GIS ya sabe leer.
`PUT` y no `PATCH`, porque una geometría no tiene partes que fundir: lo que llega es el perímetro de
ahora en adelante, y mandarlo dos veces deja el mismo estado.

**El lado de consumo es un `FeatureCollection` acotado por `bbox`**, que es lo que un mapa pregunta
de verdad («qué podría estar en pantalla») y el único predicado que el índice GiST puede contestar.
Sin `bbox` responde todas las zonas dibujadas de la municipalidad, con tope configurable: un endpoint
que puede devolver una colección sin límite está prohibido.

**La bitácora registra el hecho, nunca el polígono.** Un antes y después de dos mil coordenadas en
`audit_events` —tabla que no se puede reescribir desde la v0.32— enterraría el rastro que existe para
ser legible. Quién, cuándo y de qué tamaño es lo que un auditor pregunta. Y es una acción propia
(`PARKING_ZONE_GEOMETRY_UPDATED`) y no una variante de `PARKING_ZONE_UPDATED`: renombrar una zona es
cosmético, mover su perímetro cambia qué calle se cobra.

**LupaRX es la fuente de verdad.** La zona de cobro es una decisión tarifaria y vive donde viven las
tarifas; el GIS de la municipalidad consume. No hay sincronización, ni ids externos, ni conflictos
que conciliar.

## Consecuencias / trade-offs

- (+) El modelo queda diseñado, que es lo que el punto 13 pedía: agregar la geometría de una bahía,
  del límite municipal o de un distrito es **una migración aditiva**, no un rediseño.
- (+) Las preguntas geométricas se vuelven posibles y son baratas: contención, intersección,
  cercanía, con índice.
- (+) Interoperabilidad sin conector: una URL que devuelve GeoJSON la consume QGIS, ArcGIS o
  cualquier librería de mapas.
- (+) Ninguna librería de geometría en la JVM, y una sola definición del formato — la de PostGIS.
- (−) **Dependencia operativa nueva.** La imagen de desarrollo pasa a `postgis/postgis` (cambio en
  sitio: mismo PostgreSQL 16, mismo volumen) y en un Postgres administrado alguien con privilegio
  tiene que habilitar la extensión una vez. Los tres proveedores grandes la traen; el paso no
  desaparece por eso, y está en `docs/RUNBOOK.md`.
- (−) **No hay geometría como objeto Java.** Calcular un área o un centroide en la aplicación no se
  puede: hay que preguntárselo a la base. Es aceptable porque esas preguntas son consultas, no
  reglas de dominio; el día que una regla de negocio necesite geometría en memoria, `hibernate-spatial`
  es la alternativa documentada arriba y entra sin tocar el esquema.
- (−) **La entidad no posee el campo.** La escritura va por sentencia nativa con `version` comparada
  a mano en vez de por el control optimista de Hibernate. Es explícito y se verifica por filas
  afectadas, pero es una segunda manera de escribir la misma tabla y hay que saberlo.
- (−) Sólo las zonas tienen geometría. Una bahía sigue siendo un código, así que «llevame a mi
  espacio» todavía no se puede.

## Qué queda deliberadamente fuera

Cada punto es ahora una migración aditiva y ya no un rediseño, que era el objetivo:

1. **Bahías** (punto, u opcionalmente segmento para cordón de acera) y la validación de que una bahía
   cae dentro de su zona.
2. **Límite municipal** en `tenants`, que permitiría detectar una zona dibujada fuera del cantón.
3. **Contornos del árbol territorial**, para geocodificación inversa sin servicio externo.
4. **Normalizar los `latitude`/`longitude` de fiscalización** a geometría, con lo que «boletas en 50 m
   a la redonda» pasaría a usar índice. Hoy siguen siendo numéricos y se leen igual que antes.
5. **Importar shapefile o GeoJSON** de la municipalidad, con previsualización e informe de lo que
   quedó fuera. Mientras no exista, un perímetro entra por `PUT` — que es suficiente para cargar una
   exportación de su GIS, y es lo que hace falta para que el modelo ya esté listo.
6. **OGC API Features**, para que ArcGIS y QGIS consuman como capa nativa sin que nadie escriba nada.
7. **Pantalla de dibujo** en el portal de administración. Hoy la geometría se carga por API.

## Impacto de migración

Aditivo y sin relleno de datos: una columna nullable, dos `CHECK` y un índice parcial. Ninguna fila
existente cambia y ninguna consulta anterior se ve afectada — `parking_zones` se sigue leyendo por
las mismas rutas, y la geometría sólo viaja por los endpoints nuevos.

El único requisito nuevo es la extensión. `CREATE EXTENSION IF NOT EXISTS postgis` la crea donde el
usuario tenga privilegio y queda en no-op donde un operador ya la habilitó. Donde **no** esté
habilitada y el usuario no pueda crearla, Flyway falla en la `V38_0` y no aplica nada más: un
arranque que se cae, no una base a medio migrar.

## Estrategia de rollback

Revertir el código deja la columna en su sitio, sin nadie que la lea. Una columna nullable que
ninguna consulta toca no cuesta nada, así que **no hay nada que deshacer en la base** y en
particular no hay que hacer `DROP EXTENSION`: borrar la extensión exigiría borrar antes la columna,
que es una migración de contracción y no un rollback.

Para apagar sólo el lado de consumo sin revertir nada, `luparx.geo.max-zones-per-map` acota lo que un
mapa puede pedir.
