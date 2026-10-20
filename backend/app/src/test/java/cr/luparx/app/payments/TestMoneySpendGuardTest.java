package cr.luparx.app.payments;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * La guarda que se consulta EN CADA GASTO, no sólo al arrancar (19-10-2026).
 *
 * <h2>Por qué esta prueba llega ahora</h2>
 *
 * <p>{@code TestMoneyGuardTest} cubre la guarda de <b>arranque</b> con siete pruebas. La guarda del
 * <b>gasto</b> —la que mira este débito, ahora, dentro de la transacción que descuenta— no la
 * cubría ninguna. Su propio Javadoc dice que es pura «para poder probarla sin levantar Spring», y
 * la auditoría del 17-10-2026 la dio por correcta <b>por lectura del código</b>. Buscado en el
 * árbol: no hay ningún script ni prueba que llame a {@code motivoParaRechazarGasto}. Era la
 * defensa con más responsabilidad y menos red del módulo de pagos.</p>
 *
 * <p>Lo que esta prueba cubre es la <b>decisión</b>, que es lo único que esta función decide: el
 * modo de la instalación, el conteo de movimientos de origen DEV y la propiedad que permite una
 * base mixta. Lo que NO cubre, y conviene decirlo para que nadie lea de más: que quien la llama
 * cuente esos movimientos <b>dentro de la misma transacción y después del bloqueo</b>. Eso es una
 * propiedad transaccional de {@code WalletService.charge} y no se puede demostrar sin una base de
 * datos; el backend no tiene hoy infraestructura de pruebas con base (ni Testcontainers ni
 * {@code @DataJpaTest}). Queda como hueco declarado, no como cosa probada.</p>
 */
class TestMoneySpendGuardTest {

    private static final long UN_MOVIMIENTO_DEV = 1L;

    @Nested
    @DisplayName("cuándo rechaza el gasto")
    class Rechaza {

        @Test
        @DisplayName("el caso que importa: instalación operativa + saldo de prueba en la billetera")
        void elCasoQueImporta() {
            Optional<String> motivo = TestMoneySpendGuard.motivoParaRechazarGasto(
                    true, UN_MOVIMIENTO_DEV, false);

            assertTrue(motivo.isPresent());
        }

        @Test
        @DisplayName("y el motivo es accionable: dice cuántos movimientos y qué propiedad mirar")
        void elMotivoEsAccionable() {
            String motivo = TestMoneySpendGuard
                    .motivoParaRechazarGasto(true, 3L, false)
                    .orElseThrow();

            assertTrue(motivo.contains("3"), motivo);
            assertTrue(motivo.contains(TestMoneyGuard.PROPIEDAD_PERMITIR), motivo);
        }

        @Test
        @DisplayName("rechaza igual con muchos movimientos: no hay umbral por debajo del cual pase")
        void noHayUmbral() {
            assertTrue(TestMoneySpendGuard.motivoParaRechazarGasto(true, 1L, false).isPresent());
            assertTrue(TestMoneySpendGuard.motivoParaRechazarGasto(true, 2L, false).isPresent());
            assertTrue(TestMoneySpendGuard.motivoParaRechazarGasto(true, 9_999L, false).isPresent());
        }
    }

    @Nested
    @DisplayName("cuándo NO rechaza")
    class NoRechaza {

        @Test
        @DisplayName("en desarrollo, que es donde ese saldo está para gastarse")
        void enDesarrollo() {
            assertFalse(TestMoneySpendGuard
                    .motivoParaRechazarGasto(false, UN_MOVIMIENTO_DEV, false).isPresent());
        }

        @Test
        @DisplayName("en una instalación operativa con la billetera limpia")
        void operativaConBilleteraLimpia() {
            assertFalse(TestMoneySpendGuard.motivoParaRechazarGasto(true, 0L, false).isPresent());
        }

        @Test
        @DisplayName("cuando alguien declara a propósito que la base es mixta")
        void permitidoAProposito() {
            assertFalse(TestMoneySpendGuard
                    .motivoParaRechazarGasto(true, UN_MOVIMIENTO_DEV, true).isPresent());
        }

        @Test
        @DisplayName("un conteo imposible no se trata como saldo de prueba")
        void conteoImposible() {
            // El repositorio devuelve un long; si alguna vez llegara negativo, la lectura correcta
            // es «no hay movimientos DEV», no «rechazá todo».
            assertFalse(TestMoneySpendGuard.motivoParaRechazarGasto(true, -1L, false).isPresent());
        }
    }

    @Nested
    @DisplayName("el modo decide antes que nada")
    class ElModoManda {

        @Test
        @DisplayName("fuera de una instalación operativa, ni el conteo ni la propiedad cambian nada")
        void fueraDeOperativaNadaImporta() {
            assertFalse(TestMoneySpendGuard.motivoParaRechazarGasto(false, 0L, false).isPresent());
            assertFalse(TestMoneySpendGuard.motivoParaRechazarGasto(false, 50L, false).isPresent());
            assertFalse(TestMoneySpendGuard.motivoParaRechazarGasto(false, 50L, true).isPresent());
        }
    }

    @Test
    @DisplayName("el código de rechazo es propio y estable, no un error de validación genérico")
    void elCodigoEsPropio() {
        // Quien lo vea en una bitácora tiene que poder distinguir «no tenía saldo» de «el servidor
        // se negó a gastar dinero de prueba». Si alguien cambia esta constante, el cliente que la
        // interpreta deja de reconocer el caso: por eso se fija aquí.
        assertEquals("TEST_MONEY_SPEND_REFUSED", TestMoneySpendGuard.CODIGO);
    }
}
