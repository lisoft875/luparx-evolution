import cr.luparx.app.payments.TestMoneyGuard;
import cr.luparx.app.payments.TestMoneySpendGuard;

import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Pruebas de la prioridad 0: el saldo de PRUEBA no se gasta en una instalación operativa.
 *
 * Sin JUnit a propósito: las dependencias de alcance `test` no están disponibles en este entorno
 * (Maven Central bloqueado), y la guarda es pura, así que `javac` + `java` la ejercitan de verdad.
 * Lo que se prueba es el COMPORTAMIENTO, no la forma del código.
 */
public final class PruebaGuardaDeGasto {

    private static int fallos = 0;

    private static void ok(boolean condicion, String mensaje) {
        if (condicion) {
            System.out.println("  ok   " + mensaje);
        } else {
            fallos++;
            System.out.println("  FALLA: " + mensaje);
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("casos POSITIVOS (el gasto debe seguir)");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, 0, false).isEmpty(),
                "operativa y billetera limpia: pasa");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(false, 7, false).isEmpty(),
                "perfil dev/demo con saldo de prueba: pasa, que es justo para lo que existe");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, 7, true).isEmpty(),
                "operativa con saldo de prueba PERO permitido explícitamente: pasa");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, -3, false).isEmpty(),
                "un conteo imposible (negativo) no inventa un rechazo");

        System.out.println("\ncasos NEGATIVOS (el gasto debe rechazarse)");
        Optional<String> motivo = TestMoneySpendGuard.motivoParaRechazarGasto(true, 1, false);
        ok(motivo.isPresent(), "operativa + UN movimiento DEV: se rechaza");
        ok(motivo.orElse("").contains("1 movimiento(s)"),
                "y el motivo dice cuántos son, no un mensaje genérico");
        ok(motivo.orElse("").contains(TestMoneyGuard.PROPIEDAD_PERMITIR),
                "y nombra la propiedad que lo permitiría, para que la salida no sea adivinar");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, 999, false).isPresent(),
                "muchos movimientos DEV: también se rechaza");

        System.out.println("\nla vía de evasión por CAMBIO DE PERFIL");
        boolean operativaAhora = TestMoneyGuard.esInstalacionOperativa("prod");
        boolean eraDevAlArrancar = !TestMoneyGuard.esInstalacionOperativa("dev");
        ok(eraDevAlArrancar && operativaAhora,
                "una instalación que arrancó en dev y ahora corre operativa es un caso real");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(operativaAhora, 1, false).isPresent(),
                "y con el perfil de AHORA el gasto se rechaza, aunque al arrancar fuera dev");
        ok(TestMoneyGuard.esInstalacionOperativa("prod", "demo") == false,
                "basta un perfil demo entre varios para no ser operativa");
        ok(TestMoneyGuard.esInstalacionOperativa() == true,
                "sin perfiles activos se asume operativa: el default es el seguro");

        System.out.println("\nel movimiento DEV que aparece DESPUÉS del arranque");
        ok(TestMoneyGuard.motivoParaDetener(true, 0, false).isEmpty(),
                "al arrancar la base estaba limpia: el arranque fue correcto");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, 1, false).isPresent(),
                "y el movimiento que entró después NO se puede gastar — que es el hueco que esto cierra");

        System.out.println("\nIDEMPOTENCIA (un reintento decide igual)");
        Optional<String> primera = TestMoneySpendGuard.motivoParaRechazarGasto(true, 2, false);
        Optional<String> segunda = TestMoneySpendGuard.motivoParaRechazarGasto(true, 2, false);
        ok(primera.isPresent() == segunda.isPresent() && primera.orElse("").equals(segunda.orElse("")),
                "misma entrada, misma respuesta: un reintento con la misma clave decide lo mismo");
        ok(TestMoneySpendGuard.motivoParaRechazarGasto(true, 0, false).isEmpty()
                        && TestMoneySpendGuard.motivoParaRechazarGasto(true, 0, false).isEmpty(),
                "y no hay estado que se acumule entre llamadas");

        System.out.println("\nCONCURRENCIA (sin estado compartido)");
        final int hilos = 64;
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch salida = new CountDownLatch(1);
        AtomicInteger rechazos = new AtomicInteger();
        AtomicInteger pasos = new AtomicInteger();
        AtomicReference<String> discrepancia = new AtomicReference<>(null);
        String esperado = TestMoneySpendGuard.motivoParaRechazarGasto(true, 3, false).orElse("");
        for (int i = 0; i < hilos; i++) {
            final boolean limpia = i % 2 == 0;
            pool.submit(() -> {
                try {
                    salida.await();
                    Optional<String> r = TestMoneySpendGuard.motivoParaRechazarGasto(true, limpia ? 0 : 3, false);
                    if (limpia) {
                        if (r.isPresent()) discrepancia.set("una billetera limpia fue rechazada");
                        pasos.incrementAndGet();
                    } else {
                        if (!r.isPresent() || !r.get().equals(esperado)) {
                            discrepancia.set("una billetera con saldo DEV no dio el mismo motivo");
                        }
                        rechazos.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        salida.countDown();
        pool.shutdown();
        ok(pool.awaitTermination(20, TimeUnit.SECONDS), "los 64 hilos terminaron");
        ok(discrepancia.get() == null, "ningún hilo obtuvo una respuesta distinta: " + discrepancia.get());
        ok(rechazos.get() == hilos / 2 && pasos.get() == hilos / 2,
                "cada hilo decidió según SU entrada, sin contaminarse (" + rechazos.get() + " rechazos / " + pasos.get() + " pases)");

        System.out.println("\nel código de error");
        ok("TEST_MONEY_SPEND_REFUSED".equals(TestMoneySpendGuard.CODIGO),
                "el rechazo tiene código propio y estable, distinguible de «no hay saldo»");

        System.out.println(fallos == 0 ? "\ntodas las comprobaciones pasaron" : "\n" + fallos + " fallos");
        System.exit(fallos == 0 ? 0 : 1);
    }
}
