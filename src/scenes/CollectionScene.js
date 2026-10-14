// Collection: the research tree (spend Research Data on permanent unlocks in three branches; pick the starting
// blade and kit), lifetime records (Overgrowth, Long Night, Daily), and a codex of enemies, towers and areas.

import '../ui/screens.css';
import '../ui/meta.css';
import { el, toast, costLine } from '../ui/ui.js';
import { CONFIG, WEAPONS, WEAPON_ALIAS } from '../data/config.js';
import { UNLOCKS, UNLOCK_KEYS, RESEARCH_TREE, BRANCHES, KIT_KEYS, nodeStatus, missingReqs, affordableNodes, nextGoal, owns, ownedCount } from '../data/unlocks.js';
import { OVERGROWTH } from '../data/modes.js';
import { VISUALS } from '../data/visuals.js';
import { localDate } from '../core/Run.js';
import { DEFENSE_ENEMIES, EXPLORE_ENEMIES } from '../data/enemies.js';
import { TOWERS, TOWER_ORDER } from '../data/towers.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { WAVES, HEALTH_MULT } from '../data/waves.js';
import { MenuBackdrop } from './MenuBackdrop.js';
import { KeyNav, Bag, ask, sbtn, researchChip, iconEl } from '../ui/screensKit.js';
import { RELICS, RELIC_KEYS } from '../data/relics.js';
import { LORE_LOGS } from '../data/lore.js';
import { relicCard, relicIcon, rarityTag } from '../ui/relics.js';
import { codexKit } from '../ui/workbench.js';

const UNLOCK_ICON = {
  mortar_pod: { key: 'mortar_pod' },
  pulse_beacon: { key: 'pulse_beacon' },
  scattergun: { key: 'icon_parang' },
  stockpile: { key: 'pick_scrap' },
  field_kit: { key: 'pick_med' },
  wide_choice: { key: 'icon_wide_choice' },
  verdant_scarf: { key: 'icon_scarf' },
};

const KIND_LABEL = { bullet: 'Single target', chain: 'Chain lightning', mortar: 'Splash artillery', snare: 'Area slow', support: 'Support' };

const TABS = [['research', 'Research'], ['records', 'Records'], ['codex', 'Codex']];

/**
 * A research node's icon: a sprite from the art pass when the manifest has it (UNLOCK_ICON / the node's
 * icon.key), a placeholder-model thumbnail for tower keys, else the node's glyph in its colour.
 */
function nodeIcon(game, k, size) {
  const n = RESEARCH_TREE[k] || {};
  const ic = { ...(n.icon || {}), ...(UNLOCK_ICON[k] || {}) };
  for (const key of [UNLOCK_ICON[k]?.key, n.icon?.key]) {
    if (key && (game.assets.spriteInfo?.(key)?.tex?.image || VISUALS[key])) return iconEl(game, key, size);
  }
  return el('span.vicon.glyph', { style: { '--c': n.icon?.color || ic.color || '#8b9bb4', width: `round(calc(var(--u) * ${size}), 1px)`, height: `round(calc(var(--u) * ${size}), 1px)` } }, n.icon?.glyph || ic.glyph || '◆');
}

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
  if (e.boss) n.push('Night 6 boss. Loops: approach → roots (a Crawler sprouts) → wind-up charge → slams the Relay from the plaza.');
  if (key === 'seedling') n.push('Tiny and fast; spawned by Seed Carriers.');
  if (EXPLORE_ENEMIES[key]) n.push(`Also hunts by day (${EXPLORE_ENEMIES[key].attack === 'ranged' ? 'ranged' : EXPLORE_ENEMIES[key].attack === 'charge' ? 'charges' : 'melee lunges'}).`);
  return n;
}

export class CollectionScene {
  constructor(game) {
    this.game = game;
    this.bag = new Bag();
    this.tab = 'research';
  }

  enter(params = {}) {
    const game = this.game;
    this.from = params.from && game.scenes[params.from] ? params.from : 'title';
    if (params.tab) this.tab = params.tab === 'unlocks' ? 'research' : params.tab;
    this.backdrop = new MenuBackdrop(game, { mood: 'dusk', angle: 2.2, speed: 0.03, radius: 12, height: 7 });
    this.three = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.post = this.backdrop.post;
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
        if (e.code === 'KeyU' && this.tab === 'research' && this.sel) { this.buy(this.sel); return true; }
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
    this.game.sfx.play('ui_tab');
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
    if (this.tab === 'research') this.renderResearch(content);
    else if (this.tab === 'records') this.renderRecords(content);
    else this.renderCodex(content);
    const foot = el('div.row.scr-foot', {},
      el('span.small.muted', {}, el('span.key', '1'), el('span.key', '2'), el('span.key', '3'), ' tabs  ', el('span.key', 'Arrows'), ' move  ', el('span.key', 'Enter'), ' select'),
      el('span.grow'),
      sbtn(game, 'Back', () => this.back(), { cls: 'back-btn', hotkey: 'Esc' }));
    this.root.append(el('div.scr-dim'), head, content, foot);
    if (this.tab === 'codex') content.scrollTop = keepScroll;
  }

