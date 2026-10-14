// The jungle at runtime: chunk streaming, rendering, collision and the machete's effect on the world.
//
// Data comes from JungleGen (static per run) plus the run's persistent cut-mask (tiles of undergrowth
// the player has cleared, shared across days). The world is cut into 16 × 16-tile chunks; the chunks
// around the camera are live:
//   ground  a 512 × 512 canvas baked by TerrainBaker (one plane, 1 texel = 1 pixel)
//   cards   every bush, tree, ruin and rock of the chunk merged into ONE mesh of upright pixel cards
//           (atlas from FloraAtlas). A card stands at its ground anchor: texels above the anchor rise
//           straight up (screen height = world height × cot 55°, so pixels stay 1:1), texels below it lie
//           flat on the ground toward the camera. Depth is therefore right: you walk behind a tree and
//           its canopy covers you — and the card shader dithers a see-through window around the player.
// Baking is spread out (one chunk per frame) and cached; cutting brush rebuilds only that chunk's cards.
//
// Collision (Stage 6 "solid jungle"): thickets/brambles and deep water are solid tiles; trunks, logs, rocks,
// ruins and props are rounded-box footprints matched to the base of their art (src/world/Solid.js, SOLID) in a
// tile hash. Ferns, shallow water and mud only slow movement (speedAt, GROUND).

import * as THREE from 'three';
import { JUNGLE, LEVEL, BRUSH, ATMOS, SOLID, GROUND, REGION_LOOK } from '../data/jungle.js';
import { CARD_SCALE } from '../core/PixelView.js';
import { CARD_MASK_REF, setOutline } from '../core/Assets.js';
import { TerrainBaker } from './TerrainBaker.js';
import { FloraAtlas } from './FloraAtlas.js';
import { hash2 } from './noise.js';
import { footprint, inFootprint, pushOut } from './Solid.js';

const C = JUNGLE.chunk;

// 8 × 8 ordered dither (recursive Bayer): 64 levels, so a fade over a few pixels shows no steps.
const BAYER_GLSL = 'float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }\nfloat bayer8(vec2 a){ return (bayer2(0.25 * a) * 0.25 + bayer2(0.5 * a)) * 0.25 + bayer2(a); }\n';

// The trail mask's stand-in (no trail see-through): the night map and anything else that reuses the card material.
let NO_TRAIL = null;
const noTrail = () => {
  if (!NO_TRAIL) { NO_TRAIL = new THREE.DataTexture(new Uint8Array(4), 1, 1); NO_TRAIL.needsUpdate = true; }
  return NO_TRAIL;
};

