// Keyboard + mouse state. `down` = held, `pressed` = went down this frame (cleared by endFrame).
// Mouse position is kept in normalized device coords of the stage, for raycasting.
//
// Key bindings (src/data/controls.js): while a scene turns them on (`useBindings(() => meta.settings.keys)`, the
// jungle does), a physical key bound to an action shows up in `down` / `pressed` as that action's DEFAULT code
// ('KeyW', 'Space', 'KeyE'…), so gameplay code reads the same codes whatever the player picked. A default code
// whose action now sits on another key is swallowed; every other key passes through unchanged. `rawDown` /
// `rawPressed` always hold the physical codes (menus, map panning).

import { KEY_ACTIONS, DEFAULT_KEYS, KEY_NAMES } from '../data/controls.js';

const DEFAULT_CODES = new Set(KEY_ACTIONS.map((a) => a.def));

/** The player's bindings: the defaults, overridden by valid stored codes (`stored` = meta.settings.keys). */
export function resolveKeys(stored) {
  const out = { ...DEFAULT_KEYS };
  if (stored && typeof stored === 'object') {
    for (const a of KEY_ACTIONS) if (typeof stored[a.id] === 'string' && stored[a.id]) out[a.id] = stored[a.id];
  }
  return out;
}

// Keyboard layout (Chrome's Keyboard API): codes are physical positions, so on AZERTY 'KeyQ' types "A".
let layoutMap = null;
try { navigator.keyboard?.getLayoutMap?.().then((m) => { layoutMap = m; }).catch(() => {}); } catch { /* unsupported */ }

/** A short, readable name for a key code ('KeyW' → "W", 'ShiftLeft' → "L-Shift"), in the player's layout. */
export function keyLabel(code) {
  if (!code) return '?';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  const ch = layoutMap?.get?.(code);
  if (ch && ch.trim()) return ch.toUpperCase();
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  return code.replace(/(Left|Right)$/, '');
}

export class Input {
  constructor(stage) {
    this.stage = stage;
    this.down = new Set();
    this.pressed = new Set();
    this.rawDown = new Set();
    this.rawPressed = new Set();
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false };
    this.buttons = new Set();
    this.clicked = new Set();
    this._bindSrc = null;      // () → stored bindings, while a scene uses them
    this._held = new Map();    // physical code → the codes its keydown produced (keyup releases exactly those)

    this._onKeyDown = (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.rawDown.has(e.code)) this.rawPressed.add(e.code);
      this.rawDown.add(e.code);
      if (this._held.has(e.code)) return;   // auto-repeat
      const codes = this._codesFor(e.code);
      this._held.set(e.code, codes);
      for (const c of codes) {
        if (!this.down.has(c)) this.pressed.add(c);
        this.down.add(c);
      }
    };
    this._onKeyUp = (e) => {
      this.rawDown.delete(e.code);
      const codes = this._held.get(e.code) || [e.code];
      this._held.delete(e.code);
      for (const c of codes) this.down.delete(c);
    };
    this._onMove = (e) => {
      const r = stage.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
      this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x <= r.width && this.mouse.y <= r.height;
    };
    this._onMouseDown = (e) => {
      // Only clicks on the game view count; clicks on UI buttons are handled by the DOM.
      if (e.target.closest && e.target.closest('.ui-block')) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    };
    this._onMouseUp = (e) => this.buttons.delete(e.button);
    this._onBlur = () => { this.down.clear(); this.rawDown.clear(); this._held.clear(); this.buttons.clear(); };
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMove);
    stage.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    stage.addEventListener('contextmenu', this._onContext);
  }

  /** Turn key bindings on (`src` = () → meta.settings.keys, read on every key press) or off (null). */
  useBindings(src) {
    this._bindSrc = src || null;
  }

  /** The physical key bound to an action ('roll' → 'Space'), or its default when bindings are off. */
  keyFor(action) {
    return resolveKeys(this._bindSrc ? this._bindSrc() : null)[action] || DEFAULT_KEYS[action];
  }

  /** What a physical key press means right now (see the header). */
  _codesFor(code) {
    if (!this._bindSrc) return [code];
    const keys = resolveKeys(this._bindSrc());
    const out = [];
    for (const a of KEY_ACTIONS) if (keys[a.id] === code) out.push(a.def);
    if (out.length) return out;
    return DEFAULT_CODES.has(code) ? [] : [code];
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  /** Physical keys (bindings ignored). */
  rawIsDown(code) { return this.rawDown.has(code); }
  rawWasPressed(code) { return this.rawPressed.has(code); }
  mouseHeld(b = 0) { return this.buttons.has(b); }
  mouseClicked(b = 0) { return this.clicked.has(b); }

  endFrame() {
    this.pressed.clear();
    this.rawPressed.clear();
    this.clicked.clear();
  }
}
