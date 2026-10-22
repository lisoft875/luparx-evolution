# Imágenes de vehículos

Esta carpeta **es** el catálogo. No hay ninguna lista que mantener: se deja el archivo con el
nombre que manda la convención y la aplicación lo encuentra.

## Cómo se nombra un archivo

```
marca__modelo__años__color.webp
```

Cuatro campos separados por **doble guion bajo**.

| Campo | Qué va | Ejemplos |
|---|---|---|
| marca | minúscula, sin tildes ni espacios | `toyota`, `hyundai`, `volkswagen` |
| modelo | igual | `rav4`, `tucson`, `corolla` |
| años | rango inclusivo de la generación, o `cualquiera` | `2019-2024`, `2015-2015`, `cualquiera` |
| color | la clave del catálogo del servidor en minúscula, o `cualquiera` | `white`, `gray`, `red`, `cualquiera` |

Ejemplos reales:

```
toyota__rav4__2019-2024__white.webp          el RAV4 blanco de esa generación
toyota__rav4__2019-2024__cualquiera.webp     el RAV4 de esa generación, sirva el color que sirva
hyundai__tucson__cualquiera__gray.webp       el Tucson gris, cualquier año
```

Las claves de color son las que devuelve `GET /catalog/vehicle-colors`: `WHITE`, `BLACK`, `GRAY`,
`SILVER`, `RED`, `BLUE`, `GREEN`, `YELLOW`. En el nombre del archivo van en minúscula.

Un archivo mal nombrado se ignora: no rompe la pantalla, pero tampoco aparece. La comprobación
`catalogo.check.mjs` los lista para que no pasen desapercibidos.

## La regla del color

Si el vehículo declara un color y no hay imagen **de ese color**, no se usa la de otro: se dibuja
la silueta, que sí se tiñe del color declarado. Un carro gris con la foto de uno blanco es una
imagen equivocada del carro de esa persona.

Si para un modelo da igual el color —una miniatura de tres cuartos muy pequeña, por ejemplo—, se
nombra el archivo con `cualquiera` en el campo de color y entonces sí se usa para todos. Esa
decisión queda escrita en el nombre del archivo, no en el código.

## Qué imagen sirve

- **Fondo transparente** (WebP o AVIF con canal alfa, o PNG si no hay otra).
- **Tres cuartos frontal**, el mismo encuadre para todas: una de perfil al lado de una de frente se
  ve como un error.
- **Proporción 4:3 aproximada**, que es el hueco que reserva el componente.
- **Ancho máximo 320 px**: la miniatura más grande que dibuja la aplicación mide 75 px de ancho,
  así que 320 cubre pantallas de alta densidad con margen. Más que eso es peso que nadie ve.
- **WebP preferido**: pesa alrededor de un tercio que un PNG equivalente.

## Licencia — léase antes de agregar nada

**Sólo entran imágenes con licencia comercial en orden para este uso.** No se descargan fotos de
internet, de un configurador de una marca, ni de un banco de imágenes sin la licencia comprada.

Por cada archivo que se agregue, anotar en `LICENCIAS.md` —en esta misma carpeta— de dónde salió,
qué licencia tiene y la fecha. Un archivo sin esa fila es un archivo que hay que sacar.

## Hoy esta carpeta está vacía

Y eso es correcto: mientras no haya imágenes con licencia, la aplicación dibuja las siluetas y se
ve exactamente igual que antes. El día que se dejen los archivos, aparecen solos.
