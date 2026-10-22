# Biblioteca de prototipo — 100 automóviles

10 carrocerías × 10 colores, entregadas por Javier el **22-10-2026** en el paquete
`LuParX_100_Vehiculos_Matching_Claude_COMPLETO.zip`.

Las **9 motocicletas** de `LuParX_Motocicletas_10_Colores_Propuesta.zip` entraron esa noche y se
retiraron a la tarde siguiente; la sección «Las motocicletas» explica por qué y qué haría volver a
incorporarlas. Una motocicleta se dibuja.

## Qué son, con las palabras del propio paquete

> «100 WebP derivadas de 10 recortes de láminas de referencia. Fondo integrado, recoloración
> aproximada; NO renders individuales originales ni transparencia. Revisar antes de producción.»
> — `vehicles.manifest.json`

**Son recursos de prototipo, no fotografías oficiales de ningún fabricante.** La orden del
22-10-2026 lo dice en letra y así se tratan: ninguna imagen afirma marca ni modelo, sólo **forma**
y **color**, que es exactamente lo que ya afirmaba el dibujo `VehicleThumb`.

## Qué se les hizo al incorporarlas

1. **Recorte del 5% inferior.** 40 de las 100 traían incrustada una tira de muestras de color —diez
   círculos— debajo del vehículo. Medido antes de recortar: ninguna rueda ni sombra baja de esa
   línea en ninguna de las 100.
2. **Reescalado de 900×450 a 560×266** y re-codificación WebP calidad 82. De 3,2 MB a 1,4 MB en
   total, 14 KB de media. La miniatura más grande que dibuja la aplicación mide unos 280 px de
   ancho, así que 560 cubre pantallas de alta densidad con margen.

No se retocó ningún color: lo que se ve es lo que vino.

## Las motocicletas: entregadas, incorporadas y retiradas el mismo día

Llegaron en su propio paquete, con sus propias palabras:

> «Son recortes de una lámina generada con IA, con fondo oscuro integrado; NO son renders
> individuales transparentes ni activos finales aprobados para producción.»
> — `LEEME.md` del paquete de motocicletas

Se incorporaron por la noche y **se retiraron a la tarde siguiente**. Las tres cosas están escritas
acá porque la razón de retirarlas es la que hay que leer antes de volver a intentarlo.

### Lo que se intentó, en orden, y qué midió cada intento

1. **Tal cual.** 480×320 es 3:2 y la casilla es 2,105:1, así que `object-fit: contain` dejaba la
   imagen al 75% del ancho con dos bandas del marco a los lados. El fondo entregado, medido, era
   `rgb(19,27,36)` contra `rgb(17,34,48)` de los automóviles: un parche gris entre coches.
2. **Recortar la moto del plató.** Por umbral, el halo entraba en el recorte y dejaba un rectángulo
   de luz. Por relleno por inundación, quedaba un canto. Con **GrabCut**, la moto se destroza: se
   come ruedas y motor, porque sus partes oscuras y el plató oscuro son el mismo color.
3. **Restar el fondo y rellenar.** Es lo que llegó a staging. Dejó un **rectángulo vertical más
   oscuro**: en las 18 filas de arriba, el relleno estaba en `(18,33,48)` y el fondo de la
   fotografía bajaba a `(10.6,28.1,43.6)`.
4. **Restar el fondo con la opacidad en cero fuera del sujeto, fundir la fotografía con caída
   elíptica y usar la viñeta real de los coches.** Esto sí arregló el fondo: la correlación del
   perfil del fondo contra el de un automóvil pasó de **−0,73** a **+0,92 … +0,95**.

### Por qué aun así se retiraron

Porque el fondo no era el único problema, y el que quedaba no tiene arreglo por software: **la moto
ocupa el 40% del ancho de la casilla**. Está fotografiada de tres cuartos frontal y es estrecha;
llenar el ancho exigiría recortarle las ruedas o los espejos. A tamaño real —98 px de casilla en un
teléfono de 390— eso se ve como una moto diminuta dentro de un recuadro, al lado de automóviles que
llenan el suyo.

El **dibujo** `VehicleThumb` no tiene ese problema: es un SVG sin fondo, así que no hay recuadro
posible, y con su ventana propia ocupa el 72% del ancho. Es mejor activo que la fotografía para
esta casilla, y es el que manda desde el 22-10-2026 por la tarde.

### Qué haría volver a las fotografías

Un paquete con la moto **de perfil** —una moto de perfil es 1,85:1 y sí llena un hueco 2:1— o, aún
mejor, **con fondo transparente**. Con cualquiera de las dos, volver es dejar los archivos en esta
carpeta: la regla de búsqueda no cambió y los nueve nombres siguen siendo los correctos. El
procesado que se usó está en el historial, en el commit que los incorporó.

## Cómo se nombra un archivo

```
carroceria-color.webp        sedan-blanco.webp · suv-compacta-azul-oscuro.webp
```

Carrocerías: `sedan` `suv-compacta` `pickup` `hatchback` `suv-grande` `coupe` `minivan`
`van-comercial` `electrico` `suv-premium` `moto`.

Colores: `blanco` `plata` `gris` `negro` `rojo` `azul` `azul-oscuro` `verde` `beige` `naranja`.

El nombre se parte probando cada carrocería como prefijo, **no por el último guion**:
`suv-compacta-azul-oscuro` tiene tres guiones y tanto la carrocería como el color llevan uno dentro.

