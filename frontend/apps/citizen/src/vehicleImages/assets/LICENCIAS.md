# Licencias de las imágenes de vehículos

Una fila por archivo. Un archivo sin fila es un archivo que hay que sacar de la carpeta.

**Esta carpeta es la de las FOTOGRAFÍAS CON LICENCIA por marca y modelo.** Las 100 imágenes de
prototipo del 22-10-2026 no viven acá sino en `../prototipo/assets`, y su procedencia está abajo,
en su propia sección.

| Archivo | Origen | Licencia | Permite uso comercial | Agregado | Por |
|---|---|---|---|---|---|
| *(vacío)* | | | | | |

## La biblioteca de prototipo (`../prototipo/assets`, 100 archivos)

| | |
|---|---|
| **Origen** | Paquete `LuParX_100_Vehiculos_Matching_Claude_COMPLETO.zip`, entregado por Javier Li el 22-10-2026 |
| **Qué son** | 100 variantes cromáticas procesadas automáticamente a partir de 10 recortes de una lámina de diseño. No son 100 renders originales |
| **Calidad declarada** | `PROTOTYPE_COMPOSITE_RECOLORED` (el propio manifiesto del paquete) |
| **Uso autorizado** | Recursos de **prototipo**. La orden del 22-10-2026 lo dice en letra: «Tratar las imágenes como recursos de prototipo, no como fotografías oficiales de fabricantes» |
| **Qué NO se puede afirmar** | Que representan un modelo concreto, una marca o un vehículo real. No afirman marca ni modelo, sólo forma y color |
| **Procesado aplicado** | Recorte del 5% inferior (tira de muestras incrustada) y reescalado a 560 px. Ningún retoque de color |
| **Pendiente** | El propio paquete dice que **no están aprobadas para producción**. Antes de producción hace falta la decisión de Javier sobre si se reemplazan por activos con licencia |

## Las motocicletas — INCORPORADAS, RETIRADAS Y DEVUELTAS el 22-10-2026

| | |
|---|---|
| **Origen** | Paquete `LuParX_Motocicletas_10_Colores_Propuesta.zip`, entregado por Javier Li el 22-10-2026 por la noche |
| **Qué son** | Diez recortes de 480×320 de **una lámina generada con inteligencia artificial**, con el fondo oscuro incrustado. Son la misma moto recoloreada diez veces, en vista de tres cuartos frontal. Lo dice el propio LEEME del paquete, con estas palabras: «NO son renders individuales transparentes ni activos finales aprobados para producción» |
| **Uso autorizado** | Recursos de **prototipo**, igual que los 100 automóviles. El paquete se entregó, en su propia letra, «para que Javier y Claude puedan probar inmediatamente el cableado y evaluar el estilo» |
| **Qué NO se puede afirmar** | Que representan una marca o un modelo. El dibujo recuerda a una naked de baja cilindrada, pero el catálogo no afirma marca ni modelo: sólo tipo y color |
| **Defecto medido del archivo entregado** | El lienzo es 480×320 pero la fotografía son **~282×311**: el **41% del ancho es relleno azul `rgb(19,27,36)` incrustado**. Además asoman trozos de las motos vecinas de la lámina y a las dos ruedas les falta la parte baja del neumático |
| **Procesado aplicado** | **No se recortó la moto** —medido: no es posible, es negra sobre un plató oscuro, y GrabCut se come ruedas y espejos—. Se recorta el lienzo a la fotografía (fuera el 41% de relleno), se estima el plató gris, se estima el plató azul promediando cuatro archivos de automóvil y se **suma la diferencia** sólo donde el píxel se parece al plató, con transición suave. El relleno hasta 560×266 es ese mismo campo azul, así que no hay costura. Ningún retoque del color de la moto |
| **Qué se incorporó** | 9 de los 10: rojo, verde, azul, negro, blanco, plata, gris, beige y naranja. `moto-amarillo.webp` **no** se incorporó porque `amarillo` no es un color de esta biblioteca; el archivo queda en el paquete entregado. No hay `moto-azul-oscuro`, y no hace falta: ningún color del servidor produce ese nombre |
| **Estado** | **EN USO** desde la tarde del 22-10-2026, reprocesadas. Entre medias estuvieron retiradas unas horas por el tamaño aparente, antes de medir el relleno |
| **Lo que sigue sin resolverse** | La moto mide **226×252 px dentro de un lienzo de 560×266**: el 40% del ancho. Es de tres cuartos frontal y casi cuadrada (0,90:1) contra una casilla 2:1, así que el tope geométrico es el 45% y **no depende del procesado** |
| **Qué lo cerraría** | Un archivo por color **de perfil** (1,85:1 llena un hueco 2:1 al 93%), **con fondo transparente**, la moto entera y al menos 560 px de ancho. Sustituir es dejar los archivos en la carpeta: la regla de búsqueda no cambia |
| **Pendiente** | El conflicto de la línea siguiente sigue en pie |

> **CONFLICTO, anotado y sin resolver.** La sección «Lo que no entra» de este mismo archivo excluye
> los renders generados por inteligencia artificial. Estas nueve imágenes **lo son**, por
> declaración del paquete que las trajo. Se incorporan igual porque Javier lo autorizó el
> 22-10-2026 —y lo reiteró esa tarde, por escrito, al pedir que la moto volviera a ser una
> fotografía— y porque su estatus es el de **prototipo**, el mismo que el de los 100 automóviles,
> que tampoco están aprobados para producción. Lo que esto NO resuelve es la publicación: antes de
> producción hay que decidir si se reemplazan por activos con licencia o si se levanta esa regla
> por escrito. Mientras no se decida, esta nota se queda acá.

## Qué anotar en cada columna

- **Origen**: el banco de imágenes, el proveedor o el estudio. Con el enlace a la ficha de compra
  o al recibo si lo hay.
- **Licencia**: el nombre exacto de la licencia y, si aplica, el número de la orden de compra.
- **Permite uso comercial**: una municipalidad cobrando por estacionar **es** uso comercial. Si la
  licencia no lo permite, la imagen no entra.
- **Agregado**: la fecha.
- **Por**: quién la agregó, para poder preguntarle.

## Lo que no entra, por más que se vea bien

- Fotos sacadas de un buscador, del sitio de una marca o del configurador de un concesionario.
- Imágenes de un banco gratuito cuya licencia excluya el uso comercial o exija atribución que la
  aplicación no muestra.
- Renders generados por un servicio de inteligencia artificial: la orden del 22-10-2026 lo prohíbe
  en letra, y además el estado legal de esos derechos no está resuelto.
- Logotipos, emblemas o marcas registradas recortadas de otra imagen.
