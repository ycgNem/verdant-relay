// Exploration enemies: Crawler, Skitter, Feral Scavenger, Rival Scavenger, Spitter, Razorback, Thorn Stalker.
//
// State machine:  spawn → idle ⇄ chase → windup → attack → recover → chase …   (+ stunned)
//   idle     stands / wanders near home until the player is within `detect` with line of sight
//            (or it is hit, or a neighbour raises the alarm).
//   chase    paths toward the player (straight line when the way is clear, otherwise down the
//            scene's flow field). A creature that can't attack yet (cooldown, or no free attack token)
//            holds a slot on your flanks / back instead of walking in (critic I #2, `attackers`);
//            Scavengers keep their distance and strafe; Spitters are rooted. A walker that can't reach
//            you throws (Ferals) or hacks its way through the brush (critic I #5).
//   windup   EVERY attack is telegraphed (`this.mv` = the move): lunges show a ground ring where they land
//            (it tracks where you're heading, then locks: critic I #1); the Feral's spear and ranged shots an
//            aim line (tracks, then locks); charges the full lane; the elite's stomp a ring round itself;
//            the Thorn Stalker a ring under you.
//   attack   lunge / shot / charge / stomp along the locked telegraph. A charge that hits a wall stuns.
//
// The Thorn Stalker (`attack: 'ambush'`) runs its own loop (_updateAmbush): under the brush (hidden, only
// rustling shows) → wind-up ring under you → erupt → exposed → burrow → …
//
// Fairness rules: telegraphs always match the real hit area; spawns emerge over spawnInTime with a
// ground warning and can't attack while emerging; nothing spawns near the player (see the scene).
// A deflect (Player.tryDeflect) turns a lunge, charge, spear or glob away and leaves the attacker reeling.

import * as THREE from 'three';
import { CONFIG, JUICE, SPLAT, DEFLECT, ROLL, POISE } from '../data/config.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { setAnim, setFacing, updateVisual, flashVisual, setBaseColor, animLength, animHitFrac, setAnimSpeed, CARD_MASK_REF } from '../core/Assets.js';
import { shade } from '../core/Fx.js';
import { rayLength, castRay } from '../world/collide.js';
import { nightTune } from '../data/config.js';
import { CROWD, BRUSH, SPORES } from '../data/jungle.js';
import { inFootprint } from '../world/Solid.js';

let barTex = null;
function barMaterial(color) {
  if (!barTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 2, 2);
    barTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: barTex, color, depthTest: false, depthWrite: false, transparent: true });
}

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LUNGES = { lunge: true, thrust2: true };
const CHARGES = { charge: true, charge2: true };

/** The player's velocity for leading an attack, capped at walking speed (a roll's burst isn't extrapolated). */
function leadVel(p) {
  const vx = p.vel?.x || 0, vz = p.vel?.z || 0, v = Math.hypot(vx, vz), max = CONFIG.player.speed;
  return v > max ? { x: vx * max / v, z: vz * max / v } : { x: vx, z: vz };
}

/** Distance from (px, pz) to the segment (ax, az)–(bx, bz). */
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Make a ground ring telegraph (Fx.ringTele) read through foliage (critic I2 #9): a copy of it drawn only where
 * something nearer covers it (depthFunc GREATER, after every card), never over the player's own texels (the card-mask
 * stencil). It is the ring mesh's child, so it moves, animates and goes away with it.
 */
function xrayRing(tele) {
  const m = tele?.group;
  if (!m?.material?.map) return;
  const mat = new THREE.MeshBasicMaterial({
    map: m.material.map, alphaTest: 0.5, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide,
    stencilWrite: true, stencilWriteMask: 0x00, stencilRef: CARD_MASK_REF, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  });
  const x = new THREE.Mesh(m.geometry, mat);
  x.renderOrder = 38;
  x.userData.noSnap = true;
  m.add(x);
}

/** A positional sound; new names fall back to older ones until the audio data has them. */
function sfxAt(game, x, z, ...names) {
  const s = game.sfx;
  for (const n of names) if (s.playAt ? s.playAt(n, x, z) : s.play(n)) return;
}

export class ExploreEnemy {
  constructor(scene, key, x, z, opts = {}) {
    const X = CONFIG.expedition;
    this.scene = scene;
    this.game = scene.game;
    this.key = key;
    this.def = EXPLORE_ENEMIES[key];
    this.elite = !!opts.elite;
    this.objective = !!opts.objective;
    this.guard = !!opts.guard;
    this.id = opts.id || null;
    this.site = opts.site ?? -1;
    // Undergrowth handling: Crawlers/Skitters slip through it, Razorbacks bulldoze it, the Thorn Stalker
    // tunnels under it, the rest path around.
    this.moveOpts = this.def.brush === 'through' || this.def.brush === 'under' ? { throughBrush: true }
      : this.def.brush === 'crash' ? { onBrush: (tx, tz) => scene.crashBrush?.(tx, tz, this) } : {};
    this._hit = {};
    this.moveOptsHit = { ...this.moveOpts, hit: this._hit };
    const night = this.game.run.night;
    this.night = night;
    const scale = this.elite ? X.elite.scale : 1;
    this.scale = scale;
    this.maxHp = Math.round(this.def.hp * nightTune('enemyHp', night) * (this.elite ? nightTune('eliteHp', night) : 1));
    this.hp = this.maxHp;
    this.damage = Math.round(this.def.damage * nightTune('enemyDamage', night) * (this.elite ? X.elite.damageMult : 1));
    if (this.def.spear) this.spearDamage = Math.round(this.def.spear.damage * nightTune('enemyDamage', night));
    // Elites telegraph longer, so their big attacks are always readable; day 1 telegraphs are slower (it teaches).
    this.windup = this.def.windup * (this.elite ? X.elite.windupMult : 1) * nightTune('enemyWindup', night);
    this.radius = Math.max(0.22, this.def.size * 0.45 * scale);
    this.x = x; this.z = z;
    this.home = { x, z };
    this.kb = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.face = { x: 1, z: 0 };
    this.cd = 0.6 + Math.random() * 0.6;
    this.alerted = !!opts.alerted;
    this.dead = false;
    this.assist = true;
    this.state = opts.spawnIn ? 'spawn' : 'idle';
    this.stateT = opts.spawnIn ? X.spawnInTime : 0;
    this.wanderT = Math.random() * 2;
    this.wanderTo = null;
    this.senseT = Math.random() * 0.2;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 1 + Math.random() * 1.5;
    this.slotT = 0;
    this.tele = null;
    this.hitDone = false;
    this.barT = 0;
    this.seenT = 0;
    this.walkT = Math.random() * 10;
    this.mv = null;              // the move being wound up / performed
    this.spearCd = 0;
    this.stuckT = 0;
    this.bestD = Infinity;
    this.hackT = 0;
    this.chokeT = 0;             // in a spore cloud (SporePods): slowed, no new wind-ups
    this.sporeT = 0;
    this.knockT = 0;             // a player blow knocked it back recently (wall splats)
    this.splatCd = 0;
    // Stage 9 (POISE): committed = past the red flash of its wind-up (no blow stops it now); openT = standing spent after
    // an attack that missed you (punish it); counterQ / counterCd = it hits back when you hit it; guard (Ferals).
    this.committed = false;
    this.openT = 0;
    this.counterQ = false;
    this.counterCd = 0;
    this.guardCd = 0;
    this.flurry = [];

    // Sprites stay 1:1 (whole-number scales only, no mixels): an elite reads through its tint and an
    // amber ground ring instead of being drawn bigger. `scale` still sizes its hitbox. The always-on ring is a dim
    // dark red in the jungle, so the hot-red wind-up rings pop (critic I #12); occlusion silhouettes never print
    // over the player (critic I #3).
    // A creature with its own art (def.sprite) that isn't loaded wears def.fallback's look instead (a tinted Crawler…);
    // this.look = the fields in force (tint, pod…).
    let vkey = this.def.sprite || key;
    this.look = this.def;
    if (this.def.fallback && !this.game.assets.hasSprite(vkey)) { this.look = { ...this.def, ...this.def.fallback }; vkey = this.look.sprite; }
    // (opts.visScale: a whole-number sprite scale for a boss-sized creature — the Pack Lord, critic H2 §2.3.)
    this.vis = this.game.assets.makeVisual(vkey, {
      scale: this.game.assets.hasSprite(vkey) ? Math.max(1, Math.round(opts.visScale || 1)) : scale,
      ring: this.elite ? (X.elite.ringColor || JUICE.hostileRing.color) : (JUICE.hostileRingJungle || JUICE.hostileRing.color),
      silhouetteSkipsMask: true,
    });
    if (this.elite) setBaseColor(this.vis, X.elite.tint);
    else if (this.look.tint) setBaseColor(this.vis, this.look.tint);
    scene.three.add(this.vis);
    // The Thorn Stalker starts under the brush.
    this.hidden = this.def.attack === 'ambush';
    if (this.hidden) this.vis.visible = false;
    // HP bar (two sprites: back + left-anchored fill), drawn on top.
    this.barW = 0.8 * Math.max(1, scale);
    this.barBg = new THREE.Sprite(barMaterial('#181425'));
    this.barFill = new THREE.Sprite(barMaterial(this.elite ? '#feae34' : '#e43b44'));
    this.barBg.center.set(0.5, 0.5);
    this.barFill.center.set(0, 0.5);
    // Whole-pixel bar sizes (32 px per tile): a 4 px back with a 2 px fill and a 1 px border.
    this.barW = Math.round(this.barW * 32) / 32;
    this.barBg.scale.set(this.barW + 2 / 32, 4 / 32, 1);
    this.barFill.scale.set(this.barW, 2 / 32, 1);
    this.barBg.renderOrder = 20; this.barFill.renderOrder = 21;
    scene.three.add(this.barBg, this.barFill);
    if (this.state === 'spawn') {
      scene.fx.ringTele({ x, z }, { radius: this.radius + 0.35, color: '#feae34', color2: '#8f563b', time: this.stateT, fade: 0.1 });
      this.vis.position.set(x, -1.2, z);
    }
    this._syncVisual(0);
  }

  get bloodColor() { return this.def.burst?.[0] || '#e43b44'; }

  // ---------------------------------------------------------------- damage

  /** Is it open to a punish (POISE.punish): spent after a missed attack, or reeling? */
  get open() { return (this.state === 'recover' && this.openT > 0) || this.state === 'stunned' || this.state === 'exposed'; }

