package cr.luparx.enforcement.model;

/**
 * Who a permit belongs to (CONTRACT.md v0.30).
 *
 * <p>Two, because they are answered with different papers: a person is identified by their identity
 * document and an organisation by its legal registration. Collapsing them into one free-text field
 * is how "who is this permit for?" stops being answerable.</p>
 */
public enum BeneficiaryKind {

    /** A named person — the disability permit, the resident. */
    PERSON,
    /** A body: a ministry, an embassy, the council's own fleet, a hospital. */
    ORGANISATION
}
