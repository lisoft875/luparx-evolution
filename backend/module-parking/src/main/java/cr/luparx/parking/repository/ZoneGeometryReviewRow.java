package cr.luparx.parking.repository;

/**
 * Lo que hay que saber de una zona ANTES de aprobar o rechazar su perímetro (CONTRACT.md v0.44).
 *
 * <p>Tres datos y ninguno es la geometría: aprobar no necesita los vértices, necesita saber si
 * existen, de dónde salieron y en qué estado está la revisión. Traer el polígono para decidir
 * sería mover kilobytes por una pregunta de tres campos.</p>
 */
public interface ZoneGeometryReviewRow {

    /** {@code true} cuando la zona tiene polígono. No se aprueba lo que no está dibujado. */
    Boolean getDrawn();

    /** {@code MUNICIPAL_OFFICIAL}, {@code GIS_IMPORT}, {@code ADMIN_DRAWING}, {@code DEMO} o nulo. */
    String getSource();

    /** {@code UNVERIFIED}, {@code PENDING_REVIEW}, {@code VERIFIED} o {@code REJECTED}. */
    String getStatus();
}
