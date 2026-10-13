// Collection: spend Research Data on permanent unlocks, pick the starting weapon, see lifetime records,
// and browse a codex of enemies, towers and districts.

import '../ui/screens.css';
import { el, toast, costLine } from '../ui/ui.js';
import { CONFIG, WEAPONS, WEAPON_ALIAS } from '../data/config.js';
import { UNLOCKS, UNLOCK_KEYS } from '../data/unlocks.js';
import { DEFENSE_ENEMIES, EXPLORE_ENEMIES } from '../data/enemies.js';
import { TOWERS, TOWER_ORDER } from '../data/towers.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { WAVES, HEALTH_MULT } from '../data/waves.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, researchChip, iconEl } from '../ui/screensKit.js';

const UNLOCK_ICON = {
  mortar_pod: { key: 'mortar_pod' },
  pulse_beacon: { key: 'pulse_beacon' },
  scattergun: { glyph: '⁘', color: '#c0cbdc' },
  stockpile: { key: 'pick_scrap' },
  field_kit: { key: 'pick_med' },
  wide_choice: { glyph: '✦', color: '#2ce8f5' },
  verdant_scarf: { glyph: '❦', color: '#63c74d' },
};

const KIND_LABEL = { bullet: 'Single target', chain: 'Chain lightning', mortar: 'Splash artillery', snare: 'Area slow', support: 'Support' };

const TABS = [['unlocks', 'Unlocks'], ['records', 'Records'], ['codex', 'Codex']];

/** First night a defense enemy type appears in the authored waves (null if only via events/bosses). */
function firstNight(type) {
  for (let i = 0; i < WAVES.length; i++) if (WAVES[i].some((g) => g.type === type)) return i + 1;
  if (type === 'seedling') return firstNight('seed_carrier');
  return null;
}

function enemyNotes(key, e) {
  const n = [];
  if (e.note) {
    n.push(e.note);
    if (EXPLORE_ENEMIES[key]) n.push('Also hunts by day.');
    return n;
  }
  if (e.spit) n.push('Stops near the Relay and lobs sap after a visible wind-up.');
  if (e.burrow) n.push('Underground for part of its route: bullet towers can\'t target it there.');
  if (e.onDeath) n.push(`Bursts into ${e.onDeath.count} Seedlings unless the killing blow is a blast.`);
  if (e.resist?.kinetic) n.push(`Shield: kinetic damage reduced ${Math.round((1 - e.resist.kinetic) * 100)}%.`);
  if (e.boss) n.push('Night 6 boss. Loops: approach → roots (spawns Crawlers) → wind-up charge.');
  if (key === 'seedling') n.push('Tiny and fast; spawned by Seed Carriers.');
  if (EXPLORE_ENEMIES[key]) n.push(`Also hunts by day (${EXPLORE_ENEMIES[key].attack === 'ranged' ? 'ranged' : EXPLORE_ENEMIES[key].attack === 'charge' ? 'charges' : 'melee lunges'}).`);
  return n;
}