  // ------------------------------------------------------------------ research tree

  /** Lock badge: the art pass's lock icon when it exists, else the glyph. */
  _lock(size = 12) {
    return this.game.assets.spriteInfo?.('icon_lock')?.tex?.image ? iconEl(this.game, 'icon_lock', size) : '🔒';
  }

  /**
   * The research tree (critic J M8): three branch columns of nodes (tiers top to bottom), lines from each
   * node to what it needs first, a detail bar for the selected node (click a node to see it, click it again
   * or press U to unlock), and the loadout (starting blade / kit) once there is a choice to make.
   */
  renderResearch(c) {
    const game = this.game;
    const meta = game.meta;
    if (!this.sel || !UNLOCK_KEYS.includes(this.sel)) this.sel = affordableNodes(meta)[0] || nextGoal(meta) || UNLOCK_KEYS[0];
    c.classList.add('research');
    c.append(el('p.muted.small.intro', 'Research Data is earned every run, win or lose. Unlocks add options, never raw power. Lines show what each unlock needs first.'));
    const wrap = el('div.rt-wrap');
    for (const b of BRANCHES) {
      const keys = UNLOCK_KEYS.filter((k) => RESEARCH_TREE[k].branch === b.key);
      if (!keys.length) continue;
      const tiers = Math.max(...keys.map((k) => RESEARCH_TREE[k].tier || 1));
      const grid = el('div.rt-grid', { style: { gridTemplateRows: `repeat(${tiers}, auto)` } }, keys.map((k) => this.nodeCard(k)));
      const owned = keys.filter((k) => owns(meta, k)).length;
      wrap.append(el('div.rt-branch', { style: { '--bc': b.color }, 'data-branch': b.key },
        el('div.rt-head', {}, el('b', b.name), el('span.small.muted', b.line), el('span.grow'), el('span.small', `${owned}/${keys.length}`)),
        el('div.rt-body', {}, el('div.rt-lines'), grid)));
    }
    c.append(wrap, this.nodeDetail(this.sel));
    const loadout = this.loadout();
    if (loadout) c.append(loadout);
    // Lines need the laid-out node positions: draw after layout, and again when the window changes size.
    requestAnimationFrame(() => this.drawLines());
    if (!this._onResize) {
      this._onResize = () => { if (this.tab === 'research') this.drawLines(); };
      window.addEventListener('resize', this._onResize);
      this.bag.add(() => window.removeEventListener('resize', this._onResize));
    }
  }

  nodeCard(k) {
    const game = this.game;
    const meta = game.meta;
    const n = RESEARCH_TREE[k];
    const st = nodeStatus(meta, k);
    const tag = {
      owned: el('span.rt-tag.good', '✓ Owned'),
      reward: el('span.rt-tag.amber', '★ Win a run'),
      locked: el('span.rt-tag.muted', {}, this._lock(10), ` ${n.cost}`),
      open: researchChip(n.cost, { noLabel: true }),
      short: researchChip(n.cost, { noLabel: true, cls: 'short' }),
    }[st];
    return el(`button.btn.rt-node.${st}${this.sel === k ? '.sel' : ''}`, {
      'data-key': k,
      style: { gridRow: String(n.tier || 1), gridColumn: String((n.col || 0) + 1) },
      title: `${n.name}: ${n.desc}`,
      onclick: (e) => {
        e.stopPropagation();
        // First click shows it; a second click on a buyable node buys it (with the confirm).
        if (this.sel === k && st === 'open') { this.buy(k); return; }
        this.sel = k;
        game.sfx.play('ui_move');
        this.render();
        this.focusNode(k);
      },
    }, nodeIcon(game, k, 20), el('span.rt-name', n.short || n.name), tag);
  }

  /** Keep keyboard focus on a node after a re-render. */
  focusNode(k) {
    const b = this.root.querySelector(`.rt-node[data-key="${k}"]`);
    if (b && this.nav) { this.nav.clear(); this.nav.cur = b; b.classList.add('kfocus'); }
  }

