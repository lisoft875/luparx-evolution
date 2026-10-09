/**
 * La cámara del navegador, para los dos portales que la usan.
 *
 * <h2>Por qué esto vive en el paquete compartido y no en cada aplicación</h2>
 *
 * <p>El fiscalizador la necesita para la evidencia de una boleta y el ciudadano para la de una
 * impugnación. Son usos distintos con pantallas distintas, pero el aparato es el mismo y las
 * respuestas del navegador también: o concede, o deniega, o no hay cámara, o la página no es
 * segura. Duplicar esa tabla de respuestas es duplicar los errores de interpretación —el día que
 * una de las dos copias aprenda a distinguir «no hay cámara» de «me dijeron que no», la otra
 * seguirá mintiendo.</p>
 *
 * <p>Lo que NO se comparte es la política: qué permisos pide cada portal, cuándo y con qué
 * explicación. El ciudadano pide la cámara y nada más —su encargo lo prohíbe en letra: «no
 * solicitar ubicación ni otros permisos como consecuencia de habilitar la cámara»—, mientras el
 * fiscalizador pide cámara y ubicación porque una boleta sin coordenadas vale menos. Esa decisión
 * se toma en cada portal; acá sólo está el aparato.</p>
 *
 * <h2>Nada acá pregunta nada por su cuenta</h2>
 *
 * <p>`soporteDeCamara` y `estadoDeCamara` se contestan sin abrir ningún aviso: miran la API y, en
 * los navegadores que lo implementan, el registro de permisos. El aviso del sistema lo dispara
 * UNA sola función, `abrirCamara`, y por eso esa es la que se llama desde un botón y nunca al
 * montar una pantalla.</p>
 */

/** Lo que se puede decir de un permiso sin preguntarle a nadie. */
export type EstadoDeCamara = 'granted' | 'denied' | 'asksOnUse';

/**
 * Por qué no se pudo abrir la cámara.
 *
 * <p>Cinco y no uno porque cada uno se arregla distinto y la pantalla tiene que poder decir cuál
 * es: «dale permiso en el candado de la barra de direcciones» no sirve de nada si lo que pasa es
 * que la computadora no tiene cámara.</p>
 */
export type ProblemaDeCamara =
  /** El navegador no implementa `getUserMedia`. */
  | 'unsupported'
  /** La página no es segura (ni HTTPS ni localhost). El navegador no entrega la cámara, y hace bien. */
  | 'insecure'
  /** La persona dijo que no, o una política del navegador lo bloquea. */
  | 'denied'
  /** No hay ninguna cámara conectada. */
  | 'notFound'
  /** Hay cámara, pero otra aplicación la tiene tomada. */
  | 'busy'
  /** Cualquier otra cosa. Se informa igual: lo que no se puede es callarla. */
  | 'failed';

export interface FotoTomada {
  blob: Blob;
  fileName: string;
  /** Cuándo se disparó el obturador, según este aparato. */
  capturedAt: string;
}

/**
 * ¿Tiene sentido ofrecer la cámara en este aparato? Se responde SIN pedir nada.
 *
 * <p>Distingue «el navegador no sabe» de «la página no es segura» porque los consejos no se
 * parecen: uno es actualizar el navegador y el otro entrar por HTTPS. Un navegador servido sin
 * HTTPS tampoco expone `mediaDevices`, así que el orden de las dos preguntas importa.</p>
 */
export function soporteDeCamara(): 'ok' | ProblemaDeCamara {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'ok';
}

/**
 * El permiso, leído sin abrir ningún aviso.
 *
 * <p>`navigator.permissions.query({name:'camera'})` lo contesta en Chromium. Safari y Firefox no
 * implementan ese nombre: lanzan, y entonces la respuesta honesta es `asksOnUse` —«se pide al
 * usarla»—, que es exactamente lo que pasa ahí. Nunca devuelve `granted` por suposición: pintar
 * de verde un permiso que nadie concedió es el defecto que este módulo existe para no repetir.</p>
 */
