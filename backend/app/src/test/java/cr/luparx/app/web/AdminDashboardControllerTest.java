package cr.luparx.app.web;

import cr.luparx.enforcement.model.PlateVerdict;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Una consulta sin veredicto no puede tumbar el panel.
 *
 * <p>El 23-09-2026 lo tumbó: {@code GET /api/v1/admin/dashboard} devolvía 500 con un
 * {@code NullPointerException} porque el mapeo llamaba a {@code verdict().labelKey()} sin preguntar
 * si había veredicto. Se llevó por delante el Panel entero y los KPIs del Inicio, que leen el mismo
 * endpoint, y estuvo esperando a que alguien rechazara una consulta para aparecer.</p>
 *
 * <p>Que la columna sea nullable no es un descuido: una consulta rechazada —sin señal, placa
 * ilegible, bahía fuera de zona— se guarda con su código de rechazo y sin veredicto, porque no
 * concluyó nada.</p>
 */
class AdminDashboardControllerTest {

    @Test
    @DisplayName("una consulta sin veredicto tiene nombre, no una excepción")
    void veredictoAusente() {
        assertEquals("plate.verdict.unknown", AdminDashboardController.verdictLabelKey(null));
    }

    @Test
    @DisplayName("cada veredicto real conserva su propia etiqueta")
    void todosLosVeredictos() {
        for (PlateVerdict verdict : PlateVerdict.values()) {
            String clave = AdminDashboardController.verdictLabelKey(verdict);
            assertNotNull(clave);
            assertEquals(verdict.labelKey(), clave);
            // Y ninguno se confunde con el ausente: si un veredicto real devolviera la clave del
            // nulo, la pantalla diría «Sin resolver» sobre algo que sí se resolvió.
            assertNotEquals("plate.verdict.unknown", clave);
        }
    }
}
