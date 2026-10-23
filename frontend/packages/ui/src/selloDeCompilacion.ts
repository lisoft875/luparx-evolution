/**
 * El sello de compilación: qué dice, y —sobre todo— cuándo NO se dice.
 *
 * <p>La lógica vive acá, aparte del componente, para poder comprobarla sin navegador. Lo que
 * protege es una sola cosa y es la que importa: <b>que el sello no aparezca en producción</b>.</p>
 */

/**
 * Los entornos donde el sello se dibuja.
 *
 * <p>Es una lista de permitidos y no una lista de prohibidos, y la diferencia es justamente lo que
 * hace que esto no se pueda colar a producción por olvido. Con una lista de prohibidos
 * —«todo menos production»— cualquier valor nuevo o mal escrito —`prod`, `PRODUCCION`, vacío,
 * la variable sin declarar— caería del lado de mostrar. Con una lista de permitidos, lo que no se
 * reconoce no se dibuja: el error se paga con un sello que falta en staging, que se nota y se
 * arregla, y no con un sello de más delante de un ciudadano.</p>
 *
 * <p>Son los mismos nombres que acepta `scripts/staging-zonas-demo.sh` para dejarse correr, para
 * que no haya dos ideas distintas de «esto no es producción» en el mismo repositorio.</p>
 */
export const ENTORNOS_CON_SELLO: readonly string[] = ['staging', 'demo', 'dev', 'local', 'test'];

/** Si en este entorno se dibuja el sello. Sin entorno declarado, no. */
export function seMuestraElSello(entorno: string | null | undefined): boolean {
  if (typeof entorno !== 'string') return false;
  return ENTORNOS_CON_SELLO.includes(entorno.trim().toLowerCase());
}

/**
 * El consecutivo que se lee en pantalla, a partir del instante del build.
 *
 * <p>`AAAAMMDD-hhmm`, en hora local de quien mira. Ordena solo —un número mayor es un build más
 * nuevo—, cabe en una línea y se compara de un vistazo con el reloj de uno, que es exactamente lo
 * que hace falta para saber si el despliegue de hace cinco minutos salió.</p>
 *
 * <p>En hora local y no UTC a propósito: el sello se mira junto al reloj del teléfono o de la
 * computadora, y una hora que no coincide con ese reloj obliga a hacer una resta mental justo en
 * el momento en que uno quiere una respuesta de un segundo.</p>
 *
 * <p>Una fecha que no se puede leer devuelve `null`, y entonces no hay sello: un consecutivo
 * inventado es peor que ninguno, porque se compara con otro y se saca una conclusión falsa.</p>
 */
export function consecutivoDeCompilacion(instanteISO: string | null | undefined): string | null {
  if (typeof instanteISO !== 'string' || instanteISO.trim() === '') return null;
  const fecha = new Date(instanteISO);
  if (Number.isNaN(fecha.getTime())) return null;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}`
    + `-${dos(fecha.getHours())}${dos(fecha.getMinutes())}`;
}

export interface SelloLegible {
  /** El consecutivo, `AAAAMMDD-hhmm`. */
  consecutivo: string;
  /** El hash corto del commit, o `null` si esta compilación no lo supo. */
  commit: string | null;
  /** El entorno, tal cual lo declaró el despliegue. */
  entorno: string;
  /** La fecha y hora completas, para el `title`: el consecutivo es compacto, no legible. */
  completa: string;
}

/**
 * Lo que el componente va a dibujar, o `null` si no hay que dibujar nada.
 *
 * <p>Devuelve `null` en producción, sin entorno declarado, y cuando el instante del build no se
 * puede leer. El commit sí puede faltar sin que el sello desaparezca: la hora sola ya contesta «el
 * despliegue corrió», que es la mitad del trabajo.</p>
 */
export function selloLegible(
  entorno: string | null | undefined,
  instanteISO: string | null | undefined,
  commit: string | null | undefined,
  idioma?: string,
): SelloLegible | null {
  if (!seMuestraElSello(entorno)) return null;
  const consecutivo = consecutivoDeCompilacion(instanteISO);
  if (consecutivo === null) return null;
  let completa = String(instanteISO);
  try {
    completa = new Date(String(instanteISO)).toLocaleString(idioma || undefined);
  } catch {
    /* un idioma que el navegador no conoce no se lleva el sello por delante */
  }
  return {
    consecutivo,
    commit: typeof commit === 'string' && commit.trim() !== '' ? commit.trim() : null,
    entorno: String(entorno).trim().toLowerCase(),
    completa,
  };
}
