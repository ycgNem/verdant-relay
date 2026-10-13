// Pixel-perfect 3D view: an orthographic camera pitched ~55° (CONFIG.pixel) whose frustum is sized
// so that 1 world unit = `ppu` (32) internal pixels on the ground plane, in both screen directions:
//
//   screen x = world X × ppu                      (camera right = +X, no yaw)
//   screen y = (world Z − cot(pitch) × world Y) × ppu   (floor tiles are exactly ppu × ppu px)
//
// The vertical frustum is the horizontal one × sin(pitch), so ground textures (32 texels per tile)
// draw 1:1 instead of being foreshortened. That alone would stretch camera-facing sprites by
// 1/sin(pitch); instead every THREE.Sprite is drawn as an upright "card": the shader below moves
// its vertical offset along world-up (scaled by tan(pitch)), which lands on exactly the same screen
// rows as an unstretched sprite (texels stay 1:1) but gives every sprite pixel the depth of a
// vertical card standing at its feet. So a sprite standing in front of a wall is never cut by the
// wall behind it, and one behind a wall only loses the rows the wall really covers.
//
// Each frame (Game.start) the shell calls `snapForRender` before drawing: the camera focus is
// already on the 1/ppu grid (setFocus), and every sprite / flat decal is nudged (for that one
// draw, then restored) so its texel grid lands exactly on the pixel grid — no shimmer or
// "swimming" texels while things move or the camera glides.
//
// World-height note: a sprite `h` texels tall is h/ppu × tan(pitch) world units tall as a card;
// Assets.makeVisual reports that in `vis.height`, so HP bars / labels at `vis.height` sit right on
// top of the sprite on screen.

import * as THREE from 'three';
import { CONFIG } from '../data/config.js';

const DEG = Math.PI / 180;

/** World height of an upright sprite card per unit of sprite height: tan(pitch) (≈1.43 at 55°). */
export const CARD_SCALE = Math.tan(CONFIG.pixel.pitch * DEG);
/** Screen tiles per world unit of height: cot(pitch) (≈0.70 at 55°). */
export const HEIGHT_TO_SCREEN = 1 / CARD_SCALE;

/** Shared sprite uniform: (view-y, view-z) per unit of sprite height. (1, 0) = stock three.js. */
export const SPRITE_CARD = { value: new THREE.Vector2(1, 0) };
const STOCK_CARD = new THREE.Vector2(1, 0);

// Patch every SpriteMaterial (also ones created outside Assets: HP bars, badges…). With the stock
// uniform value the shader is identical to three's, so perspective scenes are unaffected.
THREE.SpriteMaterial.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.spriteCard = SPRITE_CARD;
  shader.vertexShader = shader.vertexShader
    .replace('uniform float rotation;', 'uniform float rotation;\nuniform vec2 spriteCard;')
    .replace('mvPosition.xy += rotatedPosition;', 'mvPosition.x += rotatedPosition.x;\n\tmvPosition.yz += rotatedPosition.y * spriteCard;');
};
THREE.SpriteMaterial.prototype.customProgramCacheKey = function () { return 'vr-card-sprite'; };


export class PixelCamera extends THREE.OrthographicCamera {
  /**
   * @param {object} o  pitch (deg below horizontal), ppu (px per tile), dist (camera distance), near, far
   */
  constructor({ pitch = CONFIG.pixel.pitch, ppu = CONFIG.pixel.ppu, dist = 20, near = 0.1, far = 200 } = {}) {
    super(-1, 1, 1, -1, near, far);
    this.isPixelCamera = true;
    this.ppu = ppu;
    this.dist = dist;
    this.pitch = pitch * DEG;
    const s = Math.sin(this.pitch), c = Math.cos(this.pitch);
    this.card = new THREE.Vector2(s, (s * s) / c);
    this.focus = new THREE.Vector3();
    this.pxW = 2; this.pxH = 2;
    this._snapped = [];
  }

