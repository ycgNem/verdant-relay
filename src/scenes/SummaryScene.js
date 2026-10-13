// Summary: after an expedition. What was banked (or lost), objective / optional / event outcomes, the
// boons now active tonight, research earned, and the skill pick. Continue → night prep (defense).
// Works when the player died (nothing banked) or the record is missing.

import '../ui/screens.css';
import { el, resIcon } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, RESOURCES, RESOURCE_KEYS } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, EVENTS } from '../data/objectives.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { runStatus, nightPips } from './BriefingScene.js';
import { KeyNav, Bag, sbtn, skillPicker, researchChip, skillTag } from '../ui/screensKit.js';

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
        const col = this.root.querySelector('.sum-body > :nth-child(2)');
        const ui = game.ui.getBoundingClientRect();
        const r = col?.getBoundingClientRect();
        const u = game.stage.clientWidth / 960;
        const style = r ? { left: `${r.left - ui.left + 10}px`, bottom: `${ui.bottom - r.bottom + 52 * u}px`, maxWidth: `${r.width - 20}px` } : null;
        showHint(game, 'summary_skills',
          'You have a <b>skill point</b> to spend: pick one of the cards below <b>▼</b> (number keys) or save it for later. Skills last for the rest of this run.',
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
      this.root.append(el('div.panel.ui-block.summary-empty', {}, el('h2', 'Back at the Relay'), el('p.muted', 'No expedition record. Head into the night.')),
        el('div.row.scr-foot', {}, el('span.grow'), this.continueBtn()));
      return;
    }

    const d = DISTRICTS[x.district] || { name: x.district || 'Unknown district' };
    const extracted = !!x.extracted;
    const headline = extracted ? 'EXTRACTED' : x.died ? 'YOU WENT DOWN' : 'EXPEDITION LOST';
    const salvaged = (!extracted && x.salvaged) || null;
    const sub = extracted
      ? 'Everything you carried is banked at the Relay.'
      : salvaged
        ? 'Most of what you carried is lost, but the drone salvaged a share. Towers, banked resources and research are safe.'
        : 'Everything you carried this expedition is lost. Towers, banked resources and research are safe.';

    const head = el(`div.scr-head.panel.ui-block.sum-head${extracted ? '.ok' : '.fail'}`, {},
      el('div', {}, el('div.headline', headline), el('div.small.muted', {}, `${d.name} · Night ${run.night}`, x.kills ? ` · ${x.kills} kill${x.kills === 1 ? '' : 's'}` : '')),
      el('div.small.sum-sub', sub),
      el('span.grow'),
      nightPips(run.night));

    // Loot column.
    const carried = x.carried || {};
    const lootRows = RESOURCE_KEYS.map((k) => {
      const n = Math.floor(carried[k] || 0);
      const kept = Math.floor(salvaged?.[k] || 0);
      const r = RESOURCES[k];
      return el(`div.loot-row${n ? '' : '.zero'}${extracted ? '' : '.lost'}`, { style: { '--c': r.color }, title: r.desc },
        resIcon(k), el('span.lbl', r.label), el('span.grow'),
        extracted ? el('b.good', n ? `+${n}` : '0') : el('b.bad', n ? el('s', String(n)) : '0'),
        kept ? el('b.good', ` +${kept}`) : null,
        el('span.small.muted.loot-now', extracted ? `now ${run.res[k]}` : kept ? 'salvaged' : n ? 'lost' : ''));
    });
    const anyLoot = RESOURCE_KEYS.some((k) => carried[k]);
    const loot = el('div.panel.ui-block.sum-col', {},
      el('h3', extracted ? 'Loot banked' : salvaged ? 'Loot lost (some salvaged)' : 'Loot lost'),
      lootRows,
      !anyLoot ? el('div.small.muted', 'You came back empty-handed.') : null,
      el('div.small.muted.sum-note', { title: RESOURCES.intel.desc }, 'Intel: spend it in night prep to Decrypt (+Research Data) or Sabotage the wave.'));

    // Outcomes column.
    const objKey = run.objectiveFor(x.district);
    const obj = PRIMARY[objKey];
    const outcome = [];
    outcome.push(el(`div.out-row${x.objectiveDone ? '.ok' : '.no'}`, {},
      el('span.mark', x.objectiveDone ? '✓' : '✗'),
      el('div', {}, el('b', obj ? obj.name : 'Primary objective'), el('div.small.muted', x.objectiveDone ? 'Complete: +1 skill point and a boon tonight.' : 'Not completed.'))));
    for (const o of x.optionals || []) {
      const def = OPTIONAL[o.key];
      outcome.push(el('div.out-row.ok', {}, el('span.mark', '✓'), el('div', {}, el('b', o.name || def?.name || o.key), el('div.small.muted', 'Optional objective'))));
    }
    for (const e of x.events || []) {
      const def = EVENTS[e.key];
      outcome.push(el('div.out-row.ok', {}, el('span.mark', '★'), el('div', {}, el('b', def?.name || e.key), el('div.small.muted', e.flag?.text || 'Event completed'))));
    }
    if (!(x.optionals || []).length && !(x.events || []).length) outcome.push(el('div.small.muted', 'No optional objectives or events this time.'));
    const pts = x.skillPointsEarned || 0;
    const outcomes = el('div.panel.ui-block.sum-col', {},
      el('h3', 'Expedition'),
      outcome,
      el('div.sum-note.small', {}, pts ? el('span.amber', `+${pts} skill point${pts === 1 ? '' : 's'} earned`) : el('span.muted', 'No skill points earned.')),
      el('div.status-mini.small', {},
        el('span.muted', 'Health '), el('b', `${Math.ceil(run.playerHp)}/${CONFIG.player.hp}`),
        el('span.muted', '  ·  Med kits '), el('b', `${run.meds}/${CONFIG.player.maxMeds}`)));

    // Tonight + research column.
    const t = run.tonight || {};
    const boons = (x.boons || []).map((b) => el('div.boon-row', {}, el('span.good', '▲ '), b));
    const research = (x.research || []).map((r) => el('div.res-line', {}, el('span', r.reason), el('span.grow'), el('b', `+${r.amount}`)));
    const earned = (x.research || []).reduce((s, r) => s + r.amount, 0);
    const tonight = el('div.panel.ui-block.sum-col', {},
      el('h3', 'Tonight'),
      t.threat ? el('div.threat-row', {}, el('span.bad', '▼ '), t.threat.text) : null,
      boons.length ? boons : el('div.small.muted', 'No boons active tonight.'),
      el('h3', 'Research Data'),
      research.length ? el('div.res-lines.small', {}, research) : el('div.small.muted', 'None this expedition.'),
      el('div.res-total', {}, el('span.muted', 'Earned '), el('b.amber', `+${earned}`), el('span.grow'), el('span.muted', 'Total '), researchChip(game.meta.research, { noLabel: true })));

    // Skill pick / skills owned.
    let skillArea;
    if (run.skillPoints > 0 && !this.pickerHidden) {
      this.picker.refresh();
      skillArea = el('div.panel.ui-block.sum-skills', {}, this.picker.node);
    } else {
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

    this.root.append(el('div.scr-dim'), head, el('div.sum-body', {}, loot, outcomes, tonight), skillArea, foot);
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
