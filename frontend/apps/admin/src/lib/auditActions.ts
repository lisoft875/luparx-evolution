import type { TranslationKey } from '@luparx/i18n';

/**
 * Las acciones auditables, por categoría (05-10-2026).
 *
 * <h2>Por qué la categoría ahora es un dato y no un comentario</h2>
 *
 * <p>Esta lista ya estaba ordenada por áreas de trabajo, con las áreas escritas como comentarios:
 * `// personas`, `// puestos`, `// dinero`. El orden servía para leer el archivo y para nada más,
 * porque el desplegable recibía las ochenta y cuatro seguidas, sin rótulos. El hallazgo del
 * 05-10-2026 lo dice exacto: «el problema no es que existan muchas acciones auditables, sino
 * presentar una lista demasiado larga sin organización».</p>
 *
 * <p>Así que las áreas pasan de comentario a dato y el desplegable las dibuja. {@link AUDIT_ACTIONS}
 * se DERIVA de acá y conserva el mismo orden, de modo que no hay dos listas que puedan separarse —
 * que es como se pierde una acción auditable del filtro sin que nadie se entere.</p>
 *
 * <h2>Por qué escrita a mano y no derivada del enum del servidor</h2>
 *
 * <p>El orden es el del trabajo —personas, puestos, municipalidad, parqueo, exoneraciones, boletas,
 * dinero, seguridad— y no el alfabético de un enum de Java. Y el catálogo del servidor tiene
 * constantes retiradas que ya nada escribe: ofrecerlas como filtro sería ofrecer búsquedas que
 * nunca devuelven nada.</p>
 *
 * <p>Si el servidor gana una acción y no aparece acá, la pantalla no miente: la bitácora la muestra
 * igual con su código, y {@link auditActionLabel} devuelve el código cuando no hay traducción. Lo
 * único que se pierde es poder elegirla del desplegable.</p>
 */
export const AUDIT_ACTION_GROUPS: readonly { clave: string; acciones: readonly string[] }[] = [
  {
    clave: 'people',
    acciones: [
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
    ],
  },
  {
    clave: 'staff',
    acciones: [
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
    ],
  },
  {
    clave: 'tenant',
    acciones: [
      'TENANT_UPDATED',
      'TENANT_SETTING_CHANGED',
      'TENANT_LOCALES_UPDATED',
      'TENANT_BRANDING_UPDATED',
    ],
  },
  {
    clave: 'parking',
    acciones: [
      'VEHICLE_REGISTERED',
      'VEHICLE_UPDATED',
      'VEHICLE_DELETED',
      'VEHICLE_PRIMARY_CHANGED',
      'PARKING_SESSION_STARTED',
      'PARKING_SESSION_EXTENDED',
      'PARKING_SESSION_FINISHED',
      'PARKING_POLICY_UPDATED',
      'PARKING_SCHEDULE_UPDATED',
      'PARKING_ZONE_CREATED',
      'PARKING_ZONE_UPDATED',
      'PARKING_ZONE_RULES_UPDATED',
      'PARKING_ZONE_GEOMETRY_UPDATED',
      'PARKING_ZONE_GEOMETRY_CLEARED',
      'PARKING_RATE_UPDATED',
      'PARKING_SPACE_CREATED',
      'PARKING_SPACE_UPDATED',
      'PARKING_SPACE_RENAMED',
      'PARKING_SPACE_FORMAT_UPDATED',
    ],
  },
  {
    // Las exoneraciones no están en la lista de categorías del informe, y tienen grupo propio igual:
    // son once acciones y meterlas en «Parqueo» las esconde detrás de diecinueve.
    clave: 'exemptions',
    acciones: [
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
    ],
  },
  {
    clave: 'citations',
    acciones: [
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
    ],
  },
  {
    clave: 'finance',
    acciones: [
      'WALLET_TOPUP_RECORDED',
      'WALLET_TOPUP_CODE_ROTATED',
      'WALLET_TOPUP_CODE_RESOLVED',
      'SETTLEMENT_IMPORTED',
      'SETTLEMENT_DISPUTED',
    ],
  },
  {
    // Entrar, salir, cambiar de municipalidad, exportar, cotejar una dirección y purgar: todo lo
    // que una auditoría mira cuando la pregunta es «quién estuvo acá y qué se llevó».
    clave: 'security',
    acciones: [
      'LOGIN_SUCCEEDED',
      'LOGIN_FAILED',
      'LOGOUT',
      'REFRESH_TOKEN_REUSE_DETECTED',
      'SESSION_TENANT_SWITCHED',
      'EXPORT_REQUESTED',
      'AUDIT_ORIGIN_PROBED',
      'RETENTION_PURGE_RAN',
    ],
  },
];

/** La misma lista, plana y en el mismo orden. Derivada para que no haya dos que puedan separarse. */
export const AUDIT_ACTIONS: readonly string[] = AUDIT_ACTION_GROUPS.flatMap((grupo) => grupo.acciones);

/** A qué grupo pertenece una acción, o `undefined` si el servidor la escribe y acá no está. */
export function auditActionGroup(accion: string): string | undefined {
  return AUDIT_ACTION_GROUPS.find((grupo) => grupo.acciones.includes(accion))?.clave;
}

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
