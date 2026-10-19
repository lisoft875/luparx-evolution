# Pruebas de la prioridad 0: el saldo de PRUEBA no se gasta

Comprueban que **el saldo de prueba no se gasta en una instalación operativa**, en el momento del
gasto y no sólo al arrancar.

Son dos pruebas y hacen cosas distintas, que es la razón de que sean dos:

| Prueba | Qué prueba |
|---|---|
| `PruebaGuardaDeGasto` | la **decisión** pura: `TestMoneySpendGuard` |
| `PruebaGastoConectado` | que la decisión **se consulta de verdad** dentro de `WalletService.charge` |
| `pruebas-gasto-extremo-a-extremo.sh` | el gasto completo contra el backend y PostgreSQL de verdad: concurrencia, idempotencia, rollback y autorización |

La segunda existe porque la primera no alcanza: una guarda bien escrita y no conectada protege
exactamente nada. Eso ya pasó una vez acá (ver el historial de este archivo), y ésta es la prueba
que lo vuelve imposible de volver a creer.

## 1. La decisión pura

Sólo necesita `javac` y `java`. No toca Spring, ni la base, ni la red.

```bash
cd ~/Development/Proyectos/luparx-evolution/backend
javac -d /tmp/guarda \
  app/src/main/java/cr/luparx/app/payments/TestMoneyGuard.java \
  app/src/main/java/cr/luparx/app/payments/TestMoneySpendGuard.java \
  tools/pruebas-guarda-de-gasto/PruebaGuardaDeGasto.java
java -cp /tmp/guarda PruebaGuardaDeGasto
```

Ejecutada el 17-10-2026 con **JDK 21**: **21 comprobaciones, 0 fallos**. Cubre casos positivos,
negativos, la evasión por cambio de perfil, el movimiento DEV que aparece **después** del arranque,
idempotencia y 64 hilos en concurrencia.

## 2. El cableado, contra `WalletService.charge`

Necesita el resto del backend compilado. Con Maven disponible es `mvn -q test-compile` y el
classpath que Maven arma. **Sin Maven** —que es la situación en la que se escribió esto, con Maven
Central bloqueado— sirve el jar que ya está construido, porque trae todas las dependencias adentro:

```bash
cd ~/Development/Proyectos/luparx-evolution/backend

# 1. las dependencias de terceros, del jar ya construido.
#    Se EXCLUYEN los luparx-*.jar: son las clases viejas del propio proyecto y, si quedan en el
#    classpath, ganan sobre las que se están compilando y la prueba mide el código de ayer.
mkdir -p /tmp/lx && cd /tmp/lx
unzip -q -o ~/Development/Proyectos/luparx-evolution/backend/app/target/luparx-app-*.jar 'BOOT-INF/lib/*'
CP=$(ls /tmp/lx/BOOT-INF/lib/*.jar | grep -v luparx | tr '\n' ':')

# 2. todo el backend. `-parameters` NO es opcional: Spring resuelve algunos beans por el NOMBRE del
#    parámetro, y sin esa bandera el contexto no arranca (CorsConfigurationSource ambiguo).
cd ~/Development/Proyectos/luparx-evolution/backend
find . -path '*/src/main/java/*' -name '*.java' > /tmp/lx/fuentes.txt
javac -parameters -nowarn -proc:none -d /tmp/lx/clases -cp "$CP" -encoding UTF-8 @/tmp/lx/fuentes.txt

# 3. la prueba
javac -d /tmp/lx/prueba -cp "$CP/tmp/lx/clases" \
  tools/pruebas-guarda-de-gasto/PruebaGastoConectado.java
java -cp "$CP/tmp/lx/clases:/tmp/lx/prueba" PruebaGastoConectado
```

Ejecutada el 17-10-2026 con **JDK 21**: **21 comprobaciones, 0 fallos**.

**Sin JUnit y sin Spring, a propósito.** Los repositorios son interfaces, así que se implementan con
`java.lang.reflect.Proxy` y contestan sólo lo que la prueba necesita; el `Environment` de Spring
también es una interfaz. La política que se usa es la **real** (`TestMoneySpendPolicySpring`), no una
imitación: la cadena que se ejercita es `WalletService` → `TestMoneySpendPolicySpring` →
`TestMoneySpendGuard`. Convertir las dos pruebas a JUnit cuando Maven funcione es directo y conviene
hacerlo — pero entonces hay que **correrlas**, no darlas por buenas.

Lo que afirma, y por qué cada una importa:

* una billetera limpia se gasta igual que antes (que la guarda no rompió el camino común);
* una billetera con saldo de prueba, en instalación operativa, **se rechaza**, con código propio
  `TEST_MONEY_SPEND_REFUSED` y no `INSUFFICIENT_BALANCE`;
