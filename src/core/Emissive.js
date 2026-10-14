// Emissive sprite texels (critic H #4): eyes, terminal screens, pylon tips, the Relay crystal, fire.
//
// A sprite whose key is listed in EMISSIVE.keys (src/data/jungle.js) gets one extra child sprite sharing its
// texture (so it follows the frame, facing and squash). It draws only the texels that glow — bright,
// saturated and inside one of the key's hue bands — and writes nothing but the PostFx light code: colour
// untouched, alpha 0 (PostFx.emitBlending). PostFx then keeps those pixels out of the canopy shade, the
// darkness and the vignette, so at night the glows are what you see. It is depth-tested at the body's own
// depth (a small offset toward the camera), so anything standing in front still hides it.

import * as THREE from 'three';
import { SPRITE_CARD } from './PixelView.js';
import { EMISSIVE } from '../data/jungle.js';
import { emitBlending } from './PostFx.js';

class EmissiveMaterial extends THREE.SpriteMaterial {
  constructor(params, bands) {
    super(params);
    this.isEmissiveMaterial = true;
    const b = bands.slice(0, 3);
    while (b.length < 3) b.push([-1, -1]);
    this.uBands = { value: b.map(([a, c]) => new THREE.Vector2(a, c)) };
    this.uNB = { value: Math.min(3, bands.length) };
    this.uOn = { value: 1 };
    this.uMin = { value: new THREE.Vector2(EMISSIVE.minV, EMISSIVE.minS) };
    emitBlending(this);
    this.depthFunc = THREE.LessEqualDepth;
    this.polygonOffset = true;
    this.polygonOffsetFactor = 0;
    this.polygonOffsetUnits = -4;
  }
  onBeforeCompile(shader) {
    shader.uniforms.spriteCard = SPRITE_CARD;
    shader.uniforms.uBands = this.uBands;
    shader.uniforms.uNB = this.uNB;
    shader.uniforms.uOn = this.uOn;
    shader.uniforms.uMin = this.uMin;
    shader.vertexShader = shader.vertexShader
      .replace('uniform float rotation;', 'uniform float rotation; uniform vec2 spriteCard;')
      .replace('mvPosition.xy += rotatedPosition;', 'mvPosition.x += rotatedPosition.x; mvPosition.yz += rotatedPosition.y * spriteCard;');
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float opacity;', `uniform float opacity;
uniform vec2 uBands[3];
uniform float uNB, uOn;
uniform vec2 uMin;`)
      .replace('#include <map_fragment>', `
	vec4 et = texture2D(map, vMapUv);
	if (et.a < 0.5 || uOn < 0.5) discard;
	vec3 ec = pow(max(et.rgb, vec3(0.0)), vec3(1.0 / 2.2));   // back to ~sRGB for the test
	float emx = max(ec.r, max(ec.g, ec.b)), emn = min(ec.r, min(ec.g, ec.b)), ed = emx - emn;
	if (emx < uMin.x || ed < uMin.y * emx) discard;
	float eh = emx == ec.r ? mod((ec.g - ec.b) / ed, 6.0) : emx == ec.g ? (ec.b - ec.r) / ed + 2.0 : (ec.r - ec.g) / ed + 4.0;
	eh *= 60.0;
	bool eok = false;
	for (int i = 0; i < 3; i++) {
		if (float(i) >= uNB) break;
		vec2 bd = uBands[i];
		if (bd.x <= bd.y ? (eh >= bd.x && eh <= bd.y) : (eh >= bd.x || eh <= bd.y)) eok = true;
	}
	if (!eok) discard;
	diffuseColor = vec4(0.0, 0.0, 0.0, 1.0);`);
  }
  customProgramCacheKey() { return 'vr-emissive-sprite'; }
}

/** Hue bands for a sprite key (EMISSIVE.keys), or null. */
export function emissiveBands(key) { return EMISSIVE.keys[key] || null; }

/** Attach the emissive mask to a sprite visual (Assets.makeVisual). */
export function addEmissive(vis, bands) {
  const body = vis.body;
  const mat = new EmissiveMaterial({ map: vis.tex, fog: false }, bands);
  const spr = new THREE.Sprite(mat);
  spr.center.copy(body.center);
  spr.renderOrder = 41;            // after the bodies (and their silhouettes): their depth is in
  spr.userData.noSnap = true;      // follows the body's per-draw pixel snap (it is the body's child)
  spr.name = 'emissive';
  spr.onBeforeRender = () => { mat.uOn.value = vis.opacity >= 0.5 ? 1 : 0; };
  body.add(spr);
  vis.emissive = spr;
}
