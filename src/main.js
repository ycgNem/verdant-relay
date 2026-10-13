// Minimal boot: proves the stack (Vite + Three.js + pixel render + DOM overlay) works.
// Replace with `new Game(...)` once src/core/Game.js exists (see PLAN.md, Stage 1).
import * as THREE from 'three';
import './ui/style.css';
import { CONFIG } from './data/config.js';
import { VISUALS } from './data/visuals.js';

const [W, H] = CONFIG.resolutions.chunky;
const stage = document.getElementById('stage');
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#16301f');
scene.fog = new THREE.Fog('#16301f', 12, 26);
scene.add(new THREE.HemisphereLight('#e9ffc4', '#193c3e', 1.4));
const sun = new THREE.DirectionalLight('#ffe9c4', 1.6);
sun.position.set(-4, 8, 3);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
camera.position.set(0, 7, 6);
camera.lookAt(0, 0.8, 0);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#265c42' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Quick placeholder showcase from the visuals data.
const GEOMS = {
  box: (s) => new THREE.BoxGeometry(...s),
  cyl: (s) => new THREE.CylinderGeometry(s[0], s[1], s[2], 8),
  cone: (s) => new THREE.ConeGeometry(s[0], s[1], 8),
  sph: (s) => new THREE.SphereGeometry(s[0], 8, 6),
  ico: (s) => new THREE.IcosahedronGeometry(s[0], 0),
  oct: (s) => new THREE.OctahedronGeometry(s[0], 0),
  dod: (s) => new THREE.DodecahedronGeometry(s[0], 0),
};
function placeholder(key) {
  const g = new THREE.Group();
  for (const [shape, size, pos, color, extra] of VISUALS[key]) {
    const mat = extra?.emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true });
    const m = new THREE.Mesh(GEOMS[shape](size), mat);
    m.position.set(...pos);
    g.add(m);
  }
  return g;
}
const core = placeholder('relay_core');
scene.add(core);
['scrap_turret', 'arc_spire', 'snare_vine', 'thorn_nest'].forEach((k, i) => {
  const base = placeholder('tower_base');
  base.add(placeholder(k));
  const a = (i / 4) * Math.PI * 2 + 0.4;
  base.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
  scene.add(base);
});

document.getElementById('ui').innerHTML = `
  <div class="boot">
    <h1>VERDANT RELAY</h1>
    <p>Scavenge by day. Hold the line by night.</p>
    <small>Project scaffold running. See PLAN.md to start Stage 1.</small>
  </div>`;

// Letterbox the stage to 16:9 at the largest size that fits the window.
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  stage.style.width = `${Math.floor(W * s)}px`;
  stage.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener('resize', fit);
fit();

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  camera.position.set(Math.sin(t * 0.15) * 7, 6, Math.cos(t * 0.15) * 7);
  camera.lookAt(0, 0.8, 0);
  renderer.render(scene, camera);
});
