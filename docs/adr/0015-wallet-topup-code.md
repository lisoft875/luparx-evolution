# 0015 — Código de recarga dedicado (en vez de la cédula) para acreditar saldo en caja

- **Estado**: Aceptado
- **Fecha**: 2026-09-09

## Contexto

El usuario quiere que un ciudadano pueda recargar su saldo en la caja de un supermercado dictando un
identificador. La propuesta inicial fue "número de identificación + id de la municipalidad".

Una caja es un lugar público: lo que se dicta lo escucha quien esté detrás en la fila, el cajero lo
teclea de oído y la transcripción queda en el sistema del comercio. Cualquier identificador que se
use ahí hay que diseñarlo asumiendo que **se filtra**.

## Alternativas consideradas

1. **Número de identificación (cédula) + municipalidad.** Es un dato personal, en Costa Rica es
   además la llave de medio país, y quien conozca la cédula de otra persona puede sondear su cuenta y
   —peor— acreditarle plata para blanquear un pago. Rechazada.
2. **El identificador interno del usuario (UUID).** No es adivinable, pero tiene 36 caracteres: nadie
   lo dicta en una caja, y no tiene dígito verificador, así que un error de tecleo o no encuentra
   nada o encuentra a otra persona. Rechazada.
3. **Un código corto derivado de datos del usuario** (hash de la cédula, por ejemplo). Sigue siendo
   un dato personal transformado: no se puede rotar sin cambiar la cédula, y un catálogo de hashes lo
   vuelve reversible. Rechazada.
4. **Un código dedicado, aleatorio, por (municipalidad, usuario), con dígito verificador (elegida).**

## Decisión

- Tabla `wallet_topup_codes`, una fila por municipalidad y persona. La billetera es por municipalidad
  y el código que la acredita también.
- **Formato**: 8 caracteres aleatorios (`SecureRandom`) + 1 carácter de verificación, mostrado como
  `XXX-XXX-XXX`. El agrupamiento es de presentación; se almacena y se compara sin guiones.
- **Alfabeto**: base 32 de Crockford — dígitos y letras **sin I, L, O ni U**. Las tres primeras se
  quitan porque son las que una persona confunde al dictar o al escribir a mano (O con cero, I y L
  con uno) y la cuarta para que un código aleatorio no forme una palabra soez. Como O, I y L no
  existen en el alfabeto, `0` y `1` dejan de tener homógrafo, y la lectura es tolerante: quien teclea
  O obtiene 0, y quien teclea I o L obtiene 1. Mayúsculas y minúsculas dan igual.
- **Dígito verificador**: Luhn mod N (N = 32) sobre el mismo alfabeto. Detecta **todo error de un
  solo carácter** y toda transposición de caracteres adyacentes salvo un par que difiera exactamente
  en 16 posiciones del alfabeto — la limitación conocida de Luhn con base par. Un error de
  transcripción falla en la caja, antes de que se mueva dinero, en vez de acreditarle a otra persona.
- **Espacio**: 32^8 ≈ 1.1×10^12 por municipalidad. La enumeración a un intento por segundo tardaría
  treinta mil años, y además el endpoint de resolución exige `PERM_WALLET_TOPUP` y queda auditado.
- **No deriva de ningún dato personal** y es **rotable**: `POST /citizen/wallet/topup-code/rotate`
  reemplaza el código y el anterior deja de funcionar en el acto, sin período de gracia — quien rota
  lo hace porque cree que lo escucharon, y mantener vivo el viejo "unos minutos" lo mantendría vivo
  justo en la ventana que importa.
- **La resolución en caja devuelve el mínimo**: nombre de pila, inicial del primer apellido,
  municipalidad y moneda. Nunca el saldo, el correo, el teléfono ni el documento. El cajero necesita
  confirmar "¿Ana M., San José?" en voz alta; no necesita —ni debe ver— la cuenta detrás.

## Consecuencias / trade-offs

- Un código por municipalidad significa que quien pertenece a cinco tiene cinco códigos. Es el precio
  de que la billetera sea por municipalidad (v0.2, regla 5): un código único global permitiría
  acreditar en la municipalidad equivocada, que es un error mucho más caro de deshacer.
- Nueve caracteres son más largos que un PIN de cuatro, y eso es deliberado: cuatro dígitos serían
  enumerables por un cajero curioso en una tarde.
- Rotar deja boletas de caja viejas apuntando a un código que ya no existe. Por eso la conciliación
  se hace por `wallet_transactions.external_reference` (la referencia del comercio) y no por el
  código.
- El código se crea **cuando se necesita** (al abrir la billetera en esa municipalidad), no al
  registrarse: nadie acumula códigos de municipalidades donde nunca estacionó y no hay que rellenar
  nada para las cuentas que ya existen.

## Impacto de migración

`V18_0` sólo agrega la tabla; ninguna fila existente cambia. Las cuentas que ya existen reciben su
código la primera vez que abren la billetera.

## Rollback

Revertir la aplicación basta: la tabla queda sin uso. Si además se elimina, se pierden los códigos y
cada ciudadano recibe uno nuevo la próxima vez — molesto, no destructivo, porque el código no es
parte de ningún registro contable (la conciliación va por `external_reference`).
