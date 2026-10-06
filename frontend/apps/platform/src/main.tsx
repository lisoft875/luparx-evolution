import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tailwind.css';
import { App } from './App';
import { assertEnvConfigured } from './env';

// Visually differentiated accent (DESIGN_SYSTEM.md §5) so the platform back-office is never
// mistaken for a municipal `admin` session — driven entirely by `--lx-*` tokens, see tokens.css.
document.documentElement.dataset.portal = 'platform';

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
