import { z } from 'zod';
import type { IdentityDocumentType, UpdateProfileRequest, UserProfile } from '@luparx/api-client';

/**
 * The personal data of CONTRACT.md §2, in the contract's order: name → identity document →
 * address → phone → nationality → birth date.
 *
 * One definition, two screens. Registration collects these fields plus the account ones (e-mail,
 * password, terms); "my account" edits exactly these and nothing else, because the e-mail and the
 * password each change a credential and each has its own flow (CONTRACT.md v0.3 §"Perfil
 * editable"). Keeping the shape, the validation and the fields in one place is what stops the two
 * screens from drifting into disagreeing about what a valid citizen looks like.
 *
 * Flat on purpose: react-hook-form addresses fields by path, and the nesting the wire wants is
 * rebuilt on submit by {@link toUpdateProfileRequest} / `toRegisterRequest`.
 */
export interface PersonalDataValues {
  givenName: string;
  familyName: string;
  secondFamilyName: string;
  identityDocumentCountryCode: string;
  identityDocumentType: IdentityDocumentType | '';
  identityDocumentNumber: string;
  addressCountryCode: string;
  addressLevel1Id: string;
  addressLevel2Id: string;
  addressLevel3Id: string;
  addressLine1: string;
  addressLine2: string;
  addressPostalCode: string;
  phoneCountryCode: string;
  phoneNationalNumber: string;
  nationalityCode: string;
  birthDate: string;
}

export const PERSONAL_DATA_DEFAULT_VALUES: PersonalDataValues = {
  givenName: '',
  familyName: '',
  secondFamilyName: '',
  identityDocumentCountryCode: '',
  identityDocumentType: '',
  identityDocumentNumber: '',
  addressCountryCode: '',
  addressLevel1Id: '',
  addressLevel2Id: '',
  addressLevel3Id: '',
  addressLine1: '',
  addressLine2: '',
  addressPostalCode: '',
  phoneCountryCode: '',
  phoneNationalNumber: '',
  nationalityCode: '',
  birthDate: '',
};

export interface PersonalDataSchemaOptions {
  minAgeYears: number;
  requiredTranslation: string;
  phoneInvalidTranslation: string;
  documentInvalidTranslation: string;
  ageTooYoungTranslation: (min: number) => string;
  /** Injected rather than imported directly so this package doesn't hard-depend on libphonenumber-js's call shape. */
  isValidPhone: (countryCode: string, nationalNumber: string) => boolean;
  /** Regex sourced from the identity-document-types catalog (CONTRACT.md §5) for the currently selected country+type; undefined until loaded. */
  documentPattern: RegExp | undefined;
}

/** The zod shape for the fields above — spread into a larger object schema by the caller. */
export function personalDataShape(options: PersonalDataSchemaOptions) {
  return {
    givenName: z.string().min(1, options.requiredTranslation),
    familyName: z.string().min(1, options.requiredTranslation),
    secondFamilyName: z.string(),
    identityDocumentCountryCode: z.string().min(1, options.requiredTranslation),
    // Widened to `string` at the zod level (the enum is data-driven from the catalog, CONTRACT.md §5);
    // narrowed back to the form's literal-union type here, since the "required" check already
    // guarantees a non-empty value and the catalog-pattern check in the refinement guards the rest.
    identityDocumentType: z.string().min(1, options.requiredTranslation) as unknown as z.ZodType<
      IdentityDocumentType | ''
    >,
    identityDocumentNumber: z.string().min(1, options.requiredTranslation),
    addressCountryCode: z.string().min(1, options.requiredTranslation),
    addressLevel1Id: z.string().min(1, options.requiredTranslation),
    addressLevel2Id: z.string(),
    addressLevel3Id: z.string(),
    addressLine1: z.string().min(1, options.requiredTranslation),
    addressLine2: z.string(),
    addressPostalCode: z.string(),
    phoneCountryCode: z.string().min(1, options.requiredTranslation),
    phoneNationalNumber: z.string().min(1, options.requiredTranslation),
    nationalityCode: z.string().min(1, options.requiredTranslation),
    birthDate: z.string().min(1, options.requiredTranslation),
  };
}

