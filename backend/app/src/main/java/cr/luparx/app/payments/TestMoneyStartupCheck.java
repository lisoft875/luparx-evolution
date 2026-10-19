package cr.luparx.app.payments;

import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.repository.WalletTransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Conecta {@link TestMoneyGuard} al arranque (CONTRACT.md v0.46).
 *
 * <p>Clase delgada a propósito: lee el entorno, cuenta y delega. La decisión vive en
 * {@code TestMoneyGuard}, que se prueba sin levantar Spring.</p>
 *
 * <p>Se cuenta <b>sin acotar por municipalidad</b>, que es la única excepción de este tipo en el
 * código y por eso se dice en voz alta: no es una consulta de negocio sino una comprobación de
 * integridad de la instalación entera, y preguntarla municipalidad por municipalidad respondería
 * la pregunta equivocada — basta con que UNA tenga saldo de prueba para que la instalación no deba
 * operar.</p>
 */
@Component
public class TestMoneyStartupCheck {

    private static final Logger LOGGER = LoggerFactory.getLogger(TestMoneyStartupCheck.class);

    private final WalletTransactionRepository movimientos;
    private final Environment environment;
    private final boolean permitido;

    public TestMoneyStartupCheck(WalletTransactionRepository movimientos,
                                 Environment environment,
                                 @Value("${" + TestMoneyGuard.PROPIEDAD_PERMITIR + ":false}") boolean permitido) {
        this.movimientos = movimientos;
        this.environment = environment;
        this.permitido = permitido;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void comprobar() {
        boolean operativa = TestMoneyGuard.esInstalacionOperativa(environment.getActiveProfiles());
        long deDesarrollo = movimientos.countBySource(WalletTopupSource.DEV);

        Optional<String> motivo = TestMoneyGuard.motivoParaDetener(operativa, deDesarrollo, permitido);
        if (motivo.isPresent()) {
            throw new IllegalStateException(motivo.get());
        }
        if (operativa && deDesarrollo > 0) {
            // Permitido por propiedad: sigue, pero no en silencio.
            LOGGER.warn("Instalación OPERATIVA con {} movimiento(s) de saldo de PRUEBA en la billetera. "
                    + "Permitido por {}.", deDesarrollo, TestMoneyGuard.PROPIEDAD_PERMITIR);
        } else if (!operativa && deDesarrollo > 0) {
            LOGGER.info("Billetera con {} movimiento(s) de saldo de prueba. Normal fuera de producción.",
                    deDesarrollo);
        }
    }
}