export async function estadoDeCamara(): Promise<EstadoDeCamara> {
  if (soporteDeCamara() !== 'ok') return 'asksOnUse';
  try {
    const estado = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (estado.state === 'granted') return 'granted';
    if (estado.state === 'denied') return 'denied';
    return 'asksOnUse';
  } catch {
    return 'asksOnUse';
  }
}

/**
 * Abre la cámara. ESTO es lo que dispara el aviso del sistema, y por eso se llama desde un botón.
 *
 * <p>Cámara trasera por preferencia y no por obligación (`ideal` y no `exact`): en una
 * computadora no hay trasera, y exigirla haría fallar la apertura justo donde la prueba se corre
 * todos los días.</p>
 *
 * <p>Quien la llama es el dueño del `MediaStream` y tiene que apagarlo con {@link detenerCamara}.
 * Un stream vivo deja la luz de la cámara encendida; una aplicación municipal que deja la cámara
 * encendida después de cerrar una ventana no es un descuido, es un problema.</p>
 */
export async function abrirCamara(): Promise<{ stream: MediaStream } | { problema: ProblemaDeCamara }> {
  const soporte = soporteDeCamara();
  if (soporte !== 'ok') return { problema: soporte };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    return { stream };
  } catch (error) {
    const nombre = (error as DOMException)?.name ?? '';
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return { problema: 'denied' };
    if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return { problema: 'notFound' };
    if (nombre === 'NotReadableError' || nombre === 'AbortError') return { problema: 'busy' };
    return { problema: 'failed' };
  }
}

/** Apaga el stream. Idempotente: llamarla de más no rompe nada; no llamarla sí. */
export function detenerCamara(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Comprueba el acceso REAL a la cámara: la abre y la apaga en el acto.
 *
 * <p>Es la diferencia entre decir que el permiso está concedido y saberlo. El encargo lo pide con
 * todas las letras —«verificar el acceso real a la cámara; no basta con cambiar el texto ni
 * mostrar un estado verde»— y tiene razón: `permissions.query` puede decir `granted` mientras la
 * única cámara del aparato la tiene tomada otra aplicación, y el permiso concedido no sirve de
 * nada. Esto abre, confirma que llegó un stream con al menos una pista de vídeo, y cierra.</p>
 */
export async function probarCamara(): Promise<'ok' | ProblemaDeCamara> {
  const resultado = await abrirCamara();
  if ('problema' in resultado) return resultado.problema;
  const pistas = resultado.stream.getVideoTracks().length;
  detenerCamara(resultado.stream);
  return pistas > 0 ? 'ok' : 'notFound';
}

/**
 * Un fotograma del vídeo, convertido en archivo.
 *
 * <p>Al tamaño que entregó la cámara (`videoWidth`/`videoHeight`) y no al que se está viendo en
 * pantalla: lo que vale como evidencia es la resolución del sensor, y una foto reescalada al
 * ancho de una ventana no sirve para leer una placa.</p>
 *
 * <p>JPEG al 0.92. El fotograma SIEMPRE hay que codificarlo —no existe un archivo original que
 * respetar, como sí pasa con la cámara nativa— y un PNG de 1920x1080 pesa varios megabytes contra
 * un tope de bytes que ya existe. 0.92 es donde el artefacto de compresión todavía no se ve en el
 * texto de una placa.</p>
 */
export async function fotoDelFotograma(video: HTMLVideoElement): Promise<FotoTomada | null> {
  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  if (!ancho || !alto) return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext('2d');
  if (!contexto) return null;
  contexto.drawImage(video, 0, 0, ancho, alto);
  const blob = await new Promise<Blob | null>((resolver) => {
    lienzo.toBlob((resultado) => resolver(resultado), 'image/jpeg', 0.92);
  });
  if (!blob) return null;
  return { blob, fileName: `evidencia-${Date.now()}.jpg`, capturedAt: new Date().toISOString() };
}
