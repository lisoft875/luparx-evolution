import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.WalletAccount;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.repository.WalletAccountRepository;
import cr.luparx.parking.repository.WalletTransactionRepository;
import cr.luparx.parking.service.WalletService;
import cr.luparx.app.payments.TestMoneySpendPolicySpring;
import org.springframework.core.env.Environment;

import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * La prioridad 0, CONECTADA: lo que se prueba acá es {@link WalletService#charge}, el único punto
 * donde la billetera se descuenta, con la guarda ya enchufada.
 *
 * <p>Diferencia con {@code PruebaGuardaDeGasto}, que prueba la decisión pura: esto prueba que la
 * decisión <b>se consulta de verdad</b>, en el lugar correcto y con los datos correctos. Una guarda
 * bien escrita y no conectada protege exactamente nada, y eso es lo que esta prueba vuelve
 * imposible de volver a creer.</p>
 *
 * <p>Sin JUnit y sin Spring a propósito: las dependencias de alcance {@code test} no están
 * disponibles en este entorno (Maven Central bloqueado). Los repositorios son interfaces, así que
 * se implementan con {@link Proxy} y responden sólo lo que esta prueba necesita; el {@code
 * Environment} de Spring también es una interfaz. La política que se usa es la REAL
 * ({@link TestMoneySpendPolicySpring}), no una imitación: la cadena que se ejercita es
 * WalletService → TestMoneySpendPolicySpring → TestMoneySpendGuard.</p>
 *
 * <p>Compilar y correr (desde la raíz del repositorio, con el classpath del jar ya construido):
 * ver backend/tools/pruebas-guarda-de-gasto/COMO-CORRER.md</p>
 */
public final class PruebaGastoConectado {

    private static int fallos = 0;

    private static void ok(boolean condicion, String mensaje) {
        if (condicion) {
            System.out.println("  ok   " + mensaje);
        } else {
            fallos++;
            System.out.println("  FALLA: " + mensaje);
        }
    }

    // --- el banco de pruebas --------------------------------------------------------------------

    /** Lo que ocurrió, en orden: para poder afirmar que el conteo se pide DESPUÉS del bloqueo. */
    static final List<String> llamadas = new ArrayList<>();
    static final List<UUID> cuentasConsultadas = new ArrayList<>();
    static final List<WalletTransaction> guardados = new ArrayList<>();
    static long movimientosDev = 0;
    static String[] perfilesActivos = {"prod"};

    static WalletAccount cuenta;

    @SuppressWarnings("unchecked")
    static <T> T proxy(Class<T> tipo, java.lang.reflect.InvocationHandler h) {
        return (T) Proxy.newProxyInstance(PruebaGastoConectado.class.getClassLoader(),
                new Class<?>[]{tipo}, h);
    }

    static WalletAccountRepository cuentas() {
        return proxy(WalletAccountRepository.class, (p, m, a) -> {
            llamadas.add(m.getName());
            switch (m.getName()) {
                case "findByTenantIdAndUserId", "lockByTenantIdAndUserId":
                    return Optional.of(cuenta);
                case "save", "saveAndFlush":
                    return a[0];
                case "flush":
                    return null;
                default:
                    if (m.getReturnType() == Optional.class) return Optional.empty();
                    if (m.getReturnType() == boolean.class) return false;
                    if (m.getReturnType() == long.class) return 0L;
                    return null;
            }
        });
    }

    static WalletTransactionRepository movimientos() {
        return proxy(WalletTransactionRepository.class, (p, m, a) -> {
            llamadas.add(m.getName());
            switch (m.getName()) {
                case "countByAccountIdAndSource":
                    cuentasConsultadas.add((UUID) a[0]);
                    // La prueba se rompe si alguien cambia el origen que se cuenta.
                    if (a[1] != WalletTopupSource.DEV) {
                        throw new AssertionError("se contó un origen que no es DEV: " + a[1]);
                    }
                    return movimientosDev;
                case "countBySource":
                    throw new AssertionError("charge no debe usar el conteo de TODA la instalación");
                case "save", "saveAndFlush":
                    guardados.add((WalletTransaction) a[0]);
                    return a[0];
                default:
                    if (m.getReturnType() == Optional.class) return Optional.empty();
                    if (m.getReturnType() == boolean.class) return false;
                    if (m.getReturnType() == long.class) return 0L;
                    return null;
            }
        });
    }

    static Environment entorno() {
        return proxy(Environment.class, (p, m, a) -> {
            if (m.getName().equals("getActiveProfiles")) return perfilesActivos;
            if (m.getReturnType() == boolean.class) return false;
            if (m.getReturnType() == String[].class) return new String[0];
            return null;
        });
    }

    static WalletService servicio(boolean permitidoPorPropiedad) {
        return new WalletService(cuentas(), movimientos(), null,
                Clock.fixed(Instant.parse("2026-10-17T12:00:00Z"), ZoneOffset.UTC),
                new TestMoneySpendPolicySpring(entorno(), permitidoPorPropiedad));
    }

    static void reiniciar(long saldoMinor) {
        cuenta = new WalletAccount(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                Money.ofMinor(saldoMinor, "CRC"), Instant.parse("2026-01-01T00:00:00Z"));
        llamadas.clear();
        cuentasConsultadas.clear();
        guardados.clear();
    }

    static ConflictException cobrarEsperandoRechazo(WalletService s, long montoMinor) {
        try {
            s.charge(TenantId.of(cuenta.getTenantId()), UserId.of(cuenta.getUserId()),
                    Money.ofMinor(montoMinor, "CRC"), WalletTransactionType.SESSION_CHARGE,
                    UUID.randomUUID(), "clave-" + montoMinor);
            return null;
        } catch (ConflictException e) {
            return e;
        }
    }

    static WalletTransaction cobrar(WalletService s, long montoMinor) {
        return s.charge(TenantId.of(cuenta.getTenantId()), UserId.of(cuenta.getUserId()),
                Money.ofMinor(montoMinor, "CRC"), WalletTransactionType.SESSION_CHARGE,
                UUID.randomUUID(), "clave-" + montoMinor);
    }

    // --- las pruebas ----------------------------------------------------------------------------

    public static void main(String[] args) {
        System.out.println("una billetera limpia se gasta igual que antes");
        perfilesActivos = new String[]{"prod"};
        movimientosDev = 0;
        reiniciar(10_000);
        WalletService s = servicio(false);
        WalletTransaction mov = cobrar(s, 2_500);
        ok(mov != null, "el cobro se aplica");
        ok(cuenta.getBalanceMinor() == 7_500,
                "y el saldo baja de 10000 a " + cuenta.getBalanceMinor() + " (esperado 7500)");
        ok(guardados.size() == 1, "y queda UN movimiento en el libro");

        System.out.println("\nuna billetera con saldo de PRUEBA, en una instalación operativa");
        perfilesActivos = new String[]{"prod"};
        movimientosDev = 1;
        reiniciar(10_000);
        s = servicio(false);
        ConflictException e = cobrarEsperandoRechazo(s, 2_500);
        ok(e != null, "el cobro se RECHAZA");
        ok(e != null && ErrorCode.TEST_MONEY_SPEND_REFUSED.equals(e.code()),
                "con código propio TEST_MONEY_SPEND_REFUSED (" + (e == null ? "-" : e.code()) + ")");
        ok(e != null && !ErrorCode.INSUFFICIENT_BALANCE.equals(e.code()),
                "y NO como «no hay saldo», que sería mentirle a quien lea la bitácora");
        ok(cuenta.getBalanceMinor() == 10_000,
                "el saldo queda intacto en " + cuenta.getBalanceMinor());
        ok(guardados.isEmpty(), "y NO se escribió ningún movimiento: la transacción no deja rastro a medias");

        System.out.println("\ndónde se mira, y cuándo");
        ok(cuentasConsultadas.size() == 1 && cuentasConsultadas.get(0).equals(cuenta.getId()),
                "se cuenta el saldo de prueba de ESTA billetera, no de toda la instalación");
        int posBloqueo = llamadas.indexOf("lockByTenantIdAndUserId");
        int posConteo = llamadas.indexOf("countByAccountIdAndSource");
        ok(posBloqueo >= 0 && posConteo > posBloqueo,
                "y se cuenta DESPUÉS de tomar el bloqueo de la cuenta (" + posBloqueo + " < " + posConteo + "), "
                        + "así que no hay ventana entre comprobar y descontar");

        System.out.println("\nfuera de producción el saldo de prueba es justamente lo que se gasta");
        perfilesActivos = new String[]{"dev"};
        movimientosDev = 5;
        reiniciar(10_000);
        s = servicio(false);
        ok(cobrar(s, 1_000) != null, "con perfil dev el cobro pasa");
        ok(cuenta.getBalanceMinor() == 9_000, "y descuenta de verdad (" + cuenta.getBalanceMinor() + ")");

        System.out.println("\nel perfil se evalúa EN CADA GASTO, no al construir el servicio");
        perfilesActivos = new String[]{"dev"};
        movimientosDev = 3;
        reiniciar(10_000);
        s = servicio(false);
        ok(cobrar(s, 1_000) != null, "primer cobro con perfil dev: pasa");
        perfilesActivos = new String[]{"prod"};   // la instalación se promueve, MISMO servicio
        ok(cobrarEsperandoRechazo(s, 1_000) != null,
                "y el siguiente, con la instalación ya operativa, se rechaza — sin reconstruir nada");
        ok(cuenta.getBalanceMinor() == 9_000,
                "el segundo cobro no tocó el saldo (" + cuenta.getBalanceMinor() + ")");

        System.out.println("\nla salida explícita para una base mixta a propósito");
        perfilesActivos = new String[]{"prod"};
        movimientosDev = 7;
        reiniciar(10_000);
        s = servicio(true);
        ok(cobrar(s, 1_000) != null, "con la propiedad en true el cobro pasa");
        ok(cuenta.getBalanceMinor() == 9_000, "y descuenta (" + cuenta.getBalanceMinor() + ")");

        System.out.println("\nel orden de las dos negativas");
        perfilesActivos = new String[]{"prod"};
        movimientosDev = 1;
        reiniciar(500);
        s = servicio(false);
        e = cobrarEsperandoRechazo(s, 2_500);
        ok(e != null && ErrorCode.INSUFFICIENT_BALANCE.equals(e.code()),
                "sin saldo suficiente contesta INSUFFICIENT_BALANCE aunque además haya saldo de prueba ("
                        + (e == null ? "-" : e.code()) + ")");
        ok(cuentasConsultadas.isEmpty(),
                "y ni se molesta en contar: el caso común no paga una consulta extra");

        System.out.println("\nun perfil demo entre varios no es una instalación operativa");
        perfilesActivos = new String[]{"prod", "demo"};
        movimientosDev = 2;
        reiniciar(10_000);
        s = servicio(false);
        ok(cobrar(s, 1_000) != null, "prod+demo: pasa, porque demo manda");

        System.out.println(fallos == 0 ? "\ntodas las comprobaciones pasaron" : "\n" + fallos + " fallos");
        System.exit(fallos == 0 ? 0 : 1);
    }
}
