// Briefing: the start of each day. Night N of 6, Relay / player health, resources, skills (spend points
// here too), and the choice between two (Scout Report: three) areas with today's goal + reward, the area's
// finds for today and its danger tonight. The side shows tonight's attack per path (the same wave builder
// night prep uses). Head out → run.chooseDistrict(k), an 'explore' snapshot → explore.

import '../ui/screens.css';
import '../ui/meta.css';
import { el, bar, resRow, toast, resIcon, costLine } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { CONFIG, WEAPONS, WEAPON_ALIAS } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { worldForRun, compass } from '../world/JungleGen.js';
import { PRIMARY } from '../data/objectives.js';
import { BOSSES } from '../data/bosses.js';
import '../ui/objectives.css';
import { MENU_INPUT } from '../data/hud.js';
import { WORDS } from '../data/guide.js';
import { JUNGLE } from '../data/jungle.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { WAVE_VARIANTS } from '../data/waves.js';
import { mapFor, laneForAngle } from '../data/defenseMap.js';
import { RESEARCH_TREE } from '../data/unlocks.js';
import { OVERGROWTH } from '../data/modes.js';
import { emptyTonight } from '../core/Run.js';
import { buildWave } from './DefenseScene.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { KeyNav, Bag, ask, sbtn, overlay, iconEl, skillTag, skillPicker } from '../ui/screensKit.js';

/**
 * Health bars + resources strip shared by Briefing and Summary. Zero currencies and an empty med-kit slot stay hidden.
 * opts.dawn (Summary): your health only matters on the next trip, so show what you wake with (Run.dawnHp).
 */
export function runStatus(game, run, opts = {}) {
  const relay = bar('hp-bar', run.relayHp / run.relayMax > 0.3 ? 'var(--accent)' : 'var(--danger)');
  relay.set(run.relayHp / run.relayMax, `${Math.ceil(run.relayHp)} / ${run.relayMax}`);
  const hp = opts.dawn && run.dawnHp ? run.dawnHp(run.playerHp) : run.playerHp;
  const you = bar('hp-bar', hp / CONFIG.player.hp > 0.3 ? 'var(--good)' : 'var(--danger)');
  you.set(hp / CONFIG.player.hp, `${Math.ceil(hp)} / ${CONFIG.player.hp}`);
  return el('div.status-strip', {},
    el('div.stat-bar', { title: 'The Relay is your base. Enemies attack it every night; the run ends if it falls.' }, el('span.small.muted', 'Relay (your base)'), relay.node),
    opts.dawn
      ? el('div.stat-bar', { title: `You heal ${CONFIG.expedition.nightlyHeal} overnight and wake with at least ${run.dawnHp(0)}.` }, el('span.small.muted', 'Health at dawn'), you.node)
      : el('div.stat-bar', {}, el('span.small.muted', 'Your health'), you.node),
    run.meds > 0 ? el('div.stat-meds', { title: `Med kits heal ${CONFIG.player.medHeal} (Q in the jungle). Carry up to ${(run.maxMeds?.() ?? CONFIG.player.maxMeds)}.` },
      el('span.small.muted', 'Med kits'), el('b.med', {}, resIcon('pick_med'), ` ${run.meds}/${(run.maxMeds?.() ?? CONFIG.player.maxMeds)}`)) : null,
    el('div.stat-res', {}, el('span.small.muted', WORDS.stored), resRow(run.res)));
}

/**
 * Night pips: ● survived, ◆ tonight, ○ ahead; the last one is the boss night (skull). A Long Night run past
 * night 6 shows all six done and a "+N" for the nights beyond.
 */
export function nightPips(night, run = null) {
  const long = !!run?.isLongNight?.();
  const past = long ? Math.max(0, night - CONFIG.nights) : 0;
  const title = long ? `Long Night: night ${night}. The run goes on until the Relay falls; a Colossus every 3rd night after night 6.`
    : `Night ${night} of ${CONFIG.nights}. Survive night ${CONFIG.nights} (the boss) to win.`;
  return el('div.pips', { title }, Array.from({ length: CONFIG.nights }, (_, i) => {
    const n = i + 1;
    const cls = n < night ? 'done' : n === night ? 'now' : 'ahead';
    return el(`span.pip.${cls}${n === CONFIG.nights ? '.boss' : ''}`, { title: n === CONFIG.nights ? `Night ${n}: ${long ? 'the Colossus' : 'final night, the boss'}` : `Night ${n}` });
  }), el('span.pip-skull', { title: `Night ${CONFIG.nights}: the boss` }, '☠'), past > 0 ? el('span.pip-more', `+${past}`) : null);
}