* el saldo **no cambia** y **no se escribe ningún movimiento**: la transacción no queda a medias;
* se cuenta el saldo de prueba de **esa** billetera, no de toda la instalación;
* se cuenta **después** de tomar el bloqueo de la cuenta, así que no hay ventana entre comprobar y
  descontar;
* fuera de producción el gasto pasa, que es para lo que existe el saldo de prueba;
* el perfil se evalúa **en cada gasto**: la misma instancia del servicio rechaza en cuanto la
  instalación pasa a operativa, sin reconstruir nada;
* la propiedad `luparx.payments.allow-test-money-in-production` sigue siendo la salida explícita;
* sin saldo suficiente contesta `INSUFFICIENT_BALANCE` y ni se molesta en contar: el caso común no
  paga una consulta extra.

## 3. El gasto completo, contra una base de verdad

Las dos pruebas de arriba no tocan PostgreSQL, así que ninguna puede contestar las preguntas que
sólo existen cuando hay una base y dos peticiones a la vez. Para eso está
`pruebas-gasto-extremo-a-extremo.sh`, que maneja la API por HTTP y comprueba el resultado en la
base:

```bash
API=http://127.0.0.1:8092/api/v1 PGPORT=5442 PGDATABASE=luparx_src \
  bash backend/tools/pruebas-guarda-de-gasto/pruebas-gasto-extremo-a-extremo.sh
```

Necesita el backend arrancado **sin perfil dev/demo** —instalación operativa— contra una base con
las 43 migraciones y los datos del sembrador de desarrollo ya presentes. Ocho bloques:

| | Qué afirma |
|---|---|
| A | saldo suficiente: cobra y descuenta exactamente lo cotizado |
| B | la misma `Idempotency-Key` dos veces cobra **una** vez y devuelve la misma estadía |
| C | dos solicitudes a la vez con saldo para **una**: exactamente una cobra, el saldo nunca queda negativo |
| D | saldo insuficiente: `INSUFFICIENT_BALANCE`, saldo intacto, cero movimientos |
| E | una regla que corta **antes** de la billetera no deja cobro |
| F | sin sesión no se gasta, y una credencial de otro portal tampoco |
| G | ocho solicitudes a la vez con saldo de PRUEBA: las ocho `TEST_MONEY_SPEND_REFUSED`, cero movimientos |
| H | la misma placa dos veces a la vez: la perdedora **no se queda con el cobro** — el rollback, bajo contención |

Ejecutada el 17-10-2026 contra PostgreSQL 16.15 + PostGIS 3.4: **32 comprobaciones, 0 fallos**.

Baja el saldo de una billetera de demostración para poder provocar «saldo insuficiente» con las
duraciones que la municipalidad ofrece. No inserta saldo, no usa tarjetas y no toca ninguna pasarela.

### La ventana que esto NO cierra

El conteo de movimientos de origen `DEV` se lee **dentro** de la transacción del débito y después
del bloqueo de la cuenta, así que una recarga de desarrollo concurrente —que toma el mismo bloqueo—
queda siempre de un lado o del otro, nunca a medias. Lo que no cubre ninguna de estas pruebas es una
fila `DEV` escrita **directamente en la base**, sin pasar por la aplicación, en el intervalo exacto
entre ese conteo y el `commit`: no toma ningún bloqueo y ese débito no la ve. Es el único hueco que
queda, dura lo que dura una transacción, y exige acceso directo a la base. Lo que lo cubre es la
guarda de arranque, que se niega a arrancar en cuanto esa fila existe.

## Dónde está conectada

`WalletService.charge` es el **único** punto donde la billetera se descuenta, y los tres caminos de
gasto pasan por ahí:

* `ParkingSessionService` — iniciar una estadía;
* `ParkingSessionService` — extenderla;
* `FinePaymentService` — pagar una multa.

La comprobación vive dentro de esa transacción, después de `lock(...)` y antes de `apply(...)`.

## Verificado también contra la aplicación corriendo

El 17-10-2026, contra PostgreSQL 16.15 + PostGIS 3.4 con las 43 migraciones aplicadas y el backend
arrancado **sin perfil dev/demo** (instalación operativa):

1. billetera limpia → `POST /api/v1/citizen/parking/sessions` contesta **200** y descuenta;
2. se inserta un movimiento `DEV` en esa billetera (una copia restaurada en caliente);
3. el mismo gasto contesta **409** `TEST_MONEY_SPEND_REFUSED`, el saldo queda **intacto** y **no se
   crea ninguna sesión**;
4. y al reiniciar con ese movimiento ya presente, la guarda de arranque se **niega a arrancar**.
