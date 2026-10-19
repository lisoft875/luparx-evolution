/**
 * Where a queued photograph's bytes wait for signal.
 *
 * IndexedDB and not `localStorage`, for one reason that decides it: a phone photograph is one to
 * five megabytes and `localStorage` holds about five in total, as base64 — so a second citation
 * captured out of coverage would throw `QuotaExceededError` and lose evidence the officer believes
 * they took. IndexedDB stores the `Blob` itself, with no base64 inflation and no small ceiling.
 *
 * The queue's *metadata* stays in `localStorage` (see ./citationQueue): it is small, it must be
 * readable synchronously on the first render so the pending count is never wrong for a frame, and
 * keeping the two apart means a browser that refuses IndexedDB still shows the officer what they
 * have pending instead of showing nothing.
 */

const DB_NAME = 'luparx-inspector-evidence';
const DB_VERSION = 1;
const STORE = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  }).catch((error) => {
    // A failed open must not poison every later call: a private window that refuses storage once
    // may allow it after a reload, and retrying is cheaper than a permanently broken queue.
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export async function putPhoto(key: string, blob: Blob): Promise<void> {
  await run('readwrite', (store) => store.put(blob, key));
}

/** `null` when the bytes are gone — cleared storage, another browser, a private window. */
export async function getPhoto(key: string): Promise<Blob | null> {
  try {
    const value = await run<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>);
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

/**
 * `true` cuando los bytes ya no están: borrados ahora, o ausentes desde antes —IndexedDB considera
 * un éxito borrar una clave que no existe, y lo es—. `false` SÓLO cuando el almacén se negó.
 *
 * <p>Devolver el resultado es la corrección del 17-10-2026. Antes se tragaba la excepción y
 * devolvía `void`: quien llamaba no podía distinguir «se borró» de «el almacén está caído», y una
 * limpieza que falla entera se informaba como completada. Eso contradice justo lo que este portal
 * aprendió en la Fase 1A — una escritura que falla en silencio es peor que uno ruidosa—, y acá
 * además esconde bytes que siguen ocupando un almacenamiento que iPadOS desaloja cuando se llena.</p>
 */
export async function deletePhoto(key: string): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.delete(key));
    return true;
  } catch {
    return false;
  }
}

/** Cuántas se fueron y cuántas no. Quien llama decide si eso merece avisar. */
export async function deletePhotos(keys: readonly string[]): Promise<{ borradas: number; fallidas: number }> {
  const resultados = await Promise.all(keys.map((key) => deletePhoto(key)));
  const borradas = resultados.filter(Boolean).length;
  return { borradas, fallidas: resultados.length - borradas };
}
