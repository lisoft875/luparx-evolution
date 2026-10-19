package cr.luparx.app.payments;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * El saldo de prueba no sobrevive a un cambio de perfil, y esta guarda es la que lo nota.
 *
 * <p>Lo que se prueba no es el simulador —ése ya no puede ni construirse fuera de {@code dev} y
 * {@code demo}— sino el agujero que queda después: los <b>datos</b> sí cruzan. Una base de
 * desarrollo promovida a operativa llega con saldo que nadie pagó.</p>
 */
class TestMoneyGuardTest {

    private static boolean detiene(boolean operativa, long movimientos, boolean permitido) {
        return TestMoneyGuard.motivoParaDetener(operativa, movimientos, permitido).isPresent();
    }

    @Nested
    @DisplayName("cuándo detiene el arranque")
    class Detiene {

        @Test
        @DisplayName("instalación operativa + saldo de prueba = no arranca")
        void elCasoQueImporta() {
            assertTrue(detiene(true, 1, false), "un solo movimiento de prueba ya basta");
            assertTrue(detiene(true, 4_321, false));
        }

        @Test
        @DisplayName("y el motivo dice qué revisar, no sólo que falló")
        void elMotivoEsAccionable() {
            Optional<String> motivo = TestMoneyGuard.motivoParaDetener(true, 7, false);
            assertTrue(motivo.isPresent());
            String texto = motivo.get();
            assertTrue(texto.contains("7"), "dice cuántos son");
            assertTrue(texto.contains("SPRING_DATASOURCE_URL"), "dice dónde mirar: " + texto);
            assertTrue(texto.contains(TestMoneyGuard.PROPIEDAD_PERMITIR), "y cómo seguir a propósito");
        }
    }

    @Nested
    @DisplayName("cuándo NO detiene")
    class NoDetiene {

        @Test
        @DisplayName("en desarrollo, que es donde ese saldo tiene sentido")
        void enDesarrollo() {
            assertFalse(detiene(false, 500, false));
        }

        @Test
        @DisplayName("en una instalación operativa limpia")
        void operativaSinSaldoDePrueba() {
            assertFalse(detiene(true, 0, false));
        }

        @Test
        @DisplayName("cuando alguien lo permite a propósito")
        void permitidoAProposito() {
            // Existe la salida, pero hay que escribirla: una guarda sin escape se desactiva
            // comentándola, y eso no deja rastro de quién decidió qué.
            assertFalse(detiene(true, 10, true));
        }
    }

    @Nested
    @DisplayName("qué cuenta como instalación operativa")
    class Perfiles {

        @Test
        @DisplayName("dev, demo y test no lo son")
        void losPerfilesNoOperativos() {
            assertFalse(TestMoneyGuard.esInstalacionOperativa("dev"));
            assertFalse(TestMoneyGuard.esInstalacionOperativa("demo"));
            assertFalse(TestMoneyGuard.esInstalacionOperativa("test"));
            assertFalse(TestMoneyGuard.esInstalacionOperativa("prod", "dev"),
                    "si CUALQUIER perfil activo es de desarrollo, no es operativa");
            assertFalse(TestMoneyGuard.esInstalacionOperativa("DEV"), "sin distinguir mayúsculas");
        }

        @Test
        @DisplayName("sin perfiles, o con cualquier otro, SÍ lo es")
        void falloCerrado() {
            // Falla CERRADO: una instalación sin perfil declarado se trata como operativa. El error
            // al revés —tratar producción como desarrollo— es el que deja pasar el saldo falso.
            assertTrue(TestMoneyGuard.esInstalacionOperativa());
            assertTrue(TestMoneyGuard.esInstalacionOperativa((String[]) null));
            assertTrue(TestMoneyGuard.esInstalacionOperativa("prod"));
            assertTrue(TestMoneyGuard.esInstalacionOperativa("staging", "metrics"));
        }
    }
}
