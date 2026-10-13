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
      tLeaves: { value: leafTexture() },
      uLeaves: { value: 0 },                        // 0 = off; 1 = foreground leaves frame the view
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tShade;
        uniform vec2 uRes, uFocus, uPlayer;
        uniform float uWorld, uPpu, uTime, uLightR, uDark, uAmbient, uShadeK, uDapple, uDappleScale, uWind, uVignette, uHurt, uLeaves;
        uniform sampler2D tLeaves;
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
          // Foreground leaves: near-black silhouettes at the screen edges, drifting a little faster
          // than the world (parallax) and swaying, so the jungle closes in around the view.
          if (uLeaves > 0.0) {
            vec2 sway = vec2(floor(sin(uTime * 0.9 + px.y * 0.01) * 2.0 + 0.5), 0.0);
            vec2 lp = (floor(px) + sway + floor(uFocus * uPpu * 1.35)) / 256.0;
            vec4 lf = texture2D(tLeaves, lp);
            float edge = max(abs(q.x) * 1.0, abs(q.y) * 1.25);
            float m = smoothstep(0.34, 0.5, edge) * uLeaves;
            if (lf.a > 0.5 && m > b) col = mix(col, lf.rgb * (0.55 + 0.45 * light), 0.92);
          }
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
    this.uniforms.tLeaves.value.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}

/** Tileable 256 × 256 silhouettes of big jungle leaves (dark greens with a faint lit rim). */
function leafTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const shades = ['#050a06', '#07100a', '#0a160c'];
  for (let k = 0; k < 26; k++) {
    const x = rnd() * S, y = rnd() * S, len = 30 + rnd() * 46, wid = len * (0.32 + rnd() * 0.2), a = rnd() * Math.PI * 2;
    const col = shades[Math.floor(rnd() * shades.length)];
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [-S, -S], [S, -S], [-S, S]]) {
      g.save();
      g.translate(Math.round(x + ox), Math.round(y + oy));
      g.rotate(a);
      // Leaf blade: an ellipse pointed at the tip, with a lit rim on its upper edge and a midrib.
      g.fillStyle = '#16301c';
      g.beginPath(); g.ellipse(len / 2, -1, len / 2, wid / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(-len * 0.3, -1, len * 0.3, 2);
      g.fillStyle = '#122617';
      g.fillRect(0, 0, len * 0.95, 1);
      g.restore();
    }
  }
  // Hard alpha: pixel art, no soft edges.
  const d = g.getImageData(0, 0, S, S);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
