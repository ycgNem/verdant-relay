// Night-defense enemies: waypoint followers that walk a lane to the Relay Core.
//
// Each enemy tracks `dist`, its distance travelled along its lane; position = lane.pointAt(dist)
// plus a small fixed sideways jitter so groups don't walk in single file. Status effects:
//   slows   keyed by source (snare, thorn, arc, rapid…); the strongest active one applies.
//           Shown as a blue tint (setBaseColor) plus an icy ground ring (the tint alone is hard to
//           read under the blue night light). Bosses resist part of every slow.
//   root    stops movement; shown with vines around the feet and green particles.
// Type behaviours (all data-driven from DEFENSE_ENEMIES):
//   burrow  underground for a fraction of the route: semi-transparent, bullets can't target it
//   spit    stops within `spit.range` of the core and lobs sap after a telegraphed wind-up
//   onDeath bursts into seedlings unless the killing blow was a blast (handled by the scene)
//   resist  e.g. Ruin Guard: kinetic damage halved, with shield sparks on every blocked hit
//   phases  the Colossus loop: approach → root (telegraph, spawns crawlers) → charge (wind-up, fast)

import * as THREE from 'three';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { DEFENSE } from '../data/waves.js';
import { setAnim, setFacing, flashVisual, setBaseColor, setOpacity, updateVisual } from '../core/Assets.js';

const SLOW_TINT = '#7d9cff';
const ROOT_TINT = '#86c8a0';

/** A lane path in world space with distance-based lookups. */
export class Lane {
  constructor(def, index) {
    this.index = index;
    this.name = def.name;
    this.short = def.short || def.name;
    this.pts = def.points.map(([x, y]) => new THREE.Vector3(x + 0.5, 0, y + 0.5));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.total = this.cum[this.cum.length - 1];
  }

  _seg(d) {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    return i;
  }

  pointAt(d, out = new THREE.Vector3()) {
    d = Math.max(0, Math.min(this.total, d));
    const i = this._seg(d);
    const a = this.pts[i - 1], b = this.pts[i];
    const len = this.cum[i] - this.cum[i - 1] || 1;
    return out.lerpVectors(a, b, (d - this.cum[i - 1]) / len);
  }

  dirAt(d, out = new THREE.Vector3()) {
    const i = this._seg(Math.max(0, Math.min(this.total, d)));
    return out.subVectors(this.pts[i], this.pts[i - 1]).normalize();
  }

  /** Straight pieces of the path between distances d0 and d1: [{a, b}] (for charge telegraphs). */
  pieces(d0, d1) {
    d0 = Math.max(0, d0); d1 = Math.min(this.total, d1);
    const out = [];
    let d = d0;
    while (d < d1 - 1e-4) {
      const i = this._seg(d + 1e-4);
      const end = Math.min(d1, this.cum[i]);
      out.push({ a: this.pointAt(d), b: this.pointAt(end) });
      d = end;
    }
    return out;
  }
}

export class DefenseEnemy {
  /**
   * opts: { hpMult, dist, off }  dist = starting distance along the lane (seedlings, boss spawns)
   */
  constructor(scene, type, laneIndex, opts = {}) {
    const def = DEFENSE_ENEMIES[type];
    this.scene = scene;
    this.type = type;
    this.def = def;
    this.laneIndex = laneIndex;
    this.lane = scene.lanes[laneIndex];
    this.boss = !!def.boss;
    this.maxHp = def.hp * (opts.hpMult ?? 1);
    this.hp = this.maxHp;
    this.dist = opts.dist ?? 0;
    const j = this.boss ? 0 : 0.22;
    this.off = opts.off || { x: (Math.random() * 2 - 1) * j, z: (Math.random() * 2 - 1) * j };
    this.speedJitter = this.boss ? 1 : 0.95 + Math.random() * 0.1;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(1, 0, 0);

    this.obj = new THREE.Group();
    this.visual = scene.game.assets.makeVisual(type);
    this.obj.add(this.visual);
    this.vis = this.visual.userData.vis;
    this.height = Math.max(0.35, this.vis.height);
    this.hasBurrowAnim = !!this.vis.anims?.burrowed;

    // HP bar: two camera-facing sprites (shared materials), drawn on top of everything.
    const w = this.boss ? 0 : Math.min(1.1, 0.45 + (def.size || 0.6) * 0.5);
    this.barW = w;
    if (w > 0) {
      this.barBg = new THREE.Sprite(scene.hpMats.bg);
      this.barBg.scale.set(w + 0.06, 0.13, 1);
      this.barFill = new THREE.Sprite(scene.hpMats.good);
      this.barFill.center.set(0, 0.5);
      this.barFill.scale.set(w, 0.07, 1);
      this.barFill.position.x = -w / 2;
      for (const s of [this.barBg, this.barFill]) { s.renderOrder = 50; s.position.y = this.height + 0.22; s.visible = false; }
      this.barFill.renderOrder = 51;
      this.obj.add(this.barBg, this.barFill);
    }

    this.slows = new Map();
    this.slowMult = 1;
    this.rootT = 0;
    this.rootReady = 0;
    this.tint = '#ffffff';
    this.burrowed = false;
    this.dead = false;
    this.removed = false;
    this.leaked = false;
    this.age = 0;
    this.stopped = false;

    // Behaviour state
    this.state = 'walk';
    this.stateT = 0;
    this.tele = null;            // active telegraph handle(s)
    this.phaseLabel = '';
    if (this.boss) { this.state = 'approach'; this.stateT = def.phases.approach; this.phaseLabel = 'Advancing'; }

    this._place();
    scene.three.add(this.obj);
    setAnim(this.visual, 'walk');
  }

