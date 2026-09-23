package cr.luparx.app.config;

import cr.luparx.core.id.Uuid7;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.tenancy.entity.Tenant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Datos de demostración para poder MIRAR el Inicio del administrador.
 *
 * <h2>Para qué existe</h2>
 *
 * <p>La portada del administrador se construyó contra una especificación visual, pero en staging casi
 * todos sus módulos salen en cero: el sembrador de siempre crea municipios, zonas, bahías, estadías
 * pasadas y boletas, y <b>nunca crea un pago</b>. Sin pagos no hay «Recaudación hoy» y el gráfico de
 * siete días es una línea plana, que son los dos bloques más grandes de la pantalla. Comparar ese
 * resultado contra la referencia no dice nada sobre el diseño: dice que la base está vacía.</p>
 *
 * <h2>Cómo se enciende y cómo se apaga</h2>
 *
 * <p>Tres cerrojos, y los tres tienen que estar abiertos:</p>
 *
 * <ol>
 *   <li>el perfil tiene que ser {@code dev} o {@code demo} — en producción el bean ni siquiera
 *       existe;</li>
 *   <li>{@code luparx.dev.seed-demo-data} tiene que seguir activo, porque esto se apoya en las zonas
 *       y bahías que siembra {@link DevDataSeeder};</li>
 *   <li>{@code luparx.dev.seed-dashboard-demo} tiene que valer {@code true}
 *       <b>explícitamente</b>. Sin {@code matchIfMissing}: ausente es apagado.</li>
 * </ol>
 *
 * <p>El tercero es a propósito distinto de los otros dos. El sembrado de siempre es el estado normal
 * de una instancia de demostración; esto es un andamio que se levanta para sacar una captura y se
 * baja después. Un andamio que se enciende solo es un andamio que alguien se olvida de bajar.</p>
 *
 * <pre>
 *   # encender
 *   LUPARX_DEV_SEED_DASHBOARD_DEMO=true   (en infra/.env, y recrear el backend)
 *
 *   # apagar: quitar la variable, recrear, y borrar lo sembrado
 *   delete from parking_sessions where plate_snapshot like 'DMO%';
 *   delete from payments where provider = 'demo-seed';
 * </pre>
 *
 * <h2>Lo que NO siembra, y por qué</h2>
 *
 * <p><b>La auditoría.</b> La especificación prohíbe alimentar auditoría con datos de demostración, y
 * tiene toda la razón: el rastro es la única tabla de esta plataforma que existe para ser creída.
 * Meterle entradas inventadas para que la tarjeta de «Actividad reciente» se vea llena sería
 * ensuciar justo aquello cuyo valor es no estar sucio. Esa tarjeta se llena sola en cuanto alguien
 * use el portal, y mientras tanto muestra su estado vacío, que es la verdad.</p>
 *
 * <p><b>Conciliación.</b> Los pagos se escriben con {@code NOT_APPLICABLE}, que en este dominio
 * significa «nadie va a reportar esta plata» —el caso del dinero de caja—. Así entran en lo
 * recaudado, que es lo que la pantalla tiene que mostrar, y quedan fuera de «lo que el proveedor
 * todavía debe», que es la cifra que un descuadre arruinaría.</p>
 *
 * <h2>Se reconocen a simple vista</h2>
 *
 * <p>Todo lo que escribe lleva un marcador: los pagos van con {@code provider = 'demo-seed'} y las
 * estadías con placas {@code DMO###}. Dos condiciones {@code where} los borran por completo, y
 * ninguna de las dos puede alcanzar por accidente a una fila que no sea de este sembrador.</p>
 */
@Component
@Profile({"dev", "demo"})
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-dashboard-demo", havingValue = "true")
public class DevDashboardSeeder {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevDashboardSeeder.class);

    /** El marcador de los pagos. Es también la condición que los borra. */
    static final String MARCA_PAGO = "demo-seed";

    /** El prefijo de placa de las estadías inventadas. Ninguna placa real de Costa Rica empieza así. */
    static final String MARCA_PLACA = "DMO";

    /** Cuántos días trae el gráfico. Siete, como la pantalla. */
    private static final int DIAS = 7;

    /**
     * Los porcentajes de ocupación, en orden, uno por zona.
     *
     * <p>Distintos entre sí a propósito: una barra por zona sólo se puede evaluar visualmente si las
     * barras miden cosas distintas. Y todos dentro de lo que una municipalidad ve de verdad —entre
     * el 40% y el 85%—; un 100% se dibuja bien pero no prueba nada, porque es el único valor que no
     * deja ver si la barra está bien escalada.</p>
     */
    private static final int[] OCUPACION = {82, 71, 55, 43};

    /**
     * Lo recaudado cada día, de hace seis días a hoy, en unidades menores.
     *
     * <p>Con altos y bajos porque el gráfico existe para mostrar la FORMA. Siete barras parecidas
     * comprueban que el componente dibuja; no comprueban que se entienda cuál fue el martes flojo,
     * que es para lo que alguien abre esa tarjeta.</p>
     */
    private static final long[] RECAUDADO_POR_DIA = {
            9_800_000L, 12_150_000L, 11_000_000L, 15_670_000L, 8_730_000L, 19_040_000L, 24_565_000L,
    };

    /** Cuántos pagos se reparten dentro de cada día. Suficientes para que el conteo no sea uno. */
    private static final int PAGOS_POR_DIA = 6;

    /**
     * Tope de bahías que se leen por zona.
     *
     * <p>Una zona con más bahías que esto simplemente se llena hasta acá: el porcentaje sale sobre lo
     * leído, no sobre el parque entero. Existe porque el número de estadías que hay que inventar es
     * proporcional a las bahías, y un municipio grande convertiría un fixture en una carga.</p>
     */
    private static final int MAX_BAHIAS = 400;

    private static final String INSERT_PAYMENT_SQL = """
            INSERT INTO payments (id, tenant_id, method, status, gross_amount_minor, net_amount_minor,
                                  currency_code, purpose, provider, provider_reference, idempotency_key,
                                  requested_at, confirmed_at, reconciliation_status, created_at, updated_at,
                                  version)
            VALUES (?, ?, 'COUNTER_CASH', 'CAPTURED', ?, ?, ?, 'WALLET_TOPUP', ?, ?, ?, ?, ?,
                    'NOT_APPLICABLE', ?, ?, 0)
            """;

    private static final String INSERT_SESSION_SQL = """
            INSERT INTO parking_sessions (id, tenant_id, user_id, plate_snapshot, zone_id, space_id,
                                          started_at, expires_at, status, amount_minor, currency_code,
                                          payment_status, credit_minutes_applied, created_at, updated_at,
                                          version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 0, ?, ?, 0)
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ParkingZoneRepository zoneRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final Clock clock;

    public DevDashboardSeeder(JdbcTemplate jdbcTemplate,
                              ParkingZoneRepository zoneRepository,
                              ParkingSpaceRepository spaceRepository,
                              Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.zoneRepository = zoneRepository;
        this.spaceRepository = spaceRepository;
        this.clock = clock;
    }

    /**
     * @param tenants   las municipalidades sembradas, por slug
     * @param citizenId el ciudadano al que se le cuelgan las estadías inventadas. {@code user_id} no
     *                  admite nulo y una estadía sin dueño no existe en este dominio
     */
    public void seed(Map<String, Tenant> tenants, UUID citizenId) {
        if (citizenId == null) {
            LOGGER.warn("Datos demo del Inicio: no hay ciudadano sembrado, no se crean estadías.");
        }
        for (Tenant tenant : tenants.values()) {
            try {
                int pagos = seedPayments(tenant);
                int estadias = citizenId == null ? 0 : seedOccupancy(tenant, citizenId);
                if (pagos > 0 || estadias > 0) {
                    LOGGER.info("Datos demo del Inicio · {}: {} pagos, {} estadías activas.",
                            tenant.getSlug(), Integer.valueOf(pagos), Integer.valueOf(estadias));
                }
            } catch (RuntimeException fallo) {
                // Un fixture que impide arrancar es peor que un fixture que falta.
                LOGGER.warn("Datos demo del Inicio: falló {} — {}", tenant.getSlug(), fallo.toString());
            }
        }
    }

    // --- pagos -------------------------------------------------------------------------------------

    /**
     * Siete días de recaudación, cortados en el reloj de la municipalidad.
     *
     * <p>En SU zona horaria y no en UTC, porque es exactamente así como los va a volver a agrupar
     * {@code revenue-series}: sembrarlos en UTC pondría la recaudación de la tarde en el día
     * siguiente y el gráfico saldría corrido, que es el defecto que ese endpoint vino a evitar.</p>
     */
    private int seedPayments(Tenant tenant) {
        // Idempotente: si ya se sembró, no se duplica. El sembrador corre en cada arranque.
        Integer existentes = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payments WHERE tenant_id = ? AND provider = ?",
                Integer.class, tenant.getId(), MARCA_PAGO);
        if (existentes != null && existentes > 0) {
            return 0;
        }

        ZoneId zona = ZoneId.of(tenant.getTimeZone());
        LocalDate hoy = LocalDate.ofInstant(clock.instant(), zona);
        String moneda = tenant.getCurrencyCode();
        int creados = 0;

        for (int dia = 0; dia < DIAS; dia++) {
            LocalDate fecha = hoy.minusDays((long) (DIAS - 1 - dia));
            long totalDelDia = RECAUDADO_POR_DIA[dia];
            for (int i = 0; i < PAGOS_POR_DIA; i++) {
                long monto = reparto(totalDelDia, i);
                if (monto <= 0L) {
                    continue;
                }
                // Repartidos dentro del horario de cobro, no todos a la medianoche: un pago a las
                // 00:00 en punto es lo que delata un fixture a simple vista.
                Instant cuando = fecha.atStartOfDay(zona).plusHours(7L + i * 2L).toInstant();
                String referencia = MARCA_PAGO + ":" + tenant.getSlug() + ":" + fecha + ":" + i;
                jdbcTemplate.update(INSERT_PAYMENT_SQL,
                        Uuid7.generate(), tenant.getId(),
                        Long.valueOf(monto), Long.valueOf(monto), moneda,
                        MARCA_PAGO, referencia, referencia,
                        java.sql.Timestamp.from(cuando), java.sql.Timestamp.from(cuando),
                        java.sql.Timestamp.from(cuando), java.sql.Timestamp.from(cuando));
                creados++;
            }
        }
        return creados;
    }

    /**
     * El monto del pago {@code i} dentro de un día.
     *
     * <p>Reparto desparejo y no {@code total / n}: seis pagos idénticos en un listado se leen como lo
     * que son. El último se lleva el resto, así que la suma del día es EXACTAMENTE el total —si se
     * perdiera un colón por redondeo, el gráfico y el KPI dirían cifras distintas y alguien pasaría
     * una tarde buscando el descuadre.</p>
     */
    private static long reparto(long total, int indice) {
        int[] pesos = {12, 19, 14, 22, 15, 18};
        int suma = 0;
        for (int peso : pesos) {
            suma += peso;
        }
        if (indice == pesos.length - 1) {
            long repartido = 0L;
            for (int i = 0; i < pesos.length - 1; i++) {
                repartido += total * pesos[i] / suma;
            }
            return total - repartido;
        }
        return total * pesos[indice] / suma;
    }

    // --- ocupación ---------------------------------------------------------------------------------

    /**
     * Estadías corriendo ahora mismo, tantas como haga falta para que cada zona muestre su
     * porcentaje.
     *
     * <p>El porcentaje que pinta la pantalla es estadías activas sobre bahías en servicio, así que no
     * hay forma de «poner» un 82%: hay que crear el 82% de las bahías de esa zona. Por eso esto se
     * limita a las primeras zonas de cada municipio — no por prudencia decorativa, sino porque el
     * número de filas es proporcional al parque de bahías y San José tiene ochocientas.</p>
     */
    private int seedOccupancy(Tenant tenant, UUID citizenId) {
        Integer existentes = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM parking_sessions WHERE tenant_id = ? AND plate_snapshot LIKE ?",
                Integer.class, tenant.getId(), MARCA_PLACA + "%");
        if (existentes != null && existentes > 0) {
            return 0;
        }

        List<ParkingZone> zonas = zoneRepository.findByTenantIdOrderByCodeAsc(tenant.getId());
        if (zonas.isEmpty()) {
            return 0;
        }

        Instant ahora = clock.instant();
        String moneda = tenant.getCurrencyCode();
        int creadas = 0;
        int placa = 1;

        for (int i = 0; i < Math.min(OCUPACION.length, zonas.size()); i++) {
            ParkingZone zona = zonas.get(i);
            // Sólo las bahías EN SERVICIO, que es el mismo denominador que usa la pantalla. Contar
            // una bahía cerrada por obras como capacidad reportaría al municipio más vacío de lo que
            // está, justo en la semana en que más congestionado se encuentra.
            List<ParkingSpace> libres = spaceRepository
                    .findByTenantIdAndZoneIdOrderByCodeAsc(tenant.getId(), zona.getId(), PageRequest.of(0, MAX_BAHIAS))
                    .getContent().stream()
                    .filter(bahia -> bahia.getStatus() == ParkingSpaceStatus.AVAILABLE)
                    .toList();
            if (libres.isEmpty()) {
                continue;
            }
            int objetivo = Math.max(1, libres.size() * OCUPACION[i] / 100);
            List<Object[]> lote = new ArrayList<>();
            for (int n = 0; n < objetivo && n < libres.size(); n++) {
                // Escalonadas hacia atrás: todas empezadas en el mismo segundo también vencerían en
                // el mismo segundo, y la pantalla pasaría de llena a vacía de golpe.
                Instant inicio = ahora.minusSeconds((long) (n % 90) * 60L + 60L);
                lote.add(new Object[] {
                        Uuid7.generate(), tenant.getId(), citizenId,
                        String.format("%s%03d", MARCA_PLACA, Integer.valueOf(placa++ % 1000)),
                        zona.getId(), libres.get(n).getId(),
                        java.sql.Timestamp.from(inicio),
                        java.sql.Timestamp.from(inicio.plusSeconds(120L * 60L)),
                        ParkingSessionStatus.ACTIVE.name(),
                        Long.valueOf(60_000L), moneda,
                        java.sql.Timestamp.from(inicio), java.sql.Timestamp.from(inicio),
                });
            }
            jdbcTemplate.batchUpdate(INSERT_SESSION_SQL, lote);
            creadas += lote.size();
        }
        return creadas;
    }
}
