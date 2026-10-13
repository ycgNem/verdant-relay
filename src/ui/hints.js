// First-run tutorial hints. Each hint id shows once per save (meta.hints), and never when hints
// are turned off in settings. Hints sit in a corner, don't pause the game, and close on click or timeout.

import { el } from './ui.js';

/**
 * showHint(game, 'explore_move', '<b>WASD</b> to move…', { pos: 'top-left'|'top-right'|'bottom-left'|'bottom-right'|'map-bottom-left'|'center', time: 9 })
 * opts.style = { left, top, … } places it explicitly (overrides pos).
 * Returns the node, or null if the hint was already seen.
 */
export function showHint(game, id, html, opts = {}) {
  const meta = game.meta;
  if (!meta.settings.hints || meta.hints[id]) return null;
  meta.hints[id] = true;
  game.saveMeta();
  // opts.style: explicit placement (e.g. computed from the element the hint talks about), so a
  // hint never covers its own subject.
  const pos = opts.style || {
    'top-left': { left: 'calc(var(--u) * 12)', top: 'calc(var(--u) * 70)' },
    'top-right': { right: 'calc(var(--u) * 12)', top: 'calc(var(--u) * 70)' },
    'bottom-left': { left: 'calc(var(--u) * 12)', bottom: 'calc(var(--u) * 80)' },
    'bottom-right': { right: 'calc(var(--u) * 12)', bottom: 'calc(var(--u) * 80)' },
    // Night map: the scenery rows under both lanes (toasts sit bottom-right there).
    'map-bottom-left': { left: 'calc(var(--u) * 12)', bottom: 'calc(var(--u) * 10)' },
    center: { left: '50%', top: '38%', transform: 'translateX(-50%)' },
  }[opts.pos || 'top-right'];
  const n = el('div.hint.ui-block', { html: `${html}<div class="small muted" style="margin-top:4px">click to dismiss</div>`, style: pos });
  n.addEventListener('click', () => n.remove());
  game.ui.append(n);
  setTimeout(() => n.remove(), (opts.time ?? 10) * 1000);
  return n;
}
