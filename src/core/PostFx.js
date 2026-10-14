// Screen-space lighting and grading for the jungle (and any scene that sets `scene.post`).
//
// The scene renders into a half-float target at the internal resolution; one full-screen pass then
//   · maps every pixel back to the ground point under it (ortho camera, 32 px per tile, no yaw) and
//     looks up canopy density there → dappled shade that drifts with the wind, quantised into a few
//     steps with a 4 × 4 Bayer dither (pixel-art light, no smooth gradients)
//   · darkens beyond the player's light radius (shrinks at dusk; dithered edge); at dusk/night a warm
//     lamp pool stays around the player while the rest of the jungle goes moonlit blue
//   · grades: the district colour grade (tGrade, world space, blended across region borders), the time of
//     day (golden hour → moonlight, timeOfDay()), +saturation, a hard-stepped vignette
// Shading applies to sprites too (a canopy shadow falls across anything standing under it).
//
// The target's ALPHA channel carries a per-pixel light code (critic H #2, #4), written by the materials:
//   a ≥ 1.5        an upright card (brush, trunk, canopy, ruin: JungleWorld card shader) → the full canopy
//                  shade (tShade.r); walkable ground uses the trail-spared shade (tShade.g) instead, so
//                  paths read lighter than the walls and the overhead
//   a ≈ 1          ordinary ground / sprite texel (normal blending of an opaque texel always writes 1)
//   a < 1          emissive / lit by (1 − a): glowing texels (eyes, screens, the Relay crystal, glow fungus,
//                  fireflies — Emissive.js, Ambience.js, TerrainBaker) and light pools (lightBlending) skip
//                  the canopy shade, the darkness and the vignette
// Every dither is anchored to WORLD pixels (focus × ppu), so patterns move with the ground instead of
// crawling over it like a shower door when the camera glides (critic H #5).
//
// Foreground leaves (uLeaves): whole hand-drawn silhouettes (fg_leaf_1..5, else procedural stand-ins)
// placed at the screen edges as pixel-exact quads after the composite, with a little lagging parallax
// and a whole-pixel sway (ATMOS.leafFrame.items). No per-pixel fade, so no checker band.

import * as THREE from 'three';
import { ATMOS } from '../data/jungle.js';

/** Alpha codes (see the header). */
export const LIGHT_CODE = { card: 2, normal: 1, emit: 0 };

/**
 * Additive light pool that also marks the pixels it lights (alpha ×= 1 − texel alpha), so PostFx keeps them
 * out of the canopy shade and the dark: the pool reads at night and under the canopy. Colour adds
 * `material.color × texel.rgb` (opacity is ignored for colour; scale the colour instead).
 */
export function lightBlending(mat) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

/** Blending for an emissive mask draw: colour untouched, alpha set to 0 (fully emissive) where it draws. */
export function emitBlending(mat) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.ZeroFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.ZeroFactor;
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

let neutralGrade = null;
function neutralGradeTex() {
  if (neutralGrade) return neutralGrade;
  neutralGrade = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  neutralGrade.needsUpdate = true;
  return neutralGrade;
}

