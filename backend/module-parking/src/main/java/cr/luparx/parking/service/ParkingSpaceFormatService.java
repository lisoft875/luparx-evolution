package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.parking.model.ParkingSpaceFormatDefaults;
import cr.luparx.parking.model.SpaceCodeFormat;
import cr.luparx.parking.repository.ParkingSpaceFormatRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.regex.Pattern;

/**
 * The shape of a bay code in a municipality, and the one place that decides whether a code the
 * server was handed is one that municipality could have painted (CONTRACT.md v0.3, "Formato del
 * código de espacio").
 *
 * <p>A missing row is not an error: it means the municipality has not described its numbering yet,
 * and the answer is the deployment's configured default
 * ({@code platform.defaults.parking.space-format.*}), materialised on first read so the municipality
 * then has a real row to edit. Exactly the arrangement {@link ParkingPolicyService} uses, for exactly
 * the same reason — a default living in Java would be a decision the municipality could not make.</p>
 */
@Service
public class ParkingSpaceFormatService {

    private final ParkingSpaceFormatRepository repository;
    private final ParkingSpaceFormatDefaults defaults;
    private final Clock clock;

    public ParkingSpaceFormatService(ParkingSpaceFormatRepository repository,
                                     ParkingSpaceFormatDefaults defaults,
                                     Clock clock) {
        this.repository = repository;
        this.defaults = defaults;
        this.clock = clock;
    }

    /** The format in force, creating it from the configured defaults the first time. */
    @Transactional
    public ParkingSpaceFormat require(TenantId tenantId) {
        return repository.findById(tenantId.value())
                .orElseGet(() -> repository.save(
                        ParkingSpaceFormat.fromDefaults(tenantId, defaults, clock.instant())));
    }

    /**
     * Canonicalises a code and checks it against the municipality's format.
     *
     * @return the normalised code, ready to be looked up or stored
     * @throws UnprocessableEntityException {@code PARKING_SPACE_CODE_INVALID}, carrying the
     *         municipality's own example so the message can say what a code here looks like. A 422
     *         and not a 404: the code is refused by configuration, and answering "not found" would
     *         send a citizen looking for a bay whose code could never have existed.
     */
    @Transactional
    public String requireValidCode(TenantId tenantId, String code) {
        ParkingSpaceFormat format = require(tenantId);
        String normalized = SpaceCodeFormat.normalize(code);
        if (!format.accepts(normalized)) {
            throw UnprocessableEntityException.of(ErrorCode.PARKING_SPACE_CODE_INVALID,
                    "error.parking.space.code.invalid", format.getExample());
        }
        return normalized;
    }

    /**
     * Replaces the format of a municipality, as one form.
     *
     * <p>When {@code pattern} is blank it is derived from the parts, which is what an administrator
     * filling in "four digits, no prefix" expects. When it is given, it is taken as written — a
     * municipality whose numbering the form cannot express writes its own expression — but it still
     * has to compile, and the example still has to match it. An example its own rule rejects would
     * teach every citizen the wrong code, so it is refused rather than stored.</p>
     */
    @Transactional
    public ParkingSpaceFormat replace(TenantId tenantId, String prefix, int digits, boolean allowLetters,
                                      String pattern, String example) {
        ValidationException.Collector errors = new ValidationException.Collector();
        String normalizedPrefix = SpaceCodeFormat.normalizePrefix(prefix);
        if (!SpaceCodeFormat.isValidPrefix(normalizedPrefix)) {
            errors.add("prefix", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.prefix.invalid");
        }
        if (digits < 1 || digits > 12) {
            errors.add("digits", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.digits.invalid");
        } else if (normalizedPrefix.length() + digits > SpaceCodeFormat.MAX_CODE_LENGTH) {
            errors.add("digits", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.tooLong");
        }
        errors.throwIfAny();

        String effectivePattern = pattern == null || pattern.isBlank()
                ? SpaceCodeFormat.derivePattern(normalizedPrefix, digits, allowLetters)
                : pattern.trim();
        Pattern compiled = SpaceCodeFormat.compile(effectivePattern).orElse(null);
        if (compiled == null) {
            errors.add("pattern", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.pattern.invalid");
        }
        String effectiveExample = example == null || example.isBlank()
                ? SpaceCodeFormat.deriveExample(normalizedPrefix, digits)
                : SpaceCodeFormat.normalize(example);
        if (compiled != null) {
            if (effectiveExample.length() > SpaceCodeFormat.MAX_CODE_LENGTH) {
                errors.add("example", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.tooLong");
            } else if (!compiled.matcher(effectiveExample).matches()) {
                errors.add("example", ErrorCode.VALIDATION_FAILED, "error.parking.spaceFormat.example.mismatch");
            }
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        ParkingSpaceFormat format = repository.findById(tenantId.value()).orElse(null);
        if (format == null) {
            return repository.save(new ParkingSpaceFormat(tenantId.value(), normalizedPrefix, digits,
                    allowLetters, effectivePattern, effectiveExample, now));
        }
        format.replace(normalizedPrefix, digits, allowLetters, effectivePattern, effectiveExample, now);
        return repository.save(format);
    }
}
