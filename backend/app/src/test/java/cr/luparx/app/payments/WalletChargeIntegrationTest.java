package cr.luparx.app.payments;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.service.TestMoneySpendPolicy;
import cr.luparx.parking.service.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Lo que {@code WalletService.charge} hace contra un PostgreSQL de verdad (19-10-2026).
 *
 * <h2>Por qué esta prueba existe</h2>
 *
 * <p>La auditoría del 17-10-2026 dio por correctas, <b>leyendo el código</b>, las propiedades
 * transaccionales del cobro: que el bloqueo de la cuenta serializa los débitos, que el conteo de
 * movimientos de origen DEV ocurre dentro de esa misma transacción y después del bloqueo, y que un
 * rechazo no deja mutación parcial. El informe de JUnit del 19-10 lo dejó escrito como el único
 * hueco que quedaba: <i>«no se pueden demostrar sin una base de datos»</i>. Esto es esa base de
 * datos.</p>
 *
 * <p>Las pruebas unitarias que ya existen ({@code TestMoneySpendGuardTest}) cubren la
 * <b>decisión</b> del guard. Lo que no podían cubrir, y acá se cubre, es <b>cuándo</b> se toma esa
 * decisión y qué pasa alrededor: el orden respecto del bloqueo, la concurrencia real y el
 * rollback.</p>
 *
 * <h2>Por qué {@code @SpringBootTest} y no {@code @DataJpaTest}</h2>
 *
 * <p>{@code @DataJpaTest} envuelve cada prueba en una transacción que deshace al terminar. Eso es
 * cómodo y acá sería fatal: tres de las seis propiedades que hay que demostrar —concurrencia,
 * rollback y el orden dentro de la transacción— <b>son</b> el comportamiento transaccional, y no se
 * pueden observar desde dentro de una transacción que nunca confirma. Haría falta desactivar
 * justamente lo que {@code @DataJpaTest} aporta, y además reconstruir a mano el cableado real:
 * {@code WalletService} necesita {@code TenantService}, el {@code Clock} y la política del guard,
 * que es un {@code @Component} de {@code app}. Levantar el contexto completo cuesta unos segundos y
 * prueba el objeto que de verdad se despliega.</p>
 *
 * <h2>La imagen</h2>
 *
 * <p>{@code postgis/postgis:16-3.4-alpine}, exactamente la misma de {@code infra/docker-compose.yml}.
 * No es rutina: las migraciones hacen {@code CREATE EXTENSION postgis} (V38_0) y {@code citext}
 * (V1_0), así que una imagen de PostgreSQL pelado no levanta el esquema. Y usar la misma del
 * entorno de desarrollo evita probar contra un motor distinto del que corre la aplicación.</p>
 *
 * <p>Esta clase esta EXCLUIDA del build por defecto (patron {@code it.exclude} en app/pom.xml), para
 * que el backend se compile y pruebe sin Docker. Corre aparte con {@code mvn -Pintegration test},
 * que la incluye y —al no llevar ya {@code disabledWithoutDocker}— FALLA si Docker no esta, en vez
 * de dar un falso verde saltandola.</p>
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(WalletChargeIntegrationTest.PoliticaDeGuardia.class)
class WalletChargeIntegrationTest {

