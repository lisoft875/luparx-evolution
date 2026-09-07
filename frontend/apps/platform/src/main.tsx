import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tokens.css';
import { App } from './App';

// Visually differentiated accent (DESIGN_SYSTEM.md §5) so the platform back-office is never
// mistaken for a municipal `admin` session — driven entirely by `--lx-*` tokens, see tokens.css.
document.documentElement.dataset.portal = 'platform';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
