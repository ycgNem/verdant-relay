// Briefing: the start of each day. Night N of 6, Relay / player health, resources, skills (spend points
// here too), and the choice between two districts with tonight's threat and today's objective.
// Begin Expedition → run.chooseDistrict(k) → explore.

import '../ui/screens.css';
import { el, bar, resRow, toast, resIcon } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, WEAPONS, WEAPON_ALIAS } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { worldForRun, compass } from '../world/JungleGen.js';
import { PRIMARY } from '../data/objectives.js';
import { MENU_INPUT } from '../data/hud.js';
import { WORDS } from '../data/guide.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { WAVES } from '../data/waves.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { KeyNav, Bag, ask, sbtn, overlay, iconEl, skillTag, skillPicker } from '../ui/screensKit.js';

/** Health bars + resources strip shared by Briefing and Summary. Zero currencies and an empty med-kit slot stay hidden. */
export function runStatus(game, run) {
  const relay = bar('hp-bar', run.relayHp / run.relayMax > 0.3 ? 'var(--accent)' : 'var(--danger)');
  relay.set(run.relayHp / run.relayMax, `${Math.ceil(run.relayHp)} / ${run.relayMax}`);
  const you = bar('hp-bar', run.playerHp / CONFIG.player.hp > 0.3 ? 'var(--good)' : 'var(--danger)');
  you.set(run.playerHp / CONFIG.player.hp, `${Math.ceil(run.playerHp)} / ${CONFIG.player.hp}`);
  return el('div.status-strip', {},
    el('div.stat-bar', { title: 'The Relay is your base. Enemies attack it every night; the run ends if it falls.' }, el('span.small.muted', 'Relay (your base)'), relay.node),
    el('div.stat-bar', {}, el('span.small.muted', 'Your health'), you.node),
    run.meds > 0 ? el('div.stat-meds', { title: `Med kits heal ${CONFIG.player.medHeal} (Q in the jungle). Carry up to ${CONFIG.player.maxMeds}.` },
      el('span.small.muted', 'Med kits'), el('b.med', {}, resIcon('pick_med'), ` ${run.meds}/${CONFIG.player.maxMeds}`)) : null,
    el('div.stat-res', {}, el('span.small.muted', WORDS.stored), resRow(run.res)));
}