export class CollectionScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
    this.tab = 'unlocks';
  }

  enter(params = {}) {
    const game = this.game;
    this.from = params.from && game.scenes[params.from] ? params.from : 'title';
    if (params.tab) this.tab = params.tab;
    this.backdrop = new MenuBackdrop(game, { mood: 'dusk', angle: 2.2, speed: 0.03, radius: 12, height: 7 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    game.music?.play('title');

    this.root = el('div.screen.scr.collection-screen');
    game.ui.append(this.root);
    this.render();

    this.nav = this.bag.add(new KeyNav(game, {
      items: () => [...this.root.querySelectorAll('.tab-btn, .content .btn, .back-btn')],
      onEscape: () => this.back(),
      onKey: (e) => {
        const m = /^Digit([1-3])$/.exec(e.code);
        if (m) { this.setTab(TABS[Number(m[1]) - 1][0]); return true; }
        if (e.code === 'KeyQ' || e.code === 'KeyE') {
          const i = TABS.findIndex(([k]) => k === this.tab);
          this.setTab(TABS[(i + (e.code === 'KeyE' ? 1 : TABS.length - 1)) % TABS.length][0]);
          return true;
        }
        if (this.tab === 'codex' && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'PageUp' || e.code === 'PageDown')) {
          const sc = this.root.querySelector('.content.scroll');
          const step = sc.clientHeight * (e.code.startsWith('Page') ? 0.85 : 0.2);
          sc.scrollBy({ top: e.code === 'ArrowUp' || e.code === 'PageUp' ? -step : step, behavior: 'smooth' });
          return true;
        }
        return false;
      },
    }));
  }

  back() {
    this.game.go(this.from, { from: 'collection' });
  }

  setTab(t) {
    if (t === this.tab) return;
    this.tab = t;
    this.game.sfx.play('open');
    this.nav?.clear();
    this.render();
  }

  render() {
    const game = this.game;
    const meta = game.meta;
    const keepScroll = this.root.querySelector('.content')?.scrollTop || 0;
    this.root.innerHTML = '';
    const tabs = el('div.tabs', {}, TABS.map(([k, label], i) => {
      const b = sbtn(game, label, () => this.setTab(k), { cls: `tab-btn${k === this.tab ? ' selected' : ''}`, hotkey: String(i + 1), sfx: null });
      return b;
    }));
    const head = el('div.scr-head.panel.ui-block', {},
      el('h2', 'Collection'),
      tabs,
      el('span.grow'),
      el('div.balance', {}, el('span.small.muted', 'Balance '), researchChip(meta.research, { label: 'Research Data' })));
    const content = el(`div.content.panel.ui-block${this.tab === 'codex' ? '.scroll' : ''}`);
    if (this.tab === 'unlocks') this.renderUnlocks(content);
    else if (this.tab === 'records') this.renderRecords(content);
    else this.renderCodex(content);
    const foot = el('div.row.scr-foot', {},
      el('span.small.muted', {}, el('span.key', '1'), el('span.key', '2'), el('span.key', '3'), ' tabs  ', el('span.key', '↑'), el('span.key', '↓'), ' move  ', el('span.key', 'Enter'), ' select'),
      el('span.grow'),
      sbtn(game, 'Back', () => this.back(), { cls: 'back-btn', hotkey: 'Esc' }));
    this.root.append(el('div.scr-dim'), head, content, foot);
    if (this.tab === 'codex') content.scrollTop = keepScroll;
  }

  // ------------------------------------------------------------------ unlocks

  renderUnlocks(c) {
    const game = this.game;
    const meta = game.meta;
    c.append(el('p.muted.small.intro', 'Research Data is earned every run, win or lose. Unlocks add options, never raw power.'));
    const grid = el('div.unlock-grid');
    for (const k of UNLOCK_KEYS) {
      const u = UNLOCKS[k];
      const owned = meta.unlocks.includes(k);
      const ic = UNLOCK_ICON[k] || {};
      const icon = ic.key ? iconEl(game, ic.key, 34) : el('span.vicon.glyph', { style: { '--c': ic.color || '#8b9bb4', width: 'calc(var(--u) * 34)', height: 'calc(var(--u) * 34)' } }, ic.glyph || '◆');
      let status;
      if (owned) {
        status = el('div.unlock-status.owned', {}, el('span.badge.good', u.victoryReward ? '✓ Earned' : '✓ Owned'));
      } else if (u.victoryReward || u.cost == null) {
        status = el('div.unlock-status', {}, el('span.badge.locked', '🔒 Victory reward'), el('div.small.muted', `Win a run (survive Night ${CONFIG.nights}) to earn it.`));
      } else {
        const short = u.cost - meta.research;
        const can = short <= 0;
        const buy = sbtn(game, el('span', {}, 'Unlock · ', researchChip(u.cost, { noLabel: true })), () => this.buy(k), {
          cls: can ? 'primary buy-btn' : 'buy-btn',
          disabled: !can,
          reason: can ? null : `Need ${short} more Research Data`,
          sfx: null,
        });
        status = el('div.unlock-status', {}, buy, can ? null : el('div.small.bad', `Need ${short} more Research`));
      }
      const extra = k === 'scattergun' && owned ? this.weaponToggle() : null;
      grid.append(el(`div.unlock-card${owned ? '.owned' : ''}`, {},
        el('div.unlock-top', {}, icon, el('div.grow', {}, el('div.unlock-name', u.name), el('div.small.muted', u.desc))),
        extra, status));
    }
    c.append(grid);
    if (!meta.unlocks.includes('scattergun')) {
      c.append(el('div.loadout.small.muted', {}, 'Starting blade: ', el('b', WEAPONS.machete.name), ' (unlock the Parang to choose)'));
    }
  }

  weaponToggle() {
    const game = this.game;
    const meta = game.meta;
    const opt = (key) => {
      const w = WEAPONS[WEAPON_ALIAS[key]];
      const b = sbtn(game, el('span', {}, el('b', w.name), el('span.small.muted', ` ${w.combo[0].damage} dmg · chop ${w.chop.damage}`)), () => {
        meta.startWeapon = key;
        game.saveMeta();
        toast(game.ui, `Next run starts with the ${w.name}.`, 'good', 1.8);
        this.render();
      }, { cls: `seg-btn${(meta.startWeapon || 'carbine') === key ? ' selected' : ''}` });
      return b;
    };
    return el('div.weapon-toggle', {}, el('div.small.amber', 'Starting blade'), el('div.seg', {}, opt('carbine'), opt('scattergun')));
  }

  async buy(k) {
    const game = this.game;
    const meta = game.meta;
    const u = UNLOCKS[k];
    if (meta.unlocks.includes(k) || u.cost == null || meta.research < u.cost) { game.sfx.play('error'); return; }
    const ok = await ask(game, {
      title: `Unlock ${u.name}?`,
      body: el('div', {}, el('p', u.desc), el('p', {}, 'Cost: ', researchChip(u.cost), el('span.muted', `  ·  ${meta.research - u.cost} left after`))),
      confirm: 'Unlock', cancel: 'Not now',
    });
    if (!ok || game.scene !== this) return;
    if (meta.unlocks.includes(k) || meta.research < u.cost) return;
    meta.research -= u.cost;
    meta.unlocks.push(k);
    game.saveMeta();
    game.sfx.play('build');
    toast(game.ui, `Unlocked: ${u.name}`, 'good');
    this.render();
    // A new start weapon is offered, never silently equipped.
    if (k === 'scattergun') {
      const equip = await ask(game, {
        title: 'Equip the Parang?',
        body: el('p', 'Start your next runs with the Parang instead of the Machete? You can switch any time under Starting blade here in the Collection.'),
        confirm: 'Equip Parang', cancel: 'Keep Machete',
      });
      if (game.scene !== this) return;
      if (equip) {
        meta.startWeapon = 'scattergun';
        game.saveMeta();
        toast(game.ui, 'Parang equipped. Toggle it in the Collection.', 'good', 2.4);
      }
      this.render();
    }
  }

  // ------------------------------------------------------------------ records

  renderRecords(c) {
    const meta = this.game.meta;
    const tile = (label, value, sub, cls = '') => el(`div.stat-tile${cls ? '.' + cls : ''}`, {}, el('div.small.muted', label), el('div.stat-val', value), sub ? el('div.small.muted', sub) : null);
    const best = meta.best;
    c.append(el('div.stat-grid', {},
      tile('Research Data', researchChip(meta.research, { noLabel: true }), 'Banked forever'),
      tile('Best run', best.victory ? 'Victory' : `${best.nights}/${CONFIG.nights}`, best.victory ? `All ${CONFIG.nights} nights held` : 'nights survived', best.victory ? 'win' : ''),
      tile('Runs started', String(meta.lifetime.runs)),
      tile('Victories', String(meta.lifetime.victories)),
      tile('Lifetime kills', String(meta.lifetime.kills)),
      tile('Unlocks', `${meta.unlocks.length}/${UNLOCK_KEYS.length}`)));
    c.append(el('h3', `Districts discovered · ${meta.discovered.length}/${DISTRICT_KEYS.length}`));
    c.append(el('div.district-list', {}, DISTRICT_KEYS.map((k) => {
      const d = DISTRICTS[k];
      const seen = meta.discovered.includes(k);
      return el(`div.district-chip${seen ? '.seen' : ''}`, { style: { '--c': d.look.floorAlt } },
        el('span.swatch'), el('b', seen ? d.name : d.name), el('span.small', seen ? ' ✓ visited' : ` · first visit +${CONFIG.research.newDistrict} research`));
    })));
    c.append(el('h3', 'How Research Data is earned'));
    const R = CONFIG.research;
    c.append(el('div.earn-grid.small', {}, [
      ['Expedition extracted', R.expedition], ['Primary objective', R.objective], ['Optional objective', R.optional],
      ['Night survived', R.night], ['First visit to a district', R.newDistrict], ['Boss damage', R.bossMax, 'up to '], ['Victory', R.victory],
    ].map(([a, b, pre]) => el('div.earn-row', {}, el('span', a), el('span.grow'), el('b.amber', `${pre || ''}+${b}`)))));
  }

  // ------------------------------------------------------------------ codex

  renderCodex(c) {
    const game = this.game;
    const meta = game.meta;

    c.append(el('h3', 'Night enemies'));
    const elist = el('div.codex-list');
    for (const [k, e] of Object.entries(DEFENSE_ENEMIES)) {
      const fn = firstNight(k);
      elist.append(el(`div.codex-row${e.boss ? '.boss' : ''}`, {},
        iconEl(game, k, 40, { color: e.color }),
        el('div.codex-main', {},
          el('div.row.codex-title', {}, el('b', e.name), el('span.badge', e.role), fn ? el('span.small.muted', `from Night ${fn}`) : null),
          el('div.codex-stats.small', {}, stat('HP', e.boss && fn ? `${e.hp} base · ${Math.round(e.hp * (HEALTH_MULT[fn - 1] ?? 1))} on Night ${fn}` : e.hp), stat('Speed', e.speed), stat('Relay dmg', e.coreDamage)),
          enemyNotes(k, e).map((n) => el('div.small.muted.note', n)))));
    }
    c.append(elist);

    c.append(el('h3', 'Towers'));
    const tlist = el('div.codex-list');
    for (const k of TOWER_ORDER) {
      const t = TOWERS[k];
      const locked = t.locked && !meta.unlocks.includes(t.locked);
      const rate = t.cooldown ? (1 / t.cooldown).toFixed(1) : null;
      tlist.append(el(`div.codex-row${locked ? '.locked' : ''}`, {},
        iconEl(game, k, 40),
        el('div.codex-main', {},
          el('div.row.codex-title', {}, el('b', t.name), el('span.badge', KIND_LABEL[t.kind] || t.kind), locked ? el('span.badge.locked', `🔒 ${UNLOCKS[t.locked]?.name || 'Locked'}`) : null, el('span.grow'), costLine(t.cost)),
          el('div.small', t.desc),
          el('div.codex-stats.small', {},
            stat('Range', t.range),
            t.damage ? stat('Damage', t.damage) : null,
            rate ? stat('Attacks/s', rate) : null,
            t.kind === 'support' ? stat('Rate buff', `+${Math.round(t.buffRate * 100)}%`) : null,
            t.damageType !== 'none' ? stat('Type', t.damageType) : null),
          t.upgrades.map((u, i) => el('div.small.upg', {}, el('span.amber', `Lv ${i + 2}: `), u.desc, ' ', costLine(u.cost))))));
    }
    c.append(tlist);

    c.append(el('h3', 'Districts'));
    const dlist = el('div.codex-list');
    for (const k of DISTRICT_KEYS) {
      const d = DISTRICTS[k];
      const seen = meta.discovered.includes(k);
      dlist.append(el('div.codex-row.district', { style: { '--c': d.look.floorAlt } },
        el('span.vicon.glyph.district-glyph', { style: { width: 'calc(var(--u) * 40)', height: 'calc(var(--u) * 40)', '--c': d.look.floorAlt } }, '▦'),
        el('div.codex-main', {},
          el('div.row.codex-title', {}, el('b', d.name), seen ? el('span.badge.good', '✓ Visited') : el('span.badge', 'Not visited'), d.minNight ? el('span.small.muted', `from Night ${d.minNight}`) : null),
          el('div.small', d.env),
          el('div.small', {}, el('span.good', 'Bonus: '), d.bonusText, el('span.muted', '  ·  '), el('span.muted', 'Enemies: '), d.enemyNote),
          el('div.small', {}, el('span.bad', 'Night threat: '), d.nightThreat.text))));
    }
    c.append(dlist);
  }

  update(dt) { this.backdrop?.update(dt); }

  exit() {
    this.bag.dispose();
    this.backdrop?.dispose();
  }
}

function stat(label, value) {
  return el('span.stat', {}, el('span.muted', `${label} `), el('b', String(value)));
}