  get onField() { return this.pos.x > -0.3; }

  /** Point projectiles aim at (body centre; near the ground while burrowed). */
  aimPoint(out) {
    return out.set(this.pos.x, this.burrowed ? 0.12 : this.height * 0.5, this.pos.z);
  }

  canBeTargetedBy(kind) {
    if (this.dead || this.removed || !this.onField) return false;
    return kind === 'bullet' ? !this.burrowed : true;
  }

  get remaining() { return this.lane.total - this.dist; }

  /** Where this enemy will be in `t` seconds at its current speed (mortar lead). */
  predict(t, out = new THREE.Vector3()) {
    this.lane.pointAt(this.dist + (this.curSpeed || 0) * t, out);
    out.x += this.off.x;
    out.z += this.off.z;
    return out;
  }

  // ---------------------------------------------------------------- status effects

  applySlow(mult, time, key = 'slow') {
    if (this.dead) return;
    const cur = this.slows.get(key);
    if (!cur || mult < cur.mult || time > cur.t) this.slows.set(key, { mult: Math.min(mult, cur?.mult ?? 1), t: Math.max(time, cur?.t ?? 0) });
  }

  /** Root for `time` seconds. Returns false if immune. */
  applyRoot(time) {
    if (this.dead || this.def.rootImmune) return false;
    this.rootT = Math.max(this.rootT, time);
    this.scene.fx.burst(this.pos, { color: '#63c74d', color2: '#265c42', count: 8, speed: 1.2, up: 1.5, life: 0.4, size: 0.06, y: 0.05 });
    return true;
  }

