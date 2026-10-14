// Jungle key bindings (Settings → Controls; stored in meta.settings.keys as { action: KeyboardEvent.code }).
//
// Gameplay code keeps reading the default codes (Player: 'KeyW'… 'Space', 'KeyF', 'KeyQ'; JungleScene: 'KeyE',
// 'Tab'): while the jungle runs, Input translates the physical key the player pressed into the default code of the
// action it is bound to (Input.useBindings), so a rebind needs no change anywhere else. A default key that is
// bound to nothing any more does nothing in the jungle. Mouse buttons (slash = left, heavy chop / deflect = right)
// are not keys and stay fixed.

/** The rebindable actions, in the order the Settings list shows them. `def` = default code (what code reads). */
export const KEY_ACTIONS = [
  { id: 'up', label: 'Move up', def: 'KeyW' },
  { id: 'down', label: 'Move down', def: 'KeyS' },
  { id: 'left', label: 'Move left', def: 'KeyA' },
  { id: 'right', label: 'Move right', def: 'KeyD' },
  { id: 'roll', label: 'Roll', def: 'Space' },
  { id: 'interact', label: 'Interact (hold)', def: 'KeyE' },
  { id: 'throw', label: 'Throw machete', def: 'KeyF' },
  { id: 'med', label: 'Med kit', def: 'KeyQ' },
  { id: 'map', label: 'Map', def: 'Tab' },
];

export const DEFAULT_KEYS = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));

// Keys that can't be bound: Esc is pause / back everywhere, F2 mutes (MIX.muteKey), the rest belong to the
// browser or the OS.
export const RESERVED_KEYS = new Set(['Escape', 'F1', 'F2', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu', 'PrintScreen']);

// Fixed (mouse) controls listed under the keys.
export const MOUSE_CONTROLS = [
  { label: 'Slash (hold while walking: hack through)', key: 'Left click' },
  { label: 'Heavy chop (hold) · deflect (tap)', key: 'Right click' },
];

// Readable names for codes that aren't a single printable character.
export const KEY_NAMES = {
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Bksp', CapsLock: 'Caps',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};
