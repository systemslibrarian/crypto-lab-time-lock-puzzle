// Small DOM + formatting helpers shared by the interactive panels.

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

/** Truncate a long decimal/hex string for display, keeping head and tail. */
export function ellipsize(s: string, head = 14, tail = 8): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Humanise a duration given in seconds. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Set a status banner's class + icon + text together (never colour alone). */
export type StatusKind = 'idle' | 'working' | 'ok' | 'fail' | 'trapdoor';
export function setStatus(el: HTMLElement, kind: StatusKind, icon: string, text: string): void {
  el.className = `status is-${kind}`;
  el.innerHTML = '';
  const ico = document.createElement('span');
  ico.className = 'ico';
  ico.textContent = icon;
  const span = document.createElement('span');
  span.textContent = text;
  el.append(ico, span);
}

/** Wire a copy-to-clipboard button for a string value. */
export function makeCopyButton(getValue: () => string, label = 'Copy'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'copy';
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getValue());
      const old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = old), 1200);
    } catch {
      btn.textContent = 'Copy failed';
    }
  });
  return btn;
}

/** Render a labelled, monospace, copyable parameter row into a container. */
export function renderParam(
  container: HTMLElement,
  key: string,
  value: string,
  display?: string,
): void {
  const row = document.createElement('div');
  row.className = 'param';
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('div');
  v.className = 'mono-box';
  v.textContent = display ?? value;
  row.append(k, v, makeCopyButton(() => value));
  container.appendChild(row);
}