/** Night pips: ● survived, ◆ tonight, ○ ahead; the last one is the boss night (skull). */
export function nightPips(night) {
  return el('div.pips', { title: `Night ${night} of ${CONFIG.nights}. Survive night ${CONFIG.nights} (the boss) to win.` }, Array.from({ length: CONFIG.nights }, (_, i) => {
    const n = i + 1;
    const cls = n < night ? 'done' : n === night ? 'now' : 'ahead';
    return el(`span.pip.${cls}${n === CONFIG.nights ? '.boss' : ''}`, { title: n === CONFIG.nights ? `Night ${n}: final night, the boss` : `Night ${n}` });
  }), el('span.pip-skull', { title: `Night ${CONFIG.nights}: the boss` }, '☠'));
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
    if (this.choices.length === 1) this.selected = this.choices[0];   // the guided night: nothing to choose yet

    this.backdrop = new MenuBackdrop(game, { mood: 'day', angle: 1.6, speed: 0.025, radius: 19, height: 12 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
    game.music?.play('day');

    this.root = el('div.screen.scr.briefing-screen');
    this._guardInput(this.root);
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

    // One-time hint, placed where it covers nothing: on the guided night in the empty slot beside the
    // single card, otherwise under the (short) cards.
    this.bag.timeout(() => {
      if (game.scene !== this) return;
      if (this.choices.length === 1) {
        showHint(game, 'briefing_guided',
          'This is today\'s trip. Do the <b>goal</b>, open crates for <b>Scrap</b>, then come home. Tonight enemies attack your base, the <b style="color:#2ce8f5">Relay</b>: the Scrap you bring back builds its towers.',
          { style: this._hintSpot(), time: 16 });
      } else {
        showHint(game, 'briefing_districts',
          'Pick where to go today. Finish an area\'s <b>goal</b> for a <b style="color:#63c74d">reward</b> tonight; every area also adds its <b style="color:#ff6b6b">danger</b> to tonight\'s attack.',
          { style: this._hintSpot(), time: 14 });
      }
    }, 500);
  }

  /**
   * Click-through guard: the click that dismissed the previous screen (the "Night survived" banner)
   * must not pick a district. Pointer input is ignored for MENU_INPUT.briefingGuard s after entering,
   * and a card only takes a mouse click whose pointerdown also landed on that card.
   */
  _guardInput(root) {
    this.enteredAt = performance.now();
    this.downCard = null;
    const early = () => performance.now() - this.enteredAt < MENU_INPUT.briefingGuard * 1000;
    const swallow = (e) => { if (e.isTrusted && early()) { e.stopPropagation(); e.preventDefault(); } };
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerup']) root.addEventListener(type, swallow, true);
    root.addEventListener('pointerdown', (e) => {
      if (e.isTrusted && early()) { e.stopPropagation(); e.preventDefault(); this.downCard = null; return; }
      this.downCard = e.target.closest?.('.district-card')?.dataset.key || null;
    }, true);
  }

  /** A real mouse click on card k (not a keyboard/synthetic one) counts only if it was pressed on k. */
  _cardClickOk(e, k) {
    if (!e.isTrusted || e.detail === 0) return true;   // KeyNav's .click() / keyboard activation
    return this.downCard === k;
  }

  /** Free space next to (one card) or under (two cards) the district cards: close to them, covering nothing. */
  _hintSpot() {
    const cards = [...this.game.ui.querySelectorAll('.district-card')];
    if (!cards.length) return null;
    const ui = this.game.ui.getBoundingClientRect();
    const grid = this.game.ui.querySelector('.district-cards').getBoundingClientRect();
    const r = cards[0].getBoundingClientRect();
    if (cards.length === 1) {
      const left = r.right - ui.left + 14;
      return { left: `${left}px`, top: `${r.top - ui.top}px`, maxWidth: `${grid.right - ui.left - left}px` };
    }
    const bottom = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom));
    return { left: `${grid.left - ui.left}px`, top: `${bottom - ui.top + 12}px`, maxWidth: `${grid.width}px` };
  }

  render() {
    const game = this.game;
    const run = game.run;
    this.root.innerHTML = '';
    const isBoss = run.night >= CONFIG.nights;
    const guided = this.choices.length === 1;

    // Header: night, pips, status.
    const head = el('div.scr-head.panel.ui-block.brief-head', {},
      el('div.night-block', {},
        el('div.night-label', {}, 'NIGHT ', el('b', String(run.night)), el('span.muted', ` / ${CONFIG.nights}`)),
        nightPips(run.night)),
      runStatus(game, run));

    const warn = isBoss
      ? el('div.boss-warn.ui-block', {}, el('b', '⚠ FINAL NIGHT'), ' The ', el('b', DEFENSE_ENEMIES.colossus.name), ' leads tonight\'s attack. Bring back everything you can.')
      : run.night === CONFIG.nights - 1
        ? el('div.boss-warn.soft.ui-block', {}, el('b', 'Tomorrow night: '), `the ${DEFENSE_ENEMIES.colossus.name}. Start preparing.`)
        : null;

    // District cards: three lines each (goal + its reward, danger tonight); the rest behind "Details".
    const cards = this.choices.map((k, i) => this.districtCard(k, i, guided));
    const main = el('div.brief-main', {},
      el('div.choose-head', {}, el('h2', guided ? 'Today\'s trip' : 'Where to today?'),
        el('span.small.muted', guided ? 'More areas open tomorrow' : 'Click a card or press 1 / 2')),
      el(`div.district-cards${guided ? '.one' : ''}`, {}, cards));

    // Side panel: tonight's attack first; towers, skills and the weapon only once there is something to say.
    const weapon = WEAPONS[WEAPON_ALIAS[run.weapon] || run.weapon];
    const spend = run.skillPoints > 0
      ? el('div.points-box', {},
        el('div', {}, el('b.amber', `${run.skillPoints}`), run.skillPoints === 1 ? ' unspent skill point' : ' unspent skill points'),
        sbtn(game, 'Spend points', () => this.openSkills(), { cls: 'primary', hotkey: 'P' }))
      : null;
    const side = el('div.side.panel.ui-block', {},
      el('h3', 'Tonight\'s attack'),
      wavePreview(game, run.night),
      this.selected
        ? el('div.small', {}, el('span.bad', 'Plus: '), run.threatFor(this.selected).short || run.threatFor(this.selected).text)
        : el('div.small.muted', 'Plus the danger from the area you pick. Hover an icon for its name.'),
      run.towers.length ? el('div.small', {}, el('span.muted', 'Towers at your base: '), el('b', String(run.towers.length))) : null,
      run.weapon !== 'machete' && weapon ? el('div.small', {}, el('span.muted', 'Weapon: '), el('b', weapon.name)) : null,
      run.skills.length || run.skillPoints ? el('h3', 'Skills') : null,
      run.skills.length ? el('div.skill-tags', {}, run.skills.map(skillTag)) : null,
      spend);

    const beginReason = 'Pick an area first (1 / 2)';
    const begin = sbtn(game, el('span', {}, 'Head out ', el('span.arrow', '▶')), () => this.begin(), {
      cls: 'primary big begin-btn', hotkey: 'Enter', disabled: !this.selected, reason: beginReason, sfx: null,
    });
    const foot = el('div.row.scr-foot', {},
      sbtn(game, 'Menu', () => this.pause(), { cls: 'menu-btn-sm', hotkey: 'Esc' }),
      el('span.grow'),
      this.selected ? el('span.small', {}, el('span.muted', 'Heading to '), el('b', DISTRICTS[this.selected].name)) : el('span.small.muted', beginReason),
      begin);

    this.root.append(...[el('div.scr-dim'), head, warn, el('div.brief-body', {}, main, side), foot].filter(Boolean));
  }

  districtCard(k, i, guided = false) {
    const game = this.game;
    const run = game.run;
    const d = DISTRICTS[k];
    const threat = run.threatFor(k);
    const obj = PRIMARY[run.objectiveFor(k)];
    const enemyKeys = Object.keys(d.enemies || {});
    const where = this.whereText(k);
    // Everything else (where, finds, creatures, the long reward/danger text) is in the tooltip and behind "Details".
    const tip = [d.env, where && `Where: ${where}`, `Finds: ${d.bonusText}`, `Creatures: ${d.enemyNote}`,
      `Reward: ${obj.boon.text}`, `Danger tonight: ${threat.text}`].filter(Boolean).join('\n');
    const more = el('span.dc-more', {
      role: 'button',
      // The hint sits under the short cards: close it so the opened details are never covered.
      onclick: (e) => { e.stopPropagation(); this.details = !this.details; game.sfx.play('open'); game.ui.querySelector('.hint')?.remove(); this.render(); },
    }, this.details ? 'Less ▴' : 'Details ▾');
    const card = el(`button.btn.district-card${this.selected === k ? '.selected' : ''}`, {
      style: { '--c': d.look.floorAlt, '--c2': d.look.floor },
      'data-key': k,
      title: tip,
      onclick: (e) => { e.stopPropagation(); if (this._cardClickOk(e, k)) this.select(k, false); },
      ondblclick: (e) => { e.stopPropagation(); if (this._cardClickOk(e, k)) { this.select(k, false); this.begin(); } },
    },
    el('div.dc-stripe', {}, guided ? null : el('span.dc-num', String(i + 1)), el('span.dc-name', d.name), el('span.grow'), more),
    el('div.dc-body', {},
      el('div.dc-line.dc-obj', {}, el('span.dc-k.amber', 'Goal'), el('span', {}, el('b', obj.name),
        el('div.small.dc-reward', {}, el('span.good', '▲ Reward: '), obj.boon.short || obj.boon.text))),
      el('div.dc-line.dc-threat', {}, el('span.dc-k.bad', 'Danger'), el('span', threat.short || threat.text)),
      this.details ? el('div.dc-details', {},
        el('div.dc-env', d.env),
        where ? el('div.dc-line', {}, el('span.dc-k', 'Where'), el('span', where)) : null,
        el('div.dc-line', {}, el('span.dc-k.good', 'Finds'), el('span', d.bonusText)),
        el('div.dc-line', {}, el('span.dc-k', 'Creatures'), el('span', {}, el('span.dc-icons', enemyKeys.map((ek) => iconEl(game, ek, 18))), ' ', d.enemyNote))) : null));
    return card;
  }

  /** Where the district lies in the jungle: direction and rough distance from the Relay. */
  whereText(k) {
    const run = this.game.run;
    const data = worldForRun(this.game, run, DISTRICT_KEYS);
    const ri = DISTRICT_KEYS.indexOf(k);
    const sites = data.sites.filter((s) => s.region === ri && s.type !== 'pylon');
    if (!sites.length) return null;
    const c = data.center;
    const mx = sites.reduce((a, s) => a + s.x, 0) / sites.length, mz = sites.reduce((a, s) => a + s.z, 0) / sites.length;
    const d = Math.round(Math.hypot(mx - c.x, mz - c.z) / 10) * 10;
    const pylon = data.pylons.find((p) => p.region === ri);
    const on = pylon && (run.world?.pylons || []).includes(pylon.id);
    return `${compass(mx - c.x, mz - c.z)} of the Relay, ~${d} m${on ? ` · your ${WORDS.pylon} there is on` : ''}`;
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
    if (!this.selected) { game.sfx.play('error'); toast(game.ui, 'Pick an area first (1 / 2)', 'bad', 1.8); return; }
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
