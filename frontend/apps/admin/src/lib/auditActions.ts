import type { TranslationKey } from '@luparx/i18n';

/**
 * Las acciones que la bitácora puede registrar, en el orden en que se ofrecen a quien filtra.
 *
 * <h2>Por qué existe esta lista</h2>
 *
 * <p>Hasta hoy el filtro «Acción» era una caja de texto libre. Para encontrar una asignación de
 * sectores había que escribir, exactamente, {@code MEMBERSHIP_ZONES_ASSIGNED}. Una persona que
 * administra una municipalidad no tiene por qué conocer los nombres internos de los eventos de la
 * plataforma, y un filtro que sólo funciona si ya se sabe la respuesta no es un filtro.</p>
 *
 * <h2>Por qué escrita a mano y no derivada</h2>
 *
 * <p>El orden es el del trabajo —personas, sesiones, puestos, municipalidad, parqueo, exoneraciones,
 * boletas, dinero— y no el alfabético de un enum de Java. Y el catálogo del servidor tiene
 * constantes retiradas que ya nada escribe: ofrecerlas como filtro sería ofrecer búsquedas que nunca
 * devuelven nada.</p>
 *
 * <p>Si el servidor gana una acción y no aparece acá, la pantalla no miente: la bitácora la muestra
 * igual con su código, y {@link auditActionLabel} devuelve el código cuando no hay traducción. Lo
 * único que se pierde es poder elegirla del desplegable.</p>
 */
export const AUDIT_ACTIONS: readonly string[] = [
  // personas
  'USER_REGISTERED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_BLOCKED',
  'USER_UNBLOCKED',
  'USER_PASSWORD_RESET_REQUESTED',
  'USER_PASSWORD_CHANGED',
  'USER_EMAIL_VERIFIED',
  'USER_EMAIL_CHANGE_REQUESTED',
  'USER_EMAIL_CHANGED',
  'USER_DIRECTORY_LOOKUP',
  // sesiones
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGOUT',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'SESSION_TENANT_SWITCHED',
  // puestos
  'MEMBERSHIP_REQUESTED',
  'MEMBERSHIP_CREATED',
  'MEMBERSHIP_APPROVED',
  'MEMBERSHIP_REJECTED',
  'MEMBERSHIP_REVOKED',
  'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_REACTIVATED',
  'MEMBERSHIP_ZONES_ASSIGNED',
  'MEMBERSHIP_ROLE_CHANGED',
  'STAFF_INVITATION_SENT',
  'STAFF_INVITATION_REVOKED',
  'STAFF_INVITATION_ACCEPTED',
  // municipalidad
  'TENANT_UPDATED',
  'TENANT_SETTING_CHANGED',
  'TENANT_LOCALES_UPDATED',
  'TENANT_BRANDING_UPDATED',
  'EXPORT_REQUESTED',
  'AUDIT_ORIGIN_PROBED',
  'RETENTION_PURGE_RAN',
  // parqueo
  'VEHICLE_REGISTERED',
  'VEHICLE_UPDATED',
  'VEHICLE_DELETED',
  'VEHICLE_PRIMARY_CHANGED',
  'PARKING_SESSION_STARTED',
  'PARKING_SESSION_EXTENDED',
  'PARKING_SESSION_FINISHED',
  'PARKING_POLICY_UPDATED',
  'PARKING_SCHEDULE_UPDATED',
  'PARKING_ZONE_UPDATED',
  'PARKING_ZONE_RULES_UPDATED',
  'PARKING_ZONE_GEOMETRY_UPDATED',
  'PARKING_ZONE_GEOMETRY_CLEARED',
  'PARKING_RATE_UPDATED',
  'PARKING_SPACE_CREATED',
  'PARKING_SPACE_UPDATED',
  'PARKING_SPACE_RENAMED',
  'PARKING_SPACE_FORMAT_UPDATED',
  // exoneraciones
  'PLATE_EXEMPTION_REQUESTED',
  'PLATE_EXEMPTION_GRANTED',
  'PLATE_EXEMPTION_APPROVED',
  'PLATE_EXEMPTION_REJECTED',
  'PLATE_EXEMPTION_AMENDED',
  'PLATE_EXEMPTION_REVOKED',
  'PLATE_EXEMPTION_PLATE_ADDED',
  'PLATE_EXEMPTION_PLATE_REMOVED',
  'PLATE_EXEMPTION_DOCUMENT_ATTACHED',
  'EXEMPTION_TYPE_CREATED',
  'EXEMPTION_TYPE_UPDATED',
  // boletas
  'CITATION_DRAFTED',
  'CITATION_ISSUED',
  'CITATION_EVIDENCE_ATTACHED',
  'CITATION_STATUS_CHANGED',
  'CITATION_CANCELLED',
  'CITATION_PAID',
  'CITATION_INGESTED',
  'CITATION_APPEAL_FILED',
  'CITATION_APPEAL_RESOLVED',
  'APPEAL_NOTICE_PUBLISHED',
  'INFRACTION_TYPES_UPDATED',
  'EXTERNAL_CAUSAL_MAPPED',
  'ENFORCEMENT_SETTINGS_UPDATED',
  // dinero
  'WALLET_TOPUP_RECORDED',
  'WALLET_TOPUP_CODE_ROTATED',
  'WALLET_TOPUP_CODE_RESOLVED',
  'SETTLEMENT_IMPORTED',
  'SETTLEMENT_DISPUTED',
];

/**
 * El nombre humano de una acción, o su código si todavía no tiene uno.
 *
 * <p>El código crudo es una respuesta peor que una traducción y mucho mejor que un espacio en
 * blanco: la fila sigue diciendo qué pasó y sigue siendo buscable, que es de lo que se trata una
 * bitácora.</p>
 */
export function auditActionLabel(
  t: (key: TranslationKey) => string,
  action: string,
): string {
  const clave = `audit.action.${action}` as TranslationKey;
  const texto = t(clave);
  return texto === clave ? action : texto;
}
