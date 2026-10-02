/**
 * Qué campo impide continuar — §2 del informe de alta de usuarios (25-09-2026).
 *
 * <h2>El problema que resuelve</h2>
 *
 * <p>Un formulario largo validado al enviar deja a la persona delante de un botón que, desde su
 * silla, no hizo nada. La medición del arnés el 02-10-2026 lo dejó por escrito: diez campos
 * quedaron marcados, cuatro estaban a la vista y la página no se movió. Los otros seis estaban
 * marcados en una parte del documento que nadie estaba mirando.</p>
 *
 * <p>Marcar no es señalar. Esto último es lo que falta: llevar la vista al primer campo que
 * bloquea, ponerle el foco encima para que un lector de pantalla lo anuncie, y devolver su
 * etiqueta para que la pantalla pueda decir su nombre en una frase.</p>
 *
 * <h2>Por qué lee el DOM y no {@code formState.errors}</h2>
 *
 * <p>Porque el orden que importa es el visual, no el del objeto. Los errores de react-hook-form
 * llegan en el orden en que el resolver los produjo, que para un esquema anidado no es el orden en
 * que la persona ve los campos; y los identificadores de los controles los genera {@code useId}
 * dentro de {@code FormField}, así que desde el nombre del campo no hay forma de llegar al nodo.
 * El documento sí tiene las dos cosas: {@code .lx-field__error} aparece en orden de documento y
 * cuelga del {@code .lx-field} que contiene su etiqueta y su control.</p>
 */

export interface PrimerCampoConError {
  /** La etiqueta del campo, sin el «(Opcional)» que algunas llevan. */
  readonly label: string;
  /** Cuántos campos quedaron marcados en total. */
  readonly count: number;
}

/** Espera a que React haya pintado los mensajes de error antes de buscarlos. */
function trasPintar(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    // Dos cuadros: el primero sale antes de que React confirme el renderizado que acaba de
    // programar, el segundo ya lo encuentra en el documento.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Lleva la vista y el foco al primer campo marcado como inválido, y dice cuál es.
 *
 * <p>Devuelve {@code null} si no hay ninguno, que es lo que ocurre cuando el envío falló por algo
 * que no es un campo. El desplazamiento usa {@code block: 'center'} a propósito: con una barra
 * superior fija, {@code 'start'} deja el campo justo debajo de ella, o sea tapado.</p>
 *
 * @param root dónde buscar; por omisión, el documento entero.
 */
export async function focusFirstFieldError(root?: ParentNode | null): Promise<PrimerCampoConError | null> {
  if (typeof document === 'undefined') return null;
  await trasPintar();

  const ambito: ParentNode = root ?? document;
  const errores = Array.from(ambito.querySelectorAll<HTMLElement>('.lx-field__error'));
  const primero = errores[0];
  if (!primero) return null;

  const campo = primero.closest<HTMLElement>('.lx-field');
  const etiqueta = campo?.querySelector<HTMLElement>('.lx-field__label');
  const control = campo?.querySelector<HTMLElement>(
    'input, textarea, select, [role="combobox"], [contenteditable="true"]',
  );

  (campo ?? primero).scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Sin `preventScroll` el navegador vuelve a desplazar, y el salto se ve.
  control?.focus({ preventScroll: true });

  // El primer nodo hijo es el texto de la etiqueta; el `<span>` del «(Opcional)» viene después y
  // no forma parte del nombre del campo.
  const texto = (etiqueta?.firstChild?.textContent ?? etiqueta?.textContent ?? '').trim();
  return { label: texto, count: errores.length };
}
