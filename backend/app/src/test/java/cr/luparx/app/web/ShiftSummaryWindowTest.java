package cr.luparx.app.web;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EnforcementCheckService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * El contrato de la ventana de {@code GET /inspector/shift-summary} (19-10-2026).
 *
 * <h2>Por qué esta prueba existe</h2>
 *
 * <p>La auditoría del 17-10-2026 dejó las cuatro reglas de este extremo verificadas <b>por lectura
 * del código</b>: ventana al revés, ventana de más de 31 días, identidad tomada del contexto y
 * aislamiento por persona. Leerlas no es probarlas. {@code ShiftSummaryCountTest} —la única prueba
 * que tocaba este camino— es honesta sobre su alcance en su propio Javadoc: comprueba que los
 * cuatro parámetros llegan al repositorio en orden, y nada más. Las reglas de la ventana no las
 * miraba nadie.</p>
 *
 * <p>Las dos primeras nacieron de mediciones, no de teoría: el 17-10-2026 se midió que
 * {@code from=1970&to=2999} contestaba <b>200 sin chistar</b>, y que una ventana al revés contestaba
 * <b>200 con ceros</b> —indistinguible, para la pantalla, de «hoy no hice nada», que es justo la
 * diferencia que esa pantalla se tomó el trabajo de preservar—. Un defecto que ya apareció una vez
 * y sólo tiene como red una revisión manual, reaparece.</p>
 *
 * <h2>Por qué sin Spring</h2>
 *
 * <p>El backend no tiene infraestructura de pruebas con contexto de Spring: ni un
 * {@code @SpringBootTest}, ni {@code @WebMvcTest}, ni Testcontainers, en ninguno de los
 * veinticinco archivos de prueba. Introducir una aquí para cuatro validaciones que son Java llano
 * al principio del método sería pagar un arranque de contexto por cada corrida y estrenar una
 * convención que nadie más sigue. El método se llama directamente, como ya hace
 * {@code SelfActionGuardsTest} con las guardas del portal administrativo.</p>
 *
 * <p>De los once colaboradores del controlador, {@code shiftSummary} usa exactamente <b>dos</b>.
 * Los otros nueve van en {@code null} a propósito: si alguien los usara desde este método, la
 * prueba fallaría con un {@code NullPointerException} ruidoso en vez de pasar en verde contra un
 * comportamiento que ya no es el que aquí se describe.</p>
 */
class ShiftSummaryWindowTest {

    private static final UUID YO = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID MUNICIPALIDAD = UUID.fromString("33333333-3333-3333-3333-333333333333");

    private static final Instant INICIO = Instant.parse("2026-10-19T06:00:00Z");
    private static final Instant FIN = Instant.parse("2026-10-19T18:00:00Z");

    private final EnforcementCheckService consultas = mock(EnforcementCheckService.class);
    private final CitationService boletas = mock(CitationService.class);

    @AfterEach
    void limpiar() {
        // El holder es un ThreadLocal: dejarlo puesto filtraría este contexto a la prueba siguiente.
        TenantContextHolder.clear();
    }

    private InspectorEnforcementController controlador() {
        return new InspectorEnforcementController(
                null, boletas, consultas, null, null, null, null, null, null, null, null);
    }

    private static void entraComo(UUID userId) {
        TenantContextHolder.set(new TenantContext(
                new UserId(userId),
                Portal.INSPECTOR,
                new TenantId(MUNICIPALIDAD),
                Set.of(Role.INSPECTOR),
                null,
                false));
    }