  /** The selected node: name, plain description, what it needs, and the Unlock button (or why not). */
  nodeDetail(k) {
    const game = this.game;
    const meta = game.meta;
    const n = RESEARCH_TREE[k];
    const st = nodeStatus(meta, k);
    const branch = BRANCHES.find((b) => b.key === n.branch);
    const reqs = (n.req || []).map((r) => RESEARCH_TREE[r]?.short || r);
    let action;
    if (st === 'owned') action = el('span.badge.good', n.victoryReward ? '✓ Earned' : '✓ Owned');
    else if (st === 'reward') action = el('span.small.muted', `Win a run (survive Night ${CONFIG.nights}) to earn it.`);
    else if (st === 'locked') action = el('span.small.amber', {}, this._lock(12), ` Unlock ${missingReqs(meta, k).join(' and ')} first`);
    else {
      const short = n.cost - meta.research;
      action = el('div.rt-buy', {},
        sbtn(game, el('span', {}, 'Unlock · ', researchChip(n.cost, { noLabel: true })), () => this.buy(k), {
          cls: st === 'open' ? 'primary buy-btn' : 'buy-btn', hotkey: 'U', disabled: st !== 'open', reason: `Need ${short} more Research Data`, sfx: null,
        }),
        st === 'open' ? el('span.small.muted', `${meta.research - n.cost} left after`) : el('span.small.bad', `Need ${short} more Research`));
    }
    return el('div.rt-detail', { style: { '--bc': branch?.color || '#8b9bb4' } },
      nodeIcon(game, k, 34),
      el('div.grow', {},
        el('div.rt-dname', {}, el('b', n.name), el('span.small.muted', `  ${branch?.name || ''}`)),
        el('div.small', n.desc),
        reqs.length ? el('div.small.muted', `Needs: ${reqs.join(', ')}`) : null),
      action);
  }

  /** Lines from each node to the nodes that need it (elbows, pixel-crisp), lit when the prerequisite is owned. */
  drawLines() {
    if (this.tab !== 'research') return;
    const meta = this.game.meta;
    const u = this.game.u || 1;
    for (const body of this.root.querySelectorAll('.rt-body')) {
      const layer = body.querySelector('.rt-lines');
      if (!layer) continue;
      const box = body.getBoundingClientRect();
      const at = (k) => body.querySelector(`.rt-node[data-key="${k}"]`)?.getBoundingClientRect();
      const W = Math.round(box.width), H = Math.round(box.height);
      const sw = Math.max(1, Math.round(2 * u));
      let paths = '';
      for (const node of body.querySelectorAll('.rt-node')) {
        const k = node.dataset.key;
        for (const r of RESEARCH_TREE[k].req || []) {
          const a = at(r), b = at(k);
          if (!a || !b) continue;
          const x1 = Math.round(a.left + a.width / 2 - box.left), y1 = Math.round(a.bottom - box.top);
          const x2 = Math.round(b.left + b.width / 2 - box.left), y2 = Math.round(b.top - box.top);
          const ym = Math.round((y1 + y2) / 2);
          const lit = owns(meta, r);
          paths += `<path d="M${x1} ${y1}V${ym}H${x2}V${y2}" class="${lit ? 'lit' : ''}" />`;
        }
      }
      layer.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" style="stroke-width:${sw}px">${paths}</svg>`;
    }
  }