export function makeCardMaterial(tex) {
  return new THREE.ShaderMaterial({
    // Never over the player's own texels + outline: its card mask (Assets.js addOutline) wrote stencil
    // CARD_MASK_REF there just before the cards draw. Read-only stencil test; no stencil = always passes.
    stencilWrite: true,
    stencilWriteMask: 0x00,
    stencilRef: CARD_MASK_REF,
    stencilFunc: THREE.NotEqualStencilFunc,
    uniforms: {
      map: { value: tex },
      uTime: { value: 0 },
      uSway: { value: ATMOS.sway },
      uPlayerPx: { value: new THREE.Vector2(-999, -999) },
      uPlayerZ: { value: -999 },
      uXray: { value: ATMOS.xrayRadius * 32 },
      uXrayMax: { value: ATMOS.xrayMax },
      uXrayInner: { value: ATMOS.xrayInner },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAtlas: { value: tex.image?.width || 2048 },
      uBase: { value: new THREE.Vector3(ATMOS.brushBase.baseH, ATMOS.brushBase.baseDark, 0) },
      uCot: { value: 1 / CARD_SCALE },
      // Trails show through the brush in front of them (critic H2 §1, ATMOS.trailXray): uTrail = per-tile mask of
      // open trail ground (JungleWorld._buildTrailMask), uTrailK = [strength, boost, foot, world size]; 0 = off.
      uTrail: { value: noTrail() },
      uTrailK: { value: new THREE.Vector4(0, 1, 0.25, 1) },
      uTrailT: { value: new THREE.Vector2(0, 1.4) },   // trees: [strength, foot]
    },
    vertexShader: `
      attribute vec4 aCard;   // baseZ, sway weight, phase, upright (1) / flat (0)
      attribute vec3 aShade;  // kind (1 brush, 2 tree, 3 ruin/rock; 0 flat part), anchor row in the atlas, rows above it
      uniform float uTime;
      uniform float uSway;
      varying vec2 vUv;
      varying float vBaseZ;
      varying float vUpright;
      varying vec3 vShade;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        float s = floor(sin(uTime * 1.6 + aCard.z) * uSway * aCard.y + 0.5) / 32.0;
        p.x += s;
        vUv = uv;
        vBaseZ = aCard.x;
        vUpright = aCard.w;
        vShade = aShade;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D uTrail;
      uniform vec4 uTrailK;
      uniform vec2 uTrailT;
      uniform vec2 uPlayerPx;
      uniform float uPlayerZ;
      uniform float uXray, uXrayMax, uXrayInner, uAtlas, uCot;
      uniform vec3 uTint, uBase;
      varying vec2 vUv;
      varying float vBaseZ;
      varying float vUpright;
      varying vec3 vShade;
      varying vec3 vWorld;
      ${BAYER_GLSL}
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        bool isBrush = vShade.x > 0.5 && vShade.x < 1.5, isTree = vShade.x > 1.5 && vShade.x < 2.5;
        if (uTrailK.x > 0.0 && vUpright > 0.5 && (isBrush || isTree)) {
          // Brush (and tree crowns) standing south of a trail overhang it at the 55° pitch: texels over open trail
          // ground (the ground point behind this texel: x, z − cot·y) dither away — fully over the trail, a
          // dithered fringe beside it (the bilinear mask × boost) — so the path a player follows is never buried
          // (critic H2 §1). Each plant keeps its own foot: nothing goes within foot tiles of its base (a tree's
          // trunk: uTrailT.y), then the see-through ramps in over the next 0.4 tile (a dithered fade, not a hard
          // cut across the stems). Tree crowns only thin out (uTrailT.x).
          vec2 g = vec2(vWorld.x, vWorld.z - vWorld.y * uCot);
          float up = vBaseZ - g.y;
          float foot = isTree ? uTrailT.y : uTrailK.z;
          if (up > foot) {
            // The tile mask is read through a slow world-anchored wobble, so the see-through edge follows no grid.
            vec2 wob = vec2(vnoise(g * 1.7), vnoise(g * 1.7 + 17.3)) - 0.5;
            float m = clamp(texture2D(uTrail, (g + wob * 0.7) / uTrailK.w).r * uTrailK.y, 0.0, 1.0) * (isTree ? uTrailT.x : uTrailK.x);
            m *= smoothstep(foot, foot + 0.4, up);
            vec2 tp = floor(vec2(g.x, g.y) * 32.0 + 0.5);
            if (bayer8(tp) < m) discard;
          }
        }
        if (vUpright > 0.5 && vBaseZ > uPlayerZ + 0.06) {
          // See-through window: a round dithered hole that fades smoothly to nothing at its rim
          // (no hard edge, so no visible box or ring). The player's silhouette shows through the rest.
          // The dither is anchored to world pixels (screen x = X·32, y = (Z − cot·Y)·32), so it stays on the
          // leaves instead of crawling across them while the camera glides.
          vec2 d = (gl_FragCoord.xy - uPlayerPx) * vec2(1.0, 0.85);
          float k = uXrayMax * (1.0 - smoothstep(uXray * uXrayInner, uXray, length(d)));
          vec2 wp = floor(vec2(vWorld.x, vWorld.z - vWorld.y * uCot) * 32.0 + 0.5);
          if (bayer8(wp) < k) discard;
        }
        vec3 rgb = c.rgb;
        if (vShade.x > 0.5 && vShade.x < 1.5) {
          // Brush sinks toward its base: per texel row, darker over the bottom uBase.x of the card, deepest in the
          // card's own shadows (its lit leaves keep most of their value, so no flat band shows across the card).
          float row = floor(vUv.y * uAtlas);                     // atlas texel row
          float h = clamp((vShade.y - row) / max(1.0, vShade.z), 0.0, 1.0);   // 0 at the anchor → 1 at the top
          float t = 1.0 - smoothstep(0.0, uBase.x, h);
          float l = dot(rgb, vec3(0.299, 0.587, 0.114));
          rgb *= mix(1.0, uBase.y, t * mix(1.0, 0.45, smoothstep(0.02, 0.2, l)));
        }
        // Alpha = light code for PostFx: 2 = upright card (full canopy shade), 1 = the flat parts (ground).
        gl_FragColor = vec4(rgb * uTint, vUpright > 0.5 ? 2.0 : 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class JungleWorld {
  /**
   * @param game      Game (for assets)
   * @param scene3d   THREE.Scene to add chunk meshes to
   * @param world     JungleGen data
   * @param cutMask   Uint8Array(W²), 1 = brush cut (persistent, owned by the run)
   */
  constructor(game, scene3d, world, cutMask) {
    this.game = game;
    this.three = scene3d;
    this.w = world;
    this.size = world.size;
    this.cut = cutMask;
    this.deep = world.deep || new Uint8Array(world.size * world.size);
    world.brushNow = (x, z) => this.brushAt(x, z);
    this.atlas = new FloraAtlas(game.assets);
    this.cardMat = makeCardMaterial(this.atlas.texture);
    this.baker = new TerrainBaker(world, game.assets, game.assets.terrainArt || null);
    this.nChunks = Math.ceil(this.size / C);
    this.chunks = new Map();      // key → { cx, cz, ground, cards, dirtyCards }
    this.bakeCache = new Map();   // key → canvas (LRU by insertion)
    this.bakeQueue = [];
    this.groundGeom = new THREE.PlaneGeometry(C, C);
    this.groundGeom.userData.shared = true;
    this._buildColliders();
    this.shadeTex = this._buildShade();
    this.gradeTex = this._buildGrade();
    this.trailTex = this._buildTrailMask();
    const TX = ATMOS.trailXray;
    this.cardMat.uniforms.uTrail.value = this.trailTex;
    this.cardMat.uniforms.uTrailK.value.set(TX.strength, TX.boost, TX.foot, this.size);
    this.cardMat.uniforms.uTrailT.value.set(TX.tree, TX.treeFoot);
    this.time = 0;
  }

  /**
   * Open trail ground per tile (critic H2 §1): trail tiles with no undergrowth. R8, linear-filtered, so the card
   * shader's see-through fades over about a tile at the trail's edge. this.trailMask keeps the bytes (coveredAt).
   */
  _buildTrailMask() {
    const W = this.size, m = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) m[i] = this.w.trail[i] && !this.w.brush[i] && !this.deep[i] ? 255 : 0;
    this.trailMask = m;
    const tex = new THREE.DataTexture(m, W, W, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /** Would the card shader drop a brush texel over ground point (x, z)? (the trail see-through, for coveredAt) */
  _trailClear(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    return this.inBounds(tx, tz) && ATMOS.trailXray.strength > 0 && this.trailMask[tz * this.size + tx] > 0;
  }

  // ================================================================== queries

  inBounds(tx, tz) { return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size; }

  brushAt(tx, tz) {
    if (!this.inBounds(tx, tz)) return BRUSH.thicket;
    const i = tz * this.size + tx;
    return this.cut[i] ? 0 : this.w.brush[i];
  }

  /** Deep water: nobody crosses it (fords are shallow). */
  deepAt(tx, tz) { return this.inBounds(tx, tz) && this.deep[tz * this.size + tx] === 1; }

  /** Solid for movement: uncut thicket/bramble, deep water, or the map edge. */
  solidAt(tx, tz) { return !this.inBounds(tx, tz) || this.deep[tz * this.size + tx] === 1 || this.brushAt(tx, tz) >= BRUSH.thicket; }

  /** Solid for a body that slips through brush: deep water and the map edge only. */
  wetAt(tx, tz) { return !this.inBounds(tx, tz) || this.deep[tz * this.size + tx] === 1; }

  /** Opaque for sight: thickets, brambles, walls. */
  opaqueAt(tx, tz) {
    if (!this.inBounds(tx, tz)) return true;
    return this.brushAt(tx, tz) >= BRUSH.thicket || this.opaqueGrid[tz * this.size + tx] === 1;
  }

  /** Blocked for pathfinding (brush unless the walker crashes/slips through, plus static colliders). */
  blockedAt(tx, tz, throughBrush = false) {
    if (!this.inBounds(tx, tz)) return true;
    if (this.objGrid[tz * this.size + tx] || this.deep[tz * this.size + tx]) return true;
    return !throughBrush && this.brushAt(tx, tz) >= BRUSH.thicket;
  }

  /** Terrain level under a world point (the higher-weighted vertex). */
  levelAt(x, z) {
    const V = this.size + 1;
    const vx = Math.max(0, Math.min(this.size, Math.round(x))), vz = Math.max(0, Math.min(this.size, Math.round(z)));
    return this.w.level[vz * V + vx];
  }

  /**
   * Movement multiplier: shallow water and mud drag, ferns snag (not `brushFree` bodies: skitters, razorbacks).
   * `fernDrag` scales the fern slow (the player's Tapir-hide Boots relic: 0.5 → ferns ×0.75 instead of ×0.5).
   */
  speedAt(x, z, brushFree = false, fernDrag = 1) {
    const lv = this.levelAt(x, z);
    let m = lv === LEVEL.water ? GROUND.shallow : lv === LEVEL.mud ? GROUND.mud : 1;
    if (!brushFree && this.inFern(x, z)) m *= 1 - (1 - GROUND.fern) * fernDrag;
    return m;
  }

  /** Standing in uncut ferns? */
  inFern(x, z) { return this.brushAt(Math.floor(x), Math.floor(z)) === BRUSH.fern; }

  /** Canopy shade 0..1 at a point (1 = deep shade) — for sprites' lighting on the CPU. */
  shadeAt(x, z) {
    const tx = Math.max(0, Math.min(this.size - 1, Math.floor(x))), tz = Math.max(0, Math.min(this.size - 1, Math.floor(z)));
    return this.shade[tz * this.size + tx] / 255;
  }

  // ================================================================== colliders

  _buildColliders() {
    const W = this.size;
    this.colGrid = new Map();               // tile index → [collider]
    this.objGrid = new Uint8Array(W * W);   // tiles whose centre is (nearly) inside a footprint: flow fields avoid them
    this.opaqueGrid = new Uint8Array(W * W);
    this.colliders = [];
    for (const o of this.w.objects) this.addCollider(o, objectEntry(o, this.atlas)?.key);
    for (const p of this.w.pylons) this.addCollider({ kind: 'prop', type: 'pylon', x: p.x, z: p.z, id: p.id });
  }

  /**
   * Make an object solid. Footprint from SOLID (src/data/jungle.js): by `artKey` (the sprite drawn for it),
   * else by kind_type, else a circle of radius o.r. Returns the collider or null.
   */
  addCollider(o, artKey) {
    const col = footprint(o, artKey);
    if (!col) return null;
    col.obj = o;
    const x0 = col.x0 - col.rr, x1 = col.x1 + col.rr, z0 = col.z0 - col.rr, z1 = col.z1 + col.rr;
    col.bounds = [x0, z0, x1, z1];
    const W = this.size;
    for (let tz = Math.floor(z0); tz <= Math.floor(z1); tz++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      if (!this.inBounds(tx, tz)) continue;
      const i = tz * W + tx;
      if (!this.colGrid.has(i)) this.colGrid.set(i, []);
      this.colGrid.get(i).push(col);
      if (inFootprint(col, tx + 0.5, tz + 0.5, SOLID.tilePad)) {
        this.objGrid[i] = 1;
        if (col.opaque) this.opaqueGrid[i] = 1;
      }
    }
    this.colliders.push(col);
    if (this._dbg) this.showColliders(true);
    return col;
  }

  /** Static colliders overlapping a circle's neighbourhood. */
  collidersNear(x, z, r) {
    const out = this._near || (this._near = []);
    out.length = 0;
    const W = this.size;
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      const l = this.colGrid.get(tz * W + tx);
      if (l) for (const c of l) if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  /**
   * Move a circle by (dx, dz) with sliding, in small steps (no tunnelling). opts.throughBrush lets a
   * body ignore brush tiles (Skitters slip through); opts.solid(tx, tz) replaces the tile test (the Thorn Stalker
   * keeps under the brush). opts.hit, if given, is filled with what stopped it last: { obj: collider } or
   * { obj: null, tx, tz } (a tile). opts.nudge (the player, CONFIG.player.nudge): walking head-on into a footprint
   * or a brush tile whose edge is close to one side steers round it (critic I #10). Returns true if anything was hit.
   */
  moveBody(p, dx, dz, r, opts = {}) {
    const dist = Math.max(Math.abs(dx), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const sx = dx / steps, sz = dz / steps;
    let hit = false;
    const solid = opts.solid || (opts.throughBrush ? (tx, tz) => this.wetAt(tx, tz) : (tx, tz) => this.solidAt(tx, tz));
    const info = opts.hit || null;
    const px0 = p.x, pz0 = p.z;
    for (let s = 0; s < steps; s++) {
      p.x += sx; p.z += sz;
      for (let it = 0; it < 2; it++) {
        let moved = false;
        // Tiles.
        const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
        for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
          if (!solid(tx, tz)) continue;
          if (pushOutBox(p, r, tx, tz, tx + 1, tz + 1)) {
            hit = moved = true;
            if (info) { info.obj = null; info.tx = tx; info.tz = tz; }
            if (opts.onBrush && this.brushAt(tx, tz) >= BRUSH.thicket) opts.onBrush(tx, tz);
          }
        }
        // Objects.
        for (const c of this.collidersNear(p.x, p.z, r + 0.1)) if (pushOut(p, r, c)) { hit = moved = true; if (info) info.obj = c; }
        if (!moved) break;
      }
    }
    if (hit && opts.nudge) this._nudge(p, dx, dz, r, px0, pz0, solid, opts);
    return hit;
  }

  /**
   * Corner nudge (moveBody opts.nudge): if the move was mostly blocked by a footprint (or a solid tile) hit nearly
   * head-on (input within N.cone° of its surface normal) and its edge is within N.edge (tiles: N.tileEdge) of your
   * centre to one side, and the way round is open, slide toward that edge at up to N.speed × the attempted move.
   */
  _nudge(p, dx, dz, r, px0, pz0, solid, opts) {
    const N = opts.nudge;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return;
    const ux = dx / len, uz = dz / len;
    if (((p.x - px0) * ux + (p.z - pz0) * uz) / len > 0.6) return;   // most of the move went through: sliding works
    const cone = Math.cos((N.cone * Math.PI) / 180);
    const tx = -uz, tz = ux;   // across the input
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    let best = null;
    const consider = (cx, cz, nd, half, s, edge) => {
      if (nd < 1e-6) return;
      if (-((p.x - cx) * ux + (p.z - cz) * uz) / nd < cone) return;   // not head-on: sliding already handles it
      const gap = half - Math.abs(s);   // sideways step to clear it (`half` includes the body radius)
      if (gap <= 0 || gap - r > edge) return;
      if (!best || gap < best.gap) best = { gap, side: s >= 0 ? 1 : -1 };
    };
    for (const c of this.collidersNear(p.x + ux * 0.2, p.z + uz * 0.2, r + 0.3)) {
      const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
      const nd = Math.hypot(p.x - cx, p.z - cz);
      if (nd > r + c.rr + 0.04) continue;
      const half = ((c.x1 - c.x0) / 2) * Math.abs(tx) + ((c.z1 - c.z0) / 2) * Math.abs(tz) + c.rr + r;
      consider(cx, cz, nd, half, (p.x - (c.x0 + c.x1) / 2) * tx + (p.z - (c.z0 + c.z1) / 2) * tz, N.edge);
    }
    const ax = Math.floor(p.x + ux * (r + 0.06)), az = Math.floor(p.z + uz * (r + 0.06));
    if (solid(ax, az)) {
      const cx = clamp(p.x, ax, ax + 1), cz = clamp(p.z, az, az + 1);
      const half = 0.5 * Math.abs(tx) + 0.5 * Math.abs(tz) + r;
      consider(cx, cz, Math.hypot(p.x - cx, p.z - cz), half, (p.x - ax - 0.5) * tx + (p.z - az - 0.5) * tz, N.tileEdge);
    }
    if (!best) return;
    // Only when the way round is open (not a wall of trunks or brush).
    const qx = p.x + tx * best.side * (best.gap + 0.05) + ux * 0.15, qz = p.z + tz * best.side * (best.gap + 0.05) + uz * 0.15;
    if (this.blockedCircle(qx, qz, r * 0.95, !!opts.throughBrush)) return;
    const step = Math.min(best.gap + 0.02, len * N.speed);
    this.moveBody(p, tx * best.side * step, tz * best.side * step, r, { throughBrush: opts.throughBrush, solid: opts.solid });
  }

  /** True if a circle at (x, z) overlaps anything solid. */
  blockedCircle(x, z, r, throughBrush = false) {
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (throughBrush ? this.wetAt(tx, tz) : this.solidAt(tx, tz)) {
        const cx = Math.max(tx, Math.min(x, tx + 1)), cz = Math.max(tz, Math.min(z, tz + 1));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      }
    }
    for (const c of this.collidersNear(x, z, r)) if (inFootprint(c, x, z, r * 0.9)) return true;
    return false;
  }

  /** Line of sight between two points (thickets and walls block). */
  lineOfSight(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) return true;
    const n = Math.ceil(len * 3);
    let last = -1;
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      const ti = Math.floor(z) * this.size + Math.floor(x);
      if (ti === last) continue;
      last = ti;
      if (this.opaqueAt(Math.floor(x), Math.floor(z))) return false;
    }
    return true;
  }

  // ================================================================== cutting

  /**
   * The machete hits tile (tx, tz) with `power` (1 slash, 2 heavy chop). Thickets and ferns fall to
   * any hit; brambles need a chop (or three slashes). Returns the brush type cut, or 0.
   */
  hitBrush(tx, tz, power) {
    const b = this.brushAt(tx, tz);
    if (!b) return 0;
    const i = tz * this.size + tx;
    if (b === BRUSH.bramble && power < 2) {
      this._bramble = this._bramble || new Map();
      const n = (this._bramble.get(i) || 0) + 1;
      this._bramble.set(i, n);
      if (n < 3) return -1;   // nicked, not cleared
    }
    this.cut[i] = 1;
    this._dirty(tx, tz);
    return b;
  }

  /** Let undergrowth regrow (called between days). */
  static regrow(world, cut, seed) {
    const W = world.size;
    for (let i = 0; i < W * W; i++) {
      if (!cut[i] || world.trail[i] || world.site[i] >= 0) continue;
      if (hash2(i % W, Math.floor(i / W), seed) < JUNGLE.regrowth) cut[i] = 0;
    }
  }

  _dirty(tx, tz) {
    const ch = this.chunks.get(this._key(Math.floor(tx / C), Math.floor(tz / C)));
    if (ch) ch.dirtyCards = true;
  }

  // ================================================================== canopy shade

  _buildShade() {
    const W = this.size;
    const f = new Float32Array(W * W);
    const add = (x, z, r, s) => {
      for (let tz = Math.floor(z - r); tz <= Math.ceil(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) {
        if (!this.inBounds(tx, tz)) continue;
        const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z) / r;
        if (d < 1) f[tz * W + tx] += s * (1 - d * d);
      }
    };
    for (const o of this.w.objects) {
      if (o.kind !== 'tree') continue;
      // Canopies sit north of the trunk on screen; their shadow falls a little north too.
      const r = o.big ? 4.6 : o.type === 'palm' ? 2.4 : o.type === 'dead' ? 2 : 3.4;
      add(o.x, o.z - 1.2, r, o.type === 'dead' ? 0.45 : 0.9);
    }
    for (let i = 0; i < W * W; i++) if (this.w.brush[i] >= BRUSH.thicket) f[i] += 0.25;
    // Blur twice (3 × 3 box).
    let a = f, b = new Float32Array(W * W);
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= W) continue;
          s += a[zz * W + xx]; n++;
        }
        b[z * W + x] = s / n;
      }
      [a, b] = [b, a];
    }
    this.shade = new Uint8Array(W * W);
    // Walkable open ground (trails, site clearings) is spared most of the canopy shade (critic H #2): a soft
    // mask (one 3 x 3 blur) so the lit path has a rounded edge, not the tile grid.
    const walk = new Float32Array(W * W), walk2 = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) walk[i] = (this.w.trail[i] || this.w.site[i] >= 0) && this.w.brush[i] < BRUSH.thicket ? 1 : 0;
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= W || zz >= W) continue;
        s += walk[zz * W + xx]; n++;
      }
      walk2[z * W + x] = Math.max(walk[z * W + x] * 0.85, s / n);
    }
    const rg = new Uint8Array(W * W * 2);
    const cx = this.w.center.x, cz = this.w.center.z;
    for (let i = 0; i < W * W; i++) {
      const x = i % W, z = Math.floor(i / W);
      let v = Math.min(1, a[i] * 0.9);
      // Water and the Relay clearing open the sky.
      if (this.w.level[z * (W + 1) + x] === LEVEL.water) v *= 0.35;
      const dc = Math.hypot(x - cx, z - cz);
      if (dc < JUNGLE.relayClearing + 2) v *= Math.max(0, (dc - JUNGLE.relayClearing + 4) / 6);
      this.shade[i] = Math.round(v * 255);
      rg[i * 2] = this.shade[i];
      rg[i * 2 + 1] = Math.round(v * (1 + (ATMOS.trailShade - 1) * walk2[i]) * 255);
    }
    // R = full canopy density (cards, CPU queries), G = with the trail spared (ground): PostFx picks per pixel.
    const tex = new THREE.DataTexture(rg, W, W, THREE.RGFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * District colour grade (critic H #3): each region's REGION_LOOK.grade multiplier (the Relay clearing stays
   * neutral), box-blurred over ATMOS.gradeBlur tiles so it blends across borders. RGBA8, value / 2 (PostFx x 2).
   */
  _buildGrade() {
    const W = this.size, keys = this.w.districts || [];
    let r = new Float32Array(W * W), g = new Float32Array(W * W), b = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) {
      const k = this.w.region[i];
      const gr = (k >= 0 && REGION_LOOK[keys[k]]?.grade) || [1, 1, 1];
      r[i] = gr[0]; g[i] = gr[1]; b[i] = gr[2];
    }
    const R = Math.max(1, Math.round(ATMOS.gradeBlur / 2));
    const blur = (src) => {
      // Two separable box passes (about a tent of radius 2R).
      let a = src;
      const t = new Float32Array(W * W);
      for (let pass = 0; pass < 2; pass++) {
        for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let d = -R; d <= R; d++) { const xx = x + d; if (xx >= 0 && xx < W) { s += a[z * W + xx]; n++; } }
          t[z * W + x] = s / n;
        }
        const o = new Float32Array(W * W);
        for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let d = -R; d <= R; d++) { const zz = z + d; if (zz >= 0 && zz < W) { s += t[zz * W + x]; n++; } }
          o[z * W + x] = s / n;
        }
        a = o;
      }
      return a;
    };
    r = blur(r); g = blur(g); b = blur(b);
    const data = new Uint8Array(W * W * 4);
    const enc = (v) => Math.max(0, Math.min(255, Math.round((v / 2) * 255)));
    for (let i = 0; i < W * W; i++) { data[i * 4] = enc(r[i]); data[i * 4 + 1] = enc(g[i]); data[i * 4 + 2] = enc(b[i]); data[i * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ================================================================== chunks

  _key(cx, cz) { return cz * 1000 + cx; }

  /** Keep the chunks around (x, z) live; bake ahead in the background. Call every frame. */
  update(dt, focusX, focusZ) {
    this.time += dt;
    this.cardMat.uniforms.uTime.value = this.time;
    const ccx = Math.floor(focusX / C), ccz = Math.floor(focusZ / C);
    const R = JUNGLE.activeRadius;
    const want = new Set();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= this.nChunks || cz >= this.nChunks) continue;
      want.add(this._key(cx, cz));
      if (!this.chunks.has(this._key(cx, cz))) this._buildChunk(cx, cz);
    }
    for (const [k, ch] of this.chunks) if (!want.has(k)) this._dropChunk(k, ch);
    for (const ch of this.chunks.values()) if (ch.dirtyCards) this._buildCards(ch);
    // Background baking: one chunk per frame within the prebake ring.
    const PR = JUNGLE.prebakeRadius;
    for (let dz = -PR; dz <= PR; dz++) for (let dx = -PR; dx <= PR; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= this.nChunks || cz >= this.nChunks) continue;
      if (!this.bakeCache.has(this._key(cx, cz))) { this._bake(cx, cz); return; }
    }
  }

  /** Bake everything around a point right away (on scene entry, behind the loading beat). */
  warm(x, z) {
    const ccx = Math.floor(x / C), ccz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx >= 0 && cz >= 0 && cx < this.nChunks && cz < this.nChunks) this._bake(cx, cz);
    }
    this.update(0, x, z);
  }

  /**
   * The baked ground under a rectangle of world texels (32 per tile; x east, z south) as RGBA bytes, w × h, or null
   * when a chunk under it isn't baked (Fx.decal stains splats into it, critic H2 §7).
   */
  groundPatch(tx, tz, w, h) {
    const CP = C * 32, out = new Uint8ClampedArray(w * h * 4);
    for (let cz = Math.floor(tz / CP); cz <= Math.floor((tz + h - 1) / CP); cz++) {
      for (let cx = Math.floor(tx / CP); cx <= Math.floor((tx + w - 1) / CP); cx++) {
        const cv = this.bakeCache.get(this._key(cx, cz));
        if (!cv) return null;
        const x0 = Math.max(tx, cx * CP), x1 = Math.min(tx + w, (cx + 1) * CP);
        const z0 = Math.max(tz, cz * CP), z1 = Math.min(tz + h, (cz + 1) * CP);
        const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(x0 - cx * CP, z0 - cz * CP, x1 - x0, z1 - z0).data;
        const rw = (x1 - x0) * 4;
        for (let y = 0; y < z1 - z0; y++) out.set(d.subarray(y * rw, (y + 1) * rw), ((z0 - tz + y) * w + (x0 - tx)) * 4);
      }
    }
    return out;
  }

  _bake(cx, cz) {
    const k = this._key(cx, cz);
    let canvas = this.bakeCache.get(k);
    if (canvas) return canvas;
    if (this.bakeCache.size >= JUNGLE.bakeCache) {
      // Evict the oldest chunk that isn't live; reuse its canvas.
      for (const [ok, c] of this.bakeCache) if (!this.chunks.has(ok)) { this.bakeCache.delete(ok); canvas = c; break; }
    }
    canvas = this.baker.bake(cx, cz, canvas);
    this.bakeCache.set(k, canvas);
    return canvas;
  }

  _buildChunk(cx, cz) {
    const canvas = this._bake(cx, cz);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(this.groundGeom, this._groundMaterial(tex));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx * C + C / 2, 0, cz * C + C / 2);
    ground.renderOrder = -10;
    ground.userData.noSnap = true;
    this.three.add(ground);
    const ch = { cx, cz, ground, cards: null, dirtyCards: true };
    this.chunks.set(this._key(cx, cz), ch);
    this._buildCards(ch);
  }

  /**
   * Ground material: the baked canvas, plus the PostFx light code: texels the baker marked emissive (glow
   * fungus, alpha < 0.9 in the canvas, TerrainBaker._markEmissive) write alpha 0 so they glow at night.
   */
  _groundMaterial(tex) {
    const m = new THREE.MeshBasicMaterial({ map: tex });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <opaque_fragment>', 'float vrEmit = diffuseColor.a;\n#include <opaque_fragment>\ngl_FragColor.a = vrEmit < 0.9 ? 0.0 : 1.0;');
    };
    m.customProgramCacheKey = () => 'vr-ground';
    return m;
  }

  _dropChunk(k, ch) {
    ch.ground.removeFromParent();
    ch.ground.material.map.dispose();
    ch.ground.material.dispose();
    if (ch.cards) { ch.cards.removeFromParent(); ch.cards.geometry.dispose(); }
    this.chunks.delete(k);
  }

  /** (Re)build the merged card mesh for a chunk. */
  _buildCards(ch) {
    ch.dirtyCards = false;
    const cards = chunkCards(this.w, this.atlas, this.cut, ch.cx * C, ch.cz * C, C, C);
    ch.cards?.removeFromParent();
    ch.cards?.geometry.dispose();
    ch.cards = cards.length ? cardMesh(cards, this.atlas, this.cardMat) : null;
    ch.cardList = cards;   // for coveredAt
    if (ch.cards) this.three.add(ch.cards);
  }

  /** Player position for the x-ray window (internal pixels, GL convention y up). */
  setPlayer(px, py, z, x, vis) {
    this.cardMat.uniforms.uPlayerPx.value.set(px, py);
    this.cardMat.uniforms.uPlayerZ.value = z;
    // Player outline (critic G #1): pale while brush or a tall object is around / in front of the player.
    // vis.userData.outlineOverride: a brief rim colour the Player sets (the cyan perfect-dodge flash, critic I #7).
    if (vis && x !== undefined) setOutline(vis, vis.userData.outlineOverride || (this.coveredAt(x, z) ? ATMOS.playerOutline.cover : ATMOS.playerOutline.open));
  }

  /**
   * Is the player at (x, z) actually covered by a card (critic H #10)? Samples a grid of points over the
   * player's body box (ATMOS.playerOutline.body, texels around the feet) against the opaque texels of every
   * upright card standing in front of it (atlas alpha). The card mask keeps those texels off the player, so
   * this is "would be hidden": the outline turns cyan only then, with a little hysteresis (hits.on / off).
   */
  coveredAt(x, z) {
    const O = ATMOS.playerOutline, B = O.body;
    if (!this._atlasData) {
      const cv = this.atlas.canvas;
      this._atlasData = { d: this.atlas.g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width };
    }
    const AD = this._atlasData.d, AW = this._atlasData.w;
    const near = this._covNear || (this._covNear = []);
    near.length = 0;
    const ccx = Math.floor(x / C), ccz = Math.floor(z / C);
    for (let dz = 0; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.chunks.get(this._key(ccx + dx, ccz + dz));
      if (!ch?.cardList) continue;
      for (const c of ch.cardList) {
        const e = c.e;
        if (c.z <= z + 0.06 || e.ay <= 0) continue;
        // Its upright part must reach the body's rows and columns.
        const left = c.x - e.ax / 32;
        if (left > x + B.half / 32 || left + e.w / 32 < x - B.half / 32) continue;
        if ((c.z - z) * 32 > e.ay - B.low) continue;
        near.push(c);
      }
    }
    let hits = 0;
    if (near.length) {
      for (let hy = B.low; hy <= B.high; hy += B.step) {
        for (let sx = -B.half; sx <= B.half; sx += B.step) {
          const X = x + sx / 32;
          for (const c of near) {
            const e = c.e;
            const r = Math.floor(e.ay - ((c.z - z) * 32 + hy));
            if (r < 0 || r >= e.ay) continue;
            let u = Math.floor((X - (c.x - e.ax / 32)) * 32);
            if (u < 0 || u >= e.w) continue;
            // Brush over open trail ground is see-through there (card shader): it covers nothing.
            if (c.kind === 1 && (c.z - (z - hy / 32)) > ATMOS.trailXray.foot && this._trailClear(X, z - hy / 32)) continue;
            if (c.flip) u = e.w - 1 - u;
            if (AD[((e.y + r) * AW + e.x + u) * 4 + 3] > 127) { hits++; break; }
          }
        }
      }
    }
    this._covered = this._covered ? hits >= O.hits.off : hits >= O.hits.on;
    this._coverHits = hits;
    return this._covered;
  }

  /** Debug: outline every footprint (yellow), deep water (blue) and fords (cyan) on the ground. */
  showColliders(on = true) {
    this._dbg?.removeFromParent();
    this._dbg?.geometry.dispose();
    this._dbg?.material.dispose();
    this._dbg = null;
    if (!on) return;
    const pos = [], col = [];
    const seg = (ax, az, bx, bz, c) => { pos.push(ax, 0.03, az, bx, 0.03, bz); col.push(...c, ...c); };
    const Y = [1, 0.9, 0.2], B = [0.2, 0.4, 1], F = [0.3, 1, 1];
    for (const c of this.colliders) {
      // Rounded box: the inner box's sides pushed out by rr, plus quarter circles at the corners.
      const { x0, z0, x1, z1, rr } = c;
      if (x1 > x0) { seg(x0, z0 - rr, x1, z0 - rr, Y); seg(x0, z1 + rr, x1, z1 + rr, Y); }
      if (z1 > z0) { seg(x0 - rr, z0, x0 - rr, z1, Y); seg(x1 + rr, z0, x1 + rr, z1, Y); }
      const n = 6;
      for (const [cx, cz, a0] of [[x1, z1, 0], [x0, z1, Math.PI / 2], [x0, z0, Math.PI], [x1, z0, Math.PI * 1.5]]) {
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * Math.PI / 2, b = a0 + ((k + 1) / n) * Math.PI / 2;
          seg(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, Y);
        }
      }
    }
    const W = this.size, ford = this.w.ford;
    for (let tz = 0; tz < W; tz++) for (let tx = 0; tx < W; tx++) {
      const i = tz * W + tx;
      if (this.deep[i]) { seg(tx + 0.1, tz + 0.1, tx + 0.9, tz + 0.9, B); seg(tx + 0.9, tz + 0.1, tx + 0.1, tz + 0.9, B); }
      else if (ford && ford[i]) { seg(tx + 0.2, tz + 0.5, tx + 0.8, tz + 0.5, F); seg(tx + 0.5, tz + 0.2, tx + 0.5, tz + 0.8, F); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
    m.renderOrder = 999;
    m.frustumCulled = false;
    m.userData.noSnap = true;
    this.three.add(m);
    this._dbg = m;
  }

  dispose() {
    this.showColliders(false);
    for (const [k, ch] of [...this.chunks]) this._dropChunk(k, ch);
    this.groundGeom.dispose();
    this.cardMat.dispose();
    this.atlas.texture.dispose();
    this.shadeTex.dispose();
    this.gradeTex.dispose();
    this.trailTex.dispose();
    this.w.brushNow = null;
  }
}

/**
 * The cards (undergrowth, cut debris, trees, ruins, rocks) whose ground point lies in the tile rect
 * [x0, x0 + w) × [z0, z0 + h) of a world. Deterministic: the same tile always gets the same sprites.
 */
export function chunkCards(world, A, cut, x0, z0, w, h) {
  const W = world.size;
  const cards = [];
  const snap = (v) => Math.round(v * 32) / 32;
  for (let tz = z0; tz < z0 + h; tz++) {
    for (let tx = x0; tx < x0 + w; tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W) continue;
      const i = tz * W + tx;
      const base = world.brush[i];
      if (!base) continue;
      const b = cut && cut[i] ? 0 : base;
      if (!b) {
        // Cut: leaf debris and a stub where it stood.
        const r = hash2(tx, tz, 71);
        if (r < 0.06 && base >= BRUSH.thicket) cards.push({ e: A.pick('cutstump', tx, tz, 1), x: snap(tx + 0.3 + hash2(tx, tz, 72) * 0.4), z: snap(tz + 0.55 + hash2(tx, tz, 73) * 0.3), sway: 0, flip: hash2(tx, tz, 74) < 0.5 });
        else if (r < 0.5) cards.push({ e: A.pick('debris', tx, tz, 1), x: snap(tx + 0.5 + (hash2(tx, tz, 72) - 0.5) * 0.4), z: snap(tz + 0.1 + hash2(tx, tz, 73) * 0.3), sway: 0, flip: hash2(tx, tz, 74) < 0.5 });
        continue;
      }
      const fam = b === BRUSH.fern ? (hash2(tx, tz, 5) < 0.08 ? 'mushroom' : 'fern') : b === BRUSH.bramble ? 'bramble' : (hash2(tx, tz, 6) < 0.18 ? 'vine' : 'thicket');
      const n = b === BRUSH.fern ? (hash2(tx, tz, 9) < 0.35 ? 2 : 1) : b === BRUSH.thicket ? 2 : 1 + (hash2(tx, tz, 9) < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const e = A.pick(fam, tx * 7 + k, tz, 13);
        if (!e) continue;
        // Distinct depth slots per card in a tile so overlapping leaves never z-fight.
        const zz = tz + 0.3 + ((k * 0.37 + hash2(tx, tz, 20 + k) * 0.3) % 0.68);
        cards.push({ e, x: snap(tx + 0.15 + hash2(tx, tz, 30 + k) * 0.7), z: snap(zz), sway: 1, flip: hash2(tx, tz, 40 + k) < 0.5, phase: tx * 0.7 + tz * 0.3, kind: 1 });
      }
    }
  }
  for (const o of world.objects) {
    if (o.x < x0 || o.x >= x0 + w || o.z < z0 || o.z >= z0 + h) continue;
    const e = objectEntry(o, A);
    if (!e) continue;
    cards.push({ e, x: o.x, z: o.z, sway: o.kind === 'tree' ? 0.6 : 0, flip: o.flip && o.kind !== 'ruin', phase: o.x * 0.5, kind: o.kind === 'tree' ? 2 : 3 });
  }
  return cards.filter((c) => c.e);
}

/** The atlas sprite drawn for a world object (tree / rock / ruin), or null. Its `key` picks the collider (SOLID.art). */
export function objectEntry(o, A) {
  let fam;
  if (o.kind === 'tree') fam = `tree_${o.type}`;
  else if (o.kind === 'rock') fam = o.type;
  else if (o.kind === 'ruin') fam = `ruin_${o.type}`;
  else return null;
  return A.pick(fam, Math.floor(o.x * 3), Math.floor(o.z * 3), 51) || A.pick('boulder', 1, 1);
}

/** One merged mesh of upright cards (see the file header). */
export function cardMesh(cards, atlas, material) {
  const n = cards.length * 2;   // up to two quads per card (upright + flat part)
  const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), card = new Float32Array(n * 4 * 4);
  const shade = new Float32Array(n * 4 * 3);   // aShade: kind, anchor row in the atlas, rows above it (card shader)
  const idx = [];
  let q = 0;
  const AS = atlas.canvas.width;
  const quad = (verts, uvs, attrs, sh = [0, 0, 0]) => {
    for (let v = 0; v < 4; v++) {
      pos.set(verts[v], (q * 4 + v) * 3);
      uv.set(uvs[v], (q * 4 + v) * 2);
      card.set(attrs[v], (q * 4 + v) * 4);
      shade.set(sh, (q * 4 + v) * 3);
    }
    const b = q * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    q++;
  };
  for (const c of cards) {
    const e = c.e;
    const left = c.x - e.ax / 32, right = left + e.w / 32;
    let u0 = e.x / AS, u1 = (e.x + e.w) / AS;
    if (c.flip) [u0, u1] = [u1, u0];
    const vTop = e.y / AS, vAnchor = (e.y + e.ay) / AS, vBot = (e.y + e.h) / AS;
    const hUp = (e.ay / 32) * CARD_SCALE;
    const ph = c.phase ?? 0;
    if (e.ay > 0) {
      quad(
        [[left, hUp, c.z], [right, hUp, c.z], [left, 0.002, c.z], [right, 0.002, c.z]],
        [[u0, vTop], [u1, vTop], [u0, vAnchor], [u1, vAnchor]],
        [[c.z, c.sway, ph, 1], [c.z, c.sway, ph, 1], [c.z, 0, ph, 1], [c.z, 0, ph, 1]],
        [c.kind || 3, e.y + e.ay, e.ay],
      );
    }
    if (e.h > e.ay) {
      const zb = c.z + (e.h - e.ay) / 32;
      quad(
        [[left, 0.004, c.z], [right, 0.004, c.z], [left, 0.004, zb], [right, 0.004, zb]],
        [[u0, vAnchor], [u1, vAnchor], [u0, vBot], [u1, vBot]],
        [[c.z, 0, ph, 0], [c.z, 0, ph, 0], [c.z, 0, ph, 0], [c.z, 0, ph, 0]],
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, q * 12), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, q * 8), 2));
  g.setAttribute('aCard', new THREE.BufferAttribute(card.subarray(0, q * 16), 4));
  g.setAttribute('aShade', new THREE.BufferAttribute(shade.subarray(0, q * 12), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.userData.noSnap = true;
  m.frustumCulled = false;
  return m;
}

/** Push circle p (radius r) out of the box [x0, z0]–[x1, z1]. */
function pushOutBox(p, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
  const ox = p.x - cx, oz = p.z - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x += (ox / d) * (r - d); p.z += (oz / d) * (r - d);
  } else {
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
  }
  return true;
}