    private void respondenCifras(long consultasDelTurno, long boletasDelTurno) {
        when(consultas.countForInspector(any(), any(), any(), any())).thenReturn(consultasDelTurno);
        when(boletas.search(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(PageResponse.of(List.<Citation>of(), 0, 1, boletasDelTurno));
    }

    // ---- Fechas inválidas -----------------------------------------------------------------------

    @Test
    @DisplayName("una ventana al revés se rechaza con 422, y señala el campo «from»")
    void ventanaAlReves() {
        entraComo(YO);

        ValidationException error = assertThrows(
                ValidationException.class,
                () -> controlador().shiftSummary(FIN, INICIO));

        assertEquals(422, error.httpStatus());
        assertEquals(1, error.fieldErrors().size());
        assertEquals("from", error.fieldErrors().get(0).field());
        assertEquals(ErrorCode.VALIDATION_FAILED, error.fieldErrors().get(0).code());
    }

    @Test
    @DisplayName("y una ventana vacía también: «de las 6 a las 6» no es un turno")
    void ventanaVacia() {
        entraComo(YO);

        ValidationException error = assertThrows(
                ValidationException.class,
                () -> controlador().shiftSummary(INICIO, INICIO));

        assertEquals(422, error.httpStatus());
        assertEquals("from", error.fieldErrors().get(0).field());
    }

    // ---- El tope de 31 días ---------------------------------------------------------------------

    @Test
    @DisplayName("31 días exactos se aceptan: el tope es el límite, no un día menos")
    void treintaYUnDiasExactosSeAceptan() {
        entraComo(YO);
        respondenCifras(0L, 0L);

        assertDoesNotThrow(() -> controlador().shiftSummary(INICIO, INICIO.plus(Duration.ofDays(31))));
    }

    @Test
    @DisplayName("un segundo más se rechaza con 422 SHIFT_WINDOW_TOO_WIDE, señalando «to»")
    void unSegundoMasSeRechaza() {
        entraComo(YO);

        ValidationException error = assertThrows(
                ValidationException.class,
                () -> controlador().shiftSummary(
                        INICIO, INICIO.plus(Duration.ofDays(31)).plusSeconds(1)));

        assertEquals(422, error.httpStatus());
        assertEquals("to", error.fieldErrors().get(0).field());
        assertEquals(ErrorCode.SHIFT_WINDOW_TOO_WIDE, error.fieldErrors().get(0).code());
    }

    @Test
    @DisplayName("la ventana de 1970 a 2999, que el 17-10 contestaba 200, ahora se rechaza")
    void laVentanaDeTodoElHistorialSeRechaza() {
        entraComo(YO);

        ValidationException error = assertThrows(
                ValidationException.class,
                () -> controlador().shiftSummary(
                        Instant.parse("1970-01-01T00:00:00Z"), Instant.parse("2999-12-31T23:59:59Z")));

        assertEquals(ErrorCode.SHIFT_WINDOW_TOO_WIDE, error.fieldErrors().get(0).code());
    }

    // ---- Identidad autenticada ------------------------------------------------------------------

    @Test
    @DisplayName("sin sesión no se contesta: la identidad sale del contexto, no de un parámetro")
    void sinSesionNoSeContesta() {
        // Nadie entró: el holder está vacío.
        ForbiddenException error = assertThrows(
                ForbiddenException.class,
                () -> controlador().shiftSummary(INICIO, FIN));

        assertEquals(ErrorCode.ACCESS_DENIED, error.code());
    }

    // ---- Aislamiento por persona ----------------------------------------------------------------

    @Test
    @DisplayName("se cuenta el turno de quien pregunta, y de nadie más")
    void cuentaElTurnoDeQuienPregunta() {
        entraComo(YO);
        respondenCifras(7L, 3L);

        var resumen = controlador().shiftSummary(INICIO, FIN);

        assertEquals(7L, resumen.checks());
        assertEquals(3L, resumen.citations());

        // Las dos consultas llevan al MISMO identificador, el del contexto.
        ArgumentCaptor<UUID> enConsultas = ArgumentCaptor.forClass(UUID.class);
        verify(consultas).countForInspector(
                eq(new TenantId(MUNICIPALIDAD)), enConsultas.capture(), eq(INICIO), eq(FIN));
        assertEquals(YO, enConsultas.getValue());

        ArgumentCaptor<UUID> enBoletas = ArgumentCaptor.forClass(UUID.class);
        verify(boletas).search(
                eq(new TenantId(MUNICIPALIDAD)), any(), any(), enBoletas.capture(),
                any(), eq(INICIO), eq(FIN), any());
        assertEquals(YO, enBoletas.getValue());
    }

    @Test
    @DisplayName("y cambiando de persona cambia a quién se le cuenta: no hay identidad fija ni caché")
    void otraPersonaOtroTurno() {
        UUID otra = UUID.fromString("22222222-2222-2222-2222-222222222222");
        entraComo(otra);
        respondenCifras(0L, 0L);

        controlador().shiftSummary(INICIO, FIN);

        verify(consultas).countForInspector(any(), eq(otra), any(), any());
    }

    /**
     * La defensa estructural, que es la que de verdad impide pedir el turno de otro: el método no
     * tiene por dónde recibir una identidad. Si alguien añadiera un parámetro {@code inspectorUserId}
     * —la forma habitual de abrir este agujero— esta prueba deja de compilar, que es exactamente
     * cuando conviene enterarse.
     */
    @Test
    @DisplayName("la firma no admite una identidad de fuera")
    void laFirmaNoAdmiteIdentidadDeFuera() throws NoSuchMethodException {
        var metodo = InspectorEnforcementController.class
                .getMethod("shiftSummary", Instant.class, Instant.class);

        assertEquals(2, metodo.getParameterCount());
    }
}
