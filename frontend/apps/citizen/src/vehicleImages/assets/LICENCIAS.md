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

## Las motocicletas — INCORPORADAS Y RETIRADAS el 22-10-2026

| | |
|---|---|
| **Origen** | Paquete `LuParX_Motocicletas_10_Colores_Propuesta.zip`, entregado por Javier Li el 22-10-2026 por la noche |
| **Qué son** | Diez recortes de 480×320 de **una lámina generada con inteligencia artificial**, con el fondo oscuro incrustado. Son la misma moto recoloreada diez veces, en vista de tres cuartos frontal. Lo dice el propio LEEME del paquete, con estas palabras: «NO son renders individuales transparentes ni activos finales aprobados para producción» |
| **Uso autorizado** | Recursos de **prototipo**, igual que los 100 automóviles. El paquete se entregó, en su propia letra, «para que Javier y Claude puedan probar inmediatamente el cableado y evaluar el estilo» |
| **Qué NO se puede afirmar** | Que representan una marca o un modelo. El dibujo recuerda a una naked de baja cilindrada, pero el catálogo no afirma marca ni modelo: sólo tipo y color |
| **Procesado aplicado** | **No se recortó la moto**: se restó el fondo. Se estima el campo del plató, se calcula una opacidad continua por píxel y se resta el campo sólo donde esa opacidad es baja, dejando el azul de la biblioteca (17,34,48) en el plató y la moto intacta. Después, relleno hasta la proporción 560:266 y reescalado. Ningún retoque del color de la moto |
| **Qué se incorporó** | 9 de los 10: rojo, verde, azul, negro, blanco, plata, gris, beige y naranja. `moto-amarillo.webp` **no** se incorporó porque `amarillo` no es un color de esta biblioteca; el archivo queda en el paquete entregado. No hay `moto-azul-oscuro`, y no hace falta: ningún color del servidor produce ese nombre |
| **Estado** | **RETIRADAS.** Estuvieron en `../prototipo/assets/` desde la noche del 22-10-2026 hasta la tarde siguiente. Una motocicleta se dibuja |
| **Por qué se retiraron** | En un hueco 2:1, un recorte de tres cuartos frontal deja la moto en el **40% del ancho**, dentro de un recuadro visible, al lado de automóviles que llenan el suyo. No es el fondo —eso se corrigió y se midió— sino el encuadre, y no tiene arreglo por software |
| **Qué las traería de vuelta** | Un paquete con la moto **de perfil** (1,85:1 llena un hueco 2:1) o **con fondo transparente**. Volver es dejar los archivos en la carpeta: la regla de búsqueda no cambió |
| **Pendiente** | Si vuelven, el conflicto de la línea siguiente sigue en pie |

> **CONFLICTO, anotado y sin resolver.** La sección «Lo que no entra» de este mismo archivo excluye
> los renders generados por inteligencia artificial. Estas nueve imágenes **lo son**, por
> declaración del paquete que las trajo. Se incorporan igual porque Javier lo autorizó el
> 22-10-2026 y porque su estatus es el de **prototipo**, el mismo que el de los 100 automóviles,
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
