import type { GpuMessage } from './gpu-messages';

// Renders a GpuMessage into the always-present fallback container (§8.2).
// Fatal messages replace the page; non-fatal ones use the banner strip.
export function showMessage(m: GpuMessage): void {
  if (!m.fatal) {
    const banner = document.getElementById('banner');
    if (banner) {
      banner.textContent = `${m.title}: ${m.body.join(' ')}`;
      banner.hidden = false;
    }
    return;
  }
  const main = document.getElementById('fallback');
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.hidden = true;
  if (!main) return;
  main.hidden = false;
  main.replaceChildren();
  const h = document.createElement('h1');
  h.id = 'fallback-title';
  h.tabIndex = -1;
  h.textContent = m.title;
  main.appendChild(h);
  for (const text of m.body) {
    const p = document.createElement('p');
    p.textContent = text;
    main.appendChild(p);
  }
  if (m.copyable !== undefined) {
    const p = document.createElement('p');
    p.append('Diagnostics address (copy into a new tab): ');
    const code = document.createElement('code');
    code.textContent = m.copyable;
    p.appendChild(code);
    main.appendChild(p);
  }
  if (m.link !== undefined) {
    const p = document.createElement('p');
    const a = document.createElement('a');
    a.href = m.link.href;
    a.rel = 'noreferrer';
    a.textContent = m.link.label;
    p.appendChild(a);
    main.appendChild(p);
  }
  main.setAttribute('data-gpu-code', m.code);
  h.focus();
}
