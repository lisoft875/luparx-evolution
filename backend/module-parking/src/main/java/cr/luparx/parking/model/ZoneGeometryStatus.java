package cr.luparx.parking.model;

/**
 * Si una PERSONA revisó el perímetro de una zona, y con qué resultado (CONTRACT.md v0.44).
 *
 * <p>Ninguna regla del sistema mira vértices para decidir esto. El estado no se deduce de la forma
 * del polígono —esa heurística fue justamente el error que este campo viene a corregir—: lo pone
 * alguien que responde por él, y queda asentado en la bitácora sellada.</p>
 */
public enum ZoneGeometryStatus {

    /** Nadie lo ha mirado todavía. Es el estado inicial de todo polígono recién dibujado. */
    UNVERIFIED,

    /** Enviado a revisión. */
    PENDING_REVIEW,

    /** Revisado y dado por bueno. Exige autor y fecha, y es el único que el ciudadano ve por omisión. */
    VERIFIED,

    /** Revisado y rechazado: se miró y no sirve. Distinto de {@link #UNVERIFIED}, que es «no se miró». */
    REJECTED
}
