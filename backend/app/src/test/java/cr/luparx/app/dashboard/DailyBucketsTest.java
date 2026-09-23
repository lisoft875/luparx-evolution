package cr.luparx.app.dashboard;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Los bordes del gráfico de recaudación.
 *
 * <p>Existen estas pruebas porque las dos formas de equivocarse acá no se ven en pantalla: un día que
 * falta se lee como una barra baja, y un día corrido se lee como una barra en el día equivocado.
 * Ninguna de las dos hace fallar nada; las dos hacen que alguien decida sobre un número que no es.</p>
 *
 * <p>Se usa {@code America/Costa_Rica} (UTC-6 fijo, sin horario de verano) para que una falla
 * signifique que la aritmética está mal y nunca que el calendario se movió por debajo.</p>
 */
class DailyBucketsTest {

    private static final ZoneId CR = ZoneId.of("America/Costa_Rica");
    private static final String CRC = "CRC";

    @Nested
    @DisplayName("El día empieza y termina en el reloj de la municipalidad")
    class Limites {

        @Test
        @DisplayName("la medianoche de San José son las 06:00Z, no las 00:00Z")
        void inicioEnZonaLocal() {
            assertEquals(Instant.parse("2026-09-23T06:00:00Z"),
                    DailyBuckets.startOf(LocalDate.of(2026, 9, 23), CR));
        }

        @Test
        @DisplayName("el fin es exclusivo: la medianoche del día siguiente")
        void finExclusivo() {
            // Y no 23:59:59: ese último segundo existe, y un pago capturado dentro de él se caería
            // del total de su propio día.
            assertEquals(Instant.parse("2026-09-24T06:00:00Z"),
                    DailyBuckets.endOf(LocalDate.of(2026, 9, 23), CR));
        }

        @Test
        @DisplayName("un rango de un solo día cubre veinticuatro horas")
        void unSoloDia() {
            LocalDate hoy = LocalDate.of(2026, 9, 23);
            assertEquals(24L * 60L * 60L,
                    DailyBuckets.endOf(hoy, CR).getEpochSecond() - DailyBuckets.startOf(hoy, CR).getEpochSecond());
        }
    }

    @Nested
    @DisplayName("Todos los días del rango, incluidos los que no recaudaron")
    class Relleno {

        @Test
        @DisplayName("siete días pedidos son siete días devueltos, aunque sólo dos tengan pagos")
        void completaLosVacios() {
            LocalDate desde = LocalDate.of(2026, 9, 17);
            LocalDate hasta = LocalDate.of(2026, 9, 23);
            Map<LocalDate, long[]> encontrado = Map.of(
                    LocalDate.of(2026, 9, 18), new long[] { 145_000L, 3L },
                    LocalDate.of(2026, 9, 23), new long[] { 90_000L, 2L });

            List<DashboardService.RevenueDay> days = DailyBuckets.fill(desde, hasta, encontrado, CRC);

            assertEquals(7, days.size());
            assertEquals(desde, days.get(0).date());
            assertEquals(hasta, days.get(6).date());
        }

        @Test
        @DisplayName("un día sin pagos vale cero, y el cero lleva la moneda de la municipalidad")
        void elVacioEsCero() {
            List<DashboardService.RevenueDay> days = DailyBuckets.fill(
                    LocalDate.of(2026, 9, 17), LocalDate.of(2026, 9, 17), Map.of(), CRC);

            assertEquals(0L, days.get(0).total().minorUnits());
            assertEquals(0L, days.get(0).count());
            // Un cero sin moneda obliga al cliente a inventarse cuál es, y un gráfico con dos monedas
            // mezcladas suma manzanas con naranjas sin avisar.
            assertEquals(CRC, days.get(0).total().currencyCode());
        }

        @Test
        @DisplayName("cada monto queda en SU día, no corrido")
        void cadaMontoEnSuDia() {
            LocalDate desde = LocalDate.of(2026, 9, 21);
            LocalDate hasta = LocalDate.of(2026, 9, 23);
            Map<LocalDate, long[]> encontrado = Map.of(LocalDate.of(2026, 9, 22), new long[] { 500L, 1L });

            List<DashboardService.RevenueDay> days = DailyBuckets.fill(desde, hasta, encontrado, CRC);

            assertEquals(0L, days.get(0).total().minorUnits());
            assertEquals(500L, days.get(1).total().minorUnits());
            assertEquals(0L, days.get(2).total().minorUnits());
        }

        @Test
        @DisplayName("el primer y el último día del rango entran, no se quedan afuera")
        void extremosIncluidos() {
            LocalDate desde = LocalDate.of(2026, 9, 22);
            LocalDate hasta = LocalDate.of(2026, 9, 23);
            Map<LocalDate, long[]> encontrado = Map.of(
                    desde, new long[] { 100L, 1L },
                    hasta, new long[] { 200L, 1L });

            List<DashboardService.RevenueDay> days = DailyBuckets.fill(desde, hasta, encontrado, CRC);

            assertEquals(2, days.size());
            assertEquals(100L, days.get(0).total().minorUnits());
            assertEquals(200L, days.get(1).total().minorUnits());
        }

        @Test
        @DisplayName("un mes que cruza de año no pierde ningún día")
        void cruceDeAnio() {
            List<DashboardService.RevenueDay> days = DailyBuckets.fill(
                    LocalDate.of(2026, 12, 30), LocalDate.of(2027, 1, 2), Map.of(), CRC);

            assertEquals(4, days.size());
            assertEquals(LocalDate.of(2027, 1, 2), days.get(3).date());
        }
    }
}
