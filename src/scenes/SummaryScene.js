// Summary: after a day's trip. One card (simplicity pass): what you got (or lost), the goal and tonight's
// reward, bonus tasks, tonight's danger, research in one line; then the skill pick. Continue → night prep.
// Works when the player died (nothing banked) or the record is missing.

import '../ui/screens.css';
import { el, resIcon } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, RESOURCES, RESOURCE_KEYS } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, EVENTS } from '../data/objectives.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { runStatus, nightPips } from './BriefingScene.js';
import { KeyNav, Bag, sbtn, skillPicker, skillTag } from '../ui/screensKit.js';

export class SummaryScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
    this.pickerHidden = false;
  }

  enter() {
    const game = this.game;
    const run = game.run;
    if (!run) { game.go('title'); return; }
    const x = (this.rec = run.lastExpedition);
    const good = !x || x.extracted;

    this.backdrop = new MenuBackdrop(game, { mood: good ? 'dusk' : 'night', angle: 3.4, speed: 0.025, radius: 13, height: 7.5 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play('day');
    game.sfx.play(good ? 'done' : 'hurt');

    this.root = el('div.screen.scr.summary-screen');
    game.ui.append(this.root);
    this.picker = skillPicker(game, {
      onChange: () => this.render(),
      onSave: () => { this.pickerHidden = true; this.render(); },
    });
    this.render();

    this.nav = this.bag.add(new KeyNav(game, {
      items: () => [...this.root.querySelectorAll('.skill-card, .save-pt, .spend-btn, .continue-btn')],
      onEnter: () => this.next(),
      onKey: (e) => {
        if (!this.pickerHidden && this.picker.handleKey(e)) return true;
        if (e.code === 'KeyP' && this.pickerHidden && run.skillPoints > 0) { this.pickerHidden = false; this.render(); return true; }
        return false;
      },
    }));

    if (run.skillPoints > 0) {
      this.bag.timeout(() => {
        if (game.scene !== this) return;
        // At the bottom of the Expedition column (above its footer), pointing down at the skill cards (it used to
        // sit top-left, over the loot it wasn't about).
        // In the skill panel's header row, between "Pick 1 of 3" and "Save point for later": next to
        // the cards it explains, covering neither the cards nor the expedition checklist.
        const panel = this.root.querySelector('.sum-skills');
        const ui = game.ui.getBoundingClientRect();
        const r = panel?.getBoundingClientRect();
        const style = r ? { left: `${r.left - ui.left + r.width * 0.33}px`, top: `${r.top - ui.top + 4}px`, maxWidth: `${r.width * 0.46}px` } : null;
        showHint(game, 'summary_skills',
          'Pick a card <b>▼</b> (keys 1–3) to spend your <b>skill point</b>, or save it for later.',
          { pos: 'top-left', style, time: 12 });
      }, 600);
    }
  }

  render() {
    const game = this.game;
    const run = game.run;
    const x = this.rec;
    this.root.innerHTML = '';

    if (!x) {
      this.root.append(el('div.panel.ui-block.summary-empty', {}, el('h2', 'Back at base'), el('p.muted', 'Nothing to report. Get ready for the night.')),
        el('div.row.scr-foot', {}, el('span.grow'), this.continueBtn()));
      return;
    }

    const d = DISTRICTS[x.district] || { name: x.district || 'Unknown area' };
    const extracted = !!x.extracted;
    const headline = extracted ? 'BACK HOME SAFE' : x.died ? 'YOU WENT DOWN' : 'TRIP LOST';
    const salvaged = (!extracted && x.salvaged) || null;
    const sub = extracted
      ? 'Everything you carried is stored at base.'
      : salvaged
        ? 'Most of what you carried is lost, but the drone saved some Scrap. Your towers and stored resources are safe.'
        : 'What you carried is lost. Your towers and stored resources are safe.';

    const head = el(`div.scr-head.panel.ui-block.sum-head${extracted ? '.ok' : '.fail'}`, {},
      el('div', {}, el('div.headline', headline), el('div.small.muted', {}, `${d.name} · Night ${run.night}`, x.kills ? ` · ${x.kills} kill${x.kills === 1 ? '' : 's'}` : '')),
      el('div.small.sum-sub', sub),
      el('span.grow'),
      nightPips(run.night));

    // One card: what you got, the goal and its reward, bonus tasks, tonight's danger, research (one line).
    const carried = x.carried || {};
    const gotKeys = RESOURCE_KEYS.filter((k) => extracted ? carried[k] : salvaged?.[k]);
    const chip = (k, n, cls = 'good') => el('span.sum-chip', { style: { '--c': RESOURCES[k].color }, title: RESOURCES[k].desc },
      resIcon(k), el(`b.${cls}`, `+${n}`), el('span.lbl', RESOURCES[k].label));
    const got = gotKeys.map((k) => chip(k, Math.floor(extracted ? carried[k] : salvaged[k])));
    if (x.bonusScrap) got.push(el('span.sum-chip', { title: 'Bonus Scrap from your goal / bonus tasks' }, resIcon('scrap'), el('b.amber', `+${x.bonusScrap}`), el('span.lbl', 'bonus Scrap')));
    const lostKeys = extracted ? [] : RESOURCE_KEYS.filter((k) => Math.floor(carried[k] || 0) - Math.floor(salvaged?.[k] || 0) > 0);
    const rows = [];
    rows.push(el('div.sum-row', {}, el('span.sum-k', extracted ? 'You got' : 'Saved'),
      got.length ? el('div.sum-chips', {}, got) : el('span.muted', extracted ? 'Nothing this time.' : 'Nothing.')));
    if (lostKeys.length) {
      rows.push(el('div.sum-row', {}, el('span.sum-k.bad', 'Lost'),
        el('span.muted', lostKeys.map((k) => `${Math.floor(carried[k]) - Math.floor(salvaged?.[k] || 0)} ${RESOURCES[k].label}`).join(', '))));
    }
    const obj = PRIMARY[run.objectiveFor(x.district)];
    const reward = x.objectiveDone && obj ? obj.boon.text : null;
    rows.push(el(`div.sum-row${x.objectiveDone ? '.ok' : '.no'}`, {}, el('span.sum-k.amber', 'Goal'),
      el('div', {}, el('b', `${x.objectiveDone ? '✓' : '✗'} ${obj ? obj.name : 'Goal'}`),
        x.objectiveDone ? null : el('span.small.muted', '  · not done'))));
    // Rewards for tonight: the goal's, plus bonus tasks / events (the same list night prep shows).
    const rewards = (x.boons || []).filter((b) => b !== reward);
    if (reward || rewards.length) {
      rows.push(el('div.sum-row', {}, el('span.sum-k.good', 'Reward'),
        el('div', {}, [reward, ...rewards].filter(Boolean).map((b) => el('div', {}, el('span.good', '▲ '), b)))));
    }
    const extras = [...(x.optionals || []).map((o) => o.name || OPTIONAL[o.key]?.name || o.key), ...(x.events || []).map((e) => EVENTS[e.key]?.name || e.key)];
    if (extras.length) rows.push(el('div.sum-row', {}, el('span.sum-k', 'Bonus'), el('span', extras.map((n) => `✓ ${n}`).join('   '))));
    const t = run.tonight || {};
    if (t.threat) rows.push(el('div.sum-row', {}, el('span.sum-k.bad', 'Danger'), el('span.sum-danger', t.threat.text)));
    const pts = x.skillPointsEarned || 0;
    if (pts) rows.push(el('div.sum-row', {}, el('span.sum-k.amber', 'Skill'), el('span', `+${pts} skill point${pts === 1 ? '' : 's'}: pick a skill below`)));
    if (extracted && carried.intel) rows.push(el('div.sum-row', {}, el('span.sum-k', 'Intel'), el('span.muted', 'Spend it tonight, before the attack (night prep, under the wave list).')));
    const earned = (x.research || []).reduce((n, r) => n + r.amount, 0);
    const resTip = (x.research || []).map((r) => `+${r.amount}  ${r.reason}`).join('\n');
    const card = el('div.panel.ui-block.sum-card', {}, rows,
      earned ? el('div.sum-research.small.muted', { title: resTip }, `+${earned} Research (kept forever: spend it on new gear in Collection, from the title screen)`) : null);

    // Skill pick / skills owned.
    let skillArea = null;
    if (run.skillPoints > 0 && !this.pickerHidden) {
      this.picker.refresh();
      skillArea = el('div.panel.ui-block.sum-skills', {}, this.picker.node);
    } else if (run.skills.length || run.skillPoints > 0) {
      skillArea = el('div.panel.ui-block.sum-skills.compact', {},
        el('div.row', {},
          el('b', 'Skills'),
          run.skills.length ? el('div.skill-tags', {}, run.skills.map(skillTag)) : el('span.small.muted', 'None yet.'),
          el('span.grow'),
          run.skillPoints > 0 ? el('span.small.amber', `${run.skillPoints} point${run.skillPoints === 1 ? '' : 's'} saved`) : null,
          run.skillPoints > 0 ? sbtn(game, 'Spend now', () => { this.pickerHidden = false; this.render(); }, { cls: 'spend-btn', hotkey: 'P' }) : null));
    }

    const foot = el('div.row.scr-foot', {},
      el('div.status-wrap', {}, runStatus(game, run)),
      el('span.grow'),
      this.continueBtn());

    this.root.append(...[el('div.scr-dim'), head, el('div.sum-body.one', {}, card), skillArea, foot].filter(Boolean));
  }

  continueBtn() {
    return sbtn(this.game, el('span', {}, 'Prepare for the night ', el('span.arrow', '▶')), () => this.next(), { cls: 'primary continue-btn', hotkey: 'Enter', sfx: 'done' });
  }

  next() {
    const game = this.game;
    if (game.scene !== this) return;
    game.go('defense');
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
