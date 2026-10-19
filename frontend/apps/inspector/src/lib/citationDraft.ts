/**
 * El borrador de la boleta en curso: lo que se estaba escribiendo cuando el aparato se recargó.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>Hasta hoy, el formulario vivía entero en memoria. Un fiscalizador que llenaba placa, tipo,
 * notas y tres fotos, y al que se le bloqueaba o recargaba el iPad, perdía el trabajo completo y
 * tenía que volver al carro. El borrador que sí existía era el de la cola, y ése empieza DESPUÉS
 * de tocar «Emitir»: justo después del punto donde se pierde el trabajo.</p>
 *
 * <p>El reparto es el mismo que ya usa la cola, y por la misma razón: los metadatos en
 * `localStorage`, que es sincrónico y sobrevive a la recarga, y los bytes de las fotos en
 * IndexedDB, que es donde caben. Nada de esto va al servidor: un borrador no es una boleta.</p>
 *
 * <h2>Por qué caduca</h2>
 *
 * <p>Un borrador viejo restaurado en silencio es peligroso de una forma que un borrador perdido no
 * lo es: devuelve la placa y las FOTOS de otro carro dentro del formulario de hoy, y el
 * fiscalizador puede emitir sobre datos que ya no corresponden. Por eso caduca a las
 * {@link HORAS_DE_VIDA} horas, y por eso la pantalla dice de cuándo es lo que restauró en vez de
 * rellenar el formulario como si no hubiera pasado nada.</p>
 */
import { deletePhotos, getPhoto, putPhoto } from './photoStore';
import { marcarEscrituraCorrecta, marcarEscrituraFallida } from './almacenamiento';
import type { PreparedPhoto } from './evidencePreparation';

/** Pasado este tiempo el borrador no se ofrece: es de otra jornada y probablemente de otro carro. */
export const HORAS_DE_VIDA = 12;

const CLAVE = 'luparx.inspector.citationDraft';
const clave = (tenantId: string): string => `${CLAVE}.${tenantId}`;

/** Los datos de una foto SIN los bytes: éstos viven en IndexedDB bajo `clavaFoto`. */
interface FotoGuardada {
  claveFoto: string;
  fileName: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  scaledDown: boolean;
  originalByteSize: number;
  tipoMime: string;
}

export interface BorradorBoleta {
  plate: string;
  typeId: string;
  zoneId: string;
  spaceCode: string;
  addressText: string;
  notes: string;
  position: { latitude: number; longitude: number; accuracyM: number | null } | null;
  fotos: FotoGuardada[];
  /** Instante ISO en que se guardó. La pantalla lo muestra: un borrador sin fecha no es revisable. */
  guardadoEn: string;
  /**
   * Cuántas fotografías TENÍA el fiscalizador cuando se guardó, que no es lo mismo que cuántas
   * entraron en `fotos`.
   *
   * <p>Si `putPhoto` falla —cuota llena, almacenamiento desalojado— esa foto se omite del registro
   * y el borrador se guarda con las que sí cupieron. Sin este número, al recuperar no hay forma de
   * saber que faltan: `fotos.length` ya es la lista corta, así que la resta da cero y la pantalla
   * calla. El aviso de almacenamiento degradado sí salta, pero es del momento y se borra con la
   * siguiente escritura buena — a la mañana siguiente la pérdida es invisible.</p>
   *
   * <p>Opcional a propósito: un borrador escrito por la versión anterior no lo trae, y ahí
   * `fotos.length` sigue siendo la mejor respuesta disponible.</p>
   */
  fotosIntentadas?: number;
}

/** Lo que el formulario entrega para guardar; las fotos llegan con sus bytes. */
export interface BorradorEnCurso extends Omit<BorradorBoleta, 'fotos' | 'guardadoEn'> {
  fotos: PreparedPhoto[];
}

/**
 * Las claves de foto del borrador ANTERIOR que el nuevo ya no menciona.
 *
 * <h2>Por qué esto existe, y por qué es una función aparte</h2>
 *
 * <p>Las claves son `draft:<inquilino>:<índice>:<capturedAt>`. El índice forma parte de la clave,
 * así que <b>basta con que la lista cambie de orden</b> para que las claves viejas dejen de
 * corresponder: si se borra la foto 0, la que era 1 pasa a 0 con otro `capturedAt` y su clave
 * anterior queda sin dueño. `guardarBorrador` pisaba el registro de `localStorage` sin tocar esos
 * bytes, y nadie volvía a nombrarlos nunca: con seis fotos y 10 MB de tope son hasta
 * <b>60 MB por borrador abandonado</b>, dentro de un almacenamiento que iPadOS desaloja cuando se
 * llena. La fuga terminaba disparando justo el aviso de almacenamiento degradado que la Fase 1A
 * acaba de enseñar a dar — es decir, la aplicación se acusaba a sí misma.</p>
 *
 * <p>Se resuelve por <b>diferencia contra el registro anterior</b> y no barriendo IndexedDB por
 * prefijo, que era lo propuesto. La diferencia es exacta y no necesita enumerar la base: un barrido
 * por prefijo tiene que decidir qué es basura mirando nombres, y en esa misma base viven las fotos
 * de la <i>cola</i> —boletas ya emitidas esperando señal—, que no son basura de nadie. Un barrido
 * mal acotado borra evidencia.</p>
 *
 * <p>Es pura y exportada para poder comprobarse sin navegador y sin IndexedDB, igual que
 * `capas.ts` en el mapa: la regla que no puede equivocarse se prueba sola.</p>
 */