  /** Apply damage after resistances. Returns the damage actually dealt. */
  hit(amount, type, opts = {}) {
    if (this.dead) return 0;
    const mult = this.def.resist?.[type] ?? 1;
    const dealt = Math.min(this.hp, amount * mult);
    this.hp -= amount * mult;
    if (!opts.silent) {
      if (mult < 1) {
        // Shield block: blue sparks on the shield side + a blue flash.
        flashVisual(this.visual, '#6fd3ff', 0.1);
        this.scene.fx.burst({ x: this.pos.x - 0.25, y: 0, z: this.pos.z }, { color: '#2ce8f5', color2: '#ffffff', count: 5, speed: 2.2, up: 1.6, life: 0.25, size: 0.05, y: this.height * 0.55 });
      } else {
        flashVisual(this.visual, '#ffffff', 0.08);
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killedBy = type;
    }
    return dealt;
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    if (this.dead || this.removed) return;
    const scene = this.scene;
    this.age += dt;

    // Status timers → effective slow multiplier.
    let m = 1;
    for (const [k, s] of this.slows) {
      s.t -= dt;
      if (s.t <= 0) this.slows.delete(k);
      else m = Math.min(m, s.mult);
    }
    if (this.def.slowResist) m = 1 - (1 - m) * (1 - this.def.slowResist);
    if (this.boss) m = Math.max(m, DEFENSE.bossSlowMin);
    this.slowMult = m;
    if (this.rootT > 0) this.rootT -= dt;
    this._updateStatusLook(dt);

    const rooted = this.rootT > 0;
    let speed = this.def.speed * this.speedJitter * scene.enemySpeedMult(this.laneIndex) * m;
    if (rooted) speed = 0;

    // Type behaviour may stop or speed up movement.
    if (this.boss) speed = this._bossUpdate(dt, speed);
    else if (this.def.spit) speed = this._spitUpdate(dt, speed);
    if (this.removed) return;   // e.g. a Spitter that withered this frame

    this.stopped = speed <= 0;
    this.curSpeed = speed;
    this.dist += speed * dt;

    // Burrowers are underground for the configured stretch of their route.
    if (this.def.burrow) {
      const f = this.dist / this.lane.total;
      const under = f >= this.def.burrow[0] && f < this.def.burrow[1];
      if (under !== this.burrowed) this._setBurrowed(under);
      if (under) {
        this._dirtT = (this._dirtT || 0) - dt;
        if (this._dirtT <= 0 && this.onField) {
          this._dirtT = 0.14;
          scene.fx.burst(this.pos, { color: '#8f563b', color2: '#3e2731', count: 2, speed: 0.8, up: 1.4, life: 0.35, size: 0.06, y: 0.05 });
        }
      }
    }

    if (this.dist >= this.lane.total) {
      this.dist = this.lane.total;
      this._place();
      scene.enemyReachedCore(this);
      return;
    }
    this._place();

    // Animation
    if (!this.boss && !(this.def.spit && this.state !== 'walk')) {
      if (this.burrowed && this.hasBurrowAnim) setAnim(this.visual, 'burrowed');
      else setAnim(this.visual, this.stopped ? 'idle' : 'walk');
    }
    updateVisual(this.visual, dt);

    // HP bar
    if (this.barFill) {
      const show = this.hp < this.maxHp && !this.burrowed;
      this.barBg.visible = this.barFill.visible = show;
      if (show) {
        const f = this.hp / this.maxHp;
        this.barFill.scale.x = this.barW * f;
        this.barFill.material = f > 0.6 ? scene.hpMats.good : f > 0.3 ? scene.hpMats.mid : scene.hpMats.low;
      }
    }
  }

  _place() {
    this.lane.pointAt(this.dist, this.pos);
    this.lane.dirAt(this.dist, this.dir);
    this.pos.x += this.off.x;
    this.pos.z += this.off.z;
    this.obj.position.copy(this.pos);
    if (!this.stopped) setFacing(this.visual, this.dir.x, this.dir.z);
  }

  _updateStatusLook(dt) {
    const rooted = this.rootT > 0;
    const tint = rooted ? ROOT_TINT : this.slowMult < 0.999 ? SLOW_TINT : '#ffffff';
    if (tint !== this.tint) {
      this.tint = tint;
      setBaseColor(this.visual, tint);
    }
    if (rooted && !this.vines) this.vines = this.scene.makeVines(this);
    if (this.vines) this.vines.visible = rooted;
    const slowed = !rooted && this.slowMult < 0.999;
    if (slowed && !this.slowRing && this.scene.makeSlowRing) this.slowRing = this.scene.makeSlowRing(this);
    if (this.slowRing) this.slowRing.visible = slowed;
    if (rooted) {
      this._leafT = (this._leafT || 0) - dt;
      if (this._leafT <= 0) {
        this._leafT = 0.25;
        this.scene.fx.burst(this.pos, { color: '#63c74d', color2: '#99e550', count: 2, speed: 0.5, up: 1.4, gravity: 3, life: 0.5, size: 0.05, y: 0.1 });
      }
    }
  }

  _setBurrowed(under) {
    this.burrowed = under;
    const vis = this.vis;
    if (this.hasBurrowAnim) {
      setOpacity(this.visual, under ? 0.8 : 1);
      setAnim(this.visual, under ? 'burrowed' : 'walk');
    } else {
      setOpacity(this.visual, under ? 0.45 : 1);
      if (vis.body) vis.body.position.y = under ? -0.2 : 0;
    }
    // Placeholder models get a dirt mound; sprites have their own 'burrowed' frames.
    if (!this.hasBurrowAnim) {
      if (!this.mound) this.mound = this.scene.makeMound(this);
      this.mound.visible = under;
    }
    if (this.onField) {
      this.scene.fx.burst(this.pos, { color: '#8f563b', color2: '#b86f50', count: 10, speed: 1.6, up: 2.2, life: 0.5, size: 0.07, y: 0.05 });
    }
  }

  // ---------------------------------------------------------------- spitter

  _spitUpdate(dt, speed) {
    const sp = this.def.spit;
    const scene = this.scene;
    if (this.state === 'walk') {
      if (this.pos.distanceTo(scene.corePos) <= sp.range) {
        this.state = 'aim';
        this.stateT = 0.5;            // short settle before the first wind-up
        setAnim(this.visual, 'idle');
      }
      return speed;
    }
    // Planted: face the core, wind up (telegraph line toward the core), then lob.
    setFacing(this.visual, scene.corePos.x - this.pos.x, scene.corePos.z - this.pos.z);
    this.stateT -= dt;
    if (this.state === 'aim' && this.stateT <= 0) {
      this.state = 'windup';
      this.stateT = sp.windup;
      setAnim(this.visual, 'windup', true);
      const d = new THREE.Vector3().subVectors(scene.corePos, this.pos).setY(0);
      const len = Math.max(0.5, d.length() - scene.coreRadius * 0.6);
      d.normalize();
      this.tele = scene.fx.telegraph(this.pos, { dir: { x: d.x, z: d.z }, length: len, width: 0.3, color: '#ff4d8d', time: sp.windup });
      if (this.vis.kind === 'model') this.vis.body.scale.setScalar(1);
    } else if (this.state === 'windup') {
      // Swell while winding up (placeholder models; sprites use their 'windup' frames).
      if (this.vis.kind === 'model') this.vis.body.scale.setScalar(1 + 0.25 * (1 - this.stateT / sp.windup));
      if (this.stateT <= 0) {
        this.tele = null;
        if (this.vis.kind === 'model') this.vis.body.scale.setScalar(1);
        setAnim(this.visual, 'attack', true);
        scene.spitAtCore(this, sp);
        this.shotsFired = (this.shotsFired || 0) + 1;
        if (sp.shots && this.shotsFired >= sp.shots) { scene.enemyWithered(this); return 0; }
        this.state = 'aim';
        this.stateT = Math.max(0.3, sp.every - sp.windup);
        this._backToIdle = 0.35;
      }
    }
    if (this._backToIdle > 0) {
      this._backToIdle -= dt;
      if (this._backToIdle <= 0 && this.state === 'aim') setAnim(this.visual, 'idle');
    }
    return 0;
  }

  // ---------------------------------------------------------------- boss

  _bossUpdate(dt, speed) {
    const P = this.def.phases;
    const scene = this.scene;
    this.stateT -= dt;
    switch (this.state) {
      case 'approach':
        setAnim(this.visual, 'walk');
        if (this.stateT <= 0 && this.onField) {
          this.state = 'rootTele';
          this.stateT = P.rootTelegraph;
          this.phaseLabel = 'Rooting — Crawlers incoming';
          setAnim(this.visual, 'windup', true);
          this.tele = scene.fx.telegraph(this.pos, { radius: P.rootRadius, color: '#63c74d', time: P.rootTelegraph });
          scene.bossCue('root');
        }
        return speed;
      case 'rootTele':
        if (this.stateT <= 0) {
          this.state = 'rooted';
          this.stateT = P.rooted;
          this.phaseLabel = 'Rooted';
          setAnim(this.visual, 'rooted', true);
          this.tele = null;
          scene.bossRootSpawn(this, P.rootSpawnType, P.rootSpawn, P.rootRadius);
        }
        return 0;
      case 'rooted':
        if (this.stateT <= 0) {
          this.state = 'chargeWind';
          this.stateT = P.chargeWindup;
          this.phaseLabel = 'Winding up a charge!';
          setAnim(this.visual, 'windup', true);
          // Telegraph the exact stretch of lane the charge will cover (it follows the path), with
          // the slow it's under right now (the charge speed is multiplied by slowMult too).
          const len = this.def.speed * this.speedJitter * P.chargeMult * P.charge * scene.enemySpeedMult(this.laneIndex) * this.slowMult;
          this.tele = scene.lanePieces(this.lane, this.dist, this.dist + len).map(({ a, b }) => {
            const d = new THREE.Vector3().subVectors(b, a);
            const l = d.length();
            d.normalize();
            return scene.fx.telegraph(a, { dir: { x: d.x, z: d.z }, length: Math.max(0.3, l), width: 1.4, color: '#e43b44', time: P.chargeWindup });
          });
          scene.bossCue('charge');
        }
        return 0;
      case 'chargeWind':
        if (this.stateT <= 0) {
          this.state = 'charge';
          this.stateT = P.charge;
          this.phaseLabel = 'CHARGING';
          this.tele = null;
          setAnim(this.visual, 'charge', true);
          if (!this.vis.anims?.charge) setAnim(this.visual, 'walk');
        }
        return 0;
      case 'charge':
        this._dustT = (this._dustT || 0) - dt;
        if (this._dustT <= 0) {
          this._dustT = 0.08;
          scene.fx.burst(this.pos, { color: '#8f563b', color2: '#5a6988', count: 3, speed: 1.5, up: 1.2, life: 0.4, size: 0.1, y: 0.05 });
        }
        if (this.stateT <= 0) {
          this.state = 'approach';
          this.stateT = P.approach;
          this.phaseLabel = 'Advancing';
          setAnim(this.visual, 'walk');
        }
        // The charge ignores the slow floor partly: slows still apply but roots never do.
        return this.def.speed * this.speedJitter * scene.enemySpeedMult(this.laneIndex) * this.slowMult * P.chargeMult;
      default:
        return speed;
    }
  }

  // ---------------------------------------------------------------- cleanup

  cancelTelegraphs() {
    if (!this.tele) return;
    for (const t of [].concat(this.tele)) t?.cancel?.();
    this.tele = null;
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.cancelTelegraphs();
    this.scene.game.assets.disposeVisual(this.visual);
    this.obj.removeFromParent();   // hp bars, vines and mound use shared geometry/materials
  }
}
