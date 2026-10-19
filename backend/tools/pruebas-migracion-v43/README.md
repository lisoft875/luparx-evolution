# Prueba de migración y aislamiento municipal · V43_0

Lo que esta carpeta contiene es **exactamente** lo que se ejecutó el 16-10-2026 sobre una base
PostgreSQL 16 + PostGIS 3.4 aislada y desechable, con respaldo previo. 21 afirmaciones, todas en
verde. No se tocó staging, ni producción, ni ninguna base compartida.

```bash
cd backend/tools/pruebas-migracion-v43
bash correr.sh
```

Por omisión usa `127.0.0.1:5442`, usuario `luparx` y una base **desechable** llamada
`luparx_pruebas_v43`. El script **se niega** a correr contra un host que no sea local y a borrar una
base cuyo nombre no contenga «pruebas» o «test»: crea y destruye la base, así que esa negativa es
parte de la prueba.

## Qué comprueba, y por qué cada cosa

| Bloque | Lo que mide |
|---|---|
| **A · marcado y aislamiento** | Que la V43_0 marque `DEMO`/`REJECTED` **sólo** la zona de San José cuyo polígono es el literal de la V41_0. Siembra a propósito **otra municipalidad con el mismo código de zona y el mismo polígono**: ésa NO se marca, que es la cláusula de inquilino que a la V41_0 le falta. Una zona redibujada tampoco se marca. Ningún polígono se borra |
| **B · una DEMO no asciende** | Los cinco rechazos de la base: el CHECK del estado, el **disparador de la transición**, el `VERIFIED` sin firma, la procedencia sin geometría y el estado inventado |
| **C · el camino legítimo** | Que redibujar una DEMO la convierta en dibujo del portal y entonces sí se apruebe; y que redibujar una zona **ya aprobada** degrade el sello en el mismo `UPDATE` |
| **D · el mapa del ciudadano** | Con la consulta real del repositorio: San José sin verificadas sale **vacío**, cada municipalidad ve sólo lo suyo, y la proyección devuelve procedencia, estado y fecha ISO-8601 |

## El hallazgo que esta prueba produjo

La primera versión del esquema confiaba sólo en el CHECK
`ck_parking_zones_geom_demo_never_verified`, y la documentación afirmaba que con eso «un `UPDATE` a
mano no puede saltárselo». **Al ejecutarlo, resultó falso**: un `UPDATE` que en la misma sentencia
reescribe la procedencia y pone `VERIFIED` pasa el CHECK sin ruido, porque la fila que queda ya no
dice `DEMO`. Un CHECK sólo ve la fila resultante.

Lo que lo cierra es el disparador `trg_parking_zones_demo_never_verified`, que sí ve la fila de
antes: una DEMO no puede quedar `VERIFIED` **si el polígono no cambió en esa misma sentencia**. Eso
es literalmente la regla de negocio — para volverla oficial hay que redibujarla o importarla — y la
afirmación del bloque B que dice «rebautizarla Y aprobarla en la misma sentencia se rechaza» es la
que se puso roja primero.