  hit(dmg, dx, dz, kb = 0, src = '', stagger = 0, spec = null) {
    if (this.dead || this.state === 'spawn' || this.hidden) return;
    const blade = src === 'slash' || src === 'chop' || src === 'blade';
    // A Feral's raised guard turns frontal slashes (POISE / EXPLORE_ENEMIES.feral.guard); a chop or a blow from the
    // side or back breaks it open.
    if (this.state === 'guard' && blade) {
      const G = this.def.guard;
      const frontal = -(dx * this.face.x + dz * this.face.z) > Math.cos((G.arc / 2) * Math.PI / 180);
      if (frontal && src !== 'chop') { this._block(dx, dz); return; }
      this.stun(G.break, 'GUARD BROKEN', '#fee761');
      this.game.sfx.playAt('crack', this.x, this.z);
    }
    // Committed (past its red flash): no blow stops it. Otherwise a blow with at least its poise in stagger interrupts
    // (elites shrug most of it off); an open creature is staggered by anything heavier than a light slash.
    const open = this.open;
    const committed = this.state === 'windup' && this.committed;
    const st = stagger * (this.elite ? 0.35 : 1);
    const poise = this.def.poise ?? 0.15;
    const staggers = !committed && st > 0.15 && (open || st > poise);
    if (staggers && (this.state === 'windup' || this.state === 'chase' || this.state === 'recover' || this.state === 'stunned' || this.state === 'exposed' || this.state === 'idle' || this.state === 'guard')) {
      const keep = this.state === 'stunned' ? this.stateT : 0;
      this.tele?.cancel();
      this.tele = null;
      this.state = 'stunned';
      this.stateT = Math.max(keep, st);
      setAnim(this.vis, 'hurt', true);
    }
    // Punish: an open creature takes x POISE.punish.mult from your blade (a riposte keeps its own; bosses have theirs).
    const punished = open && blade && !spec?.riposte && !this.lordOf;
    if (punished) dmg *= POISE.punish.mult;
    if (blade) this._engage(0, true);   // you picked this fight: it's in it, whatever the brawl cap
    // Hitting it while it walks at you makes it hit back (POISE.counter); a Feral that can't, raises its guard.
    if (blade && this.state === 'chase' && !staggers) this._provoked(dx, dz, src);
    dmg = Math.round(dmg);
    this.hp -= dmg;
    this.barT = 2.5;
    this.lastHit = { x: dx, z: dz };
    const fx = this.scene.fx;
    const H = JUICE.hitStop;
    const M = JUICE.melee;
    const melee = src === 'slash' || src === 'chop';
    // White silhouette flash (the whole sprite, not a tint), held through the hit-stop.
    if (melee || src === 'blade') fx.hitFlash(this.vis, M.whiteFlash * (src === 'chop' ? 1.5 : 1));
    else flashVisual(this.vis, '#ffffff', 0.09);
    const big = this.elite || this.objective;
    fx.text({ x: this.x, z: this.z }, String(dmg), {
      color: big ? '#feae34' : punished ? POISE.punish.color : src === 'chop' ? '#fee761' : src === 'spore' ? '#c9d65a' : '#ead4aa', cls: big ? 'elite' : punished ? 'crit' : '',
      y: this.vis.userData.vis.height + 0.55, life: 0.6, key: this, value: dmg,
    });
    fx.burst({ x: this.x, z: this.z }, { color: this.bloodColor, color2: shade(this.bloodColor, 1.3), count: melee ? 7 : 4, speed: 2.2, up: 1.6, life: 0.32, size: 2 / 32, vx: dx * 2.4, vz: dz * 2.4 });
    // Impact spark on the side the hit came from.
    if (src !== 'spore') fx.flash({ x: this.x - dx * this.radius * 0.6, y: this.vis.userData.vis.height * 0.45, z: this.z - dz * this.radius * 0.6 }, { color: '#ffffff', size: big ? 0.42 : 0.3, life: 0.05 });
    // Melee hit-stop is applied once per swing by the scene (JungleScene.meleeHit); other hits here.
    if (!melee && (dmg >= H.heavyDamage || big)) fx.hitStop(H.heavyHit);
    this.game.sfx.playAt('hit', this.x, this.z);
    // Knockback (heavier enemies resist; lunges and charges carry through). A short hit-stun stops the
    // enemy steering against it, so the shove reads.
    // Below its poise (and not open) a blow barely shoves it and doesn't stop it steering (POISE.lightKb): it stays in
    // your face and hits back - slashes no longer knock it out of its own reach (the old stun-lock).
    if (this.state !== 'attack' && kb > 0) {
      const flinch = staggers || open || (this.def.poise ?? 0) <= 0 || this.state === 'idle' || this.state === 'stunned';
      const resist = this.def.size * this.scale;
      const k = (melee ? M.knockback : 1) * (flinch ? 1 : POISE.lightKb);
      this.kb.x += dx * kb * k / resist;
      this.kb.z += dz * kb * k / resist;
      this.knockT = flinch ? 0.45 : 0;   // a hard shove into a trunk or bramble now splats (SPLAT)
      if (flinch && (melee || src === 'blade')) { this.stunT = M.hitStun; this.vel.x *= 0.2; this.vel.z *= 0.2; }
    }
    if (!this.alerted) this.alert(true);
    if (this.hp <= 0) this.die();
  }

  /** Reel for `t` seconds (deflects, wall splats): cancels whatever it was doing. */
  stun(t, label = 'STUNNED', color = '#fee761') {
    if (this.dead) return;
    if (this.state === 'guard') this._endGuard();
    this.tele?.cancel();
    this.tele = null;
    const keep = this.state === 'stunned' ? this.stateT : 0;
    this.state = 'stunned';
    this.stateT = Math.max(keep, t);
    this.vel.x *= 0.1; this.vel.z *= 0.1;
    setAnim(this.vis, 'hurt', true);
    if (label) this.scene.fx.text({ x: this.x, z: this.z }, label, { color, y: this.vis.userData.vis.height + 0.3, life: 0.8 });
  }

