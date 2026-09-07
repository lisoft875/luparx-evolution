import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@luparx/ui/tokens.css';
import { App } from './App';

// Outdoor density (DESIGN_SYSTEM.md §5): one size step up, reinforced contrast, bigger touch
// targets for gloved/sunlit use — driven entirely by `--lx-*` tokens, see tokens.css.
document.documentElement.dataset.density = 'outdoor';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
