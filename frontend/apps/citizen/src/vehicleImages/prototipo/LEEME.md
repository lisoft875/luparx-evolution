# Biblioteca de prototipo — 100 automóviles

10 carrocerías × 10 colores, entregadas por Javier el **22-10-2026** en el paquete
`LuParX_100_Vehiculos_Matching_Claude_COMPLETO.zip`.

Las **9 motocicletas** de `LuParX_Motocicletas_10_Colores_Propuesta.zip` entraron esa noche, se
retiraron a la tarde siguiente y volvieron reprocesadas el mismo día. La sección «Las motocicletas»
cuenta la vuelta entera, incluido el defecto que no se había visto: **el 41% del ancho de cada
archivo entregado era relleno azul incrustado.**

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

## Las motocicletas: entregadas, retiradas y devueltas reprocesadas

Llegaron en su propio paquete, con sus propias palabras:

> «Son recortes de una lámina generada con IA, con fondo oscuro integrado; NO son renders
> individuales transparentes ni activos finales aprobados para producción.»
> — `LEEME.md` del paquete de motocicletas

### Lo que traía cada archivo entregado, medido sobre los diez

| | |
|---|---|
| Lienzo | 480 × 320 px |
| Fotografía de verdad | **~282 × 311 px**, centrada |
| El resto | **41% del ancho es relleno azul `rgb(19,27,36)` incrustado en el archivo** |
| Fondo de la fotografía | plató gris con viñeta, no el azul `rgb(17,34,48)` de los automóviles |
| Bordes | asoman trozos de las motos vecinas de la lámina, y a las dos ruedas les falta la parte baja del neumático |

**El relleno es el hallazgo que faltaba.** Durante un día entero se dio por sentado que la moto se
veía pequeña por su encuadre de tres cuartos. Lo era en parte, pero antes de eso **más de la cuarta
parte de cada archivo no era fotografía**: era una banda azul que el navegador escala como si fuera
contenido. Quitarla es lo que había que hacer, y es lo que se hizo.

### Lo que se intentó, en orden, y qué midió cada intento

1. **Tal cual.** 480×320 es 3:2 y la casilla es 2,105:1. El fondo entregado era `rgb(19,27,36)`
   contra `rgb(17,34,48)` de los automóviles: un parche gris entre coches.
2. **Recortar la moto del plató.** Por umbral, el halo entraba en el recorte. Por inundación,
   quedaba un canto. Con **GrabCut** —por rectángulo y por máscara— la moto se destroza: se come
   ruedas, espejos y manillar, porque sus partes negras y el plató oscuro son el mismo color.
   Lo mismo con un fondo ajustado por polinomio y con un fondo interpolado desde los bordes.
   **Un recorte con alfa de esta moto no es alcanzable**: está fotografiada en negro sobre oscuro.
3. **Restar el fondo y rellenar.** Es lo que llegó a staging. Dejó un **rectángulo vertical más
   oscuro**: en las 18 filas de arriba, el relleno estaba en `(18,33,48)` y el fondo de la
   fotografía bajaba a `(10.6,28.1,43.6)`.
4. **Restar con máscara de sujeto y viñeta real.** Arregló el fondo —la correlación del perfil
   contra el de un automóvil pasó de **−0,73** a **+0,92 … +0,95**— pero dejaba un recuadro tenue
   y la cola desvanecida. Es la versión que se retiró sin desplegar.
5. **La de hoy, y la que está en la carpeta.** Se recorta el lienzo a la fotografía —fuera el 41%
   de relleno—, se estima el plató gris, se estima el plató azul **promediando cuatro archivos de
   automóvil** y se **suma la diferencia** sólo donde el píxel se parece al plató, con transición
   suave. Lo que queda a los lados hasta 560 px no es un color inventado: es ese mismo campo azul,
   así que no hay costura ni recuadro. Los trozos de las motos vecinas se reconocen como manchas
   que no tocan a esta moto y vuelven a plató.

### Lo que esto NO arregla, y hay que decirlo

**La moto ocupa el 40% del ancho de la casilla, y ahí se queda.** Medido sobre el archivo
terminado: el vehículo mide 226 × 252 px dentro de un lienzo de 560 × 266. Es una moto de tres
cuartos frontal, casi cuadrada (0,90:1), y la casilla es 2:1, así que `object-fit: contain` la
limita por el alto. **El tope geométrico es el 45% del ancho**, y no depende del procesado: con un
recorte perfecto con alfa sería el mismo número.

Lo único que cierra ese hueco es **una moto de perfil**: 1,85:1 llena un hueco 2:1 al 93%. Con
fondo transparente, mejor todavía, porque entonces sobra el traslado de plató entero.

### Qué pedir para cerrarlo del todo

Un archivo por color, **de perfil**, **con fondo transparente**, la moto **entera** (ruedas
completas, sin trozos de otras motos), de al menos 560 px de ancho y proporción cercana a 2:1.
Volver a incorporarlo es dejar los archivos en esta carpeta con los nombres de siempre: la regla de
búsqueda no cambia.

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

**18 de las 24 combinaciones** tipo×color que el servidor puede producir muestran fotografía:

- **`CAR`** × los 9 colores que la biblioteca tiene → imagen, con la forma que dé su modelo o con
  la carrocería que haya elegido su dueño;
- **`MOTORCYCLE`** × esos mismos 9 colores → su fotografía de moto, nunca la de un automóvil;
- **`CAR`** y **`MOTORCYCLE`** × `YELLOW`, `BROWN`, `OTHER` → dibujo: la biblioteca no trae esos
  colores.

Los seis huecos son de color, no de carrocería, y el dibujo que sale en ellos sí tiene silueta de
moto cuando el vehículo es una moto.

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
