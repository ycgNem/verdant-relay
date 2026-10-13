// Briefing: the start of each day. Night N of 6, Relay / player health, resources, skills (spend points
// here too), and the choice between two districts with tonight's threat and today's objective.
// Begin Expedition → run.chooseDistrict(k) → explore.

import '../ui/screens.css';
import { el, bar, resRow, toast, resIcon } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, WEAPONS } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { PRIMARY } from '../data/objectives.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { WAVES } from '../data/waves.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { KeyNav, Bag, ask, sbtn, overlay, iconEl, skillTag, skillPicker, researchChip } from '../ui/screensKit.js';

/** Health bars + resources strip shared by Briefing and Summary. */
export function runStatus(game, run) {
  const relay = bar('hp-bar', run.relayHp / run.relayMax > 0.3 ? 'var(--accent)' : 'var(--danger)');
  relay.set(run.relayHp / run.relayMax, `${Math.ceil(run.relayHp)} / ${run.relayMax}`);
  const you = bar('hp-bar', run.playerHp / CONFIG.player.hp > 0.3 ? 'var(--good)' : 'var(--danger)');
  you.set(run.playerHp / CONFIG.player.hp, `${Math.ceil(run.playerHp)} / ${CONFIG.player.hp}`);
  return el('div.status-strip', {},
    el('div.stat-bar', {}, el('span.small.muted', 'Relay Core'), relay.node),
    el('div.stat-bar', {}, el('span.small.muted', 'Your health'), you.node),
    el('div.stat-meds', { title: `Med kits heal ${CONFIG.player.medHeal}. Carry up to ${CONFIG.player.maxMeds}.` },
      el('span.small.muted', 'Med kits'), el('b.med', {}, resIcon('pick_med'), ` ${run.meds}/${CONFIG.player.maxMeds}`)),
    el('div.stat-res', {}, el('span.small.muted', 'Banked resources'), resRow(run.res)));
}

/** Night pips: ● survived, ◆ tonight, ○ ahead (boss night marked). */
export function nightPips(night) {
  return el('div.pips', { title: `Night ${night} of ${CONFIG.nights}` }, Array.from({ length: CONFIG.nights }, (_, i) => {
    const n = i + 1;
    const cls = n < night ? 'done' : n === night ? 'now' : 'ahead';
    return el(`span.pip.${cls}${n === CONFIG.nights ? '.boss' : ''}`, { title: n === CONFIG.nights ? 'Boss night' : `Night ${n}` });
  }));
}

/** Tonight's base wave as icons + counts. */
function wavePreview(game, night) {
  const groups = WAVES[night - 1] || [];
  const counts = {};
  for (const g of groups) counts[g.type] = (counts[g.type] || 0) + g.count;
  // New types (not in any earlier night) get a NEW tag; the boss chip is labelled.
  const isNew = (k) => night > 1 && !WAVES.slice(0, night - 1).some((w) => w.some((g) => g.type === k));
  return el('div.wave-mini', {}, Object.entries(counts).map(([k, n]) => {
    const d = DEFENSE_ENEMIES[k];
    const fresh = isNew(k);
    return el(`span.wave-chip${d?.boss ? '.boss' : ''}${fresh ? '.new' : ''}`, { title: `${d?.name || k} (${d?.role || ''})${fresh ? ' — new tonight' : ''}${d?.note ? ' · ' + d.note : ''}` },
      iconEl(game, k, d?.boss ? 32 : 20), el('b', `×${n}`),
      d?.boss ? el('span.wave-lbl', d.name.replace(/^Canopy /, '')) : fresh ? el('span.wave-new', 'NEW') : null);
  }));
}

