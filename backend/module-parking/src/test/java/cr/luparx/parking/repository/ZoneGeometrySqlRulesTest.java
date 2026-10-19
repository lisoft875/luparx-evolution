package cr.luparx.parking.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tres reglas que viven dentro de sentencias SQL, comprobadas sobre el texto de la sentencia.
 *
 * <h2>Por qué así, y qué NO demuestra</h2>
 *
 * <p>Estas reglas no son Java: son cláusulas de un {@code UPDATE} nativo. Para ejecutarlas hace
 * falta PostGIS, y este repositorio todavía no tiene un entorno de pruebas con base; esa prueba
 * queda declarada SIN EJECUTAR en el informe en vez de simularse. Lo que esta clase evita es otra
 * cosa, y es real: que una de esas cláusulas <b>desaparezca en una edición posterior</b> sin que
 * nada se ponga rojo. Las tres se perderían en silencio, y las tres tienen consecuencias que sólo
 * se descubren meses después, mirando un dato que ya está mal.</p>
 */
class ZoneGeometrySqlRulesTest {

    /**
     * El repositorio, leído del árbol de fuentes de ESTE módulo.
     *
     * <p>Maven corre las pruebas con el directorio del módulo como directorio de trabajo, así que
     * la ruta es relativa a él y no depende de dónde esté el repositorio en el disco.</p>
     */
    private static final String FUENTE = leer(
            "src/main/java/cr/luparx/parking/repository/ParkingZoneRepository.java");

    private static String leer(String relativa) {
        Path ruta = Path.of("").toAbsolutePath().resolve(relativa).normalize();
        try {
            return Files.readString(ruta, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException("No pude leer " + ruta, exception);
        }
    }

    private static String entre(String desde, String hasta) {
        int i = FUENTE.indexOf(desde);
        int j = FUENTE.indexOf(hasta);
        assertTrue(i >= 0 && j > i, "no encontré la sentencia entre «" + desde + "» y «" + hasta + "»");
        return FUENTE.substring(i, j);
    }

    @Test
    @DisplayName("redibujar DEGRADA el sello, en el mismo UPDATE que escribe el polígono")
    void redibujarDegrada() {
        // El agujero clásico de todo flujo de aprobación: verificar un perímetro correcto y
        // después cambiarlo por otro conservando el sello. Se cierra con estas cuatro líneas, y
        // tienen que estar en LA MISMA sentencia: degradarlo en un segundo UPDATE deja una
        // ventana en la que el polígono nuevo ya está guardado y todavía figura como aprobado.
        String replace = entre("set geom = ST_Multi(ST_GeomFromGeoJSON", "int replaceGeometry");
        assertTrue(replace.contains("geom_status = 'UNVERIFIED'"), "el estado vuelve a sin verificar");
        assertTrue(replace.contains("geom_verified_by = null"), "se borra quién lo aprobó");
        assertTrue(replace.contains("geom_verified_at = null"), "y cuándo");
        assertTrue(replace.contains("geom_source = 'ADMIN_DRAWING'"), "esto llega por el portal");
    }

    @Test
    @DisplayName("borrar el polígono deja la fila limpia, como exige el CHECK de coherencia")
    void borrarLimpiaTodo() {
        // Sin geometría no hay procedencia que declarar ni revisión que sostener. Si esta
        // sentencia se olvida de alguna columna, la que falla es la base —el CHECK
        // `ck_parking_zones_geom_absent_is_clean`— y lo hace en el momento de borrar, sobre un
        // extremo que hoy contesta 204 sin ruido.
        String clear = entre("set geom = null", "int clearGeometry");
        assertTrue(clear.contains("geom_source = null"));
        assertTrue(clear.contains("geom_status = 'UNVERIFIED'"));
        assertTrue(clear.contains("geom_verified_by = null"));
        assertTrue(clear.contains("geom_verified_at = null"));
    }

    @Test
    @DisplayName("el mapa del ciudadano filtra por estado en el SERVIDOR, en las DOS consultas")
    void elFiltroVaEnElWhere() {
        // Dos consultas: la del mapa completo y la del bbox. Que una lleve el filtro y la otra no
        // es la peor versión posible, porque el defecto sólo aparece cuando alguien mueve el mapa.
        int cuantas = FUENTE.split("z\\.geom_status in \\(:statuses\\)", -1).length - 1;
        assertEquals(2, cuantas, "la consulta con bbox y la que no lo lleva, las dos");
    }

    @Test
    @DisplayName("ninguna consulta de geometría se busca por id a secas")
    void siempreAcotadoPorMunicipalidad() {
        // La regla de siempre (SECURITY.md, BOLA): un id de otra municipalidad contesta «no
        // existe». Vale también para la sentencia nueva de revisión.
        String revision = entre("update parking_zones\n               set geom_status = :status",
                "int reviewGeometry");
        assertTrue(revision.contains("where id = :id and tenant_id = :tenantId"));
        assertTrue(revision.contains("version = :expectedVersion"), "y respeta el bloqueo optimista");
    }
}
