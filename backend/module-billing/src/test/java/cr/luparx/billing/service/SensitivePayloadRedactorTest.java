package cr.luparx.billing.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Lo que NUNCA debe quedar escrito en {@code gateway_notifications.payload}.
 *
 * <p>Esa tabla es evidencia y no se reescribe, así que lo que entra se queda. Y lo que entra lo
 * decide el proveedor, que todavía no está integrado: nadie puede prometer hoy que su webhook no
 * traiga un número de tarjeta. Estas pruebas son la red.</p>
 *
 * <p><b>Los números de tarjeta de abajo son los de prueba publicados por las redes</b> —los mismos
 * que cualquier manual de integración imprime— y no corresponden a ninguna cuenta real.</p>
 */
class SensitivePayloadRedactorTest {

    /** Números de prueba publicados por las redes. No son cuentas de nadie. */
    private static final String VISA_PRUEBA = "4111111111111111";
    private static final String MC_PRUEBA = "5555555555554444";
    private static final String AMEX_PRUEBA = "378282246310005";

    @Nested
    @DisplayName("un número con forma de tarjeta no se guarda")
    class Tarjetas {

        @Test
        @DisplayName("en JSON, con o sin separadores")
        void enJson() {
            String limpio = SensitivePayloadRedactor.redact(
                    "{\"ref\":\"abc\",\"numero\":\"" + VISA_PRUEBA + "\"}");
            assertFalse(limpio.contains(VISA_PRUEBA), "el número no puede quedar escrito");
            assertTrue(limpio.contains(SensitivePayloadRedactor.PAN_OCULTO));
            assertTrue(limpio.contains("\"ref\":\"abc\""), "lo demás del cuerpo se conserva");

            assertFalse(SensitivePayloadRedactor.redact("pan 4111 1111 1111 1111 fin").contains("4111 1111"));
            assertFalse(SensitivePayloadRedactor.redact("pan 4111-1111-1111-1111 fin").contains("4111-1111"));
        }

        @Test
        @DisplayName("de cualquier red, y de 15 o 16 dígitos")
        void variasRedes() {
            for (String numero : new String[] {VISA_PRUEBA, MC_PRUEBA, AMEX_PRUEBA}) {
                assertFalse(SensitivePayloadRedactor.redact("x=" + numero).contains(numero), numero);
            }
        }

        @Test
        @DisplayName("pero un identificador largo cualquiera SÍ se conserva")
        void noMuerdeIdentificadores() {
            // Si se ocultara todo lo que tiene trece dígitos seguidos, la evidencia quedaría
            // inservible: una referencia de proveedor o una marca de tiempo en milisegundos los
            // tienen. Luhn es lo que separa una cosa de la otra.
            String referencia = "1234567890123";                 // no pasa Luhn
            assertFalse(SensitivePayloadRedactor.pasaLuhn(referencia));
            assertTrue(SensitivePayloadRedactor.redact("{\"ref\":\"" + referencia + "\"}")
                    .contains(referencia));

            String milisegundos = "1792162298513";               // una fecha, no una tarjeta
            assertFalse(SensitivePayloadRedactor.pasaLuhn(milisegundos));
            assertTrue(SensitivePayloadRedactor.redact("ts=" + milisegundos).contains(milisegundos));
        }

        @Test
        @DisplayName("y un número MÁS largo que una tarjeta no se muerde por la mitad")
        void noMuerdePorLaMitad() {
            String veinteDigitos = "12345678901234567890";
            assertTrue(SensitivePayloadRedactor.redact("id=" + veinteDigitos).contains(veinteDigitos));
        }
    }

    @Nested
    @DisplayName("campos sensibles por su nombre")
    class Campos {

        @Test
        @DisplayName("el valor se oculta, el nombre se conserva")
        void enJson() {
            String limpio = SensitivePayloadRedactor.redact(
                    "{\"cvv\":\"123\",\"exp_month\":12,\"card_number\":\"x\",\"amount\":1500}");
            assertFalse(limpio.contains("\"123\""));
            assertTrue(limpio.contains("\"cvv\":\"" + SensitivePayloadRedactor.VALOR_OCULTO + "\""),
                    "el nombre del campo queda, para que se vea QUÉ se ocultó: " + limpio);
            assertTrue(limpio.contains("\"exp_month\":\"" + SensitivePayloadRedactor.VALOR_OCULTO + "\""));
            assertTrue(limpio.contains("\"amount\":1500"), "un campo que no es sensible no se toca");
        }

        @Test
        @DisplayName("sin distinguir mayúsculas ni guiones bajos")
        void nombresEquivalentes() {
            for (String nombre : new String[] {"cvv", "CVV", "cvv2", "securityCode", "security_code",
                    "Card-Number", "track2", "PIN"}) {
                String limpio = SensitivePayloadRedactor.redact("{\"" + nombre + "\":\"secreto\"}");
                assertFalse(limpio.contains("secreto"), nombre + " debería ocultarse: " + limpio);
            }
        }

        @Test
        @DisplayName("también cuando el proveedor manda un formulario y no JSON")
        void enFormulario() {
            String limpio = SensitivePayloadRedactor.redact("ref=A1&cvv=987&amount=1500");
            assertFalse(limpio.contains("987"));
            assertTrue(limpio.contains("ref=A1"));
            assertTrue(limpio.contains("amount=1500"));
        }
    }

    @Nested
    @DisplayName("lo demás que esta limpieza promete")
    class Promesas {

        @Test
        @DisplayName("un cuerpo enorme se recorta, y lo dice")
        void recorta() {
            String enorme = "{\"d\":\"" + "a".repeat(40_000) + "\"}";
            String limpio = SensitivePayloadRedactor.redact(enorme);
            assertTrue(limpio.length() < enorme.length());
            assertTrue(limpio.endsWith(SensitivePayloadRedactor.RECORTADO),
                    "un recorte silencioso haría creer que el proveedor mandó eso y nada más");
        }

        @Test
        @DisplayName("limpiar dos veces da lo mismo")
        void idempotente() {
            String cuerpo = "{\"cvv\":\"123\",\"pan\":\"" + VISA_PRUEBA + "\",\"ok\":1}";
            String unaVez = SensitivePayloadRedactor.redact(cuerpo);
            assertEquals(unaVez, SensitivePayloadRedactor.redact(unaVez));
        }

        @Test
        @DisplayName("un cuerpo vacío o nulo no revienta")
        void bordes() {
            assertEquals("", SensitivePayloadRedactor.redact(null));
            assertEquals("", SensitivePayloadRedactor.redact(""));
        }

        @Test
        @DisplayName("un cuerpo sin nada sensible sale igual que entró")
        void noToca() {
            String cuerpo = "{\"event\":\"payment.captured\",\"reference\":\"PR-9087\",\"amount\":155000}";
            assertEquals(cuerpo, SensitivePayloadRedactor.redact(cuerpo));
        }
    }
}
