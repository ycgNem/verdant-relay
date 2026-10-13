// Title screen: logo, New Run / Continue / Collection / Settings, research + best run, and a living
// 3D diorama of the Relay behind it.

import '../ui/screens.css';
import { el, toast } from '../ui/ui.js';
import { Run } from '../core/Run.js';
import { loadRun, clearRun } from '../core/Save.js';
import { CONFIG } from '../data/config.js';
import { UNLOCKS, UNLOCK_KEYS } from '../data/unlocks.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, researchChip } from '../ui/screensKit.js';

/** Start a fresh run (abandoning any saved one) and go to the first briefing. */
export function startNewRun(game) {
  clearRun();
  game.run = Run.create(game.meta);
  game.meta.lifetime.runs += 1;
  game.saveMeta();
  game.go('briefing');
}

/** Resume a saved run snapshot. Returns false if the save is gone or invalid. */
export function continueRun(game) {
  const save = loadRun();
  if (!save) return false;
  try {
    game.run = Run.fromSave(save);
  } catch (e) {
    console.warn('Continue failed:', e);
    clearRun();
    return false;
  }
  // 'wave' = quit mid-wave: the defense scene restarts that wave with the locked build.
  if (save.phase === 'prep' || save.phase === 'wave') game.go('defense', { resume: true });
  else game.go('briefing', { resume: true });
  return true;
}

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
  }

  enter() {
    const game = this.game;
    game.run = null;
    this.backdrop = new MenuBackdrop(game, { mood: 'dusk', shiftX: 0.16 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play('title');

    const save = loadRun();
    const meta = game.meta;

    const buttons = [];
    if (save) {
      const where = save.phase === 'prep' ? 'Night prep' : save.phase === 'wave' ? 'Wave (restarts)' : 'Briefing';
      buttons.push(sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Continue'), el('span.msub', `Night ${save.night} of ${CONFIG.nights} · ${where}`)), () => {
        if (!continueRun(game)) { toast(game.ui, 'That save could not be loaded.', 'bad'); this.rebuild(); }
      }, { cls: 'primary menu-btn', sfx: 'done', hotkey: 'C' }));
    }
    buttons.push(sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'New Run'), el('span.msub', save ? 'Abandons the saved run' : 'Six nights. Hold the Relay.')), () => this.newRun(save), { cls: save ? 'menu-btn' : 'primary menu-btn', sfx: 'done', hotkey: 'N' }));
    buttons.push(sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Collection'), el('span.msub', 'Unlocks, records, codex')), () => game.go('collection', { from: 'title' }), { cls: 'menu-btn', hotkey: 'K' }));
    buttons.push(sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Settings'), el('span.msub', 'Sound, display, hints')), () => game.go('settings', { from: 'title' }), { cls: 'menu-btn', hotkey: 'O' }));

    // Affordable-unlock nudge.
    const affordable = UNLOCK_KEYS.filter((k) => UNLOCKS[k].cost != null && !meta.unlocks.includes(k) && UNLOCKS[k].cost <= meta.research);
    const nudge = affordable.length
      ? el('div.title-nudge.ui-block', { onclick: () => { game.sfx.play('open'); game.go('collection', { from: 'title' }); } }, el('span.amber', '◈ '), `You can afford ${affordable.length === 1 ? UNLOCKS[affordable[0]].name : `${affordable.length} unlocks`} in Collection`)
      : null;

    const best = meta.best;
    const record = el('div.title-stats.panel.ui-block', {},
      el('div.row', {}, el('span.muted', 'Research Data'), el('span.grow'), researchChip(meta.research, { noLabel: true })),
      el('div.row', {}, el('span.muted', 'Best run'), el('span.grow'),
        best.victory ? el('b.good', `Victory · ${CONFIG.nights}/${CONFIG.nights} nights`) : el('b', best.nights ? `${best.nights}/${CONFIG.nights} nights survived` : 'No nights yet')),
      el('div.row', {}, el('span.muted', 'Runs'), el('span.grow'), el('b', String(meta.lifetime.runs)), el('span.muted', ' · wins '), el('b', String(meta.lifetime.victories))),
      el('div.row', {}, el('span.muted', 'Unlocks'), el('span.grow'), el('b', `${meta.unlocks.length}/${UNLOCK_KEYS.length}`)));

    const root = el('div.screen.scr.title-screen', {},
      el('div.title-vignette'),
      el('div.title-left', {},
        el('h1.title-logo.logo-big', {}, el('span.logo-a', 'VERDANT'), el('span.logo-b', 'RELAY')),
        el('div.tagline', 'Scavenge by day. Hold the line by night.'),
        el('div.menu-col', {}, buttons),
        nudge),
      record,
      el('div.title-foot.small.muted', {}, el('span.key', '↑'), el('span.key', '↓'), ' choose  ', el('span.key', 'Enter'), ' select'));
    game.ui.append(root);
    this.buttons = buttons;

    // The first (primary) button starts focused, so Enter works straight away.
    this.nav = this.bag.add(new KeyNav(game, {
      items: () => this.buttons,
      start: 0,
      onEnter: () => this.buttons[0]?.click(),
      onKey: (e) => {
        const map = { KeyC: save ? 0 : -1, KeyN: save ? 1 : 0, KeyK: save ? 2 : 1, KeyO: save ? 3 : 2 };
        const i = map[e.code];
        if (i != null && i >= 0 && this.buttons[i]) { this.buttons[i].click(); return true; }
        return false;
      },
    }));
  }

  rebuild() {
    this.bag.dispose();
    this.backdrop?.dispose();
    this.game.ui.innerHTML = '';
    this.enter();
  }

  async newRun(save) {
    const game = this.game;
    if (save) {
      const ok = await ask(game, {
        title: 'Abandon saved run?',
        text: `Your run on Night ${save.night} will be lost. Research and unlocks you already earned are kept.`,
        confirm: 'Abandon & start new',
        cancel: 'Keep it',
        danger: true,
        defaultCancel: true,
      });
      if (!ok || game.scene !== this) return;
    }
    startNewRun(game);
  }

  update(dt) {
    this.backdrop?.update(dt);
  }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
    this.three = null;
    this.camera = null;
  }
}
