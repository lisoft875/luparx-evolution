package cr.luparx.app.payments;

import java.util.Optional;

/**
 * El saldo de PRUEBA no se gasta en una instalación operativa — comprobado en el momento del gasto
 * y no sólo al arrancar (ORDEN de cierre técnico de Ciudadano, prioridad 0, 17-10-2026).
 *
 * <h2>Qué agrega sobre {@link TestMoneyGuard}</h2>
 *
 * <p>{@link TestMoneyGuard} detiene el ARRANQUE cuando la base ya trae movimientos de origen
 * {@code DEV}. Es correcto y no alcanza: mira una foto del momento del arranque. Un movimiento
 * {@code DEV} que aparezca <b>después</b> —una copia restaurada en caliente, una réplica que se
 * promueve, un extremo de desarrollo que quedó abierto, o sencillamente una carrera entre el
 * arranque y la primera escritura— no vuelve a mirarse nunca, y a partir de ahí ese saldo compra
 * estacionamiento real y paga multas reales.</p>
 *
 * <p>Esta guarda se consulta <b>en cada gasto</b>, dentro de la transacción que descuenta. Es la
 * diferencia entre «la base estaba limpia cuando encendimos» y «este débito, ahora, no está
 * gastando dinero que nadie pagó».</p>
 *
 * <h2>Las tres vías de evasión que cierra</h2>
 *
 * <ol>
 *   <li><b>Cambio de perfil.</b> El modo se evalúa en el momento del gasto, con los perfiles
 *       activos de ese momento. No se guarda una decisión tomada al arrancar.</li>
 *   <li><b>Concurrencia.</b> La función es pura y sin estado: quien la llama tiene que contar los
 *       movimientos {@code DEV} <b>dentro de la misma transacción</b> que descuenta, de modo que
 *       un movimiento que entra a la vez queda del lado correcto del bloqueo. Esta clase no puede
 *       imponerlo, pero tampoco lo estorba: no cachea nada que pueda quedar viejo.</li>
 *   <li><b>La propiedad.</b> {@link TestMoneyGuard#PROPIEDAD_PERMITIR} sigue significando lo
 *       mismo —un operador que de verdad quiere una base mixta y sabe por qué— pero acá
 *       <b>además</b> exige que el gasto declare su origen, para que quede en la bitácora qué se
 *       permitió. Permitir no es lo mismo que no mirar.</li>
 * </ol>
 *
 * <h2>Por qué pura</h2>
 *
 * <p>Sin Spring, sin repositorios y sin reloj: se compila y se ejecuta sin levantar la aplicación,
 * que es lo que permite probarla en un entorno donde el backend no arranca. Quien la usa le pasa
 * los tres datos ya resueltos.</p>
 */
public final class TestMoneySpendGuard {

    private TestMoneySpendGuard() {
    }

    /**
     * ¿Hay que rechazar este gasto?
     *
     * @param instalacionOperativa  perfiles activos EN ESTE MOMENTO, no los del arranque
     *                              (ver {@link TestMoneyGuard#esInstalacionOperativa})
     * @param movimientosDevDeLaBilletera cuántos movimientos con origen {@code DEV} tiene la
     *                              billetera que se va a debitar, <b>contados dentro de la misma
     *                              transacción del débito</b>
     * @param permitidoExplicitamente lo que diga {@link TestMoneyGuard#PROPIEDAD_PERMITIR}
     * @return el motivo del rechazo, o vacío si el gasto puede seguir
     */
    public static Optional<String> motivoParaRechazarGasto(boolean instalacionOperativa,
                                                           long movimientosDevDeLaBilletera,
                                                           boolean permitidoExplicitamente) {
        if (!instalacionOperativa) {
            // dev / demo / test: el saldo de prueba es justamente lo que se quiere gastar ahí.
            return Optional.empty();
        }
        if (movimientosDevDeLaBilletera <= 0) {
            return Optional.empty();
        }
        if (permitidoExplicitamente) {
            return Optional.empty();
        }
        return Optional.of(
                "Esta billetera tiene " + movimientosDevDeLaBilletera + " movimiento(s) con saldo de "
                        + "PRUEBA (origen DEV) y la instalación está en modo OPERATIVO: el gasto se "
                        + "rechaza. Ese saldo no lo pagó nadie. Si la base es mixta a propósito, ponga "
                        + TestMoneyGuard.PROPIEDAD_PERMITIR + "=true y deje escrito por qué.");
    }

    /**
     * El código de error estable con el que el rechazo llega al cliente.
     *
     * <p>Propio y no un {@code VALIDATION_FAILED} genérico: quien lo vea en una bitácora tiene que
     * poder distinguir «el ciudadano no tenía saldo» de «el servidor se negó a gastar dinero de
     * prueba», que son incidentes de naturaleza distinta.</p>
     */
    public static final String CODIGO = "TEST_MONEY_SPEND_REFUSED";
}
