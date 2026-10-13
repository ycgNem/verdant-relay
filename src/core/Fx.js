// Shared visual effects for both modes: pixel particles, ground rings, lightning/tracer lines,
// ground telegraphs (wind-up warnings that fill up), and floating text (DOM, projected each frame).
//
//   const fx = new Fx(game, scene3d, camera);
//   fx.burst(pos, { color, count, speed, life, size, up, gravity })
//   fx.ring(pos, { color, radius, life })              expanding ground ring
//   fx.line(a, b, { color, life, jag })                lightning (jag > 0) or tracer
//   const t = fx.telegraph(pos, { radius | (dir,length,width), color, time })   fills over `time`, then fades
//   fx.text(pos, '12', { color, life, rise, cls })
//   fx.update(dt);  fx.dispose();

import * as THREE from 'three';

const MAX_PARTICLES = 600;

export class Fx {
  constructor(game, scene, camera) {
    this.game = game;
    this.scene = scene;
    this.camera = camera;
    this.items = [];
    this.texts = [];

    // Particles: one InstancedMesh of small unlit cubes; each instance has its own colour.
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pmesh = new THREE.InstancedMesh(geom, mat, MAX_PARTICLES);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.count = 0;
    this.pmesh.frustumCulled = false;
    this.pmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    scene.add(this.pmesh);
    this.parts = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  burst(pos, o = {}) {
    const n = o.count ?? 8;
    const col = new THREE.Color(o.color ?? '#ead4aa');
    const col2 = o.color2 ? new THREE.Color(o.color2) : null;
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x: pos.x, y: (pos.y ?? 0) + (o.y ?? 0.4), z: pos.z,
        vx: Math.cos(a) * sp + (o.vx || 0), vy: (o.up ?? 2.5) * (0.5 + Math.random()), vz: Math.sin(a) * sp + (o.vz || 0),
        g: o.gravity ?? 9, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.6), t: 0,
        size: (o.size ?? 0.08) * (0.7 + Math.random() * 0.6),
        color: col2 && Math.random() < 0.5 ? col2 : col,
      });
    }
  }

  ring(pos, o = {}) {
    const radius = o.radius ?? 1;
    const geom = new THREE.RingGeometry(0.86, 1, 32);
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? '#ead4aa', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geom, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, (pos.y ?? 0) + 0.05, pos.z);
    m.scale.setScalar(o.from ?? radius * 0.2);
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, life: o.life ?? 0.35, kind: 'ring', r0: o.from ?? radius * 0.2, r1: radius });
  }

  line(a, b, o = {}) {
    const pts = [];
    const segs = o.jag ? 6 : 1;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (o.jag && i > 0 && i < segs) {
        p.x += (Math.random() - 0.5) * o.jag;
        p.y += (Math.random() - 0.5) * o.jag * 0.6;
        p.z += (Math.random() - 0.5) * o.jag;
      }
      pts.push(p);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: o.color ?? '#2ce8f5', transparent: true, opacity: 1 });
    const l = new THREE.Line(geom, mat);
    this.scene.add(l);
    this.items.push({ obj: l, t: 0, life: o.life ?? 0.12, kind: 'fade' });
  }

  /**
   * Ground telegraph that fills over `time` seconds. Circle: { radius }. Line: { dir: {x,z}, length, width }.
   * Returns a handle with .cancel(). It removes itself `fade` seconds after filling.
   */
  telegraph(pos, o = {}) {
    const color = o.color ?? '#e43b44';
    const group = new THREE.Group();
    group.position.set(pos.x, 0.04, pos.z);
    let outline, fill;
    const om = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const fm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    if (o.dir) {
      const len = o.length ?? 3, w = o.width ?? 0.8;
      outline = new THREE.Mesh(new THREE.PlaneGeometry(w, len), om);
      fill = new THREE.Mesh(new THREE.PlaneGeometry(w, len), fm);
      for (const m of [outline, fill]) { m.rotation.x = -Math.PI / 2; m.position.z = -len / 2; }
      fill.geometry.translate(0, len / 2, 0);   // grows from the origin along the facing direction
      fill.position.z = 0;
      group.rotation.y = Math.atan2(-o.dir.x, -o.dir.z);
    } else {
      const r = o.radius ?? 1;
      outline = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 32), om);
      fill = new THREE.Mesh(new THREE.CircleGeometry(r, 32), fm);
      for (const m of [outline, fill]) m.rotation.x = -Math.PI / 2;
    }
    fill.scale.set(0.001, 0.001, 1);
    group.add(outline, fill);
    this.scene.add(group);
    const item = { obj: group, t: 0, life: (o.time ?? 0.8) + (o.fade ?? 0.15), fillTime: o.time ?? 0.8, kind: 'tele', fill, line: !!o.dir };
    this.items.push(item);
    return { cancel: () => { item.t = item.life; }, group };
  }

  text(pos, str, o = {}) {
    const n = document.createElement('div');
    n.className = `float ${o.cls || ''}`;
    n.textContent = str;
    n.style.color = o.color ?? '#ead4aa';
    this.game.ui.append(n);
    this.texts.push({ n, p: new THREE.Vector3(pos.x, (pos.y ?? 0) + (o.y ?? 1), pos.z), t: 0, life: o.life ?? 0.8, rise: o.rise ?? 0.8 });
  }

  update(dt) {
    // particles
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (const p of this.parts) {
      const s = p.size * (1 - (p.t / p.life) * 0.6);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(s, s, s));
      this.pmesh.setMatrixAt(n, this._m);
      this.pmesh.setColorAt(n, p.color);
      n++;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;

    // rings, lines, telegraphs
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      if (it.kind === 'ring') {
        it.obj.scale.setScalar(it.r0 + (it.r1 - it.r0) * Math.sqrt(k));
        it.obj.material.opacity = 0.9 * (1 - k);
      } else if (it.kind === 'fade') {
        it.obj.material.opacity = 1 - k;
      } else if (it.kind === 'tele') {
        const f = Math.min(1, it.t / it.fillTime);
        if (it.line) it.fill.scale.set(1, f, 1);
        else it.fill.scale.set(f, f, 1);
        if (it.t > it.fillTime) {
          const fk = (it.t - it.fillTime) / Math.max(0.01, it.life - it.fillTime);
          it.fill.material.opacity = 0.7 * (1 - fk);
        }
      }
      if (it.t >= it.life) {
        this._disposeObj(it.obj);
        this.items.splice(i, 1);
      }
    }

    // floating text
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) { t.n.remove(); this.texts.splice(i, 1); continue; }
      const p = this.game.project(t.p.clone().setY(t.p.y + t.rise * (t.t / t.life)), this.camera);
      t.n.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -50%)`;
      t.n.style.opacity = String(1 - Math.max(0, (t.t / t.life - 0.6) / 0.4));
    }
  }

  _disposeObj(o) {
    o.removeFromParent();
    o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); });
  }

  dispose() {
    for (const it of this.items) this._disposeObj(it.obj);
    this.items = [];
    for (const t of this.texts) t.n.remove();
    this.texts = [];
    this.pmesh.removeFromParent();
    this.pmesh.geometry.dispose();
    this.pmesh.material.dispose();
    this.pmesh.dispose();
  }
}
