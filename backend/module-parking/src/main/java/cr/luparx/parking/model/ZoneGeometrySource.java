package cr.luparx.parking.model;

/**
 * De dónde salió el perímetro de una zona (CONTRACT.md v0.44, ADR 0029).
 *
 * <p>La procedencia es un hecho sobre el ORIGEN del dato y es independiente de si alguien lo
 * revisó, que es lo que dice {@link ZoneGeometryStatus}. Separarlas es lo que permite la regla que
 * de verdad importa: un polígono de demostración no se vuelve oficial porque alguien le cambie el
 * estado.</p>
 */
public enum ZoneGeometrySource {

    /** Viene de un acto o documento oficial de la municipalidad. */
    MUNICIPAL_OFFICIAL,

    /** Importado de un archivo GIS: shapefile, GeoJSON catastral. */
    GIS_IMPORT,

    /** Dibujado a mano en el portal de administración. Es lo que deja todo {@code PUT} de geometría. */
    ADMIN_DRAWING,

    /**
     * Dato de demostración. <b>Nunca operativo.</b>
     *
     * <p>Se conserva en la base para que el ambiente de pruebas tenga algo que dibujar, y el
     * esquema impide que llegue a {@link ZoneGeometryStatus#VERIFIED}: para volverlo oficial hay
     * que redibujarlo o importarlo, lo que cambia esta procedencia antes de que nadie lo
     * apruebe.</p>
     */
    DEMO
}
