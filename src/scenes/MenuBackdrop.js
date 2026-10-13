// A small living 3D diorama behind the menu screens: the Relay Core on a cracked plaza in a jungle
// ruin, a few towers by the lane, enemies idling at the treeline, fireflies, and a slowly orbiting
// camera. Every model comes from game.assets.makeVisual, so real sprites show up automatically
// once they are listed in public/sprites/manifest.json.
//
//   const bd = new MenuBackdrop(game, { mood: 'dusk' | 'day' | 'night' | 'dawn' | 'fallen', shiftX: 0.12 });
//   scene.three = bd.scene; scene.camera = bd.camera;
//   bd.update(dt);  bd.dispose();

import * as THREE from 'three';
import { updateVisual, setAnim, setFacing } from '../core/Assets.js';
import { makeRng } from '../core/rng.js';

const MOODS = {
  dusk: { bg: '#2c2236', fogNear: 14, fogFar: 34, sky: '#ffcf9e', ground: '#2a1d2e', hemi: 1.15, sun: '#ffae6a', sunI: 1.9, core: '#2ce8f5', coreI: 9, tint: '#ffe8d2', flies: '#fee761', flyN: 40 },
  day: { bg: '#8fb39a', fogNear: 16, fogFar: 40, sky: '#eaf6ff', ground: '#4a3b2a', hemi: 1.35, sun: '#fff1d0', sunI: 2.2, core: '#2ce8f5', coreI: 4, tint: '#ffffff', flies: '#fee761', flyN: 14 },
  night: { bg: '#0c1222', fogNear: 12, fogFar: 32, sky: '#5a78c0', ground: '#0b0a12', hemi: 0.75, sun: '#8fb0ff', sunI: 0.9, core: '#2ce8f5', coreI: 14, tint: '#a9bcff', flies: '#63c74d', flyN: 50 },
  dawn: { bg: '#d99a7a', fogNear: 15, fogFar: 38, sky: '#ffd8b0', ground: '#3a2a35', hemi: 1.3, sun: '#ffc890', sunI: 2.1, core: '#2ce8f5', coreI: 8, tint: '#fff0e0', flies: '#fee761', flyN: 30 },
  fallen: { bg: '#120c18', fogNear: 10, fogFar: 30, sky: '#6a4a7a', ground: '#0b0a12', hemi: 0.6, sun: '#8f9cff', sunI: 0.7, core: '#e43b44', coreI: 12, tint: '#b8a8d8', flies: '#e43b44', flyN: 26, flicker: true },
};

