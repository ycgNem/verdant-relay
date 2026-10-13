// A small living 3D diorama behind the menu screens: the Relay Core on a cracked plaza in a jungle
// ruin, a few towers by the lane, enemies idling at the treeline, fireflies, and a camera slowly
// drifting across it. Every model comes from game.assets.makeVisual, so real sprites show up
// automatically once they are listed in public/sprites/manifest.json.
//
// Pixel-perfect like the game: a PixelCamera (orthographic, 1 tile = 32 px, pixel-snapped), the
// ground painted from the 32 px tile sprites (floor_defense / floor_alt_defense / lane_defense /
// floor_overgrown_market) and the ruins built from wall_overgrown_market blocks and wall_block sprites.
//
//   const bd = new MenuBackdrop(game, { mood: 'dusk' | 'day' | 'night' | 'dawn' | 'fallen', shiftX: 0.12,
//                                       angle, speed });   // angle = start phase of the drift, speed = rad/s
//   scene.three = bd.scene; scene.camera = bd.camera;
//   bd.update(dt);  bd.dispose();

import * as THREE from 'three';
import { updateVisual, setAnim, setFacing } from '../core/Assets.js';
import { makeRng } from '../core/rng.js';
import { PixelCamera, CARD_SCALE } from '../core/PixelView.js';
import { wallSide } from '../world/TileWorld.js';
import { CONFIG } from '../data/config.js';

const MOODS = {
  dusk: { bg: '#2c2236', sky: '#ffcf9e', ground: '#2a1d2e', hemi: 1.15, sun: '#ffae6a', sunI: 1.9, core: '#2ce8f5', coreI: 9, tint: '#ffe8d2', flies: '#fee761', flyN: 40 },
  day: { bg: '#8fb39a', sky: '#eaf6ff', ground: '#4a3b2a', hemi: 1.35, sun: '#fff1d0', sunI: 2.2, core: '#2ce8f5', coreI: 4, tint: '#ffffff', flies: '#fee761', flyN: 14 },
  night: { bg: '#0c1222', sky: '#5a78c0', ground: '#0b0a12', hemi: 0.75, sun: '#8fb0ff', sunI: 0.9, core: '#2ce8f5', coreI: 14, tint: '#a9bcff', flies: '#63c74d', flyN: 50 },
  dawn: { bg: '#d99a7a', sky: '#ffd8b0', ground: '#3a2a35', hemi: 1.3, sun: '#ffc890', sunI: 2.1, core: '#2ce8f5', coreI: 8, tint: '#fff0e0', flies: '#fee761', flyN: 30 },
  fallen: { bg: '#120c18', sky: '#6a4a7a', ground: '#0b0a12', hemi: 0.6, sun: '#8f9cff', sunI: 0.7, core: '#e43b44', coreI: 12, tint: '#b8a8d8', flies: '#e43b44', flyN: 26, flicker: true },
};

// Layout of the diorama (world units = tiles). The core sits at the origin; the lane comes in from -X.
// Lane points sit on tile centres so the lane tiles line up with it.
const LANE = [[-24, 2.5], [-5.5, 2.5], [-5.5, 0.5], [-2.5, 0.5]];
// Ground extent (tiles): wide enough for the drifting camera at both base resolutions.
const GROUND = { x0: -26, x1: 20, z0: -14, z1: 14 };
// The camera drifts along x (focus = DRIFT.x ± DRIFT.ax) and a little along z.
const DRIFT = { x: -2.5, ax: 3, z: 0.5, az: 1.0 };
const TOWERS = [
  ['scrap_turret', -4, -1.5], ['thorn_nest', -4.3, 2.4], ['snare_vine', -8.2, 0.7], ['arc_spire', -7.8, 4.4], ['mortar_pod', 1.5, -3.6],
];
const ENEMIES = [
  ['crawler', -11, 2.3], ['crawler', -12.2, 3.2], ['skitter', -10.2, 1.6], ['razorback', -13.4, 2.0], ['crawler', -9.4, 3.6],
];
const FALLEN_ENEMIES = [
  ['crawler', -2.6, 1.6], ['razorback', -3.2, -0.6], ['skitter', -1.6, 2.6], ['crawler', 1.8, 2.4], ['spitter', -5.2, 1.8], ['skitter', 2.6, -1.4],
];

