package cr.luparx.geo.service;

import cr.luparx.core.error.ValidationException;
import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.geo.model.NormalizedDocument;
import cr.luparx.geo.repository.IdentityDocumentTypeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Document validation is entirely driven by the catalogue: no country's rule is written in Java
 * (CONTRACT.md §2 item 2). These tests therefore feed catalogue rows in and assert the behaviour
 * they produce.
 */
class IdentityDocumentValidatorTest {

    private IdentityDocumentTypeRepository repository;

    private static final IdentityDocumentType CR_NATIONAL_ID = new IdentityDocumentType(
            "CR", IdentityDocumentTypeCode.NATIONAL_ID, "document.CR.NATIONAL_ID",
            "^[1-9][0-9]{8}$", "DIGITS_ONLY", "1-2345-6789", true);

    private static final IdentityDocumentType ES_NATIONAL_ID = new IdentityDocumentType(
            "ES", IdentityDocumentTypeCode.NATIONAL_ID, "document.ES.NATIONAL_ID",
            "^[0-9]{8}[A-Z]$", "UPPER_ALPHANUMERIC", "12345678Z", true);

    @BeforeEach
    void setUp() {
        repository = mock(IdentityDocumentTypeRepository.class);
    }

    @Test
    void normalisesAndAcceptsANumberMatchingTheCataloguePattern() {
        when(repository.findByCountryCodeAndType(eq("CR"), eq(IdentityDocumentTypeCode.NATIONAL_ID)))
                .thenReturn(Optional.of(CR_NATIONAL_ID));
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        NormalizedDocument document = validator.validateAndNormalize(
                "cr", IdentityDocumentTypeCode.NATIONAL_ID, "1-2345-6789", "identityDocument.number");

        assertThat(document.countryCode()).isEqualTo("CR");
        assertThat(document.raw()).isEqualTo("1-2345-6789");
        // The dashes people type are stripped, so uniqueness works on one canonical form.
        assertThat(document.normalized()).isEqualTo("123456789");
    }

    @Test
    void appliesTheCountrySpecificPatternAndNormaliser() {
        when(repository.findByCountryCodeAndType(eq("ES"), eq(IdentityDocumentTypeCode.NATIONAL_ID)))
                .thenReturn(Optional.of(ES_NATIONAL_ID));
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        assertThat(validator.validateAndNormalize("ES", IdentityDocumentTypeCode.NATIONAL_ID,
                " 12345678z ", "identityDocument.number").normalized()).isEqualTo("12345678Z");
    }

    @Test
    void rejectsANumberThatDoesNotMatchThePattern() {
        when(repository.findByCountryCodeAndType(eq("CR"), eq(IdentityDocumentTypeCode.NATIONAL_ID)))
                .thenReturn(Optional.of(CR_NATIONAL_ID));
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        assertThatThrownBy(() -> validator.validateAndNormalize("CR", IdentityDocumentTypeCode.NATIONAL_ID,
                "12345", "identityDocument.number")).isInstanceOf(ValidationException.class);
    }

    @Test
    void rejectsADocumentTypeTheCountryDoesNotOffer() {
        when(repository.findByCountryCodeAndType(eq("CR"), eq(IdentityDocumentTypeCode.TAX_ID)))
                .thenReturn(Optional.empty());
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        assertThatThrownBy(() -> validator.validateAndNormalize("CR", IdentityDocumentTypeCode.TAX_ID,
                "3101123456", "identityDocument.number")).isInstanceOf(ValidationException.class);
    }

    @Test
    void rejectsAnInactiveCatalogueRow() {
        IdentityDocumentType inactive = new IdentityDocumentType("CR", IdentityDocumentTypeCode.PASSPORT,
                "document.CR.PASSPORT", "^[A-Z0-9]{6,12}$", "UPPER_ALPHANUMERIC", "A1234567", false);
        when(repository.findByCountryCodeAndType(eq("CR"), eq(IdentityDocumentTypeCode.PASSPORT)))
                .thenReturn(Optional.of(inactive));
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        assertThatThrownBy(() -> validator.validateAndNormalize("CR", IdentityDocumentTypeCode.PASSPORT,
                "A1234567", "identityDocument.number")).isInstanceOf(ValidationException.class);
    }

    @Test
    void appliesARegisteredChecksumRuleOnTopOfThePattern() {
        when(repository.findByCountryCodeAndType(eq("CR"), eq(IdentityDocumentTypeCode.NATIONAL_ID)))
                .thenReturn(Optional.of(CR_NATIONAL_ID));
        DocumentChecksumValidator alwaysRejects = new DocumentChecksumValidator() {
            @Override
            public boolean supports(String countryCode, IdentityDocumentTypeCode type) {
                return "CR".equals(countryCode) && type == IdentityDocumentTypeCode.NATIONAL_ID;
            }

            @Override
            public boolean isValid(String normalizedNumber) {
                return false;
            }
        };
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of(alwaysRejects));

        assertThatThrownBy(() -> validator.validateAndNormalize("CR", IdentityDocumentTypeCode.NATIONAL_ID,
                "123456789", "identityDocument.number")).isInstanceOf(ValidationException.class);
    }

    @Test
    void rejectsAnInvalidCountryCodeBeforeTouchingTheCatalogue() {
        IdentityDocumentValidator validator = new IdentityDocumentValidator(repository, List.of());

        assertThatThrownBy(() -> validator.validateAndNormalize("ZZ", IdentityDocumentTypeCode.NATIONAL_ID,
                "123456789", "identityDocument.number")).isInstanceOf(ValidationException.class);
    }
}