/**
 * Fresh Ideas (research): a "Re-roll cards" button under a skill picker, once a night. Null without the unlock.
 * `onDone` runs after a re-roll (save the run).
 */
export function skillRerollBtn(game, picker, onDone) {
  const run = game.run;
  if (!game.meta.unlocks.includes('skill_reroll') || run.skillPoints <= 0) return null;
  const b = sbtn(game, 'Re-roll cards', () => {
    if (!run.rerollSkills(game.meta)) { game.sfx.play('error'); return; }
    game.sfx.play('ui_confirm');
    picker.refresh();
    b.classList.add('disabled');
    b.title = 'Fresh Ideas: used tonight';
    onDone?.();
  }, { cls: 'small-btn reroll-btn', hotkey: 'R', sfx: null, disabled: !run.canRerollSkills(game.meta), reason: 'Fresh Ideas: once a night (used)', title: 'Fresh Ideas: deal a new set of cards (once a night)' });
  return el('div.reroll-row', {}, b);
}

/** Is this enemy type new tonight (not in any earlier night's waves, any variant)? */
const isNewType = (type, night) => night > 1 && night <= WAVE_VARIANTS.length
  && !WAVE_VARIANTS.slice(0, night - 1).some((vs) => vs.some((v) => v.groups.some((g) => g.type === type)));

/** Compass angle (radians, atan2(dz, dx)) from the Relay to an area's sites, or null. */
function areaAngle(game, run, k) {
  const data = worldForRun(game, run, DISTRICT_KEYS);
  const ri = DISTRICT_KEYS.indexOf(k);
  const sites = data.sites.filter((s) => s.region === ri && s.type !== 'pylon');
  if (!sites.length) return null;
  const c = data.center;
  const mx = sites.reduce((a, s) => a + s.x, 0) / sites.length, mz = sites.reduce((a, s) => a + s.z, 0) / sites.length;
  return Math.atan2(mz - c.z, mx - c.x);
}

/**
 * Tonight's attack per path (critic L §4: the briefing's right column), built by the same wave builder as
 * night prep: tonight's variant, plus the danger of `areaKey` (and the Overgrowth second danger) when one is
 * picked, sent down the lane facing that area. Returns null if the wave can't be built.
 */
function attackByPath(game, run, areaKey) {
  try {
    const map = mapFor(run);
    const extraGroups = [];
    let dangerLane;
    if (areaKey) {
      for (const th of [run.threatFor(areaKey), run.secondThreat?.(areaKey)]) if (th?.extraGroup) extraGroups.push(th.extraGroup);
      const a = areaAngle(game, run, areaKey);
      if (a != null && map.lanes.length > 1) dangerLane = laneForAngle(map, a);
    }
    extraGroups.push(...(run.relicExtraGroups?.() || []));   // relics' night costs (Hungry Idol's Crawlers)
    // A copy of the run with tonight's danger in place (the briefing must not change the real run).
    const probe = Object.assign(Object.create(Object.getPrototypeOf(run)), run, { tonight: { ...emptyTonight(), extraGroups } });
    const W = buildWave(probe, { lanes: map.lanes.length, dangerLane });
    return { W, lanes: map.lanes };
  } catch (e) {
    console.warn('Briefing attack preview failed:', e);
    return null;
  }
}

