// Camp crafting UI (Stage 7, src/data/crafting.js):
//   workbenchView(game, opts)  the Workbench step (SummaryScene, between the trip summary and night prep)
//   modRow(scene, tower)       night prep's tower panel: the tower's one mod socket (fit / take out)
//   codexKit(game)             the Collection Codex's Skills and Workbench sections
//   showBench(run)             should the Workbench step open tonight?
// Plain words, icon + number on every card; costs show shortfalls in red, and a craft that would leave less Scrap
// than the cheapest tower says so before you click.

import './workbench.css';
import { el, button, costLine, resIcon, toast } from './ui.js';
import { BRANCH_COLOR, iconEl } from './screensKit.js';
import { WORKBENCH, RECIPES, RECIPE_KEYS, RECIPE_GROUPS, TOWER_MODS, TOWER_MOD_KEYS } from '../data/crafting.js';
import { SKILLS, SKILL_KEYS, SKILL_BRANCHES, SKILL_OFFERS } from '../data/skills.js';
import { CONFIG } from '../data/config.js';
import { DEFENSE } from '../data/waves.js';
import { TOWERS } from '../data/towers.js';

/** The Workbench step shows after a trip when something can be crafted (never on the guided first night). */
export function showBench(run) {
  if (!run || run.isGuidedDay?.()) return false;
  return RECIPE_KEYS.some((k) => !run.craftBlocked(k));
}

/**
 * A recipe's hand-made icon (icon_craft_<key>, 24×24) at a whole-number scale (Assets.iconScale: 1× in a 16u card
 * slot at 720p, 2× at 1080p), or null when the sprite isn't there (the glyph stays).
 */
function craftIcon(game, key, size = 16) {
  const k = `icon_craft_${key}`;
  return game?.assets?.hasSprite?.(k) ? iconEl(game, k, size) : null;
}

/** What a recipe makes, for its card: { icon (node), name, num, line, color }. */
function recipeLook(key, game) {
  const r = RECIPES[key];
  const m = r.mod ? TOWER_MODS[r.mod] : null;
  const name = m?.name || r.name;
  const icon = craftIcon(game, key) || (r.gives?.meds ? resIcon('pick_med') : el('span.wb-glyph', m?.icon || r.icon || '◆'));
  return { icon, name, num: m?.num || r.num, line: m?.line || r.line, color: m?.color || (r.group === 'blade' ? BRANCH_COLOR.Machete : r.group === 'relay' ? '#2ce8f5' : '#63c74d') };
}

/** Which towers a mod fits, in plain words ("Scrap Turret, Thorn Nest"). */
function fitsText(modKey) {
  const kinds = TOWER_MODS[modKey].kinds;
  const all = Object.values(TOWERS);
  const names = all.filter((t) => kinds.includes(t.kind)).map((t) => t.name);
  const not = all.filter((t) => !kinds.includes(t.kind)).map((t) => t.name);
  if (!not.length) return 'any tower';
  return not.length <= 2 && names.length > 2 ? `any tower but the ${not.join(' and the ')}` : names.join(', ');
}

/** A recipe's "what you have" line: mods waiting to fit, owned machete upgrades, med kits carried. */
function haveLine(run, key) {
  const r = RECIPES[key];
  if (r.mod) {
    const waiting = run.itemCount(r.mod);
    const fitted = run.towers.filter((t) => t.mod === r.mod).length;
    const parts = [];
    if (waiting) parts.push(`${waiting} to fit`);
    if (fitted) parts.push(`${fitted} fitted`);
    return parts.length ? el('div.wb-have.good', `You have ${parts.join(', ')}`) : null;
  }
  if (r.blade && (run.blade || []).includes(key)) return el('div.wb-have.good', '✓ On your machete');
  if (r.once && run.crafted?.[key]) return el('div.wb-have.good', '✓ Built');
  if (r.gives?.meds) return el('div.wb-have', `Carrying ${run.meds} of ${CONFIG.player.maxMeds}`);
  return null;
}

/**
 * The Workbench step. opts: { onCraft(key) } (save + re-render). Returns { node, refresh(), buttons() }.
 * Digits 1–9 craft the matching card (handled by the scene through `craftIndex`).
 */
