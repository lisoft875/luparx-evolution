/**
 * Preparar una imagen de evidencia de reclamo ANTES de subirla (24-10-2026).
 *
 * El servidor acepta hasta 1 MB por imagen de reclamo (DEFAULT_MAX_APPEAL_BYTES). Una foto de
 * teléfono pesa varios MB, así que sin reducirla el servidor la rechazaría (EVIDENCE_TOO_LARGE) y
 * la persona no entendería por qué. Esto la reduce lo justo para que entre —y sólo cuando hace
 * falta—, reencodeando a JPEG, lo que además descarta los metadatos EXIF (ubicación, modelo del
 * teléfono): un reclamo no tiene por qué cargar con eso. Es la misma lógica que el Inspector usa
 * para la evidencia de una boleta, acotada al tope del reclamo. No recorta ni mejora: sólo escala.
 */
export const MAX_RECLAMO_BYTES = 1024 * 1024; // 1 MB, el tope del backend.
export const MAX_IMAGENES_RECLAMO = 3;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function esImagenAceptada(type: string | undefined | null): boolean {
  return TIPOS_ACEPTADOS.includes((type ?? '').toLowerCase());
}

export function necesitaReducir(bytes: number): boolean {
  return bytes > MAX_RECLAMO_BYTES;
}

export interface ImagenPreparada {
  blob: Blob;
  nombre: string;
  bytes: number;
  /** true cuando los bytes no son los que salió de la cámara. */
  reducida: boolean;
}

export type ResultadoImagen = ImagenPreparada | { error: 'tipo' | 'fallo' };

function renombrarComoJpg(nombre: string): string {
  const base = nombre.replace(/\.[^.]+$/, '') || 'reclamo';
  return `${base}.jpg`;
}

export async function prepararImagenReclamo(file: File): Promise<ResultadoImagen> {
  if (!esImagenAceptada(file.type)) return { error: 'tipo' };
  if (file.size <= MAX_RECLAMO_BYTES) {
    return { blob: file, nombre: file.name, bytes: file.size, reducida: false };
  }
  const reducido = await escalarParaEntrar(file, MAX_RECLAMO_BYTES);
  if (!reducido) return { error: 'fallo' };
  return { blob: reducido, nombre: renombrarComoJpg(file.name), bytes: reducido.size, reducida: true };
}

/**
 * Baja las dimensiones un 30% por intento hasta que el JPEG entra. Proporcional y repetido y no un
 * objetivo calculado, porque la relación entre píxeles y bytes depende de la foto. `null` si el
 * navegador no puede (sin canvas, un HEIC que el decodificador rechaza): quien llama se queda con
 * el original y el servidor es el que lo rechaza, con un mensaje que dice por qué.
 */
async function escalarParaEntrar(blob: Blob, limite: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap =
      typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await decodificarConImagen(blob);
  } catch {
    return null;
  }
  let width = 'width' in bitmap ? bitmap.width : 0;
  let height = 'height' in bitmap ? bitmap.height : 0;
  if (!width || !height) return null;

  for (let intento = 0; intento < 6; intento += 1) {
    width = Math.max(1, Math.round(width * 0.7));
    height = Math.max(1, Math.round(height * 0.7));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85),
    );
    if (encoded && encoded.size <= limite) return encoded;
  }
  return null;
}

function decodificarConImagen(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('no se pudo decodificar la imagen'));
    };
    image.src = url;
  });
}
