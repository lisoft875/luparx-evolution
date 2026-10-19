package cr.luparx.app.migration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Lo que la V43_0 promete, comprobado sobre el texto de las migraciones y del repositorio.
 *
 * <h2>Por qué una prueba de texto, y qué NO demuestra</h2>
 *
 * <p>Aplicar la V43_0 de verdad exige PostGIS, y este repositorio no tiene todavía un entorno de
 * pruebas con base. Esa prueba está declarada SIN EJECUTAR en el informe, que es lo honesto, en
 * lugar de simularla. Lo que sí se puede comprobar sin base es la propiedad de la que depende toda
 * la corrección del paso 3 de la migración, y que se rompe en silencio:</p>
 *
 * <p><b>Los ocho polígonos de demostración se marcan por IDENTIDAD.</b> El {@code ST_Equals} de la
 * V43_0 compara contra el WKT literal que escribió la V41_0: si alguien retoca una coordenada en
 * una de las dos y no en la otra, la migración deja de reconocer esa semilla, no marca nada, y no
 * falla — la zona se queda silenciosamente etiquetada como un dibujo del portal. Esta prueba es lo
 * que hace ruido ese día.</p>
 *
 * <p>Las demás comprobaciones son de la misma naturaleza: afirman que ciertas cláusulas SIGUEN en
 * el SQL. No reemplazan ejecutarlo; evitan que se pierdan en una edición posterior.</p>
 */
class ZoneGeometryProvenanceSqlTest {

    private static final String V41 = leer("/db/migration/V41_0__seed_zone_geometry_demo.sql");
    private static final String V43 = leer("/db/migration/V43_0__zone_geometry_provenance.sql");

    /** {@code ('SJ-AMON', 'POLYGON((...))')} — el par código/WKT tal como está escrito. */
    private static final Pattern SEMILLA =
            Pattern.compile("\\('(SJ-[A-Z]+)',\\s*'(POLYGON\\(\\([^')]*\\)\\))'\\)");

    private static String leer(String recurso) {
        try (InputStream entrada = ZoneGeometryProvenanceSqlTest.class.getResourceAsStream(recurso)) {
            if (entrada == null) {
                throw new IllegalStateException("No está en el classpath: " + recurso);
            }
            return new String(entrada.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private static Map<String, String> semillasDe(String sql) {
        Map<String, String> encontradas = new LinkedHashMap<>();
        Matcher m = SEMILLA.matcher(sql);
        while (m.find()) {
            encontradas.put(m.group(1), m.group(2));
        }
        return encontradas;
    }

    @Test
    @DisplayName("las ocho DEMO de la V43_0 son EXACTAMENTE las que escribió la V41_0")
    void losPoligonosCoincidenLiteralmente() {
        Map<String, String> sembradas = semillasDe(V41);
        Map<String, String> marcadas = semillasDe(V43);

        assertEquals(8, sembradas.size(), "la V41_0 siembra ocho zonas");
        assertEquals(sembradas.keySet(), marcadas.keySet(), "los códigos tienen que ser los mismos");
        // Coordenada por coordenada. `ST_Equals` contra otro polígono no marcaría nada y nadie se
        // enteraría: la migración no falla, sencillamente deja de reconocer la semilla.
        assertEquals(sembradas, marcadas, "un WKT que no coincide hace que ST_Equals no marque esa zona");
    }

    @Test
    @DisplayName("la V43_0 corrige el defecto de la V41_0: filtra por municipalidad")
    void filtraPorInquilino() {
        // La V41_0 actualiza por código, y el código de zona sólo es único DENTRO de una
        // municipalidad. Esa cláusula que le falta es la que la V43_0 sí lleva.
        assertFalse(V41.contains("tenant_id"), "si la V41_0 cambió, revisar este razonamiento");
        assertTrue(V43.contains("z.tenant_id = (SELECT t.id FROM tenants t WHERE t.slug = 'san-jose')"),
                "el UPDATE de las DEMO tiene que acotarse a San José");
    }

    @Test
    @DisplayName("una DEMO verificada es imposible en la base: el CHECK y el disparador")
    void elCheckDuroEstaPuesto() {
        // El CHECK prohíbe el ESTADO.
        assertTrue(V43.contains("ck_parking_zones_geom_demo_never_verified"));
        assertTrue(V43.replaceAll("\\s+", " ")
                        .contains("CHECK (geom_source IS DISTINCT FROM 'DEMO' OR geom_status <> 'VERIFIED')"),
                "el CHECK prohíbe la fila «DEMO y aprobada»");

        // Y el disparador prohíbe la TRANSICIÓN, que es lo que el CHECK no ve: un UPDATE que en la
        // misma sentencia reescribe la procedencia y aprueba le pasa por el lado. Se midió contra
        // PostGIS y pasaba; esto es lo que lo cerró.
        assertTrue(V43.contains("trg_parking_zones_demo_never_verified"),
                "falta el disparador que prohíbe aprobar una DEMO sin redibujarla");
        assertTrue(V43.contains("luparx_demo_geometry_never_verified"));
        String sinEspacios = V43.replaceAll("\\s+", " ");
        assertTrue(sinEspacios.contains("NEW.geom IS NOT DISTINCT FROM OLD.geom"),
                "la condición del disparador es que el POLÍGONO no haya cambiado");
        assertTrue(sinEspacios.contains("BEFORE UPDATE ON parking_zones"));
    }

    @Test
    @DisplayName("las DEMO se conservan: la migración las etiqueta, no las borra")
    void lasDemoNoSeBorran() {
        String sinEspacios = V43.replaceAll("\\s+", " ");
        assertFalse(sinEspacios.contains("DELETE FROM parking_zones"), "nada se borra");
        assertFalse(sinEspacios.contains("SET geom = NULL"), "ningún polígono se vacía");
        assertTrue(sinEspacios.contains("SET geom_source = 'DEMO', geom_status = 'REJECTED'"));
    }

    @Test
    @DisplayName("el relleno no deja ninguna fila aprobada: nadie ha verificado nada todavía")
    void elRellenoNoAprueba() {
        // Ninguna sentencia de esta migración ASIGNA un estado aprobado. Arrancar en verde es
        // exactamente lo que haría inútil al campo que esta migración agrega.
        //
        // Se buscan las dos formas de asignación y no la cadena a secas, porque el cuerpo del
        // disparador COMPARA contra 'VERIFIED' y esa comparación es justamente la que protege la
        // regla. La primera versión de esta prueba miraba la cadena suelta y se puso roja al
        // agregar el disparador: estaba midiendo la letra y no la regla.
        String sinEspacios = V43.replaceAll("\\s+", " ");
        assertFalse(sinEspacios.contains("SET geom_status = 'VERIFIED'"),
                "decir que algo está verificado sin que nadie lo haya mirado es falsear el dato");
        assertFalse(sinEspacios.contains(", geom_status = 'VERIFIED'"),
                "tampoco como segunda asignación de un SET");
        assertTrue(V43.contains("SET geom_source = 'ADMIN_DRAWING'"));
    }

    @Test
    @DisplayName("sin polígono no queda procedencia ni sello sueltos")
    void coherenciaDeLaFila() {
        assertTrue(V43.contains("ck_parking_zones_geom_absent_is_clean"));
        assertTrue(V43.contains("ck_parking_zones_geom_verified_complete"),
                "un VERIFIED sin autor ni fecha es un sello sin firma");
    }
}