    @Container
    @SuppressWarnings("resource") // La cierra Testcontainers al terminar la JVM de la prueba.
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("luparx_test")
            .withUsername("luparx_test")
            .withPassword("luparx_test");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registro) {
        registro.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registro.add("spring.datasource.username", POSTGRES::getUsername);
        registro.add("spring.datasource.password", POSTGRES::getPassword);
        // Sin par de llaves JWT en el working-dir del modulo app, el contexto completo exige una
        // llave efimera en memoria (solo pruebas; en prod la propiedad queda en false).
        registro.add("luparx.jwt.ephemeral-keys-when-missing", () -> true);
    }

    /**
     * La política del guard, reemplazable por prueba.
     *
     * <p>{@code TestMoneySpendPolicySpring} decide con los perfiles activos, y acá no hay perfil
     * operativo que simular sin levantar otro contexto por cada caso. Lo que importa demostrar no
     * es cómo decide —eso ya lo cubre {@code TestMoneySpendGuardTest} con sus nueve casos— sino
     * <b>desde dónde</b> se la consulta: con qué conteo, dentro de qué transacción y después de
     * qué bloqueo. Por eso se sustituye por una que registra lo que ve y obedece lo que la prueba
     * le indique.</p>
     */
    @TestConfiguration
    static class PoliticaDeGuardia {

        @Bean
        @Primary
        PoliticaEspia politicaEspia() {
            return new PoliticaEspia();
        }
    }

    static final class PoliticaEspia implements TestMoneySpendPolicy {

        /** Lo que debe contestar; por omisión deja pasar. */
        volatile Function<Long, Optional<String>> respuesta = conteo -> Optional.empty();
        /** El conteo de movimientos DEV que recibió en la última llamada. */
        final AtomicReference<Long> ultimoConteo = new AtomicReference<>(null);
        /** Qué vio sobre el bloqueo de la cuenta cuando la llamaron. */
        final AtomicReference<String> bloqueoObservado = new AtomicReference<>(null);
        /** La cuenta sobre la que sondear el bloqueo, o null para no sondear. */
        volatile UUID cuentaASondear;
        volatile DataSource fuente;

        void reiniciar() {
            respuesta = conteo -> Optional.empty();
            ultimoConteo.set(null);
            bloqueoObservado.set(null);
            cuentaASondear = null;
        }

        @Override
        public Optional<String> motivoParaRechazarGasto(long movimientosDeOrigenDev) {
            ultimoConteo.set(movimientosDeOrigenDev);
            if (cuentaASondear != null && fuente != null) {
                bloqueoObservado.set(sondearBloqueo());
            }
            return respuesta.apply(movimientosDeOrigenDev);
        }

        /**
         * ¿Está bloqueada la fila de la cuenta <b>en este instante</b>?
         *
         * <p>Desde una conexión aparte —no la de la transacción que está cobrando— se intenta
         * {@code SELECT … FOR UPDATE NOWAIT} sobre la misma fila. Si la transacción del cobro ya
         * tomó el bloqueo, PostgreSQL contesta en el acto con {@code 55P03 lock_not_available} en
         * vez de esperar. Eso es lo que demuestra el ORDEN: cuando se consulta a la política, el
         * bloqueo ya estaba tomado.</p>
         */
        private String sondearBloqueo() {
            try (Connection otra = fuente.getConnection()) {
                otra.setAutoCommit(false);
                try (Statement s = otra.createStatement()) {
                    s.execute("SELECT id FROM wallet_accounts WHERE id = '" + cuentaASondear
                            + "' FOR UPDATE NOWAIT");
                    otra.rollback();
                    return "LIBRE";
                } catch (SQLException e) {
                    otra.rollback();
                    return "55P03".equals(e.getSQLState()) ? "BLOQUEADA" : "ERROR:" + e.getSQLState();
                }
            } catch (SQLException e) {
                return "ERROR_CONEXION:" + e.getMessage();
            }
        }
    }

    private static final String MONEDA = "CRC";

    @Autowired WalletService billetera;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate transacciones;
    @Autowired DataSource fuente;
    @Autowired PoliticaEspia politica;

    private TenantId municipalidad;
    private UserId persona;

    @BeforeEach
    void sembrar() {
        politica.reiniciar();
        politica.fuente = fuente;
        municipalidad = new TenantId(crearMunicipalidad());
        persona = new UserId(crearPersona());
    }

    // ---- 1 · Un débito válido ---------------------------------------------------------------

    @Test
    @DisplayName("un débito válido se escribe una vez y deja el saldo coherente con el asiento")
    void debitoValido() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(10_000, MONEDA), "carga-1");

        var movimiento = billetera.charge(municipalidad, persona, Money.ofMinor(2_500, MONEDA),
                WalletTransactionType.SESSION_CHARGE, null, "cobro-1");

        assertNotNull(movimiento);
        assertEquals(7_500L, saldo());
        assertEquals(1, cuantosCobros());
        // El asiento guarda el monto en negativo y el saldo que quedó: las dos cifras tienen que
        // contar la misma historia que la cuenta.
        assertEquals(-2_500L, unicoCobro("amount_minor"));
        assertEquals(7_500L, unicoCobro("balance_after_minor"));
    }

    // ---- 2 · Saldo insuficiente ----------------------------------------------------------------

    @Test
    @DisplayName("saldo insuficiente: se rechaza y no queda ni media mutación")
    void saldoInsuficiente() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(1_000, MONEDA), "carga-2");

        ConflictException error = assertThrows(ConflictException.class, () ->
                billetera.charge(municipalidad, persona, Money.ofMinor(5_000, MONEDA),
                        WalletTransactionType.SESSION_CHARGE, null, "cobro-2"));

        assertEquals(ErrorCode.INSUFFICIENT_BALANCE, error.code());
        assertEquals(1_000L, saldo());
        assertEquals(0, cuantosCobros());
    }

    // ---- 3 · El orden: el conteo DEV ocurre DESPUÉS del bloqueo --------------------------------

    @Test
    @DisplayName("cuando se consulta el guard, la fila de la cuenta YA está bloqueada")
    void elGuardSeConsultaConLaCuentaBloqueada() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(5_000, MONEDA), "carga-3");
        politica.cuentaASondear = idDeLaCuenta();

        billetera.charge(municipalidad, persona, Money.ofMinor(1_000, MONEDA),
                WalletTransactionType.SESSION_CHARGE, null, "cobro-3");

        // Si el conteo se leyera ANTES del bloqueo, el sondeo habría encontrado la fila libre y
        // existiría la ventana entre comprobar y descontar que este diseño cierra.
        assertEquals("BLOQUEADA", politica.bloqueoObservado.get());
    }

    @Test
    @DisplayName("y el conteo que recibe es el de los movimientos DEV de ESA billetera")
    void elConteoEsElDeEstaBilletera() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(4_000, MONEDA), "carga-4a",
                WalletTopupSource.DEV, "ref-dev-1", null);
        billetera.topUp(municipalidad, persona, Money.ofMinor(1_000, MONEDA), "carga-4b",
                WalletTopupSource.CITIZEN, "ref-ciu-1", null);
        // Otra billetera, con su propio saldo de prueba: no debe contaminar el conteo de la nuestra.
        UserId otra = new UserId(crearPersona());
        billetera.topUp(municipalidad, otra, Money.ofMinor(9_000, MONEDA), "carga-4c",
                WalletTopupSource.DEV, "ref-dev-2", null);

        billetera.charge(municipalidad, persona, Money.ofMinor(500, MONEDA),
                WalletTransactionType.SESSION_CHARGE, null, "cobro-4");

        assertEquals(1L, politica.ultimoConteo.get());
    }

    @Test
    @DisplayName("si el guard rechaza, el débito se deshace entero: ni saldo ni asiento")
    void elRechazoDelGuardNoDejaRastro() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(6_000, MONEDA), "carga-5",
                WalletTopupSource.DEV, "ref-dev-3", null);
        politica.respuesta = conteo -> Optional.of("saldo de prueba en instalación operativa");

        ConflictException error = assertThrows(ConflictException.class, () ->
                billetera.charge(municipalidad, persona, Money.ofMinor(1_000, MONEDA),
                        WalletTransactionType.SESSION_CHARGE, null, "cobro-5"));

        assertEquals(ErrorCode.TEST_MONEY_SPEND_REFUSED, error.code());
        assertEquals(6_000L, saldo());
        assertEquals(0, cuantosCobros());
    }

    // ---- 4 · Concurrencia real ------------------------------------------------------------------

    @Test
    @DisplayName("dos débitos a la vez sobre la misma cuenta: pasa uno, y el saldo no se va abajo")
    void dosDebitosALaVez() throws Exception {
        billetera.topUp(municipalidad, persona, Money.ofMinor(1_000, MONEDA), "carga-6");

        // Las dos hebras se sueltan en el mismo instante: sin la barrera, la primera terminaría
        // antes de que la segunda empiece y la prueba pasaría sin haber probado nada.
        CyclicBarrier salida = new CyclicBarrier(2);
        Callable<Optional<String>> cobrar600 = () -> {
            salida.await();
            try {
                transacciones.executeWithoutResult(estado ->
                        billetera.charge(municipalidad, persona, Money.ofMinor(600, MONEDA),
                                WalletTransactionType.SESSION_CHARGE, null, "cobro-concurrente"));
                return Optional.empty();
            } catch (ConflictException e) {
                return Optional.of(e.code());
            }
        };

        ExecutorService hebras = Executors.newFixedThreadPool(2);
        try {
            List<Future<Optional<String>>> resultados =
                    hebras.invokeAll(List.of(cobrar600, cobrar600));
            long exitos = resultados.stream().filter(f -> esVacio(f)).count();
            long rechazos = resultados.size() - exitos;

            assertEquals(1, exitos, "exactamente un débito debe prosperar");
            assertEquals(1, rechazos, "y el otro debe rechazarse, no reventar");
            assertEquals(400L, saldo(), "el saldo es el de un solo débito, no el de dos ni el de cero");
            assertEquals(1, cuantosCobros());
        } finally {
            hebras.shutdownNow();
        }
    }

    private static boolean esVacio(Future<Optional<String>> f) {
        try {
            return f.get().isEmpty();
        } catch (Exception e) {
            return fail("una de las hebras falló con algo que no es un rechazo de negocio: " + e);
        }
    }

    // ---- 5 · Rollback de la transacción de quien llama -------------------------------------------

    @Test
    @DisplayName("el cobro vive en la transacción de quien llama: si esa falla, el débito se va con ella")
    void rollbackDeLaTransaccionExterna() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(3_000, MONEDA), "carga-7");

        // Es la invariante que el propio servicio declara: «cobro y sesión se escriben en la misma
        // transacción». Si el cobro abriera la suya, el dinero saldría igual cuando lo que lo
        // justificaba —la estadía— no llegó a existir.
        assertThrows(IllegalStateException.class, () ->
                transacciones.executeWithoutResult(estado -> {
                    billetera.charge(municipalidad, persona, Money.ofMinor(1_200, MONEDA),
                            WalletTransactionType.SESSION_CHARGE, null, "cobro-7");
                    throw new IllegalStateException("la estadía no se pudo crear");
                }));

        assertEquals(3_000L, saldo());
        assertEquals(0, cuantosCobros());
    }

    // ---- 6 · Idempotencia: el contrato REAL, no el que uno querría -------------------------------

    @Test
    @DisplayName("la clave de idempotencia del cobro NO lo hace idempotente, y conviene que quede escrito")
    void laClaveDeIdempotenciaNoDeduplica() {
        billetera.topUp(municipalidad, persona, Money.ofMinor(10_000, MONEDA), "carga-8");

        billetera.charge(municipalidad, persona, Money.ofMinor(1_000, MONEDA),
                WalletTransactionType.SESSION_CHARGE, null, "la-misma-clave");
        billetera.charge(municipalidad, persona, Money.ofMinor(1_000, MONEDA),
                WalletTransactionType.SESSION_CHARGE, null, "la-misma-clave");

        /*
          Dos llamadas, dos asientos. No es un defecto y por eso no se "corrige": la columna
          `idempotency_key` de `wallet_transactions` NO tiene índice único —el único índice único de
          esa tabla es `uq_wallet_transactions_reference`, sobre `external_reference`, y es para las
          RECARGAS—. La protección contra reenvíos del cobro vive una capa más arriba, en la tabla
          `idempotency_keys` del borde HTTP (ADR 0012).

          Se deja escrito como prueba, y no como comentario en un informe, porque es exactamente la
          clase de suposición que alguien hace al leer la firma del método: ve un parámetro llamado
          `idempotencyKey` y asume que deduplica. Si algún día se decide que el servicio deba
          deduplicar, esta prueba falla y obliga a decidirlo a propósito.
        */
        assertEquals(2, cuantosCobros(), "hoy el servicio NO deduplica por esta clave");
        assertEquals(8_000L, saldo());
    }

    // ---- Utilidades -------------------------------------------------------------------------------

    private long saldo() {
        Long valor = jdbc.queryForObject(
                "SELECT balance_minor FROM wallet_accounts WHERE tenant_id = ? AND user_id = ?",
                Long.class, municipalidad.value(), persona.value());
        return valor == null ? 0L : valor;
    }

    private UUID idDeLaCuenta() {
        return jdbc.queryForObject(
                "SELECT id FROM wallet_accounts WHERE tenant_id = ? AND user_id = ?",
                UUID.class, municipalidad.value(), persona.value());
    }

    private int cuantosCobros() {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM wallet_transactions WHERE user_id = ? AND type = 'SESSION_CHARGE'",
                Integer.class, persona.value());
        return n == null ? 0 : n;
    }

    private long unicoCobro(String columna) {
        return jdbc.queryForObject(
                "SELECT " + columna + " FROM wallet_transactions WHERE user_id = ? AND type = 'SESSION_CHARGE'",
                Long.class, persona.value());
    }

    /**
     * Una municipalidad mínima, por JDBC.
     *
     * <p>Por JDBC y no por {@code TenantService}: lo que se prueba acá es la billetera, y hacer que
     * el montaje dependa del servicio de municipalidades ataría esta prueba a los cambios de aquel.
     * Las columnas son las que la tabla exige.</p>
     */
    private UUID crearMunicipalidad() {
        UUID id = Uuid7.generate();
        String sufijo = id.toString().substring(24); // cola aleatoria del Uuid7: los primeros 8 hex son el timestamp y no son únicos dentro de ~65s
        OffsetDateTime ahora = OffsetDateTime.now();
        jdbc.update("""
                INSERT INTO tenants (id, slug, legal_name, display_name, country_code, currency_code,
                                     locale, time_zone, status, self_registration_policy,
                                     created_at, updated_at)
                VALUES (?, ?, ?, ?, 'CR', ?, 'es-CR', 'America/Costa_Rica', 'ACTIVE',
                        'APPROVAL_REQUIRED', ?, ?)
                """, id, "prueba-" + sufijo, "Municipalidad de prueba " + sufijo,
                "Prueba " + sufijo, MONEDA, ahora, ahora);
        return id;
    }

    /** Una persona mínima. Documento, correo y teléfono únicos por fila: la tabla lo exige. */
    private UUID crearPersona() {
        UUID id = Uuid7.generate();
        String sufijo = id.toString().replace("-", "").substring(0, 12);
        OffsetDateTime ahora = OffsetDateTime.now();
        jdbc.update("""
                INSERT INTO users (id, email, given_name, family_name,
                                   document_country_code, document_type, document_number,
                                   document_number_normalized,
                                   address_country_code, address_line1,
                                   phone_e164, phone_country_code, nationality_code, birth_date,
                                   locale, time_zone, status, accepted_terms_version,
                                   created_at, updated_at)
                VALUES (?, ?, 'Prueba', 'Billetera', 'CR', 'NATIONAL_ID', ?, ?,
                        'CR', 'Sin dirección', ?, 'CR', 'CR', ?, 'es-CR', 'America/Costa_Rica',
                        'ACTIVE', 'v1', ?, ?)
                """, id, sufijo + "@prueba.luparx", sufijo, sufijo,
                telefonoUnico(), LocalDate.of(1990, 1, 1), ahora, ahora);
        return id;
    }

    /** Un +506 que cumple el CHECK de la tabla y no choca con otra fila. */
    private static String telefonoUnico() {
        long n = Math.abs(UUID.randomUUID().getMostSignificantBits() % 90_000_000L) + 10_000_000L;
        return "+506" + n;
    }

    @Test
    @DisplayName("el montaje corre contra PostgreSQL de verdad, no contra una base en memoria")
    void corremosContraPostgresDeVerdad() {
        String producto = jdbc.queryForObject("SELECT version()", String.class);
        assertNotNull(producto);
        assertTrue(producto.startsWith("PostgreSQL"), producto);
        // Y con las extensiones que el esquema exige, que es la razón de usar la imagen de PostGIS.
        assertEquals(1, (int) jdbc.queryForObject(
                "SELECT count(*) FROM pg_extension WHERE extname = 'postgis'", Integer.class));
        assertEquals(1, (int) jdbc.queryForObject(
                "SELECT count(*) FROM pg_extension WHERE extname = 'citext'", Integer.class));
    }
}