export class MenuBackdrop {
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    const m = (this.mood = MOODS[opts.mood] || MOODS.dusk);
    this.t = 0;
    this.angle = opts.angle ?? -0.9;      // drift phase (radians)
    this.speed = opts.speed ?? 0.045;     // drift speed (radians / s)
    this.visuals = [];
    this.owned = [];          // my own meshes/materials/textures to dispose
    this.critters = [];

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(m.bg);
    // No fog: with an orthographic camera it would only lay a smooth gradient over the pixel art.

    this.camera = new PixelCamera({ dist: 16, near: 0.1, far: 60 });
    this.camera.setSize(game.width, game.height);
    this._shift = opts.shiftX || 0;
    this._placeCamera();

    // Lights.
    scene.add(new THREE.HemisphereLight(m.sky, m.ground, m.hemi));
    const sun = new THREE.DirectionalLight(m.sun, m.sunI);
    sun.position.set(-8, 12, -5);
    scene.add(sun);
    this.coreLight = new THREE.PointLight(m.core, m.coreI, 9, 1.4);
    this.coreLight.position.set(0, 2.6, 0);
    scene.add(this.coreLight);
    this.lampLights = [];

    game.assets.setTint(m.tint);
    const rng = makeRng(opts.seed ?? 7);
    this._buildGround(rng);
    this._buildRuins();

    // Core, towers, props.
    this._add('relay_core', 0, 0);
    for (const [key, x, z] of TOWERS) {
      this._add('tower_base', x, z, { shadow: false });
      const t = this._add(key, x, z);
      t.userData.turn = rng.range(0, Math.PI * 2);
      this.towers = (this.towers || []).concat(t);
    }
    for (const [x, z] of [[2.4, 2.4], [-2.4, -2.4]]) {
      this._add('lamp_post', x, z);
      const l = new THREE.PointLight('#feae34', opts.mood === 'day' ? 0 : 3, 4, 1.5);
      l.position.set(x, 1.9, z);
      scene.add(l);
      this.lampLights.push(l);
    }
    this._add('car_wreck', 5.2, 4.6);
    this._scatter(rng);

    // Enemies idling at the treeline (or swarming the fallen relay).
    for (const [key, x, z] of opts.mood === 'fallen' ? FALLEN_ENEMIES : ENEMIES) {
      const v = this._add(key, x, z);
      this.critters.push({ v, home: new THREE.Vector2(x, z), to: new THREE.Vector2(x, z), wait: rng.range(0, 2), speed: key === 'skitter' ? 1.4 : key === 'razorback' ? 0.45 : 0.7, rng });
      setAnim(v, 'idle');
    }

