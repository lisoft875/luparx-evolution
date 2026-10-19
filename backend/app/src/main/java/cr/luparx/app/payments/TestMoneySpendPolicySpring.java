package cr.luparx.app.payments;

import cr.luparx.parking.service.TestMoneySpendPolicy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Conecta {@link TestMoneySpendGuard} al punto del gasto (prioridad 0 de la orden del 17-10-2026).
 *
 * <p>Hermana de {@link TestMoneyStartupCheck} y deliberadamente igual de delgada: lee el entorno y
 * delega. La decisión vive en {@code TestMoneySpendGuard}, que es pura y se prueba sin levantar
 * Spring — que es lo que permitió probarla 21 veces en un entorno donde Maven Central está
 * bloqueado.</p>
 *
 * <p><b>El modo se evalúa en cada llamada</b>, no se guarda en el constructor. Esa es la diferencia
 * que cierra la vía de evasión por cambio de perfil: una instalación que arrancó en {@code dev} y
 * que ahora corre operativa decide con el perfil de ahora. Cuesta una lectura del entorno, que es
 * un arreglo en memoria.</p>
 *
 * <p>La propiedad {@link TestMoneyGuard#PROPIEDAD_PERMITIR} sí se lee una vez: es configuración del
 * arranque y cambiarla exige reiniciar, así que leerla en cada gasto no agregaría nada.</p>
 */
@Component
public class TestMoneySpendPolicySpring implements TestMoneySpendPolicy {

    private final Environment environment;
    private final boolean permitido;

    public TestMoneySpendPolicySpring(
            Environment environment,
            @Value("${" + TestMoneyGuard.PROPIEDAD_PERMITIR + ":false}") boolean permitido) {
        this.environment = environment;
        this.permitido = permitido;
    }

    @Override
    public Optional<String> motivoParaRechazarGasto(long movimientosDeOrigenDevDeLaBilletera) {
        boolean operativa = TestMoneyGuard.esInstalacionOperativa(environment.getActiveProfiles());
        return TestMoneySpendGuard.motivoParaRechazarGasto(operativa, movimientosDeOrigenDevDeLaBilletera,
                permitido);
    }
}
