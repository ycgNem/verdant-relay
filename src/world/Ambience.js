// Air in the jungle: everything that moves without being a creature.
//   · motes      — pale pollen drifting in the light (day), 1 px
//   · leaves     — leaves spiralling down from the canopy, 2 px, green/ochre
//   · fireflies  — blinking yellow-green at dusk and night
//   · shafts     — dithered diagonal light shafts that fade in and out where the canopy opens
// Particles are one THREE.Points cloud (square, whole-pixel points at the internal resolution, so they
// stay crisp pixel art), recycled around the camera. Light shafts are a few additive quads with a
// Bayer-dithered texture (no smooth gradients).

import * as THREE from 'three';
import { CARD_SCALE } from '../core/PixelView.js';
import { ATMOS } from '../data/jungle.js';

const N = ATMOS.particles.count;
const [SPAWN_W, SPAWN_D] = ATMOS.particles.spawn;
const [KEEP_W, KEEP_D] = ATMOS.particles.keep;
const KIND = { mote: 0, leaf: 1, fly: 2 };

export class Ambience {
  constructor(scene3d, world) {
    this.world = world;
    this.three = scene3d;
    this.t = 0;
    this.dusk = 0;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), emit = new Float32Array(N);
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geom.setAttribute('size', new THREE.BufferAttribute(size, 1));
    // Fireflies are emissive (PostFx light code: alpha 0): they keep their glow in the dark.
    this.geom.setAttribute('emit', new THREE.BufferAttribute(emit, 1));
    this.mat = new THREE.ShaderMaterial({
      // Drawn over the foliage (they drift in the air in front of it): no depth test. Colour overwrites; alpha
      // keeps the pixel's PostFx light code (dst × src alpha), except fireflies, which write 0 = emissive.
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.SrcAlphaFactor,
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float emit;
        varying vec3 vCol;
        varying float vEmit;
        void main() {
          vCol = color;
          vEmit = emit;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol;
        varying float vEmit;
        void main() {
          gl_FragColor = vec4(vCol, 1.0 - vEmit);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geom, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.userData.noSnap = true;
    scene3d.add(this.points);
    this.p = Array.from({ length: N }, () => ({ alive: false }));
    this.shafts = [];
    this._shaftTex = shaftTexture();
    this._shaftGeom = new THREE.PlaneGeometry(1, 1);
  }

  _spawn(p, cx, cz, kind) {
    p.alive = true;
    p.kind = kind;
    p.x = cx + (Math.random() - 0.5) * SPAWN_W;
    p.z = cz + (Math.random() - 0.5) * SPAWN_D;
    p.age = 0;
    p.ph = Math.random() * 6.28;
    if (kind === KIND.leaf) {
      p.y = 2.5 + Math.random() * 3;
      p.life = 6 + Math.random() * 5;
      const c = [[0.17, 0.33, 0.13], [0.33, 0.27, 0.1], [0.42, 0.22, 0.1], [0.22, 0.4, 0.16]][Math.floor(Math.random() * 4)];
      p.c = c;
      p.size = 2;
    } else if (kind === KIND.fly) {
      p.y = 0.3 + Math.random() * 1.6;
      p.life = 4 + Math.random() * 6;
      p.c = [0.85, 1.0, 0.45];
      p.size = Math.random() < 0.55 ? 2 : 1;
    } else {
      p.y = 0.2 + Math.random() * 2.6;
      p.life = 5 + Math.random() * 6;
      p.c = [0.95, 0.92, 0.7];
      p.size = 1;
    }
  }

  update(dt, cx, cz, dusk) {
    this.t += dt;
    this.dusk = dusk;
    const pos = this.geom.attributes.position.array, col = this.geom.attributes.color.array, size = this.geom.attributes.size.array;
    const emit = this.geom.attributes.emit.array;
    const wantFly = Math.round(N * ATMOS.particles.flies * dusk), wantMote = Math.round(N * 0.35 * (1 - dusk)), wantLeaf = Math.round(N * 0.12);
    let flies = 0, motes = 0, leaves = 0;
    for (const p of this.p) if (p.alive) { if (p.kind === KIND.fly) flies++; else if (p.kind === KIND.mote) motes++; else leaves++; }
    for (let i = 0; i < N; i++) {
      const p = this.p[i];
      if (!p.alive || Math.abs(p.x - cx) > KEEP_W / 2 || Math.abs(p.z - cz) > KEEP_D / 2) {
        if (p.alive) { p.alive = false; if (p.kind === KIND.fly) flies--; else if (p.kind === KIND.mote) motes--; else leaves--; }
        if (flies < wantFly) { this._spawn(p, cx, cz, KIND.fly); flies++; }
        else if (motes < wantMote) { this._spawn(p, cx, cz, KIND.mote); motes++; }
        else if (leaves < wantLeaf) { this._spawn(p, cx, cz, KIND.leaf); leaves++; }
      }
      let k = 0;
      if (p.alive) {
        p.age += dt;
        if (p.kind === KIND.leaf) {
          p.y -= dt * 0.45;
          p.x += Math.sin(this.t * 1.7 + p.ph) * dt * 0.6 + dt * 0.15;
          if (p.y <= 0.02) { p.y = 0.02; p.life = Math.min(p.life, p.age + 1.5); }
        } else if (p.kind === KIND.fly) {
          p.x += Math.sin(this.t * 0.9 + p.ph) * dt * 0.5;
          p.z += Math.cos(this.t * 0.7 + p.ph * 1.3) * dt * 0.4;
          p.y += Math.sin(this.t * 1.3 + p.ph) * dt * 0.2;
        } else {
          p.x += (0.12 + Math.sin(this.t * 0.4 + p.ph) * 0.08) * dt;
          p.y += Math.sin(this.t * 0.8 + p.ph) * dt * 0.06;
        }
        if (p.age > p.life) p.alive = false;
        const fade = Math.min(1, p.age / 0.8, (p.life - p.age) / 0.8);
        // Fireflies blink; motes only show in light (less under the canopy).
        let b = fade;
        if (p.kind === KIND.fly) b *= Math.max(0, Math.sin(this.t * 2.3 + p.ph * 3)) > ATMOS.particles.flyBlink ? 1 : 0.15;
        if (p.kind === KIND.mote) b *= 1 - this.world.shadeAt(p.x, p.z) * 0.8;
        k = b > 0.3 ? b : 0;
      }
      pos[i * 3] = p.x ?? 0; pos[i * 3 + 1] = p.alive ? p.y * CARD_SCALE * 0.5 : -50; pos[i * 3 + 2] = p.z ?? 0;
      const c = p.c || [0, 0, 0];
      col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
      size[i] = k > 0 ? p.size : 0;
      emit[i] = p.alive && p.kind === KIND.fly ? 1 : 0;
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
    this.geom.attributes.size.needsUpdate = true;
    this.geom.attributes.emit.needsUpdate = true;
    this._updateShafts(dt, cx, cz);
  }

  _updateShafts(dt, cx, cz) {
    // Keep a few shafts near the camera, in places with a gap in the canopy (shade 0.2–0.6).
    const [SW, SD] = ATMOS.particles.shaftBox;
    // shaftMult: weather (Weather.js) — none in rain or fog, more in the heat.
    const want = this.dusk > 0.6 ? 0 : Math.round(ATMOS.particles.shafts * (this.shaftMult ?? 1));
    while (this.shafts.length < want) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 12 && !ok; t++) {
        x = cx + (Math.random() - 0.5) * SW; z = cz + (Math.random() - 0.5) * SD;
        const s = this.world.shadeAt(x, z);
        ok = s > 0.2 && s < 0.65;
      }
      if (!ok) break;
      const m = new THREE.Mesh(this._shaftGeom, new THREE.MeshBasicMaterial({
        map: this._shaftTex, color: '#fff2c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const w = 1.2 + Math.random() * 1.4, h = 5 + Math.random() * 2;
      m.scale.set(w, h * CARD_SCALE, 1);
      m.position.set(Math.round(x * 32) / 32, (h * CARD_SCALE) / 2, z);
      m.rotation.z = -0.38;   // falls down-right: light from the top-left
      m.renderOrder = 7;
      m.userData.noSnap = true;
      this.three.add(m);
      this.shafts.push({ m, t: 0, life: 7 + Math.random() * 6, peak: 0.13 + Math.random() * 0.08 });
    }
    for (let i = this.shafts.length - 1; i >= 0; i--) {
      const s = this.shafts[i];
      s.t += dt;
      const k = Math.min(1, s.t / 2, (s.life - s.t) / 2) * (1 - this.dusk);
      s.m.material.opacity = Math.max(0, k) * s.peak;
      const far = Math.abs(s.m.position.x - cx) > SW / 2 + 4 || Math.abs(s.m.position.z - cz) > SD / 2 + 4;
      if (s.t >= s.life || far) {
        s.m.removeFromParent();
        s.m.material.dispose();
        this.shafts.splice(i, 1);
      }
    }
  }

  dispose() {
    this.points.removeFromParent();
    this.geom.dispose();
    this.mat.dispose();
    for (const s of this.shafts) { s.m.removeFromParent(); s.m.material.dispose(); }
    this._shaftGeom.dispose();
    this._shaftTex.dispose();
  }
}

/** A soft vertical beam, dithered with a 4×4 Bayer pattern into 1-px steps (alpha 0/1). */
function shaftTexture() {
  const w = 32, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const across = 1 - Math.abs((x + 0.5) / w - 0.5) * 2;
      const along = Math.min(1, (y / h) * 3) * (1 - Math.max(0, (y / h - 0.75) * 4));
      const v = across * across * along;
      if (v > (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
