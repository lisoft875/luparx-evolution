import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tailwind.css';
import { App } from './App';
import { assertEnvConfigured } from './env';

// Outdoor density (DESIGN_SYSTEM.md §5): one size step up, reinforced contrast, bigger touch
// targets for gloved/sunlit use — driven entirely by `--lx-*` tokens, see tokens.css.
document.documentElement.dataset.density = 'outdoor';

/*
  El portal, como gancho de la paleta (12-10-2026).

  No estaba: de los cuatro portales, Fiscalización era el único que no se identificaba, así que
  pintaba con la paleta general. Desde la v2 tiene la suya —fondo navy, una sola tarjeta, los dos
  azules— y vive en `:root[data-portal='inspector']` de tokens.css, que es el mismo gancho que el
  Ciudadano, el Administrador y la Plataforma usan desde que existen.

  El orden importa y está escrito también en tokens.css: ese bloque va DESPUÉS del de densidad
  exterior, porque las dos reglas tienen la misma especificidad y la densidad redefine el borde.
*/
document.documentElement.dataset.portal = 'inspector';

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
