// The day's quest on screen (Stage 9, user feedback: "make the quests obvious … make the arrow more obvious").
// JungleScene owns the quest itself (objDef, objStep, objTargets, completeObjective); this draws it:
//   - the quest card: at the day's start (and on the quest key, default J) a card in the top-centre text lane
//     (ui.showBanner): QUEST, the name, its steps, the reward. Gone once you start walking (after QUEST.card.min s) or after a while.
//   - the tracker (bottom centre, where the GOAL strip was): QUEST + name + distance, the step to do now (with its
//     count / number), the reward hint; ford / home / bonus chips on the reward line. A finished step stays ticked for
//     QUEST.tick s; QUEST COMPLETE / FAILED when it's over.
//   - the edge arrows (quest, the guided day's crate, home): a big pixel arrow (questArt.js, 16 directions, bobbing
//     toward the target, flashing) with a distance badge, slid clear of the HUD boxes.
//   - a ◆ + ▼ marker over each target of the current step that is on screen; a small pointer by the player toward the
//     quest when it is far and off screen (only while nothing is after you); an amber light pool + light column over
//     each target (PixelGlow, like a beacon's), visible above the canopy.
// Tuning: QUEST in src/data/hud.js. Text: PRIMARY[*].name / steps[*].label ({at} = " at <place>") / boon.short /
// boon.hint in src/data/objectives.js.

import * as THREE from 'three';
import { el, showBanner, dismissBanner, snapLine } from '../ui/ui.js';
import { QUEST, HUD } from '../data/hud.js';
import { lightPool, beaconBeam } from '../core/PixelGlow.js';
import { arrowCanvas, diamondCanvas, chevronCanvas, cloneCanvas } from '../ui/questArt.js';
import { keyLabel } from '../core/Input.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** A step's text: its label with `{at}` → " at <place name>" (or nothing when the site has no name). */
export function stepText(step, site) {
  if (!step) return '';
  return (step.label || '').replace('{at}', site?.name ? ` at ${site.name}` : '');
}

/** The interact prompt for a step: its `verb`, else its label without the place. */
export function stepVerb(step) {
  return step.verb || stepText(step, null);
}

export class JungleQuest {
  constructor(scene) {
    this.sc = scene;
    this.game = scene.game;
    this.def = scene.objDef;
    this.beams = new Map();   // objective target → light pool (+ column)
    this.tickT = 0;           // a finished step stays ticked this long
    this.tickText = '';
    this.card = null;         // { node, t, x, z } while the quest card is up
    this.cache = {};
  }

  // ================================================================== build

