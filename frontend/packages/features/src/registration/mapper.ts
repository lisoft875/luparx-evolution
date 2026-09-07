import type { IdentityDocumentType, Portal, RegisterRequest } from '@luparx/api-client';
import type { RegistrationFormValues } from './schema';

export interface RegistrationSubmitContext {
  portal: Portal;
  locale: string;
  timeZone: string;
  termsVersion: string;
}

/** Assembles the flat form state into the nested wire shape CONTRACT.md §2 defines — field names and nesting must match exactly. */
export function toRegisterRequest(values: RegistrationFormValues, context: RegistrationSubmitContext): RegisterRequest {
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
    email: values.email.trim().toLowerCase(),
    birthDate: values.birthDate,
    password: values.password,
    locale: context.locale,
    timeZone: context.timeZone,
    acceptedTermsVersion: context.termsVersion,
    tenantId: values.tenantId || undefined,
    portal: context.portal,
  };
}
