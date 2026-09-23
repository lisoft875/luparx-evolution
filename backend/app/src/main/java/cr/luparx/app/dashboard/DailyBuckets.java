package cr.luparx.app.dashboard;

import cr.luparx.core.money.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Convertir «los días que tuvieron algo» en «todos los días del rango».
 *
 * <p>Vive aparte del servicio por una razón concreta: es la única parte de la serie que se puede
 * equivocar sola, y la única que se puede probar sin base de datos. El resto de
 * {@link DashboardService#revenueSeries} es una consulta y un mapeo; esto es aritmética con bordes,
 * y los bordes de un calendario son de donde salen los gráficos corridos un día.</p>
 *
 * <p>Lo que hay que tener claro: un día sin recaudación es un <b>cero</b>, no un hueco. La base
 * devuelve sólo las filas que existen, y dibujar eso tal cual produce un gráfico de cinco barras
 * para una semana, donde el ojo lee «faltan datos» o directamente corre las fechas.</p>
 */
final class DailyBuckets {

    private DailyBuckets() {
    }

    /**
     * El instante en que empieza {@code date} en {@code zone}.
     *
     * <p>El «hoy» de una municipalidad empieza a la medianoche de SU reloj. Para San José eso son las
     * 06:00Z, y cortar en UTC le movería al día siguiente todo lo que se cobró después de las 6 de la
     * tarde.</p>
     */
    static Instant startOf(LocalDate date, ZoneId zone) {
        return date.atStartOfDay(zone).toInstant();
    }

    /**
     * El instante en que termina {@code date}, exclusivo.
     *
     * <p>Exclusivo y no «23:59:59»: ese último segundo existe, y un pago capturado dentro de él
     * desaparecería del total de su propio día.</p>
     */
    static Instant endOf(LocalDate date, ZoneId zone) {
        return date.plusDays(1L).atStartOfDay(zone).toInstant();
    }

    /**
     * Un día por cada fecha entre {@code from} y {@code to}, ambos incluidos.
     *
     * @param totals lo que la consulta encontró, por fecha: {@code [montoMenor, cantidad]}
     */
    static List<DashboardService.RevenueDay> fill(LocalDate from, LocalDate to,
                                                  Map<LocalDate, long[]> totals, String currencyCode) {
        List<DashboardService.RevenueDay> days = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1L)) {
            long[] found = totals.get(day);
            long minor = found == null ? 0L : found[0];
            long count = found == null ? 0L : found[1];
            days.add(new DashboardService.RevenueDay(day, Money.ofMinor(minor, currencyCode), count));
        }
        return List.copyOf(days);
    }
}
