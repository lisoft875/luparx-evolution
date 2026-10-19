/**
 * El almacenamiento del aparato, y la honestidad de decir cuándo falló.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>Hasta hoy, cuando `localStorage` rechazaba una escritura —ventana privada, cuota llena— el
 * código lo atrapaba y seguía. La copia en memoria mantenía la sesión en pie, así que la pantalla
 * seguía diciendo que la boleta estaba guardada. No lo estaba: a la siguiente recarga no existía.
 * Safari en iPadOS desaloja almacenamiento de sitios que considera inactivos, de modo que esto no
 * es un caso de laboratorio sino el final de una jornada larga.</p>
 *
 * <p>Un fallo de disco que se traga en silencio es peor que uno ruidoso, porque el fiscalizador
 * sigue trabajando encima de algo que ya se perdió. Este módulo no evita el fallo —no puede—: lo
 * hace visible. Quien escribe reporta si pudo; la interfaz pregunta y lo dice en voz alta.</p>
 */

/** Dónde ocurrió el fallo, para que el aviso pueda ser específico. */
export type OrigenEscritura = 'cola' | 'borrador' | 'fotos';

let degradado: OrigenEscritura | null = null;
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

/**
 * Lo llama quien intentó escribir y no pudo.
 *
 * <p>Se queda con el PRIMER origen y no lo pisa: el primero es el que explica la causa, y los
 * siguientes son casi siempre el mismo disco lleno contado otra vez.</p>
 */
export function marcarEscrituraFallida(origen: OrigenEscritura): void {
  if (degradado) return;
  degradado = origen;
  avisar();
}

/** Lo llama quien escribió bien, para que un aviso viejo no se quede pegado. */
export function marcarEscrituraCorrecta(origen: OrigenEscritura): void {
  if (degradado !== origen) return;
  degradado = null;
  avisar();
}

/** `null` cuando todo escribe bien; si no, dónde falló la última vez. */
export function escrituraDegradada(): OrigenEscritura | null {
  return degradado;
}

/** Para `useSyncExternalStore`. Devuelve la función de baja. */
export function suscribirAlmacenamiento(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Pide al navegador que no desaloje lo guardado.
 *
 * <p>Es una petición, no una orden: el navegador decide, y en Safari depende de que el sitio esté
 * instalado o tenga uso suficiente. Se pide UNA vez por carga; pedirlo en cada escritura no cambia
 * la respuesta y sí gasta. Si la API no existe, no pasa nada: el resto del módulo sigue sirviendo.</p>
 */
let persistenciaPedida = false;
export async function pedirPersistenciaUnaVez(): Promise<boolean | null> {
  if (persistenciaPedida) return null;
  persistenciaPedida = true;
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/**
 * Cuánto queda, cuando el navegador lo sabe.
 *
 * <p>`null` no es cero: significa que el navegador no lo dice, que es el caso de Safari en varias
 * versiones. La pantalla tiene que distinguir «no queda espacio» de «no sé cuánto queda», porque
 * la primera es una alarma y la segunda no.</p>
 */
export async function estimarAlmacenamiento(): Promise<{ usadoBytes: number; cuotaBytes: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) return null;
    return { usadoBytes: usage, cuotaBytes: quota };
  } catch {
    return null;
  }
}
