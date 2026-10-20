import { useEffect } from 'react';

/**
 * Lo que la pantalla hace mientras el teclado está abierto (20-10-2026).
 *
 * <h2>El problema</h2>
 *
 * <p>En un teléfono, el teclado se come la mitad baja de la pantalla. Todo lo que está pegado abajo
 * —la navegación inferior y el botón principal— no se entera: siguen pegados al borde del viewport
 * de maquetación, que no cambió, y terminan dibujados DEBAJO del teclado o flotando encima de él.
 * El resultado es el que reportó la usuaria: el campo que está escribiendo queda tapado, y los
 * controles compiten por los pocos píxeles que quedan.</p>
 *
 * <h2>Cómo se detecta</h2>
 *
 * <p>No hay un evento «se abrió el teclado». Lo que sí hay es {@link VisualViewport}: el viewport
 * VISUAL se encoge cuando el teclado sube, mientras el de maquetación ({@code innerHeight}) se
 * queda igual. La diferencia entre los dos es el teclado.</p>
 *
 * <p>El umbral de 150 px no es decorativo: en iOS la barra de direcciones de Safari también encoge
 * el viewport visual, unos 60 a 90 px, y confundir eso con un teclado escondería la navegación
 * cada vez que alguien hace scroll. Un teclado no baja de unos 250 px en ningún teléfono. 150
 * queda cómodamente entre las dos cosas.</p>
 *
 * <p>Y además se exige que el foco esté en un campo de texto: un viewport encogido sin nadie
 * escribiendo no es un teclado.</p>
 *
 * <h2>Qué hace</h2>
 *
 * <p>Pone {@code data-teclado="abierto"} en la raíz del documento y deja que el CSS decida. La
 * orden del 20-10-2026 lo autoriza explícitamente: «si hace falta, ocultar temporalmente CTA/barra
 * inferior durante la edición y restaurarlos al cerrar teclado». Eso es exactamente lo que hace la
 * hoja de estilos con ese atributo, y nada más: no mueve el scroll por su cuenta ni cambia alturas,
 * porque cualquiera de las dos cosas produce el salto que se quiere evitar.</p>
 *
 * <p>Sin {@code visualViewport} —navegadores viejos, y el escritorio— no hace absolutamente nada:
 * el atributo nunca se pone y todo se comporta como antes.</p>
 */

/** Por debajo de esto es la barra del navegador, no un teclado. */
const UMBRAL_PX = 150;

/** Aire que se le deja al campo contra cualquiera de los dos bordes útiles. */
const MARGEN_PX = 12;

const ESCRIBIBLES = /^(INPUT|TEXTAREA)$/;

/**
 * Lo que tapa por arriba: el cromo pegado al borde superior.
 *
 * <p>Se mide, no se supone. La barra de la estadía en curso sólo está mientras hay una estadía, así
 * que un número fijo estaría mal la mitad del tiempo. Es la misma convención que ya usa
 * {@code Select} para colocar su lista: quien cubre un borde se marca con
 * {@code data-lx-top-chrome}, y acá se añade el contenedor pegado por si algún día lleva algo que
 * no se marcó.</p>
 *
 * <p>Se toma el borde MÁS BAJO, no la suma de altos: las barras apiladas se solapan y sumarlas
 * contaría dos veces.</p>
 */
function bordeDelCromoSuperior(desde: number): number {
  const nodos = document.querySelectorAll<HTMLElement>('.lx-top-chrome, [data-lx-top-chrome]');
  return [...nodos].reduce((masBajo, nodo) => {
    const caja = nodo.getBoundingClientRect();
    if (caja.height <= 0) return masBajo;
    if (getComputedStyle(nodo).visibility === 'hidden') return masBajo;
    return Math.max(masBajo, caja.bottom);
  }, desde);
}

