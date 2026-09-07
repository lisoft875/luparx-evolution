package cr.luparx.core.id;

import java.util.Objects;
import java.util.UUID;

/**
 * Identity of a person. Users are global (CONTRACT.md §1); tenant scoping is expressed by
 * memberships, never by owning a user row per tenant.
 */
public record UserId(UUID value) {

    public UserId {
        Objects.requireNonNull(value, "user id value must not be null");
    }

    public static UserId generate() {
        return new UserId(Uuid7.generate());
    }

    public static UserId of(UUID value) {
        return new UserId(value);
    }

    /** @throws IllegalArgumentException when the text is not a valid UUID. */
    public static UserId parse(String text) {
        return new UserId(UUID.fromString(text));
    }

    public static UserId ofNullable(UUID value) {
        return value == null ? null : new UserId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