  /** Size the frustum for an internal resolution of w × h pixels (1 tile = ppu px). */
  setSize(w, h) {
    this.pxW = w; this.pxH = h;
    const hw = w / (2 * this.ppu), hh = (h / (2 * this.ppu)) * Math.sin(this.pitch);
    this.left = -hw; this.right = hw; this.top = hh; this.bottom = -hh;
    this.updateProjectionMatrix();
  }

  /** Centre the view on ground point (x, z), snapped to the texel grid. Returns the snapped focus. */
  setFocus(x, z) {
    const p = this.ppu;
    const fx = Math.round(x * p) / p, fz = Math.round(z * p) / p;
    this.focus.set(fx, 0, fz);
    this.position.set(fx, Math.sin(this.pitch) * this.dist, fz + Math.cos(this.pitch) * this.dist);
    this.lookAt(this.focus);
    this.updateMatrixWorld();
    return this.focus;
  }

  /**
   * Focus such that ground point (x, z) lands on internal pixel (px, py). Both are rounded so the
   * texel grid stays aligned.
   */
  placeAt(x, z, px, py) {
    const p = this.ppu;
    return this.setFocus(x + (this.pxW / 2 - Math.round(px)) / p, z + (this.pxH / 2 - Math.round(py)) / p);
  }

  /** Internal-pixel position of a world point: {x, y} (y down). */
  toPixel(v, out = { x: 0, y: 0 }) {
    _v.copy(v).project(this);
    out.x = (_v.x + 1) * 0.5 * this.pxW;
    out.y = (1 - _v.y) * 0.5 * this.pxH;
    return out;
  }

  /**
   * Nudge sprites and flat decals onto the pixel grid for this draw. Call restoreSnap() after
   * rendering. Objects can opt out with userData.noSnap.
   */
  snapForRender(scene) {
    SPRITE_CARD.value.copy(this.card);
    scene.updateMatrixWorld();
    const list = this._snapped;
    list.length = 0;
    const ppu = this.ppu;
    scene.traverseVisible((o) => {
      if (o.userData.noSnap || !o.parent) return;
      let ax, ay;
      const e = o.matrixWorld.elements;
      if (o.isSprite) {
        const sx = Math.hypot(e[0], e[1], e[2]) * ppu, sy = Math.hypot(e[4], e[5], e[6]) * ppu;
        ax = o.center.x * sx;          // left edge = anchor − ax
        ay = -o.center.y * sy;         // bottom edge (y down) = anchor − ay
      } else if (o.userData.pxSnap && o.geometry?.parameters) {
        // Flat decal (PlaneGeometry lying on the floor): snap its top-left corner.
        const g = o.geometry.parameters;
        ax = (g.width * Math.hypot(e[0], e[1], e[2]) * ppu) / 2;
        ay = (g.height * Math.hypot(e[4], e[5], e[6]) * ppu) / 2;
      } else return;
      _w.set(e[12], e[13], e[14]);
      this.toPixel(_w, _px);
      const lx = _px.x - ax, ly = _px.y - ay;
      const dx = (Math.round(lx) - lx) / ppu, dz = (Math.round(ly) - ly) / ppu;
      if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
      // World delta → parent-local delta.
      _m.setFromMatrix4(o.parent.matrixWorld).invert();
      _d.set(dx, 0, dz).applyMatrix3(_m);
      o.position.add(_d);
      list.push(o, _d.x, _d.y, _d.z);
    });
  }

  restoreSnap() {
    const l = this._snapped;
    for (let i = 0; i < l.length; i += 4) l[i].position.set(l[i].position.x - l[i + 1], l[i].position.y - l[i + 2], l[i].position.z - l[i + 3]);
    l.length = 0;
    SPRITE_CARD.value.copy(STOCK_CARD);
  }
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix3();
const _px = { x: 0, y: 0 };
