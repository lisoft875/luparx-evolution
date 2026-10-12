package cr.luparx.enforcement.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.repository.EnforcementCheckRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * El conteo de consultas de una jornada, y lo poco que esta prueba puede demostrar (12-10-2026).
 *
 * <p>Conviene ser preciso sobre su alcance, porque una prueba que promete más de lo que mide es
 * peor que ninguna. Este repositorio no tiene infraestructura de pruebas con base de datos —no hay
 * un solo {@code @DataJpaTest}, {@code @SpringBootTest} ni Testcontainers en los diecisiete
 * archivos de prueba del backend—, así que la consulta JPQL en sí NO se ejecuta aquí: eso se
 * comprueba la primera vez que el endpoint contesta en staging.</p>
 *
 * <p>Lo que sí demuestra, y que es exactamente la clase de error que un humano comete al escribir
 * una delegación de cuatro parámetros: que la municipalidad, la persona y los dos extremos de la
 * ventana llegan al repositorio en ese orden y sin intercambiarse. Un {@code from} y un {@code to}
 * cambiados de sitio devuelven cero para siempre y nadie se entera, porque cero es una respuesta
 * verosímil para un turno tranquilo.</p>
 */
class ShiftSummaryCountTest {

    private static final Instant DESDE = Instant.parse("2026-10-12T06:00:00Z");
    private static final Instant HASTA = Instant.parse("2026-10-12T18:00:00Z");

    @Test
    void pasaMunicipalidadPersonaYVentanaEnEseOrden() {
        EnforcementCheckRepository repositorio = mock(EnforcementCheckRepository.class);
        EnforcementCheckService servicio = new EnforcementCheckService(
                repositorio, Clock.fixed(HASTA, ZoneOffset.UTC));

        TenantId municipalidad = TenantId.generate();
        UUID fiscalizador = Uuid7.generate();
        when(repositorio.countForInspector(any(), any(), any(), any())).thenReturn(7L);

        long consultas = servicio.countForInspector(municipalidad, fiscalizador, DESDE, HASTA);

        assertThat(consultas).isEqualTo(7L);

        ArgumentCaptor<Instant> desde = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> hasta = ArgumentCaptor.forClass(Instant.class);
        org.mockito.Mockito.verify(repositorio).countForInspector(
                eq(municipalidad.value()), eq(fiscalizador), desde.capture(), hasta.capture());
        assertThat(desde.getValue()).isEqualTo(DESDE);
        assertThat(hasta.getValue()).isEqualTo(HASTA);
        assertThat(desde.getValue()).isBefore(hasta.getValue());
    }
}
