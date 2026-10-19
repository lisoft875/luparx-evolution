package cr.luparx.app.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.config.GeoProperties;
import cr.luparx.app.geo.GeoJsonGeometryValidator;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.model.ZoneGeometrySource;
import cr.luparx.parking.model.ZoneGeometryStatus;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.ZoneGeometryReviewRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * La regla que no se puede saltar: <b>un dato de demostración no se vuelve oficial porque alguien
 * le cambie el estado</b> (CONTRACT.md v0.44, ADR 0029).
 *
 * <p>Estas pruebas no tocan la base. Lo que comprueban es que el servicio se NIEGUE antes de
 * escribir, con un código que el cliente pueda entender, en vez de dejar que reviente el CHECK
 * {@code ck_parking_zones_geom_demo_never_verified} con una violación de integridad. Las dos
 * defensas existen a propósito y son distintas: ésta explica, la de la base garantiza.</p>
 *
 * <p>La otra mitad —que redibujar degrada el sello— vive en una sola sentencia SQL y se comprueba
 * en {@code ZoneGeometrySqlRulesTest}, que lee el repositorio como texto. Verificarla de verdad
 * contra PostGIS exige un entorno con base, y esa prueba está declarada SIN EJECUTAR en el
 * informe en lugar de simularse acá.</p>
 */
class ZoneGeometryReviewTest {

    private static final TenantId TENANT = new TenantId(UUID.randomUUID());
    private static final UUID ZONA = UUID.randomUUID();
    private static final UUID QUIEN = UUID.randomUUID();
    private static final Instant AHORA = Instant.parse("2026-10-16T15:04:05Z");

    private final ParkingZoneRepository repositorio = mock(ParkingZoneRepository.class);
    private final ZoneGeometryService servicio = new ZoneGeometryService(
            repositorio,
            mock(GeoJsonGeometryValidator.class),
            new GeoProperties(null, null, null),
            new ObjectMapper(),
            Clock.fixed(AHORA, ZoneOffset.UTC));

    private void zonaCon(boolean dibujada, String procedencia, String estado) {
        ZoneGeometryReviewRow fila = mock(ZoneGeometryReviewRow.class);
        when(fila.getDrawn()).thenReturn(dibujada);
        when(fila.getSource()).thenReturn(procedencia);
        when(fila.getStatus()).thenReturn(estado);
        when(repositorio.findGeometryReview(TENANT.value(), ZONA)).thenReturn(Optional.of(fila));
        when(repositorio.reviewGeometry(any(), any(), any(), any(), any(), any(), anyLong()))
                .thenReturn(1);
    }

    private UnprocessableEntityException seNiegaA(ZoneGeometryStatus decision, ZoneGeometrySource declarada) {
        return assertThrows(UnprocessableEntityException.class,
                () -> servicio.review(TENANT, ZONA, 7L, decision, declarada, QUIEN));
    }

    @Nested
    @DisplayName("una geometría DEMO no asciende a oficial")
    class Demo {

        @Test
        @DisplayName("aprobarla se rechaza con su propio código, y no se escribe nada")
        void aprobarUnaDemoSeNiega() {
            zonaCon(true, ZoneGeometrySource.DEMO.name(), ZoneGeometryStatus.REJECTED.name());

            UnprocessableEntityException refusal = seNiegaA(ZoneGeometryStatus.VERIFIED, null);

            assertEquals(ErrorCode.ZONE_GEOMETRY_DEMO_NOT_VERIFIABLE, refusal.code());
            assertEquals(422, refusal.httpStatus());
            // Lo importante no es sólo el mensaje: la fila no se tocó.
            verify(repositorio, never())
                    .reviewGeometry(any(), any(), any(), any(), any(), any(), anyLong());
        }

