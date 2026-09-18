import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tailwind.css';
import { App } from './App';
import { assertEnvConfigured } from './env';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

function renderBootFailure(target: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  target.innerHTML = '';
  const box = document.createElement('pre');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'margin:0;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'white-space:pre-wrap;color:#F5F8FF;background:#070C18;min-height:100vh;box-sizing:border-box';
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
