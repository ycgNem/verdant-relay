// Visuals for every entity key. A key listed in public/sprites/manifest.json is drawn as a pixel-art
// sprite; anything else falls back to the primitive placeholder model in src/data/visuals.js.
//
// Manifest entry:
//   "crawler": {
//     "file": "crawler.png",   // a horizontal strip of equal frames (or a single image)
//     "ppu": 32,               // texels per world unit (1 tile)
//     "frames": 8,             // optional, frames in the strip (default 1)
//     "anims": { "idle": [0,1], "walk": [2,3,4,5], "attack": [6,7] },   // optional frame lists
//     "fps": 8,                // optional, default 8 (per-anim override: "animFps": { "walk": 10 })
//     "flat": true,            // optional: a ground decal (horizontal quad) instead of a billboard
//     "shadow": 0.5,           // optional: blob-shadow radius in tiles (0 = none). Default from width.
//     "anchorY": 0             // optional: texels of transparent padding under the feet
//   }
//
// Sprites face RIGHT in the art; setFacing() flips them horizontally when moving/aiming left.
// Keys with a level suffix ("scrap_turret_3") fall back to the base key when not listed.
//
// Every visual is a THREE.Group:  root ─ body (sprite or model) ─ … ; root.userData.vis holds state.
// Call updateVisual(root, dt) once per frame for animation, flashes and facing.

import * as THREE from 'three';
import { VISUALS } from '../data/visuals.js';

const GEOMS = {
  box: (s) => new THREE.BoxGeometry(...s),
  cyl: (s) => new THREE.CylinderGeometry(s[0], s[1], s[2], 8),
  cone: (s) => new THREE.ConeGeometry(s[0], s[1], 8),
  sph: (s) => new THREE.SphereGeometry(s[0], 8, 6),
  ico: (s) => new THREE.IcosahedronGeometry(s[0], 0),
  oct: (s) => new THREE.OctahedronGeometry(s[0], 0),
  dod: (s) => new THREE.DodecahedronGeometry(s[0], 0),
};

const TINT = new THREE.Color(1, 1, 1);
let shadowTex = null;
function getShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  // A hard-edged pixel ellipse with a darker core reads better than a soft gradient at low res.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x + 0.5 - 8) / 8, (y + 0.5 - 8) / 8);
      if (d < 1) {
        g.fillStyle = d < 0.6 ? 'rgba(10,8,20,0.55)' : 'rgba(10,8,20,0.35)';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  shadowTex = new THREE.CanvasTexture(c);
  shadowTex.magFilter = THREE.NearestFilter;
  shadowTex.minFilter = THREE.NearestFilter;
  shadowTex.generateMipmaps = false;
  return shadowTex;
}

export class Assets {
  constructor() {
    this.manifest = {};
    this.textures = {};       // key -> THREE.Texture (shared; each sprite clones for its own UV offset)
    this.tint = TINT;   // scene ambient tint applied to every sprite (night = blue)
    this._live = new Set();   // sprite roots, so a tint change reaches existing sprites
  }

