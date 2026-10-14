// Settings, in three tabs (keys 1–3) so each fits a 720p screen:
//   Sound     mute, master / music / sound effects / ambience
//   Game      screen shake, full screen, picture size (read-only), tutorial hints, reset progress
//   Controls  jungle key bindings (meta.settings.keys, src/data/controls.js; Input.useBindings applies them)
//
// The panel is also usable as an overlay from any scene (pause menus):
//   import { openSettingsOverlay } from './SettingsScene.js';
//   openSettingsOverlay(game, { onClose })

import '../ui/screens.css';
import { el, toast, snapBox } from '../ui/ui.js';
import { resetAll, loadMeta } from '../core/Save.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, overlay } from '../ui/screensKit.js';
import { MIX } from '../data/audio.js';
import { KEY_ACTIONS, DEFAULT_KEYS, RESERVED_KEYS, MOUSE_CONTROLS } from '../data/controls.js';
import { resolveKeys, keyLabel } from '../core/Input.js';

const TABS = [['sound', 'Sound'], ['game', 'Game'], ['controls', 'Controls']];
let lastTab = 'sound';   // the tab Settings reopens on (this session)

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

  const slider = (label, desc, get, set, onAfter, extra = null) => {
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
      el('div.set-ctrl.slider-ctrl', {}, minus, input, plus, val, extra));
  };

  const s = () => game.meta.settings;

  // Audio (src/core/Sfx.js buses): mute (also MIX.muteKey anywhere), master, music, sound effects, ambience.
  const lvl = (k) => (typeof s()[k] === 'number' ? s()[k] : MIX.defaults[k]);
  const audio = () => game.sfx.applySettings();
  const soundRows = () => {
    const W = { width: 'round(calc(var(--u) * 66), 1px)', flex: 'none', justifyContent: 'center' };   // mute button + spacers keep the sliders aligned
    const mute = sbtn(game, '', () => { s().muted = !s().muted; save(); audio(); paintMute(); }, { cls: 'small-btn mute-btn', title: `Mute everything (${MIX.muteKey} works anywhere)` });
    Object.assign(mute.style, W);
    const paintMute = () => { mute.textContent = s().muted ? 'Muted' : 'Mute'; mute.classList.toggle('danger', !!s().muted); };
    paintMute();
    game.sfx.onMuteChange = paintMute;
    const gap = () => el('span', { style: W });
    const master = slider('Master volume', `${MIX.muteKey} mutes everything, anywhere.`, () => lvl('master'), (v) => { s().master = v; audio(); }, () => game.sfx.play('ui_confirm'), mute);
    focusables.push(mute);
    return [
      master,
      slider('Music', null, () => lvl('music'), (v) => { s().music = v; audio(); }, null, gap()),
      slider('Sound effects', null, () => lvl('volume'), (v) => { s().volume = v; audio(); }, () => game.sfx.play('pick_scrap'), gap()),
      slider('Ambience', null, () => lvl('ambience'), (v) => { s().ambience = v; audio(); }, null, gap()),
    ];
  };
  bag.add(() => { game.sfx.onMuteChange = null; });

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

  // Full screen (the browser's own; it can't be remembered across visits, so it isn't a saved setting).
  const fullscreen = () => {
    const b = sbtn(game, '', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => toast(game.ui, 'This browser blocked full screen.', 'bad'));
      } catch { /* unsupported */ }
    }, { cls: 'toggle-btn' });
    const paint = () => {
      const on = !!document.fullscreenElement;
      b.textContent = '';
      b.append(el(on ? 'span.tog.on' : 'span.tog', {}, el('span.knob')), on ? 'On' : 'Off');
      b.classList.toggle('on', on);
    };
    paint();
    document.addEventListener('fullscreenchange', paint);
    bag.add(() => document.removeEventListener('fullscreenchange', paint));
    focusables.push(b);
    return el('div.set-row', {}, el('div.set-label', {}, el('b', 'Full screen'), el('div.small.muted', 'Fill the monitor (Esc or this button leaves it).')), el('div.set-ctrl', {}, b));
  };

  // ---- Controls: click a key, then press the new one (Esc cancels). A key already used by another action
  // swaps with it, so two actions never share a key.
  let capturing = null;      // action id waiting for a key
  const keys = () => resolveKeys(s().keys);
  const stopCapture = () => {
    capturing = null;
    window.removeEventListener('keydown', onCapture, true);
  };
  const onCapture = (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    const id = capturing;
    if (e.code === 'Escape') { stopCapture(); game.sfx.play('ui_back'); build(); return; }
    if (RESERVED_KEYS.has(e.code) || !/^[A-Za-z0-9]{2,24}$/.test(e.code)) { game.sfx.play('error'); toast(game.ui, `${keyLabel(e.code)} can't be used: pick another key`, 'bad', 1.8); return; }
    const cur = keys();
    const other = KEY_ACTIONS.find((a) => a.id !== id && cur[a.id] === e.code);
    const next = { ...cur, [id]: e.code };
    if (other) next[other.id] = cur[id];   // swap
    // Store only what differs from the defaults.
    s().keys = Object.fromEntries(KEY_ACTIONS.filter((a) => next[a.id] !== DEFAULT_KEYS[a.id]).map((a) => [a.id, next[a.id]]));
    save();
    stopCapture();
    game.sfx.play('ui_confirm');
    if (other) toast(game.ui, `${other.label} moved to ${keyLabel(cur[id])}`, 'amber', 2);
    build(id);
  };
  bag.add(() => stopCapture());
  const controlRows = () => {
    const cur = keys();
    const cell = (a) => {
      const waiting = capturing === a.id;
      const b = sbtn(game, waiting ? 'Press a key…' : keyLabel(cur[a.id]), () => {
        if (capturing) return;
        capturing = a.id;
        window.addEventListener('keydown', onCapture, true);
        build(a.id);
      }, { cls: `key-btn${waiting ? ' waiting' : ''}${cur[a.id] !== a.def ? ' changed' : ''}`, title: `${a.label}: click, then press a key` });
      b.dataset.action = a.id;
      focusables.push(b);
      return el('div.set-key', {}, el('span.set-key-l', a.label), b);
    };
    const reset = sbtn(game, 'Reset to default', () => { s().keys = {}; save(); stopCapture(); build('reset'); toast(game.ui, 'Controls reset', 'good', 1.6); }, { cls: 'small-btn' });
    focusables.push(reset);
    return [
      el('div.small.muted.set-keyhelp', 'Jungle controls. Click a key (or Enter), then press the new one. Esc cancels.'),
      el('div.set-keys', {}, KEY_ACTIONS.map(cell)),
      el('div.set-keys.fixed', {}, MOUSE_CONTROLS.map((m) => el('div.set-key', {}, el('span.set-key-l', m.label), el('span.key', m.key)))),
      el('div.row.set-keyfoot', {}, el('span.small.muted', `Esc pauses · ${MIX.muteKey} mutes · keys 1–3 switch tabs`), el('span.grow'), reset),
    ];
  };

  let tab = TABS.some(([k]) => k === (opts.tab || lastTab)) ? (opts.tab || lastTab) : 'sound';
  const setTab = (t) => {
    if (t === tab || !TABS.some(([k]) => k === t)) return;
    stopCapture();
    tab = lastTab = t;
    game.sfx.play('ui_tab');
    build('tab');
  };

  /** Re-render; `focus`: 'tab' → the selected tab, an action id → its key button, 'reset' → the reset button. */
  const build = (focus = null) => {
    focusables = [];
    node.innerHTML = '';
    const tabBtns = TABS.map(([k, label], i) => {
      const b = sbtn(game, label, () => setTab(k), { cls: `tab-btn${k === tab ? ' selected' : ''}`, hotkey: String(i + 1), sfx: null });
      b.dataset.tab = k;
      focusables.push(b);
      return b;
    });
    node.append(el('div.row.set-head', {}, el('h2', opts.title || 'Settings'), el('span.grow'), el('div.tabs', {}, tabBtns)));

    const sec = (title, ...rows) => el('div.set-section', {}, el('h3', title), rows);
    let body;
    if (tab === 'sound') body = [sec('Sound', ...soundRows())];
    else if (tab === 'controls') body = [sec('Controls', ...controlRows())];
    else {
      body = [
        sec('Display',
          toggle('Screen shake', 'Camera kick when the Relay or you get hit.', () => s().shake, (v) => { s().shake = v; if (v) game.shake(5, 0.25); }),
          fullscreen(),
          (() => {
            paintPic();
            return el('div.set-row', {}, el('div.set-label', {}, el('b', 'Picture size'),
              el('div.small.muted', 'Automatic: a 20 × 11-tile view, scaled up by whole numbers so pixels stay crisp.')),
              el('div.set-ctrl', {}, picVal));
          })()),
        sec('Tutorial',
          toggle('Tutorial hints', 'Short tips the first time you see each screen or need a move.', () => s().hints, (v) => { s().hints = v; }),
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
          })()),
      ];
    }
    node.append(el(`div.set-grid.set-${tab}`, {}, body));

    const back = sbtn(game, opts.backLabel || 'Back', () => opts.onBack?.(), { cls: 'primary', hotkey: 'Esc', sfx: 'ui_back' });
    focusables.push(back);
    node.append(el('div.row.end.set-foot', {}, back));
    if (focus && nav) {
      const target = focus === 'tab' ? node.querySelector(`.tab-btn[data-tab="${tab}"]`)
        : focus === 'reset' ? null : node.querySelector(`.key-btn[data-action="${focus}"]`);
      const i = target ? nav.items().indexOf(target) : -1;
      if (i >= 0) nav.focus(i);
    }
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

  let nav = null;
  build();
  nav = bag.add(new KeyNav(game, {
    layer: opts.layer || null,
    items: () => focusables,
    onEscape: () => opts.onBack?.(),
    onKey: (e) => {
      if (capturing) return true;   // the key capture (capture phase) has it
      const m = /^Digit([1-3])$|^Numpad([1-3])$/.exec(e.code);
      if (m) { const t = TABS[Number(m[1] || m[2]) - 1]; if (t) setTab(t[0]); return true; }
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
    snapBox(api.node);   // whole pixels (critic M2 P1-3)
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