// Layout of the diorama (world units = tiles). The core sits at the origin; the lane comes in from -X.
const LANE = [[-15, 2.5], [-6, 2.5], [-6, 0.5], [-2.2, 0.5]];
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
    this.angle = opts.angle ?? -0.9;
    this.speed = opts.speed ?? 0.045;
    this.radius = opts.radius ?? 15;
    this.height = opts.height ?? 8.5;
    this.target = new THREE.Vector3(opts.targetX ?? -2.5, 0.8, opts.targetZ ?? 0.8);
    this.visuals = [];
    this.owned = [];          // my own meshes/materials/textures to dispose
    this.critters = [];

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(m.bg);
    scene.fog = new THREE.Fog(m.bg, m.fogNear, m.fogFar);

    this.camera = new THREE.PerspectiveCamera(38, game.width / game.height, 0.1, 80);
    if (opts.shiftX) this._shift = opts.shiftX;
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
    this._add('car_wreck', 5.2, 4.6).rotation.y = 0.6;
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

  _buildGround(rng) {
    // A pixel-noise ground texture: moss and soil, a concrete plaza around the core, and the dirt lane.
    const S = 30, TPU = 4, N = S * TPU;          // 30×30 tiles, 4 texels per tile
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const moss = ['#265c42', '#3e8948', '#265c42', '#193c3e', '#2f6d47', '#265c42'];
    const dirt = ['#733e39', '#8a5a3e', '#5c3a2e', '#733e39', '#3e2731'];
    const stone = ['#5a6988', '#3a4466', '#5a6988', '#8b9bb4', '#4a5578'];
    const toTex = (x) => Math.floor((x + S / 2) * TPU);
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
    for (let ty = 0; ty < N; ty++) {
      for (let tx = 0; tx < N; tx++) {
        const wx = tx / TPU - S / 2, wz = ty / TPU - S / 2;
        const r = rng.next();
        let pal = moss;
        const plaza = Math.max(Math.abs(wx), Math.abs(wz));
        if (plaza < 2.6 + r * 0.4) pal = stone;
        else if (laneDist(wx, wz) < 0.75 + r * 0.25) pal = dirt;
        g.fillStyle = pal[Math.floor(rng.next() * pal.length)];
        g.fillRect(tx, ty, 1, 1);
      }
    }
    // Plaza cracks and moss creeping over the slabs.
    g.fillStyle = '#262b44';
    for (let i = -2; i <= 2; i++) {
      g.fillRect(toTex(-2.6), toTex(i * 1.1), Math.round(5.2 * TPU), 1);
      g.fillRect(toTex(i * 1.1), toTex(-2.6), 1, Math.round(5.2 * TPU));
    }
    g.fillStyle = '#3e8948';
    for (let i = 0; i < 70; i++) g.fillRect(toTex(rng.range(-2.6, 2.6)), toTex(rng.range(-2.6, 2.6)), 1 + (rng.next() < 0.3 ? 1 : 0), 1);
    const tex = this._own(new THREE.CanvasTexture(c));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geom = this._own(new THREE.PlaneGeometry(S, S));
    const mat = this._own(new THREE.MeshLambertMaterial({ map: tex }));
    const ground = new THREE.Mesh(geom, mat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
  }

  _buildRuins() {
    // Broken station arches behind the core: weathered pillars, a fallen lintel, moss on top.
    const stoneMat = this._own(new THREE.MeshLambertMaterial({ color: '#8b9bb4', flatShading: true }));
    const darkMat = this._own(new THREE.MeshLambertMaterial({ color: '#5a6988', flatShading: true }));
    const mossMat = this._own(new THREE.MeshLambertMaterial({ color: '#3e8948', flatShading: true }));
    const box = (w, h, d, mat, x, y, z, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(this._own(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.rotation.set(0, ry, rz);
      this.scene.add(m);
      return m;
    };
    // Arch pair behind the core (+X side).
    box(0.7, 3.2, 0.7, stoneMat, 4.2, 1.6, -2.2);
    box(0.75, 0.25, 0.75, mossMat, 4.2, 3.3, -2.2);
    box(0.7, 2.1, 0.7, stoneMat, 4.2, 1.05, 2.0);
    box(0.75, 0.22, 0.75, mossMat, 4.2, 2.2, 2.0);
    box(0.6, 0.6, 3.2, darkMat, 4.6, 0.3, 0.2, 0.25, 0.1);       // fallen lintel
    box(0.62, 0.12, 2.2, mossMat, 4.6, 0.66, 0.0, 0.25, 0.1);
    // Lone pillars further out.
    box(0.6, 2.6, 0.6, stoneMat, -6.5, 1.3, -4.5, 0.3);
    box(0.65, 0.2, 0.65, mossMat, -6.5, 2.7, -4.5, 0.3);
    box(0.6, 1.4, 0.6, darkMat, 6.5, 0.7, -5.5, 0.7, 0.15);
    box(0.6, 0.45, 0.6, stoneMat, -1.5, 0.22, 6.5, 0.2);
    // Low broken walls along the back.
    box(3.5, 0.9, 0.5, darkMat, 0.5, 0.45, -6.8, 0.1);
    box(3.5, 0.15, 0.55, mossMat, 0.5, 0.95, -6.8, 0.1);
  }

  _scatter(rng) {
    const blocked = (x, z, r) => {
      if (Math.max(Math.abs(x), Math.abs(z)) < 3.2 + r) return true;            // plaza
      if (x > 3.4 && x < 5.4 && Math.abs(z) < 3) return true;                    // arches
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
    const c = this.camera;
    c.position.set(this.target.x + Math.cos(this.angle) * this.radius, this.height, this.target.z + Math.sin(this.angle) * this.radius);
    c.lookAt(this.target);
    if (this._shift) {
      const w = this.game.width, h = this.game.height;
      c.setViewOffset(w, h, -w * this._shift, 0, w, h);
    }
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
    if (this.camera.view) this.camera.clearViewOffset();
    this.game.assets.setTint('#ffffff');
  }
}