    this._buildFlies(rng);
  }

  // ------------------------------------------------------------------ building

  _add(key, x, z, o = {}) {
    const v = this.game.assets.makeVisual(key, o);
    v.position.set(x, 0, z);
    this.scene.add(v);
    this.visuals.push(v);
    return v;
  }

  _own(obj) {
    this.owned.push(obj);
    return obj;
  }

  _tile(key) {
    const info = this.game.assets.spriteInfo(key);
    return info && this.game.assets.manifest[key] && info.tex?.image ? info : null;
  }

  _buildGround(rng) {
    // Painted from the 32 px tile sprites at 32 texels per tile (1:1 on screen): the dirt lane, a
    // paved plaza around the core and overgrown ground everywhere else. Placeholder colours if a
    // tile sprite is missing.
    const P = 32, G = GROUND;
    const TW = G.x1 - G.x0, TH = G.z1 - G.z0;
    const c = document.createElement('canvas');
    c.width = TW * P; c.height = TH * P;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const art = {
      floor: this._tile('floor_defense'), alt: this._tile('floor_alt_defense'),
      lane: this._tile('lane_defense'), plaza: this._tile('floor_overgrown_market'),
    };
    const fallback = { floor: '#265c42', alt: '#3e8948', lane: '#733e39', plaza: '#5a6988' };
    const laneDist = (px, pz) => {
      let best = 99;
      for (let i = 0; i < LANE.length - 1; i++) {
        const [ax, az] = LANE[i], [bx, bz] = LANE[i + 1];
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(px - (ax + dx * t), pz - (az + dz * t)));
      }
      return best;
    };
    const kindAt = (x, z) => {
      const cx = x + 0.5, cz = z + 0.5;
      if (Math.max(Math.abs(cx), Math.abs(cz)) < 2.6) return 'plaza';
      if (laneDist(cx, cz) < 0.4) return 'lane';
      return 'floor';
    };
    const kinds = [];
    for (let tz = 0; tz < TH; tz++) {
      for (let tx = 0; tx < TW; tx++) {
        const x = tx + G.x0, z = tz + G.z0;
        let kind = kindAt(x, z);
        kinds.push(kind);
        if (kind === 'floor' && rng.next() < 0.07) kind = 'alt';
        const info = art[kind];
        if (!info) { g.fillStyle = fallback[kind]; g.fillRect(tx * P, tz * P, P, P); continue; }
        const im = info.tex.image;
        const fw = im.width / (info.def.frames || 1);
        // Seeded quarter-turns / flips on grass and plaza so the repeat doesn't read as a grid.
        const r = rng.next();
        g.save();
        g.translate(tx * P + P / 2, tz * P + P / 2);
        if (kind !== 'lane') g.rotate(Math.floor(r * 4) * Math.PI / 2);
        if (rng.next() < 0.5) g.scale(-1, 1);
        g.drawImage(im, 0, 0, fw, im.height, -P / 2, -P / 2, P, P);
        g.restore();
      }
    }
    // Hard 1–2 px dark rim + grass tufts where the lane meets the grass, so the lane reads as a trail.
    const at = (tx, tz) => (tx < 0 || tz < 0 || tx >= TW || tz >= TH ? 'floor' : kinds[tz * TW + tx]);
    for (let tz = 0; tz < TH; tz++) {
      for (let tx = 0; tx < TW; tx++) {
        if (at(tx, tz) !== 'lane') continue;
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (at(tx + dx, tz + dz) !== 'floor') continue;
          for (let i = 0; i < P; i++) {
            const depth = 1 + (rng.next() < 0.4 ? 1 : 0) + (rng.next() < 0.15 ? 1 : 0);
            for (let d = 0; d < depth; d++) {
              const px = dz !== 0 ? tx * P + i : dx < 0 ? tx * P + d : tx * P + P - 1 - d;
              const py = dz !== 0 ? (dz < 0 ? tz * P + d : tz * P + P - 1 - d) : tz * P + i;
              g.fillStyle = d === depth - 1 ? '#3e2731' : '#265c42';
              g.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    }
    // Plaza seams and moss creeping over the slabs (whole texels).
    g.fillStyle = '#262b44';
    const toPx = (v, o) => Math.round((v - o) * P);
    for (let i = -2; i <= 2; i++) {
      g.fillRect(toPx(-2.5, G.x0), toPx(i, G.z0), 5 * P, 1);
      g.fillRect(toPx(i, G.x0), toPx(-2.5, G.z0), 1, 5 * P);
    }
    g.fillStyle = '#3e8948';
    for (let i = 0; i < 90; i++) g.fillRect(toPx(rng.range(-2.5, 2.5), G.x0), toPx(rng.range(-2.5, 2.5), G.z0), 1 + (rng.next() < 0.3 ? 1 : 0), 1);
    const tex = this._own(new THREE.CanvasTexture(c));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geom = this._own(new THREE.PlaneGeometry(TW, TH));
    const mat = this._own(new THREE.MeshLambertMaterial({ map: tex }));
    const ground = new THREE.Mesh(geom, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((G.x0 + G.x1) / 2, 0, (G.z0 + G.z1) / 2);
    this.scene.add(ground);
  }

  _buildRuins() {
    // Broken station walls behind and around the core: tile-textured wall blocks (32 px tops and a
    // CONFIG.pixel.wallFrontPx-row face, like the exploration walls) plus wall_block chunk sprites,
    // stacked into pillars. Falls back to flat-coloured boxes only when the tile art is missing.
    const top = this._tile('wall_overgrown_market');
    const look = { moss: '#3e8948' };
    let topMat, sideMat;
    const FRONT = CONFIG.pixel.wallFrontPx;
    if (top) {
      const P = 32;
      const tc = document.createElement('canvas');
      tc.width = tc.height = P;
      tc.getContext('2d').drawImage(top.tex.image, 0, 0, P, P, 0, 0, P, P);
      const mk = (cv) => {
        const t = this._own(new THREE.CanvasTexture(cv));
        t.magFilter = t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      topMat = this._own(new THREE.MeshLambertMaterial({ map: mk(tc) }));
      // The faces point at the camera, away from the low sun: a little emissive keeps them readable.
      const sideTex = mk(wallSide(tc, look, FRONT));
      sideMat = this._own(new THREE.MeshLambertMaterial({ map: sideTex, emissive: '#ffffff', emissiveMap: sideTex, emissiveIntensity: 0.3 }));
    } else {
      topMat = this._own(new THREE.MeshLambertMaterial({ color: '#8b9bb4' }));
      sideMat = this._own(new THREE.MeshLambertMaterial({ color: '#5a6988' }));
    }
    const geo = this._own(new THREE.BoxGeometry(1, 1, 1));
    geo.translate(0.5, 0.5, 0.5);   // box from (0,0,0) to (1,1,1): one tile, placed by its corner
    const hgt = (FRONT / 32) * CARD_SCALE;
    const wall = (tx, tz) => {
      const m = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      m.position.set(tx, 0, tz);
      m.scale.set(1, hgt, 1);
      this.scene.add(m);
    };
    // Low broken wall along the back, a short stub right of the core, a few loose blocks.
    for (const tx of [-2, -1, 0, 1, 3]) wall(tx, -7);
    for (const tz of [-3, -2]) wall(4, tz);
    wall(4, 2); wall(-8, -5); wall(6, -6);
    // Pillars: wall_block chunks (32×48), a second one stacked on top for the tall ones.
    const pillar = (x, z, n) => {
      for (let k = 0; k < n; k++) {
        const v = this._add('wall_block', x, z, { shadow: k === 0 });
        v.position.y = k * (48 / 32) * CARD_SCALE;   // stacked exactly 48 px higher on screen
        if (k > 0 && v.userData.vis.kind === 'sprite') v.userData.vis.body.renderOrder = 1;
      }
    };
    pillar(4.5, -1.5, 2); pillar(4.5, 3.5, 1); pillar(-6.5, -4.5, 2); pillar(6.5, -5.5, 1); pillar(-1.5, 6.5, 1);
  }

  _scatter(rng) {
    const blocked = (x, z, r) => {
      if (Math.max(Math.abs(x), Math.abs(z)) < 3.2 + r) return true;            // plaza
      if (x > 3.4 && x < 5.6 && z > -3.6 && z < 4) return true;                  // ruins by the core
      if (z > -7.6 && z < -6 && x > -2.6 && x < 4.4) return true;                  // back wall
      for (const [, tx, tz] of TOWERS) if (Math.hypot(x - tx, z - tz) < 1 + r) return true;
      for (let i = 0; i < LANE.length - 1; i++) {
        const [ax, az] = LANE[i], [bx, bz] = LANE[i + 1];
        const minX = Math.min(ax, bx) - 1 - r, maxX = Math.max(ax, bx) + 1 + r;
        const minZ = Math.min(az, bz) - 1 - r, maxZ = Math.max(az, bz) + 1 + r;
        if (x > minX && x < maxX && z > minZ && z < maxZ) return true;
      }
      if (Math.hypot(x - 5.2, z - 4.6) < 1.8 + r) return true;                   // car
      for (const [, ex, ez] of ENEMIES) if (Math.hypot(x - ex, z - ez) < 1.4) return true;
      return false;
    };
    const place = (keys, count, rMin, rMax, size) => {
      let n = 0, tries = 0;
      while (n < count && tries++ < 400) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(rMin, rMax);
        const x = Math.cos(a) * d - 1.5, z = Math.sin(a) * d;
        if (blocked(x, z, size)) continue;
        const v = this._add(rng.pick(keys), x, z);
        v.rotation.y = rng.range(0, Math.PI * 2) * (v.userData.vis.kind === 'model' ? 1 : 0);
        n++;
      }
    };
    place(['tree', 'tree_2', 'tree_3'], 18, 6.5, 13, 0.9);
    place(['bush', 'bush_2'], 22, 3.5, 12, 0.3);
    place(['rubble', 'rubble_2'], 8, 3.5, 10, 0.3);
  }

  _buildFlies(rng) {
    const n = this.mood.flyN;
    const pos = new Float32Array(n * 3);
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const f = { x: rng.range(-12, 8), y: rng.range(0.3, 3.2), z: rng.range(-8, 8), p: rng.range(0, 6.28), s: rng.range(0.2, 0.6) };
      this.flies.push(f);
      pos.set([f.x, f.y, f.z], i * 3);
    }
    const geom = this._own(new THREE.BufferGeometry());
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = this._own(new THREE.PointsMaterial({ color: this.mood.flies, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _placeCamera() {
    // Slow sideways drift over the diorama (focus snapped to whole pixels by the camera), with the
    // image shifted by shiftX × width for menus that keep the left or right side clear.
    const c = this.camera;
    const fx = DRIFT.x + Math.sin(this.angle) * DRIFT.ax - (this._shift * this.game.width) / c.ppu;
    const fz = DRIFT.z + Math.sin(this.angle * 0.7) * DRIFT.az;
    c.setFocus(fx, fz);
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    this.t += dt;
    this.angle += dt * this.speed;
    this._placeCamera();

    const m = this.mood;
    let core = m.coreI * (0.82 + 0.18 * Math.sin(this.t * 2.2));
    if (m.flicker) core *= Math.random() < 0.08 ? 0.25 : 1;
    this.coreLight.intensity = core;

    for (const v of this.visuals) updateVisual(v, dt);

    // Critters: wander a little around home, pause, look around.
    for (const c of this.critters) {
      const p = c.v.position;
      if (c.wait > 0) {
        c.wait -= dt;
        if (c.wait <= 0) {
          c.to.set(c.home.x + c.rng.range(-1.3, 1.3), c.home.y + c.rng.range(-1.0, 1.0));
          setAnim(c.v, 'walk');
        }
        continue;
      }
      const dx = c.to.x - p.x, dz = c.to.y - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        c.wait = c.rng.range(1.2, 3.5);
        setAnim(c.v, 'idle');
        continue;
      }
      const step = Math.min(d, c.speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      setFacing(c.v, dx, dz);
    }

    // Towers slowly track the nearest critter.
    for (const t of this.towers || []) {
      let best = null, bd = 1e9;
      for (const c of this.critters) {
        const d = t.position.distanceToSquared(c.v.position);
        if (d < bd) { bd = d; best = c.v; }
      }
      if (best && t.userData.vis.kind === 'model') {
        const want = Math.atan2(-(best.position.x - t.position.x), -(best.position.z - t.position.z));
        let cur = t.userData.vis.body.rotation.y;
        let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        cur += Math.max(-dt * 0.8, Math.min(dt * 0.8, diff));
        t.userData.vis.body.rotation.y = cur;
      }
    }

    // Fireflies drift and bob.
    if (this.points) {
      const arr = this.points.geometry.attributes.position.array;
      this.flies.forEach((f, i) => {
        f.p += dt * f.s;
        arr[i * 3] = f.x + Math.sin(f.p * 1.3) * 0.8;
        arr[i * 3 + 1] = f.y + Math.sin(f.p * 2.1) * 0.35;
        arr[i * 3 + 2] = f.z + Math.cos(f.p) * 0.8;
      });
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(this.t * 1.7));
    }
  }

  dispose() {
    for (const v of this.visuals) this.game.assets.disposeVisual(v);
    this.visuals = [];
    for (const o of this.owned) o.dispose?.();
    this.owned = [];
    this.scene.clear();
    this.game.assets.setTint('#ffffff');
  }
}