  /** You hit it as it came at you: it hits back at once (POISE.counter), or - a Feral that can't - raises its guard. */
  _provoked(dx, dz, src) {
    const d = this.def, P = POISE.counter;
    if (d.attack !== 'melee' || this.lordOf) return;
    const p = this.scene.player.pos;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.counterCd <= 0 && dist <= (d.reach || 1.5) + P.reach) { this.counterQ = true; return; }
    const G = d.guard;
    if (!G || this.guardCd > 0 || src === 'chop') return;
    const now = this._now();
    this.flurry = this.flurry.filter((t) => now - t < G.window);
    this.flurry.push(now);
    if (this.flurry.length >= G.hits) this._raiseGuard();
  }

  /** A Feral raises its guard (EXPLORE_ENEMIES.feral.guard): frontal slashes are blocked, then it thrusts out of it. */
  _raiseGuard() {
    const G = this.def.guard;
    this.flurry = [];
    this.tele?.cancel();
    this.tele = null;
    this.state = 'guard';
    this.stateT = G.time;
    this.guardCd = G.cooldown;
    this.vel.x *= 0.1; this.vel.z *= 0.1;
    const p = this.scene.player.pos;
    const dx = p.x - this.x, dz = p.z - this.z, l = Math.hypot(dx, dz) || 1;
    this.face = { x: dx / l, z: dz / l };
    setAnim(this.vis, 'windup', true);
    setAnimSpeed(this.vis, 0);
    setBaseColor(this.vis, POISE.guardTint);   // steel-pale while the guard is up
    flashVisual(this.vis, POISE.guardColor, 0.15);
    this.scene.fx.text({ x: this.x, z: this.z }, 'GUARD', { color: POISE.guardColor, y: this.vis.userData.vis.height + 0.3, life: 0.7, key: 'guard' });
    sfxAt(this.game, this.x, this.z, 'guard', 'deflect', 'crack');
  }

  /** The guard drops (it thrusts out of it, or the guard is broken): back to its own colours. */
  _endGuard() {
    setAnimSpeed(this.vis, 1);
    setBaseColor(this.vis, this.elite ? CONFIG.expedition.elite.tint : this.look.tint || '#ffffff');
  }

  /** A frontal slash on a raised guard: a clang, sparks, nothing gets through (and you're pushed off it). */
  _block(dx, dz) {
    const sc = this.scene, fx = sc.fx, h = this.vis.userData.vis.height;
    const cx = this.x - dx * this.radius * 0.8, cz = this.z - dz * this.radius * 0.8;
    fx.flash({ x: cx, y: h * 0.55, z: cz }, { color: '#ffffff', size: 0.5, life: 0.06 });
    fx.spark({ x: cx, y: h * 0.55, z: cz }, { color: POISE.guardColor, dir: { x: -dx, z: -dz }, count: 6, size: 0.4 });
    flashVisual(this.vis, POISE.guardColor, 0.1);
    fx.text({ x: this.x, z: this.z }, 'BLOCKED', { color: POISE.guardColor, y: h + 0.3, life: 0.5, key: 'block' });
    fx.hitStop(0.03);
    const pl = sc.player;
    pl.kb.x -= dx * 3; pl.kb.z -= dz * 3;
    sfxAt(this.game, this.x, this.z, 'block', 'deflect', 'crack');
  }

  /** The commit tell (POISE.tell): it stops aiming - the sprite blinks red; nothing short of a deflect stops it now. */
  _commit() {
    if (this.committed) return;
    this.committed = true;
    const T = POISE.tell;
    this.scene.fx.tell(this.vis, { color: T.color, time: T.time, blink: T.blink });
    this._glint();
  }

  /**
   * The player deflected this creature's attack (Player.tryDeflect, critic I §9A). kind: 'melee' (a lunge: it
   * is thrown off the blade and reels) | 'charge' (the Razorback takes DEFLECT.chargeDamage and reels).
   */
  deflected(kind) {
    const D = DEFLECT;
    // One word per deflect (critic H2 §3): the player's "DEFLECT" says it; the attacker just reels (no second label).
    if (kind === 'charge') {
      this.hit(D.chargeDamage, -(this.aimDir?.x || 0), -(this.aimDir?.z || 0), 0, 'deflect');
      if (!this.dead) this.stun(D.chargeStun, null);
      return;
    }
    // It stays in reach of the riposte (critic I2 #7): DEFLECT.shove is 0 by default.
    const p = this.scene.player.pos;
    const dx = this.x - p.x, dz = this.z - p.z, l = Math.hypot(dx, dz) || 1;
    this.kb.x += (dx / l) * D.shove; this.kb.z += (dz / l) * D.shove;
    this.scene.fx.hitFlash(this.vis, JUICE.melee.whiteFlash * 1.5);
    this.stun(this.elite ? D.eliteStun : D.stun, null);
  }

  /** The player went down: stop attacking and step back off the body (critic I #12). */
  stepBack(px, pz, dist) {
    if (this.dead || this.hidden) return;
    if (this.state === 'guard') this._endGuard();
    this.tele?.cancel();
    this.tele = null;
    this._dropToken();
    const dx = this.x - px, dz = this.z - pz, l = Math.hypot(dx, dz) || 1;
    this.kb.x += (dx / l) * dist * 9; this.kb.z += (dz / l) * dist * 9;   // kb decays at e^-9t: ≈ `dist` tiles
    if (this.state !== 'spawn') { this.state = 'recover'; this.stateT = 0.8; this.mv = null; }
  }

  alert(spread = false) {
    if (this.alerted || this.dead) return;
    this.alerted = true;
    if (this.state === 'idle') this.state = 'chase';
    if (!this.hidden) this.scene.fx.text({ x: this.x, z: this.z }, '!', { color: '#feae34', cls: 'big', y: this.vis.userData.vis.height + 0.35, life: 0.6 });
    if (spread) this.scene.alertNear(this.x, this.z, CONFIG.expedition.attackers.alertSpread ?? 6, this);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this._dropToken();
    this.tele?.cancel();
    const fx = this.scene.fx;
    const [c1, c2] = this.def.burst || ['#e43b44', '#733e39'];
    const h = this.vis.userData.vis.height;
    const kd = this.lastHit || { x: 0, z: 0 };
    if (this.hidden) this.vis.visible = true;
    fx.burst({ x: this.x, z: this.z }, { color: c1, color2: c2, count: 16 + Math.round(this.scale * 8), speed: 3, up: 3, life: 0.6, size: 0.09, y: h * 0.4, vx: kd.x * 1.5, vz: kd.z * 1.5 });
    fx.burst({ x: this.x, z: this.z }, { color: '#ffffff', color2: c1, count: 6, speed: 4.5, up: 2, life: 0.18, size: 2 / 32, y: h * 0.5 });
    fx.flash({ x: this.x, y: h * 0.5, z: this.z }, { color: c1, size: 0.55 + this.radius, life: 0.07 });
    fx.ring({ x: this.x, z: this.z }, { color: c1, radius: 1 + this.radius, life: 0.35 });
    // Its own kind of splat (blood / sap / magenta / acid), never the burst's dark colour (critic H2 §3: navy blots).
    fx.splat({ x: this.x + kd.x * 0.15, z: this.z + kd.z * 0.15 }, this.key, (this.def.size || 0.7) * (this.scale || 1));
    // The sprite stays for a beat: flash, squash and pop, slide along the killing hit, fade.
    for (const s of [this.barBg, this.barFill]) s.visible = false;
    fx.corpse(this.vis, { dx: kd.x, dz: kd.z });
    this.vis = null;
    this.game.sfx.playAt(this.def.size >= 1 || this.elite ? 'death_big' : 'death_small', this.x, this.z);
    if (this.elite || this.objective) {
      this.game.shake(7, 0.35);
      this.game.flash('#ffffff', 0.18);
      fx.hitStop(JUICE.hitStop.eliteKill);
      fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: 2.6, life: 0.5 });
      fx.light({ x: this.x, z: this.z }, { color: '#feae34', intensity: 3, distance: 5, life: 0.25 });
    } else {
      fx.hitStop(JUICE.hitStop.kill);
    }
    this.scene.onEnemyKilled(this);
  }

  // ---------------------------------------------------------------- AI

  update(dt) {
    if (this.dead) return;
    const sc = this.scene;
    const p = sc.player;
    const d = this.def;
    this.cd -= dt;
    this.stateT -= dt;
    this.barT -= dt;
    this.spearCd -= dt;
    this.chokeT -= dt;
    this.knockT -= dt;
    this.splatCd -= dt;
    this.counterCd -= dt;
    this.guardCd -= dt;
    this.openT -= dt;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z;
    const dist = Math.hypot(dx, dz);
    const toP = dist > 1e-4 ? { x: dx / dist, z: dz / dist } : { x: 1, z: 0 };
    const choking = this.chokeT > 0;
    // speedMult: a Feral Chief's aura / the Pack Lord's war cry (src/entities/DayCreatures.js, AreaBoss.js).
    let move = null, speed = d.speed * (choking ? SPORES.creature.slow : 1) * (this.speedMult || 1);

    // Line of sight is checked a few times a second, not every frame.
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.15;
      // Lobbers (Spitters) arc over the undergrowth: only walls, trees and ruins block them.
      this.los = dist < 22 && (d.lobOverBrush ? this._losOverBrush(p.pos.x, p.pos.z) : sc.world.lineOfSight(this.x, this.z, p.pos.x, p.pos.z));
    }
    const playerTarget = !p.dead && !sc.ending;
    // An attack token is kept through the attack and its recovery, then for a short release beat.
    if (this.token && this.state !== 'windup' && this.state !== 'attack' && this.state !== 'recover' && this._now() >= (this.tokenUntil || 0)) this._dropToken();

    if (d.attack === 'ambush') { this._updateAmbush(dt, dist, toP, playerTarget, choking); this._syncVisual(dt); return; }

    const A = CONFIG.expedition.attackers;
    switch (this.state) {
      case 'spawn': {
        if (this.stateT <= 0) {
          this.state = 'chase';
          this.alerted = true;
          sc.fx.burst({ x: this.x, z: this.z }, { color: '#733e39', color2: '#8b9bb4', count: 10, speed: 2, up: 2.5, life: 0.4, size: 0.08 });
        }
        this._syncVisual(dt);
        return;
      }
      case 'idle': {
        // sc.detectMult: rain shortens sight (src/data/weather.js).
        const det = d.detect * (sc.detectMult ?? 1);
        if (playerTarget && ((this.los && dist <= det) || (this.guard && dist <= det + 2))) this.alert(true);
        if (d.speed > 0) {
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 2 + Math.random() * 2.5;
            this.wanderTo = Math.random() < 0.6 ? { x: this.home.x + (Math.random() - 0.5) * 3, z: this.home.z + (Math.random() - 0.5) * 3 } : null;
          }
          if (this.wanderTo) {
            const wx = this.wanderTo.x - this.x, wz = this.wanderTo.z - this.z;
            const wl = Math.hypot(wx, wz);
            if (wl > 0.2) { move = { x: wx / wl, z: wz / wl }; speed = d.speed * 0.35; } else this.wanderTo = null;
          }
        }
        if (this.alerted) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!playerTarget) { this.state = 'idle'; this.alerted = false; this.home = { x: this.x, z: this.z }; break; }
        this.face = toP;
        // Not allowed to attack yet (cooldown / no free token / choking): hold a slot round the player.
        const waiting = dist < A.holdDist + 1.2 && (this.cd > A.circleCd || choking || !this._tokenFree());
        // The brawl cap (fix wave, critic O #1): only `attackers.engagedMax` creatures fight you at once; the rest hold
        // off at `engageWait` tiles (a Feral may still throw its spear) and step in when a place frees up.
        if (!this._engage(dist)) {
          if (d.spear && !choking && dist > d.spear.min && this._wantSpear(dist, true) && this._spearFree()) { this._startWindup(toP, dist, 'spear'); break; }
          if (d.speed > 0) { move = dist < A.engageWait + 1.5 ? this._circle(toP, dist, dt, A.engageWait) : this._pathTo(p.pos.x, p.pos.z); speed *= A.circleSpeed; }
          this.stuckT = 0; this.bestD = Infinity;
          break;
        }
        if (d.attack === 'melee') {
          // Hit back (POISE.counter): you struck it as it came in - no cooldown or token cap.
          if (this.counterQ) {
            this.counterQ = false;
            if (this.los && !choking && dist <= d.reach + POISE.counter.reach && this._takeToken(true)) { this.counterCd = POISE.counter.cooldown; this._startWindup(toP, dist, 'lunge'); break; }
          }
          if (this.los && !choking && this.cd <= 0 && (dist <= d.reach || this._predDist() <= d.reach) && this._takeToken()) { this._startWindup(toP, dist, 'lunge'); break; }
          // The spear doesn't take a melee attack token (it would starve the pack up close); one spear in the air at a time.
          if (d.spear && !choking && this._wantSpear(dist) && this._spearFree()) { this._startWindup(toP, dist, 'spear'); break; }
          if (waiting) { move = this._circle(toP, dist, dt); speed *= A.circleSpeed; this.stuckT = 0; this.bestD = Infinity; }
          else { move = this._pathTo(p.pos.x, p.pos.z); this._trackStuck(dt, dist, toP); }
        } else if (d.attack === 'ranged') {
          // (Stage 9: only from where you can see it — nothing shoots you from off screen.)
          if (this.los && !choking && dist <= d.range && this.cd <= 0 && this._onScreen()) { this._startWindup(toP, dist, d.shot === 'glob' ? 'glob' : 'bolt'); break; }
          if (d.speed > 0) {
            this.strafeT -= dt;
            if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.5; this.strafeSign *= -1; }
            if (dist < (d.keepAway || 0)) move = { x: -toP.x, z: -toP.z };
            else if (!this.los || dist > d.range * 0.85) move = this._pathTo(p.pos.x, p.pos.z);
            else { move = { x: -toP.z * this.strafeSign, z: toP.x * this.strafeSign }; speed *= 0.6; }
          }
        } else if (d.attack === 'charge') {
          const S = this.elite && d.elite?.stomp;
          if (S && this.los && !choking && dist <= S.range && this.cd <= 0 && this._takeToken()) { this._startWindup(toP, dist, 'stomp'); break; }
          if (this.los && !choking && dist <= d.chargeRange && this.cd <= 0 && this._takeToken()) { this._startWindup(toP, dist, 'charge'); break; }
          if (waiting) { move = this._circle(toP, dist, dt); speed *= A.circleSpeed; }
          else move = this._pathTo(p.pos.x, p.pos.z);
        }
        break;
      }
      case 'windup': {
        const mv = this.mv;
        const el = this.windT - this.stateT;   // seconds into the wind-up
        if (LUNGES[mv]) {
          // The landing ring tracks where you're heading for the first part, then locks (critic I #1) - with the red
          // commit flash (Stage 9): from here on no blow stops it.
          const tr = mv === 'thrust2' ? d.thrust2.track : (d.track ?? 0);
          if (el >= this.windT * tr) this._commit();
          else if (playerTarget) {
            this.lungeTarget = this._lungeAim(mv);
            this.tele?.move?.(this.lungeTarget.x, this.lungeTarget.z);
            this.face = { ...this.aimDir };
            if (d.creep && !choking) { move = this.aimDir; speed = d.speed * d.creep; }
          }
        } else if (mv !== 'stomp') {
          // Ranged aim and charge direction track the player for the first part of the wind-up, then lock.
          const lockAt = CHARGES[mv] ? 0.7 : mv === 'spear' ? d.spear.lock : 0.55;
          if (CHARGES[mv] && this.stateT <= this.windT * lockAt) this._commit();
          if (this.stateT > this.windT * lockAt && playerTarget) {
            const aim = mv === 'spear' ? this._spearAim() : toP;
            this.face = aim;
            this.aimDir = { ...aim };
            if (mv === 'glob') this._aimLob(p.pos.x, p.pos.z);
            else {
              if (this.tele && !this.tele.setDir) this.tele.group.rotation.y = Math.atan2(-aim.x, -aim.z);
              this._resizeLane();
            }
          }
        }
        // The Razorback paws up dust along its lane.
        if (CHARGES[mv] && Math.random() < dt * JUICE.tele.laneDust * (this.curLen || 1)) {
          const u = Math.random() * (this.curLen || 1);
          sc.fx.burst({ x: this.x + this.aimDir.x * u, y: -0.3, z: this.z + this.aimDir.z * u }, { color: '#b86f50', color2: '#e4a672', count: 2, speed: 0.6, up: 1.2, life: 0.35, size: 2 / 32, gravity: 5 });
        }
        if (mv === 'stomp' && el >= this.windT * 0.4) this._commit();
        if (mv === 'stomp' && Math.random() < dt * 10) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * d.elite.stomp.radius;
          sc.fx.burst({ x: this.x + Math.cos(a) * r, y: -0.3, z: this.z + Math.sin(a) * r }, { color: '#b86f50', color2: '#e4a672', count: 1, speed: 0.4, up: 1.4, life: 0.35, size: 2 / 32, gravity: 6 });
        }
        if (this.stateT <= 0) this._startAttack();
        break;
      }
      case 'attack': {
        const mv = this.mv;
        if (LUNGES[mv]) {
          const v = d.lunge / d.lungeTime;
          const hitWall = sc.world.moveBody(this, this.aimDir.x * v * dt, this.aimDir.z * v * dt, this.radius, this.moveOpts);
          this._contact(dist);
          if (this.state !== 'attack') break;   // deflected
          if (this.stateT <= 0 || hitWall) this._afterLunge(toP, dist, playerTarget);
        } else if (CHARGES[mv]) {
          this._hit.obj = undefined;
          const hitWall = sc.world.moveBody(this, this.aimDir.x * d.chargeSpeed * dt, this.aimDir.z * d.chargeSpeed * dt, this.radius, this.moveOptsHit) && sc.world.blockedCircle(this.x + this.aimDir.x * 0.15, this.z + this.aimDir.z * 0.15, this.radius, true);
          if (Math.random() < 0.7) sc.fx.burst({ x: this.x, y: -0.35, z: this.z }, { color: '#8b9bb4', count: 1, speed: 1, up: 1, life: 0.3, size: 0.09 });
          this._contact(dist);
          if (this.state !== 'attack') break;   // deflected
          if (hitWall && this._hit.obj) {
            // Charging into a trunk / rock / ruin is a splat (critic I2 #11): the bonus damage and the stun.
            this.cd = d.cooldown;
            this._splat('charge', this.aimDir.x, this.aimDir.z);
          } else if (hitWall) {
            this.state = 'stunned';
            this.stateT = d.stun || 0.8;
            this.cd = d.cooldown;
            sc.fx.burst({ x: this.x + this.aimDir.x * this.radius, z: this.z + this.aimDir.z * this.radius }, { color: '#c0cbdc', color2: '#733e39', count: 14, speed: 3, up: 3, life: 0.5, size: 0.09 });
            this.game.sfx.playAt('crash', this.x, this.z);
            if (dist < 8) this.game.shake(4, 0.2);
            sc.fx.text({ x: this.x, z: this.z }, 'STUNNED', { color: '#fee761', y: this.vis.userData.vis.height + 0.3, life: 0.8 });
          } else if (this.stateT <= 0) {
            // The elite re-aims and charges again (critic I #12).
            if (this.elite && mv === 'charge' && d.elite?.reaim && playerTarget) this._startWindup(toP, dist, 'charge2');
            else this._recover(d.cooldown);
          }
        } else {
          this._recover(mv === 'spear' ? d.cooldown : mv === 'stomp' ? d.elite.stomp.cooldown : d.cooldown);
        }
        break;
      }
      case 'stunned': {
        if (Math.random() < 0.15) sc.fx.burst({ x: this.x, y: this.vis.userData.vis.height - 0.2, z: this.z }, { color: '#fee761', count: 1, speed: 0.8, up: 1, life: 0.4, size: 0.06, gravity: 2 });
        if (this.stateT <= 0) { this.state = 'chase'; this.bestD = Infinity; this.stuckT = 0; }
        break;
      }
      case 'recover': {
        if (this.openT > 0) {
          // Open (POISE.punish): its attack missed and it stands spent, panting - your moment.
          move = null;
          this.pantT = (this.pantT || 0) - dt;
          if (this.pantT <= 0) {
            this.pantT = POISE.pant.every;
            sc.fx.burst({ x: this.x + this.face.x * this.radius * 0.5, y: this.vis.userData.vis.height * 0.7, z: this.z + this.face.z * this.radius * 0.5 }, { color: POISE.pant.color, count: 1, speed: 0.5, up: 0.9, life: 0.35, size: 2 / 32, gravity: -0.5 });
          }
        } else if (d.dart && d.speed > 0 && playerTarget) { move = { x: -toP.x, z: -toP.z }; speed = d.speed; }   // the Skitter darts back out
        // Back off (the hop-back carries it out of your face), then rejoin the circle.
        else if (d.speed > 0 && playerTarget && LUNGES[this.mv]) { move = { x: -toP.x, z: -toP.z }; speed = d.speed * 0.3; }
        else if (d.speed > 0 && !playerTarget) { move = { x: -toP.x, z: -toP.z }; speed = d.speed * 0.4; }
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
      case 'guard': {
        // It turns (slowly) to keep its guard on you: a roll round it gets you its side or back.
        if (playerTarget) {
          const a = Math.atan2(this.face.z, this.face.x), b = Math.atan2(toP.z, toP.x), da = wrapA(b - a), tr = 3.2 * dt;
          const na = a + Math.max(-tr, Math.min(tr, da));
          this.face = { x: Math.cos(na), z: Math.sin(na) };
        }
        // a glint runs along the raised blade
        if (Math.random() < dt * 6) sc.fx.flash({ x: this.x + this.face.x * this.radius * 0.7, y: this.vis.userData.vis.height * (0.4 + Math.random() * 0.4), z: this.z + this.face.z * this.radius * 0.7 }, { color: '#ffffff', size: 5 / 32, life: 0.06 });
        if (this.stateT <= 0) {
          this._endGuard();
          // ...and thrusts out of it.
          if (playerTarget && this.los && dist <= d.reach + 1.2 && this._takeToken(true)) this._startWindup(toP, dist, 'lunge');
          else this.state = 'chase';
        }
        break;
      }
    }

    // Movement + knockback (no steering while reeling from a machete hit).
    if (this.stunT > 0) { this.stunT -= dt; move = null; }
    if (this.state !== 'attack') {
      const tx = move ? move.x * speed : 0, tz = move ? move.z * speed : 0;
      const k = 1 - Math.exp(-12 * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      const kd = Math.exp(-9 * dt);
      this.kb.x *= kd; this.kb.z *= kd;
      const mx = (this.vel.x + this.kb.x) * dt, mz = (this.vel.z + this.kb.z) * dt;
      if (Math.abs(mx) + Math.abs(mz) > 1e-5) {
        // Ferns drag walkers; brush-slippers (Skitter, Crawler) and the bulldozing Razorback ignore them.
        const g = sc.world.speedAt(this.x, this.z, !!(this.moveOpts.throughBrush || this.moveOpts.onBrush));
        this._hit.obj = undefined;
        const blocked = sc.world.moveBody(this, mx * g, mz * g, this.radius, this.moveOptsHit);
        if (this.knockT > 0 && this.splatCd <= 0) this._checkSplat(blocked);
      }
      // Rustling: something moving through the undergrowth gives itself away.
      if (this.moveOpts.throughBrush && !sc.noRustle && Math.hypot(this.vel.x, this.vel.z) > 0.6 && sc.world.brushAt(Math.floor(this.x), Math.floor(this.z)) >= 1 && Math.random() < dt * 5) {
        sc.fx.burst({ x: this.x, y: 0.5, z: this.z }, { color: '#2a5628', color2: '#4b8139', count: 2, speed: 1, up: 1.6, life: 0.4, size: 1.5 / 32, gravity: 5 });
        if (Math.hypot(this.x - sc.player.pos.x, this.z - sc.player.pos.z) < 9 && Math.random() < 0.35) this.game.sfx.playAt('rustle', this.x, this.z);
      }
      if (move && this.state !== 'windup') this.face = Math.hypot(this.vel.x, this.vel.z) > 0.3 && this.state === 'idle' ? { x: this.vel.x, z: this.vel.z } : this.face;
    }
    if (this.dead) return;
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.4 && this.state !== 'attack';
    if (this.state !== 'attack') this._separate(dt);
    this._syncVisual(dt);
  }

  /** Soft push out of the player and other creatures (CROWD), so bodies never hide the player. */
  _separate(dt) {
    const sc = this.scene, p = sc.player;
    const max = CROWD.push * dt;
    let px = 0, pz = 0;
    const away = (ox, oz, gap, share) => {
      const dx = this.x - ox, dz = this.z - oz;
      const d = Math.hypot(dx, dz);
      if (d >= gap) return;
      if (d < 1e-3) { px += max * share; return; }
      const k = Math.min(max, (gap - d) * share) / d;
      px += dx * k; pz += dz * k;
    };
    // (Also off a fallen player: nothing stands on the body.)
    // A creature in front of the player (south, drawn over it) keeps a little further off.
    const dz = this.z - p.pos.z, front = Math.max(0, dz / Math.max(1e-3, Math.hypot(this.x - p.pos.x, dz)));
    away(p.pos.x, p.pos.z, (this.radius + (p.r || 0.3)) * CROWD.playerGap + CROWD.frontGap * front, 1);
    // Both creatures of a pair push, so each takes half of the overlap.
    for (const o of sc.enemies) if (o !== this && !o.dead && !o.hidden) away(o.x, o.z, (this.radius + o.radius) * CROWD.enemyGap, 0.5);
    if (px || pz) sc.world.moveBody(this, px, pz, this.radius, this.moveOpts);
  }

  /** Direction toward (tx, tz): straight if the walk is clear, otherwise down the flow field. */
  _pathTo(tx, tz) {
    const sc = this.scene;
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return null;
    // Straight line works when no solid tile is in the way (checked with the body's width).
    const off = this.radius * 0.9;
    const nx = -dz / dist * off, nz = dx / dist * off;
    const through = !!this.moveOpts.throughBrush || !!this.moveOpts.onBrush;
    const solid = (x, y) => sc.world.blockedAt(x, y, through);
    if (dist < 12 && castRay(this.x + nx, this.z + nz, tx + nx, tz + nz, solid) >= dist - 0.01
      && castRay(this.x - nx, this.z - nz, tx - nx, tz - nz, solid) >= dist - 0.01) {
      return { x: dx / dist, z: dz / dist };
    }
    return sc.flowDir(this.x, this.z, through) || { x: dx / dist, z: dz / dist };
  }

  /**
   * No-path fallback (critic I #5): a walker that gets no closer for `attackers.stuck` s is stuck (boxed into a
   * brush pocket, or behind a wall); a Feral then throws if it can see you (chase → _wantSpear), otherwise it hacks
   * one brush tile toward you every `attackers.hackEvery` s.
   */
  _trackStuck(dt, dist, toP) {
    const A = CONFIG.expedition.attackers;
    if (dist < this.bestD - 0.35) { this.bestD = dist; this.stuckT = 0; return; }
    this.stuckT += dt;
    if (this.stuckT < A.stuck || this.moveOpts.throughBrush || this.moveOpts.onBrush) return;
    this.hackT -= dt;
    if (this.hackT > 0) return;
    this.hackT = A.hackEvery;
    const w = this.scene.world;
    const base = Math.atan2(toP.z, toP.x);
    for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
      const a = base + da, r = this.radius + 0.55;
      const tx = Math.floor(this.x + Math.cos(a) * r), tz = Math.floor(this.z + Math.sin(a) * r);
      const b = w.brushAt(tx, tz);
      if (b < BRUSH.thicket) continue;
      const res = w.hitBrush(tx, tz, 1);
      if (res > 0) this.scene._cutDebris?.(tx, tz, res, a);
      else this.scene.fx.burst({ x: tx + 0.5, y: 0.4, z: tz + 0.5 }, { color: '#c23a3a', color2: '#5c2f2e', count: 4, speed: 2, up: 1.5, life: 0.3, size: 1.5 / 32 });
      this.face = { x: Math.cos(a), z: Math.sin(a) };
      setAnim(this.vis, 'attack', true);
      this.atkAnimT = 0.3;
      this.atkAnimSpeed = 1.4;
      this.game.sfx.playAt('cut', this.x, this.z);
      break;
    }
  }

  /** The Feral's spear (critic I §9C): it can see you but can't reach you, or you're deep in the brush. */
  /** Distance to where the player will be at the end of a wind-up if they keep walking (attackers.predict). */
  _predDist() {
    const p = this.scene.player, v = leadVel(p), t = this.windup * (CONFIG.expedition.attackers.predict || 0);
    return Math.hypot(p.pos.x + v.x * t - this.x, p.pos.z + v.z * t - this.z);
  }

  /** Is it inside the view (Stage 9: ranged attacks start only from on screen)? m: margin, share of the half-view. */
  _onScreen(m = 0.9) {
    const cam = this.scene.camera;
    if (!cam) return true;
    const v = (this._sv ||= new THREE.Vector3()).set(this.x, 0.5, this.z).project(cam);
    return Math.abs(v.x) < m && Math.abs(v.y) < m;
  }

  _spearFree() {
    // (fix wave: and at most one spear per `attackers.spearGap` s across the pack — waiting Ferals throw too now)
    if (this._now() - (this.scene._lastSpear ?? -1e9) < (CONFIG.expedition.attackers.spearGap || 0)) return false;
    return !this.scene.enemies.some((e) => e !== this && !e.dead && e.mv === 'spear' && (e.state === 'windup' || e.state === 'attack'));
  }

  /** Spear aim: ahead of the player by `spear.lead` × (the wind-up left after the lock + the flight). */
  _spearAim() {
    const S = this.def.spear, p = this.scene.player;
    const d0 = Math.hypot(p.pos.x - this.x, p.pos.z - this.z);
    const t = S.lead * ((this.windT || S.windup) * S.lock + d0 / S.speed);
    const v = leadVel(p);
    const dx = p.pos.x + v.x * t - this.x, dz = p.pos.z + v.z * t - this.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  _wantSpear(dist, waiting = false) {
    const S = this.def.spear;
    const A = CONFIG.expedition.attackers;
    if (this.spearCd > 0 || this.cd > 0 || !this.los || dist > S.range || dist < S.min || !this._onScreen()) return false;
    const p = this.scene.player.pos;
    const inBrush = this.scene.world.brushAt(Math.floor(p.x), Math.floor(p.z)) > 0;
    return waiting || this.stuckT > A.stuck || (inBrush && dist > S.brushDist);
  }

  // ---------------------------------------------------------------- attack tokens

  /** Sim clock for token timing (the day timer stops with hit-stop, pause and the map). */
  _now() { return this.scene.dayT ?? this.game.time; }

  _pool() { return (this.scene._attackPool ||= { holders: new Set(), last: -1e9 }); }

  /** Could a token be taken right now (fewer than max holders, the grant gap and the post-hit pause have passed)? */
  _tokenFree() {
    const P = this._pool();
    const A = CONFIG.expedition.attackers;
    for (const e of P.holders) if (e.dead || !e.token) P.holders.delete(e);
    if (this.token) return true;
    const max = A.max[Math.max(0, Math.min(A.max.length - 1, (this.game.run?.night || 1) - 1))];
    const now = this._now();
    return P.holders.size < max && now - P.last >= A.gap && now - (P.hitAt ?? -1e9) >= A.afterHit;
  }

  /** force: a counter / a thrust out of a guard (POISE) - past the cap and the post-hit pause, but not the grant gap. */
  _takeToken(force = false) {
    if (this.token) return true;
    if (force ? this._now() - this._pool().last < CONFIG.expedition.attackers.gap * 0.5 : !this._tokenFree()) return false;
    const P = this._pool();
    P.holders.add(this);
    P.last = this._now();
    this.token = true;
    this.tokenUntil = 0;
    return true;
  }

  /**
   * The brawl cap (CONFIG.expedition.attackers.engagedMax by night): is this creature one of those allowed to fight you
   * now? Members leave when they die, calm down or drift `engageRelease` tiles off; a newcomer joins within `engageJoin`
   * tiles while there is room. force: you hit it — it fights back whatever the count. Boss minions and the Pack Lord
   * are never capped.
   */
  _engage(dist, force = false) {
    if (this.minion || this.lordOf) return true;
    const A = CONFIG.expedition.attackers;
    if (!A.engagedMax) return true;
    const sc = this.scene, p = sc.player.pos;
    const pool = (sc._engaged ||= new Set());
    for (const e of pool) {
      if (e.dead || !e.alerted || e.state === 'idle' || e.hidden || Math.hypot(e.x - p.x, e.z - p.z) > A.engageRelease) pool.delete(e);
    }
    if (pool.has(this)) return true;
    const max = A.engagedMax[Math.max(0, Math.min(A.engagedMax.length - 1, (this.game.run?.night || 1) - 1))];
    if (force || (dist <= A.engageJoin && pool.size < max)) { pool.add(this); return true; }
    return false;
  }

  _dropToken() {
    if (!this.token) return;
    this.token = false;
    this.scene._attackPool?.holders.delete(this);
  }

  /**
   * Waiting for a token (or a cooldown): hold a slot about holdDist out on the player's flanks or back — `flank`
   * degrees off where they aim (Skitters: `backArc`, right behind) — orbiting round to it rather than backing off
   * (critic I #2). The slot follows the aim at `slotTurn` rad/s and swaps sides now and then.
   */
  _circle(toP, dist, dt, holdAt = null) {
    const A = CONFIG.expedition.attackers;
    const p = this.scene.player;
    this.slotT -= dt;
    if (this.slotT <= 0 || this.slotOff === undefined) {
      this.slotT = 2.5 + Math.random() * 2;
      const [a0, a1] = this.def.backArc ? A.backArc : A.flank;
      const side = this.slotOff === undefined ? this.strafeSign : (Math.random() < 0.3 ? -Math.sign(this.slotOff) : Math.sign(this.slotOff) || 1);
      this.slotOff = side * ((a0 + Math.random() * (a1 - a0)) * Math.PI) / 180;
    }
    const want = Math.atan2(p.aim.z, p.aim.x) + this.slotOff;
    if (this.slotA === undefined) this.slotA = want;
    const ds = wrapA(want - this.slotA), turn = A.slotTurn * dt;
    this.slotA += Math.max(-turn, Math.min(turn, ds));
    const cur = Math.atan2(this.z - p.pos.z, this.x - p.pos.x);   // where it stands, seen from the player
    const da = wrapA(this.slotA - cur);
    let tang = Math.max(-1, Math.min(1, da * 1.5));
    if (Math.abs(da) < 0.15) tang = 0.2 * this.strafeSign;
    const hold = holdAt ?? A.holdDist;
    const radial = dist < hold - 0.3 ? -1 : dist > hold + 0.4 ? 0.8 : 0;
    // (toP.z, -toP.x) walks round the player in the direction that increases `cur`.
    const mx = toP.z * tang + toP.x * radial, mz = -toP.x * tang + toP.z * radial;
    const l = Math.hypot(mx, mz) || 1;
    return { x: mx / l, z: mz / l };
  }

  /** Line of sight that only walls, trees and ruins block (undergrowth doesn't): for lobbed attacks. */
  _losOverBrush(tx, tz) {
    const w = this.scene.world;
    const ax = this.x, az = this.z;
    const len = Math.hypot(tx - ax, tz - az);
    if (len < 1e-4) return true;
    const n = Math.ceil(len * 3);
    for (let i = 1; i < n; i++) {
      const x = Math.floor(ax + ((tx - ax) * i) / n), z = Math.floor(az + ((tz - az) * i) / n);
      if (!w.inBounds(x, z) || w.opaqueGrid?.[z * w.size + x] === 1) return false;
    }
    return true;
  }

  /**
   * Where a lunge lands (critic I #1): ahead of the player along their velocity, by `lead` × the time from the ring
   * locking to the lunge arriving (the rest of the wind-up + the lunge's travel), within the lunge's reach and
   * short of solid tiles — so walking past a creature isn't safe; changing direction after the lock or rolling is.
   * Sets aimDir.
   */
  _lungeAim(mv) {
    const d = this.def, sc = this.scene, p = sc.player;
    const two = mv === 'thrust2';
    const max = two ? d.thrust2.lunge : d.lunge;
    const tr = two ? d.thrust2.track : (d.track ?? 0);
    const d0 = Math.hypot(p.pos.x - this.x, p.pos.z - this.z);
    const lead = (d.lead || 0) * ((this.windT || this.windup) * (1 - tr) + Math.min(max, d0) / (d.lunge / d.lungeTime));
    const v = leadVel(p);
    const tx = p.pos.x + v.x * lead, tz = p.pos.z + v.z * lead;
    let dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    dx /= dist; dz /= dist;
    const travel = Math.min(max, Math.max(0.4, dist));
    const through = !!this.moveOpts.throughBrush;
    const solidLen = rayLength(sc.world, this.x, this.z, dx, dz, travel, (x, y) => (through ? sc.world.wetAt(x, y) : sc.world.solidAt(x, y)));
    const reach = Math.max(0.3, Math.min(travel, solidLen - this.radius));
    this.aimDir = { x: dx, z: dz };
    return { x: this.x + dx * reach, z: this.z + dz * reach };
  }

  _startWindup(toP, dist, mv) {
    const d = this.def;
    const sc = this.scene;
    this.mv = mv;
    this.state = 'windup';
    this.committed = false;
    this.openT = 0;
    let wt = this.windup;
    if (mv === 'thrust2') wt = d.thrust2.delay * nightTune('enemyWindup', this.night);
    else if (mv === 'spear') wt = d.spear.windup;
    else if (mv === 'stomp') wt = d.elite.stomp.windup;
    else if (mv === 'charge2') wt = d.elite.reaim;
    // The Skitter chitters first (it comes from behind: you hear it before the ring).
    this.cueT = mv === 'lunge' && d.cue ? d.cue : 0;
    wt += this.cueT;
    this.stateT = this.windT = wt;
    this.aimDir = { ...toP };
    this.face = toP;
    this.hitDone = false;
    this.vel.x *= 0.2; this.vel.z *= 0.2;
    setAnim(this.vis, 'windup', true);
    // The wind-up anim stretches over the whole wind-up, so the strike pose lands on the commit.
    const wl = animLength(this.vis, 'windup');
    this.windAnimSpeed = wl > 0 ? Math.max(0.5, Math.min(2, wl / wt)) : 1;
    // A short eye glint: readable, and visible even when the telegraph itself is under foliage.
    this._glint();
    const p = sc.player;
    if (LUNGES[mv]) {
      // The lunge lands exactly where the dithered ring is drawn (the ring tracks, then locks: windup state).
      this.lungeTarget = this._lungeAim(mv);
      this.face = { ...this.aimDir };
      this.tele = sc.fx.ringTele(this.lungeTarget, { radius: this.radius + 0.45, color: '#ff0044', color2: '#e43b44', time: wt, fade: 0.1 });
      if (this.cueT) sfxAt(this.game, this.x, this.z, 'chitter', 'rustle');
    } else if (mv === 'glob') {
      // Lobbed sap: a ground ring follows you while it aims, then locks; the glob lands in it.
      this.lobTarget = { x: p.pos.x, z: p.pos.z };
      const L = JUICE.tele.lob;
      const est = Math.max(L.minFlight, Math.min(L.maxFlight, dist / d.shotSpeed));
      this.tele = sc.fx.ringTele(this.lobTarget, { radius: L.radius, color: '#ff4d8d', color2: '#b55088', time: wt + est, fade: 0.05 });
      this._aimLob(p.pos.x, p.pos.z);
    } else if (mv === 'bolt' || mv === 'spear') {
      const range = mv === 'spear' ? d.spear.range : d.range;
      if (mv === 'spear') { this.aimDir = this._spearAim(); this.face = { ...this.aimDir }; }
      const len = rayLength(sc.world, this.x, this.z, this.aimDir.x, this.aimDir.z, range);
      this.tele = sc.fx.telegraph({ x: this.x, z: this.z }, { dir: this.aimDir, length: Math.max(0.5, len), width: mv === 'spear' ? d.spear.width : 0.22, color: '#ff7a3c', time: wt, fade: 0.08 });
      this.teleLen = this.curLen = len;
    } else if (CHARGES[mv]) {
      const len = this._laneLength(toP);
      // Cracked, dusty ground along the lane; it stays under the beast while it charges.
      // Drawn as wide as the real hit band (_contact: the player's centre within radius + r + 0.2 of the beast's path).
      const hitW = 2 * (this.radius + (p.r || CONFIG.player.radius) + 0.2);
      this.tele = sc.fx.chargeLane({ x: this.x, z: this.z }, { dir: toP, length: len, width: hitW, time: wt, fade: d.chargeTime + 0.15, hole: p.pos });
      this.teleLen = this.curLen = len;
    } else if (mv === 'stomp') {
      // The elite rears: a ring round itself as wide as the stamp.
      this.tele = sc.fx.ringTele({ x: this.x, z: this.z }, { radius: d.elite.stomp.radius, color: '#ff0044', color2: '#feae34', time: wt, fade: 0.12 });
    }
    if (mv === 'stomp') sfxAt(this.game, this.x, this.z, 'stomp_windup', 'snort');
    else this.game.sfx.playAt(d.attack === 'charge' ? 'snort' : `windup_${this.key}`, this.x, this.z);
  }

  /** Eye glint: a small red-white star at head height on the side it faces. */
  _glint() {
    const h = this.vis.userData.vis.height;
    this.scene.fx.flash({ x: this.x + this.face.x * this.radius * 0.35, y: h * 0.78, z: this.z + this.face.z * this.radius * 0.35 }, { color: '#ff4040', size: 9 / 32, life: JUICE.tele.glint });
  }

  /** Spitter: aim the lob at (tx, tz), clamped to its range; the landing ring follows. */
  _aimLob(tx, tz) {
    const d = this.def;
    let dx = tx - this.x, dz = tz - this.z;
    const l = Math.hypot(dx, dz);
    if (l > d.range) { dx *= d.range / l; dz *= d.range / l; }
    this.lobTarget = { x: this.x + dx, z: this.z + dz };
    this.tele?.move?.(this.lobTarget.x, this.lobTarget.z);
  }

  _laneLength(dir) {
    const d = this.def;
    const sc = this.scene;
    // The charge bulldozes undergrowth and stops at trees / ruins / the map edge, so the lane does too.
    const block = this.moveOpts.onBrush || this.moveOpts.throughBrush ? (x, y) => sc.world.blockedAt(x, y, true) : (x, y) => sc.world.blockedAt(x, y);
    return Math.max(0.6, rayLength(sc.world, this.x, this.z, dir.x, dir.z, d.chargeSpeed * d.chargeTime, block));
  }

  /** While a tracking telegraph rotates, keep its length matching the wall it now points at. */
  _resizeLane() {
    if (!this.tele) return;
    const d = this.def;
    const sc = this.scene;
    const range = this.mv === 'spear' ? d.spear.range : d.range;
    const len = CHARGES[this.mv] ? this._laneLength(this.aimDir) : rayLength(sc.world, this.x, this.z, this.aimDir.x, this.aimDir.z, range);
    if (this.tele.setDir) this.tele.setDir(this.aimDir, len);   // pixel lane: redrawn for the new direction
    // The lane lies along the group's local -Z, so scaling Z stretches it to the new wall distance.
    else this.tele.group.scale.z = Math.max(0.1, len) / Math.max(0.1, this.teleLen);
    this.curLen = len;
  }

  _startAttack() {
    const d = this.def;
    const sc = this.scene;
    const mv = this.mv;
    this.state = 'attack';
    if (LUNGES[mv] || CHARGES[mv] || mv === 'stomp') this._commit();
    this.landed = false;
    const tele = this.tele;
    this.tele = null;
    setAnim(this.vis, 'attack', true);
    const al = animLength(this.vis, 'attack');
    this.atkAnimSpeed = 1;
    if (LUNGES[mv]) {
      const lx = this.lungeTarget.x - this.x, lz = this.lungeTarget.z - this.z;
      const ll = Math.hypot(lx, lz) || 1;
      this.aimDir = { x: lx / ll, z: lz / ll };
      this.stateT = (ll / d.lunge) * d.lungeTime + 0.02;
      const x0 = this.x, z0 = this.z, tx = this.lungeTarget.x, tz = this.lungeTarget.z;
      const reach = this.radius + sc.player.r + 0.2 + ROLL.nearPad;
      sc.player.nearMiss?.((px, pz) => segDist(px, pz, x0, z0, tx, tz) < reach);
      // The strike frame lands mid-lunge, where contact happens.
      if (al > 0) this.atkAnimSpeed = Math.max(0.7, Math.min(2.5, (animHitFrac(this.vis, 'attack', 0.4) * al) / Math.max(0.05, this.stateT * 0.55)));
      this.game.sfx.playAt('lunge', this.x, this.z);
    } else if (mv === 'glob') {
      const L = JUICE.tele.lob;
      const h = this.vis.userData.vis.height;
      const t = this.lobTarget || { x: sc.player.pos.x, z: sc.player.pos.z };
      const ox = this.x + this.face.x * this.radius * 0.5, oz = this.z + this.face.z * this.radius * 0.5;
      const dist = Math.hypot(t.x - ox, t.z - oz);
      const time = Math.max(L.minFlight, Math.min(L.maxFlight, dist / d.shotSpeed));
      // The landing ring keeps closing until the glob lands (the flight owns it now).
      const ring = tele?.retime ? (tele.retime(time), tele) : sc.fx.ringTele(t, { radius: L.radius, color: '#ff4d8d', color2: '#b55088', time, fade: 0.05 });
      sc.shots.lob({ x: ox, z: oz, tx: t.x, tz: t.z, time, apex: Math.max(L.apexMin, dist * L.apex), y0: h * 0.55, radius: L.radius, damage: this.damage, source: d.name, ring, owner: this });
      sc.fx.burst({ x: ox, y: h * 0.55 - 0.4, z: oz }, { color: '#ff4d8d', color2: '#b55088', count: 5, speed: 1.2, up: 1.8, life: 0.25, size: 2 / 32 });
      this.game.sfx.playAt('spit', this.x, this.z);
      this.stateT = 0;
    } else if (mv === 'bolt' || mv === 'spear') {
      const spear = mv === 'spear';
      const ox = this.x + this.aimDir.x * (this.radius + 0.1), oz = this.z + this.aimDir.z * (this.radius + 0.1);
      sc.shots.fire({
        team: 'enemy', kind: spear ? 'spear' : (d.shot || 'bolt'), x: ox, z: oz, dx: this.aimDir.x, dz: this.aimDir.z,
        speed: spear ? d.spear.speed : d.shotSpeed, range: (spear ? d.spear.range : d.range) + 0.5,
        damage: spear ? this.spearDamage : this.damage, source: d.name, owner: this,
      });
      sc.fx.burst({ x: ox, y: 0.1, z: oz }, { color: spear ? '#a8763e' : '#feae34', count: 4, speed: 1.5, up: 1, life: 0.2, size: 0.07 });
      if (spear) { this.spearCd = d.spear.cooldown; sc._lastSpear = this._now(); sfxAt(this.game, this.x, this.z, 'spear_throw', 'lunge'); }
      else this.game.sfx.playAt('enemy_shot', this.x, this.z);
      this.stateT = 0;
    } else if (CHARGES[mv]) {
      const len = this.curLen ?? this.teleLen;
      this.stateT = (len / d.chargeSpeed) + 0.05;
      this.game.sfx.playAt('charge', this.x, this.z);
      const x0 = this.x, z0 = this.z, x1 = x0 + this.aimDir.x * len, z1 = z0 + this.aimDir.z * len;
      const reach = this.radius + sc.player.r + 0.2 + ROLL.nearPad;
      sc.player.nearMiss?.((px, pz) => segDist(px, pz, x0, z0, x1, z1) < reach);
    } else if (mv === 'stomp') {
      this._stomp();
      this.stateT = 0;
    }
    this.atkTime = Math.max(0.05, this.stateT);
    // Keep showing the attack anim through the recovery until it has played out.
    this.atkAnimT = al > 0 ? al / this.atkAnimSpeed : 0;
  }

  /** The elite Razorback's stamp (critic I #12): everything within the ring is hit and shoved out. */
  _stomp() {
    const S = this.def.elite.stomp;
    const sc = this.scene, p = sc.player, fx = sc.fx;
    p.nearMiss?.((px, pz) => Math.hypot(px - this.x, pz - this.z) < S.radius + p.r * 0.5 + ROLL.nearPad);
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z, d = Math.hypot(dx, dz) || 1e-4;
    if (!p.dead && d < S.radius + p.r * 0.5) {
      const dmg = Math.round(S.damage * nightTune('enemyDamage', this.night) * CONFIG.expedition.elite.damageMult);
      if (p.hurt(dmg, dx / d, dz / d, this.def.name, 'stomp', this)) { this.landed = true; this._pool().hitAt = this._now(); p.kb.x += (dx / d) * S.knock; p.kb.z += (dz / d) * S.knock; }
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      fx.burst({ x: this.x + Math.cos(a) * S.radius * 0.8, y: -0.3, z: this.z + Math.sin(a) * S.radius * 0.8 }, { color: '#b86f50', color2: '#e4a672', count: 1, speed: 1.6, up: 1.8, life: 0.45, size: 2 / 32, gravity: 7, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2 });
    }
    fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: S.radius, life: 0.3 });
    fx.crack?.({ x: this.x, z: this.z });
    if (d < 10) this.game.shake(5, 0.25);
    sfxAt(this.game, this.x, this.z, 'stomp', 'crash');
  }

  /** After a lunge: sometimes a Feral thrusts again (critic I §9C), otherwise recover. */
  _afterLunge(toP, dist, playerTarget) {
    const T = this.def.thrust2;
    const ch = Array.isArray(T?.chance) ? T.chance[Math.min(T.chance.length - 1, Math.max(0, this.night - 1))] : T?.chance;   // (by night)
    if (this.mv === 'lunge' && T && playerTarget && this.night >= T.fromNight && Math.random() < ch) {
      this._startWindup(toP, dist, 'thrust2');
      return;
    }
    this._recover(this.def.cooldown);
  }

  _contact(dist) {
    if (this.hitDone) return;
    const p = this.scene.player;
    if (dist < this.radius + p.r + 0.2) {
      const kind = CHARGES[this.mv] ? 'charge' : 'melee';
      if (p.tryDeflect?.(this, kind, this.x, this.z)) { this.hitDone = true; return; }
      const dmg = this.mv === 'thrust2' ? Math.round(this.damage * this.def.thrust2.damage) : this.damage;
      if (p.hurt(dmg, this.aimDir.x, this.aimDir.z, this.def.name, this.mv, this)) {
        this.hitDone = true;
        this.landed = true;
        this._pool().hitAt = this._now();
        if (this.def.bleed) p.bleed?.(this.def.bleed);
      } else if (p.dodging) this.hitDone = true;
    }
  }

  _recover(cd) {
    const A = CONFIG.expedition.attackers;
    this.state = 'recover';
    this.stateT = 0.35;
    // A lunge / charge / stomp that missed you leaves it open for `recover` s (POISE.punish; elites recover faster);
    // the Skitter then darts back out for a moment.
    const miss = (LUNGES[this.mv] || CHARGES[this.mv] || this.mv === 'stomp') && !this.landed && this.def.recover > 0;
    this.openT = miss ? this.def.recover * (this.elite ? 0.6 : 1) : 0;
    if (miss) this.stateT = this.openT + (this.def.dart ? 0.45 : 0);
    if (this.token) this.tokenUntil = this._now() + this.stateT + A.release;
    this.cd = cd * (0.85 + Math.random() * 0.3);
    this.bestD = Infinity;
    this.stuckT = 0;
    // A melee attacker that hit you hops back out of your face after its lunge (critic I #2).
    if (LUNGES[this.mv] && A.hopBack > 0 && !miss) {
      const p = this.scene.player.pos;
      const dx = this.x - p.x, dz = this.z - p.z, l = Math.hypot(dx, dz) || 1;
      this.kb.x += (dx / l) * A.hopBack * 9; this.kb.z += (dz / l) * A.hopBack * 9;   // kb decays at e^-9t
    }
  }

  // ---------------------------------------------------------------- wall splats

  /**
   * Knocked back hard into a trunk / rock / ruin, or onto a bramble (even creatures that slip through brush catch
   * on its thorns): extra damage and a short stun (SPLAT, critic I §9B).
   */
  /**
   * Knocked back hard (≥ SPLAT.speed) into a bramble or a trunk / rock / ruin: splat. SPLAT.reach tiles of slack
   * (critic I2 #11): a knock that is about to end just short of one still slams the creature into it.
   */
  _checkSplat(blocked) {
    const kbs = Math.hypot(this.kb.x, this.kb.z);
    if (kbs < SPLAT.speed) return;
    const ux = this.kb.x / kbs, uz = this.kb.z / kbs;
    const w = this.scene.world;
    for (const k of [this.radius + 0.12, this.radius + 0.12 + SPLAT.reach]) {
      const bx = Math.floor(this.x + ux * k), bz = Math.floor(this.z + uz * k);
      if (w.brushAt(bx, bz) === BRUSH.bramble) { this._splat('bramble', ux, uz, bx, bz); return; }
    }
    if (blocked && this._hit.obj) { this._splat('object', ux, uz); return; }
    const qx = this.x + ux * SPLAT.reach, qz = this.z + uz * SPLAT.reach;
    for (const c of w.collidersNear(qx, qz, this.radius + 0.1)) {
      if (!inFootprint(c, qx, qz, this.radius)) continue;
      // Slide it the rest of the way so it visibly hits the bark.
      w.moveBody(this, ux * SPLAT.reach, uz * SPLAT.reach, this.radius, this.moveOpts);
      this._splat('object', ux, uz);
      return;
    }
  }

  /** The splat itself: bonus damage and a stun, with a big impact (critic I2 #11). kind: 'object' | 'bramble' | 'charge'. */
  _splat(kind, ux, uz, bx, bz) {
    const S = SPLAT[kind], I = SPLAT.impact;
    const sc = this.scene, fx = sc.fx;
    this.splatCd = 0.6;
    this.knockT = 0;
    this.kb.x = this.kb.z = 0;
    const cx = this.x + ux * this.radius, cz = this.z + uz * this.radius;
    const h = this.vis.userData.vis.height;
    if (kind === 'bramble') {
      sc.world.hitBrush(bx, bz, 1);
      fx.burst({ x: cx, y: 0.3, z: cz }, { color: '#c23a3a', color2: '#4a2428', count: 16, speed: 2.8, up: 2.2, life: 0.5, size: 2 / 32, gravity: 6, vx: -ux, vz: -uz });
    } else {
      // Bark chips and dust off the trunk, leaves shaken loose from above, a dust ring where it hit.
      fx.burst({ x: cx, y: 0.35, z: cz }, { color: '#8f563b', color2: '#c0cbdc', count: 18, speed: 3, up: 2.6, life: 0.55, size: 2 / 32, gravity: 9, vx: -ux * 2, vz: -uz * 2 });
      fx.burst({ x: cx + ux * 0.2, y: 1.4, z: cz + uz * 0.2 }, { color: '#4b8139', color2: '#99e550', count: 8, speed: 0.8, up: 0.2, life: 1.1, size: 2 / 32, aspect: 2, gravity: 1.2, drag: 2, flutter: 1.2 });
      fx.ring({ x: cx, z: cz }, { color: '#e4a672', radius: I.ring, life: 0.3 });
      fx.crack?.({ x: cx - ux * 0.2, z: cz - uz * 0.2 });
    }
    fx.flash({ x: cx, y: h * 0.45, z: cz }, { color: '#fee761', size: 0.7, life: 0.08 });
    flashVisual(this.vis, '#ffffff', 0.12);
    fx.text({ x: this.x, z: this.z }, 'SPLAT!', { color: '#fee761', cls: 'big', y: h + 0.45, life: 0.8, key: 'splat' });
    fx.hitStop(I.hitStop);
    this.game.shake(I.shake, 0.18);
    sfxAt(this.game, this.x, this.z, 'splat_wall', 'crash');
    this.hit(S.damage, ux, uz, 0, 'splat');
    if (!this.dead) this.stun(kind === 'charge' ? (this.def.stun || 0.8) : S.stun, null);
  }

  // ---------------------------------------------------------------- the Thorn Stalker

  /** The ambusher's own loop (critic I §9D): under the brush → ring under you → erupt → exposed → burrow. */
  _updateAmbush(dt, dist, toP, playerTarget, choking) {
    const d = this.def, sc = this.scene, p = sc.player;
    switch (this.state) {
      case 'spawn': if (this.stateT <= 0) this.state = 'idle'; break;
      case 'idle': {
        // It feels footsteps: no line of sight needed.
        if (playerTarget && dist <= d.detect) { this.alerted = true; this.state = 'chase'; break; }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 3;
          this.wanderTo = { x: this.home.x + (Math.random() - 0.5) * 5, z: this.home.z + (Math.random() - 0.5) * 5 };
        }
        if (this.wanderTo && this.hidden) {
          const wx = this.wanderTo.x - this.x, wz = this.wanderTo.z - this.z, wl = Math.hypot(wx, wz);
          if (wl > 0.3) this._underMove({ x: wx / wl, z: wz / wl }, d.speed * 0.35 * dt); else this.wanderTo = null;
        } else this.moving = false;
        break;
      }
      case 'chase': {
        if (!playerTarget || dist > d.detect * 2) { this.state = 'idle'; this.alerted = false; this.home = { x: this.x, z: this.z }; break; }
        if (!this.hidden) { this._burrow(); break; }
        const under = this._underBrush();
        if (under && dist <= d.reach && this.cd <= 0 && !choking && this._takeToken()) { this._startAmbush(); break; }
        // Close in under the brush (it won't follow you onto open ground); off the brush, it heads back into it.
        const dir = under ? toP : (this._toBrush() || toP);
        if (under && dist < 0.9) this.moving = false;
        else this._underMove(dir, d.speed * (choking ? SPORES.creature.slow : 1) * (under ? 1 : 0.6) * dt);
        break;
      }
      case 'windup': {
        // It glides under the ring while the ground there heaves.
        const at = this.eruptAt;
        const ex = at.x - this.x, ez = at.z - this.z, el = Math.hypot(ex, ez);
        if (el > 0.02) { const s = Math.min(el, 7 * dt); this.x += (ex / el) * s; this.z += (ez / el) * s; }
        if (Math.random() < dt * 32) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * d.ring;
          sc.fx.burst({ x: at.x + Math.cos(a) * r, y: -0.3, z: at.z + Math.sin(a) * r }, { color: '#5a4430', color2: '#8c4026', count: 2, speed: 0.6, up: 1.8, life: 0.4, size: 2 / 32, gravity: 6 });
        }
        if (this.stateT <= 0) this._erupt();
        break;
      }
      case 'exposed': if (this.stateT <= 0) this._burrow(); break;
      case 'stunned': {
        if (Math.random() < 0.15) sc.fx.burst({ x: this.x, y: this.vis.userData.vis.height - 0.2, z: this.z }, { color: '#fee761', count: 1, speed: 0.8, up: 1, life: 0.4, size: 0.06, gravity: 2 });
        if (this.stateT <= 0) this._burrow();
        break;
      }
      case 'burrow': {
        if (this.stateT <= 0) { this.hidden = true; this.vis.visible = false; this.state = 'chase'; this.moving = false; }
        break;
      }
      default: this.state = 'chase';
    }
    // While out of the ground it can be shoved (and splatted) like anything else.
    if (!this.hidden) {
      const kd = Math.exp(-9 * dt);
      this.kb.x *= kd; this.kb.z *= kd;
      if (Math.abs(this.kb.x) + Math.abs(this.kb.z) > 0.05) {
        this._hit.obj = undefined;
        const blocked = sc.world.moveBody(this, this.kb.x * dt, this.kb.z * dt, this.radius, this.moveOptsHit);
        if (this.knockT > 0 && this.splatCd <= 0) this._checkSplat(blocked);
      }
      if (!this.dead && this.state !== 'burrow') this._separate(dt);
    } else if (this.moving && Math.random() < dt * 7) {
      // Under the brush only the leaves give it away (and a soft chk-chk).
      sc.fx.burst({ x: this.x, y: 0.35, z: this.z }, { color: '#2a5628', color2: '#99e550', count: 2, speed: 1.1, up: 1.8, life: 0.45, size: 1.5 / 32, gravity: 5 });
      if (dist < 10 && Math.random() < 0.4) sfxAt(this.game, this.x, this.z, 'stalker', 'rustle');
    }
  }

  _underBrush() { return this.scene.world.brushAt(Math.floor(this.x), Math.floor(this.z)) > 0; }

  /** Move under the brush only (it slides along the edge rather than surfacing); off the brush, anywhere. */
  _underMove(dir, step) {
    const w = this.scene.world;
    const ok = (x, z) => w.brushAt(Math.floor(x), Math.floor(z)) > 0;
    const here = ok(this.x, this.z);
    const tryMove = (ax, az) => {
      const l = Math.hypot(ax, az);
      if (l < 1e-6) return false;
      if (here && !ok(this.x + ax + (ax / l) * 0.25, this.z + az + (az / l) * 0.25)) return false;
      w.moveBody(this, ax, az, this.radius * 0.6, { throughBrush: true });
      return true;
    };
    const ax = dir.x * step, az = dir.z * step;
    this.moving = tryMove(ax, az) || tryMove(ax, 0) || tryMove(0, az);
  }

  /** Direction to the nearest brush tile (within 4 tiles), or null. */
  _toBrush() {
    const w = this.scene.world;
    const tx0 = Math.floor(this.x), tz0 = Math.floor(this.z);
    let best = null, bd = Infinity;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (!w.brushAt(tx0 + dx, tz0 + dz)) continue;
      const x = tx0 + dx + 0.5 - this.x, z = tz0 + dz + 0.5 - this.z, dd = x * x + z * z;
      if (dd < bd) { bd = dd; best = { x, z }; }
    }
    if (!best) return null;
    const l = Math.hypot(best.x, best.z) || 1;
    return { x: best.x / l, z: best.z / l };
  }

  _startAmbush() {
    const d = this.def, sc = this.scene, p = sc.player;
    this.mv = 'erupt';
    this.state = 'windup';
    this.stateT = this.windT = d.windup;
    this.eruptAt = { x: p.pos.x, z: p.pos.z };
    this.tele = sc.fx.ringTele(this.eruptAt, { radius: d.ring, color: '#ff0044', color2: '#8c4026', time: d.windup, fade: 0.1 });
    xrayRing(this.tele);   // it lives in the ferns: the ring shows through them (critic I2 #9)
    sfxAt(this.game, this.eruptAt.x, this.eruptAt.z, 'windup_stalker', 'rustle');
  }

  _erupt() {
    const d = this.def, sc = this.scene, p = sc.player, fx = sc.fx, at = this.eruptAt;
    p.nearMiss?.((px, pz) => Math.hypot(px - at.x, pz - at.z) < d.ring + p.r * 0.5 + ROLL.nearPad);
    this.tele = null;
    this.x = at.x; this.z = at.z;
    this.hidden = false;
    this.vis.visible = true;
    this.state = 'exposed';
    this.stateT = d.exposed;
    this.riseT = 0.18;
    this.cd = d.cooldown * (0.85 + Math.random() * 0.3);
    setAnim(this.vis, 'attack', true);
    this.atkAnimSpeed = 1.2;
    this.atkAnimT = 0.4;
    if (!p.dead && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < d.ring + p.r * 0.5) {
      if (p.hurt(this.damage, 0, 0, d.name, 'erupt', this)) { p.root?.(d.root); this._pool().hitAt = this._now(); }
    }
    fx.burst({ x: at.x, y: -0.2, z: at.z }, { color: '#5a4430', color2: '#8f563b', count: 18, speed: 3, up: 3.2, life: 0.55, size: 2 / 32, gravity: 9 });
    fx.burst({ x: at.x, y: 0.2, z: at.z }, { color: '#c23a3a', color2: '#2a5628', count: 12, speed: 2.6, up: 2.6, life: 0.6, size: 2 / 32, aspect: 2, gravity: 5, drag: 2 });
    fx.ring({ x: at.x, z: at.z }, { color: '#c23a3a', radius: d.ring + 0.3, life: 0.3 });
    if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 10) this.game.shake(4, 0.18);
    sfxAt(this.game, at.x, at.z, 'stalker_erupt', 'ambush', 'crash');
  }

  _burrow() {
    this.state = 'burrow';
    this.stateT = this.def.burrow;
    this.tele?.cancel();
    this.tele = null;
    setAnim(this.vis, 'idle');
    this.scene.fx.burst({ x: this.x, y: -0.2, z: this.z }, { color: '#5a4430', color2: '#2a5628', count: 10, speed: 1.6, up: 2, life: 0.45, size: 2 / 32, gravity: 8 });
  }

  // ---------------------------------------------------------------- visuals

  _syncVisual(dt) {
    const v = this.vis;
    if (!v) return;
    let y = 0, ox = 0, oz = 0;
    if (this.state === 'spawn') {
      const k = 1 - Math.max(0, this.stateT) / CONFIG.expedition.spawnInTime;
      y = -1.2 * (1 - k);
      if (Math.random() < 0.5) this.scene.fx.burst({ x: this.x, y: -0.35, z: this.z }, { color: '#733e39', count: 1, speed: 1.5, up: 2, life: 0.3, size: 0.07 });
    } else if (this.state === 'windup') {
      // The body shakes harder through the chitter cue and the last third (the commit is coming).
      const late = this.stateT < this.windT * 0.35 || (this.cueT && this.windT - this.stateT < this.cueT);
      const j = late ? 0.1 : 0.06;
      ox = (Math.random() - 0.5) * j; oz = (Math.random() - 0.5) * j;
    } else if (this.state === 'attack' && this.key === 'skitter') {
      // The Skitter's attack frames are a wing-raise: it leaps along its lunge.
      const k = 1 - Math.max(0, this.stateT) / (this.atkTime || 0.2);
      y = Math.sin(Math.min(1, k) * Math.PI) * 0.3;
    } else if (this.state === 'burrow') {
      y = -0.9 * (1 - Math.max(0, this.stateT) / (this.def.burrow || 0.3));
    }
    if (this.riseT > 0) { this.riseT -= dt; y -= 0.9 * Math.max(0, this.riseT) / 0.18; }
    const vis = v.userData.vis;
    if (vis.kind === 'model' && this.moving) {
      this.walkT += dt * 14;
      y += Math.abs(Math.sin(this.walkT)) * 0.05;
    }
    v.position.set(this.x + ox, y, this.z + oz);
    setFacing(v, this.face.x, this.face.z);
    this.atkAnimT = (this.atkAnimT || 0) - dt;
    if (this.state === 'windup') { setAnim(v, 'windup'); setAnimSpeed(v, this.windAnimSpeed || 1); }
    else if (this.state === 'guard') { setAnim(v, 'windup'); setAnimSpeed(v, 0); }   // guard up: the wind-up's first pose, held
    else if (this.state === 'attack' || ((this.state === 'recover' || this.state === 'exposed' || this.state === 'chase') && this.atkAnimT > 0)) { setAnim(v, 'attack'); setAnimSpeed(v, this.atkAnimSpeed || 1); }
    else if (this.state === 'stunned') setAnimSpeed(v, 1);
    else {
      setAnimSpeed(v, 1);
      if (this.moving) setAnim(v, 'walk');
      else setAnim(v, 'idle');
    }
    if (this.state === 'windup' && vis.kind === 'model') flashVisual(v, '#ff6060', 0.03);
    // Choking in a spore cloud: it coughs up spores.
    if (this.chokeT > 0 && !this.hidden && Math.random() < dt * 5) {
      this.scene.fx.burst({ x: this.x, y: vis.height * 0.8, z: this.z }, { color: SPORES.color, color2: SPORES.color2, count: 2, speed: 0.6, up: 1.2, life: 0.5, size: 2 / 32, gravity: -0.4 });
    }
    updateVisual(v, dt);
    // HP bar: always for elites / objective targets, otherwise briefly after a hit.
    const show = !this.dead && !this.hidden && this.state !== 'spawn' && (this.elite || this.objective || this.barT > 0) && this.hp < this.maxHp + (this.elite ? 1 : 0);
    this.barBg.visible = this.barFill.visible = show;
    if (show) {
      const hy = vis.height + 0.2;
      this.barBg.position.set(this.x, hy, this.z);
      const f = Math.max(0, this.hp / this.maxHp);
      this.barFill.scale.x = Math.max(0.001, this.barW * f);
      this.barFill.position.set(this.barBg.position.x - this.barW / 2, this.barBg.position.y, this.barBg.position.z);
    }
  }

  dispose() {
    this._dropToken();
    this.tele?.cancel();
    if (this.vis) this.game.assets.disposeVisual(this.vis);
    for (const s of [this.barBg, this.barFill]) { s.removeFromParent(); s.material.dispose(); }
  }
}