export function workbenchView(game, opts = {}) {
  const node = el('div.wb');
  let order = [];
  const craft = (key) => {
    const run = game.run;
    const look = recipeLook(key, game);
    if (!run.craft(key)) {
      game.sfx.play('error');
      toast(game.ui, run.craftBlocked(key) || 'Can\'t make that now', 'bad', 2);
      return;
    }
    game.sfx.play('craft');
    const r = RECIPES[key];
    const after = r.mod ? `${look.name} made: fit it in night prep (click a tower)` : r.blade ? `${look.name}: your machete is upgraded` : `${look.name} made`;
    toast(game.ui, after, 'good', 2.6);
    refresh();
    opts.onCraft?.(key);
  };
  const refresh = () => {
    const run = game.run;
    node.innerHTML = '';
    order = [];
    if (!run) return;
    const cheapest = run.cheapestTowerScrap(game.meta);
    const coming = run.prepScrapComing();
    let n = 0;
    const rows = el('div.wb-rows');
    for (const { title, note, groups } of RECIPE_GROUPS) {
      const keys = RECIPE_KEYS.filter((k) => groups.includes(RECIPES[k].group));
      if (!keys.length) continue;
      const cards = keys.map((key) => {
        const r = RECIPES[key];
        const look = recipeLook(key, game);
        const reason = run.craftBlocked(key);
        n += 1;
        order.push(key);
        // Scrap note: never let a craft eat the Scrap a tower needs without saying so.
        let warn = null;
        if (WORKBENCH.warnScrap && r.cost.scrap && !reason) {
          const left = run.res.scrap - r.cost.scrap;
          if (left + coming < cheapest) warn = el('div.wb-warn', `Leaves ${left} Scrap${coming ? ` (+${coming} at night prep)` : ''}: less than a tower (${cheapest})`);
        }
        const done = (r.blade && (run.blade || []).includes(key)) || (r.once && run.crafted?.[key]);
        const btn = button(el('span', {}, done ? 'Owned' : 'Make', el('span.hotkey', String(n))), () => craft(key), {
          disabled: !!reason, reason, cls: `wb-craft${done ? ' wb-done' : ''}`, title: reason || `Make ${look.name}`,
        });
        return el(`div.wb-card${reason ? '.blocked' : ''}${done ? '.done' : ''}`, { style: { '--c': look.color }, title: r.mod ? `Fits: ${fitsText(r.mod)}` : '' },
          el('div.wb-top', {}, look.icon, el('b.wb-name', look.name)),
          look.num ? el('div.wb-num', look.num) : null,
          el('div.wb-line', look.line),
          r.mod ? el('div.wb-fits.small.muted', `Fits: ${fitsText(r.mod)}`) : null,
          haveLine(run, key),
          el('div.wb-foot', {}, done ? null : costLine(r.cost, run.res), el('span.grow'), btn),
          warn);
      });
      rows.append(el(`div.wb-group.wb-${groups[0]}`, { style: { '--n': keys.length } },
        el('div.wb-ghead', {}, el('h3', title), note ? el('span.small.muted', note) : null),
        el('div.wb-cards', {}, cards)));
    }
    node.append(rows);
    // Short on parts? Point at the night prep exchange (the night board's Scrap → component trade).
    const X = DEFENSE.exchange;
    if (X && run.night >= (X.fromNight || 1)) {
      node.append(el('div.wb-tip.small.muted', `Short on Circuits or Biofiber? Night prep trades ${X.scrap} Scrap for one (${X.max} a night).`));
    }
  };
  refresh();
  return { node, refresh, craftIndex: (i) => { const k = order[i]; if (k) craft(k); return !!k; } };
}

// ------------------------------------------------------------------ night prep: the tower's mod socket

/**
 * One compact row in night prep's tower panel: the fitted mod (icon, name, number) and, in prep or a lull,
 * a Fit button per mod you have that fits this tower, or Take out. Null when there's nothing to show.
 * `scene` is the DefenseScene (run, canBuild, fx, _saveBuild, sideDirty).
 */
