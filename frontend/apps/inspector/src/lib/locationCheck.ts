import { probePosition, type PositionProbe } from './capture';

/**
 * La última comprobación de ubicación de ESTE aparato, guardada.
 *
 * <h2>Por qué hace falta, y por qué una lectura real y no el estado del permiso</h2>
 *
 * <p>En Safari de iPad, cuando alguien deniega la ubicación, el permiso se queda denegado y la
 * página no puede volver a preguntar: el aviso del sistema no reaparece. Hasta el 13-10-2026 el
 * botón «Volver a comprobar» de Ayuda sólo RELEÍA el estado del permiso, y por eso —reportado desde
 * un iPad de verdad— «no resolvía la situación»: releer algo que no cambió no cambia nada.</p>
 *
 * <p>Lo que sí cambia es que la persona vaya a los Ajustes de Safari y lo habilite. Y ahí está el
 * problema: el estado que la página lee puede quedar viejo, y en varios navegadores la API de
 * permisos ni siquiera contesta por la geolocalización. <b>La única prueba autoritativa es intentar
 * una lectura.</b> Así que «Comprobar ubicación» intenta, incluso con el permiso figurando como
 * denegado: si la persona acaba de habilitarlo en Ajustes, el intento devuelve coordenadas y la
 * pantalla se entera; si sigue denegado, devuelve `denied` al instante y sin abrir ningún aviso.</p>
 *
 * <p>Un intento por pulsación y ninguno automático: el §A paso 4 pide no entrar en un bucle de
 * solicitudes, y un diagnóstico que pide la ubicación solo cada vez que se abre sería eso.</p>
 *
 * <h2>Qué se guarda</h2>
 *
 * <p>Cuándo fue y qué contestó. Nunca las coordenadas en sí: el §A pide mostrar «fecha/hora de la
 * última comprobación y resultado real», y guardar la última posición conocida en el aparato sería
 * conservar un dato de ubicación que nadie necesita entre sesiones. Las coordenadas de la
 * comprobación viven en memoria mientras el panel está abierto y se van con él.</p>
 */
export interface ComprobacionGuardada {
  /** ISO. Cuándo se intentó. */
  cuando: string;
  /** Qué contestó el aparato. Sin coordenadas. */
  resultado: PositionProbe['outcome'];
}

const CLAVE = 'luparx.inspector.lastLocationCheck';

export function ultimaComprobacion(): ComprobacionGuardada | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const leido = JSON.parse(crudo) as Partial<ComprobacionGuardada>;
    if (typeof leido?.cuando !== 'string' || typeof leido?.resultado !== 'string') return null;
    return { cuando: leido.cuando, resultado: leido.resultado as PositionProbe['outcome'] };
  } catch {
    // Modo privado, almacenamiento lleno o un valor corrupto: no haber comprobado nunca y no poder
    // recordarlo se ven igual desde acá, y las dos se dicen igual en la pantalla.
    return null;
  }
}

/**
 * Intenta la lectura y deja constancia.
 *
 * @returns el resultado completo —con coordenadas si las hubo— para la pantalla que lo pidió.
 */
export async function comprobarUbicacion(): Promise<PositionProbe> {
  const resultado = await probePosition();
  try {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify({ cuando: new Date().toISOString(), resultado: resultado.outcome }),
    );
  } catch {
    // Que no se pueda recordar la comprobación no invalida la comprobación: se devuelve igual.
  }
  return resultado;
}

/**
 * Qué instrucciones de Ajustes mostrarle a ESTA persona.
 *
 * <p>El §A paso 4 pide «instrucciones breves específicas para Safari/iPad» y el §F paso 9 prohíbe
 * «mostrar simultáneamente párrafos para iPhone, iPad y Android». Hasta hoy se mostraban los tres,
 * que es pedirle a alguien que busque su aparato en una lista mientras está de pie en la calle.</p>
 *
 * <p>Por el `userAgent`, que para esto alcanza: no identifica a nadie ni decide nada de negocio,
 * sólo elige cuál de tres párrafos se lee. Un iPad moderno se anuncia como Macintosh con pantalla
 * táctil, así que se comprueba también `maxTouchPoints`.</p>
 */
export type Aparato = 'ios' | 'android' | 'otro';

export function aparato(): Aparato {
  if (typeof navigator === 'undefined') return 'otro';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'otro';
}
