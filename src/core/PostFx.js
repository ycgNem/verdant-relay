// Screen-space lighting and grading for the jungle (and any scene that sets `scene.post`).
//
// The scene renders into a half-float target at the internal resolution; one full-screen pass then
//   · maps every pixel back to the ground point under it (ortho camera, 32 px per tile, no yaw) and
//     looks up canopy density there → dappled shade that drifts with the wind, quantised into a few
//     steps with a 4 × 4 Bayer dither (pixel-art light, no smooth gradients)
//   · darkens beyond the player's light radius (shrinks at dusk; dithered edge)
//   · grades: teal shadows, warm highlights, a touch more saturation, vignette
// Shading applies to sprites too (a canopy shadow falls across anything standing under it).

import * as THREE from 'three';
import { ATMOS } from '../data/jungle.js';

export class PostFx {
  constructor(game) {
    this.game = game;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.uniforms = {
      tScene: { value: this.target.texture },
      tShade: { value: null },
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
      uDapple: { value: ATMOS.dapple },
      uDappleScale: { value: ATMOS.dappleScale },
      uWind: { value: ATMOS.wind },
      uVignette: { value: ATMOS.vignette },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uHurt: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tShade;
        uniform vec2 uRes, uFocus, uPlayer;
        uniform float uWorld, uPpu, uTime, uLightR, uDark, uAmbient, uShadeK, uDapple, uDappleScale, uWind, uVignette, uHurt;
        uniform vec3 uTint;
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
          vec3 col = texture2D(tScene, vUv).rgb;
          float b = bayer4(floor(px));

          // Canopy shade with drifting sun dapples, quantised to 4 steps.
          float canopy = texture2D(tShade, ground / uWorld).r;
          vec2 dp = ground * uDappleScale + vec2(uTime * uWind, uTime * uWind * 0.6);
          float dap = vnoise(dp) * 0.65 + vnoise(dp * 2.3 + 7.1) * 0.35;
          float sun = smoothstep(0.52, 0.78, dap);                          // patches of direct sun
          float light = mix(1.0, uShadeK, canopy) + sun * uDapple * canopy;
          light = floor(light * 6.0 + b) / 6.0;
          light *= uAmbient;

          // Darkness beyond the light radius (dusk/night shrink it).
          float d = length((px - uPlayer) * vec2(1.0, 1.25));
          float fall = smoothstep(uLightR * 0.55, uLightR, d);
          float dark = fall * mix(0.32, 0.88, uDark);
          dark = floor(dark * 5.0 + b) / 5.0;
          light *= 1.0 - dark;

          col *= light * uTint;
          // Grade: teal into the shadows, warmth into the highlights, +saturation.
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(lum), col, 1.18);
          col += vec3(-0.012, 0.010, 0.022) * (1.0 - smoothstep(0.0, 0.35, lum));
          col *= mix(vec3(1.0), vec3(1.06, 1.02, 0.92), smoothstep(0.35, 0.9, lum));
          // Vignette (stepped) + hurt pulse.
          vec2 q = vUv - 0.5;
          float v = smoothstep(0.32, 0.78, length(q * vec2(1.0, 0.85)));
          v = floor(v * 4.0 + b) / 4.0;
          col *= 1.0 - v * uVignette;
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
    renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.target.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
