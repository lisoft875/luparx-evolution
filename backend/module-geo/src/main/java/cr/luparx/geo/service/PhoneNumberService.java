package cr.luparx.geo.service;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.geo.model.NormalizedPhone;
import org.springframework.stereotype.Service;

/**
 * Validates and normalises phone numbers with libphonenumber (CONTRACT.md §2 item 4). The stored
 * form is always E.164; no dial code is ever assumed by the code — the region comes from the country
 * the person selected, and its default is platform configuration.
 */
@Service
public class PhoneNumberService {

    private final PhoneNumberUtil phoneNumberUtil;

    public PhoneNumberService() {
        this(PhoneNumberUtil.getInstance());
    }

    PhoneNumberService(PhoneNumberUtil phoneNumberUtil) {
        this.phoneNumberUtil = phoneNumberUtil;
    }

    /**
     * @param countryCode    ISO 3166-1 alpha-2 region of the number
     * @param nationalNumber the national number as typed (spaces, dashes and a leading dial code are tolerated)
     * @param fieldPath      dotted path used in the validation error, e.g. {@code phone.nationalNumber}
     * @throws ValidationException when the region is unknown or the number is not a valid number for it
     */
    public NormalizedPhone validateAndNormalize(String countryCode, String nationalNumber, String fieldPath) {
        String region = CountryCodes.normalize(countryCode);
        if (!CountryCodes.isValid(region)) {
            throw new ValidationException(fieldPath == null ? "phone.countryCode" : fieldPath,
                    ErrorCode.COUNTRY_NOT_FOUND, "error.phone.country.invalid");
        }
        if (nationalNumber == null || nationalNumber.isBlank()) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_PHONE_NUMBER, "error.phone.invalid");
        }
        try {
            Phonenumber.PhoneNumber parsed = phoneNumberUtil.parse(nationalNumber, region);
            if (!phoneNumberUtil.isValidNumberForRegion(parsed, region)) {
                throw new ValidationException(fieldPath, ErrorCode.INVALID_PHONE_NUMBER, "error.phone.invalid");
            }
            String e164 = phoneNumberUtil.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164);
            String significant = phoneNumberUtil.getNationalSignificantNumber(parsed);
            return new NormalizedPhone(e164, region, significant);
        } catch (NumberParseException exception) {
            throw new ValidationException(fieldPath, ErrorCode.INVALID_PHONE_NUMBER, "error.phone.invalid");
        }
    }

    /**
     * A number that is valid for the region, taken from libphonenumber's own metadata.
     *
     * <p>Used by tooling that has to produce a well-formed contact detail without a real person
     * behind it — development fixtures and documentation examples. It exists here rather than as a
     * constant in the caller precisely so that no dial code or national format is ever written into
     * code (CONTRACT.md §7): the answer changes with the country, and comes from the metadata.</p>
     *
     * @return the national significant number, or null when the region is unknown to the library
     */
    public String exampleNationalNumber(String countryCode) {
        String region = CountryCodes.normalize(countryCode);
        if (!CountryCodes.isValid(region)) {
            return null;
        }
        Phonenumber.PhoneNumber example =
                phoneNumberUtil.getExampleNumberForType(region, PhoneNumberUtil.PhoneNumberType.MOBILE);
        if (example == null) {
            example = phoneNumberUtil.getExampleNumber(region);
        }
        return example == null ? null : phoneNumberUtil.getNationalSignificantNumber(example);
    }

    /** The E.164 calling code of a region, including the leading '+', or null when unknown. */
    public String dialCodeFor(String countryCode) {
        String region = CountryCodes.normalize(countryCode);
        if (!CountryCodes.isValid(region)) {
            return null;
        }
        int callingCode = phoneNumberUtil.getCountryCodeForRegion(region);
        return callingCode == 0 ? null : "+" + callingCode;
    }
}