        @Test
        @DisplayName("tampoco declarando otra procedencia en la misma petición")
        void aprobarUnaDemoRebautizandolaTampoco() {
            // El intento obvio: «es oficial porque yo lo digo». La procedencia que vale es la que
            // tiene la fila; cambiarla exige volver a dibujar o importar, que es otro extremo.
            zonaCon(true, ZoneGeometrySource.DEMO.name(), ZoneGeometryStatus.REJECTED.name());

            UnprocessableEntityException refusal =
                    seNiegaA(ZoneGeometryStatus.VERIFIED, ZoneGeometrySource.MUNICIPAL_OFFICIAL);

            assertEquals(ErrorCode.ZONE_GEOMETRY_DEMO_NOT_VERIFIABLE, refusal.code());
            verify(repositorio, never())
                    .reviewGeometry(any(), any(), any(), any(), any(), any(), anyLong());
        }

        @Test
        @DisplayName("ni declarando DEMO sobre un polígono que no lo era")
        void declararDemoYAprobarTampoco() {
            zonaCon(true, ZoneGeometrySource.ADMIN_DRAWING.name(), ZoneGeometryStatus.UNVERIFIED.name());

            UnprocessableEntityException refusal =
                    seNiegaA(ZoneGeometryStatus.VERIFIED, ZoneGeometrySource.DEMO);

            assertEquals(ErrorCode.ZONE_GEOMETRY_DEMO_NOT_VERIFIABLE, refusal.code());
        }

        @Test
        @DisplayName("pero RECHAZARLA sí se puede: la demo se conserva, marcada")
        void rechazarUnaDemoSiSePuede() {
            zonaCon(true, ZoneGeometrySource.DEMO.name(), ZoneGeometryStatus.UNVERIFIED.name());

            ZoneGeometryService.ReviewOutcome resultado = servicio.review(
                    TENANT, ZONA, 7L, ZoneGeometryStatus.REJECTED, null, QUIEN);

            assertEquals(ZoneGeometryStatus.REJECTED.name(), resultado.status());
            assertEquals(ZoneGeometrySource.DEMO.name(), resultado.source());
            verify(repositorio).reviewGeometry(TENANT.value(), ZONA,
                    ZoneGeometryStatus.REJECTED.name(), null, QUIEN, AHORA, 7L);
        }
    }

    @Nested
    @DisplayName("lo demás que el servicio se niega a hacer")
    class Negativas {

        @Test
        @DisplayName("no se aprueba un perímetro que no está dibujado")
        void sinPoligonoNoHayNadaQueAprobar() {
            zonaCon(false, null, ZoneGeometryStatus.UNVERIFIED.name());

            UnprocessableEntityException refusal = seNiegaA(ZoneGeometryStatus.VERIFIED, null);

            assertEquals(ErrorCode.ZONE_GEOMETRY_MISSING, refusal.code());
            verify(repositorio, never())
                    .reviewGeometry(any(), any(), any(), any(), any(), any(), anyLong());
        }

        @Test
        @DisplayName("una zona que desapareció entre la lectura y la escritura es un conflicto, no un 500")
        void zonaQueYaNoEsta() {
            when(repositorio.findGeometryReview(TENANT.value(), ZONA)).thenReturn(Optional.empty());

            assertEquals(409, assertThrows(cr.luparx.core.error.ConflictException.class,
                    () -> servicio.review(TENANT, ZONA, 7L, ZoneGeometryStatus.VERIFIED, null, QUIEN))
                    .httpStatus());
        }
    }

    @Nested
    @DisplayName("el camino feliz")
    class Aprobar {

