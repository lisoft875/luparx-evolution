import { MAX_EVIDENCE_BYTES } from './citationQueue';

/**
 * Evidence is prepared, never improved.
 *
 * The photograph the officer took is what a defence gets to argue about months later, so nothing
 * here crops it, rotates it, adjusts it or re-encodes it "for quality". The **only** transformation
 * this module will perform is a proportional scale-down, and only when the file is larger than the
 * deployment will accept — because the alternative is a citation with no photograph at all, which
 * is worse evidence than a smaller one.
 *
 * When that happens it is reported: {@link PreparedPhoto.scaledDown} is true, the original size is
 * kept, and the screen states it in the interface (CONTRACT.md v0.7 §Evidencia, and the rule that
 * altered evidence must say so). A silent resize would be the dishonest version of this function.
 */
export interface PreparedPhoto {
  blob: Blob;
  fileName: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  /** True when the bytes below are not the bytes the camera produced. */
  scaledDown: boolean;
  originalByteSize: number;
}

/** Types the server accepts, decided by reading the file's own header — this is only a first sieve. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export function isAcceptedImageType(type: string): boolean {
  return ACCEPTED_TYPES.includes(type.toLowerCase());
}

export async function preparePhoto(
  blob: Blob,
  fileName: string,
  meta: { capturedAt: string; latitude?: number; longitude?: number },
): Promise<PreparedPhoto> {
  const original = blob.size;
  if (blob.size <= MAX_EVIDENCE_BYTES) {
    return { blob, fileName, ...meta, scaledDown: false, originalByteSize: original };
  }
  const scaled = await scaleToFit(blob, MAX_EVIDENCE_BYTES);
  return {
    blob: scaled ?? blob,
    fileName,
    ...meta,
    scaledDown: scaled !== null,
    originalByteSize: original,
  };
}

/**
 * Halves the linear dimensions until the encoded file fits, at JPEG quality 0.92.
 *
 * Proportional and repeated rather than a single computed target, because the relationship between
 * pixel count and encoded size depends on the picture. Returns `null` when the browser cannot do it
 * (no canvas, a HEIC the decoder refuses); the caller then keeps the original and the server is the
 * one that refuses it, with a message that says why.
 */
async function scaleToFit(blob: Blob, limitBytes: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap =
      typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await decodeWithImageElement(blob);
  } catch {
    return null;
  }
  let width = 'width' in bitmap ? bitmap.width : 0;
  let height = 'height' in bitmap ? bitmap.height : 0;
  if (!width || !height) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    width = Math.max(1, Math.round(width * 0.7));
    height = Math.max(1, Math.round(height * 0.7));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92),
    );
    if (encoded && encoded.size <= limitBytes) return encoded;
  }
  return null;
}

function decodeWithImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be decoded'));
    };
    image.src = url;
  });
}