export function clavesHuerfanas(anteriores: readonly string[], vigentes: readonly string[]): string[] {
  const conservadas = new Set(vigentes);
  return anteriores.filter((clave) => !conservadas.has(clave));
}

/** `true` cuando el borrador tiene algo que valga la pena guardar. */
export function tieneContenido(b: BorradorEnCurso): boolean {
  return Boolean(
    b.plate.trim() || b.typeId || b.zoneId || b.spaceCode.trim() ||
    b.addressText.trim() || b.notes.trim() || b.fotos.length,
  );
}

/**
 * Guarda el borrador. Devuelve `false` cuando el almacenamiento lo rechazó.
 *
 * <p>Devolver un booleano y no lanzar es deliberado: quien llama está en medio de escribir una
 * boleta y no puede detenerse por esto, pero sí tiene que poder DECIRLO. Tragárselo en silencio es
 * exactamente el defecto que este módulo viene a quitar.</p>
 */
export async function guardarBorrador(tenantId: string, b: BorradorEnCurso): Promise<boolean> {
  // Lo que el registro anterior nombraba, leído ANTES de pisarlo. Sin esta foto previa no hay forma
  // de saber qué bytes dejan de tener dueño cuando el registro se reemplaza.
  const anteriores = (leerBorradorSinCaducar(tenantId)?.fotos ?? []).map((f) => f.claveFoto);
  const fotos: FotoGuardada[] = [];
  let bytesOk = true;
  for (const [i, foto] of b.fotos.entries()) {
    const claveFoto = `draft:${tenantId}:${i}:${foto.capturedAt}`;
    try {
      await putPhoto(claveFoto, foto.blob);
    } catch {
      // Sin los bytes, el resto del borrador todavía vale: se guarda lo que se pueda y se avisa.
      bytesOk = false;
      continue;
    }
    fotos.push({
      claveFoto,
      fileName: foto.fileName,
      capturedAt: foto.capturedAt,
      latitude: foto.latitude,
      longitude: foto.longitude,
      scaledDown: foto.scaledDown,
      originalByteSize: foto.originalByteSize,
      tipoMime: foto.blob.type || 'image/jpeg',
    });
  }

  const guardado: BorradorBoleta = {
    plate: b.plate, typeId: b.typeId, zoneId: b.zoneId, spaceCode: b.spaceCode,
    addressText: b.addressText, notes: b.notes, position: b.position,
    fotos, guardadoEn: new Date().toISOString(),
    fotosIntentadas: b.fotos.length,
  };

  try {
    window.localStorage.setItem(clave(tenantId), JSON.stringify(guardado));
  } catch {
    marcarEscrituraFallida('borrador');
    return false;
  }

  /*
    Los bytes huérfanos se retiran DESPUÉS de que el registro nuevo quedó escrito, nunca antes: si
    la escritura falla, el registro viejo sigue siendo el vigente y sus fotos tienen que seguir
    estando. Borrar primero dejaría un borrador que se ofrece y ya no puede restaurar nada.

    No se espera el borrado: son bytes que ya nadie nombra, y el autoguardado corre cada 800 ms
    mientras alguien escribe una boleta. Un fallo acá no cambia lo que el fiscalizador ve.
  */
  const huerfanas = clavesHuerfanas(anteriores, fotos.map((f) => f.claveFoto));
  if (huerfanas.length > 0) void deletePhotos(huerfanas);

  if (!bytesOk) {
    marcarEscrituraFallida('fotos');
    return false;
  }
  marcarEscrituraCorrecta('borrador');
  return true;
}

/** El borrador vigente, o `null` si no hay, está roto o ya caducó. */
export function leerBorrador(tenantId: string | null): BorradorBoleta | null {
  if (!tenantId) return null;
  let crudo: string | null = null;
  try {
    crudo = window.localStorage.getItem(clave(tenantId));
  } catch {
    return null;
  }
  if (!crudo) return null;
  try {
    const b = JSON.parse(crudo) as BorradorBoleta;
    if (!b || typeof b.guardadoEn !== 'string') return null;
    const edadHoras = (Date.now() - new Date(b.guardadoEn).getTime()) / 3_600_000;
    if (!Number.isFinite(edadHoras) || edadHoras > HORAS_DE_VIDA) return null;
    return b;
  } catch {
    return null;
  }
}

