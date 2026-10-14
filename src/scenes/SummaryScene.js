// Summary: after a day's trip. One card (simplicity pass): what you got (or lost), the goal and tonight's
// reward (lost if you didn't get home), bonus tasks, tonight's danger, tomorrow's health after a bad day,
// research in one line; then the skill pick. Continue → the Workbench step (camp crafting, src/ui/workbench.js;
// only when something can be made, never on the guided first night) → night prep.
// Works when the player died (nothing banked) or the record is missing. The run is saved here ('summary'),
// so Continue comes back to this screen (crafts save it too).

import '../ui/screens.css';
import '../ui/meta.css';
import { el, resIcon } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, RESOURCES, RESOURCE_KEYS } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, EVENTS } from '../data/objectives.js';
import { BOSSES } from '../data/bosses.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { runStatus, nightPips, skillRerollBtn } from './BriefingScene.js';
import { KeyNav, Bag, sbtn, skillPicker, skillTag } from '../ui/screensKit.js';
import { workbenchView, showBench } from '../ui/workbench.js';
import { WORKBENCH } from '../data/crafting.js';
import { relicCard, relicTag } from '../ui/relics.js';
import { relicLive } from '../data/relics.js';

export class SummaryScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
    this.pickerHidden = false;
    this.step = 'summary';       // 'summary' → 'bench' (the Workbench) → night prep
  }

  enter() {
    const game = this.game;
    const run = game.run;
    if (!run) { game.go('title'); return; }
    const x = (this.rec = run.lastExpedition);
    const good = !x || x.extracted;
    this.step = 'summary';
    if (run.district) run.save('summary');   // a safe point: Continue returns here (skill pick, then night prep)

    this.backdrop = new MenuBackdrop(game, { mood: good ? 'dusk' : 'night', angle: 3.4, speed: 0.025, radius: 13, height: 7.5 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play('day');
    game.sfx.play(good ? 'summary_good' : 'summary_bad');

    this.root = el('div.screen.scr.summary-screen');
    game.ui.append(this.root);
    this.picker = skillPicker(game, {
      onChange: () => { if (run.district) run.save('summary'); this.render(); },
      onSave: () => { this.pickerHidden = true; this.render(); },
    });
    this.bench = workbenchView(game, { onCraft: () => { if (run.district) run.save('summary'); this.render(); } });
    this.render();

    this.nav = this.bag.add(new KeyNav(game, {
      items: () => [...this.root.querySelectorAll('.skill-card, .save-pt, .reroll-btn, .spend-btn, .wb-craft, .back-btn, .continue-btn')],
      onEnter: () => this.next(),
      onEscape: () => { if (this.step === 'bench') this.back(); },
      onKey: (e) => {
        if (this.step === 'bench') {
          const m = /^Digit([1-9])$|^Numpad([1-9])$/.exec(e.code);
          if (m) { this.bench.craftIndex(Number(m[1] || m[2]) - 1); return true; }
          return false;
        }
        const rb = this.root.querySelector('.reroll-btn');
        if (e.code === 'KeyR' && rb && !this.pickerHidden && !rb.classList.contains('disabled')) { rb.click(); return true; }
        if (!this.pickerHidden && this.picker.handleKey(e)) return true;
        if (e.code === 'KeyP' && this.pickerHidden && run.skillPoints > 0) { this.pickerHidden = false; this.render(); return true; }
        return false;
      },
    }));

    if (run.skillPoints > 0) {
      this.bag.timeout(() => {
        if (game.scene !== this || this.step !== 'summary') return;
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
    if (this.step === 'bench') { this.renderBench(); return; }

    if (!x) {
      this.root.append(el('div.panel.ui-block.summary-empty', {}, el('h2', 'Back at base'), el('p.muted', 'Nothing to report. Get ready for the night.')),
        el('div.row.scr-foot', {}, el('span.grow'), this.continueBtn()));
      return;
    }

    const d = DISTRICTS[x.district] || { name: x.district || 'Unknown area' };
    const extracted = !!x.extracted;
    const headline = extracted ? 'BACK HOME SAFE' : x.died ? 'YOU WENT DOWN' : 'TRIP ABANDONED';
    const salvaged = (!extracted && x.salvaged && RESOURCE_KEYS.some((k) => x.salvaged[k] > 0)) ? x.salvaged : null;
    const sub = extracted
      ? 'Everything you carried is stored at base.'
      : x.closed
        ? 'The game closed during the trip, so it counts as abandoned. Your towers and stored resources are safe.'
        : salvaged
          ? 'Most of what you carried is lost, but the drone saved some of it. Your towers and stored resources are safe.'
          : 'What you carried is lost. Your towers and stored resources are safe.';

    const head = el(`div.scr-head.panel.ui-block.sum-head${extracted ? '.ok' : '.fail'}`, {},
      el('div', {}, el('div.headline', headline), el('div.small.muted', {}, `${d.name} · Night ${run.night}`, x.kills ? ` · ${x.kills} kill${x.kills === 1 ? '' : 's'}` : '')),
      el('div.small.sum-sub', sub),
      el('span.grow'),
      nightPips(run.night, run));

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
    // Relics (src/data/relics.js): brought home = working from now on (with the live line); lost if you went down.
    if (x.relicsFound?.length) {
      rows.push(el('div.sum-row', {}, el('span.sum-k.amber', 'Found'),
        el('div.sum-relics', {}, x.relicsFound.map((id) => relicCard(game, id, { size: 24, line: relicLive(id, run) })))));
    }
    if (x.relicsLost?.length) {
      rows.push(el('div.sum-row', {}, el('span.sum-k.bad', 'Lost'),
        el('div.sum-chips', {}, x.relicsLost.map((id) => relicTag(game, id, { lost: true })), el('span.small.muted', ' relics go home only with you'))));
    }
    const obj = PRIMARY[x.objective || run.objectiveFor(x.district)];
    // The goal's night reward only arrives if you got home (Run.applyExpedition: `rewardLost` otherwise).
    const reward = x.objectiveDone && obj && extracted ? obj.boon.text : null;
    rows.push(el(`div.sum-row${x.objectiveDone ? '.ok' : '.no'}`, {}, el('span.sum-k.amber', 'Goal'),
      el('div', {}, el('b', `${x.objectiveDone ? '✓' : '✗'} ${obj ? obj.name : 'Goal'}`),
        x.objectiveDone ? null : el('span.small.muted', x.objectiveFailed ? '  · failed' : '  · not done'))));
    // Rewards for tonight: the goal's, plus bonus tasks / events (the same list night prep shows).
    const rewards = (x.boons || []).filter((b) => b !== reward);
    if (reward || rewards.length) {
      rows.push(el('div.sum-row', {}, el('span.sum-k.good', 'Reward'),
        el('div', {}, [reward, ...rewards].filter(Boolean).map((b) => el('div', {}, el('span.good', '▲ '), b)))));
    }
    if (x.rewardLost) {
      rows.push(el('div.sum-row.no', {}, el('span.sum-k.bad', 'Reward'),
        el('div', {}, el('s.muted', x.rewardLost), el('div.small.bad', 'Lost: the goal\'s reward needs you to get home. Its skill point still counts.'))));
    }
    const extras = [...(x.optionals || []).map((o) => o.name || OPTIONAL[o.key]?.name || o.key), ...(x.events || []).map((e) => e.name || EVENTS[e.key]?.name || e.key)];
    if (extras.length) rows.push(el('div.sum-row', {}, el('span.sum-k', 'Bonus'), el('span', extras.map((n) => `✓ ${n}`).join('   '))));
    // Area bosses killed today (src/data/bosses.js): their area sends no danger at night for the rest of the run.
    for (const k of x.bossesKilled || []) {
      if (!BOSSES[k]) continue;
      rows.push(el('div.sum-row.ok', {}, el('span.sum-k.amber', 'Boss'), el('div', {}, el('b', `☠ ${BOSSES[k].name} killed`),
        el('div.small.muted', `${DISTRICTS[k]?.name || k} sends no danger at night for the rest of the run`))));
    }
    const t = run.tonight || {};
    if (t.threat) rows.push(el('div.sum-row', {}, el(`span.sum-k.${t.threat.cleared ? 'good' : 'bad'}`, 'Danger'), el('div', {}, el(t.threat.cleared ? 'span.good' : 'span.sum-danger', t.threat.text),   // (cleared: its area boss is dead)
      t.threat2 ? el('div.sum-danger.small', `+ ${t.threat2.text} (Restless jungle)`) : null)));
    const pts = x.skillPointsEarned || 0;
    if (pts) rows.push(el('div.sum-row', {}, el('span.sum-k.amber', 'Skill'), el('span', `+${pts} skill point${pts === 1 ? '' : 's'}: pick a skill below`)));
    if (extracted && carried.intel) rows.push(el('div.sum-row', {}, el('span.sum-k', 'Intel'), el('span.muted', 'Spend it tonight, before the attack (night prep, under the wave list).')));
    // A bad day: say what tomorrow starts with (dawn health is never lower than going home hurt).
    if (!extracted && x.dawnHp) rows.push(el('div.sum-row', {}, el('span.sum-k', 'Health'), el('span.muted', `You start tomorrow with ${x.dawnHp} health.`)));
    const earned = (x.research || []).reduce((n, r) => n + r.amount, 0);
    const resTip = (x.research || []).map((r) => `+${r.amount}  ${r.reason}`).join('\n');
    // The "where to spend it" line shows once (critic L §2.4: it nagged by day 3): the first summary with Research
    // on it, in the player's first run (meta.lifetime.runs counts the run in progress); re-renders keep it.
    const H = game.meta.hints;
    const firstSum = game.meta.lifetime.runs <= 1 && earned && (!H.sum_research || this._teachResearch);
    if (firstSum && !H.sum_research) { H.sum_research = true; this._teachResearch = true; game.saveMeta(); }
    const teach = firstSum ? ' (kept forever: spend it on new gear in Collection, from the title screen)' : ' (kept forever)';
    const card = el('div.panel.ui-block.sum-card', {}, rows,
      earned ? el('div.sum-research.small.muted', { title: resTip }, `+${earned} Research${teach}`) : null);

    // Skill pick / skills owned.
    let skillArea = null;
    if (run.skillPoints > 0 && !this.pickerHidden) {
      this.picker.refresh();
      skillArea = el('div.panel.ui-block.sum-skills', {}, this.picker.node,
        skillRerollBtn(game, this.picker, () => { if (run.district) run.save('summary'); }));
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
      el('div.status-wrap', {}, runStatus(game, run, { dawn: true })),
      el('span.grow'),
      this.continueBtn());

    this.root.append(...[el('div.scr-dim'), head, el('div.sum-body.one', {}, card), skillArea, foot].filter(Boolean));
  }

  continueBtn() {
    // Before the Workbench step the button says where it goes next.
    const toBench = this.step === 'summary' && showBench(this.game.run);
    const label = toBench ? 'Workbench ' : 'Prepare for the night ';
    return sbtn(this.game, el('span', {}, label, el('span.arrow', '▶')), () => this.next(), { cls: 'primary continue-btn', hotkey: 'Enter', sfx: toBench ? 'ui_confirm' : 'to_night' });
  }

  /**
   * The Workbench step (camp crafting): recipe cards by group, what you have vs need, a Scrap warning when a craft
   * would leave less than a tower costs. "Prepare for the night" skips it in one click; Esc goes back.
   */
  renderBench() {
    const game = this.game;
    const run = game.run;
    const first = !game.meta.hints?.workbench_seen;
    const head = el('div.scr-head.panel.ui-block.sum-head.wb-head', {},
      el('div', {}, el('div.headline', 'WORKBENCH'), el('div.small.muted', `Night ${run.night} · before the attack`)),
      el('div.small.wb-intro', first ? WORKBENCH.intro : 'Turn spare parts into gear. Skip it to keep everything for towers.'),
      el('span.grow'),
      nightPips(run.night, run));
    this.bench.refresh();
    const body = el('div.panel.ui-block.wb-panel', {}, this.bench.node);
    const foot = el('div.row.scr-foot', {},
      el('div.status-wrap', {}, runStatus(game, run, { dawn: true })),
      el('span.grow'),
      sbtn(game, el('span', {}, el('span.arrow', '◀'), ' Back'), () => this.back(), { cls: 'back-btn', hotkey: 'Esc', sfx: 'ui_back' }),
      this.continueBtn());
    this.root.append(el('div.scr-dim'), head, body, foot);
  }

  back() {
    if (this.step !== 'bench') return;
    this.step = 'summary';
    this.render();
  }

  next() {
    const game = this.game;
    if (game.scene !== this) return;
    if (this.step === 'summary' && showBench(game.run)) {
      this.step = 'bench';
      this.render();
      return;
    }
    if (this.step === 'bench' && game.meta.hints && !game.meta.hints.workbench_seen) { game.meta.hints.workbench_seen = true; game.saveMeta(); }
    game.go('defense');
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