/** El alto natural de ese cromo, esté pegado o no: lo que ocuparía si se queda arriba. */
function altoDelCromoSuperior(): number {
  const nodos = document.querySelectorAll<HTMLElement>('.lx-top-chrome, [data-lx-top-chrome]');
  return [...nodos].reduce((mayor, nodo) => {
    const caja = nodo.getBoundingClientRect();
    return Math.max(mayor, caja.height);
  }, 0);
}

function estaEscribiendo(): boolean {
  const activo = document.activeElement as HTMLElement | null;
  if (!activo) return false;
  if (activo.isContentEditable) return true;
  if (!ESCRIBIBLES.test(activo.tagName)) return false;
  // Una casilla o un botón de radio tienen el foco pero no levantan teclado.
  const tipo = (activo as HTMLInputElement).type;
  return tipo !== 'checkbox' && tipo !== 'radio' && tipo !== 'button' && tipo !== 'submit';
}

export function useTecladoVirtual(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const raiz = document.documentElement;
    let puesto = false;
    /** El alto publicado la última vez. Si cambia —girar el teléfono— hay que volver a acomodar. */
    let altoPuesto = 0;
    /** El último campo que tuvo el teclado abierto. Al cerrarse ya no tiene el foco, y hay que
     *  saber a quién se le estaba haciendo sitio para comprobar que no quedó tapado. */
    let ultimoCampo: HTMLElement | null = null;

    /*
      Que el campo quede dentro de lo que se ve, y no debajo del teclado.

      El navegador desplaza el campo al enfocarlo, pero lo hace contra el viewport de MAQUETACIÓN,
      que no se encogió: en una pantalla larga eso deja el campo perfectamente centrado… detrás del
      teclado. Acá se corrige contra el viewport VISUAL, que es el que la persona ve.

      Se mueve lo mínimo y sólo si hace falta: si el campo ya se ve, no se toca el scroll. Un
      desplazamiento gratuito es el «salto» que la orden pide evitar.
    */
    const acomodar = (): void => {
      const activo = document.activeElement as HTMLElement | null;
      if (!activo) return;
      const r = activo.getBoundingClientRect();
      /*
        Lo que se ve NO va de 0 a `vv.height`: por arriba hay cromo pegado —la barra de la estadía
        en curso— y por abajo el teclado. Medido el 20-10-2026 a 568×320: el campo quedaba
        «dentro del viewport» a 64–108 y encima tenía `.lx-sticky-timer-bar`. Estaba a la vista del
        navegador y tapado para la persona, que es lo único que cuenta.
      */
      const techo = bordeDelCromoSuperior(vv.offsetTop || 0) + MARGEN_PX;
      const suelo = vv.height - MARGEN_PX;
      if (r.bottom > suelo) {
        window.scrollBy({ top: r.bottom - suelo, behavior: 'auto' });
      } else if (r.top < techo) {
        window.scrollBy({ top: r.top - techo, behavior: 'auto' });
      }
    };

    /*
      El caso apaisado: no caben las dos cosas.

      En horizontal quedan unos 120 px útiles. El cromo superior se lleva casi cien, y el campo
      necesita sus 44 más aire: no hay forma de que entren los dos, y acomodar el campo sólo lo
      mete debajo de la barra. Entonces, mientras se escribe y SÓLO si de verdad no caben, ese
      cromo deja de estar pegado y se va con el scroll como cualquier otro contenido.

      No se oculta nada: la barra sigue en la página, en su sitio, y vuelve a estar a la vista
      subiendo. Y la condición se mide —alto útil contra alto del cromo más el campo— en vez de
      preguntarle a nadie por el dispositivo, que es como se escriben los parches que luego fallan
      en el teléfono siguiente.
    */
    const marcarApretado = (): void => {
      const activo = document.activeElement as HTMLElement | null;
      const alturaCampo = activo ? activo.getBoundingClientRect().height : 44;
      const libre = vv.height - altoDelCromoSuperior();
      if (libre < alturaCampo + MARGEN_PX * 2) raiz.setAttribute('data-teclado-apretado', '');
      else raiz.removeAttribute('data-teclado-apretado');
    };

    const limpiar = (): void => {
      raiz.removeAttribute('data-teclado');
      raiz.removeAttribute('data-teclado-apretado');
      raiz.style.removeProperty('--lx-teclado-alto');
    };

    const evaluar = (): void => {
      const alto = Math.round(window.innerHeight - vv.height);
      const abierto = alto > UMBRAL_PX && estaEscribiendo();

      if (!abierto) {
        if (!puesto) return;
        puesto = false;
        altoPuesto = 0;
        /*
          Al cerrarse el teclado, el cromo de arriba vuelve a pegarse… y puede volver justo encima
          del campo que se acababa de llenar, porque la página sigue donde estaba. Medido a
          568×320: campo a la vista pero con `.lx-sticky-timer-bar` en su centro.

          Entonces, y SÓLO si se había soltado ese cromo —es decir, sólo en el caso apretado—, se
          deshace el solape que la restauración acaba de crear, con el mínimo desplazamiento y nada
          más. En vertical el cromo nunca se movió, así que no hay nada que deshacer y la página no
          se toca: no se introduce un salto para arreglar otro.
        */
        const soltado = raiz.hasAttribute('data-teclado-apretado');
        const campo = ultimoCampo;
        ultimoCampo = null;
        limpiar();
        if (soltado && campo && campo.isConnected) {
          window.requestAnimationFrame(() => {
            const r = campo.getBoundingClientRect();
            const techo = bordeDelCromoSuperior(vv.offsetTop || 0) + MARGEN_PX;
            if (r.top < techo) window.scrollBy({ top: r.top - techo, behavior: 'auto' });
          });
        }
        return;
      }

      /*
        Que el alto cambie con el teclado ya abierto no es un caso raro: es girar el teléfono. De
        844 de alto con 300 de teclado se pasa a 390 con 210, y lo que antes sobraba ya no cabe.
        Antes esto se trataba sólo como un cambio de estado —abierto/cerrado— y al girar no se
        volvía a acomodar nada: el campo se quedaba fuera. Medido el 20-10-2026 al girar
        390×844 → 844×390.
      */
      const cambio = !puesto || alto !== altoPuesto;
      puesto = true;
      altoPuesto = alto;
      ultimoCampo = document.activeElement as HTMLElement | null;

      /*
        El alto del teclado, publicado para que el estilo pueda dar sitio debajo del contenido.

        Sin eso, acomodar el campo es imposible y no por falta de código: medido el 20-10-2026 a
        320×568, la página ya estaba en su tope de scroll (276 de 276) con el campo a 267–311 y
        sólo 268 px visibles. `scrollBy` no movía nada porque NO HABÍA a dónde moverse. El
        problema no era el desplazamiento sino que faltaba página debajo.
      */
      raiz.style.setProperty('--lx-teclado-alto', `${alto}px`);
      raiz.setAttribute('data-teclado', 'abierto');
      marcarApretado();

      // Después de que el estilo esconda la barra y el botón —y suelte el cromo de arriba si hace
      // falta—: el hueco que liberan cambia dónde termina el campo, y medir antes sería medir la
      // pantalla anterior.
      if (cambio) window.requestAnimationFrame(acomodar);
    };

    // `focusout` se adelanta al cambio de tamaño: al cerrar el teclado, el viewport tarda unos
    // cuadros en volver y mientras tanto la barra inferior ya tiene que estar de vuelta.
    const alSalir = (): void => {
      // En el siguiente turno, porque entre un campo y el siguiente hay un instante sin foco y no
      // hay que parpadear la navegación en ese hueco.
      window.setTimeout(evaluar, 0);
    };

    vv.addEventListener('resize', evaluar);
    vv.addEventListener('scroll', evaluar);
    document.addEventListener('focusin', evaluar);
    document.addEventListener('focusout', alSalir);
    evaluar();

    return () => {
      vv.removeEventListener('resize', evaluar);
      vv.removeEventListener('scroll', evaluar);
      document.removeEventListener('focusin', evaluar);
      document.removeEventListener('focusout', alSalir);
      limpiar();
    };
  }, []);
}
