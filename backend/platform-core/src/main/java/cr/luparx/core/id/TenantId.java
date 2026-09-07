package cr.luparx.core.id;

import java.util.Objects;
import java.util.UUID;

/**
 * Identity of a tenant (a municipality). A dedicated value object instead of a bare {@link UUID}
 * so that a tenant identifier can never be silently passed where a user identifier is expected.
 */
public record TenantId(UUID value) {

    public TenantId {
        Objects.requireNonNull(value, "tenant id value must not be null");
    }

    public static TenantId generate() {
        return new TenantId(Uuid7.generate());
    }

    public static TenantId of(UUID value) {
        return new TenantId(value);
    }

    /** @throws IllegalArgumentException when the text is not a valid UUID. */
    public static TenantId parse(String text) {
        return new TenantId(UUID.fromString(text));
    }

    public static TenantId ofNullable(UUID value) {
        return value == null ? null : new TenantId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