export function modRow(scene, t) {
  const run = scene.run;
  const rec = t.rec;
  const fitted = TOWER_MODS[rec.mod];
  const can = TOWER_MOD_KEYS.filter((k) => k !== rec.mod && run.itemCount(k) > 0 && run.modFits(rec, k));
  if (!fitted && !can.length) return null;
  const game = scene.game;
  const done = (msg) => {
    game.sfx.play('mod_fit');
    const c = TOWER_MODS[rec.mod]?.color || '#c0cbdc';
    scene.fx?.ring(t.pos, { color: c, radius: 1, life: 0.4 });
    toast(game.ui, msg, 'good', 2);
    scene._saveBuild?.();
    scene.sideDirty = true;
  };
  // Line 1: "MOD [◎ Focusing Lens]" (or "empty socket"); line 2: its number, then the Fit / Swap / Take out buttons.
  const line = el('div.df-modline', {}, el('span.df-modk', { title: 'One socket per tower: mods are made at the Workbench after a trip' }, 'Mod'));
  if (fitted) {
    line.append(el('span.df-modchip', { style: { '--c': fitted.color }, title: `${fitted.name}: ${fitted.line}` },
      craftIcon(game, rec.mod, 12) || el('span.df-modic', fitted.icon), fitted.name));
  } else line.append(el('span.small.muted', 'empty socket'));
  const btns = el('div.df-modbtns', {}, fitted ? el('span.df-modnum', { title: fitted.line }, fitted.num) : null);
  if (scene.canBuild) {
    for (const k of can) {
      const m = TOWER_MODS[k];
      btns.append(button(el('span', {}, craftIcon(game, k, 12) || el('span.df-modic', { style: { '--c': m.color } }, m.icon), fitted ? `Swap: ${m.name}` : `Fit ${m.name}`),
        () => { if (run.fitMod(rec, k)) done(`${m.name} fitted: ${m.num}`); },
        { cls: 'df-modbtn', title: `${m.name}: ${m.num}. ${m.line} (you have ${run.itemCount(k)})` }));
    }
    if (fitted) {
      btns.append(button('Take out', () => { if (run.unfitMod(rec)) done(`${fitted.name} back on the Workbench`); },
        { cls: 'df-modbtn', title: 'Back to the Workbench: fit it in another tower' }));
    }
  }
  const row = el('div.df-modrow', {}, line, btns.childNodes.length ? btns : null);
  return row;
}

// ------------------------------------------------------------------ codex

/** The Codex's Skills (by branch, keystones marked) and Workbench (recipes, tower mods) sections. */
export function codexKit(game) {
  const out = [el('h3', 'Skills')];
  out.push(el('p.small.muted', `One skill point per trip (the goal, or a bonus task) and one per area boss. Picks lean toward branches you own; a branch's ★ keystone opens once you have ${SKILL_OFFERS.keystoneNeeds} of its skills.`));
  const list = el('div.codex-list.codex-skills');
  for (const b of SKILL_BRANCHES) {
    const keys = SKILL_KEYS.filter((k) => SKILLS[k].branch === b);
    list.append(el('div.codex-row.codex-branch', { style: { '--c': BRANCH_COLOR[b] } },
      el('div.codex-main', {},
        el('div.row.codex-title', {}, el('b', { style: { color: BRANCH_COLOR[b] } }, b), el('span.small.muted', `${keys.length} skills`)),
        keys.map((k) => {
          const s = SKILLS[k];
          return el(`div.small.codex-skill${s.keystone ? '.keystone' : ''}`, { title: s.desc },
            el('span.skill-ic', { style: { '--c': BRANCH_COLOR[b] } }, s.icon || '◆'), el('b', s.name), s.keystone ? el('span.skill-key', '★ Keystone') : null,
            ' ', el('span.amber', s.num || ''), el('div.muted.codex-skill-desc', s.desc));
        }))));
  }
  out.push(list);

  out.push(el('h3', 'Workbench'));
  out.push(el('p.small.muted', 'After each trip, turn spare parts into gear. Tower mods take one socket per tower and are fitted in night prep.'));
  const wl = el('div.codex-list.codex-recipes');
  for (const k of RECIPE_KEYS) {
    const r = RECIPES[k];
    const look = recipeLook(k, game);
    wl.append(el('div.codex-row.codex-recipe', { style: { '--c': look.color } },
      el('div.codex-main', {},
        el('div.row.codex-title', {}, look.icon, el('b', look.name), el('span.amber.small', look.num || ''), el('span.grow'), costLine(r.cost)),
        el('div.small', look.line),
        r.mod ? el('div.small.muted', `Fits: ${fitsText(r.mod)}`) : null)));
  }
  out.push(wl);
  return out;
}

