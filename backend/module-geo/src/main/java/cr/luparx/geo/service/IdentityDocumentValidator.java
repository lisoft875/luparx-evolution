package cr.luparx.geo.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.model.DocumentNormalizer;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.geo.model.NormalizedDocument;
import cr.luparx.geo.repository.IdentityDocumentTypeRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Validates an identity document against the country+type catalogue (CONTRACT.md §2 item 2):
 * normalise, match the configured pattern, then apply the optional per-country checksum rule.
 *
 * <p>Nothing about any specific country lives here — Costa Rican cédula/DIMEX rules are seed data in
 * {@code identity_document_types}, exactly like every other country's.</p>
 */
@Service
public class IdentityDocumentValidator {

    private final IdentityDocumentTypeRepository documentTypeRepository;
    private final List<DocumentChecksumValidator> checksumValidators;

    public IdentityDocumentValidator(IdentityDocumentTypeRepository documentTypeRepository,
                                     List<DocumentChecksumValidator> checksumValidators) {
        this.documentTypeRepository = documentTypeRepository;
        this.checksumValidators = checksumValidators == null ? List.of() : List.copyOf(checksumValidators);
    }

    /**
     * @param fieldPath dotted path used in the validation error, e.g. {@code identityDocument.number}
     * @throws ValidationException when the type is not offered for the country, the pattern does not
     *                             match, or a registered checksum rule rejects the number
     */
    public NormalizedDocument validateAndNormalize(String countryCode, IdentityDocumentTypeCode type, String number,
                                                   String fieldPath) {
        String country = CountryCodes.normalize(countryCode);
        if (!CountryCodes.isValid(country)) {
            throw new ValidationException("identityDocument.countryCode", ErrorCode.COUNTRY_NOT_FOUND,
                    "error.document.country.invalid");
        }
        if (type == null) {
            throw new ValidationException("identityDocument.type", ErrorCode.DOCUMENT_TYPE_NOT_SUPPORTED,
                    "error.document.type.unsupported");
        }
        IdentityDocumentType configuration = documentTypeRepository.findByCountryCodeAndType(country, type)
                .filter(IdentityDocumentType::isActive)
                .orElseThrow(() -> new ValidationException("identityDocument.type",
                        ErrorCode.DOCUMENT_TYPE_NOT_SUPPORTED, "error.document.type.unsupported"));

        if (number == null || number.isBlank()) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_IDENTITY_DOCUMENT, "error.document.invalid");
        }

        DocumentNormalizer normalizer = DocumentNormalizer.fromName(configuration.getNormalizer());
        String normalized = normalizer.normalize(number);
        if (normalized == null || normalized.isEmpty()) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_IDENTITY_DOCUMENT, "error.document.invalid");
        }

        if (!matches(configuration.getPattern(), normalized)) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_IDENTITY_DOCUMENT, "error.document.invalid");
        }

        Optional<DocumentChecksumValidator> checksum = checksumValidators.stream()
                .filter(validator -> validator.supports(country, type))
                .findFirst();
        if (checksum.isPresent() && !checksum.get().isValid(normalized)) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_IDENTITY_DOCUMENT, "error.document.checksum");
        }

        return new NormalizedDocument(country, type, number.trim(), normalized);
    }

    private boolean matches(String pattern, String value) {
        if (pattern == null || pattern.isBlank()) {
            // A catalogue row without a pattern accepts any non-empty normalised value on purpose
            // (used by OTHER, where no national rule exists).
            return true;
        }
        try {
            return Pattern.compile(pattern).matcher(value).matches();
        } catch (PatternSyntaxException exception) {
            // Bad configuration must never let an invalid document through.
            throw new IllegalStateException("invalid document pattern in catalogue: " + pattern, exception);
        }
    }
}
