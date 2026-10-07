import type { TranslationKey } from '@luparx/i18n';

/**
 * El mapa del Centro de Ayuda: cinco categorías y lo que se puede resolver en cada una.
 *
 * <h2>Por qué una tabla y no dos pantallas con su propio contenido</h2>
 *
 * <p>Las dos pantallas del centro —las categorías y las opciones de una categoría— y el buscador
 * leen de acá. Si cada una llevara su lista, el buscador encontraría opciones que la categoría ya
 * no muestra, que es la clase de discrepancia que no se nota hasta que alguien la reporta.</p>
 *
 * <h2>Qué es `accion`, y por qué puede faltar</h2>
 *
 * <p>Una opción SIEMPRE explica. El botón sólo aparece cuando hay una función de verdad detrás:
 * una ruta que ya existe, el diagnóstico, o recargar. La especificación lo pide en letra —«NO
 * crear un botón falso», «NO inventar una ruta»— y es además la única forma de que el centro siga
 * siendo creíble cuando crezca: la opción número treinta que no lleva a nada enseña a no pulsar
 * las veintinueve que sí.</p>
 */
export type AccionAyuda =
  | { tipo: 'ruta'; a: string }
  /** Abre el panel de diagnóstico, que es una pieza y no una pantalla. */
  | { tipo: 'diagnostico' }
  /** Vuelve a montar la aplicación. La recuperación que ya existía en el fiscalizador. */
  | { tipo: 'recargar' };

export interface OpcionAyuda {
  /** Sufijo de las claves de traducción: `.title`, `.body` y, si hay acción, `.action`. */
  clave: string;
  accion: AccionAyuda | null;
}

export type ClaveCategoria = 'parking' | 'payments' | 'fines' | 'vehicles' | 'app';

export interface CategoriaAyuda {
  clave: ClaveCategoria;
  opciones: OpcionAyuda[];
}

export const CATEGORIAS: CategoriaAyuda[] = [
  {
    clave: 'parking',
    opciones: [
      // Ampliar es un panel dentro de la tarjeta de la estadía en curso del Inicio, no una ruta.
      { clave: 'moreTime', accion: { tipo: 'ruta', a: '/' } },
      { clave: 'cantStart', accion: { tipo: 'ruta', a: '/park' } },
      { clave: 'ended', accion: { tipo: 'ruta', a: '/park' } },
      { clave: 'cantPay', accion: { tipo: 'ruta', a: '/wallet' } },
      // La zona se elige de una lista en el flujo de estacionar: un GPS malo no impide estacionar.
      { clave: 'location', accion: { tipo: 'ruta', a: '/park' } },
    ],
  },
  {
    clave: 'payments',
    opciones: [
      { clave: 'cantPay', accion: { tipo: 'ruta', a: '/wallet' } },
      { clave: 'missing', accion: { tipo: 'ruta', a: '/movements' } },
      { clave: 'movements', accion: { tipo: 'ruta', a: '/movements' } },
      { clave: 'unknownCharge', accion: { tipo: 'ruta', a: '/movements' } },
      { clave: 'walletHelp', accion: { tipo: 'ruta', a: '/wallet' } },
    ],
  },
  {
    clave: 'fines',
    opciones: [
      { clave: 'got', accion: { tipo: 'ruta', a: '/fines' } },
      // Apelar necesita saber CUÁL boleta (`/fines/:id/appeal`), así que se elige en la lista.
      { clave: 'appeal', accion: { tipo: 'ruta', a: '/fines' } },
      { clave: 'dontUnderstand', accion: { tipo: 'ruta', a: '/fines' } },
      { clave: 'mine', accion: { tipo: 'ruta', a: '/fines' } },
    ],
  },
  {
    clave: 'vehicles',
    opciones: [
      { clave: 'add', accion: { tipo: 'ruta', a: '/vehicles' } },
      { clave: 'edit', accion: { tipo: 'ruta', a: '/vehicles' } },
      { clave: 'list', accion: { tipo: 'ruta', a: '/vehicles' } },
      { clave: 'shared', accion: { tipo: 'ruta', a: '/vehicles' } },
    ],
  },
  {
    clave: 'app',
    opciones: [
      { clave: 'offline', accion: { tipo: 'diagnostico' } },
      { clave: 'location', accion: { tipo: 'diagnostico' } },
      { clave: 'notifications', accion: { tipo: 'ruta', a: '/notifications' } },
      { clave: 'error', accion: { tipo: 'recargar' } },
      { clave: 'diagnostic', accion: { tipo: 'diagnostico' } },
    ],
  },
];

/** La clave de traducción del título de una categoría. */
export function tituloCategoria(clave: ClaveCategoria): TranslationKey {
  return `citizen.help.cat.${clave}.title` as TranslationKey;
}

/** Las tres claves de una opción. `action` sólo se usa cuando la opción tiene acción. */
export function clavesOpcion(
  categoria: ClaveCategoria,
  opcion: string,
): { title: TranslationKey; body: TranslationKey; action: TranslationKey } {
  return {
    title: `citizen.help.opt.${categoria}.${opcion}.title` as TranslationKey,
    body: `citizen.help.opt.${categoria}.${opcion}.body` as TranslationKey,
    action: `citizen.help.opt.${categoria}.${opcion}.action` as TranslationKey,
  };
}

export function categoriaPorClave(clave: string | undefined): CategoriaAyuda | null {
  return CATEGORIAS.find((categoria) => categoria.clave === clave) ?? null;
}

/** Sin acentos y en minúscula: quien escribe «multa» con prisa busca «Multas». */
export function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