/**
 * Cuántas fotografías faltan respecto de las que el fiscalizador tenía.
 *
 * <p>Una sola regla, acá y no en la pantalla, porque la resta tiene una trampa: hay que contar
 * contra lo que se INTENTÓ guardar, no contra lo que quedó guardado. Las dos pérdidas posibles son
 * distintas y el fiscalizador necesita verlas sumadas:</p>
 *
 * <ul>
 *   <li>las que nunca se guardaron (`putPhoto` falló al escribir el borrador);</li>
 *   <li>las que se guardaron y ya no están (almacenamiento desalojado entre sesiones).</li>
 * </ul>
 *
 * <p>Un borrador de la versión anterior no trae `fotosIntentadas`; ahí la cuenta es la de siempre y
 * no empeora nada.</p>
 */
export function fotosPerdidasDe(b: BorradorBoleta, restauradas: number): number {
  const tenia = b.fotosIntentadas ?? b.fotos.length;
  return Math.max(0, tenia - restauradas);
}

/**
 * Devuelve las fotos con sus bytes. Las que ya no están se OMITEN, y el número se puede comparar
 * con `b.fotos.length` para decir cuántas se perdieron en vez de fingir que están todas.
 */
export async function restaurarFotos(b: BorradorBoleta): Promise<PreparedPhoto[]> {
  const salida: PreparedPhoto[] = [];
  for (const foto of b.fotos) {
    const blob = await getPhoto(foto.claveFoto);
    if (!blob) continue;
    salida.push({
      blob, fileName: foto.fileName, capturedAt: foto.capturedAt,
      latitude: foto.latitude, longitude: foto.longitude,
      scaledDown: foto.scaledDown, originalByteSize: foto.originalByteSize,
    });
  }
  return salida;
}

/** Borra el borrador y sus bytes. Se llama cuando la boleta ya entró en la cola, o al descartarlo. */
export async function limpiarBorrador(tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  const b = leerBorradorSinCaducar(tenantId);
  try {
    window.localStorage.removeItem(clave(tenantId));
  } catch {
    /* Si no se puede borrar, el siguiente guardado lo pisa y la caducidad lo retira igual. */
  }
  if (!b) return;
  // Un borrado que el almacén rechazó no es un borrado. Se informa por el mismo camino que ya usa
  // el portal para la degradación de almacenamiento, en vez de inventar un aviso nuevo: si
  // IndexedDB se está negando, lo que el fiscalizador necesita saber es que el aparato no está
  // guardando bien — no el detalle de qué bytes quedaron.
  const { fallidas } = await deletePhotos(b.fotos.map((f) => f.claveFoto));
  if (fallidas > 0) marcarEscrituraFallida('fotos');
}

/**
 * Retira el borrador que ya no se puede ofrecer, con sus bytes.
 *
 * <p>El segundo camino de la fuga, y el más silencioso: pasadas las {@link HORAS_DE_VIDA} horas
 * `leerBorrador` devuelve `null` —correcto, no se ofrece— pero <b>no limpia</b>, y `limpiarBorrador`
 * sólo se llamaba al descartar, al retomar, al encolar y en `reset()`: nunca al entrar. Un
 * fiscalizador que llena media boleta, cierra el aparato y vuelve al día siguiente deja el registro
 * y hasta seis fotos ahí para siempre.</p>
 *
 * <p>La pantalla la llama al entrar. Es segura de llamar siempre: si el borrador está vigente no
 * hace nada, así que no puede borrar trabajo que todavía se iba a ofrecer.</p>
 */
export async function limpiarSiCaduco(tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  if (leerBorrador(tenantId)) return;            // vigente: no se toca nada

  const legible = leerBorradorSinCaducar(tenantId);
  if (legible) {
    // Caducado y legible: sabemos exactamente qué bytes eran suyos, así que se van con él.
    await limpiarBorrador(tenantId);
    return;
  }

  /*
    Registro presente pero ILEGIBLE —JSON a medio escribir, almacenamiento alterado—. Dos cosas
    distintas, y la corrección del 17-10-2026 está en separarlas:

    · el registro se retira, porque no se va a poder ofrecer nunca y ocupa la única ranura de
      borrador de esta municipalidad;
    · **sus bytes NO se tocan.** No se puede saber qué claves nombraba, y en esa misma base viven
      las fotos de la cola —boletas ya emitidas esperando señal—. Borrar por aproximación acá sería
      destruir evidencia para recuperar unos megabytes.

    El comentario anterior decía que este caso quedaba cubierto. No lo estaba: con el registro
    ilegible `leerBorradorSinCaducar` devuelve `null` y la condición no se cumplía nunca.
  */
  let hayRegistro = false;
  try {
    hayRegistro = window.localStorage.getItem(clave(tenantId)) !== null;
  } catch {
    return;
  }
  if (!hayRegistro) return;
  try {
    window.localStorage.removeItem(clave(tenantId));
  } catch {
    /* El siguiente guardado lo pisa. */
  }
}

/** Para limpiar: al borrar hay que llevarse también los bytes de un borrador ya caducado. */
function leerBorradorSinCaducar(tenantId: string): BorradorBoleta | null {
  try {
    const crudo = window.localStorage.getItem(clave(tenantId));
    return crudo ? (JSON.parse(crudo) as BorradorBoleta) : null;
  } catch {
    return null;
  }
}