  /** Starting blade (with the Parang) and starting kit (with any kit): only once there is a choice. */
  loadout() {
    const game = this.game;
    const meta = game.meta;
    const kits = KIT_KEYS.filter((k) => owns(meta, k));
    const blade = owns(meta, 'scattergun');
    if (!blade && !kits.length) return null;
    const row = el('div.rt-loadout');
    if (blade) row.append(this.weaponToggle());
    if (kits.length) {
      const opt = (key) => {
        const n = key ? RESEARCH_TREE[key] : null;
        const res = n?.kit?.res || {};
        const line = Object.entries(res).map(([r, v]) => `${v > 0 ? '+' : ''}${v} ${r === 'scrap' ? 'Scrap' : r.charAt(0).toUpperCase() + r.slice(1)}`).join(', ');
        return sbtn(game, el('span', {}, el('b', n ? n.short : 'None'), line ? el('span.small.muted', ` ${line}`) : null), () => {
          meta.startKit = key;
          game.saveMeta();
          toast(game.ui, n ? `Next runs start with the ${n.short}.` : 'Next runs start without a kit.', 'good', 1.8);
          this.render();
        }, { cls: `seg-btn${(meta.startKit || null) === key ? ' selected' : ''}` });
      };
      row.append(el('div.weapon-toggle', {}, el('div.small.amber', 'Starting kit'), el('div.seg', {}, opt(null), kits.map(opt))));
    }
    return row;
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
    const u = RESEARCH_TREE[k];
    if (nodeStatus(meta, k) !== 'open') { game.sfx.play('error'); return; }
    const ok = await ask(game, {
      title: `Unlock ${u.name}?`,
      body: el('div', {}, el('p', u.desc), el('p', {}, 'Cost: ', researchChip(u.cost), el('span.muted', `  ·  ${meta.research - u.cost} left after`))),
      confirm: 'Unlock', cancel: 'Not now',
    });
    if (!ok || game.scene !== this) return;
    if (nodeStatus(meta, k) !== 'open') return;
    meta.research -= u.cost;
    meta.unlocks.push(k);
    game.saveMeta();
    game.sfx.play('unlock');
    toast(game.ui, `Unlocked: ${u.name}`, 'good');
    // Point at what this opens next (a node that needed it), else stay.
    const next = UNLOCK_KEYS.find((x) => (RESEARCH_TREE[x].req || []).includes(k) && nodeStatus(meta, x) !== 'owned');
    if (next) this.sel = next;
    this.render();
    // A new start weapon / kit is offered, never silently equipped.
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
    } else if (u.kit) {
      const take = await ask(game, {
        title: `Take the ${u.short}?`,
        body: el('p', `${u.desc} Start your next runs with it? You can change your starting kit any time here in the Collection.`),
        confirm: `Take the ${u.short}`, cancel: 'Not now',
      });
      if (game.scene !== this) return;
      if (take) { meta.startKit = k; game.saveMeta(); toast(game.ui, `Next runs start with the ${u.short}.`, 'good', 2.2); }
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
      tile('Research unlocks', `${ownedCount(meta)}/${UNLOCK_KEYS.length}`)));
    // Modes (after the first win / first run): Overgrowth ladder, Long Night best, today's Daily.
    const today = meta.daily?.[localDate()];
    const og = meta.overgrowth?.best || 0;
    if (best.victory || today) {
      c.append(el('div.stat-grid.modes', {},
        best.victory ? tile('Overgrowth won', og ? `Level ${og}` : 'None yet', og < OVERGROWTH.max ? `Level ${og + 1} is open` : 'The top of the ladder', og ? 'win' : '') : null,
        best.victory ? tile('Long Night best', meta.longNight?.best ? `${meta.longNight.best} nights` : '—', 'Nights held in one run') : null,
        tile("Today's Daily", today ? (today.victory ? 'Won' : `${today.nights} nights`) : '—', today ? `${today.runs} tr${today.runs === 1 ? 'y' : 'ies'} today` : 'Not played today')));
    }
    c.append(el('h3', `Areas discovered · ${meta.discovered.length}/${DISTRICT_KEYS.length}`));
    c.append(el('div.district-list', {}, DISTRICT_KEYS.map((k) => {
      const d = DISTRICTS[k];
      const seen = meta.discovered.includes(k);
      return el(`div.district-chip${seen ? '.seen' : ''}`, { style: { '--c': d.look.floorAlt } },
        el('span.swatch'), el('b', seen ? d.name : d.name), el('span.small', seen ? ' ✓ visited' : ` · first visit +${CONFIG.research.newDistrict} research`));
    })));
    c.append(el('h3', 'How Research Data is earned'));
    const R = CONFIG.research;
    c.append(el('div.earn-grid.small', {}, [
      ['Got home from a trip', R.expedition], ['Goal done', R.objective], ['Bonus task', R.optional],
      ['Night survived', R.night], ['First visit to an area', R.newDistrict], ['Boss damage', R.bossMax, 'up to '], ['Victory', R.victory],
    ].map(([a, b, pre]) => el('div.earn-row', {}, el('span', a), el('span.grow'), el('b.amber', `${pre || ''}+${b}`)))));
    c.append(el('p.small.muted', `Overgrowth adds +${Math.round(OVERGROWTH.researchPerLevel * 100)}% Research per level (the Daily: per modifier); Archivist another +10%.`));
  }

  // ------------------------------------------------------------------ codex

  renderCodex(c) {
    const game = this.game;
    const meta = game.meta;

    // Relics and data logs (Stage 7; src/data/relics.js, lore.js): what you've found across all runs.
    const seen = new Set(meta.relicsSeen || []);
    c.append(el('h3', `Relics · ${RELIC_KEYS.filter((k) => seen.has(k)).length}/${RELIC_KEYS.length}`));
    c.append(el('p.small.muted', 'Found in the jungle: strongboxes at lost sites, shrines at landmarks, hidden caches, area bosses. Carry one home and it works for the rest of that run.'));
    c.append(el('div.codex-relics', {}, RELIC_KEYS.map((k) => (seen.has(k)
      ? relicCard(game, k, { size: 24 })
      : el(`div.rl-card.unseen.rl-${RELICS[k].rarity}`, {}, relicIcon(game, k, 24, { silhouette: true }),
        el('div.rl-body', {}, el('div.rl-name', {}, el('b', '???'), ' ', rarityTag(k)), el('div.rl-text.muted', 'Not found yet.')))))));
    const read = new Set(meta.lore || []);
    c.append(el('h3', `Data logs · ${LORE_LOGS.filter((l) => read.has(l.id)).length}/${LORE_LOGS.length}`));
    c.append(el('p.small.muted', 'Glowing data logs lie at old sites, one at most per site. You always find the next one you haven\'t read.'));
    c.append(el('div.codex-lore', {}, LORE_LOGS.map((l, i) => (read.has(l.id)
      ? el('div.codex-log', {}, el('div', {}, el('b.accent', `${i + 1}. ${l.title}`), el('span.small.muted', l.who)), el('div.small', l.text))
      : el('div.codex-log.unseen.small', `${i + 1}. Not found yet.`)))));

    c.append(el('h3', 'Night enemies'));
    const elist = el('div.codex-list');
    for (const [k, e] of Object.entries(DEFENSE_ENEMIES)) {
      const fn = firstNight(k);
      elist.append(el(`div.codex-row${e.boss ? '.boss' : ''}`, {},
        iconEl(game, k, 40, { color: e.color }),
        el('div.codex-main', {},
          el('div.row.codex-title', {}, el('b', e.name), el('span.badge', e.role), fn ? el('span.small.muted', `from Night ${fn}`) : null),
          el('div.codex-stats.small', {}, stat('HP', e.boss && fn ? `${e.hp} base · ${Math.round(e.hp * (WAVES[fn - 1]?.find((g) => g.type === k)?.hpMult ?? HEALTH_MULT[fn - 1] ?? 1))} on Night ${fn}` : e.hp), stat('Speed', e.speed), stat('Relay dmg', e.siege ? `${e.siege.damage} per slam` : e.coreDamage)),
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
          el('div.row.codex-title', {}, el('b', t.name), el('span.badge', KIND_LABEL[t.kind] || t.kind), locked ? el('span.badge.locked', {}, iconEl(game, 'icon_lock', 13), ` ${UNLOCKS[t.locked]?.name || 'Locked'}`) : null, el('span.grow'), costLine(t.cost)),
          el('div.small', t.desc),
          el('div.codex-stats.small', {},
            stat('Range', t.range),
            t.damage ? stat('Damage', t.damage) : null,
            rate ? stat('Attacks/s', rate) : null,
            t.kind === 'support' ? stat('Rate buff', `+${Math.round(t.buffRate * 100)}%`) : null,
            t.damageType !== 'none' ? stat('Type', t.damageType) : null),
          // Level 3 is a choice of two branches (src/data/towers.js upgrades[1].branches).
          t.upgrades.map((u, i) => u.branches
            ? Object.values(u.branches).map((b) => el('div.small.upg', {}, el('span.amber', `Lv ${i + 2} ${b.name}: `), b.detail || b.line, ' ', costLine(b.cost)))
            : el('div.small.upg', {}, el('span.amber', `Lv ${i + 2}: `), u.desc, ' ', costLine(u.cost))))));
    }
    c.append(tlist);

    c.append(...codexKit(game));   // Skills (by branch, keystones) and the Workbench's recipes (src/ui/workbench.js)

    c.append(el('h3', 'Areas'));
    const dlist = el('div.codex-list');
    for (const k of DISTRICT_KEYS) {
      const d = DISTRICTS[k];
      const seen = meta.discovered.includes(k);
      dlist.append(el('div.codex-row.district', { style: { '--c': d.look.floorAlt } },
        iconEl(game, `icon_district_${k}`, 40, { glyph: '▦', color: d.look.floorAlt }),
        el('div.codex-main', {},
          el('div.row.codex-title', {}, el('b', d.name), seen ? el('span.badge.good', '✓ Visited') : el('span.badge', 'Not visited'), d.minNight ? el('span.small.muted', `from Night ${d.minNight}`) : null),
          el('div.small', d.env),
          el('div.small', {}, el('span.good', 'Finds (all you loot that day): '), d.bonusText.replace(/^Today: /, '')),
          el('div.small', {}, el('span.muted', 'Creatures: '), d.enemyNote),
          el('div.small', {}, el('span.bad', 'Danger that night: '), d.nightThreat.text))));
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
