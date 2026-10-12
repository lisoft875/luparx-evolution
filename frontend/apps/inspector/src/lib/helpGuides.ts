import type { TranslationKey } from '@luparx/i18n';

/**
 * Las seis guías de uso del Centro de soporte (§6 del encargo del 12-10-2026).
 *
 * <h2>Qué es y qué no es</h2>
 *
 * <p>Cada guía describe lo que ESTA aplicación hace, paso por paso, y nada más. No es el
 * procedimiento legal de una municipalidad —cuándo corresponde multar, qué plazo tiene un reclamo,
 * qué hacer si el conductor está presente— porque eso no lo sabe el código y escribirlo acá sería
 * inventar una norma con cara de instrucción. Los seis temas son los que el §6 nombra.</p>
 *
 * <h2>Por qué los textos están en i18n y no acá</h2>
 *
 * <p>Por lo mismo que el resto de la aplicación: `en-US.ts` es `Record<TranslationKey, string>`, así
 * que una guía sin traducir rompe el chequeo de tipos en vez de aparecer en español dentro de una
 * pantalla en inglés. Acá queda la ESTRUCTURA —qué guías hay y de cuántos pasos— que es lo que la
 * pantalla necesita para dibujarlas sin saber de ninguna en particular.</p>
 *
 * <h2>Por qué no se reutiliza el centro de ayuda del ciudadano</h2>
 *
 * <p>Se miró primero, como pide el §0: `apps/citizen/src/lib/helpCenter.ts` tiene categorías,
 * búsqueda y dos niveles de navegación. Esa ESTRUCTURA es para un catálogo de treinta temas que
 * alguien explora; acá son seis tareas que alguien ya sabe que tiene que hacer, y envolverlas en
 * un buscador sería poner un índice a una página. El contenido no se comparte en absoluto: el
 * ciudadano no emite boletas ni trabaja sin señal.</p>
 */
export interface Guia {
  /** Identificador estable. Se dibuja como `data-guia` y es por donde lo miden las pruebas. */
  clave: string;
  /** Cuántos pasos tiene. Las claves son `…<clave>.s1` … `.s<pasos>`. */
  pasos: number;
}

export const GUIAS: readonly Guia[] = [
  { clave: 'lookup', pasos: 5 },
  { clave: 'cite', pasos: 5 },
  { clave: 'photos', pasos: 4 },
  { clave: 'offline', pasos: 4 },
  { clave: 'sync', pasos: 4 },
  { clave: 'trouble', pasos: 4 },
];

export function tituloDeGuia(clave: string): TranslationKey {
  return `inspector.help.guide.${clave}.title` as TranslationKey;
}

export function pasoDeGuia(clave: string, n: number): TranslationKey {
  return `inspector.help.guide.${clave}.s${n}` as TranslationKey;
}
