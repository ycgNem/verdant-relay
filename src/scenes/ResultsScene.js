// Results: the end of a run (victory or defeat). params.result comes from run.finish(game, victory):
//   { victory, won, mode, overgrowth, mods, dailyDate, ogBefore, longBefore, dailyBefore, nights, night, kills,
//     districts: [names], peak: {scrap,...}, research, leaks }
// It says why the Relay fell (the night board's leak tally, `leaks`), what the next step is (research to buy,
// a mode or Overgrowth level just opened) and the mode's record (Long Night best night, the Daily's best).
// The run is over, so game.run is cleared here.

import '../ui/screens.css';
import '../ui/meta.css';
import { el, resRow } from '../ui/ui.js';
import { frameGeom } from '../core/Assets.js';
import { CONFIG } from '../data/config.js';
import { RESEARCH_TREE, affordableNodes, nextGoal, UNLOCK_KEYS, ownedCount } from '../data/unlocks.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { OVERGROWTH } from '../data/modes.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { startNewRun, overgrowthMax } from './TitleScene.js';
import { KeyNav, Bag, sbtn, researchChip } from '../ui/screensKit.js';

const easeOut = (t) => 1 - (1 - t) * (1 - t);

// What to try next, by the enemy type that did the most Relay damage (one plain sentence).
const LEAK_TIPS = {
  crawler: 'Crawler packs got through: more towers along both paths, or a Thorn Nest where they bunch up.',
  skitter: 'Fast Skitters ran past: Thorn Nests and Snare Vines catch them.',
  razorback: 'Tanks walked in: upgrade the towers nearest the Relay and slow them with Snare Vines.',
  ruin_guard: 'Ruin Guards shrug off bullets: Arc Spires and Mortar Pods hit them properly.',
  spitter: 'Spitters stopped to shell the Relay: put damage where they plant themselves.',
  burrower: 'Burrowers tunnelled under bullets: Arc Spires and Snare Vines reach them underground.',
  seed_carrier: 'Seed Carriers burst into seedlings: a blast (Mortar Pod) kills them cleanly.',
  seedling: 'Seedlings swarmed in: kill Seed Carriers with a blast so they don\'t burst.',
  colossus: 'The Colossus reached the Relay: set the towers on its path to Toughest and root it with Vine Snare.',
};

/** The leak tally (array or { type: n | {count, damage} }) as a sorted list, biggest Relay damage first. */
function leakList(leaks) {
  if (!leaks || typeof leaks !== 'object') return [];
  const list = Array.isArray(leaks) ? leaks
    : Object.entries(leaks).map(([type, v]) => (typeof v === 'number' ? { type, count: v } : { type, ...v }));
  return list.filter((x) => x && x.type && ((x.count || 0) > 0 || (x.damage || 0) > 0))
    .sort((a, b) => (b.damage || 0) - (a.damage || 0) || (b.count || 0) - (a.count || 0));
}

