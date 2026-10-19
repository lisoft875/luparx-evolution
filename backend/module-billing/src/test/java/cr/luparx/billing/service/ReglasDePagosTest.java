package cr.luparx.billing.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Dos reglas del módulo de pagos que no viven en una sola clase, sino en la ausencia de código.
 *
 * <p>Una regla que se cumple porque nadie ha escrito todavía lo contrario se rompe el día que
 * alguien lo escribe, de buena fe y sin saber que había una regla. Eso es lo que estas pruebas
 * convierten en rojo.</p>
 */
class ReglasDePagosTest {

    /** La raíz de `backend/`, encontrada subiendo: Maven corre cada módulo en su propio directorio. */
    private static final Path RAIZ = raizDelBackend();

    private static Path raizDelBackend() {
        Path actual = Path.of("").toAbsolutePath();
        for (int i = 0; i < 6 && actual != null; i++) {
            if (Files.isDirectory(actual.resolve("app")) && Files.isDirectory(actual.resolve("module-billing"))) {
                return actual;
            }
            actual = actual.getParent();
        }
        throw new IllegalStateException("No encontré la raíz de backend/ desde " + Path.of("").toAbsolutePath());
    }

    /** Todo el código de producción de `app` y `module-billing`, con su ruta. */
    private static List<Path> fuentesDeProduccion() {
        List<Path> fuentes = new ArrayList<>();
        for (String modulo : new String[] {"app", "module-billing"}) {
            Path raiz = RAIZ.resolve(modulo).resolve("src/main/java");
            try (Stream<Path> archivos = Files.walk(raiz)) {
                archivos.filter(p -> p.toString().endsWith(".java")).forEach(fuentes::add);
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
        }
        return fuentes;
    }

    private static String leer(Path p) {
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    @Test
    @DisplayName("ningún camino de producción crea un pago por SINPE")
    void sinpeNoEstaImplementado() {
        // SINPE Móvil NO se implementa como transferencia manual, captura de pantalla ni confirmación
        // simulada: un pago sólo existe cuando el proveedor lo confirma de forma verificable
        // (instrucciones del 16-10-2026, punto 7). Hoy `PaymentMethod.SINPE` es un valor del
        // vocabulario que NADIE construye, y así debe seguir hasta que haya integración bancaria.
        //
        // Lo que esta prueba cuida no es la palabra «SINPE» —puede aparecer en un comentario o en una
        // etiqueta— sino que ninguna clase de producción USE ese valor del enum.
        List<String> culpables = new ArrayList<>();
        for (Path fuente : fuentesDeProduccion()) {
            String texto = leer(fuente);
            if (texto.contains("PaymentMethod.SINPE")) {
                culpables.add(RAIZ.relativize(fuente).toString());
            }
        }
        assertTrue(culpables.isEmpty(),
                "SINPE Móvil no se implementa hasta que haya integración bancaria verificable. "
                        + "Lo usa: " + culpables);
    }

    @Test
    @DisplayName("el cuerpo del proveedor se guarda limpio, y la huella se calcula del original")
    void elPayloadSeLimpiaAntesDeGuardarse() {
        String servicio = leer(RAIZ.resolve(
                "module-billing/src/main/java/cr/luparx/billing/service/PaymentCheckoutService.java"));

        // La huella tiene que seguir siendo del cuerpo ORIGINAL: si se calculara del limpio, dos
        // cuerpos distintos que se limpian igual pasarían por el mismo y el descarte de reenvíos
        // dejaría de ser cierto.
        assertTrue(servicio.contains("sha256Hex(raw.bodyAsText())"),
                "la huella debe calcularse sobre el cuerpo original");

        // Y lo que se GUARDA tiene que pasar por la limpieza.
        assertTrue(servicio.contains("SensitivePayloadRedactor.redact(raw.bodyAsText())"),
                "el cuerpo guardado debe pasar por SensitivePayloadRedactor");
        int guardadoCrudo = servicio.split("bodyHash, raw\\.bodyAsText\\(\\)", -1).length - 1;
        assertFalse(guardadoCrudo > 0,
                "el cuerpo crudo ya no puede llegar a la entidad sin limpiar");
    }

    @Test
    @DisplayName("ninguna entidad de pagos tiene columnas para datos de tarjeta")
    void nadaGuardaDatosDeTarjeta() {
        // `card_last4` y la red SÍ se guardan a propósito: son lo que un ciudadano reconoce en su
        // estado de cuenta y no son datos sensibles. Lo que no puede existir es una columna para el
        // número completo, la fecha de vencimiento o el código de seguridad.
        String[] prohibidas = {"card_number", "cardNumber", "pan", "cvv", "cvc", "security_code",
                "expiry", "exp_month", "exp_year", "track2"};
        List<String> hallazgos = new ArrayList<>();
        for (Path fuente : fuentesDeProduccion()) {
            if (!fuente.toString().contains("/entity/")) {
                continue;
            }
            String texto = leer(fuente);
            for (String prohibida : prohibidas) {
                if (texto.contains("@Column(name = \"" + prohibida + "\"")) {
                    hallazgos.add(RAIZ.relativize(fuente) + " → " + prohibida);
                }
            }
        }
        assertTrue(hallazgos.isEmpty(), "datos de tarjeta en una entidad: " + hallazgos);
    }
    @Test
    @DisplayName("una pasarela nueva se considera REAL mientras no diga lo contrario")
    void elPuertoFallaDelLadoSeguro() {
        // El lado seguro del error: marcar de prueba un cobro real lo escondería; marcar de real
        // uno de prueba lo deja a la vista. Por eso el valor por omisión es `false` y lo declara
        // cada pasarela, en vez de una lista de nombres que alguien tiene que acordarse de ampliar.
        cr.luparx.billing.port.PaymentGateway cualquiera = new PasarelaMinima();
        assertFalse(cualquiera.isSimulated(),
                "isSimulated() debe venir en false por omisión en el puerto");

        String puerto = leer(RAIZ.resolve(
                "module-billing/src/main/java/cr/luparx/billing/port/PaymentGateway.java"));
        assertTrue(puerto.replaceAll("\\s+", " ").contains("default boolean isSimulated() { return false; }"),
                "el valor por omisión vive en el puerto");

        String simulada = leer(RAIZ.resolve(
                "app/src/main/java/cr/luparx/app/payments/SimulatedPaymentGateway.java"));
        assertTrue(simulada.contains("public boolean isSimulated()") && simulada.contains("return true;"),
                "el simulador tiene que declararse");
    }

    @Test
    @DisplayName("el saldo que acredita un simulador se asienta como DEV, no como CITIZEN")
    void elOrigenDelSaldoDiceLaVerdad() {
        // Antes toda recarga con tarjeta se asentaba como CITIZEN, también la del simulador: el
        // rastro quedaba a una tabla de distancia (payments.provider) y quien mira la billetera veía
        // un saldo indistinguible de uno pagado. De esta marca cuelga además la guarda de arranque.
        String servicio = leer(RAIZ.resolve(
                "app/src/main/java/cr/luparx/app/payments/WalletCheckoutService.java"));
        assertTrue(servicio.contains("origenDe(gateway)"),
                "la recarga debe tomar su origen de la pasarela que la confirmó");
        assertTrue(servicio.replaceAll("\\s+", " ").contains(
                        "return gateway.isSimulated() ? WalletTopupSource.DEV : WalletTopupSource.CITIZEN;"),
                "y la regla debe ser exactamente ésa");
        int crudo = servicio.split("idempotencyKey, WalletTopupSource\\.CITIZEN", -1).length - 1;
        assertFalse(crudo > 0, "ya no puede quedar un CITIZEN fijo en la acreditación");
    }

    /** Una pasarela que no implementa nada opcional: sirve para leer los valores por omisión del puerto. */
    private static final class PasarelaMinima implements cr.luparx.billing.port.PaymentGateway {
        @Override public String providerId() { return "MINIMA"; }
        @Override public java.util.Set<cr.luparx.billing.port.CardNetwork> supportedNetworks() {
            return java.util.Set.of();
        }
        @Override public cr.luparx.billing.port.PaymentGateway.Handoff createCheckout(
                cr.luparx.billing.port.PaymentGateway.CheckoutRequest peticion) {
            throw new UnsupportedOperationException();
        }
        @Override public java.util.Optional<cr.luparx.billing.port.PaymentGateway.Snapshot> fetchStatus(
                cr.luparx.core.id.TenantId t, String referencia) {
            throw new UnsupportedOperationException();
        }
        @Override public cr.luparx.billing.port.PaymentGateway.Notification parseNotification(
                cr.luparx.billing.port.PaymentGateway.RawNotification cruda) {
            throw new UnsupportedOperationException();
        }
    }
}