import type { Portal, RegisterRequest } from '@luparx/api-client';
import { toUpdateProfileRequest } from '../profile/personalData';
import type { RegistrationFormValues } from './schema';

export interface RegistrationSubmitContext {
  portal: Portal;
  locale: string;
  timeZone: string;
  termsVersion: string;
}

/**
 * Flat form state → the nested wire shape of CONTRACT.md §2. The personal half is assembled by
 * the same function the profile screen uses, so a change to how an address or a document travels
 * lands on both screens at once; only the account fields are added here.
 */
export function toRegisterRequest(values: RegistrationFormValues, context: RegistrationSubmitContext): RegisterRequest {
  return {
    ...toUpdateProfileRequest(values, { locale: context.locale, timeZone: context.timeZone }),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    acceptedTermsVersion: context.termsVersion,
    tenantId: values.tenantId || undefined,
    portal: context.portal,
  };
}
