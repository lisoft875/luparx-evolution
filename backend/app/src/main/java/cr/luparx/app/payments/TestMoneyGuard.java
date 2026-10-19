package cr.luparx.app.payments;

import java.util.Optional;

/**
 * Una instalación operativa no arranca contra una base que tiene saldo de prueba
 * (CONTRACT.md v0.46).
 *
 * <h2>Qué problema resuelve</h2>
 *
 * <p>El simulador de pagos ya no puede existir fuera de los perfiles {@code dev} y {@code demo}:
 * lo impiden dos guardas independientes sobre el propio bean. Pero <b>los datos sobreviven al
 * cambio de perfil</b>. Una base de desarrollo que alguien promueve a operativa —o una copia que
 * se restaura en el servidor equivocado— llega con saldo que nadie pagó, y a partir de ahí ese
 * saldo compra estacionamiento real y paga multas reales. Ninguna guarda sobre el bean ve eso,
 * porque para entonces el simulador ya no está.</p>
 *
 * <p>Por eso la comprobación es sobre el DATO y no sobre la configuración, y por eso detiene el
 * arranque en vez de avisar en un log: un servidor operativo apuntado a una base de desarrollo es
 * una equivocación que no mejora por seguir corriendo.</p>
 *
 * <h2>Qué cuenta como saldo de prueba</h2>
 *
 * <p>Un movimiento de billetera con origen {@link cr.luparx.parking.model.WalletTopupSource#DEV}.
 * Ese origen lo escriben las dos únicas vías que crean saldo sin que nadie pague: el extremo de
 * recarga de desarrollo, y una recarga con tarjeta que confirmó una pasarela que se declara
 * simulada ({@code PaymentGateway.isSimulated()}). No hace falta ninguna lista de proveedores:
 * la marca viaja en el movimiento.</p>
 *
 * <p>Decisión pura, separada del arranque de Spring, para que se pueda probar sin levantar la
 * aplicación — que es justamente lo que una guarda de arranque hace difícil.</p>
 */
public final class TestMoneyGuard {

    /** La propiedad que permite seguir, para quien de verdad quiera una base mixta y sepa por qué. */
    public static final String PROPIEDAD_PERMITIR = "luparx.payments.allow-test-money-in-production";

    private TestMoneyGuard() {
    }

    /**
     * @param instalacionOperativa {@code true} cuando ningún perfil activo es {@code dev} ni {@code demo}
     * @param movimientosDeDesarrollo cuántos movimientos de billetera tienen origen {@code DEV}
     * @param permitidoExplicitamente lo que diga {@link #PROPIEDAD_PERMITIR}
     * @return el motivo por el que hay que detener el arranque, o vacío si se puede seguir
     */
    public static Optional<String> motivoParaDetener(boolean instalacionOperativa,
                                                     long movimientosDeDesarrollo,
                                                     boolean permitidoExplicitamente) {
        if (!instalacionOperativa || movimientosDeDesarrollo <= 0) {
            return Optional.empty();
        }
        if (permitidoExplicitamente) {
            return Optional.empty();
        }
        return Optional.of(
                "Esta instalación arranca en modo OPERATIVO contra una base que tiene "
                        + movimientosDeDesarrollo + " movimiento(s) de billetera con saldo de PRUEBA "
                        + "(origen DEV). Ese saldo no lo pagó nadie y acá compraría estacionamiento y "
                        + "pagaría multas reales. Revise a qué base apunta SPRING_DATASOURCE_URL. "
                        + "Si de verdad quiere seguir, ponga " + PROPIEDAD_PERMITIR + "=true y deje "
                        + "escrito por qué.");
    }

    /** {@code true} cuando ninguno de los perfiles activos es de desarrollo o demostración. */
    public static boolean esInstalacionOperativa(String... perfilesActivos) {
        if (perfilesActivos == null) {
            return true;
        }
        for (String perfil : perfilesActivos) {
            if ("dev".equalsIgnoreCase(perfil) || "demo".equalsIgnoreCase(perfil)
                    || "test".equalsIgnoreCase(perfil)) {
                return false;
            }
        }
        return true;
    }
}