        @Test
        @DisplayName("aprobar un dibujo del portal declarándolo oficial")
        void aprobarUnDibujo() {
            zonaCon(true, ZoneGeometrySource.ADMIN_DRAWING.name(), ZoneGeometryStatus.UNVERIFIED.name());

            ZoneGeometryService.ReviewOutcome resultado = servicio.review(
                    TENANT, ZONA, 7L, ZoneGeometryStatus.VERIFIED,
                    ZoneGeometrySource.MUNICIPAL_OFFICIAL, QUIEN);

            verify(repositorio).reviewGeometry(TENANT.value(), ZONA,
                    ZoneGeometryStatus.VERIFIED.name(), ZoneGeometrySource.MUNICIPAL_OFFICIAL.name(),
                    QUIEN, AHORA, 7L);
            // El antes y el después, que es lo que la bitácora publica.
            assertEquals(ZoneGeometryStatus.UNVERIFIED.name(), resultado.previousStatus());
            assertEquals(ZoneGeometrySource.ADMIN_DRAWING.name(), resultado.previousSource());
            assertEquals(ZoneGeometryStatus.VERIFIED.name(), resultado.status());
            assertEquals(ZoneGeometrySource.MUNICIPAL_OFFICIAL.name(), resultado.source());
        }

        @Test
        @DisplayName("omitir la procedencia deja la que había")
        void sinProcedenciaDeclaradaSeConservaLaQueHabia() {
            zonaCon(true, ZoneGeometrySource.GIS_IMPORT.name(), ZoneGeometryStatus.PENDING_REVIEW.name());

            ZoneGeometryService.ReviewOutcome resultado = servicio.review(
                    TENANT, ZONA, 7L, ZoneGeometryStatus.VERIFIED, null, QUIEN);

            verify(repositorio).reviewGeometry(eq(TENANT.value()), eq(ZONA),
                    eq(ZoneGeometryStatus.VERIFIED.name()), eq((String) null), eq(QUIEN), eq(AHORA), eq(7L));
            assertEquals(ZoneGeometrySource.GIS_IMPORT.name(), resultado.source());
        }

        @Test
        @DisplayName("la versión que se envía es la que el llamador leyó: un conflicto no se traga")
        void conflictoDeVersion() {
            zonaCon(true, ZoneGeometrySource.ADMIN_DRAWING.name(), ZoneGeometryStatus.UNVERIFIED.name());
            when(repositorio.reviewGeometry(any(), any(), any(), any(), any(), any(), anyLong()))
                    .thenReturn(0);

            assertEquals(409, assertThrows(cr.luparx.core.error.ConflictException.class,
                    () -> servicio.review(TENANT, ZONA, 7L, ZoneGeometryStatus.VERIFIED, null, QUIEN))
                    .httpStatus());
        }
    }

    @Nested
    @DisplayName("qué geometrías llegan al ciudadano")
    class FiltroDelCiudadano {

        @Test
        @DisplayName("por omisión, sólo las verificadas")
        void porOmisionSoloVerificadas() {
            assertEquals(java.util.Set.of("VERIFIED"),
                    new GeoProperties(null, null, null).effectiveCitizenGeometryStatuses());
        }

        @Test
        @DisplayName("una lista ampliada se respeta, sin importar espacios ni minúsculas")
        void listaAmpliada() {
            assertEquals(java.util.Set.of("VERIFIED", "UNVERIFIED"),
                    new GeoProperties(null, null, List.of(" verified ", "unverified"))
                            .effectiveCitizenGeometryStatuses());
        }

        @Test
        @DisplayName("un valor inventado se descarta: falla CERRADO, nunca abierto")
        void valorInventado() {
            assertEquals(java.util.Set.of("VERIFIED"),
                    new GeoProperties(null, null, List.of("VERIFIED", "OFICIAL"))
                            .effectiveCitizenGeometryStatuses());
        }

        @Test
        @DisplayName("una errata que no deja nada válido cae a VERIFIED, no a «todo»")
        void erratasSoloDejanLoSeguro() {
            assertEquals(java.util.Set.of("VERIFIED"),
                    new GeoProperties(null, null, List.of("VERIFIEDD", "", "  "))
                            .effectiveCitizenGeometryStatuses());
            assertEquals(java.util.Set.of("VERIFIED"),
                    new GeoProperties(null, null, List.of()).effectiveCitizenGeometryStatuses());
        }
    }
}
