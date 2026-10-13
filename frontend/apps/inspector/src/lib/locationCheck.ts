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
 * ¿Tiene sentido pedir la ubicación en este aparato? Se responde SIN pedir nada.
 *
 * <p>Espejo de `soporteDeCamara()` del paquete compartido, y por la misma razón: hasta hoy esta
 * pantalla tenía UNA respuesta —«Este aparato no ofrece ubicación»— para tres situaciones que se
 * arreglan en tres sitios distintos:</p>
 *
 * <ul>
 *   <li><b>`unsupported`</b>: el navegador no implementa la API. No se arregla desde los ajustes;
 *       se arregla cambiando de navegador.</li>
 *   <li><b>`insecure`</b>: la página no se sirve por HTTPS. El navegador no entrega la ubicación, y
 *       hace bien. Mandar a esta persona a revisar los permisos del teléfono es mandarla a buscar
 *       durante diez minutos algo que no va a encontrar — que es exactamente lo que pasaba, porque
 *       sin contexto seguro `getCurrentPosition` falla con el código 2 y eso se leía como «el
 *       aparato no tiene receptor».</li>
 *   <li><b>`ok`</b>: se puede pedir. Lo que conteste ya es otra pregunta.</li>
 * </ul>
 *
 * <p>El orden de las dos primeras comprobaciones importa: un navegador servido sin HTTPS tampoco
 * expone `geolocation` en algunos casos, así que si se preguntara primero por la API se diría
 * «navegador incompatible» de un navegador que está perfectamente bien.</p>
 */
export type SoporteDeUbicacion = 'ok' | 'unsupported' | 'insecure';

export function soporteDeUbicacion(): SoporteDeUbicacion {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.geolocation) return 'unsupported';
  return 'ok';
}

/**
 * Qué instrucciones de desbloqueo mostrarle a ESTA persona.
 *
 * <p>El §A paso 4 pide «instrucciones breves específicas para Safari/iPad» y el §F paso 9 prohíbe
 * «mostrar simultáneamente párrafos para iPhone, iPad y Android». Hasta hoy se mostraban los tres,
 * que es pedirle a alguien que busque su aparato en una lista mientras está de pie en la calle.</p>
 *
 * <p>Y hasta el 13-10 por la tarde sólo había tres respuestas: iOS, Android y `'otro'`. `'otro'`
 * era CUALQUIER escritorio, y para `'otro'` la pantalla no imprimía ninguna instrucción: el
 * desplegable «Cómo habilitar los permisos en este aparato» se abría vacío. Es el entorno desde el
 * que se prueba todos los días, y era justo donde no se decía nada.</p>
 *
 * <p>Peor aún: el texto que sí se mostraba hablaba de «los ajustes del aparato». En un escritorio
 * eso es falso — el permiso de un sitio no se cambia en los ajustes del sistema operativo, se
 * cambia en el candado de la barra de direcciones del navegador—, así que la única instrucción que
 * esta persona podía leer la mandaba al sitio equivocado.</p>
 *
 * <p>Por el `userAgent`, que para esto alcanza: no identifica a nadie ni decide nada de negocio,
 * sólo elige cuál párrafo se lee. Un iPad moderno se anuncia como Macintosh con pantalla táctil,
 * así que se comprueba también `maxTouchPoints`; y el orden importa, porque Chrome y Edge llevan
 * «Safari» en su cadena y Edge lleva «Chrome».</p>
 */
export type Aparato = 'ios' | 'android' | 'edge' | 'chrome' | 'firefox' | 'safari' | 'otro';

export function aparato(): Aparato {
  if (typeof navigator === 'undefined') return 'otro';
  const ua = navigator.userAgent;
  // Los aparatos de mano primero: ahí manda el sistema operativo, no el navegador.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  // Y en escritorio manda el navegador. De más específico a menos, que es la única forma de que
  // esta cadena de `if` no mienta: Edge dice ser Chrome y Chrome dice ser Safari.
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'otro';
}
