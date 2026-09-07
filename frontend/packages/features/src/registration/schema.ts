import { z } from 'zod';
import type { IdentityDocumentType } from '@luparx/api-client';

/**
 * Field order below matches CONTRACT.md §2 exactly (name -> identity document
 * -> address -> phone -> nationality -> email -> birth date), followed by the
 * account fields (password, terms). UI components render in this same order.
 */
export interface RegistrationFormValues {
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
  email: string;
  birthDate: string;
  password: string;
  confirmPassword: string;
  tenantId: string;
  acceptedTerms: boolean;
}

export interface RegistrationSchemaOptions {
  minAgeYears: number;
  requiredTranslation: string;
  emailInvalidTranslation: string;
  passwordTooShortTranslation: (min: number) => string;
  passwordMismatchTranslation: string;
  phoneInvalidTranslation: string;
  documentInvalidTranslation: string;
  ageTooYoungTranslation: (min: number) => string;
  termsRequiredTranslation: string;
  /** Injected rather than imported directly so this package doesn't hard-depend on libphonenumber-js's call shape. */
  isValidPhone: (countryCode: string, nationalNumber: string) => boolean;
  /** Regex sourced from the identity-document-types catalog (CONTRACT.md §5) for the currently selected country+type; undefined until loaded. */
  documentPattern: RegExp | undefined;
  /** `admin`/`inspector` self-registration always targets a specific municipality (CONTRACT.md §1); `citizen` may register tenant-less. */
  tenantRequired: boolean;
  tenantRequiredTranslation: string;
}

const MIN_PASSWORD_LENGTH = 10;

export function buildRegistrationSchema(options: RegistrationSchemaOptions): z.ZodType<RegistrationFormValues> {
  const required = (value: string) => value.trim().length > 0;

  return z
    .object({
      givenName: z.string().min(1, options.requiredTranslation),
      familyName: z.string().min(1, options.requiredTranslation),
      secondFamilyName: z.string(),
      identityDocumentCountryCode: z.string().min(1, options.requiredTranslation),
      // Widened to `string` at the zod level (the enum is data-driven from the catalog, CONTRACT.md §5);
      // narrowed back to the form's literal-union type here, since the "required" check already
      // guarantees a non-empty value and the catalog-pattern check in superRefine guards the rest.
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
      email: z.string().min(1, options.requiredTranslation).email(options.emailInvalidTranslation),
      birthDate: z.string().min(1, options.requiredTranslation),
      password: z.string().min(MIN_PASSWORD_LENGTH, options.passwordTooShortTranslation(MIN_PASSWORD_LENGTH)),
      confirmPassword: z.string(),
      tenantId: z.string(),
      acceptedTerms: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.password !== values.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.passwordMismatchTranslation,
          path: ['confirmPassword'],
        });
      }
      if (!values.acceptedTerms) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.termsRequiredTranslation,
          path: ['acceptedTerms'],
        });
      }
      if (required(values.phoneNationalNumber) && !options.isValidPhone(values.phoneCountryCode, values.phoneNationalNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.phoneInvalidTranslation,
          path: ['phoneNationalNumber'],
        });
      }
      if (
        options.documentPattern &&
        required(values.identityDocumentNumber) &&
        !options.documentPattern.test(values.identityDocumentNumber)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.documentInvalidTranslation,
          path: ['identityDocumentNumber'],
        });
      }
      if (options.tenantRequired && !required(values.tenantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.tenantRequiredTranslation,
          path: ['tenantId'],
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
    });
}

export const REGISTRATION_DEFAULT_VALUES: RegistrationFormValues = {
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
  email: '',
  birthDate: '',
  password: '',
  confirmPassword: '',
  tenantId: '',
  acceptedTerms: false,
};
