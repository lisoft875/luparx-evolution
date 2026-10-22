# Biblioteca de prototipo — 109 vehículos

**100 automóviles** (10 carrocerías × 10 colores) entregados por Javier el **22-10-2026** en el
paquete `LuParX_100_Vehiculos_Matching_Claude_COMPLETO.zip`, más **9 motocicletas** entregadas esa
misma noche en `LuParX_Motocicletas_10_Colores_Propuesta.zip`.

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

## Las motocicletas, y por qué se procesaron distinto

Llegaron en su propio paquete, con sus propias palabras:

> «Son recortes de una lámina generada con IA, con fondo oscuro integrado; NO son renders
> individuales transparentes ni activos finales aprobados para producción.»
> — `LEEME.md` del paquete de motocicletas

Venían en **480×320 con su propio fondo y un halo de color** detrás de la moto. Tal cual, en la
casilla de la tarjeta —que es 2:1 sobre `#0e2135`— se veían como un recuadro más claro con bandas
a los lados: 3:2 dentro de 2:1 deja un 25% de hueco, y el fondo entregado, medido, era
`rgb(19,27,36)` contra `rgb(17,34,48)` de los 100 automóviles. Un parche gris entre coches.

**No se recortó la moto.** Se intentó dos veces y las dos se vieron mal en la casilla real:
recortar por umbral metía el halo dentro del recorte, y recortar por relleno por inundación dejaba
un canto donde el fondo del recorte no coincidía con el del lienzo. La causa está medida: el plató
de estas fotografías **no es liso** —tiene viñeta— y en el propio fondo la distancia al campo
estimado tiene un percentil 90 de entre 36 y 77 niveles. Con esos números no hay máscara binaria
que separe plató de moto sin comerse partes de ella. Recortar aquí sería inventar un contorno.

Lo que se hizo en cambio fue **restar el fondo**, no separarlo:

1. **Estimar el campo de fondo**: difuminado normalizado de lo que sí es fondo, extendido por
   debajo de la moto. Ese campo contiene la viñeta del plató y el halo de color, porque las dos
   cosas son suaves.
2. **Calcular una opacidad continua** por píxel según cuánto se aparta del campo. El plató se
   aparta poco; la moto, mucho.
3. **Restar el campo sólo donde la opacidad es baja**: `salida = original − (1−α)·(campo − fondo
   de la biblioteca)`. En el plató queda el azul de la biblioteca plano; en la moto no se toca ni
   un píxel.
4. **Rellenar a la proporción 560:266** con ese mismo azul y reescalar. Sin el relleno,
   `object-fit: contain` dejaba la imagen al 75% del ancho con dos bandas del marco a los lados.

La moto ocupa entre el 89% y el 96% del alto de la casilla, igual que los automóviles. A lo ancho
ocupa un 40% y no un 90%, y es correcto: está fotografiada de tres cuartos frontal y es estrecha.
Lo que iguala el tamaño percibido en una lista es el alto, no el ancho.

**Lo que queda sin resolver:** un halo tenue pegado al contorno de la moto, donde el campo no puede
distinguir el reflejo del plató del reflejo en la moto. Se deja ahí a propósito. Lo que lo
arreglaría de verdad es que los activos vinieran **con fondo transparente**; mientras no sea así,
esto es lo máximo que se puede hacer sin inventar un contorno.

**El color de la moto no se tocó.** Y conviene decirlo: su `rojo` sale a 359° de tono y su `verde`
a 111°, es decir, rojo y verde de verdad, mientras que los automóviles de la biblioteca tienen el
`rojo` en 347° —rosa frambuesa— y el `verde` en 163° —turquesa—. Las motos están **mejor** que los
coches en los dos colores que más se quejan.

Se incorporaron **9 de los 10**. `moto-amarillo.webp` quedó fuera: `amarillo` no es un color de
esta biblioteca, y un archivo con un nombre fuera de la convención se perdería en silencio.
`moto-azul-oscuro` no vino y no hace falta: ningún color del servidor produce ese nombre.

Su procedencia y el conflicto que arrastran —el paquete declara origen de IA, y `LICENCIAS.md`
excluye los renders de IA— están escritos en `../assets/LICENCIAS.md`. Antes de producción eso hay
que resolverlo.

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

**18 de las 24 combinaciones** tipo×color que el servidor puede producir muestran imagen:

- **`CAR`** × los 9 colores que la biblioteca tiene → imagen, con la forma que dé su modelo;
- **`MOTORCYCLE`** × esos mismos 9 colores → imagen, desde la noche del 22-10-2026;
- **`CAR`** y **`MOTORCYCLE`** × `YELLOW`, `BROWN`, `OTHER` → dibujo: la biblioteca no trae esos
  colores, y el dibujo sí los tiene desde el 22-10-2026.

Hasta esa noche las doce combinaciones de moto caían al dibujo, y era el hueco más grande que
quedaba: la moto no es un caso marginal, es el único tipo que el producto distingue, porque es el
que las municipalidades tarifan distinto.

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
