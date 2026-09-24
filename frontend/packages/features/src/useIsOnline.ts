import { useCallback, useSyncExternalStore } from 'react';

/**
 * Si el navegador cree que hay conexión.
 *
 * <h2>Por qué está acá y no en cada portal</h2>
 *
 * <p>Vivía en `apps/inspector/src/lib/queries.ts` porque el fiscalizador fue el primero que la
 * necesitó: trabaja en la calle y su aplicación guarda boletas cuando no hay señal. El menú «Más»
 * del ciudadano pide el mismo dato, y las dos especificaciones del 24-09-2026 dicen lo mismo con
 * las mismas palabras: «reutilizar la lógica actual de conectividad si existe», «no crear
 * duplicados». Copiarla habría sido dos implementaciones del mismo hecho que se desincronizan en
 * cuanto una se corrija.</p>
 *
 * <h2>Por qué `useSyncExternalStore` y no un `useState` con listeners</h2>
 *
 * <p>Porque `navigator.onLine` es estado que vive fuera de React y cambia sin avisarle. Con
 * `useState` hay una ventana entre el primer render y el `useEffect` que suscribe, y en esa ventana
 * el componente muestra un valor que puede ya no ser cierto. `useSyncExternalStore` existe
 * exactamente para esto y además da el valor del servidor por separado.</p>
 *
 * <h2>Lo que este valor NO dice</h2>
 *
 * <p>`navigator.onLine` dice que hay una interfaz de red levantada, no que el servidor conteste. Un
 * teléfono conectado a un wifi sin salida responde `true`. Sirve para explicar por qué algo quedó
 * en cola —que es para lo que se usa— y no para prometer que la próxima petición va a funcionar.</p>
 */
export function useIsOnline(): boolean {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    // En el servidor se asume conexión: decir «sin conexión» durante el primer pintado y
    // corregirlo un instante después es un parpadeo que asusta sin motivo.
    () => true,
  );
}
