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
//     "anchorY": 0,            // optional: texels of transparent padding under the feet
//     "anchor": [32, 54],      // optional: ground-point texel [x, y-from-top] inside one frame
//     "fw": 64, "fh": 64       // optional: frame size when the sheet is a grid
//   }
//
// Directional sheets (8-way, STYLE.md): "dirs": ["s","se","e","ne","n"] and anims as objects
// { row, frames, fps, hit?, loop? }; direction i of an anim is on row `row + i`. West-side directions
// that aren't listed are mirrored from their east twins. setFacing() picks the direction.
//
// Sprites face RIGHT in the art; setFacing() flips them horizontally when moving/aiming left.
// Keys with a level suffix ("scrap_turret_3") fall back to the base key when not listed.
//
// Every visual is a THREE.Group:  root ─ body (sprite or model) ─ … ; root.userData.vis holds state.
// Call updateVisual(root, dt) once per frame for animation, flashes and facing.

import * as THREE from 'three';
import { VISUALS } from '../data/visuals.js';
import { CARD_SCALE, SPRITE_CARD } from './PixelView.js';
import { TERRAIN_ART, ATMOS, OPENED_LOOK, OPENED_TOP, PYLON_GLOW } from '../data/jungle.js';
import { radialGlowTexture } from './PixelGlow.js';
import { addEmissive, emissiveBands } from './Emissive.js';
import { paletteSwap } from './PaletteSwap.js';
import { DEFENSE_ENEMIES, EXPLORE_ENEMIES } from '../data/enemies.js';

// Sprite keys that are creatures (DOM icons show their side view, cropped, never below 1×: Assets.iconFrame).
const CREATURE_KEYS = new Set([...Object.keys(DEFENSE_ENEMIES), ...Object.keys(EXPLORE_ENEMIES)]);

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
const PPU = 32;

// Blob shadows are drawn at the sprites' own texel size (1 texel = 1/32 tile), one shared texture +
// plane per pixel size, so they stay crisp next to the sprites instead of being a stretched 16 px blob.
const shadowCache = new Map();
function getShadow(r) {
  const w = Math.max(4, 2 * Math.round(r * PPU)), h = Math.max(2, 2 * Math.round(r * 0.7 * PPU));
  const key = `${w}x${h}`;
  let s = shadowCache.get(key);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // A hard-edged pixel ellipse with a darker core reads better than a soft gradient at low res.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      if (d < 1) {
        g.fillStyle = d < 0.62 ? 'rgba(10,8,20,0.68)' : 'rgba(10,8,20,0.42)';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const geom = new THREE.PlaneGeometry(w / PPU, h / PPU);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  geom.userData.shared = mat.userData.shared = tex.userData.shared = true;
  s = { geom, mat };
  shadowCache.set(key, s);
  return s;
}

