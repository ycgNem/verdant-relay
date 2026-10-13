// Results: the end of a run (victory or defeat). params.result comes from run.finish(game, victory):
//   { victory, nights, night, kills, districts: [names], peak: {scrap,...}, research }
// The run is over, so game.run is cleared here.

import '../ui/screens.css';
import { el, resRow } from '../ui/ui.js';
import { frameGeom } from '../core/Assets.js';
import { CONFIG } from '../data/config.js';
import { UNLOCKS, UNLOCK_KEYS } from '../data/unlocks.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { startNewRun } from './TitleScene.js';
import { KeyNav, Bag, sbtn, researchChip } from '../ui/screensKit.js';

const easeOut = (t) => 1 - (1 - t) * (1 - t);

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
    const win = !!r.victory;

    // The panel sits on the left third; the diorama (and a sprite tableau) gets the rest of the screen.
    this.backdrop = new MenuBackdrop(game, { mood: win ? 'dawn' : 'fallen', angle: win ? -0.4 : 0.9, speed: 0.03, radius: 13, height: 7.5, shiftX: 0.0 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play(win ? 'results' : 'defeat');
    game.sfx.play(win ? 'done' : 'core');

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

    // Record line.
    const best = meta.best;
    let record;
    if (win && meta.lifetime.victories === 1) record = el('div.record.good', '★ First victory! The Verdant Scarf cosmetic is yours.');
    else if (win && r.debug) record = el('div.record.muted', 'Debug run: not counted toward records.');
    else if (win) record = el('div.record.good', meta.lifetime.victories > 1 ? `★ Victory #${meta.lifetime.victories}` : '★ Victory!');
    else if (nights > 0 && nights >= best.nights && !best.victory) record = el('div.record.amber', `★ Best run so far: ${nights} night${nights === 1 ? '' : 's'}`);
    else record = el('div.record.muted', best.victory ? 'Your best: a full victory.' : `Your best: ${best.nights}/${CONFIG.nights} nights.`);

    // Unlock nudge: something affordable now, or the closest goal.
    const open = UNLOCK_KEYS.filter((k) => UNLOCKS[k].cost != null && !meta.unlocks.includes(k)).sort((a, b) => UNLOCKS[a].cost - UNLOCKS[b].cost);
    const affordable = open.filter((k) => UNLOCKS[k].cost <= meta.research);
    let nudge = null;
    if (affordable.length) {
      // Say what it does, and that Collection (the button right here) is where to get it.
      const u = UNLOCKS[affordable[0]];
      nudge = el('div.nudge.good', { title: u.desc }, '◈ Your Research buys ', el('b', u.name), ` (${u.desc.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())})`,
        affordable.length > 1 ? ` and ${affordable.length - 1} more` : '', '. Get it in Collection ▸');
    } else if (open.length) {
      const k = open[0];
      nudge = el('div.nudge.muted', { title: UNLOCKS[k].desc }, `${UNLOCKS[k].cost - meta.research} more Research for `, el('b', UNLOCKS[k].name), ` (${UNLOCKS[k].desc.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}).`);
    } else {
      nudge = el('div.nudge.muted', 'Every research unlock is yours.');
    }

    const newRun = sbtn(game, 'New Run', () => startNewRun(game), { cls: 'primary big', hotkey: 'Enter', sfx: 'done' });
    const coll = sbtn(game, 'Collection', () => game.go('collection', { from: 'title' }), { cls: 'big' + (affordable.length ? ' glow' : ''), hotkey: 'K' });
    const title = sbtn(game, 'Title', () => game.go('title'), { cls: 'big', hotkey: 'Esc' });
    this.buttons = [newRun, coll, title];

    const titleText = win ? 'VICTORY' : 'THE RELAY HAS FALLEN';
    // Letters drop in one by one (grouped per word so lines only break between words).
    let li = 0;
    const headline = el('div.res-headline', {}, titleText.split(' ').map((w) => el('span.res-word', {},
      [...w].map((ch) => el('span.res-ch', { style: { animationDelay: `${0.05 + li++ * 0.045}s` } }, ch)))));
    const panel = el(`div.panel.ui-block.results-panel${win ? '.win' : '.lose'}`, {},
      headline,
      el('div.res-sub', win
        ? `The Canopy Colossus is down. Verdant Relay holds through all ${CONFIG.nights} nights.`
        : `The Relay Core went dark on Night ${r.night}. ${nights ? `You held ${nights} night${nights === 1 ? '' : 's'}.` : 'It didn\'t survive the first night.'}`),
      el('div.stat-grid.res-grid', {},
        tile('Nights survived', el('span', {}, count(nights), `/${CONFIG.nights}`)),
        tile('Kills', count(r.kills || 0)),
        tile('Districts visited', count((r.districts || []).length), districtList || '—'),
        tile('Research earned', el('span', {}, '+', this._countChip(researchChip(r.research || 0, { noLabel: true }), r.research || 0)), r.debug ? 'debug run: not banked' : 'banked permanently'),
        tile('Total Research', this._countChip(researchChip(meta.research, { noLabel: true }), meta.research))),
      el('div.peak', {}, el('span.small.muted', 'Peak resources  '), resRow(r.peak || {})),
      record,
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
      if (v !== before || c.t >= 1) { c.n.textContent = c.fmt(v); if (v !== before) this.game.sfx.play('pickup'); }
    }
  }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
