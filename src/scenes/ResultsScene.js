// Results: the end of a run (victory or defeat). params.result comes from run.finish(game, victory):
//   { victory, nights, night, kills, districts: [names], peak: {scrap,...}, research }
// The run is over, so game.run is cleared here.

import '../ui/screens.css';
import { el, resRow } from '../ui/ui.js';
import { CONFIG } from '../data/config.js';
import { UNLOCKS, UNLOCK_KEYS } from '../data/unlocks.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { startNewRun } from './TitleScene.js';
import { KeyNav, Bag, sbtn, researchChip } from '../ui/screensKit.js';

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

    this.backdrop = new MenuBackdrop(game, { mood: win ? 'dawn' : 'fallen', angle: win ? -0.4 : 0.9, speed: 0.03, radius: 13, height: 7.5, shiftX: 0.0 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    game.music?.play(win ? 'results' : 'defeat');
    game.sfx.play(win ? 'done' : 'core');

    const nights = Math.max(0, r.nights | 0);
    const tile = (label, value, sub) => el('div.stat-tile', {}, el('div.small.muted', label), el('div.stat-val', value), sub ? el('div.small.muted', sub) : null);

    // Record line.
    const best = meta.best;
    let record;
    if (win && meta.lifetime.victories === 1) record = el('div.record.good', '★ First victory! The Verdant Scarf cosmetic is yours.');
    else if (win) record = el('div.record.good', `★ Victory #${meta.lifetime.victories}`);
    else if (nights > 0 && nights >= best.nights && !best.victory) record = el('div.record.amber', `★ Best run so far: ${nights} night${nights === 1 ? '' : 's'}`);
    else record = el('div.record.muted', best.victory ? 'Your best: a full victory.' : `Your best: ${best.nights}/${CONFIG.nights} nights.`);

    // Unlock nudge: something affordable now, or the closest goal.
    const open = UNLOCK_KEYS.filter((k) => UNLOCKS[k].cost != null && !meta.unlocks.includes(k)).sort((a, b) => UNLOCKS[a].cost - UNLOCKS[b].cost);
    const affordable = open.filter((k) => UNLOCKS[k].cost <= meta.research);
    let nudge = null;
    if (affordable.length) {
      nudge = el('div.nudge.good', {}, '◈ You can afford ', el('b', UNLOCKS[affordable[0]].name),
        affordable.length > 1 ? ` and ${affordable.length - 1} more` : '', ' in Collection.');
    } else if (open.length) {
      const k = open[0];
      nudge = el('div.nudge.muted', {}, `${UNLOCKS[k].cost - meta.research} more Research Data for `, el('b', UNLOCKS[k].name), '.');
    } else {
      nudge = el('div.nudge.muted', 'Every research unlock is yours.');
    }

    const newRun = sbtn(game, 'New Run', () => startNewRun(game), { cls: 'primary big', hotkey: 'Enter', sfx: 'done' });
    const coll = sbtn(game, 'Collection', () => game.go('collection', { from: 'title' }), { cls: 'big' + (affordable.length ? ' glow' : ''), hotkey: 'K' });
    const title = sbtn(game, 'Title', () => game.go('title'), { cls: 'big', hotkey: 'Esc' });
    this.buttons = [newRun, coll, title];

    const panel = el(`div.panel.ui-block.results-panel${win ? '.win' : '.lose'}`, {},
      el('div.res-headline', win ? 'VICTORY' : 'THE RELAY HAS FALLEN'),
      el('div.res-sub', win
        ? `The Canopy Colossus is down. Verdant Relay holds through all ${CONFIG.nights} nights.`
        : `The Relay Core went dark on Night ${r.night}. ${nights ? `You held ${nights} night${nights === 1 ? '' : 's'}.` : 'It didn\'t survive the first night.'}`),
      el('div.stat-grid.res-grid', {},
        tile('Nights survived', `${nights}/${CONFIG.nights}`),
        tile('Kills', String(r.kills || 0)),
        tile('Districts visited', String((r.districts || []).length), (r.districts || []).join(', ') || '—'),
        tile('Research earned', el('span', {}, '+', researchChip(r.research || 0, { noLabel: true })), 'banked permanently'),
        tile('Total Research', researchChip(meta.research, { noLabel: true }))),
      el('div.peak', {}, el('span.small.muted', 'Peak resources  '), resRow(r.peak || {})),
      record,
      nudge,
      el('div.row.center.res-btns', {}, newRun, coll, title));

    game.ui.append(el('div.screen.scr.results-screen', {}, el('div.scr-dim.light'), panel));

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

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