  async load() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sprites/manifest.json`, { cache: 'no-cache' });
      this.manifest = res.ok ? await res.json() : {};
    } catch {
      this.manifest = {};
    }
    const loader = new THREE.TextureLoader();
    const jobs = Object.entries(this.manifest).map(([key, def]) => new Promise((resolve) => {
      if (!def || !def.file) return resolve();
      loader.load(`${import.meta.env.BASE_URL}sprites/${def.file}`, (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures[key] = tex;
        resolve();
      }, undefined, () => { console.warn(`Sprite failed to load: ${def.file}`); resolve(); });
    }));
    await Promise.all(jobs);
  }

  /** The manifest key actually used for `key` (handles "_2"/"_3" level suffixes). */
  resolveKey(key) {
    if (this.textures[key]) return key;
    const base = key.replace(/_\d+$/, '');
    if (base !== key && this.textures[base]) return base;
    return null;
  }

  hasSprite(key) { return !!this.resolveKey(key); }

  /** Raw texture for UI use (icons). Returns { tex, def } or null. */
  spriteInfo(key) {
    const k = this.resolveKey(key);
    return k ? { tex: this.textures[k], def: this.manifest[k] } : null;
  }

  /** CSS for a DOM icon of a sprite's first frame, or null. */
  iconStyle(key, sizePx = 32) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const frames = def.frames || 1;
    const fw = img.width / frames;
    const scale = sizePx / Math.max(fw, img.height);
    return `background-image:url(${import.meta.env.BASE_URL}sprites/${def.file});background-size:${img.width * scale}px ${img.height * scale}px;background-position:0 0;width:${fw * scale}px;height:${img.height * scale}px;image-rendering:pixelated;background-repeat:no-repeat;`;
  }

  setTint(color) {
    this.tint.set(color);
    for (const root of this._live) applyColor(root.userData.vis, this.tint);
  }

  /**
   * Build the visual for `key`. Options:
   *   shadow: false to skip the blob shadow
   *   scale: uniform scale
   */
  makeVisual(key, opts = {}) {
    const root = new THREE.Group();
    root.name = key;
    const vis = {
      key, kind: 'model', body: null, mats: [], faceParts: [], statusParts: [],
      anim: null, animT: 0, frame: 0, frames: 1, anims: null, fps: 8, animFps: {},
      flashT: 0, flashColor: new THREE.Color(1, 1, 1), facingLeft: false, opacity: 1, height: 1, width: 1,
      baseColor: new THREE.Color(1, 1, 1),
    };
    root.userData.vis = vis;
    const sk = this.resolveKey(key);
    const scale = opts.scale ?? 1;

    if (sk) {
      const def = this.manifest[sk];
      const base = this.textures[sk];
      const tex = base.clone();
      tex.needsUpdate = true;
      const frames = def.frames || 1;
      tex.repeat.set(1 / frames, 1);
      const img = base.image;
      const fw = img.width / frames;
      const ppu = def.ppu || 32;
      const w = (fw / ppu) * scale;
      const h = (img.height / ppu) * scale;
      vis.kind = def.flat ? 'flat' : 'sprite';
      vis.frames = frames;
      vis.anims = def.anims || null;
      vis.fps = def.fps || 8;
      vis.animFps = def.animFps || {};
      vis.tex = tex;
      vis.width = w;
      vis.height = def.flat ? 0.05 : h;
      if (def.flat) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02 + (def.layer || 0) * 0.005;
        mesh.renderOrder = 1;
        vis.body = mesh;
        vis.mats.push(mat);
        root.add(mesh);
      } else {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
        const spr = new THREE.Sprite(mat);
        spr.center.set(0.5, (def.anchorY || 0) / img.height);
        spr.scale.set(w, h, 1);
        vis.body = spr;
        vis.mats.push(mat);
        root.add(spr);
        this._live.add(root);
        applyColor(vis, this.tint);
      }
      const shadowR = def.shadow ?? (def.flat ? 0 : Math.min(1.4, w * 0.36));
      if (opts.shadow !== false && shadowR > 0) root.add(makeShadow(shadowR));
      setFrame(vis, 0);
    } else {
      const parts = VISUALS[key] || VISUALS[key.replace(/_\d+$/, '')];
      const model = new THREE.Group();
      let top = 0.5;
      if (parts) {
        for (const [shape, size, pos, color, extra] of parts) {
          const mat = extra?.emissive
            ? new THREE.MeshBasicMaterial({ color })
            : new THREE.MeshLambertMaterial({ color, flatShading: true });
          mat.userData.base = new THREE.Color(color);
          mat.userData.emissive = !!extra?.emissive;
          const m = new THREE.Mesh(GEOMS[shape](size), mat);
          m.position.set(...pos);
          if (extra?.tilt) m.rotation.x = extra.tilt;
          model.add(m);
          vis.mats.push(mat);
          if (extra?.face) vis.faceParts.push(m);
          if (extra?.status) vis.statusParts.push(m);
          top = Math.max(top, pos[1] + (size[1] ?? size[0]) * 0.5);
        }
      } else {
        const mat = new THREE.MeshLambertMaterial({ color: '#ff00ff' });
        mat.userData.base = new THREE.Color('#ff00ff');
        model.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat));
        vis.mats.push(mat);
      }
      model.scale.setScalar(scale);
      vis.body = model;
      vis.height = top * scale;
      root.add(model);
      if (opts.shadow !== false) root.add(makeShadow(0.4 * scale));
    }
    return root;
  }

  /** Release GPU resources of a visual made by makeVisual. */
  disposeVisual(root) {
    if (!root) return;
    this._live.delete(root);
    root.traverse((o) => {
      if (o.geometry && o.geometry !== shadowGeom) o.geometry.dispose();
      if (o.material && o.material !== shadowMat) {
        if (o.material.map && o.material.map !== shadowTex) o.material.map.dispose();
        o.material.dispose();
      }
    });
    root.removeFromParent();
  }
}

let shadowGeom = null;
let shadowMat = null;
function makeShadow(r) {
  if (!shadowGeom) {
    shadowGeom = new THREE.PlaneGeometry(1, 1);
    shadowMat = new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(shadowGeom, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.scale.set(r * 2, r * 1.4, 1);
  m.renderOrder = 0;
  m.name = 'shadow';
  return m;
}

function setFrame(vis, f) {
  vis.frame = f;
  if (vis.tex) vis.tex.offset.x = f / vis.frames;
}

function applyColor(vis, tint) {
  // Sprite colour = ambient tint, pushed toward the flash colour while flashing.
  for (const mat of vis.mats) {
    if (vis.kind === 'model') {
      const base = mat.userData.base;
      if (!base) continue;
      if (vis.flashT > 0) mat.color.copy(vis.flashColor);
      else mat.color.copy(base);
    } else {
      mat.color.copy(vis.baseColor).multiply(tint);
      if (vis.flashT > 0) mat.color.lerp(vis.flashColor, 0.85).multiplyScalar(2.2);
    }
  }
}

// ------------------------------------------------------------------ per-visual controls

/** Play a named animation from the manifest ("idle", "walk", "attack", "windup", "hurt", "death"). */
export function setAnim(root, name, restart = false) {
  const vis = root?.userData.vis;
  if (!vis || !vis.anims) return;
  if (!vis.anims[name]) name = vis.anims.idle ? 'idle' : Object.keys(vis.anims)[0];
  if (vis.anim === name && !restart) return;
  vis.anim = name;
  vis.animT = 0;
  setFrame(vis, vis.anims[name][0]);
}

/** True once a non-looping use of the current animation has played through at least once. */
export function animDone(root) {
  const vis = root?.userData.vis;
  if (!vis || !vis.anims || !vis.anim) return true;
  const list = vis.anims[vis.anim];
  const fps = vis.animFps[vis.anim] || vis.fps;
  return vis.animT * fps >= list.length;
}

/** Face a world direction. Sprites flip horizontally; models rotate (faceParts only, if any are marked). */
export function setFacing(root, dx, dz) {
  const vis = root?.userData.vis;
  if (!vis || (dx === 0 && dz === 0)) return;
  if (vis.kind === 'sprite') {
    if (Math.abs(dx) > 0.05) vis.facingLeft = dx < 0;
    const sx = Math.abs(vis.body.scale.x);
    vis.body.scale.x = vis.facingLeft ? -sx : sx;
  } else if (vis.kind === 'model') {
    vis.body.rotation.y = Math.atan2(-dx, -dz);
  }
}

/** Brief colour flash (hits). */
export function flashVisual(root, color = '#ffffff', time = 0.1) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.flashT = time;
  vis.flashColor.set(color);
}

/** Persistent multiplier colour, e.g. blue while slowed. Pass '#ffffff' to clear. */
export function setBaseColor(root, color) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.baseColor.set(color);
  if (vis.kind === 'model') {
    for (const mat of vis.mats) {
      if (!mat.userData.base || mat.userData.emissive) continue;
      if (!mat.userData.orig) mat.userData.orig = mat.userData.base.clone();
      mat.userData.base.copy(mat.userData.orig).multiply(vis.baseColor);
    }
  }
}

export function setOpacity(root, a) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.opacity = a;
  for (const mat of vis.mats) {
    mat.transparent = true;
    mat.opacity = a;
    if ('alphaTest' in mat && vis.kind !== 'model') mat.alphaTest = a < 1 ? 0.01 : 0.5;
  }
}

/** Status lights on placeholder props (red → green when activated). */
export function setStatus(root, color) {
  const vis = root?.userData.vis;
  if (!vis) return;
  for (const m of vis.statusParts) { m.material.color.set(color); m.material.userData.base?.set(color); }
}

export function updateVisual(root, dt) {
  const tint = TINT;
  const vis = root?.userData.vis;
  if (!vis) return;
  if (vis.anims && vis.anim) {
    const list = vis.anims[vis.anim];
    const fps = vis.animFps[vis.anim] || vis.fps;
    vis.animT += dt;
    const f = list[Math.floor(vis.animT * fps) % list.length];
    if (f !== vis.frame) setFrame(vis, f);
  }
  if (vis.flashT > 0) {
    vis.flashT -= dt;
    applyColor(vis, tint);
    if (vis.flashT <= 0) { vis.flashT = 0; applyColor(vis, tint); }
  } else if (vis.kind === 'model' && vis._lastBase !== vis.baseColor.getHex()) {
    vis._lastBase = vis.baseColor.getHex();
    applyColor(vis, tint);
  } else if (vis.kind !== 'model' && vis._lastBase !== vis.baseColor.getHex()) {
    vis._lastBase = vis.baseColor.getHex();
    applyColor(vis, tint);
  }
}

