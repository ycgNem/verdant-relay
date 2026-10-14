// Title screen: logo, Continue / New Run / Long Night / Daily / Collection / Settings, the Overgrowth level,
// research + records, and a living 3D diorama of the Relay behind it. Modes and Overgrowth only show once
// unlocked (Long Night + Overgrowth: the first win; Daily: after the first run), so a first visit sees
// New Run, Collection and Settings.

import '../ui/screens.css';
import '../ui/meta.css';
import { el, toast } from '../ui/ui.js';
import { Run, localDate, dailyMods, dailyRecord } from '../core/Run.js';
import { loadRun, clearRun } from '../core/Save.js';
import { CONFIG } from '../data/config.js';
import { RESEARCH_TREE, UNLOCK_KEYS, affordableNodes, ownedCount } from '../data/unlocks.js';
import { OVERGROWTH } from '../data/modes.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, researchChip } from '../ui/screensKit.js';

/**
 * Start a fresh run (abandoning any saved one) and go to the first briefing.
 * opts: { mode: 'normal' | 'long' | 'daily', overgrowth } (Run.create).
 */
export function startNewRun(game, opts = {}) {
  clearRun();
  const meta = game.meta;
  const mode = opts.mode || 'normal';
  const og = mode === 'daily' ? 0 : Math.min(opts.overgrowth ?? 0, overgrowthMax(meta));
  game.run = Run.create(meta, { mode, overgrowth: og });
  // The very first run is guided: night 1 offers one area and the day coaches one step at a time.
  game.run.guided = mode === 'normal' && meta.lifetime.runs === 0;
  meta.lifetime.runs += 1;
  if (mode === 'daily') dailyRecord(meta, game.run.dailyDate).runs += 1;
  game.saveMeta();
  game.go('briefing');
}

