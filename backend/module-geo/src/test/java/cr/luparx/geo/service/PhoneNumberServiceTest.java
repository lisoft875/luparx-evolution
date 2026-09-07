package cr.luparx.geo.service;

import cr.luparx.core.error.ValidationException;
import cr.luparx.geo.model.NormalizedPhone;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phone numbers are stored in E.164 and validated against the country the person selected — no dial
 * code is ever assumed by the code (CONTRACT.md §2 item 4).
 */
class PhoneNumberServiceTest {

    private final PhoneNumberService service = new PhoneNumberService();

    @Test
    void normalisesACostaRicanNumberToE164() {
        NormalizedPhone phone = service.validateAndNormalize("CR", "2222 3333", "phone.nationalNumber");

        assertThat(phone.e164()).isEqualTo("+50622223333");
        assertThat(phone.countryCode()).isEqualTo("CR");
        assertThat(phone.nationalNumber()).isEqualTo("22223333");
    }

    @Test
    void normalisesNumbersOfOtherCountriesJustTheSame() {
        assertThat(service.validateAndNormalize("US", "650-253-0000", "phone").e164())
                .isEqualTo("+16502530000");
        assertThat(service.validateAndNormalize("ES", "912 345 678", "phone").e164())
                .isEqualTo("+34912345678");
    }

    @Test
    void acceptsANumberAlreadyWrittenInInternationalForm() {
        assertThat(service.validateAndNormalize("CR", "+506 2222 3333", "phone").e164())
                .isEqualTo("+50622223333");
    }

    @Test
    void rejectsANumberThatIsNotValidForTheSelectedCountry() {
        assertThatThrownBy(() -> service.validateAndNormalize("CR", "123", "phone.nationalNumber"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void rejectsAnUnknownCountry() {
        assertThatThrownBy(() -> service.validateAndNormalize("ZZ", "22223333", "phone.nationalNumber"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void rejectsABlankNumber() {
        assertThatThrownBy(() -> service.validateAndNormalize("CR", "  ", "phone.nationalNumber"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void resolvesTheDialCodeOfACountryFromTheLibrary() {
        assertThat(service.dialCodeFor("CR")).isEqualTo("+506");
        assertThat(service.dialCodeFor("US")).isEqualTo("+1");
        assertThat(service.dialCodeFor("ES")).isEqualTo("+34");
        assertThat(service.dialCodeFor("ZZ")).isNull();
    }
}