export class ResultsScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
  }

  enter(params = {}) {
    const game = this.game;
    game.run = null;
    const r = params.result;
    if (!r) { game.go('title'); return; }
    const meta = game.meta;
    const long = r.mode === 'long';
    const daily = r.mode === 'daily';
    // A Long Night run always ends with the Relay falling, but holding night 6 was a win: it gets the bright screen.
    const win = !!r.victory || (long && !!r.won);

    // The panel sits on the left third; the diorama (and a sprite tableau) gets the rest of the screen.
    this.backdrop = new MenuBackdrop(game, { mood: win ? 'dawn' : 'fallen', angle: win ? -0.4 : 0.9, speed: 0.03, radius: 13, height: 7.5, shiftX: 0.0 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play(win ? 'results' : 'defeat');
    game.sfx.play(win ? 'victory' : 'defeat');

    const nights = Math.max(0, r.nights | 0);
    // Numbers count up from 0 once the title has landed (driven by update()).
    this.counts = [];
    const count = (to, fmt = (n) => String(n)) => {
      const n = el('span.count', fmt(0));
      this.counts.push({ n, to: Math.max(0, Math.round(to)), fmt, t: 0 });
      return n;
    };
    this.countDelay = 0.75;
    // Unique district names in visit order, repeats as "×2" (the full list rarely fits on one line).
    const seen = new Map();
    for (const d of r.districts || []) seen.set(d, (seen.get(d) || 0) + 1);
    const districtList = [...seen].map(([d, k]) => (k > 1 ? `${d} ×${k}` : d)).join(', ');
    const tile = (label, value, sub) => el('div.stat-tile', {}, el('div.small.muted', label), el('div.stat-val', value), sub ? el('div.small.muted', { title: typeof sub === 'string' ? sub : '' }, sub) : null);

    // Record line (by mode).
    const best = meta.best;
    let record;
    const firstWin = (r.victory || r.won) && meta.lifetime.victories === 1 && !r.debug;
    const ogNew = !r.debug && (r.victory || r.won) && !daily && r.ogBefore != null && r.overgrowth >= r.ogBefore && overgrowthMax(meta) > r.overgrowth;
    if (r.debug && (r.victory || r.won)) record = el('div.record.muted', 'Debug run: not counted toward records.');
    else if (firstWin) record = el('div.record.good', '★ First victory! The Long Night and Overgrowth 1 are open on the title screen, and the Verdant Scarf is yours.');
    else if (long) {
      const before = r.longBefore || 0;
      record = nights > before && !r.debug
        ? el('div.record.amber', `★ New Long Night best: ${nights} night${nights === 1 ? '' : 's'}${before ? ` (was ${before})` : ''}`)
        : el('div.record.muted', `Your Long Night best: ${meta.longNight?.best || 0} nights.`);
    } else if (daily) {
      const before = r.dailyBefore || 0;
      const d = meta.daily?.[r.dailyDate];
      record = nights > before && !r.debug
        ? el('div.record.amber', `★ Today's best Daily: ${r.victory ? 'a win' : `${nights} night${nights === 1 ? '' : 's'}`}`)
        : el('div.record.muted', `Today's best Daily: ${d?.victory ? 'a win' : `${d?.nights || 0} nights`}.`);
    } else if (win) record = el('div.record.good', meta.lifetime.victories > 1 ? `★ Victory #${meta.lifetime.victories}` : '★ Victory!');
    else if (nights > 0 && nights >= best.nights && !best.victory) record = el('div.record.amber', `★ Best run so far: ${nights} night${nights === 1 ? '' : 's'}`);
    else record = el('div.record.muted', best.victory ? 'Your best: a full victory.' : `Your best: ${best.nights}/${CONFIG.nights} nights.`);
    const nextMod = OVERGROWTH.mods[OVERGROWTH.order[r.overgrowth]];
    const ogLine = ogNew && nextMod && !firstWin ? el('div.record.good', `★ Overgrowth ${r.overgrowth + 1} is open: ${nextMod.name} (pick it on the title screen).`) : null;

    // Why the Relay fell (the night board's leak tally, critic L §4): the worst offenders, and what to try next.
    const why = !r.victory ? this._why(r) : null;

    // Research nudge: something affordable now, or the closest goal.
    const affordable = affordableNodes(meta);
    const goal = nextGoal(meta);
    // The description as a lower-case clause, without its own brackets (it goes inside ours).
    const lc = (s) => s.replace(/\s*\([^)]*\)/g, '').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
    let nudge = null;
    if (affordable.length) {
      // Say what it does, and that Collection (the button right here) is where to get it.
      const u = RESEARCH_TREE[affordable[0]];
      nudge = affordable.length > 1
        ? el('div.nudge.good', { title: u.desc }, '◈ Your Research buys ', el('b', u.name), ` and ${affordable.length - 1} more unlock${affordable.length > 2 ? 's' : ''}. Get them in Collection ▸`)
        : el('div.nudge.good', { title: u.desc }, '◈ Your Research buys ', el('b', u.name), ` (${lc(u.desc)}). Get it in Collection ▸`);
    } else if (goal) {
      const u = RESEARCH_TREE[goal];
      nudge = el('div.nudge.muted', { title: u.desc }, `${u.cost - meta.research} more Research for `, el('b', u.name), ` (${lc(u.desc)}).`);
    } else if (ownedCount(meta) >= UNLOCK_KEYS.length) {
      nudge = el('div.nudge.muted', 'Every research unlock is yours.');
    }

    // Play again in the same mode (Overgrowth level and Long Night / Daily kept).
    const again = { mode: r.mode || 'normal', overgrowth: Math.min(r.overgrowth || 0, overgrowthMax(meta)) };
    const newRun = sbtn(game, long ? 'Long Night again' : daily ? 'Daily again' : 'New Run', () => startNewRun(game, again), { cls: 'primary big', hotkey: 'Enter', sfx: 'done' });
    const coll = sbtn(game, 'Collection', () => game.go('collection', { from: 'title' }), { cls: 'big' + (affordable.length ? ' glow' : ''), hotkey: 'K' });
    const title = sbtn(game, 'Title', () => game.go('title'), { cls: 'big', hotkey: 'Esc' });
    this.buttons = [newRun, coll, title];

    const titleText = long ? 'THE LONG NIGHT ENDS' : win ? 'VICTORY' : 'THE RELAY HAS FALLEN';
    // Letters drop in one by one (grouped per word so lines only break between words).
    let li = 0;
    const headline = el('div.res-headline', {}, titleText.split(' ').map((w) => el('span.res-word', {},
      [...w].map((ch) => el('span.res-ch', { style: { animationDelay: `${0.05 + li++ * 0.045}s` } }, ch)))));
    // The run's mode and modifiers (Research bonus) under the headline.
    const modeTag = [long ? 'Long Night' : null, daily ? `Daily ${r.dailyDate}` : null, r.overgrowth ? `Overgrowth ${r.overgrowth}` : null].filter(Boolean).join(' · ');
    const mods = (r.mods || []).map((k) => OVERGROWTH.mods[k]).filter(Boolean);
    const bonus = Math.round((daily ? mods.length : (r.overgrowth || 0)) * 10);
    const sub = long
      ? `The Relay went dark on Night ${r.night}. You held ${nights} night${nights === 1 ? '' : 's'}${r.won ? ', the Colossus among them' : ''}.`
      : win
        // Only claim the kill if it happened (r.bossKilled from DefenseScene._endNight; the siege can end without one).
        ? `${r.bossKilled === false ? 'The Relay held the Colossus off.' : 'The Canopy Colossus is down.'} Verdant Relay holds through all ${CONFIG.nights} nights.`
        : `The Relay Core went dark on Night ${r.night}. ${nights ? `You held ${nights} night${nights === 1 ? '' : 's'}.` : 'It didn\'t survive the first night.'}`;
    const panel = el(`div.panel.ui-block.results-panel${win ? '.win' : '.lose'}${long ? '.long' : ''}`, {},
      headline,
      modeTag ? el('div.res-mode.small', { title: mods.map((m) => `${m.name}: ${m.text}`).join('\n') }, modeTag, bonus ? el('span.muted', ` · Research +${bonus}%`) : null) : null,
      el('div.res-sub', sub),
      why,
      el('div.stat-grid.res-grid', {},
        tile('Nights survived', el('span', {}, count(nights), long ? '' : `/${CONFIG.nights}`)),
        tile('Kills', count(r.kills || 0)),
        tile('Areas visited', count((r.districts || []).length), districtList || '—'),
        tile('Research earned', el('span', {}, '+', this._countChip(researchChip(r.research || 0, { noLabel: true }), r.research || 0)),
          r.debug ? 'debug run: not banked' : `banked · ${meta.research} in total`)),
      el('div.peak', {}, el('span.small.muted', 'Peak resources  '), resRow(r.peak || {})),
      record,
      ogLine,
      nudge,
      el('div.row.center.res-btns', {}, newRun, coll, title));

    game.ui.append(el(`div.screen.scr.results-screen${win ? '.win' : '.lose'}`, {}, el('div.scr-dim.results-dim'), panel, this._tableau(win)));

    this.nav = this.bag.add(new KeyNav(game, {
      items: () => this.buttons,
      onEnter: () => newRun.click(),
      onEscape: () => title.click(),
      onKey: (e) => {
        if (e.code === 'KeyK') { coll.click(); return true; }
        if (e.code === 'KeyN') { newRun.click(); return true; }
        return false;
      },
    }));
  }

  /**
   * Why the Relay fell: the leak tally of the last night (`r.leaks`, stored by the night board as
   * run.lastNight.leaks) → "What got through: 4 Razorbacks (48 damage), 6 Crawlers (30)" and one tip for the
   * worst offender. Null when there is no tally.
   */
  _why(r) {
    const list = leakList(r.leaks);
    if (!list.length) return null;
    const name = (x) => {
      const d = DEFENSE_ENEMIES[x.type];
      const n = x.count || 0;
      const base = d?.name || x.type;
      return `${n > 1 ? `${n} ` : n === 1 ? 'a ' : ''}${n > 1 && !/s$/.test(base) ? `${base}s` : base}`;
    };
    const parts = list.slice(0, 3).map((x) => `${name(x)}${x.damage ? ` (${Math.round(x.damage)} damage)` : ''}`);
    const tip = LEAK_TIPS[list[0].type];
    return el('div.res-why', {},
      el('div', {}, el('span.bad', 'What got through: '), parts.join(', ')),
      tip ? el('div.small.muted', tip) : null);
  }

  /** Count a research chip's number up with the others. */
  _countChip(chip, to) {
    const b = chip.querySelector('b');
    if (b) this.counts.push({ n: b, to: Math.max(0, Math.round(to)), fmt: (n) => String(n), t: 0 });
    if (b) b.textContent = '0';
    return chip;
  }

  /**
   * A sprite tableau over the diorama, drawn at a whole-number scale: victory = the scavenger beside
   * the toppled Colossus at dawn; defeat = the Colossus standing over the dark Relay with its swarm.
   */
  _tableau(win) {
    const game = this.game;
    const A = game.assets;
    const u = game.u;
    const s = Math.max(1, Math.round(u * 1.5));
    const spr = (key, frame = 0, cls = '') => {
      const info = A.spriteInfo(key);
      if (!info?.tex?.image) return null;
      const img = info.tex.image;
      const { fw, fh, cols } = frameGeom(info.def, img);
      const fx = frame % cols, fy = Math.floor(frame / cols);
      return el(`span.tab-spr${cls ? '.' + cls : ''}`, {
        style: {
          width: `${fw * s}px`, height: `${fh * s}px`,
          backgroundImage: `url(${import.meta.env.BASE_URL}sprites/${info.def.file})`,
          backgroundSize: `${img.width * s}px ${img.height * s}px`, backgroundPosition: `${-fx * fw * s}px ${-fy * fh * s}px`,
        },
      });
    };
    const kids = win
      ? [spr('colossus', 0, 'toppled'), spr('player', 0, 'hero')]
      : [spr('relay_core', 0, 'core.dark'), spr('colossus', 0, 'boss'), spr('crawler', 2, 'minion.m1'), spr('crawler', 4, 'minion.m2'), spr('skitter', 2, 'minion.m3')];
    return el(`div.res-tableau${win ? '.win' : '.lose'}`, { style: { '--s': String(s) } }, kids);
  }

  update(dt) {
    this.backdrop?.update(dt);
    if (this.countDelay > 0) { this.countDelay -= dt; return; }
    for (const c of this.counts || []) {
      if (c.t >= 1) continue;
      const before = Math.round(c.to * easeOut(c.t));
      c.t = Math.min(1, c.t + dt / Math.min(1.2, 0.35 + c.to * 0.02));
      const v = Math.round(c.to * easeOut(c.t));
      if (v !== before || c.t >= 1) { c.n.textContent = c.fmt(v); if (v !== before) this.game.sfx.play('tally'); }
    }
  }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
