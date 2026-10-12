import { ApiError, NetworkError, type ApiClient } from '@luparx/api-client';

/**
 * ¿Llega este aparato al servidor de LuParX, de verdad?
 *
 * <h2>Por qué no alcanza con `useIsOnline`</h2>
 *
 * <p>`navigator.onLine` contesta otra pregunta: «¿hay una interfaz de red levantada?». Dice que sí
 * con el wifi de un café que todavía no dejó pasar a nadie, con un portal cautivo esperando que
 * alguien acepte sus condiciones, con datos móviles sin cobertura real y con el servidor caído. Las
 * cuatro se ven igual desde la pantalla y las cuatro dejan al fiscalizador esperando un envío que
 * no va a salir. El §2 del encargo del Centro de soporte lo pide en letra: «diferenciar internet
 * aparente de comunicación efectiva con un endpoint autorizado de LuParX».</p>
 *
 * <h2>Contra qué se mide</h2>
 *
 * <p>Contra `GET /inspector/zones`, que YA EXISTE y que esta aplicación ya llama para el selector de
 * zona. No se agrega un `/ping`: un endpoint nuevo es superficie nueva —una ruta más que mantener,
 * documentar y asegurar— para una pregunta que un endpoint real contesta mejor, porque además
 * atraviesa todo lo que un envío de verdad atraviesa: nginx, el backend, la autenticación y la
 * base. Un `/ping` que devuelve «ok» sin tocar nada de eso puede estar verde con el servicio roto.</p>
 *
 * <h2>Un 401 también es llegar</h2>
 *
 * <p>Si el servidor contesta «no autorizado», la comunicación funcionó: lo que falla es la sesión, y
 * de eso ya se ocupa su propia fila del diagnóstico. Tratarlo como «sin conexión» mandaría a la
 * persona a buscar señal cuando lo que tiene que hacer es volver a entrar.</p>
 */
export type ServerReach =
  /** Contestó. `ms` es lo que tardó. */
  | { state: 'ok'; ms: number }
  /** Contestó, pero tan lento que un envío va a parecer colgado. */
  | { state: 'slow'; ms: number }
  /** Contestó que no estamos autorizados: la red llega, la sesión no sirve. */
  | { state: 'unauthorized'; ms: number }
  /** Hay red según el sistema, pero el servidor no contesta. */
  | { state: 'unreachable' }
  /** Se venció el tiempo de espera. */
  | { state: 'timeout' }
  /** El sistema dice que no hay red; ni se intentó. */
  | { state: 'offline' };

/** Por encima de esto el envío se siente colgado aunque termine funcionando. Medido, no adivinado: */
const LENTO_MS = 2_500;

export async function probeServer(apiClient: ApiClient, timeoutMs = 6_000): Promise<ServerReach> {
  // Sin red declarada no se intenta: la llamada tardaría el timeout entero para decir lo que el
  // sistema ya sabía, y el diagnóstico se abre de pie y con prisa.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline' };

  const desde = Date.now();
  let vencido = false;
  const reloj = new Promise<'timeout'>((resolve) => {
    setTimeout(() => {
      vencido = true;
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    const carrera = await Promise.race([apiClient.inspectorEnforcement.zones().then(() => 'ok' as const), reloj]);
    if (carrera === 'timeout') return { state: 'timeout' };
    const ms = Date.now() - desde;
    return ms > LENTO_MS ? { state: 'slow', ms } : { state: 'ok', ms };
  } catch (fallo) {
    // El reloj pudo haber ganado mientras la petición terminaba de fallar; gana lo que se decidió
    // primero, para no reportar dos causas de un mismo intento.
    if (vencido) return { state: 'timeout' };
    const ms = Date.now() - desde;
    if (fallo instanceof ApiError) {
      if (fallo.status === 401 || fallo.status === 403) return { state: 'unauthorized', ms };
      // Cualquier otra respuesta del servidor —incluido un 500— demuestra que se llegó. Que el
      // servidor tenga un problema es otra cosa, y mentirle a la persona diciéndole «sin conexión»
      // la manda a buscar señal donde no está el problema.
      return ms > LENTO_MS ? { state: 'slow', ms } : { state: 'ok', ms };
    }
    if (fallo instanceof NetworkError) return { state: 'unreachable' };
    return { state: 'unreachable' };
  }
}