/** The highest Overgrowth level that can be picked: 0 until the first win, then one past the best cleared. */
export function overgrowthMax(meta) {
  if (!meta.best?.victory) return 0;
  return Math.min(OVERGROWTH.max, (meta.overgrowth?.best || 0) + 1);
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
  else if (save.phase === 'explore') {
    // The game closed mid-day: the trip counts as abandoned (no free reset of a bad day), then its summary.
    game.run.abandonTrip(game);
    game.run.save('summary');
    game.go('summary');
  } else if (save.phase === 'summary') game.go('summary');
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

    // Modes show once they are unlocked (DESIGN §8: a first visit sees New Run, Collection, Settings).
    const won = !!meta.best.victory;
    const dailyOpen = meta.lifetime.runs > 0;
    this.ogMax = overgrowthMax(meta);
    this.og = Math.min(meta.overgrowth?.level || 0, this.ogMax);
    const buttons = [];
    const keys = {};   // hotkey code → button
    const add = (code, b) => { buttons.push(b); keys[code] = b; return b; };
    if (save) {
      const where = { prep: 'Night prep', wave: 'Wave (restarts)', explore: 'Day trip (counts as abandoned)', summary: 'After the trip' }[save.phase] || 'Briefing';
      const mode = save.mode === 'long' ? 'Long Night · ' : save.mode === 'daily' ? 'Daily · ' : '';
      const of = save.mode === 'long' ? '' : ` of ${CONFIG.nights}`;
      add('KeyC', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Continue'), el('span.msub', `${mode}Night ${save.night}${of} · ${where}`)), () => {
        if (!continueRun(game)) { toast(game.ui, 'That save could not be loaded.', 'bad'); this.rebuild(); }
      }, { cls: 'primary menu-btn', sfx: 'done', hotkey: 'C' }));
    }
    this.newSub = el('span.msub');
    add('KeyN', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'New Run'), this.newSub), () => this.newRun(save, { mode: 'normal', overgrowth: this.og }), { cls: save ? 'menu-btn' : 'primary menu-btn', sfx: 'done', hotkey: 'N' }));
    if (won) {
      const lb = meta.longNight?.best || 0;
      this.longSub = el('span.msub');
      add('KeyL', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Long Night'), this.longSub), () => this.newRun(save, { mode: 'long', overgrowth: this.og }), { cls: 'menu-btn', sfx: 'done', hotkey: 'L' }));
      this.longBest = lb;
    }
    // Overgrowth (after the first win): one row under the run buttons, ◂ ▸ or Left / Right.
    let ogRow = null;
    if (won) {
      this.ogVal = el('b.og-val');
      this.ogLine = el('div.og-line.small');
      const step = (d) => this.setOvergrowth(this.og + d);
      ogRow = el('div.og-row.ui-block', {},
        el('div.og-top', {}, el('span.og-k', 'Overgrowth'),
          sbtn(game, '◂', () => step(-1), { cls: 'og-step', sfx: null }), this.ogVal, sbtn(game, '▸', () => step(1), { cls: 'og-step', sfx: null }),
          el('span.small.muted', 'Left / Right')),
        this.ogLine);
    }
    if (dailyOpen) {
      const today = localDate();
      const d = meta.daily?.[today];
      const mods = dailyMods(today).map((k) => OVERGROWTH.mods[k].name).join(' + ');
      const best = d && (d.nights || d.victory) ? ` · best ${d.victory ? 'won' : `${d.nights} night${d.nights === 1 ? '' : 's'}`}` : '';
      add('KeyD', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Daily Run'), el('span.msub', `${best ? '' : 'Today: '}${mods}${best}`)), () => this.newRun(save, { mode: 'daily' }),
        { cls: 'menu-btn', sfx: 'done', hotkey: 'D', title: dailyMods(today).map((k) => `${OVERGROWTH.mods[k].name}: ${OVERGROWTH.mods[k].text}`).join('\n') }));
    }
    add('KeyK', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Collection'), el('span.msub', won || dailyOpen ? 'Research, codex' : 'Research, records, codex')), () => game.go('collection', { from: 'title' }), { cls: 'menu-btn', hotkey: 'K' }));
    add('KeyO', sbtn(game, el('span.mbtn', {}, el('span.mlabel', 'Settings'), el('span.msub', won || dailyOpen ? 'Sound, display' : 'Sound, display, hints')), () => game.go('settings', { from: 'title' }), { cls: 'menu-btn', hotkey: 'O' }));
    this.keys = keys;
    this.save = save;

    // Affordable-research nudge.
    const affordable = affordableNodes(meta);
    const nudge = affordable.length
      ? el('div.title-nudge.ui-block', { onclick: () => { game.sfx.play('open'); game.go('collection', { from: 'title' }); } }, el('span.amber', '◈ '), `You can afford ${affordable.length === 1 ? RESEARCH_TREE[affordable[0]].name : `${affordable.length} research unlocks`} in Collection`)
      : null;

    const best = meta.best;
    // Records only once there is something to show (a first visit sees four zeros otherwise).
    const ogBest = meta.overgrowth?.best || 0;
    const record = meta.lifetime.runs === 0 && !meta.research ? null : el('div.title-stats.panel.ui-block', {},
      el('div.row', {}, el('span.muted', 'Research Data'), el('span.grow'), researchChip(meta.research, { noLabel: true })),
      el('div.row', {}, el('span.muted', 'Best run'), el('span.grow'),
        best.victory ? el('b.good', `Victory · ${CONFIG.nights}/${CONFIG.nights} nights`) : el('b', best.nights ? `${best.nights}/${CONFIG.nights} nights survived` : 'No nights yet')),
      ogBest > 0 ? el('div.row', {}, el('span.muted', 'Overgrowth won'), el('span.grow'), el('b.amber', `Level ${ogBest}`)) : null,
      won && meta.longNight?.best ? el('div.row', {}, el('span.muted', 'Long Night best'), el('span.grow'), el('b', `${meta.longNight.best} nights`)) : null,
      el('div.row', {}, el('span.muted', 'Runs'), el('span.grow'), el('b', String(meta.lifetime.runs)), el('span.muted', ' · wins '), el('b', String(meta.lifetime.victories))),
      el('div.row', {}, el('span.muted', 'Research unlocks'), el('span.grow'), el('b', `${ownedCount(meta)}/${UNLOCK_KEYS.length}`)),
      nudge);   // the research nudge sits under the records, so the menu column fits at 720p with Continue + modes

    // Wordmark (pixel-art/ui_logo): a plain image at the world's texel scale (critic H #11), see sizeLogo().
    this.logo = el('img.title-logo-img', { src: `${import.meta.env.BASE_URL}sprites/ui_logo.png`, alt: 'Verdant Relay', draggable: 'false' });
    const root = el('div.screen.scr.title-screen', {},
      el('div.title-vignette'),
      el('div.title-left', {},
        el('h1.title-logo-art', {}, this.logo),
        el('div.tagline', 'Scavenge by day. Hold the line by night.'),
        this.menuLayout(buttons, keys, ogRow),
        record ? null : nudge),
      record,
      // Arrow keycaps render as "+" in the pixel font (critic L §4): the keys are written out.
      el('div.title-foot.small.muted', {}, el('span.key', 'Up'), el('span.key', 'Down'), ' choose  ', el('span.key', 'Enter'), ' select'));
    game.ui.append(root);
    this.buttons = buttons;
    this.setOvergrowth(this.og, true);
    this.sizeLogo();
    const onResize = () => this.sizeLogo();
    window.addEventListener('resize', onResize);
    this.bag.add(() => window.removeEventListener('resize', onResize));

    // The first (primary) button starts focused, so Enter works straight away.
    this.nav = this.bag.add(new KeyNav(game, {
      items: () => this.buttons,
      start: 0,
      onEnter: () => this.buttons[0]?.click(),
      onKey: (e) => {
        if (this.ogMax > 0 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { this.setOvergrowth(this.og + (e.code === 'ArrowRight' ? 1 : -1)); return true; }
        const b = this.keys[e.code];
        if (b) { b.click(); return true; }
        return false;
      },
    }));
  }

  /**
   * The logo is 320 × 96 texels. Show it at a whole number of DEVICE px per texel: the same scale the world
   * texels get (Game._layout().k: ×2 at 720p, ×3 at 1080p), so it is pixel-exact and matches the backdrop.
   */
  sizeLogo() {
    if (!this.logo) return;
    const game = this.game;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor(game._layout?.().k || (game.u || 1) * dpr * 1.5));
    this.logo.style.width = `${(320 * k) / dpr}px`;
    this.logo.style.height = `${(96 * k) / dpr}px`;
  }

  /**
   * The menu column. A first visit: one button per row. Once modes are open the column goes compact so it
   * fits at 720p: New Run and Long Night side by side over the Overgrowth row they share, then the Daily,
   * then Collection and Settings side by side.
   */
  menuLayout(buttons, keys, ogRow) {
    const compact = !!(keys.KeyL || keys.KeyD);
    if (!compact) return el('div.menu-col', {}, buttons);
    const pair = (a, b) => (a && b ? el('div.menu-pair', {}, a, b) : a || b);
    return el('div.menu-col.compact', {},
      keys.KeyC || null,
      pair(keys.KeyN, keys.KeyL),
      ogRow,
      keys.KeyD || null,
      pair(keys.KeyK, keys.KeyO));
  }

  /** Pick the Overgrowth level (0 … overgrowthMax) and refresh the labels that show it. */
  setOvergrowth(level, silent = false) {
    const game = this.game;
    const lv = Math.max(0, Math.min(this.ogMax || 0, level));
    if (lv !== this.og && !silent) game.sfx.play('ui_move');
    else if (!silent && lv === this.og && level !== lv) game.sfx.play('error');
    this.og = lv;
    if (game.meta.overgrowth && game.meta.overgrowth.level !== lv) { game.meta.overgrowth.level = lv; game.saveMeta(); }
    const compact = !!this.longSub || !!this.keys?.KeyD;
    const bonus = Math.round(lv * OVERGROWTH.researchPerLevel * 100);
    this.newSub.textContent = this.save ? (compact ? 'Ends the saved run' : 'Abandons the saved run')
      : compact ? 'Six nights' : 'Six nights. Defend your base, the Relay.';
    if (this.longSub) this.longSub.textContent = this.save ? 'Ends the saved run' : `Endless${this.longBest ? ` · best ${this.longBest}` : ''}`;
    if (this.ogVal) {
      this.ogVal.textContent = lv > 0 ? String(lv) : 'Off';
      const mods = OVERGROWTH.order.slice(0, lv).map((k) => OVERGROWTH.mods[k]);
      const last = mods[mods.length - 1];
      this.ogLine.replaceChildren(lv === 0
        ? el('span.muted', `The standard run. Win at a level to unlock the next (up to ${this.ogMax}).`)
        : el('span', {}, el('span.amber', `+ ${last.name}: `), last.text, el('span.muted', `${mods.length > 1 ? ` (and ${mods.length - 1} more)` : ''} · Research +${bonus}%`)));
      this.ogLine.title = mods.map((m, i) => `${i + 1}. ${m.name}: ${m.text}`).join('\n');
    }
  }

  rebuild() {
    this.bag.dispose();
    this.backdrop?.dispose();
    this.game.ui.innerHTML = '';
    this.enter();
  }

  async newRun(save, opts = {}) {
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
    startNewRun(game, opts);
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