## Qué parte del catálogo es alcanzable desde un dato real

El contrato del servidor ofrece **mucho menos** de lo que la biblioteca tiene, y esto hay que
leerlo antes de tocar nada:

| | Biblioteca | Servidor (`VehicleType` / `VehicleColor`) |
|---|---|---|
| Carrocerías | 10 | **2 tipos**: `CAR` y `MOTORCYCLE` |
| Colores | 10 | **12** |

`V16_0__vehicle_type_car_or_motorcycle` retiró `PICKUP`, `VAN` y `OTHER` porque ninguna tarifa,
ningún reporte y ninguna regla de fiscalización los distinguía.

**La consecuencia es la que manda el diseño:** una pick-up, una SUV y un hatchback llegan todos
como `CAR`, así que **`POR_MODELO` es la única vía** para saber qué forma tiene un vehículo. No es
un refinamiento opcional: sin esa tabla, las imágenes de `pickup`, `van-comercial`, `minivan` y
`hatchback` no las alcanzaría ningún vehículo real.

Hoy la tabla tiene **253 modelos**, agrupados por carrocería:

| Carrocería | Modelos |
|---|---|
| suv-compacta | 72 |
| sedan | 36 |
| hatchback | 35 |
| pickup | 29 |
| suv-grande | 29 |
| van-comercial | 25 |
| minivan | 14 |
| electrico | 13 |

Los sedanes son casi todos redundantes —el sedán ya es el respaldo— y están igual, para dejar
dicho que el modelo se consideró. El recuento lo imprime `prototipo.check.mjs` en cada corrida, así
que si alguien agrega o quita, el número de acá se nota desactualizado.

### Cobertura, contada por `prototipo.check.mjs` y no afirmada de memoria

**9 de las 24 combinaciones** tipo×color que el servidor puede producir muestran fotografía:

- **`CAR`** × los 9 colores que la biblioteca tiene → imagen, con la forma que dé su modelo o con
  la carrocería que haya elegido su dueño;
- **`CAR`** × `YELLOW`, `BROWN`, `OTHER` → dibujo: la biblioteca no trae esos colores;
- **`MOTORCYCLE`** × los 12 → **dibujo siempre**, por la decisión de la tarde del 22-10-2026.

Que la moto vaya dibujada no es un hueco que haya que tapar: para esta casilla el dibujo es el
mejor activo que hay, y la sección «Las motocicletas» dice con qué se reemplazaría.

Las 7 carrocerías utilizables se alcanzan todas: `sedan`, `suv-compacta`, `pickup`,
`van-comercial`, `minivan`, `hatchback`, `electrico`.

Queda **una** imagen por color sin usar, `azul-oscuro`: el catálogo del servidor no distingue azul
de azul marino y no se fuerza la equivalencia.

### Un aviso que cuesta caro ignorar

La primera versión de estas tablas se escribió leyendo `packages/api-client/src/mocks/data.ts` —el
transporte simulado— en vez de los enums del backend. Ese archivo llevaba **dieciocho versiones**
desactualizado: declaraba cinco tipos y ocho colores. El resultado fue que las veinte imágenes de
`pickup` y `van-comercial` eran inalcanzables y que un carro beige o naranja caía al dibujo
teniendo su imagen. **Ninguna prueba lo vio, porque todas corren contra esa misma transcripción.**

**Si cambia un enum del backend, cambia `mocks/data.ts` en el mismo commit.**

## Las tres carrocerías que hoy NO se usan

Revisadas a tamaño legible las 70 combinaciones alcanzables, tres filas salieron mal recoloreadas:

| Carrocería | Qué pasa | Se sustituye por |
|---|---|---|
| `coupe` | blanco, plata y gris salen **rosa** | `sedan` |
| `suv-grande` | blanco, plata y gris salen **casi negros** | `suv-compacta` |
| `suv-premium` | blanco, plata y gris salen **verde oscuro** | `suv-compacta` |

La sustitución está en `EQUIVALENCIAS`, en `catalogoPrototipo.ts`. **Vaciar ese objeto las vuelve a
habilitar**: los archivos siguen en la carpeta y no hay que tocar nada más.

Por qué sustituir y no caer al dibujo: las diez carrocerías ya son una generalización —un RAV4 y un
Tucson comparten imagen—, así que representar un Prado con la SUV compacta está dentro de lo que la
biblioteca ya afirma. Pintar de negro un carro blanco no lo está.

## Defectos menores, conocidos y no corregidos

- **`verde` tira a turquesa** en las diez carrocerías.
- **`azul`** muestra bloques de recoloración visibles en `sedan`, `suv-compacta`, `minivan` y
  `van-comercial`.
- **`rojo`** tira a rosa-frambuesa en varias carrocerías.
- **`naranja`** se lee amarillo mostaza, pero no es alcanzable desde el servidor.

No se tocaron: corregirlos a mano sería retocar activos que no son nuestros, y la orden pide
tratarlos como prototipo. Se documentan para que la decisión sea de Javier.

## El día que lleguen fotografías con licencia

Van a la carpeta **`../assets`**, no a ésta, con su convención propia (`marca__modelo__años__color`)
y su fila en `../assets/LICENCIAS.md`. El componente las prefiere automáticamente: primero la foto
con licencia del modelo concreto, después el prototipo por carrocería, y al final el dibujo.
