/**
 * Phone Bazaar: phone repair simulator + business tycoon.
 * Entry point: loads styles and boots the app.
 */
import './ui/style.css';
import { boot } from './ui/app';

boot(document.getElementById('app')!);

// Debug hooks for automated tests (dev server only)
if (import.meta.env.DEV) {
  Promise.all([import('./sim/state'), import('./repair/assembly'), import('./repair/diagnostics'), import('./sim/phones'), import('./data/phones'), import('./sim/newgame'), import('./ui/bench')]).then(([state, assembly, diag, phones, data, ng, bench]) => {
    (window as any).__pb = { state, assembly, diag, phones, data, ng, bench };
  });
}