// Hostile marker: a 1-texel elliptical ring on the floor around an enemy's feet (front arc in the
// marker colour over a dark inner line, back arc darker), drawn at the sprites' texel size so it is
// as crisp as they are. It keeps enemies from melting into a same-coloured floor.
const ringCache = new Map();
function getRing(r, color) {
  const w = Math.max(10, 2 * Math.round(r * 1.25 * PPU)), h = Math.max(6, 2 * Math.round(r * 0.85 * PPU));
  const key = `${w}x${h}${color}`;
  let s = ringCache.get(key);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const back = `#${new THREE.Color(color).multiplyScalar(0.6).getHexString()}`;
  const inside = (x, y, k) => Math.hypot((x + 0.5 - w / 2) / (w / 2 - k), (y + 0.5 - h / 2) / (h / 2 - k)) < 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const front = y >= h / 2 - 1;
      if (inside(x, y, 0) && !inside(x, y, 1)) { g.fillStyle = front ? color : back; g.fillRect(x, y, 1, 1); }
      else if (front && inside(x, y, 1) && !inside(x, y, 2)) { g.fillStyle = '#181425'; g.fillRect(x, y, 1, 1); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(w / PPU, h / PPU);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  geom.userData.shared = mat.userData.shared = tex.userData.shared = true;
  s = { geom, mat };
  ringCache.set(key, s);
  return s;
}
function makeRing(r, color) {
  const { geom, mat } = getRing(r, color);
  const m = new THREE.Mesh(geom, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.018;
  m.renderOrder = 0;
  m.name = 'ring';
  m.userData.pxSnap = true;
  m.userData.ring = true;
  return m;
}

/** A second ground ring under a visual (the Pack Lord's gold mark, critic H2 §2.3): radius r tiles, in `color`. */
export function addGroundRing(root, r, color) {
  const m = makeRing(r, color);
  m.name = 'ring2';
  m.position.y = 0.017;
  root.add(m);
  return m;
}

// Occlusion silhouette (critic F #1): a second draw of a creature's sprite that only lands where
// something in FRONT of it already wrote depth (depthFunc GREATER) — foliage cards, trunks, ruins,
// props. It paints the sprite's edge texels solid in a flat colour (a 1-texel outline) and fills the
// inside with an ordered-dither checker, so a player or enemy under brush stays a readable shape.
// Pixel-exact: hard alpha, Bayer dither on screen pixels, no blending. Texels below the anchor (under
// the ground plane) are skipped. Colours: ATMOS.silhouette (src/data/jungle.js).
class SilhouetteMaterial extends THREE.SpriteMaterial {
  constructor(params, texel, fill = ATMOS.silhouette.fill) {
    super(params);
    this.isSilhouetteMaterial = true;
    this.uTexel = { value: texel };
    this.uFill = { value: fill };
    this.uInner = { value: ATMOS.silhouette.inner };
  }
  onBeforeCompile(shader) {
    shader.uniforms.spriteCard = SPRITE_CARD;
    shader.uniforms.uTexel = this.uTexel;
    shader.uniforms.uFill = this.uFill;
    shader.uniforms.uInner = this.uInner;
    shader.vertexShader = shader.vertexShader
      .replace('uniform float rotation;', 'uniform float rotation; uniform vec2 spriteCard; varying float vAboveAnchor;')
      .replace('vec2 rotatedPosition;', 'vAboveAnchor = alignedPosition.y; vec2 rotatedPosition;')
      .replace('mvPosition.xy += rotatedPosition;', 'mvPosition.x += rotatedPosition.x; mvPosition.yz += rotatedPosition.y * spriteCard;');
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float opacity;', `uniform float opacity;
uniform vec2 uTexel;
uniform float uFill, uInner;
varying float vAboveAnchor;
const float SIL_BAYER[16] = float[16](0.03125,0.53125,0.15625,0.65625,0.78125,0.28125,0.90625,0.40625,0.21875,0.71875,0.09375,0.59375,0.96875,0.46875,0.84375,0.34375);`)
      .replace('#include <map_fragment>', `
	if (vAboveAnchor < 0.0) discard;
	if (texture2D(map, vMapUv).a < 0.5) discard;
	float edge = 0.0;
	edge += step(texture2D(map, vMapUv + vec2(uTexel.x, 0.0)).a, 0.5);
	edge += step(texture2D(map, vMapUv - vec2(uTexel.x, 0.0)).a, 0.5);
	edge += step(texture2D(map, vMapUv + vec2(0.0, uTexel.y)).a, 0.5);
	edge += step(texture2D(map, vMapUv - vec2(0.0, uTexel.y)).a, 0.5);
	if (edge < 0.5) {
		int bx = int(mod(gl_FragCoord.x, 4.0)), by = int(mod(gl_FragCoord.y, 4.0));
		if (SIL_BAYER[by * 4 + bx] >= uFill) discard;
		diffuseColor.rgb *= uInner;
	}`);
  }
  customProgramCacheKey() { return 'vr-silhouette-sprite'; }
}

/**
 * Attach an occlusion silhouette to a sprite visual (see SilhouetteMaterial). `skipMask` (jungle creatures, critic I
 * #3): never draw over texels a card mask stenciled (the player's body + outline), so a creature standing right
 * behind you can't print its dither over your sprite.
 */
function addSilhouette(vis, color, fill, skipMask = false) {
  const body = vis.body;
  const G = vis.geom;
  const mask = skipMask ? {
    stencilWrite: true, stencilWriteMask: 0x00, stencilRef: CARD_MASK_REF, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  } : {};
  const mat = new SilhouetteMaterial({ map: vis.tex, color, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false, ...mask },
    new THREE.Vector2(1 / G.iw, 1 / G.ih), fill);
  // Same depth as the body's own visible texels must NOT count as "in front": bias toward the camera.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 0;
  mat.polygonOffsetUnits = -4;
  const spr = new THREE.Sprite(mat);
  spr.center.copy(body.center);
  spr.renderOrder = 40;          // after every opaque card and every normal sprite
  spr.userData.noSnap = true;    // inherits the body's per-draw pixel snap (it is the body's child)
  spr.name = 'silhouette';
  body.add(spr);
  vis.sil = spr;
  vis.silColor = color;
}

// Outlined sprite (critic G #1, the player): the body draws a flat 1-texel outline on the transparent
// texels that touch its opaque ones (inside the frame, above the anchor), in `uOutline` — dark on open
// ground, pale in brush (setOutline). A second, invisible copy (the "card mask") runs first and writes
// stencil 1 over the body + outline; the foliage/trunk/ruin card shader (JungleWorld.makeCardMaterial)
// skips stencil-1 pixels, so cards never cover the player's own texels and the x-ray window's dither
// only ever lands around it. Sprites in front (enemies, props) still cover it — the silhouette shows there.
class OutlineSpriteMaterial extends THREE.SpriteMaterial {
  constructor(params, G, color) {
    super(params);
    this.isOutlineSpriteMaterial = true;
    this.uTexel = { value: new THREE.Vector2(1 / G.iw, 1 / G.ih) };
    this.uQuad = { value: new THREE.Vector2(1 / G.fw, 1 / G.fh) };
    this.uOutline = { value: new THREE.Color(color) };
  }
  onBeforeCompile(shader) {
    shader.uniforms.spriteCard = SPRITE_CARD;
    shader.uniforms.uTexel = this.uTexel;
    shader.uniforms.uQuad = this.uQuad;
    shader.uniforms.uOutline = this.uOutline;
    shader.vertexShader = shader.vertexShader
      .replace('uniform float rotation;', 'uniform float rotation; uniform vec2 spriteCard; varying float vAboveAnchor; varying vec2 vQuad;')
      .replace('vec2 rotatedPosition;', 'vAboveAnchor = alignedPosition.y; vQuad = uv; vec2 rotatedPosition;')
      .replace('mvPosition.xy += rotatedPosition;', 'mvPosition.x += rotatedPosition.x; mvPosition.yz += rotatedPosition.y * spriteCard;');
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float opacity;', `uniform float opacity;
uniform vec2 uTexel, uQuad;
uniform vec3 uOutline;
varying float vAboveAnchor;
varying vec2 vQuad;`)
      .replace('#include <map_fragment>', `
	if (vAboveAnchor < 0.0) discard;   // under the ground plane (hidden there anyway; keeps the mask off cards in front)
	vec4 sampledDiffuseColor = texture2D(map, vMapUv);
	if (sampledDiffuseColor.a < 0.5) {
		float n = 0.0;
		if (vQuad.x > uQuad.x && vQuad.x < 1.0 - uQuad.x) {
			n += step(0.5, texture2D(map, vMapUv + vec2(uTexel.x, 0.0)).a);
			n += step(0.5, texture2D(map, vMapUv - vec2(uTexel.x, 0.0)).a);
		}
		if (vQuad.y > uQuad.y && vQuad.y < 1.0 - uQuad.y) {
			n += step(0.5, texture2D(map, vMapUv + vec2(0.0, uTexel.y)).a);
			n += step(0.5, texture2D(map, vMapUv - vec2(0.0, uTexel.y)).a);
		}
		if (n < 0.5) discard;
		diffuseColor = vec4(uOutline, diffuseColor.a);
	} else diffuseColor *= sampledDiffuseColor;`);
  }
  customProgramCacheKey() { return 'vr-outline-sprite'; }
}

/** Swap a sprite visual's body to an outlined one + its stencil card mask (see OutlineSpriteMaterial). */
function addOutline(vis, color) {
  const body = vis.body;
  const G = vis.geom;
  const old = body.material;
  const mat = new OutlineSpriteMaterial({ map: vis.tex, transparent: true, alphaTest: 0.5 }, G, color);
  body.material = mat;
  vis.mats[vis.mats.indexOf(old)] = mat;
  old.dispose();
  const mask = new OutlineSpriteMaterial({
    map: vis.tex, transparent: false, alphaTest: 0.5, colorWrite: false, depthWrite: false, depthTest: false, fog: false,
    stencilWrite: true, stencilRef: CARD_MASK_REF, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  }, G, color);
  mask.uTexel = mat.uTexel; mask.uQuad = mat.uQuad;
  const spr = new THREE.Sprite(mask);
  spr.center.copy(body.center);
  spr.renderOrder = -9;          // opaque pass, after the ground (-10), before every card
  spr.userData.noSnap = true;    // follows the body's pixel snap
  spr.name = 'cardMask';
  body.add(spr);
  vis.outline = mat;
  vis.outlineColor = color;
}

/** Stencil value the player's card mask writes; the card shader skips these pixels. */
export const CARD_MASK_REF = 1;

/** Recolour a visual's sprite outline (made with makeVisual(key, {outline})). */
export function setOutline(root, color) {
  const vis = root?.userData.vis;
  if (!vis?.outline || color === vis.outlineColor) return;
  vis.outlineColor = color;
  vis.outline.uOutline.value.set(color);
}

/** Recolour (or hide with null) a visual's occlusion silhouette. */
export function setSilhouette(root, color) {
  const vis = root?.userData.vis;
  if (!vis?.sil) return;
  vis.sil.visible = !!color;
  if (color && color !== vis.silColor) { vis.silColor = color; vis.sil.material.color.set(color); }
}

// Stand-ins while a key has no art of its own (the Feral Scavenger borrows the v1 Rival Scavenger).
const SPRITE_ALIAS = { feral: 'scav' };

const DIR_VEC = { s: [0, 1], se: [1, 1], e: [1, 0], ne: [1, -1], n: [0, -1], nw: [-1, -1], w: [-1, 0], sw: [-1, 1] };
const DIR_ORDER = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];   // by screen angle atan2(dz, dx), 45° steps
const MIRROR = { sw: 'se', w: 'e', nw: 'ne', se: 'sw', e: 'w', ne: 'nw' };

/** Frame size and grid of a manifest sprite: { fw, fh, cols, rows }. */
export function frameGeom(def, img) {
  const frames = def.frames || 1;
  const fw = def.fw || img.width / frames;
  const fh = def.fh || img.height;
  return { fw, fh, cols: Math.max(1, Math.round(img.width / fw)), rows: Math.max(1, Math.round(img.height / fh)) };
}

/** Normalised anims: name → { frames: [frame indices], row (directional base row or -1), fps, loop, hit }. */
function normAnims(def) {
  if (!def.anims) return null;
  const out = {};
  for (const [name, a] of Object.entries(def.anims)) {
    if (Array.isArray(a)) out[name] = { frames: a, row: -1, fps: def.animFps?.[name] || def.fps || 8, loop: true, hit: -1 };
    else out[name] = { frames: Array.from({ length: a.frames || 1 }, (_, i) => i), row: a.row ?? 0, fps: a.fps || def.fps || 8, loop: a.loop !== false, hit: a.hit ?? -1 };
  }
  return out;
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
    paletteSwap(this);   // load-time recolours (PALETTE_SWAP: the Feral's cloak), src/core/PaletteSwap.js
    await this._loadTerrain();
  }

  /**
   * Terrain art (public/terrain, STYLE.md): for each terrain kind, the PixelLab Wang tile whose four
   * corners are all that terrain, as raw RGBA ({ data, w, h }) for TerrainBaker. Only the kinds listed
   * in TERRAIN_ART are used; the rest stay procedural (flat AI base tiles read as a grid).
   */
  async _loadTerrain() {
    this.terrainArt = null;
    try {
      const base = `${import.meta.env.BASE_URL}terrain/`;
      const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const man = await res.json();
      const out = {};
      for (const set of Object.values(man.sets || {})) {
        const [meta, img] = await Promise.all([
          fetch(base + set.meta).then((r) => r.json()),
          new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = base + set.png; }),
        ]);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        for (const t of meta.tileset_data?.tiles || []) {
          const corners = new Set(Object.values(t.corners || {}));
          if (corners.size !== 1) continue;
          const kind = set[[...corners][0]];
          if (!TERRAIN_ART.includes(kind) || out[kind]) continue;
          const bb = t.bounding_box;
          const d = g.getImageData(bb.x, bb.y, bb.width, bb.height);
          out[kind] = { data: d.data, w: bb.width, h: bb.height };
        }
      }
      this.terrainArt = Object.keys(out).length ? out : null;
    } catch (e) {
      console.warn('terrain art not loaded', e);
    }
  }

  /** The manifest key actually used for `key` (handles "_2"/"_3" level suffixes). */
  resolveKey(key) {
    if (this.textures[key]) return key;
    const base = key.replace(/_\d+$/, '');
    if (base !== key && this.textures[base]) return base;
    const alias = SPRITE_ALIAS[key];
    if (alias && this.textures[alias]) return alias;
    return null;
  }

  hasSprite(key) { return !!this.resolveKey(key); }

  /** Raw texture for UI use (icons). Returns { tex, def } or null. */
  spriteInfo(key) {
    const k = this.resolveKey(key);
    return k ? { tex: this.textures[k], def: this.manifest[k] } : null;
  }

  /**
   * CSS px per texel for a sprite icon sized for a `boxPx` CSS px slot: the largest whole number of
   * DEVICE px per texel (1×, 2×, 3×…) that (about) fits, or an even 1/n step down when the sprite is much
   * bigger than the slot — never an arbitrary ratio, which draws texels 1 or 2 px wide at random.
   */
  iconScale(key, boxPx) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const creature = CREATURE_KEYS.has(key) || CREATURE_KEYS.has(k);
    const { w, h } = this.iconFrame(k, creature);
    const dpr = window.devicePixelRatio || 1;
    const r = (boxPx * dpr) / Math.max(w, h);
    // Up to ~15% over the box is allowed (a 48 px tower in a 45 px slot stays 1× instead of halving).
    // Creatures never shrink below 1× unless they are over twice the slot (critic H §2: a ½ Razorback was a
    // 10-px smudge); the box grows to fit (screensKit.iconEl).
    const ds = r >= 0.85 ? Math.max(1, Math.floor(r + 0.15)) : creature && r >= 0.5 ? 1 : 1 / Math.ceil(1 / r - 0.15);
    return ds / dpr;
  }

  /**
   * The part of a sprite sheet a DOM icon shows, in sheet texels { sx, sy, w, h }: frame 0 — for a creature, its
   * side view (a directional sheet's 'e' idle frame) cropped to the opaque bounding box, so a small creature
   * isn't a speck in a big empty frame (critic H §2). Cached per key.
   */
  iconFrame(k, creature = CREATURE_KEYS.has(k)) {
    this._iconFrames ||= new Map();
    const ck = `${k}|${creature ? 1 : 0}`;
    if (this._iconFrames.has(ck)) return this._iconFrames.get(ck);
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const { fw, fh } = frameGeom(def, img);
    let box = { sx: 0, sy: 0, w: fw, h: fh };
    if (creature) {
      const anims = normAnims(def);
      const idle = anims?.idle;
      if (def.dirs && idle && idle.row >= 0) box.sy = (idle.row + Math.max(0, def.dirs.indexOf('e'))) * fh;
      try {
        const c = document.createElement('canvas');
        c.width = fw; c.height = fh;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, box.sx, box.sy, fw, fh, 0, 0, fw, fh);
        const d = g.getImageData(0, 0, fw, fh).data;
        let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          if (d[(y * fw + x) * 4 + 3] < 128) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 >= x0) box = { sx: box.sx + x0, sy: box.sy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      } catch { /* a tainted or missing image: the whole frame */ }
    }
    this._iconFrames.set(ck, box);
    return box;
  }

  /** A DOM icon for `key` at most about `sizePx` CSS px on its long side: { css, w, h } (CSS px), or null. */
  iconSpec(key, sizePx = 32) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const f = this.iconFrame(k, CREATURE_KEYS.has(key) || CREATURE_KEYS.has(k));
    const scale = this.iconScale(key, sizePx);
    const w = f.w * scale, h = f.h * scale;
    return {
      w, h,
      css: `background-image:url(${import.meta.env.BASE_URL}sprites/${def.file});background-size:${img.width * scale}px ${img.height * scale}px;background-position:${-f.sx * scale}px ${-f.sy * scale}px;width:${w}px;height:${h}px;image-rendering:pixelated;background-repeat:no-repeat;`,
    };
  }

  /** CSS for a DOM icon of a sprite (iconSpec: integer-scaled, creatures cropped to their side view), or null. */
  iconStyle(key, sizePx = 32) {
    return this.iconSpec(key, sizePx)?.css ?? null;
  }

  /**
   * A "spent" look derived from an existing sprite (critic F #14: opened containers per type), registered
   * as a new manifest key and returned (null if `key` has no sprite). Modes:
   *   'dark'   glowing texels (screens, lamps, gems) switched off — a dead terminal
   *   'open'   glow off + the top face hollowed into a dark interior — an open chest
   *   'gutted' like 'open', and the whole thing dimmed — a cracked, emptied cache
   * Pixel-exact: per-texel recolour of the original, same size and anchor.
   */
  spentVariant(key, mode) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const nk = `${k}__${mode}`;
    if (this.textures[nk]) return nk;
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    spendPixels(d.data, c.width, c.height, mode, OPENED_TOP[k]);
    g.putImageData(d, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures[nk] = tex;
    this.manifest[nk] = { ...def, anims: undefined, frames: 1, fw: def.fw || img.width / (def.frames || 1) };
    return nk;
  }

  /** Ground light pool for activated pylons: { tex, w, h, color, strength } (PYLON_GLOW, PixelGlow.js). */
  get pylonGlow() {
    const G = PYLON_GLOW;
    return { tex: radialGlowTexture(Math.round(G.w * PPU), Math.round(G.h * PPU), { steps: G.steps, power: G.power }), w: G.w, h: G.h, color: G.color, strength: G.strength };
  }

  /** Sprite key for an opened container of `type` whose closed sprite is `closedKey` (OPENED_LOOK), or null. */
  openedVariant(type, closedKey) {
    const mode = OPENED_LOOK[type];
    return mode ? this.spentVariant(closedKey, mode) : null;
  }

  setTint(color) {
    this.tint.set(color);
    for (const root of this._live) applyColor(root.userData.vis, this.tint);
  }

  /**
   * Build the visual for `key`. Options:
   *   shadow: false to skip the blob shadow
   *   ring: colour of a ground marker ring under the feet (hostile units)
   *   scale: uniform scale. Sprites only take whole-number scales (1, 2…): a fractional scale would
   *          draw uneven 1–2 px texels, so it is rounded.
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
    const scale = sk ? Math.max(1, Math.round(opts.scale ?? 1)) : (opts.scale ?? 1);

    if (sk) {
      const def = this.manifest[sk];
      const base = this.textures[sk];
      const tex = base.clone();
      tex.needsUpdate = true;
      const img = base.image;
      const G = frameGeom(def, img);
      tex.repeat.set(G.fw / img.width, G.fh / img.height);
      const ppu = def.ppu || 32;
      const w = (G.fw / ppu) * scale;
      const h = (G.fh / ppu) * scale;
      vis.kind = def.flat ? 'flat' : 'sprite';
      vis.geom = { ...G, iw: img.width, ih: img.height };
      vis.frames = G.cols;
      vis.anims = normAnims(def);
      vis.fps = def.fps || 8;
      vis.animFps = def.animFps || {};
      vis.dirs = def.dirs || null;
      vis.dir = vis.dirs ? (vis.dirs.includes('s') ? 's' : vis.dirs[0]) : null;
      vis.tex = tex;
      vis.width = w;
      // Ground point inside the frame: "anchor" [x, y-from-top], else bottom centre (+ anchorY padding).
      const ax = def.anchor ? def.anchor[0] : G.fw / 2;
      const ay = def.anchor ? def.anchor[1] : G.fh - (def.anchorY || 0);
      vis.anchor = [ax, ay];
      // Sprites are drawn as upright cards (src/core/PixelView.js): h sprite units tall on screen is
      // h × CARD_SCALE world units, so labels/bars at vis.height sit on top of the sprite.
      vis.height = def.flat ? 0.05 : (ay / ppu) * scale * CARD_SCALE;
      if (def.flat) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02 + (def.layer || 0) * 0.005;
        mesh.renderOrder = 1;
        mesh.userData.pxSnap = true;   // PixelCamera aligns its texels to the pixel grid
        vis.body = mesh;
        vis.mats.push(mat);
        root.add(mesh);
      } else {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
        const spr = new THREE.Sprite(mat);
        spr.center.set(ax / G.fw, (G.fh - ay) / G.fh);
        spr.scale.set(w, h, 1);
        vis.body = spr;
        vis.mats.push(mat);
        root.add(spr);
        this._live.add(root);
        applyColor(vis, this.tint);
      }
      const shadowR = def.shadow ?? (def.flat ? 0 : Math.min(1.4, w * 0.36));
      if (opts.shadow !== false && shadowR > 0) root.add(makeShadow(shadowR));
      if (opts.ring) root.add(makeRing(Math.max(0.3, shadowR), opts.ring));   // hostile marker (enemies)
      // Occlusion silhouette for creatures: the player, and anything with a hostile ring.
      const silColor = opts.silhouette ?? (key === 'player' ? ATMOS.silhouette.player : opts.ring ? ATMOS.silhouette.enemyDim : null);
      if (silColor && vis.kind === 'sprite') addSilhouette(vis, silColor, key === 'player' ? ATMOS.silhouette.playerFill : undefined, !!opts.silhouetteSkipsMask);
      // 1-texel outline + card mask (the player by default; opts.outline = colour or false).
      const outline = opts.outline ?? (key === 'player' ? ATMOS.playerOutline.open : null);
      if (outline && vis.kind === 'sprite') addOutline(vis, outline);
      // Glowing texels (eyes, screens, crystal) keep their light at night (src/core/Emissive.js, EMISSIVE).
      const glow = vis.kind === 'sprite' && opts.emissive !== false && emissiveBands(sk);
      if (glow) addEmissive(vis, glow);
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
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) {
        if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose();
        o.material.dispose();
      }
    });
    root.removeFromParent();
  }
}

/** Recolour RGBA bytes in place for spentVariant (see there). */
function spendPixels(D, W, H, mode, face) {
  const fw = W;   // single-frame props
  let top = H, bot = 0, left = W, right = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < fw; x++) if (D[(y * W + x) * 4 + 3] > 127) { top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); }
  const hsv = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    let h = 0;
    if (dl) h = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    return [h * 60, mx ? dl / mx : 0, mx / 255];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (D[i + 3] < 128) continue;
      let r = D[i], g = D[i + 1], b = D[i + 2];
      const [h, s, v] = hsv(r, g, b);
      // Emissive texels: very bright saturated, or any cyan / violet / magenta light.
      const glow = (v > 0.8 && s > 0.45) || (s > 0.45 && v > 0.5 && ((h > 165 && h < 200) || (h > 255 && h < 320)));
      // A lit amber/green screen face around the glyphs (terminals).
      const screen = mode === 'dark' && s > 0.55 && v > 0.35 && h > 25 && h < 60;
      if (glow && mode === 'open' && h > 20 && h < 70) { r *= 0.55; g *= 0.48; b *= 0.4; }   // a brass latch, not a light: just dulled
      else if (glow) { r = 30; g = 34; b = 36; }
      else if (screen) { r *= 0.3; g *= 0.3; b *= 0.32; }
      if (mode !== 'dark' && face) {
        const c = openInterior(face, x, y);
        if (c) { r = c[0]; g = c[1]; b = c[2]; }
        if (mode === 'gutted') { r *= 0.72; g *= 0.7; b *= 0.74; }
      } else if (mode !== 'dark') {
        // Hollow top face: the upper part of the body seen from above becomes a dark interior with a
        // lit far rim (light from the top-left) and a 1-texel shadow line under the near rim.
        const fy = (y - top) / Math.max(1, bot - top), fx = (x - left) / Math.max(1, right - left);
        if (fy > 0.08 && fy < 0.4 && fx > 0.12 && fx < 0.88) {
          const edge = fy < 0.14 ? 1 : fy > 0.34 ? 2 : 0;
          if (edge === 1) { r = r * 0.55 + 20; g = g * 0.55 + 16; b = b * 0.55 + 12; }
          else if (edge === 2) { r = 14; g = 10; b = 9; }
          else { const k = 0.22 + (fy - 0.14) * 0.5; r = 34 * k + 8; g = 24 * k + 6; b = 18 * k + 6; }
        }
        if (mode === 'gutted') { r *= 0.72; g *= 0.7; b *= 0.74; }
      }
      D[i] = r; D[i + 1] = g; D[i + 2] = b;
    }
  }
}

// Open-container interior (critic G #10) inside a sprite's top face, OPENED_TOP: the face polygon
// (convex, clockwise on screen: left, back, right, front corner) inset by `rim` texels is hollowed out.
// The two far inner walls are `wall` texels deep (back-left in shade, back-right catching the top-left
// light); the floor is dark, darkest (dithered) in the near walls' shadow. Returns [r, g, b] or null.
const BAYER4P = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function openInterior(top, x, y) {
  const P = top.poly, n = P.length, px = x + 0.5, py = y + 0.5;
  const dist = new Array(n);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % n];
    const ex = bx - ax, ey = by - ay;
    dist[i] = ((px - ax) * ey - (py - ay) * ex) / -Math.hypot(ex, ey);   // > 0 inside
  }
  const rim = top.rim ?? 2;
  if (Math.min(...dist) < rim) return null;
  const C = top.colors;
  const dBL = dist[0] - rim, dBR = dist[1] - rim, dNear = Math.min(dist[2], dist[3]) - rim;
  const wall = top.wall ?? 4;
  if (dBL < wall && dBL <= dBR) return dBL < 1 ? C.wallDarkTop : C.wallDark;
  if (dBR < wall) return dBR < 1 ? C.wallLitTop : C.wallLit;
  const t = Math.min(1, dNear / (top.shade ?? 3)) + (BAYER4P[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5;
  return t < 0.5 ? C.deep : C.floor;
}

function makeShadow(r) {
  const { geom, mat } = getShadow(r);
  const m = new THREE.Mesh(geom, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.renderOrder = 0;
  m.name = 'shadow';
  m.userData.pxSnap = true;
  return m;
}

function setFrame(vis, f) {
  vis.frame = f;
  if (!vis.tex) return;
  const G = vis.geom;
  let col, row, flip = vis.kind === 'sprite' && vis.facingLeft;
  const a = vis.anim && vis.anims?.[vis.anim];
  if (a && a.row >= 0 && vis.dirs) {
    // Directional sheet: column = frame, row = anim row + direction (west side mirrored from east).
    let i = vis.dirs.indexOf(vis.dir);
    flip = false;
    if (i < 0 && MIRROR[vis.dir]) { i = vis.dirs.indexOf(MIRROR[vis.dir]); flip = true; }
    col = Math.min(f, G.cols - 1);
    row = a.row + Math.max(0, i);
  } else if (a && a.row >= 0) {
    col = f; row = a.row;
  } else {
    col = f % G.cols; row = Math.floor(f / G.cols);
  }
  // Facing left mirrors the frame through its UVs: THREE.Sprite ignores a negative scale (its shader
  // uses the matrix column length), so flipping body.scale.x would not mirror anything.
  const u = G.fw / G.iw, v = G.fh / G.ih;
  vis.tex.repeat.x = (flip ? -1 : 1) * u;
  vis.tex.offset.x = (col + (flip ? 1 : 0)) * u;
  vis.tex.repeat.y = v;
  vis.tex.offset.y = 1 - (row + 1) * v;
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
  setFrame(vis, vis.anims[name].frames[0]);
}

/** Does this visual have a real animation called `name` (not the idle fallback)? */
export function hasAnim(root, name) { return !!root?.userData.vis?.anims?.[name]; }

/** Seconds one pass of an animation takes at speed 1 (0 if missing). */
export function animLength(root, name) {
  const a = root?.userData.vis?.anims?.[name];
  return a ? a.frames.length / a.fps : 0;
}

/** The anim's `hit` frame as a fraction of its length (where the blow lands), or `fallback`. */
export function animHitFrac(root, name, fallback = 0.5) {
  const a = root?.userData.vis?.anims?.[name];
  return a && a.hit >= 0 ? (a.hit + 0.5) / a.frames.length : fallback;
}

/** Playback speed multiplier (e.g. an attack anim stretched to a wind-up time). */
export function setAnimSpeed(root, k) { const vis = root?.userData.vis; if (vis) vis.animSpeed = k; }

/** True once a non-looping use of the current animation has played through at least once. */
export function animDone(root) {
  const vis = root?.userData.vis;
  if (!vis || !vis.anims || !vis.anim) return true;
  const a = vis.anims[vis.anim];
  return vis.animT * a.fps >= a.frames.length;
}

/**
 * Face a world direction. Directional sheets pick one of 8 directions (with a little hysteresis so
 * diagonal movement doesn't flicker); strip sprites flip horizontally; models rotate.
 */
export function setFacing(root, dx, dz, snap = false) {
  const vis = root?.userData.vis;
  if (!vis || (dx === 0 && dz === 0)) return;
  if (vis.kind === 'sprite' && vis.dirs) {
    const ang = Math.atan2(dz, dx);
    const cur = vis.dir && DIR_VEC[vis.dir];
    if (cur && !snap) {
      // Keep the current direction while within 22.5° + 8° of it.
      let da = ang - Math.atan2(cur[1], cur[0]);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.PI / 8 + 0.14) return;
    }
    const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const d = DIR_ORDER[idx];
    if (d !== vis.dir) { vis.dir = d; setFrame(vis, vis.frame); }
  } else if (vis.kind === 'sprite') {
    const was = vis.facingLeft;
    if (Math.abs(dx) > 0.05) vis.facingLeft = dx < 0;
    if (vis.facingLeft !== was) setFrame(vis, vis.frame);
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
  if (vis.sil) {
    // Hidden while the body is faded (burrowed, dissolving); enemies: bright once alerted (the scene
    // sets root.userData.alert), dim while their awareness is unknown.
    vis.sil.visible = vis.body.visible && vis.opacity >= 0.5;
    if (vis.key !== 'player' && root.userData.alert !== undefined) {
      const c = root.userData.alert ? ATMOS.silhouette.enemy : ATMOS.silhouette.enemyDim;
      if (c !== vis.silColor) { vis.silColor = c; vis.sil.material.color.set(c); }
    }
  }
  if (vis.anims && vis.anim) {
    const a = vis.anims[vis.anim];
    vis.animT += dt * (vis.animSpeed || 1);
    const i = Math.floor(vis.animT * a.fps);
    const f = a.frames[a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1)];
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

