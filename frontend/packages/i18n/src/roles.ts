import type { TranslationKey } from './locales/es-CR';

/**
 * El nombre humano de un rol.
 *
 * <h2>Por qué una función y no un objeto `ROLE_LABELS`</h2>
 *
 * <p>Porque la fuente de verdad ya existía y es la tabla de traducciones: las claves `role.*` de
 * cada idioma, que `RolesPage` y el menú de cuenta del admin ya usaban. Un segundo mapa de
 * etiquetas en código habría sido exactamente lo que la Fase 1 prohíbe —duplicar traducciones— y
 * además habría dejado el portal en un solo idioma.</p>
 *
 * <p>Lo que faltaba no era el mapa, era que nadie escribiera la clave a mano. Cada sitio ponía
 * {@code t(`role.${x}` as TranslationKey)}, con su propio `as` y su propia oportunidad de
 * equivocarse; de hecho así nació el defecto de que INSPECTOR_LEAD fuera «Jefe de fiscalización»
 * en una pantalla y «Supervisor de fiscalización» en otra, con dos juegos de claves distintos.</p>
 *
 * <h2>Qué pasa con un rol que el servidor estrene mañana</h2>
 *
 * <p>Devuelve su código tal cual —`TENANT_AUDITOR`— y no `role.TENANT_AUDITOR`. Es feo a propósito
 * y es lo correcto: un código suelto en la pantalla se ve y se reporta, mientras que el nombre de
 * una clave de traducción parece un error del programa y manda a buscar en el sitio equivocado. Un
 * rol sin etiqueta es una traducción que falta, no un fallo.</p>
 */
export function roleLabel(t: (key: TranslationKey) => string, role: string): string {
  const clave = `role.${role}` as TranslationKey;
  const texto = t(clave);
  return texto === clave ? role : texto;
}
