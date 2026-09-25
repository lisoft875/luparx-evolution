import { useCallback, useSyncExternalStore } from 'react';

/**
 * Si una media query se cumple ahora mismo.
 *
 * <h2>Para qué hace falta esto si existe el CSS</h2>
 *
 * <p>Para lo que el CSS no puede hacer: dejar de RENDERIZAR algo. Ocultar una columna con
 * `display: none` la deja en el DOM y en el árbol de accesibilidad de la tabla, así que un lector
 * de pantalla sigue anunciando una cabecera que nadie ve y la tabla sigue declarando seis columnas
 * cuando muestra cinco. Cuando lo que cambia es la ESTRUCTURA y no el aspecto, la decisión tiene
 * que tomarla quien construye la estructura.</p>
 *
 * <h2>Por qué `useSyncExternalStore`</h2>
 *
 * <p>Por lo mismo que {@link useIsOnline}: el tamaño de la ventana es estado que vive fuera de
 * React y cambia sin avisarle. Con `useState` hay una ventana entre el primer render y el
 * `useEffect` que suscribe, y en esa ventana el componente dibuja una estructura que puede ya no
 * corresponder. Acá eso sería la tabla ancha apareciendo un instante en un teléfono.</p>
 *
 * <p>En el servidor devuelve `false`: la consulta no se puede evaluar sin ventana, y asumir «no se
 * cumple» deja el diseño de escritorio, que es el que tiene todas las columnas. Perder una columna
 * y recuperarla se nota menos que ganarla de golpe.</p>
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const lista = window.matchMedia(query);
      lista.addEventListener('change', listener);
      return () => lista.removeEventListener('change', listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
