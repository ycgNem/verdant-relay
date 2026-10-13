// The night map's ground and jungle, built with the same renderer as the day jungle so both halves of
// the game look alike: a small square "world" around the 30 × 17 defense field (TerrainBaker blends
// its terrain, FloraAtlas cards draw the thickets and trees) — dirt trails where the lanes run, a
// paved plaza under the Relay, open jungle floor on the field and a wall of jungle all around it.
//
// Defense tile (x, y) maps to world tile (x − X0, y − Z0); the meshes sit in a group offset by (X0, Z0),
// so everything lines up with DefenseScene's coordinates.

import * as THREE from 'three';
import { DEFENSE_MAP } from '../data/defenseMap.js';
import { LEVEL, BRUSH } from '../data/jungle.js';
import { makeNoise, hash2 } from './noise.js';
import { TerrainBaker } from './TerrainBaker.js';
import { FloraAtlas } from './FloraAtlas.js';
import { makeCardMaterial, chunkCards, cardMesh } from './JungleWorld.js';

const S = 48;               // world tiles per side (3 × 3 bake chunks)
const X0 = -8, Z0 = -9;     // defense coords of world tile (0, 0)

export function buildDefenseGround(game, seed, laneTiles, tint) {
  const W = DEFENSE_MAP.width, H = DEFENSE_MAP.height, V = S + 1;
  const n = makeNoise(seed ^ 0x2468);
  const isLane = (x, y) => laneTiles.has(`${x},${y}`);
  const pl = DEFENSE_MAP.plaza;
  const inPlaza = (x, y) => x >= pl.x0 && x <= pl.x1 && y >= pl.y0 && y <= pl.y1;
  const inField = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const laneRows = DEFENSE_MAP.lanes.map((l) => l.points[0][1]);

  const world = {
    seed, size: S, center: { x: S / 2, z: S / 2 },
    level: new Uint8Array(V * V), pave: new Uint8Array(V * V), brush: new Uint8Array(S * S),
    objects: [],
    blendAmp: 0.5,
  };
  // ---- vertex levels: a vertex takes the "highest priority" surface of the tiles that touch it.
  for (let vz = 0; vz <= S; vz++) {
    for (let vx = 0; vx <= S; vx++) {
      const x = vx + X0, y = vz + Z0;
      const touch = [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]];
      let lv = n.fbm(vx * 0.12, vz * 0.12, 3) > 0.7 && touch.every(([tx, ty]) => !inField(tx, ty)) ? LEVEL.floor : LEVEL.moss;
      if (touch.every(([tx, ty]) => !inField(tx, ty))) lv = LEVEL.moss;
      if (touch.filter(([tx, ty]) => isLane(tx, ty)).length >= 2) lv = LEVEL.dirt;
      else if (touch.some(([tx, ty]) => isLane(tx, ty))) lv = Math.min(lv, LEVEL.floor);
      if (touch.some(([tx, ty]) => inPlaza(tx, ty) && !isLane(tx, ty))) { lv = LEVEL.dirt; world.pave[vz * V + vx] = 1; }
      world.level[vz * V + vx] = lv;
    }
  }
  // ---- undergrowth: a wall of jungle outside the field, a few ferns on it.
  for (let tz = 0; tz < S; tz++) {
    for (let tx = 0; tx < S; tx++) {
      const x = tx + X0, y = tz + Z0, i = tz * S + tx;
      if (isLane(x, y) || inPlaza(x, y)) continue;
      if (inField(x, y)) continue;
      // Keep the lane mouths open where enemies walk in.
      if (x < 0 && laneRows.some((r) => Math.abs(y - r) <= 1)) continue;
      const edge = Math.min(Math.abs(x - (x < 0 ? -1 : W)), Math.abs(y - (y < 0 ? -1 : H)));
      // Just south of the field only low ferns, so nothing tall hides the bottom lane.
      if (y >= H && y < H + 3) { world.brush[i] = hash2(tx, tz, 3) < 0.7 ? BRUSH.fern : 0; continue; }
      world.brush[i] = edge <= 0 && hash2(tx, tz, 4) < 0.5 ? BRUSH.fern : n.fbm(tx * 0.2, tz * 0.2, 2) > 0.62 ? BRUSH.bramble : BRUSH.thicket;
    }
  }
  for (const [x, y] of DEFENSE_MAP.bushes || []) {
    const tx = x - X0, tz = y - Z0;
    if (!isLane(x, y)) world.brush[tz * S + tx] = BRUSH.fern;
  }
  // ---- trees and rocks
  const types = ['kapok', 'fig', 'palm', 'dead'];
  let oid = 0;
  const tree = (x, z) => world.objects.push({ id: `d${oid++}`, kind: 'tree', type: types[Math.floor(hash2(Math.floor(x * 7), Math.floor(z * 7), 9) * types.length)], x: Math.round((x - X0) * 32) / 32, z: Math.round((z - Z0) * 32) / 32, big: false, flip: hash2(Math.floor(x), Math.floor(z), 1) < 0.5 });
  for (const [x, y] of DEFENSE_MAP.trees) tree(x + 0.5, y + 0.5);
  for (const [x, y] of DEFENSE_MAP.rubble) world.objects.push({ id: `d${oid++}`, kind: 'rock', type: hash2(x, y, 2) < 0.6 ? 'boulder' : 'log', x: x + 0.5 - X0, z: y + 0.5 - Z0, flip: hash2(x, y, 3) < 0.5 });
  for (let k = 0; k < 140; k++) {
    const x = X0 + 0.5 + hash2(k, 1, 77) * (S - 1), z = Z0 + 0.5 + hash2(k, 2, 77) * (S - 1);
    const outside = x < -0.8 || x > W + 0.3 || z < -0.6 || z > H + 3.5;
    if (!outside) continue;
    if (z > H && z < H + 5) continue;                       // tall trees in front would hide the field
    if (x < 0 && laneRows.some((r) => Math.abs(z - (r + 0.5)) < 2)) continue;
    if (world.objects.some((o) => Math.hypot(o.x + X0 - x, o.z + Z0 - z) < 2.2)) continue;
    tree(x, z);
  }

  // ---- ground texture (3 × 3 baked chunks)
  const baker = new TerrainBaker(world, game.assets, game.assets.terrainArt || null);
  const big = document.createElement('canvas');
  big.width = big.height = S * 32;
  const g = big.getContext('2d');
  for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 3; cx++) g.drawImage(baker.bake(cx, cz), cx * 512, cz * 512);
  // The field reads as the playable area: the margin is a touch darker.
  g.fillStyle = 'rgba(6,10,8,0.28)';
  const fx0 = -X0 * 32, fz0 = -Z0 * 32, fx1 = (W - X0) * 32, fz1 = (H - Z0) * 32;
  g.fillRect(0, 0, big.width, fz0);
  g.fillRect(0, fz1, big.width, big.height - fz1);
  g.fillRect(0, fz0, fx0, fz1 - fz0);
  g.fillRect(fx1, fz0, big.width - fx1, fz1 - fz0);
  // Plaza hazard border (amber/dark stripes) around the Relay.
  {
    const x0 = (pl.x0 - X0) * 32, y0 = (pl.y0 - Z0) * 32, x1 = (pl.x1 + 1 - X0) * 32, y1 = (pl.y1 + 1 - Z0) * 32;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const e = Math.min(px - x0, x1 - 1 - px, py - y0, y1 - 1 - py);
      if (e >= 3 || isLane(Math.floor(px / 32) + X0, Math.floor(py / 32) + Z0)) continue;
      g.fillStyle = ((px + py) >> 2) % 2 ? '#a88a3a' : '#2a2633';
      g.fillRect(px, py, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(big);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(S, S);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const ground = new THREE.Mesh(geom, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(S / 2, 0, S / 2);
  ground.userData.noSnap = true;

  // ---- cards
  const atlas = new FloraAtlas(game.assets);
  const cmat = makeCardMaterial(atlas.texture);
  cmat.uniforms.uTint.value.set(tint);
  cmat.uniforms.uPlayerZ.value = 1e9;   // no see-through window at night
  const cards = cardMesh(chunkCards(world, atlas, null, 0, 0, S, S), atlas, cmat);

  const group = new THREE.Group();
  group.position.set(X0, 0, Z0);
  group.add(ground, cards);
  return {
    group,
    update(dt) { cmat.uniforms.uTime.value += dt; },
    dispose() {
      group.removeFromParent();
      tex.dispose(); geom.dispose(); mat.dispose();
      cards.geometry.dispose(); cmat.dispose(); atlas.texture.dispose();
    },
  };
}

// ------------------------------------------------------------------ build-pad plinths

const PLINTH_W = 32, PLINTH_TOP = 26, PLINTH_FACE = 7, PLINTH_H = PLINTH_TOP + PLINTH_FACE + 1;

/**
 * An in-world tower plinth for a night-map build pad (critic F #14/#15, replaces the metal pad with
 * hazard brackets): a weathered stone block, or a timber platform (`wood`), drawn texel by texel at 32 px
 * per tile — top face, lit north/west bevels, a shaded front face showing its height, moss and cracks.
 * Returns a flat Lambert mesh (lit by the night lights like the ground) centred on the tile, its front
 * face hanging south of it. `seed` varies the wear.
 */
export function makePlinth(seed, wood = false) {
  const c = document.createElement('canvas');
  c.width = PLINTH_W; c.height = PLINTH_H;
  const g = c.getContext('2d');
  const r = (i) => hash2(seed * 13 + i, i * 7, 911);
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const x0 = 2, x1 = PLINTH_W - 3, y0 = 1, y1 = PLINTH_TOP;   // top face (inclusive)
  const top = wood ? ['#3a2618', '#4a3220', '#5a3e28', '#6b4b30'] : ['#3f4442', '#4c524e', '#5a615b', '#687068'];
  const face = wood ? ['#22160e', '#2c1d12', '#382517'] : ['#262a29', '#2f3432', '#3a3f3c'];
  const moss = ['#24401f', '#2f5228', '#3e6631'];
  // Front face (the block's height, shaded), with vertical joints.
  for (let y = y1 + 1; y <= y1 + PLINTH_FACE; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = y === y1 + PLINTH_FACE ? 0 : (x - x0) % (wood ? 7 : 9) === 0 ? 0 : y === y1 + 1 ? 2 : 1;
      px(x, y, face[k]);
    }
  }
  // Top face: stone slabs (2 × 2 blocks with offset joints) or planks, with value noise for wear.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const n = hash2(x + seed * 31, y, 77);
      let k = n < 0.18 ? 0 : n < 0.62 ? 1 : n < 0.93 ? 2 : 3;
      if (wood) {
        if ((y - y0) % 6 === 5) k = 0;                                    // gaps between planks
        else if ((x + ((y - y0) / 6 | 0) * 11) % 16 === 0) k = 0;          // plank ends
      } else {
        const row = (y - y0) < 13 ? 0 : 1;
        if (y - y0 === 13 || (x - x0 + row * 7) % 14 === 0) k = 0;        // slab joints
      }
      if (y === y0 || x === x0) k = Math.min(3, k + 2);                     // lit north / west bevel
      if (y === y1 || x === x1) k = Math.max(0, k - 1);
      px(x, y, top[k]);
    }
  }
  // Cracks (stone) or nail heads (wood).
  if (wood) {
    for (let p = 0; p < 10; p++) px(x0 + 2 + Math.floor(r(p) * (x1 - x0 - 3)), y0 + 2 + 6 * Math.floor(r(p + 20) * 4), '#8a7a5a');
  } else {
    for (let k = 0; k < 2; k++) {
      let x = x0 + 4 + Math.floor(r(k + 40) * (x1 - x0 - 8)), y = y0 + 2 + Math.floor(r(k + 50) * 8);
      for (let s = 0; s < 6 + Math.floor(r(k + 60) * 8) && y < y1; s++) {
        px(x, y, '#1c1f1e');
        const q = r(k * 31 + s + 70);
        if (q < 0.5) y++; else x += q < 0.75 ? 1 : -1;
      }
    }
  }
  // Moss creeping over the edges (more at the bottom-left, the damp side).
  for (let k = 0; k < 26; k++) {
    const side = r(k + 100);
    const x = side < 0.5 ? x0 + Math.floor(r(k + 110) * 4) : x0 + Math.floor(r(k + 120) * (x1 - x0));
    const y = side < 0.5 ? y0 + Math.floor(r(k + 130) * (y1 - y0 + PLINTH_FACE)) : y1 - Math.floor(r(k + 140) * 3) + Math.floor(r(k + 150) * 4);
    px(x, y, moss[Math.floor(r(k + 160) * 3)]);
  }
  // Dark 1-texel outline around the block (pixel-art separation from the ground).
  const d = g.getImageData(0, 0, PLINTH_W, PLINTH_H);
  const solid = (x, y) => x >= 0 && y >= 0 && x < PLINTH_W && y < PLINTH_H && d.data[(y * PLINTH_W + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < PLINTH_H; y++) for (let x = 0; x < PLINTH_W; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) px(x, y, '#121414');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PLINTH_W / 32, PLINTH_H / 32), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.userData.pxSnap = true;
  // Centre the top face on the tile: the texture's top-face centre is (y0 + y1) / 2 texels from its top.
  m.userData.zOffset = (PLINTH_H / 2 - (y0 + y1 + 1) / 2) / 32;
  m.userData.dispose = () => { m.geometry.dispose(); mat.dispose(); tex.dispose(); };
  return m;
}