/** Icon chips for one path's enemies (boss labelled, new types tagged). */
function waveChips(game, run, counts) {
  return el('div.wave-mini', {}, [...counts].map(([k, n]) => {
    const d = DEFENSE_ENEMIES[k];
    const fresh = isNewType(k, run.night);
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
        const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
        if (m && this.choices[Number(m[1]) - 1]) { this.select(this.choices[Number(m[1]) - 1], true); return true; }
        if (e.code === 'KeyP' && run.skillPoints > 0) { this.openSkills(); return true; }
        if (e.code === 'KeyR' && run.canRerollAreas?.(game.meta)) { this.rerollAreas(); return true; }
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
        const n = showHint(game, 'briefing_districts',
          'Pick where to go today. Finish an area\'s <b>goal</b> for a <b style="color:#63c74d">reward</b> tonight; every area also adds its <b style="color:#ff6b6b">danger</b> to tonight\'s attack.',
          { style: this._hintSpot(), time: 14 });
        // Never over the footer (critic M: with the larger type the cards are taller and it covered "Menu").
        const foot = n && this.root.querySelector('.scr-foot');
        if (foot) {
          const over = n.getBoundingClientRect().bottom - (foot.getBoundingClientRect().top - 6 * game.u);
          if (over > 0) n.style.top = `${Math.round(parseFloat(n.style.top) - over)}px`;
        }
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
    const isBoss = run.isBossNight ? run.isBossNight() : run.night >= CONFIG.nights;
    const long = !!run.isLongNight?.();
    const guided = this.choices.length === 1;
    const keysHint = this.choices.length > 2 ? '1 / 2 / 3' : '1 / 2';

    // Header: night, pips, the run's mode (Overgrowth / Long Night / Daily, modifiers on hover), status.
    const label = run.modeLabel?.() || '';
    const mods = (run.mods || []).map((k) => OVERGROWTH.mods[k]).filter(Boolean);
    const head = el('div.scr-head.panel.ui-block.brief-head', {},
      el('div.night-block', {},
        el('div.night-label', {}, 'NIGHT ', el('b', String(run.night)), el('span.muted', long ? '' : ` / ${CONFIG.nights}`)),
        nightPips(run.night, run),
        label ? el('div.mode-tag', { title: mods.map((m) => `${m.name}: ${m.text}`).join('\n') || label }, label, mods.length ? el('span.muted', mods.length <= 3 ? `: ${mods.map((m) => m.name).join(', ')}` : ` · ${mods.length} modifiers (hover)`) : null) : null),
      runStatus(game, run));

    const colossus = DEFENSE_ENEMIES.colossus.name;
    const warn = isBoss
      ? el('div.boss-warn.ui-block', {}, el('b', long && run.night > CONFIG.nights ? '⚠ BOSS NIGHT' : long ? '⚠ THE COLOSSUS' : '⚠ FINAL NIGHT'), ' The ', el('b', colossus), long
        ? (run.night === CONFIG.nights ? ' leads tonight\'s attack. Hold the Relay and the Long Night goes on.' : ' returns tonight, stronger.')
        : ' leads tonight\'s attack. Bring back everything you can.')
      : (run.isBossNight ? run.isBossNight(run.night + 1) : run.night === CONFIG.nights - 1)
        ? el('div.boss-warn.soft.ui-block', {}, el('b', 'Tomorrow night: '), `the ${colossus}. Start preparing.`)
        : null;

    // Area cards: goal + its reward, today's finds, danger tonight; the rest behind "Details".
    const cards = this.choices.map((k, i) => this.districtCard(k, i, guided));
    const reroll = !guided && game.meta.unlocks.includes('second_look')
      ? sbtn(game, 'New areas', () => this.rerollAreas(), {
        cls: 'small-btn reroll-btn', hotkey: 'R', sfx: null, disabled: !run.canRerollAreas(game.meta),
        reason: 'Second Look: already used tonight', title: 'Second Look: swap tonight\'s areas for different ones (once a night)',
      })
      : null;
    const main = el('div.brief-main', {},
      el('div.choose-head', {}, el('h2', guided ? 'Today\'s trip' : 'Where to today?'),
        el('span.small.muted', guided ? 'More areas open tomorrow' : `Click a card or press ${keysHint}`), el('span.grow'), reroll),
      this.weatherLine(),
      el(`div.district-cards${guided ? '.one' : ''}${this.choices.length > 2 ? '.three' : ''}`, {}, cards));

    // Side panel: tonight's attack per path first; med kits, towers, skills and the weapon only when they matter.
    const weapon = WEAPONS[WEAPON_ALIAS[run.weapon] || run.weapon];
    const spend = run.skillPoints > 0
      ? el('div.points-box', {},
        el('div', {}, el('b.amber', `${run.skillPoints}`), run.skillPoints === 1 ? ' unspent skill point' : ' unspent skill points'),
        sbtn(game, 'Spend points', () => this.openSkills(), { cls: 'primary', hotkey: 'P' }))
      : null;
    const side = el('div.side.panel.ui-block', {},
      el('h3', 'Tonight\'s attack'),
      this.attackPanel(),
      this.medKitShop(),
      run.towers.length ? el('div.small', {}, el('span.muted', 'Towers at your base: '), el('b', String(run.towers.length))) : null,
      run.weapon !== 'machete' && weapon ? el('div.small', {}, el('span.muted', 'Weapon: '), el('b', weapon.name)) : null,
      run.skills.length || run.skillPoints ? el('h3', 'Skills') : null,
      run.skills.length ? el('div.skill-tags', {}, run.skills.map(skillTag)) : null,
      spend);

    const beginReason = `Pick an area first (${keysHint})`;
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

  /**
   * Tonight's attack per path (critic L §4): one row per path with its enemy chips, the picked area's danger
   * included (it enters from the path facing that area). Before a pick, a note says the danger comes on top.
   */
  attackPanel() {
    const game = this.game;
    const run = game.run;
    const A = attackByPath(game, run, this.selected);
    if (!A) return el('div.small.muted', 'Hover an icon for its name.');
    const { W, lanes } = A;
    const rows = W.perLane.map((m, i) => (m.size
      ? el('div.path-row', {}, el('span.path-name', lanes[i]?.short || lanes[i]?.name || `Path ${i + 1}`), waveChips(game, run, m))
      : null));
    const extra = this.selected ? [run.threatFor(this.selected), run.secondThreat?.(this.selected)].filter(Boolean) : [];
    return el('div.attack', {},
      el('div.small.muted', {}, W.name ? el('span', {}, el('b.amber', W.name), ' · ') : null, `${W.total} enemies`, W.pushes > 1 ? ` in ${W.pushes} pushes` : ''),
      rows,
      extra.length
        ? extra.map((t) => el('div.small', {}, el('span.bad', 'Includes: '), t.short || t.text))
        : el('div.small.muted', 'Plus the danger of the area you pick.'));
  }

  /** Field Dressing (research): buy med kits here, before the trip. */
  medKitShop() {
    const game = this.game;
    const run = game.run;
    if (!game.meta.unlocks.includes('field_dressing') || run.meds >= (run.maxMeds?.() ?? CONFIG.player.maxMeds)) return null;
    const price = RESEARCH_TREE.field_dressing.price;
    const why = run.missing(price);
    return el('div.shop-row', {},
      el('span.small', {}, resIcon('pick_med'), ` Med kits ${run.meds}/${(run.maxMeds?.() ?? CONFIG.player.maxMeds)}`),
      el('span.grow'),
      sbtn(game, el('span', {}, 'Buy one ', costLine(price, run.res)), () => {
        if (!run.spend(price)) { game.sfx.play('error'); return; }
        run.meds += 1;
        run.save('briefing');
        game.sfx.play('pick_med');
        toast(game.ui, `Med kit bought (${run.meds}/${(run.maxMeds?.() ?? CONFIG.player.maxMeds)}): Q heals ${CONFIG.player.medHeal} in the jungle`, 'good', 2.4);
        this.render();
      }, { cls: 'small-btn', disabled: !!why, reason: why, sfx: null }));
  }

  /** Second Look (research): swap tonight's areas for new ones, once a night. */
  rerollAreas() {
    const game = this.game;
    const run = game.run;
    if (!run.rerollAreas(game.meta)) { game.sfx.play('error'); return; }
    game.sfx.play('ui_confirm');
    this.choices = run.districtChoices();
    this.selected = null;
    run.save('briefing');
    this.render();
    toast(game.ui, 'New areas to choose from', 'good', 1.6);
  }

  districtCard(k, i, guided = false) {
    const game = this.game;
    const run = game.run;
    const d = DISTRICTS[k];
    const threat = run.threatFor(k);
    const threat2 = run.secondThreat?.(k);
    const obj = PRIMARY[run.objectiveFor(k)];
    const enemyKeys = Object.keys(d.enemies || {});
    const where = this.whereText(k);
    // Everything else (where, creatures, the long reward/danger text) is in the tooltip and behind "Details".
    const tip = [d.env, where && `Where: ${where}`, `Finds: ${d.bonusText}`, `Creatures: ${d.enemyNote}`,
      `Reward: ${obj.boon.text}`, `Danger tonight: ${threat.text}`, threat2 && `Also tonight (Restless jungle): ${threat2.text}`].filter(Boolean).join('\n');
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
        el('div.small.dc-reward', {}, el('span.good', '▲ Reward: '), obj.boon.short || obj.boon.text, el('span.muted', ' (get home to claim it)')))),
      // Finds: true for everything looted today, wherever (Run.lootMults).
      el('div.dc-line.dc-finds', { title: d.bonusText }, el('span.dc-k.good', 'Finds'), el('span', {}, d.finds || d.bonusText, el('span.muted', ' in all you loot today'))),
      el(`div.dc-line.dc-threat${threat.cleared ? '.dc-cleared' : ''}`, {}, el('span.dc-k.bad', 'Danger'), el('span', {}, threat.short || threat.text,
        threat2 ? el('div.small', `+ ${threat2.short || threat2.text} (Restless jungle)`) : null)),
      // An area boss still alive here (from night 3, src/data/bosses.js): optional, marked ☠ on the map.
      run.bossAlive?.(k) ? el('div.dc-line.dc-boss', { title: BOSSES[k].intro }, el('span.dc-k', 'Boss'), el('span', {}, el('b', `☠ ${BOSSES[k].name}`),
        el('div.small.muted', 'Optional. Kill it: a rare relic, and no danger from here at night'))) : null,
      this.details ? el('div.dc-details', {},
        el('div.dc-env', d.env),
        where ? el('div.dc-line', {}, el('span.dc-k', 'Where'), el('span', where)) : null,
        el('div.dc-line', {}, el('span.dc-k.good', 'Finds'), el('span', d.bonusText)),
        el('div.dc-line', {}, el('span.dc-k', 'Creatures'), el('span', {}, el('span.dc-icons', enemyKeys.map((ek) => iconEl(game, ek, 18))), ' ', d.enemyNote))) : null));
    return card;
  }

  /** Today's weather (Run.weather, src/data/weather.js): the same for every area. Null on a clear day. */
  weatherLine() {
    const w = this.game.run.weather?.();
    if (!w) return null;
    return el(`div.brief-weather.small.${w.key}`, { title: 'Weather lasts the whole day, wherever you go' },
      el('b', `${w.icon} ${w.name} today`), el('span.muted', w.short));
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
    this.game.sfx.play(changed ? 'ui_select' : 'open');
    this.render();
    if (fromKey || this.nav?.cur) {
      const b = this.root.querySelector('.begin-btn');
      if (b) { this.nav.clear(); this.nav.cur = b; b.classList.add('kfocus'); }
    }
  }

  begin() {
    const game = this.game;
    if (!this.selected) { game.sfx.play('error'); toast(game.ui, `Pick an area first (${this.choices.length > 2 ? '1 / 2 / 3' : '1 / 2'})`, 'bad', 1.8); return; }
    if (game.ui.querySelector('.overlay')) return;
    game.sfx.play('head_out');
    const k = this.selected;
    const run = game.run;
    run.chooseDistrict(k);
    this.firstTripPerks(k);
    // The trip has started: a Continue from this snapshot means the game closed mid-day, which counts as
    // abandoning the trip (Run.abandonTrip) — quitting can't reset a bad day.
    run.save('explore');
    game.go('explore', { district: k });
  }

  /**
   * Research perks for a run's first trip: Beacon Codes switches on the chosen area's beacon, Survey Map
   * charts the land around the Relay on the map (both stored in run.world, which the jungle loads).
   */
  firstTripPerks(k) {
    const game = this.game;
    const run = game.run;
    if (run.night !== 1 || run.isGuidedDay()) return;
    const beacon = game.meta.unlocks.includes('beacon_codes');
    const chart = game.meta.unlocks.includes('cartographer');
    if (!beacon && !chart) return;
    const data = worldForRun(game, run, DISTRICT_KEYS);
    const st = run.worldState(data.size, JUNGLE.explore.cell);
    if (beacon) {
      const p = data.pylons.find((q) => q.region === DISTRICT_KEYS.indexOf(k));
      if (p) st.pylons.add(p.id);
    }
    if (chart) {
      const cell = JUNGLE.explore.cell, n = Math.ceil(data.size / cell), R = RESEARCH_TREE.cartographer.radius;
      for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
        if (Math.hypot((cx + 0.5) * cell - data.center.x, (cz + 0.5) * cell - data.center.z) <= R) st.explored[cz * n + cx] = 1;
      }
    }
    run.storeWorld(st);
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
    const reroll = skillRerollBtn(game, picker, () => game.run.save('briefing'));
    const box = el('div.panel.ui-block.skill-modal', {}, el('h2', 'Spend skill points'), picker.node, reroll);
    const o = overlay(game, box, { clickOutside: () => done() });
    close = o.close;
    const nav = new KeyNav(game, {
      layer: o.ov,
      items: () => [...box.querySelectorAll('.btn')],
      onEscape: () => done(),
      onKey: (e) => {
        const rb = reroll?.querySelector('.btn');
        if (e.code === 'KeyR' && rb && !rb.classList.contains('disabled')) { rb.click(); return true; }
        return picker.handleKey(e);
      },
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