/** The cross-field checks that go with {@link personalDataShape}; call from the caller's `superRefine`. */
export function refinePersonalData(
  values: PersonalDataValues,
  ctx: z.RefinementCtx,
  options: PersonalDataSchemaOptions,
): void {
  const filled = (value: string) => value.trim().length > 0;

  if (filled(values.phoneNationalNumber) && !options.isValidPhone(values.phoneCountryCode, values.phoneNationalNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: options.phoneInvalidTranslation, path: ['phoneNationalNumber'] });
  }
  if (
    options.documentPattern &&
    filled(values.identityDocumentNumber) &&
    !options.documentPattern.test(values.identityDocumentNumber)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: options.documentInvalidTranslation,
      path: ['identityDocumentNumber'],
    });
  }
  if (values.birthDate) {
    const birth = new Date(values.birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
    if (age < options.minAgeYears) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: options.ageTooYoungTranslation(options.minAgeYears),
        path: ['birthDate'],
      });
    }
  }
}

/** Server profile → form state. Optional wire fields become empty strings, which is what inputs need. */
export function toPersonalDataValues(profile: UserProfile): PersonalDataValues {
  return {
    givenName: profile.givenName ?? '',
    familyName: profile.familyName ?? '',
    secondFamilyName: profile.secondFamilyName ?? '',
    identityDocumentCountryCode: profile.identityDocument?.countryCode ?? '',
    identityDocumentType: profile.identityDocument?.type ?? '',
    identityDocumentNumber: profile.identityDocument?.number ?? '',
    addressCountryCode: profile.address?.countryCode ?? '',
    addressLevel1Id: profile.address?.level1Id ?? '',
    addressLevel2Id: profile.address?.level2Id ?? '',
    addressLevel3Id: profile.address?.level3Id ?? '',
    addressLine1: profile.address?.line1 ?? '',
    addressLine2: profile.address?.line2 ?? '',
    addressPostalCode: profile.address?.postalCode ?? '',
    phoneCountryCode: profile.phone?.countryCode ?? '',
    phoneNationalNumber: profile.phone?.nationalNumber ?? '',
    nationalityCode: profile.nationalityCode ?? '',
    birthDate: profile.birthDate ?? '',
  };
}

/**
 * Form state → `PUT /{portal}/me`. `locale` and `timeZone` are carried through from the profile
 * the form was seeded with rather than re-detected from the device: this screen edits personal
 * data, and silently rewriting someone's language because they opened it on a borrowed phone
 * would be a change they never asked for.
 */
export function toUpdateProfileRequest(
  values: PersonalDataValues,
  context: { locale: string; timeZone: string },
): UpdateProfileRequest {
  return {
    givenName: values.givenName.trim(),
    familyName: values.familyName.trim(),
    secondFamilyName: values.secondFamilyName.trim() || undefined,
    identityDocument: {
      countryCode: values.identityDocumentCountryCode,
      type: values.identityDocumentType as IdentityDocumentType,
      number: values.identityDocumentNumber.trim(),
    },
    address: {
      countryCode: values.addressCountryCode,
      level1Id: values.addressLevel1Id,
      level2Id: values.addressLevel2Id || undefined,
      level3Id: values.addressLevel3Id || undefined,
      line1: values.addressLine1.trim(),
      line2: values.addressLine2.trim() || undefined,
      postalCode: values.addressPostalCode.trim() || undefined,
    },
    phone: {
      countryCode: values.phoneCountryCode,
      nationalNumber: values.phoneNationalNumber.trim(),
    },
    nationalityCode: values.nationalityCode,
    birthDate: values.birthDate,
    locale: context.locale,
    timeZone: context.timeZone,
  };
}