  /** Builds the tracker, the arrows, the markers; `h` = the scene's HUD (h.ford is the scene's ford chip). */
  build(h) {
    const def = this.def;
    // ---- tracker (bottom centre)
    this.icon = cloneCanvas(diamondCanvas(9), 'j-qicon');
    this.tag = el('span.j-qtag', 'QUEST');
    this.name = el('span.j-qname', def.name);
    this.distArrow = el('canvas.j-qdarr');
    this.distArrow.width = this.distArrow.height = 11;
    this.distText = el('span', '');
    this.dist = el('span.j-qdist', {}, this.distArrow, this.distText);
    this.box = el('span.j-qbox', '☐');
    this.stepLbl = el('span.j-qlbl', '');
    this.stepNum = el('span.j-qnum', '');
    this.reward = el('span.j-qrew', '');
    h.extract = el('span.j-dir.ext', {}, el('span.x-dirarrow', '➤'), el('span', ''));
    h.optList = el('span.j-opts');
    this.root = el('div.j-quest', { title: def.brief ? `${def.name}: ${def.brief}` : def.name },
      el('div.j-qhead', {}, this.icon, this.tag, this.name, el('span.j-qgrow'), this.dist),
      el('div.j-qstep', {}, this.box, this.stepLbl, this.stepNum),
      el('div.j-qfoot', {}, this.reward, h.ford, h.extract, h.optList));
    // ---- edge arrows, the on-screen markers, the pointer by the player
    this.edges = {
      quest: this._mkEdge('quest', 'amber', true),
      crate: this._mkEdge('crate', 'amber', true),
      home: this._mkEdge('home', 'cyan', false),
    };
    this.marks = [];
    this.orbit = el('div.j-qorbit', { style: { display: 'none' } }, el('canvas'));
    this.orbitDir = -1;
    // The interaction prompt and the bottom hints sit on top of the tracker, whatever its height (--qh).
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._placePrompt(h)) : null;
    this._ro?.observe(this.root);
    return [this.root, this.edges.quest.node, this.edges.crate.node, this.edges.home.node, this.orbit];
  }

  _placePrompt(h) {
    if (!this.root.isConnected) return;
    const st = this.game.stage.getBoundingClientRect(), r = this.root.getBoundingClientRect();
    // (on the UI root: the jungle's bottom hints read it too)
    if (r.height > 0) this.game.ui.style.setProperty('--qh', `${Math.round(st.bottom - r.top)}px`);
  }

  _mkEdge(kind, ramp, icon) {
    const c1 = el('canvas'), c2 = el('canvas.hi');
    const arr = el('div.j-qarr', {}, c1, c2);
    const txt = el('span', '');
    const badge = el('div.j-qbadge', {}, icon ? cloneCanvas(diamondCanvas(9), 'j-qbicon') : null, txt);
    const node = el(`div.j-qedge.${kind}`, { style: { display: 'none' } }, arr, badge);
    return { node, arr, c1, c2, badge, txt, ramp, dir: -1, text: null, bw: 0, bh: 0 };
  }

  /** The world's texel size in CSS px (×2 at 720p, ×3 at 1080p). */
  _tx() { return this.game._layout().k / (window.devicePixelRatio || 1); }

  // ================================================================== quest card

  /** Show the quest card in the top-centre lane (the day's start, the quest key). */
  showCard() {
    const sc = this.sc, def = this.def, h = sc.hud;
    if (!h || sc.objectiveDone || sc.objectiveFailed) return;
    if (this.card?.node.isConnected) return;
    const site = (i) => sc.objTargets.find((t) => t.step === i && t.site)?.site;
    const steps = def.steps.map((s, i) => el(`div.j-qc-step${i < sc.objStep ? '.done' : ''}`, {},
      el('span.j-qc-box', i < sc.objStep ? '✔' : '☐'), el('span', stepText(s, site(i)) + (s.count > 1 ? ` (0/${s.count})` : ''))));
    // The track goal's three "follow" steps read as one line on the card.
    const shown = def.steps.some((s) => s.type === 'track') ? steps.filter((_, i) => def.steps[i].type !== 'track' || i === 0) : steps;
    const key = (code) => el('span.key', keyLabel(code));
    // (not an .x-banner: those are centred on 22% of the height; the card is anchored from the top, jungle.css)
    const node = el('div.j-qcard', {},
      el('div.j-qc-head', {}, cloneCanvas(diamondCanvas(9), 'j-qicon'), el('span', 'QUEST'), el('span.j-qc-area', `· ${sc.D.name}`)),
      el('div.j-qc-name', def.name),
      def.brief && def.steps.length > 1 ? el('div.j-qc-brief', def.brief) : null,   // (one step says it all)
      el('div.j-qc-steps', {}, shown),
      el('div.j-qc-rew', {}, el('span.j-qc-k', '★ Reward: '), def.boon?.short || ''),
      el('div.j-qc-sp', '+1 skill point when it is done'),
      el('div.j-qc-keys', {}, 'Follow the ', el('span.amber', 'amber arrow'), ' · ', key(this.game.input.keyFor('quest')), ' this card · ', key(this.game.input.keyFor('map')), ' map'));
    this.card = { node, t: 0, x: sc.player.pos.x, z: sc.player.pos.z };
    showBanner(h.root, node, { prio: 1, time: QUEST.card.time, toasts: this.game.ui, onShow: () => { this.game.sfx.play('coach'); if (this.card?.node === node) { this.card.t = 0; this.card.x = sc.player.pos.x; this.card.z = sc.player.pos.z; } } });
  }

  /** The quest key: open the card, or close it. */
  toggleCard() {
    if (this.card?.node.isConnected) { dismissBanner(this.sc.hud.root, this.card.node); this.card = null; return; }
    this.showCard();
  }

  _updateCard(dt) {
    const c = this.card;
    if (!c) return;
    if (!c.node.isConnected) { if (c.shown) this.card = null; return; }
    c.shown = true;
    c.t += dt;
    const p = this.sc.player.pos;
    if (c.t >= QUEST.card.min && Math.hypot(p.x - c.x, p.z - c.z) >= QUEST.card.moveDist) {
      dismissBanner(this.sc.hud.root, c.node);
      this.card = null;
    }
  }

  // ================================================================== quest events

  /** A step is done (JungleScene._advanceStep): it stays ticked on the tracker for a moment. */
  onStep(prev) {
    const s = this.def.steps[prev];
    if (!s) return;
    this.tickText = stepText(s, this._site(prev));
    this.tickT = QUEST.tick;
    this._flash('step');
  }

  /** The quest is done (JungleScene.completeObjective): QUEST COMPLETE + its reward, a burst, the tracker flashes. */
  complete() {
    const sc = this.sc, def = this.def;
    const node = el('div.x-banner.j-qdone', {},
      el('div.x-banner-t', 'QUEST COMPLETE'),
      el('div.x-banner-s.j-qd-rew', `★ ${def.boon?.short || ''}`),
      el('div.x-banner-x', def.rewardAtDelivery
        ? 'The drone has it: the reward is yours. Keep exploring, or head home'
        : 'Head home to claim it: follow the cyan arrow'));
    node.lastChild.style.animationDelay = '0.9s';
    // Its centred lines on whole pixels (snapLine), once the title's pop-in has settled.
    // A wrapped line (a long reward at 1024×600) goes left-aligned instead: its lines then start on whole pixels too.
    const snap = () => setTimeout(() => {
      for (const n of node.children) {
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) n.style.textAlign = 'left'; else snapLine(n);
      }
    }, 400);
    showBanner(sc.hud?.root || this.game.ui, node, { prio: 1, time: QUEST.done, toasts: this.game.ui, onShow: snap });
    const p = sc.player.pos;
    sc.fx.ring({ x: p.x, z: p.z }, { color: '#feae34', radius: 2.6, life: 0.7 });
    sc.fx.burst({ x: p.x, z: p.z }, { color: '#fee761', color2: '#ffffff', count: 26, speed: 2.6, up: 4, life: 0.8, y: 1 });
    this._flash('won');
    if (this.card?.node.isConnected) dismissBanner(sc.hud.root, this.card.node);
    this.card = null;
  }

  _flash(cls) {
    const r = this.root;
    r.classList.remove('step', 'won');
    void r.offsetWidth;
    r.classList.add(cls);
  }

  _site(i) { return this.sc.objTargets.find((t) => t.step === i && t.site)?.site; }

  // ================================================================== big map

  /** The quest on the big map (Tab): name, every step ✔ / ☐, the reward. */
  bigHtml() {
    const sc = this.sc, def = this.def;
    const head = `<div class="j-qbig"><span class="j-qtag${sc.objectiveDone ? ' good' : sc.objectiveFailed ? ' bad' : ''}">${sc.objectiveDone ? 'QUEST COMPLETE' : sc.objectiveFailed ? 'QUEST FAILED' : 'QUEST'}</span> <b>${esc(def.name)}</b></div>`;
    const cnt = (s, i) => (s.count > 1 ? ` (${i < sc.objStep ? s.count : i === sc.objStep ? sc.stepCount : 0}/${s.count})` : '');
    const rows = def.steps.map((s, i) => {
      const cls = i < sc.objStep || sc.objectiveDone ? 'done' : i === sc.objStep && !sc.objectiveFailed ? 'cur' : '';
      return `<span class="x-step ${cls}">${cls === 'done' ? '✔' : '☐'} ${esc(stepText(s, this._site(i)))}${cnt(s, i)}</span>`;
    });
    const rew = `<div class="j-qrew">★ Reward: ${esc(def.boon?.short || '')}${sc.objectiveDone && !def.rewardAtDelivery ? ' <span class="muted">(head home to claim it)</span>' : ''}</div>`;
    return head + rows.join('<br>') + rew;
  }

  // ================================================================== per frame

  /** Live targets of the current step: { t, x, z, d, top } (top = the sprite's height in tiles). */
  targets() {
    const sc = this.sc, p = sc.player.pos;
    if (sc.objectiveDone || sc.objectiveFailed) return [];
    const out = [];
    for (const t of sc.objTargets) {
      if (t.step !== sc.objStep || t.done || t.enemy?.dead) continue;
      const live = t.enemy && !t.enemy.dead;
      const x = live ? t.enemy.x : t.x, z = live ? t.enemy.z : t.z;
      const vis = live ? t.enemy.vis : t.vis;
      out.push({ t, x, z, d: Math.hypot(x - p.x, z - p.z), top: vis?.userData?.vis?.height ?? 1 });
    }
    return out;
  }

  _setText(key, node, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    node.textContent = val;
  }
  _setHtml(key, node, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    node.innerHTML = val;
  }
  _setCls(key, node, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    node.className = val;
  }

  /**
   * Per frame (JungleScene._updateHud): o = { ot (the nearest target, scene._objectiveTarget()), ex (nearest way
   * home), homeNow, cc (the guided day's coached crate), rects (HUD boxes) }.
   */
  update(dt, o) {
    const sc = this.sc, def = this.def, h = sc.hud;
    this._updateCard(dt);
    this.tickT = Math.max(0, this.tickT - dt);
    // ---- tracker
    const done = sc.objectiveDone, failed = sc.objectiveFailed;
    this._setText('tag', this.tag, done ? 'QUEST COMPLETE' : failed ? 'QUEST FAILED' : 'QUEST');
    this._setCls('tagc', this.tag, `j-qtag${done ? ' good' : failed ? ' bad' : ''}`);
    const s = def.steps[sc.objStep];
    let box = '☐', lbl = '', boxCls = 'j-qbox', lblCls = 'j-qlbl', num = '';
    if (failed) { box = '✘'; lbl = 'Loot what you can and head home'; boxCls += ' bad'; lblCls += ' bad'; }
    else if (done) {
      box = '✔'; boxCls += ' good'; lblCls += ' good';
      lbl = def.rewardAtDelivery ? 'Reward secured: keep exploring, or head home' : 'Head home to claim the reward';
    } else if (this.tickT > 0) { box = '✔'; lbl = this.tickText; boxCls += ' good'; lblCls += ' ticked'; }
    else if (s) {
      lbl = stepText(s, this._site(sc.objStep));
      if (s.count > 1) lbl += ` (${sc.stepCount}/${s.count})`;
      // The step number, for quests with more than one step (not the Alpha's: its labels count the tracks).
      const n = def.steps.length;
      if (n > 1 && def.stepNums !== false) num = `${sc.objStep + 1}/${n}`;
    }
    this._setText('box', this.box, box);
    this._setCls('boxc', this.box, boxCls);
    const note = !done && !failed && this.tickT <= 0 ? sc.goals?.note() || '' : '';   // the engineer's health, time left…
    this._setHtml('lbl', this.stepLbl, esc(lbl) + note);
    this._setCls('lblc', this.stepLbl, lblCls);
    this._setText('num', this.stepNum, num);
    this._setText('rew', this.reward, failed ? '' : `★ ${def.boon?.hint || def.boon?.short || ''}`);
    // Distance pill: to the quest, or home once it's done.
    const ex = o.ex;
    const tgt = done || failed ? ex : o.ot;
    this.dist.style.display = tgt ? '' : 'none';
    if (tgt) {
      const p = sc.player.pos;
      const d = Math.round(Math.hypot(tgt.x - p.x, tgt.z - p.z));
      this._setText('dist', this.distText, done || failed ? `${ex.name} ${d} m` : `${d} m`);
      this._setCls('distc', this.dist, `j-qdist${done || failed ? ' home' : ''}`);
      this._drawDistArrow(tgt, done || failed ? 'cyan' : 'amber');
    }
    // Home chip on the reward line: only when going home is next but the quest isn't over (sunset, low health).
    const homeChip = o.homeNow && !done && !failed;
    h.extract.style.display = homeChip ? '' : 'none';
    if (homeChip) {
      sc._dirArrow(h.extract.firstChild, ex.x, ex.z);
      this._setText('ext', h.extract.lastChild, `${ex.name} ${Math.round(ex.d)} m`);
    }
    this._setText('opts', h.optList, sc.optionalsDone.length ? `+${sc.optionalsDone.length} bonus` : '');
    // (the tracker's height can change after a re-pin or a wrap the ResizeObserver saw first: check it here too)
    const qh = this.root.offsetHeight + this.root.offsetTop;
    if (qh !== this._qhKey) { this._qhKey = qh; this._placePrompt(h); }

    // ---- in the world: markers over on-screen targets, the edge arrows, the pointer, the beams
    const tg = this.targets();
    const hidden = sc.mapOpen || sc.ending;
    // A river in the way (the bridge hint is up): the arrow, marker and pointer lead to the bridge first (critic Q2 §4).
    const pp = sc.player.pos;
    const via = sc._ford && o.ot && !done && !failed
      ? { x: sc._ford.x, z: sc._ford.z, d: Math.hypot(sc._ford.x - pp.x, sc._ford.z - pp.z), top: QUEST.mark.bridgeTop } : null;
    const lead = via || o.ot;
    // The HUD boxes (+ a banner, the quest card or an area boss's bar in the top centre), a little inflated so a badge
    // never touches one.
    const st = this.game.stage.getBoundingClientRect(), pad = Math.round(3 * this.game.u);
    const rects = [...o.rects, ...[...h.root.querySelectorAll(':scope > .x-banner, :scope > .j-qcard, :scope > .j-bossbar')].filter((n) => n.style.display !== 'none').map((n) => {
      const r = n.getBoundingClientRect();
      return { l: r.left - st.left, t: r.top - st.top, r: r.right - st.left, b: r.bottom - st.top };
    })].map((r) => ({ l: r.l - pad, t: r.t - pad, r: r.r + pad, b: r.b + pad }));
    const onScreen = this._placeMarks(hidden ? [] : via ? [via, ...tg] : tg, via, rects);
    // One arrow at a time: when the quest's target is home (lead him / carry it home) and the cyan Home arrow is up,
    // only the Home arrow shows (critic Q: two arrows, same target).
    const homes = [sc.relayPos, ...sc.data.pylons.filter((py) => sc.state.pylons.has(py.id))];
    const questHome = !!o.ot && homes.some((q) => Math.hypot(o.ot.x - q.x, o.ot.z - q.z) < 4);
    // (going home over a bridge: the amber bridge arrow, not a cyan one straight across the water)
    const homeArrow = !hidden && o.homeNow && ex.d > 6 && !(via && questHome);
    const qLabel = via ? `Bridge ${Math.round(via.d)} m · quest ${Math.round(o.ot.d)} m` : `${Math.round(o.ot?.d || 0)} m`;
    const qa = this._edge(this.edges.quest, hidden || o.cc || !o.ot || (homeArrow && questHome) ? null : lead, rects, qLabel);
    const rc = this._edge(this.edges.crate, hidden ? null : o.cc, qa ? [...rects, qa] : rects,
      o.cc ? `Crate ${Math.round(Math.hypot(o.cc.x - sc.player.pos.x, o.cc.z - sc.player.pos.z))} m` : '');
    this._edge(this.edges.home, homeArrow ? ex : null, [...rects, qa, rc].filter(Boolean), `${ex.name} ${Math.round(ex.d)} m`);
    this._updateOrbit(hidden || o.cc || onScreen ? null : lead, qa ? [...rects, qa] : rects);   // (never on the big arrow or its badge)
    this._updateBeams(tg);
  }

  _drawDistArrow(tgt, ramp) {
    const sc = this.sc, p = sc.player.pos;
    const a = this._screenAngle(p.x, p.z, tgt.x, tgt.z);
    const dirs = QUEST.arrow.dirs;
    const dir = ((Math.round(a / ((Math.PI * 2) / dirs)) % dirs) + dirs) % dirs;
    const key = `${dir}:${ramp}`;
    if (this.cache.darr === key) return;
    this.cache.darr = key;
    const g = this.distArrow.getContext('2d');
    g.clearRect(0, 0, 11, 11);
    g.drawImage(arrowCanvas(dir, dirs, 11, ramp), 0, 0);
  }

  /** Screen-space angle (y down) from one world point to another (the camera is tilted: project both). */
  _screenAngle(x0, z0, x1, z1) {
    const g = this.game, cam = this.sc.camera;
    const a = g.project(new THREE.Vector3(x0, 0.5, z0), cam), b = g.project(new THREE.Vector3(x1, 0.5, z1), cam);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  _onScreen(pr) {
    const sw = this.game.stage.clientWidth, sh = this.game.stage.clientHeight, m = HUD.edgeMargin * this.game.u;
    return pr.x > m && pr.y > m && pr.x < sw - m && pr.y < sh - m;
  }

  /** ◆ + ▼ over every on-screen target (pooled). Returns true when the nearest one is on screen. */
  _placeMarks(tg, lead = null, rects = []) {
    const sc = this.sc;
    const v = new THREE.Vector3(), tx = this._tx();
    let n = 0, nearestOn = false, nd = Infinity;
    for (const t of tg) {
      const pr = this.game.project(v.set(t.x, 0.5, t.z), sc.camera);
      const on = this._onScreen(pr);
      // (returns whether the lead target, the bridge when one is set, else the nearest target, is on screen)
      if (lead ? t === lead : t.d < nd) { nd = t.d; nearestOn = on; }
      if (!on || t.d < QUEST.mark.near) continue;
      const top = this.game.project(v.set(t.x, t.top + QUEST.mark.lift, t.z), sc.camera);
      const m = this._mark(n++);
      m.style.display = '';
      if (!m._wh?.[0] || m._tx !== tx) { m._tx = tx; m._wh = [m.offsetWidth, m.offsetHeight]; }
      // (kept on screen: a target near the top edge gets its marker clamped down over it)
      const y = Math.max(Math.round(top.y), m._wh[1] + Math.round(2 * tx));
      let x = Math.round(top.x) - Math.round(m._wh[0] / 2);
      // (a target under a HUD box, e.g. the minimap: the marker steps out sideways, toward the screen centre)
      const r = rects.find((q) => x + m._wh[0] > q.l && x < q.r && y > q.t && y - m._wh[1] < q.b);
      if (r) x = r.l + r.r > this.game.stage.clientWidth ? Math.round(r.l) - m._wh[0] : Math.round(r.r);
      m.style.transform = `translate(${x}px, ${y - m._wh[1]}px)`;
    }
    for (let i = n; i < this.marks.length; i++) this.marks[i].style.display = 'none';
    return tg.length > 0 && nearestOn;
  }

  _mark(i) {
    if (!this.marks[i]) {
      const m = el('div.j-qmark', {}, cloneCanvas(diamondCanvas(15), 'j-qm-d'), cloneCanvas(chevronCanvas(13), 'j-qm-c'));
      this.sc.hud.root.append(m);
      this.marks[i] = m;
    }
    return this.marks[i];
  }

  /**
   * An edge arrow toward `target` (or hidden when there's none or it is on screen): the arrow on the stage edge, its
   * distance badge inward of it, both slid clear of the HUD boxes in `avoid`. Returns its box (stage px) or null.
   */
  _edge(E, target, avoid, label) {
    if (!target) { if (E.shown !== false) { E.node.style.display = 'none'; E.shown = false; } return null; }
    const g = this.game, A = QUEST.arrow;
    const pr = g.project(new THREE.Vector3(target.x, 0.5, target.z), this.sc.camera);
    if (this._onScreen(pr)) { if (E.shown !== false) { E.node.style.display = 'none'; E.shown = false; } return null; }
    if (!E.shown) { E.node.style.display = ''; E.shown = true; }
    const tx = this._tx();
    const sw = g.stage.clientWidth, sh = g.stage.clientHeight;
    const ap = A.scale * tx;   // CSS px per art pixel (whole multiples of the world texel)
    const size = A.size * ap, half = size / 2, m = half + A.margin * tx;
    const cx = sw / 2, cy = sh / 2;
    const a = Math.atan2(pr.y - cy, pr.x - cx);
    const ca = Math.cos(a), sa = Math.sin(a);
    const k = Math.min((sw / 2 - m) / Math.abs(ca || 1e-6), (sh / 2 - m) / Math.abs(sa || 1e-6));
    let x = cx + ca * k, y = cy + sa * k;
    // 16 pixel-art directions; the arrow bobs toward its target by whole texels.
    const dirs = A.dirs;
    const dir = ((Math.round(a / ((Math.PI * 2) / dirs)) % dirs) + dirs) % dirs;
    if (E.dir !== dir || E.tx !== tx) {
      E.arr.style.width = E.arr.style.height = `${size}px`;
      E.dir = dir; E.tx = tx;
      for (const [c, ramp] of [[E.c1, E.ramp], [E.c2, `${E.ramp === 'cyan' ? 'cyanBright' : 'bright'}`]]) {
        const src = arrowCanvas(dir, dirs, A.size, ramp, A.glow);
        c.width = src.width; c.height = src.height;
        const cg = c.getContext('2d');
        cg.clearRect(0, 0, c.width, c.height);
        cg.drawImage(src, 0, 0);
      }
      const da = (dir * Math.PI * 2) / dirs;
      E.arr.style.setProperty('--bx', `${Math.round(Math.cos(da) * A.bob) * ap}px`);
      E.arr.style.setProperty('--by', `${Math.round(Math.sin(da) * A.bob) * ap}px`);
    }
    if (E.text !== label || E.mtx !== tx) { E.text = label; E.mtx = tx; E.txt.textContent = label; E.bw = E.badge.offsetWidth; E.bh = E.badge.offsetHeight; }
    // The badge sits inward of the arrow (toward the screen centre).
    const ext = Math.abs(ca) * (E.bw / 2) + Math.abs(sa) * (E.bh / 2);
    const off = Math.max(half, (Math.abs(ca) + Math.abs(sa)) * half) + A.gap * tx + ext;   // (the arrow box's reach that way, its corners are empty)
    let bx = x - ca * off, by = y - sa * off;
    const box = () => ({ l: Math.min(x - half, bx - E.bw / 2), t: Math.min(y - half, by - E.bh / 2), r: Math.max(x + half, bx + E.bw / 2), b: Math.max(y + half, by + E.bh / 2) });
    const side = Math.abs(x - m) < 1 || Math.abs(x - (sw - m)) < 1;   // on the left/right edge: slide vertically
    // Slide along the edge (left/right edge: vertically) by the smallest shift that clears every HUD box and stays on
    // the stage: the candidates are "no shift" and either side of each box.
    const hit = (b0, d, vert) => {
      const b = vert ? { l: b0.l, r: b0.r, t: b0.t + d, b: b0.b + d } : { l: b0.l + d, r: b0.r + d, t: b0.t, b: b0.b };
      if (b.l < 0 || b.t < 0 || b.r > sw || b.b > sh) return true;
      return avoid.some((r) => !(b.r <= r.l || b.l >= r.r || b.b <= r.t || b.t >= r.b));
    };
    // The smallest shift that clears every box: along the edge, or straight in from it (critic Q: a target due south
    // slid 300 px along the bottom edge to a far corner; now it sits just above the tracker, on its true bearing).
    const slide = (axes) => {
      const b0 = box(), cands = [];
      for (const vert of axes) for (const r of avoid) cands.push([vert ? r.t - b0.b : r.l - b0.r, vert], [vert ? r.b - b0.t : r.r - b0.l, vert]);
      cands.sort((p, q) => Math.abs(p[0]) - Math.abs(q[0]));
      const c = cands.find(([d, vert]) => !hit(b0, d, vert));
      if (!c) return false;
      const [d, vert] = c;
      if (vert) { y += d; by += d; } else { x += d; bx += d; }
      return true;
    };
    if (hit(box(), 0, side) && !slide([side, !side])) {
      // A crowded stretch of edge (top-left: the panel and a banner): go to its nearer corner, then along the other edge.
      const sx = x, sy = y, sbx = bx, sby = by;
      if (side) { const d = (y < cy ? m : sh - m) - y; y += d; by += d; } else { const d = (x < cx ? m : sw - m) - x; x += d; bx += d; }
      if (!slide([!side])) { x = sx; y = sy; bx = sbx; by = sby; }
    }
    E.arr.style.transform = `translate(${Math.round(x - half)}px, ${Math.round(y - half)}px)`;
    E.badge.style.transform = `translate(${Math.round(bx - E.bw / 2)}px, ${Math.round(by - E.bh / 2)}px)`;
    return box();
  }

  /** The small pointer by the player toward a far, off-screen quest (not while something is after you). */
  _updateOrbit(ot, rects = []) {
    const sc = this.sc, O = QUEST.orbit, p = sc.player.pos;
    const busy = ot && sc.enemies.some((e) => !e.dead && e.alerted && Math.hypot(e.x - p.x, e.z - p.z) < O.calm);
    if (!ot || ot.d < O.minDist || busy) { if (this.orbitOn !== false) { this.orbit.style.display = 'none'; this.orbitOn = false; } return; }
    if (!this.orbitOn) { this.orbit.style.display = ''; this.orbitOn = true; }
    const g = this.game, tx = this._tx();
    const pp = g.project(new THREE.Vector3(p.x, 0.6, p.z), sc.camera);
    const a = this._screenAngle(p.x, p.z, ot.x, ot.z);
    const dirs = QUEST.arrow.dirs;
    const dir = ((Math.round(a / ((Math.PI * 2) / dirs)) % dirs) + dirs) % dirs;
    const c = this.orbit.firstChild;
    if (this.orbitDir !== dir) {
      this.orbitDir = dir;
      const src = arrowCanvas(dir, dirs, O.size, 'amber');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
    }
    const da = (dir * Math.PI * 2) / dirs, R = O.radius * tx, half = (O.size * tx) / 2;
    const ox = pp.x + Math.cos(da) * R, oy = pp.y + Math.sin(da) * R;
    // Never on a HUD box (the player low on screen: the tracker).
    const onHud = rects.some((r) => ox + half > r.l && ox - half < r.r && oy + half > r.t && oy - half < r.b);
    this.orbit.style.visibility = onHud ? 'hidden' : '';
    this.orbit.style.transform = `translate(${Math.round(ox - half)}px, ${Math.round(oy - half)}px)`;
  }

  /** An amber light pool + column over each target of the current step (hidden when you're right there). */
  _updateBeams(tg) {
    const sc = this.sc, B = QUEST.beam;
    const keep = new Set();
    for (const t of tg) {
      keep.add(t.t);
      let m = this.beams.get(t.t);
      if (!m) {
        m = lightPool(B);
        if (B.beam) { const b = beaconBeam(B); b.position.set(0, 0, b.position.y); m.add(b); m.userData.beam = b; }
        sc.three.add(m);
        this.beams.set(t.t, m);
      }
      m.position.set(t.x, 0.02, t.z);
      m.visible = t.d >= B.hideNear && !sc.mapOpen;
    }
    for (const [k, m] of this.beams) if (!keep.has(k)) { this._disposeBeam(m); this.beams.delete(k); }
  }

  _disposeBeam(m) {
    m.removeFromParent();
    m.geometry?.dispose();
    m.material?.dispose();
    m.userData.beam?.material.dispose();
  }

  dispose() {
    for (const m of this.beams.values()) this._disposeBeam(m);
    this.beams.clear();
    this._ro?.disconnect();
    this.game.ui.style.removeProperty('--qh');
  }
}

