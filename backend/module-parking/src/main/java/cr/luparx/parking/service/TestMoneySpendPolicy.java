package cr.luparx.parking.service;

import java.util.Optional;

/**
 * ¿Se puede gastar el saldo de ESTA billetera? (ORDEN de cierre técnico de Ciudadano, prioridad 0,
 * 17-10-2026).
 *
 * <h2>Por qué es un puerto y no una clase</h2>
 *
 * <p>La decisión necesita dos datos que este contexto no tiene y no debe tener: en qué modo corre
 * la instalación <b>en este momento</b>, y qué dice la propiedad que permite una base mixta. Ambos
 * son del arranque de la aplicación, no del dominio de estacionamiento. Un contexto acotado que
 * importara {@code cr.luparx.app} dejaría de ser acotado (docs/ARCHITECTURE.md §4): los contextos
 * se unen en {@code app} y a través de puertos, nunca al revés.</p>
 *
 * <p>Lo que este contexto SÍ puede aportar es el único dato que vive en su propia tabla y que hay
 * que leer dentro de la transacción que descuenta: cuántos movimientos de esta billetera tienen
 * origen de desarrollo. Por eso el puerto recibe ese número y no va a buscarlo.</p>
 *
 * <h2>El momento importa</h2>
 *
 * <p>Se consulta <b>en cada gasto, después de tomar el bloqueo de la cuenta y antes de aplicar el
 * débito</b>. No al arrancar: un movimiento de prueba que aparece despues del arranque —una copia
 * restaurada en caliente, una réplica que se promueve, un extremo de desarrollo que quedó abierto—
 * no lo ve ninguna comprobación de arranque, y a partir de ahí ese saldo compra estacionamiento
 * real y paga multas reales.</p>
 */
public interface TestMoneySpendPolicy {

    /**
     * @param movimientosDeOrigenDevDeLaBilletera cuántos movimientos de ESTA billetera tienen origen
     *                                            de desarrollo, contados dentro de la transacción
     *                                            que está por descontar
     * @return el motivo por el que hay que rechazar el gasto, o vacío si puede seguir
     */
    Optional<String> motivoParaRechazarGasto(long movimientosDeOrigenDevDeLaBilletera);
}