export class BriefingScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
    this.selected = null;
  }

  enter() {
    const game = this.game;
    const run = game.run;
    if (!run) { game.go('title'); return; }
    run.district = null;
    run.save('briefing');
    this.choices = run.districtChoices();

    this.backdrop = new MenuBackdrop(game, { mood: 'day', angle: 1.6, speed: 0.025, radius: 19, height: 12 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    game.music?.play('day');

    this.root = el('div.screen.scr.briefing-screen');
    game.ui.append(this.root);
    this.render();

    this.nav = this.bag.add(new KeyNav(game, {
      items: () => [...this.root.querySelectorAll('.district-card, .side .btn, .begin-btn, .menu-btn-sm')],
      onEscape: () => this.pause(),
      onEnter: () => this.begin(),
      onKey: (e) => {
        if (e.code === 'Digit1' || e.code === 'Numpad1') { this.select(this.choices[0], true); return true; }
        if (e.code === 'Digit2' || e.code === 'Numpad2') { this.select(this.choices[1], true); return true; }
        if (e.code === 'KeyP' && run.skillPoints > 0) { this.openSkills(); return true; }
        return false;
      },
    }));

    this.bag.timeout(() => {
      if (game.scene !== this) return;
      showHint(game, 'briefing_districts',
        'Pick a <b>district</b> for today\'s expedition. Its <b>bonus</b> boosts what you find, but it also adds a <b>threat</b> to tonight\'s wave. Finish the <b>objective</b> for a skill point and a boon for the night.',
        { pos: 'bottom-right', style: this._hintSpot(), time: 14 });
    }, 500);
  }

  /** The empty lower part of district card 1: close to what the hint explains, covering nothing. */
  _hintSpot() {
    const card = this.game.ui.querySelector('.district-card');
    if (!card) return null;
    const ui = this.game.ui.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    return { left: `${r.left - ui.left + 12}px`, bottom: `${ui.bottom - r.bottom + 12}px`, maxWidth: `${r.width - 24}px` };
  }

  render() {
    const game = this.game;
    const run = game.run;
    const meta = game.meta;
    this.root.innerHTML = '';
    const isBoss = run.night >= CONFIG.nights;

    // Header: night, pips, status.
    const head = el('div.scr-head.panel.ui-block.brief-head', {},
      el('div.night-block', {},
        el('div.night-label', {}, 'NIGHT ', el('b', String(run.night)), el('span.muted', ` / ${CONFIG.nights}`)),
        nightPips(run.night)),
      runStatus(game, run));

    const warn = isBoss
      ? el('div.boss-warn.ui-block', {}, el('b', '⚠ FINAL NIGHT'), ' The ', el('b', DEFENSE_ENEMIES.colossus.name), ' leads tonight\'s siege. Bring back everything you can.')
      : run.night === CONFIG.nights - 1
        ? el('div.boss-warn.soft.ui-block', {}, el('b', 'Tomorrow night: '), `the ${DEFENSE_ENEMIES.colossus.name}. Start preparing.`)
        : null;

    // District cards.
    const cards = this.choices.map((k, i) => this.districtCard(k, i));
    const lockedNote = run.night < (DISTRICTS.data_center.minNight || 1)
      ? el('div.small.muted.center-note', `${DISTRICTS.data_center.name} opens from Night ${DISTRICTS.data_center.minNight}.`)
      : null;
    const main = el('div.brief-main', {},
      el('div.choose-head', {}, el('h2', 'Choose today\'s district'), el('span.small.muted', 'Click a card or press 1 / 2')),
      el('div.district-cards', {}, cards),
      lockedNote);

    // Side panel: loadout, skills, tonight's base wave.
    const skills = run.skills.length ? el('div.skill-tags', {}, run.skills.map(skillTag)) : el('div.small.muted', 'No skills yet. Objectives earn skill points.');
    const spend = run.skillPoints > 0
      ? el('div.points-box', {},
        el('div', {}, el('b.amber', `${run.skillPoints}`), run.skillPoints === 1 ? ' unspent skill point' : ' unspent skill points'),
        sbtn(game, 'Spend points', () => this.openSkills(), { cls: 'primary', hotkey: 'P' }))
      : null;
    const side = el('div.side.panel.ui-block', {},
      el('h3', 'Loadout'),
      el('div.small', {}, el('span.muted', 'Weapon: '), el('b', WEAPONS[run.weapon]?.name || run.weapon), el('span.muted', ' · Pulse Cutter')),
      el('div.small', {}, el('span.muted', 'Towers standing: '), el('b', String(run.towers.length))),
      el('h3', `Skills · ${run.skills.length}`),
      skills,
      spend,
      el('h3', `Night ${run.night} wave`),
      wavePreview(game, run.night),
      this.selected
        ? el('div.small', {}, el('span.bad', 'Plus: '), run.threatFor(this.selected).text)
        : el('div.small.muted', 'Plus the threat from the district you choose. Hover an icon for its name.'),
      el('div.side-research.small', {}, el('span.muted', 'Research Data '), researchChip(meta.research, { noLabel: true })));

    const beginReason = 'Pick a district first (1 / 2)';
    const begin = sbtn(game, el('span', {}, 'Begin Expedition ', el('span.arrow', '▶')), () => this.begin(), {
      cls: 'primary big begin-btn', hotkey: 'Enter', disabled: !this.selected, reason: beginReason, sfx: null,
    });
    const foot = el('div.row.scr-foot', {},
      sbtn(game, 'Menu', () => this.pause(), { cls: 'menu-btn-sm', hotkey: 'Esc' }),
      el('span.small.muted', run.skillPoints > 0 ? 'You can also spend skill points after the expedition.' : ''),
      el('span.grow'),
      this.selected ? el('span.small', {}, el('span.muted', 'Heading to '), el('b', DISTRICTS[this.selected].name)) : el('span.small.muted', beginReason),
      begin);

    this.root.append(...[el('div.scr-dim'), head, warn, el('div.brief-body', {}, main, side), foot].filter(Boolean));
  }

  districtCard(k, i) {
    const game = this.game;
    const run = game.run;
    const d = DISTRICTS[k];
    const threat = run.threatFor(k);
    const objKey = run.objectiveFor(k);
    const obj = PRIMARY[objKey];
    const firstVisit = !game.meta.discovered.includes(k);
    const enemyKeys = Object.keys(d.enemies || {});
    const card = el(`button.btn.district-card${this.selected === k ? '.selected' : ''}`, {
      style: { '--c': d.look.floorAlt, '--c2': d.look.floor },
      onclick: (e) => { e.stopPropagation(); this.select(k, false); },
      ondblclick: (e) => { e.stopPropagation(); this.select(k, false); this.begin(); },
    },
    el('div.dc-stripe', {}, el('span.dc-num', String(i + 1)), el('span.dc-name', d.name)),
    firstVisit ? el('div.dc-first', { title: 'Research Data for your first visit' }, `★ First visit: +${CONFIG.research.newDistrict} Research Data`) : null,
    el('div.dc-body', {},
      el('div.dc-env', d.env),
      el('div.dc-line', {}, el('span.dc-k.good', 'Bonus'), el('span', d.bonusText)),
      el('div.dc-line', {}, el('span.dc-k', 'Enemies'), el('span', {}, el('span.dc-icons', enemyKeys.map((ek) => iconEl(game, ek, 18))), ' ', d.enemyNote)),
      el('div.dc-line.dc-obj', {}, el('span.dc-k.accent', 'Objective'), el('span', {}, el('b', obj.name), el('div.small.muted', {}, 'Boon: ', obj.boon.text))),
      el('div.dc-line.dc-threat', {}, el('span.dc-k.bad', 'Tonight'), el('span', threat.text))));
    return card;
  }

  select(k, fromKey) {
    if (!k) return;
    const changed = this.selected !== k;
    this.selected = k;
    this.game.sfx.play(changed ? 'pickup' : 'open');
    this.render();
    if (fromKey || this.nav?.cur) {
      const b = this.root.querySelector('.begin-btn');
      if (b) { this.nav.clear(); this.nav.cur = b; b.classList.add('kfocus'); }
    }
  }

  begin() {
    const game = this.game;
    if (!this.selected) { game.sfx.play('error'); toast(game.ui, 'Pick a district first (1 / 2)', 'bad', 1.8); return; }
    if (game.ui.querySelector('.overlay')) return;
    game.sfx.play('done');
    const k = this.selected;
    game.run.chooseDistrict(k);
    game.go('explore', { district: k });
  }

  openSkills() {
    const game = this.game;
    const run = game.run;
    if (run.skillPoints <= 0) return;
    let close = null;
    const done = () => { nav.dispose(); close(); game.run.save('briefing'); this.render(); };
    const picker = skillPicker(game, {
      onChange: () => {
        game.run.save('briefing');
        if (game.run.skillPoints <= 0) done();
      },
      onSave: () => done(),
      saveLabel: 'Keep points for later',
    });
    const box = el('div.panel.ui-block.skill-modal', {}, el('h2', 'Spend skill points'), picker.node);
    const o = overlay(game, box, { clickOutside: () => done() });
    close = o.close;
    const nav = new KeyNav(game, {
      layer: o.ov,
      items: () => [...box.querySelectorAll('.btn')],
      onEscape: () => done(),
      onKey: (e) => picker.handleKey(e),
    });
  }

  pause() {
    const game = this.game;
    if (game.ui.querySelector('.overlay')) return;
    game.sfx.play('open');
    let nav = null;
    const close = () => { nav?.dispose(); o.close(); };
    const resume = sbtn(game, 'Resume', () => close(), { cls: 'primary', hotkey: 'Esc' });
    const settings = sbtn(game, 'Settings', () => { close(); openSettingsOverlay(game, { onClose: () => this.pause() }); });
    const quit = sbtn(game, 'Save & quit to title', () => { close(); game.run.save('briefing'); game.go('title'); });
    const abandon = sbtn(game, 'Abandon run', async () => {
      const ok = await ask(game, {
        title: 'Abandon this run?',
        text: 'The run ends now as a defeat. Research you earned is kept.',
        confirm: 'Abandon run', cancel: 'Keep playing', danger: true, defaultCancel: true,
      });
      if (!ok || game.scene !== this) return;
      close();
      const result = game.run.finish(game, false);
      game.go('results', { result });
    }, { cls: 'danger' });
    const box = el('div.panel.ui-block.pause-box', {},
      el('h2', 'Paused'),
      el('div.small.muted', `Night ${game.run.night} briefing. Your run is saved here.`),
      el('div.col.pause-col', {}, resume, settings, quit, abandon));
    const o = overlay(game, box, { clickOutside: () => close() });
    nav = new KeyNav(game, { layer: o.ov, items: () => [resume, settings, quit, abandon], onEscape: () => close(), start: 0 });
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}
