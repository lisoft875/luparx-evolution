import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tailwind.css';
import { App } from './App';
import { assertEnvConfigured } from './env';

/*
  El portal, declarado en la raíz del documento (09-10-2026).

  Es el mismo gancho que la plataforma usa desde que existe —`:root[data-portal='platform']`— y
  sirve para lo mismo: darle a UN portal su paleta sin tocar la de los otros tres. La fachada del
  ciudadano pide un navy más profundo que el del sistema, y los documentos de Fiscalización y
  Administración piden explícitamente no tocar sus pantallas en esta tarea. Con esto, el ciudadano
  cambia y los demás no se enteran.
*/
document.documentElement.dataset.portal = 'citizen';

/*
  El Inicio abre ARRIBA, siempre (09-10-2026).

  Reportado con dos capturas del mismo teléfono: al entrar, la pantalla aparecía ya desplazada
  —sin encabezado, el héroe cortado por arriba— y había que subir a mano para ver la aplicación
  entera.

  No era el reposicionamiento al navegar, que ya se corrigió en `CitizenShell`: es el del
  NAVEGADOR. Por omisión `history.scrollRestoration` vale `'auto'`, y entonces el navegador
  recuerda a qué altura se dejó la página y la restituye al volver a abrirla. En una aplicación de
  una sola página eso ocurre DESPUÉS de que el primer render fija su altura, así que un
  `scrollTo(0, 0)` al montar se ejecuta antes y el navegador lo pisa a continuación. Por eso el
  arreglo anterior no alcanzaba: no llegaba tarde por poco, llegaba antes de tiempo.

  En `'manual'` el navegador deja de restituir y la posición la decide la aplicación, que es lo
  correcto acá: las pantallas se abren por su título, no por donde quedó la anterior. No se pierde
  ninguna restauración —esta aplicación no la hacía— y el botón «atrás» sigue navegando igual.

  Va en el arranque del ciudadano y no en un componente: es una propiedad del documento, y ponerla
  donde se monta la aplicación es ponerla una vez. Los otros tres portales no se tocan en esta
  tarea.
*/
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

function renderBootFailure(target: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  target.innerHTML = '';
  const box = document.createElement('pre');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'margin:0;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    // Los únicos dos colores escritos a mano del proyecto, y a propósito: esta pantalla se dibuja
    // cuando la aplicación NO pudo arrancar, momento en el que puede que la hoja de estilos ni
    // siquiera esté cargada y un `var(--lx-text)` no valdría nada. Son los valores de
    // `--lx-text` y `--lx-bg` de la paleta del 05-10-2026, copiados.
    'white-space:pre-wrap;color:#F8FAFC;background:#070B14;min-height:100vh;box-sizing:border-box';
  box.textContent = `LupaRX no pudo iniciar / failed to start:\n\n${message}`;
  target.appendChild(box);
}

try {
  assertEnvConfigured();
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  renderBootFailure(container, error);
  throw error;
}
