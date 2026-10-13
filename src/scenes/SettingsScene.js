// Settings: screen shake, sound and music volume, picture size (read-only), tutorial hints, reset progress.
//
// The panel is also usable as an overlay from any scene (pause menus):
//   import { openSettingsOverlay } from './SettingsScene.js';
//   openSettingsOverlay(game, { onClose })

import '../ui/screens.css';
import { el, toast } from '../ui/ui.js';
import { resetAll, loadMeta } from '../core/Save.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, overlay } from '../ui/screensKit.js';

/**
 * Build the settings panel. opts: { onBack(), allowReset (default true), title }
 * Returns { node, nav, dispose() }.
 */
export function buildSettingsPanel(game, opts = {}) {
  const bag = new Bag();
  const node = el('div.panel.ui-block.settings-panel');
  let focusables = [];

  const save = () => game.saveMeta();

  const toggle = (label, desc, get, set) => {
    const b = sbtn(game, '', () => { set(!get()); save(); paint(); }, { cls: 'toggle-btn' });
    const paint = () => {
      b.textContent = '';
      b.append(el(get() ? 'span.tog.on' : 'span.tog', {}, el('span.knob')), get() ? 'On' : 'Off');
      b.classList.toggle('on', get());
    };
    paint();
    focusables.push(b);
    return el('div.set-row', {}, el('div.set-label', {}, el('b', label), desc ? el('div.small.muted', desc) : null), el('div.set-ctrl', {}, b));
  };

  const slider = (label, desc, get, set, onAfter) => {
    const val = el('b.slider-val');
    const input = el('input.slider', { type: 'range', min: '0', max: '100', step: '5' });
    input.value = String(Math.round(get() * 100));
    const paint = () => {
      val.textContent = `${input.value}%`;
      input.style.setProperty('--p', `${input.value}%`);
    };
    input.addEventListener('input', () => { set(Number(input.value) / 100); paint(); });
    input.addEventListener('change', () => { save(); onAfter?.(); });
    // Keyboard: when focused via KeyNav, ←/→ adjust.
    const minus = sbtn(game, '−', () => step(-10), { cls: 'step-btn', sfx: null, title: 'Lower' });
    const plus = sbtn(game, '+', () => step(10), { cls: 'step-btn', sfx: null, title: 'Raise' });
    const step = (d) => {
      input.value = String(Math.max(0, Math.min(100, Number(input.value) + d)));
      set(Number(input.value) / 100);
      paint();
      save();
      onAfter?.();
    };
    paint();
    focusables.push(minus, plus);
    return el('div.set-row', {}, el('div.set-label', {}, el('b', label), desc ? el('div.small.muted', desc) : null),
      el('div.set-ctrl.slider-ctrl', {}, minus, input, plus, val));
  };

  const s = () => game.meta.settings;

  // Picture: no choice to make — the view is a fixed 20 × 11-tile window, scaled up by whole numbers
  // (Game._layout). A read-only line says how this window is shown.
  const picVal = el('b.set-pic');
  const paintPic = () => {
    const L = game._layout();
    picVal.textContent = `Scale ×${Number.isInteger(L.k) ? L.k : L.k.toFixed(2)}`;
    picVal.title = `${game.width}×${game.height} game pixels`;
  };
  const onResize = () => paintPic();
  window.addEventListener('resize', onResize);
  bag.add(() => window.removeEventListener('resize', onResize));

  const build = () => {
    focusables = [];
    node.innerHTML = '';
    node.append(el('h2', opts.title || 'Settings'));

    const sec = (title, ...rows) => el('div.set-section', {}, el('h3', title), rows);

    node.append(el('div.set-grid', {},
      sec('Sound',
        slider('Sound effects', null, () => s().volume, (v) => { s().volume = v; game.sfx.volume = v; }, () => game.sfx.play('pickup')),
        slider('Music', null, () => s().music, (v) => { s().music = v; game.music?.refreshVolume?.(); })),
      sec('Display',
        toggle('Screen shake', 'Camera kick when the Relay or you get hit.', () => s().shake, (v) => { s().shake = v; if (v) game.shake(5, 0.25); }),
        (() => {
          paintPic();
          return el('div.set-row', {}, el('div.set-label', {}, el('b', 'Picture size'),
            el('div.small.muted', 'Automatic: a 20 × 11-tile view, scaled up by whole numbers so pixels stay crisp.')),
            el('div.set-ctrl', {}, picVal));
        })()),
      sec('Tutorial',
        toggle('Tutorial hints', 'Short tips the first time you see each screen.', () => s().hints, (v) => { s().hints = v; }),
        (() => {
          const b = sbtn(game, 'Reset hints', () => {
            game.meta.hints = {};
            save();
            toast(game.ui, 'Tutorial hints will show again.', 'good');
          }, { cls: 'small-btn' });
          focusables.push(b);
          const seen = Object.keys(game.meta.hints || {}).length;
          return el('div.set-row', {}, el('div.set-label', {}, el('b', 'Show hints again'), el('div.small.muted', `${seen} hint${seen === 1 ? '' : 's'} already seen.`)), el('div.set-ctrl', {}, b));
        })()),
      opts.allowReset === false ? null : sec('Danger zone',
        (() => {
          const b = sbtn(game, 'Reset all progress…', () => resetProgress(), { cls: 'danger small-btn', sfx: 'error' });
          focusables.push(b);
          return el('div.set-row', {}, el('div.set-label', {}, el('b.bad', 'Reset all progress'), el('div.small.muted', 'Erases research, unlocks, records, settings and the saved run.')), el('div.set-ctrl', {}, b));
        })())));

    const back = sbtn(game, opts.backLabel || 'Back', () => opts.onBack?.(), { cls: 'primary', hotkey: 'Esc' });
    focusables.push(back);
    node.append(el('div.row.end.set-foot', {}, back));
  };

  const resetProgress = async () => {
    const first = await ask(game, {
      title: 'Reset all progress?',
      text: 'This erases your Research Data, every unlock, best-run records, lifetime stats, settings and any saved run.',
      confirm: 'Continue…', cancel: 'Cancel', danger: true, defaultCancel: true,
    });
    if (!first) return;
    const second = await ask(game, {
      title: 'Are you absolutely sure?',
      text: 'This cannot be undone.',
      confirm: 'Erase everything', cancel: 'Keep my progress', danger: true, defaultCancel: true,
    });
    if (!second) return;
    resetAll();
    game.meta = loadMeta();
    game.run = null;
    game.applySettings();
    game.music?.refreshVolume?.();
    game.saveMeta();
    toast(game.ui, 'All progress erased.', 'amber');
    opts.onReset?.();
    build();
  };

  build();
  const nav = bag.add(new KeyNav(game, {
    layer: opts.layer || null,
    items: () => focusables,
    onEscape: () => opts.onBack?.(),
    onKey: (e) => {
      // ←/→ on a focused slider step adjusts it; otherwise arrows navigate.
      const cur = nav?.cur;
      if (cur && cur.classList.contains('step-btn') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const row = cur.parentElement;
        const btns = row.querySelectorAll('.step-btn');
        (e.code === 'ArrowLeft' ? btns[0] : btns[1]).click();
        return true;
      }
      return false;
    },
  }));
  return { node, nav, dispose: () => bag.dispose() };
}

/** Open the settings panel as an overlay on top of the current scene. */
export function openSettingsOverlay(game, opts = {}) {
  let panelApi = null;
  const holder = el('div.settings-holder');
  const { ov, close } = overlay(game, holder);
  const done = () => { panelApi?.dispose(); close(); opts.onClose?.(); };
  panelApi = buildSettingsPanel(game, { onBack: done, layer: ov, allowReset: false, backLabel: 'Done', title: 'Settings' });
  holder.append(panelApi.node);
  return { close: done };
}

export class SettingsScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
  }

  enter(params = {}) {
    const game = this.game;
    this.from = params.from && game.scenes[params.from] ? params.from : 'title';
    this.backdrop = new MenuBackdrop(game, { mood: 'dusk', angle: 0.6, speed: 0.03, radius: 13, height: 6.5 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play('title');

    const api = buildSettingsPanel(game, { onBack: () => game.go(this.from, { from: 'settings' }) });
    this.bag.add(api);
    game.ui.append(el('div.screen.scr.settings-screen', {}, el('div.scr-dim'), api.node));
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
