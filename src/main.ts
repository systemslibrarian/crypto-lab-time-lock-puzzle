// Entry point: honour the dark/light theme contract, wire the tabs, and boot
// the two interactive panels. The visible theme toggle and the shared site
// header are added later by the Parts 0 + A–E standardization pass — this file
// deliberately does NOT build a toggle button.

import './styles/main.css';
import { initCreatePanel } from './ui/create';
import { initSolvePanel } from './ui/solve';

// Default to dark when nothing is stored (no prefers-color-scheme — by contract).
const savedTheme = (() => {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
})();
document.documentElement.setAttribute('data-theme', savedTheme ?? 'dark');

function initTabs(): (id: string) => void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));

  function activate(tabId: string): void {
    tabs.forEach((t) => {
      const selected = t.id === tabId;
      t.setAttribute('aria-selected', String(selected));
      // Roving tabindex: only the active tab is in the Tab order (WAI-ARIA tabs).
      t.tabIndex = selected ? 0 : -1;
    });
    const controls = document.getElementById(tabId)?.getAttribute('aria-controls');
    panels.forEach((p) => (p.dataset.active = String(p.id === controls)));
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab.id));
    // Roving arrow-key navigation across the tablist (WAI-ARIA tabs pattern).
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      next.focus();
      activate(next.id);
    });
  });

  // Apply the roving tabindex to the initially-selected tab.
  const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
  activate(initial.id);

  return activate;
}

const activate = initTabs();
initCreatePanel(() => activate('tab-solve'));
initSolvePanel();
