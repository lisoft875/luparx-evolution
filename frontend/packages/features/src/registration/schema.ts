import { z } from 'zod';
import {
  PERSONAL_DATA_DEFAULT_VALUES,
  personalDataShape,
  refinePersonalData,
  type PersonalDataSchemaOptions,
  type PersonalDataValues,
} from '../profile/personalData';

/**
 * Field order matches CONTRACT.md §2 exactly (name -> identity document -> address -> phone ->
 * nationality -> email -> birth date), followed by the account fields (password, terms). The
 * personal half is shared with the "my account" screen (see ../profile/personalData) so the two
 * screens can never disagree on what a valid citizen looks like; registration adds only what an
 * account needs on top: the e-mail, the password and the accepted terms.
 */
export interface RegistrationFormValues extends PersonalDataValues {
  email: string;
  password: string;
  confirmPassword: string;
  tenantId: string;
  acceptedTerms: boolean;
}

export interface RegistrationSchemaOptions extends PersonalDataSchemaOptions {
  emailInvalidTranslation: string;
  passwordTooShortTranslation: (min: number) => string;
  passwordMismatchTranslation: string;
  termsRequiredTranslation: string;
  /** `admin`/`inspector` self-registration always targets a specific municipality (CONTRACT.md §1); `citizen` may register tenant-less. */
  tenantRequired: boolean;
  tenantRequiredTranslation: string;
}

const MIN_PASSWORD_LENGTH = 10;

export function buildRegistrationSchema(options: RegistrationSchemaOptions): z.ZodType<RegistrationFormValues> {
  return z
    .object({
      ...personalDataShape(options),
      email: z.string().min(1, options.requiredTranslation).email(options.emailInvalidTranslation),
      password: z.string().min(MIN_PASSWORD_LENGTH, options.passwordTooShortTranslation(MIN_PASSWORD_LENGTH)),
      confirmPassword: z.string(),
      tenantId: z.string(),
      acceptedTerms: z.boolean(),
    })
    .superRefine((values, ctx) => {
      refinePersonalData(values, ctx, options);
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
      if (options.tenantRequired && values.tenantId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.tenantRequiredTranslation,
          path: ['tenantId'],
        });
      }
    });
}

export const REGISTRATION_DEFAULT_VALUES: RegistrationFormValues = {
  ...PERSONAL_DATA_DEFAULT_VALUES,
  email: '',
  password: '',
  confirmPassword: '',
  tenantId: '',
  acceptedTerms: false,
};