export class PostFx {
  constructor(game) {
    this.game = game;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true,
      stencilBuffer: true,   // the player's card mask (Assets.js addOutline)
    });
    const C = ATMOS.cycle;
    this.uniforms = {
      tScene: { value: this.target.texture },
      tShade: { value: null },
      tGrade: { value: neutralGradeTex() },
      uRes: { value: new THREE.Vector2(4, 4) },
      uFocus: { value: new THREE.Vector2() },
      uWorld: { value: 192 },
      uPpu: { value: 32 },
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector2() },     // internal px, y down
      uLightR: { value: ATMOS.lightRadius[0] * 32 },
      uDark: { value: 0 },                          // 0 day → 1 night (light radius matters more)
      uAmbient: { value: ATMOS.dayAmbient },
      uShadeK: { value: 1 - ATMOS.canopyShade },
      uCardK: { value: ATMOS.cardShade },
      uDapple: { value: ATMOS.dapple },
      uDappleScale: { value: ATMOS.dappleScale },
      uWind: { value: ATMOS.wind },
      uVignette: { value: ATMOS.vignette },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: new THREE.Vector3(...ATMOS.shadowLift) },
      uGradeK: { value: 1 },
      uGradeLift: { value: ATMOS.gradeLift },
      uLamp: { value: 0 },                          // lamp pool strength (dusk/night)
      uLampR: { value: new THREE.Vector2(...C.lamp.r) },
      uLampLevel: { value: C.lamp.level },
      uLampTint: { value: new THREE.Color(...C.lamp.tint) },
      uEmit: { value: C.emit },
      uMoonFloor: { value: 0 },                     // night: the moonlight never drops below this
      uNightLift: { value: new THREE.Vector3() },   // night: navy lift into the blacks outside the lamp
      uHurt: { value: 0 },
      uLeaves: { value: 0 },                        // 0 = off; 1 = foreground leaves frame the view
      // Weather (src/world/Weather.js, src/data/weather.js): a tint over the view, a dithered veil (fog / heat haze)
      // thickening away from the player, and 1-px rain streaks (RAIN_LOOK packed into uRainK / uRainCol).
      uWTint: { value: new THREE.Vector3(1, 1, 1) },
      uFog: { value: 0 },
      uFogCol: { value: new THREE.Vector3(0.6, 0.66, 0.64) },
      uFogR: { value: new THREE.Vector2(0.3, 1.05) },        // the veil runs from x to y × the light radius
      uFogNight: { value: new THREE.Vector3(0.3, 0.3, 0.3) },  // × the veil's moonlight at full night (critic H2 §1)
      uHeat: { value: 0 },                                    // heat shimmer: share of far bands that wobble (0 = off)
      uHeatK: { value: new THREE.Vector4(11, 14, 37, 0.35) }, // band period (px), drift (px/s), segment (px), from (× light r)
      uRain: { value: 0 },
      uRainK: { value: new THREE.Vector4(6, 7, 420, 3) },    // gap, len, speed (px/s), slant (px down per px left)
      uRainP: { value: new THREE.Vector3(46, 80, 0.42) },    // period min / max (px), mix
      uRainCol: { value: new THREE.Vector3(0.78, 0.86, 0.94) },
    };
    this.lightMult = 1;   // × the light radius (fog)
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tShade;
        uniform sampler2D tGrade;
        uniform vec2 uRes, uFocus, uPlayer, uLampR;
        uniform float uWorld, uPpu, uTime, uLightR, uDark, uAmbient, uShadeK, uCardK, uDapple, uDappleScale, uWind, uVignette, uHurt;
        uniform float uGradeK, uGradeLift, uLamp, uLampLevel, uEmit, uMoonFloor;
        uniform vec3 uTint, uLift, uLampTint, uNightLift;
        uniform vec3 uWTint, uFogCol, uRainP, uRainCol;
        uniform vec2 uFogR;
        uniform float uFog, uRain, uHeat;
        uniform vec3 uFogNight;
        uniform vec4 uRainK, uHeatK;
        varying vec2 vUv;
        const float BAYER[16] = float[16](0.03125,0.53125,0.15625,0.65625,0.78125,0.28125,0.90625,0.40625,0.21875,0.71875,0.09375,0.59375,0.96875,0.46875,0.84375,0.34375);
        float bayer4(vec2 p){ int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); return BAYER[y * 4 + x]; }
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);        // internal px, y down
          vec2 ground = uFocus + (px - uRes * 0.5) / uPpu;                 // tile coords under the pixel
          vec2 suv = vUv;
          if (uHeat > 0.0) {
            // Heat shimmer (critic H2 §1: the haze was invisible at ×2): away from you, thin world-anchored row bands
            // drift upward and shift the picture one whole pixel left / right in short segments — pixel-exact.
            float far = smoothstep(uLightR * uHeatK.w, uLightR * (uHeatK.w + 0.45), length((px - uPlayer) * vec2(1.0, 1.25)));
            vec2 hw = floor(px) + floor(uFocus * uPpu + 0.5);
            float row = hw.y + floor(uTime * uHeatK.y);
            float band = mod(row, uHeatK.x);
            float s = band < 1.0 ? 1.0 : (band >= 3.0 && band < 4.0 ? -1.0 : 0.0);
            float on = step(h21(vec2(floor(row / uHeatK.x), floor(hw.x / uHeatK.z))), uHeat * far);
            suv.x += s * on / uRes.x;
          }
          vec4 sc = texture2D(tScene, suv);
          vec3 col = sc.rgb;
          float card = step(1.5, sc.a);
          float emit = sc.a < 0.98 ? clamp(1.0 - sc.a, 0.0, 1.0) : 0.0;  // emissive / lit share
          // World-anchored dither: the pattern sticks to the ground, not to the screen.
          float b = bayer4(floor(floor(px) + uFocus * uPpu + 0.5));

          // District grade (albedo): multiplier from tGrade (× 2 encoded), with a matching lift in the shadows.
          vec3 g = texture2D(tGrade, ground / uWorld).rgb * 2.0;
          g = mix(vec3(1.0), g, uGradeK);
          float lum0 = dot(col, vec3(0.299, 0.587, 0.114));
          float shadowK = 1.0 - smoothstep(0.0, 0.3, lum0);
          col = col * g + ((g - 1.0) * uGradeLift + uLift) * shadowK;

          // Canopy shade with drifting sun dapples, quantised to 6 steps. Walkable ground takes the trail-spared
          // density (tShade.g), cards the full one (tShade.r) and are a touch darker still (uCardK).
          vec2 sh = texture2D(tShade, ground / uWorld).rg;
          float canopy = mix(sh.g, sh.r, card);
          vec2 dp = ground * uDappleScale + vec2(uTime * uWind, uTime * uWind * 0.6);
          float dap = vnoise(dp) * 0.65 + vnoise(dp * 2.3 + 7.1) * 0.35;
          float sun = smoothstep(0.52, 0.78, dap);                          // patches of direct sun
          float light = mix(1.0, uShadeK, canopy) + sun * uDapple * canopy;
          light *= mix(1.0, uCardK, card);
          light = floor(light * 6.0 + b) / 6.0;
          light *= uAmbient;

          // Darkness beyond the light radius (dusk/night shrink it).
          float d = length((px - uPlayer) * vec2(1.0, 1.25));
          float fall = smoothstep(uLightR * 0.55, uLightR, d);
          float dark = fall * mix(0.32, 0.88, uDark);
          dark = floor(dark * 5.0 + b) / 5.0;
          light *= 1.0 - dark;
          // The lamp: a warm pool around the player once the sun is down (stepped, dithered edge).
          float lamp = (1.0 - smoothstep(uLightR * uLampR.x, uLightR * uLampR.y, d)) * uLamp;
          lamp = floor(lamp * 4.0 + b) / 4.0;
          vec3 lit = mix(vec3(max(light, uMoonFloor)) * uTint, vec3(max(light, uLampLevel * mix(1.0, uShadeK, canopy * 0.5))) * uLampTint, lamp);
          // Emissive texels and light pools keep their own colour (a touch brighter), whatever the hour.
          lit = mix(lit, vec3(uEmit), emit);
          col *= lit;
          col += uNightLift * (1.0 - lamp) * (1.0 - emit);     // moonlit navy instead of black

          // Grade: a touch more saturation, warmth into the highlights.
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(lum), col, 1.18);
          col *= mix(vec3(1.0), vec3(1.06, 1.02, 0.92), smoothstep(0.35, 0.9, lum));

          // Weather (Weather.js): tint, then a veil that thickens away from you in 5 dithered steps (drifting, lumpy,
          // lit like the ground under it), then rain streaks — 1-px lines anchored to world pixels, leaning left.
          col *= uWTint;
          if (uFog > 0.0) {
            float fd = smoothstep(uLightR * uFogR.x, uLightR * uFogR.y, d);
            float fn = vnoise(ground * 0.14 + vec2(uTime * 0.05, uTime * 0.021));
            // Emissives (eyes, fireflies, the crystal, lamps) stay above the veil.
            float fk = clamp(uFog * fd * (0.7 + 0.6 * fn), 0.0, 1.0) * (1.0 - emit);
            fk = floor(fk * 5.0 + b) / 5.0;
            // After dark the veil is lit by the night itself (critic H2 §1: it was a grey wash brighter than the night):
            // the moonlight (and the lamp near you) × uFogNight, over the navy lift — dim, blue, never a grey sheet.
            float nk = smoothstep(0.15, 0.75, uDark);
            vec3 fogLit = mix(max(lit, vec3(0.3)), lit * uFogNight, nk);
            col = mix(col, uFogCol * fogLit + uNightLift * nk, fk);
          }
          if (uRain > 0.0) {
            vec2 wp = floor(px) + floor(uFocus * uPpu + 0.5);
            float u = wp.x + floor(wp.y / uRainK.w);
            float lane = floor(u / uRainK.x);
            if (mod(u, uRainK.x) < 0.5) {
              float h = h21(vec2(lane, 7.31));
              float per = floor(mix(uRainP.x, uRainP.y, h));
              float fy = mod(wp.y - uTime * uRainK.z * (0.85 + 0.3 * h) + h * 997.0, per);
              if (fy < uRainK.y && h21(vec2(lane, floor((wp.y - uTime * uRainK.z * (0.85 + 0.3 * h) + h * 997.0) / per))) < uRain)
                col = mix(col, uRainCol * max(lit, vec3(0.45)), uRainP.z);
            }
          }
          // Vignette: hard steps, no dither (critic H #5); emissives ignore it. Hurt pulse.
          vec2 q = vUv - 0.5;
          float v = smoothstep(0.32, 0.78, length(q * vec2(1.0, 0.85)));
          v = floor(v * 4.0) / 4.0;
          col *= 1.0 - v * uVignette * (1.0 - emit);
          col = mix(col, vec3(0.55, 0.05, 0.05), uHurt * v);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.leaves = null;
    this._lag = null;
    this._t = 0;
  }

  /** Hook the world's lighting textures: canopy shade (R full, G trail-spared) and the district grade. */
  setWorld(world) {
    this.uniforms.tShade.value = world.shadeTex;
    this.uniforms.tGrade.value = world.gradeTex || neutralGradeTex();
    this.uniforms.uWorld.value = world.size;
  }

  /**
   * Time of day → light uniforms (critic H #4). `dayFrac` = share of the daylight gone (0..1+),
   * `dusk` = 0 at sunset → 1 at full dark. Golden hour: the light warms toward ATMOS.cycle.gold over the
   * last stretch of the day and the shade deepens ("longer shadows"); through dusk it turns into moonlight
   * (cold blue, dim), and a warm lamp pool stays around the player.
   */
  timeOfDay(dayFrac, dusk) {
    const C = ATMOS.cycle, U = this.uniforms;
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const gold = ss(C.goldFrom, 1, dayFrac) * (1 - ss(C.goldDusk[0], C.goldDusk[1], dusk));
    const night = ss(C.night[0], C.night[1], dusk);
    const t = U.uTint.value;
    const g = (this._gold ||= new THREE.Color(C.gold));
    t.setRGB(1 + (g.r - 1) * C.goldK * gold, 1 + (g.g - 1) * C.goldK * gold, 1 + (g.b - 1) * C.goldK * gold);
    t.r += (C.moon[0] - t.r) * night; t.g += (C.moon[1] - t.g) * night; t.b += (C.moon[2] - t.b) * night;
    U.uAmbient.value = ATMOS.dayAmbient * (1 - C.goldDim * gold) * (1 + (C.nightAmbient - 1) * night);
    U.uShadeK.value = 1 - Math.min(0.95, ATMOS.canopyShade * (1 + C.goldShade * gold));
    U.uDark.value = dusk;
    U.uLightR.value = (ATMOS.lightRadius[0] + (ATMOS.lightRadius[1] - ATMOS.lightRadius[0]) * dusk) * 32 * (this.lightMult ?? 1);   // (fog: Weather.js)
    U.uLamp.value = ss(C.lamp.on[0], C.lamp.on[1], dusk);
    U.uMoonFloor.value = C.moonFloor * night;
    U.uNightLift.value.set(C.moonLift[0] * night, C.moonLift[1] * night, C.moonLift[2] * night);
    return { gold, night };
  }

  render(renderer, scene, camera) {
    const w = this.game.width, h = this.game.height;
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
    this.uniforms.uFocus.value.set(camera.focus.x, camera.focus.z);
    this.uniforms.uPpu.value = camera.ppu;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this._placeLeaves(w, h, camera);
    renderer.render(this.scene, this.cam);
  }

  // ------------------------------------------------------------------ foreground leaves

  _buildLeaves() {
    const A = this.game.assets;
    const L = ATMOS.leafFrame;
    const texFor = (n) => {
      const t = A?.textures?.[`fg_leaf_${n}`];
      // The anchor (manifest) is the stem: the texel that goes at the item's screen point.
      if (t) return { tex: t, w: t.image.width, h: t.image.height, shared: true, anchor: A.manifest[`fg_leaf_${n}`]?.anchor || [0, t.image.height - 1] };
      const c = fallbackLeaf(n);
      const ct = new THREE.CanvasTexture(c);
      ct.magFilter = ct.minFilter = THREE.NearestFilter;
      ct.generateMipmaps = false;
      ct.colorSpace = THREE.SRGBColorSpace;
      return { tex: ct, w: c.width, h: c.height, shared: false, anchor: [0, c.height - 1] };
    };
    const texs = {};
    this.leaves = L.items.map((it, i) => {
      const t = texs[it.leaf] ||= texFor(it.leaf);
      const tex = it.flip ? t.tex.clone() : t.tex;
      if (it.flip) { tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, depthTest: false, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.frustumCulled = false;
      m.renderOrder = 1 + i;
      this.scene.add(m);
      const ax = it.flip ? t.w - 1 - t.anchor[0] : t.anchor[0];
      return { m, it, w: t.w, h: t.h, ax, ay: t.anchor[1], ownTex: !t.shared || it.flip ? tex : null, ph: i * 1.7 };
    });
  }

  _placeLeaves(w, h, camera) {
    const on = this.uniforms.uLeaves.value > 0;
    if (!on) { if (this.leaves) for (const l of this.leaves) l.m.visible = false; return; }
    if (!this.leaves) this._buildLeaves();
    const L = ATMOS.leafFrame, U = this.uniforms;
    // Lagging parallax: the frame trails the camera a little (it is closer than the world), then settles.
    const f = camera.focus;
    if (!this._lag) this._lag = { x: f.x, z: f.z, t: performance.now() };
    const now = performance.now(), dt = Math.min(0.1, (now - this._lag.t) / 1000);
    this._lag.t = now;
    this._t += dt;
    const k = 1 - Math.exp(-L.settle * dt);
    this._lag.x += (f.x - this._lag.x) * k;
    this._lag.z += (f.z - this._lag.z) * k;
    const clamp = (v) => Math.max(-L.parallaxMax, Math.min(L.parallaxMax, v));
    const ox = Math.round(clamp((this._lag.x - f.x) * 32 * L.parallax)), oy = Math.round(clamp((this._lag.z - f.z) * 32 * L.parallax));
    // Darker with the light (night) so the frame never reads brighter than the jungle behind it.
    const lv = Math.max(L.minLight, Math.min(1, U.uAmbient.value / ATMOS.dayAmbient));
    for (const l of this.leaves) {
      const it = l.it;
      const sway = Math.round(Math.sin(this._t * L.swaySpeed + l.ph) * it.sway);
      // The leaf's stem texel lands on (ax × w + x, ay × h + y).
      const x = (it.ax ?? 0) * w + it.x + ox + sway - l.ax, y = (it.ay ?? 0) * h + it.y + oy - l.ay;
      // Quad in NDC, corners on whole pixels.
      l.m.scale.set((l.w / w) * 2, (l.h / h) * 2, 1);
      l.m.position.set(((Math.round(x) + l.w / 2) / w) * 2 - 1, 1 - ((Math.round(y) + l.h / 2) / h) * 2, 0);
      l.m.material.color.setScalar(lv);
      l.m.visible = true;
    }
  }

  dispose() {
    this.target.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
    for (const l of this.leaves || []) { l.m.geometry.dispose(); l.m.material.dispose(); l.ownTex?.dispose(); }
  }
}

/** Procedural stand-in for a missing fg_leaf_<n>: a whole near-black pointed blade with a lit rim (hard alpha). */
function fallbackLeaf(n) {
  const sizes = { 1: [144, 128], 2: [160, 96], 3: [112, 160], 4: [128, 112], 5: [48, 160] };
  const [W, H] = sizes[n] || [128, 112];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  // Blade along the diagonal from the stem corner (0, H) to (W, 0), half-width peaking mid-length.
  const ax = 0, ay = H, bx = W, by = 0, L = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const cols = [[5, 10, 6], [10, 22, 12], [22, 48, 28]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - ax, ry = y + 0.5 - ay;
    const u = (rx * ux + ry * uy) / L, v = rx * -uy + ry * ux;
    if (u < 0.08 || u > 1) continue;
    const half = Math.sin(Math.PI * Math.min(1, (u - 0.08) / 0.92)) * Math.min(W, H) * 0.22;
    if (Math.abs(v) > half) continue;
    const ci = Math.abs(v) < 1 ? 1 : v < -half + 2 ? 2 : 0;
    const o = (y * W + x) * 4;
    img.data[o] = cols[ci][0]; img.data[o + 1] = cols[ci][1]; img.data[o + 2] = cols[ci][2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
