// Night forecast for the readiness check (critic K §4.6 / #7, critic L §6.2): instead of "total DPS × seconds
// vs total HP", a fast 1-D replay of tonight's pushes against the real tower stats.
//
// Each lane is sampled every READINESS.sample tiles. A tower covers the samples within its range (that
// coverage is what decides most nights: a tower beside the Relay sees ~8 tiles of path, a central one ~18 of
// two). Enemies in a beacon's light at a lane mouth (BEACON_LIGHT, scene._lit) take its bonus damage, and Burrowers
// can't tunnel there.
// Enemies walk their lane at their real speeds (district speed, lane slows, Snare slows where snares cover
// the path — slows multiply time in range, they are not "+6 DPS"), Burrowers can't be shot by bullets while
// underground, Spitters plant and lob sap, Seed Carriers burst unless a blast tagged them, tanks resist, the
// Colossus besieges the plaza. Towers fire at their real rate on the enemy their rule picks (chains jump,
// mortars splash), scaled by READINESS.efficiency (no projectile travel / overkill / retargeting here).
// The Relay Protocols this run has count as a small damage-equivalent near the Relay (READINESS.protocols).
//
// Returns { level: 'weak' | 'risky' | 'strong', lost (expected Relay loss), lo, hi, lanes: [{ name, short,
// lost, dots 0–3 }], ratio (share of the wave's Relay threat stopped) }.

import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { DEFENSE, RELAY_ZAP, relayZapDamage, healthMult } from '../data/waves.js';
import { READINESS } from '../data/guide.js';
import { BIG_SIZE } from '../data/towers.js';
import { BEACON_LIGHT } from '../data/defenseMap.js';

export function forecastNight(scene) {
  const R = READINESS;
  const run = scene.run;
  const ds = R.sample;
  const lanes = scene.lanes.map((lane, li) => {
    const n = Math.max(2, Math.ceil(lane.total / ds) + 1);
    const xs = new Float32Array(n), zs = new Float32Array(n), on = new Uint8Array(n), slow = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      const p = lane.pointAt(Math.min(lane.total, i * ds));
      xs[i] = p.x; zs[i] = p.z; on[i] = p.x > -0.3 ? 1 : 0;
    }
    // Spitters plant at the first sample within their spit range of the Relay.
    const spit = DEFENSE_ENEMIES.spitter.spit;
    let stopI = n - 1;
    for (let i = 0; i < n; i++) if (Math.hypot(xs[i] - scene.corePos.x, zs[i] - scene.corePos.z) <= spit.range) { stopI = i; break; }
    return { li, lane, n, xs, zs, on, slow, stopI, speed: scene.enemySpeedMult(li), lost: 0, threat: 0, covered: 0, by: {} };
  });
  // A beacon's light (scene._lit, BEACON_LIGHT): bonus damage there, and Burrowers can't tunnel in it.
  const litAt = (e) => {
    const lit = scene._lit?.[e.L.li];
    return !!lit && !e.def.boss && e.d >= lit[0] && e.d <= lit[1];
  };

  // Towers: coverage per lane (sample flags) and per-attack numbers.
  const towers = [];
  for (const t of scene.towers) {
    const s = t.stats;
    if (!s || s.kind === 'support') continue;
    const rate = (s.cooldown > 0 ? 1 / (s.cooldown / (1 + (t.buffRate || 0))) : 0) * (1 + (t.bonusChance || 0));
    const r2 = s.range * s.range, m2 = (s.minRange || 0) ** 2;
    const cov = lanes.map((L) => {
      const c = new Uint8Array(L.n);
      for (let i = 0; i < L.n; i++) {
        if (!L.on[i]) continue;
        const d2 = (L.xs[i] - t.pos.x) ** 2 + (L.zs[i] - t.pos.z) ** 2;
        if (d2 <= r2 && d2 >= m2) { c[i] = 1; L.covered += 1; }
      }
      return c;
    });
    // Slows where this tower covers the path: Snares always; thorn slow-on-hit on what they shoot.
    const slowMult = s.kind === 'snare' ? s.slowMult * (s.rootTime ? 1 - Math.min(0.5, s.rootTime / s.rootCooldown) : 1)
      : s.slowOnHit ? 1 - (1 - s.slowOnHit) * R.thornSlowShare : 1;
    if (slowMult < 1) lanes.forEach((L, li) => { for (let i = 0; i < L.n; i++) if (cov[li][i]) L.slow[i] = Math.min(L.slow[i], slowMult); });
    towers.push({ s, rate, cov, cd: 0, kind: s.kind, rule: t.rec.target, dmg: s.damage * (s.kind === 'snare' ? 1 : R.efficiency) });
  }
  // The Relay's own zap (RELAY_ZAP): a single-target 'bullet' (never hits burrowed) at the core. Its coverage
  // doesn't count toward a path's dots (a path no tower reaches still reads ○○○).
  {
    const r2 = RELAY_ZAP.range * RELAY_ZAP.range;
    const cov = lanes.map((L) => {
      const c = new Uint8Array(L.n);
      for (let i = 0; i < L.n; i++) if (L.on[i] && (L.xs[i] - scene.corePos.x) ** 2 + (L.zs[i] - scene.corePos.z) ** 2 <= r2) c[i] = 1;
      return c;
    });
    towers.push({ s: { kind: 'bullet', damageType: RELAY_ZAP.damageType }, rate: 1 / RELAY_ZAP.cooldown, cov, cd: 0, kind: 'bullet', zap: true, dmg: relayZapDamage(scene.night) * R.efficiency });
  }
  // Relay Protocols as a damage-equivalent over the last stretch of every lane (split between lanes).
  let protoDps = 0;
  for (const k of scene.protocols?.keys || []) {
    const p = R.protocols[k];
    if (!p) continue;
    protoDps += (p.dps + (p.perNight || 0) * scene.night) * R.protocolUse;
  }
  if (protoDps > 0) {
    const per = protoDps / lanes.length;
    towers.push({ s: { kind: 'zone' }, rate: 1, cov: lanes.map((L) => { const c = new Uint8Array(L.n); for (let i = Math.max(0, L.n - Math.ceil(R.protocolReach / ds)); i < L.n; i++) c[i] = L.on[i]; return c; }), cd: 0, kind: 'zone', dmg: per });
  }

  const dt = R.step;
  const P = scene.wave.pushEvents || [scene.wave.events];
  const siege = DEFENSE_ENEMIES.colossus.siege;
  let lost = 0;
  for (const events of P) {
    let ei = 0, t = 0;
    const alive = [];
    const spawn = (type, li, d, hpMult) => {
      const def = DEFENSE_ENEMIES[type];
      if (!def) return;
      const L = lanes[li % lanes.length];
      const hp = def.hp * (hpMult != null ? hpMult * (scene.hpMult / healthMult(scene.night)) : scene.hpMult);
      alive.push({ def, type, L, d, hp, max: hp, blast: -99, shots: 0, shotT: 0, slams: 0, slamT: 0 });
      L.threat += def.boss ? siege.damage * siege.maxSlams : def.spit ? def.spit.damage * def.spit.shots : def.coreDamage;
    };
    while (t < R.maxTime && (ei < events.length || alive.length)) {
      while (ei < events.length && events[ei].t <= t) { const e = events[ei++]; spawn(e.type, e.lane, 0, e.hpMult); }
      t += dt;
      // Move.
      for (const e of alive) {
        if (e.dead) continue;
        const L = e.L, i = Math.min(L.n - 1, Math.floor(e.d / ds));
        let sl = L.slow[i];
        if (e.def.slowResist) sl = 1 - (1 - sl) * (1 - e.def.slowResist);
        if (e.def.boss) sl = Math.max(sl, DEFENSE.bossSlowMin);
        let v = e.def.speed * L.speed * sl * (e.def.boss ? R.bossPace : 1);
        if (e.def.spit && i >= L.stopI) {
          v = 0;
          e.shotT -= dt;
          if (e.shotT <= 0) {
            e.shotT += e.def.spit.every;
            e.shots += 1;
            lost += e.def.spit.damage; L.lost += e.def.spit.damage; L.by[e.type] = (L.by[e.type] || 0) + e.def.spit.damage;
            if (e.shots >= e.def.spit.shots) e.dead = true;
          }
        }
        // The Colossus roots every loop (Crawlers, + Skitters once enraged) until it reaches the plaza.
        const atPlaza = e.def.boss && e.def.siege && e.d >= e.L.lane.total - siege.stopAt;
        if (e.def.boss && e.def.phases && !atPlaza) {
          const Ph = e.def.phases, En = e.def.enrage, enr = En && e.hp <= e.max * En.at;
          e.age = (e.age || 0) + dt;
          if (e.nextRoot == null) e.nextRoot = (Ph.firstApproach ?? Ph.approach) + Ph.rootTelegraph;
          if (e.age >= e.nextRoot) {
            for (let k = 0; k < Ph.rootSpawn; k++) spawn(Ph.rootSpawnType, e.L.li, e.d + 0.6 + k * 0.55);
            if (enr) for (let k = 0; k < En.packCount; k++) spawn(En.packType, e.L.li, Math.max(0, e.d + 0.3 - k * 0.45));
            const P2 = enr ? { ...Ph, ...En.phases } : Ph;
            e.nextRoot += P2.approach + P2.rootTelegraph + P2.rooted + P2.chargeWindup + P2.charge;
          }
        }
        if (atPlaza) {
          v = 0;
          e.slamT += dt;
          if (e.slamT >= siege.every) {
            e.slamT -= siege.every; e.slams += 1;
            lost += siege.damage; L.lost += siege.damage; L.by[e.type] = (L.by[e.type] || 0) + siege.damage;
            if (e.slams >= siege.maxSlams) e.dead = true;
          }
        }
        e.d += v * dt;
        if (!e.def.boss && e.d >= L.lane.total) {
          e.dead = true;
          lost += e.def.coreDamage; L.lost += e.def.coreDamage; L.by[e.type] = (L.by[e.type] || 0) + e.def.coreDamage;
        }
      }
      // Fire.
      for (const tw of towers) {
        tw.cd -= dt;
        if (tw.cd > 0) continue;
        const s = tw.s;
        let target = null, best = -Infinity;
        for (const e of alive) {
          if (e.dead) continue;
          const i = Math.min(e.L.n - 1, Math.floor(e.d / ds));
          // The Relay's zap also returns fire at a planted Spitter (after anything in its range).
          const zapSpit = tw.zap && RELAY_ZAP.spitters && e.def.spit && i >= e.L.stopI && !tw.cov[e.L.li][i];
          if (!tw.cov[e.L.li][i] && !zapSpit) continue;
          const f = e.d / e.L.lane.total;
          if (tw.kind === 'bullet' && e.def.burrow && f >= e.def.burrow[0] && f < e.def.burrow[1] && !(BEACON_LIGHT.surface && litAt(e))) continue;
          const score = (tw.rule === 'strongest' ? e.hp : e.d) - (zapSpit ? 1e6 : 0);
          if (score > best) { best = score; target = e; }
        }
        if (!target) { tw.cd = 0; continue; }
        tw.cd += 1 / tw.rate;
        const hurt = (e, amt, type) => {
          if (e.dead || amt <= 0) return;
          if (litAt(e)) amt *= 1 + BEACON_LIGHT.bonus;
          const res = s.pierce ? 1 : e.def.resist?.[type] ?? 1;
          const big = s.bigBonus && (e.def.size || 0) >= BIG_SIZE ? s.bigBonus : 1;
          if (type === 'blast') e.blast = t;
          e.hp -= amt * res * big;
          if (e.hp <= 0) kill(e);
        };
        const kill = (e) => {
          e.dead = true;
          const od = e.def.onDeath;
          if (od && !(t - e.blast <= (od.blastTag ?? 0))) for (let k = 0; k < od.count; k++) spawn(od.spawn, e.L.li, e.d);
        };
        const pos = (e) => { const i = Math.min(e.L.n - 1, Math.floor(e.d / ds)); return [e.L.xs[i], e.L.zs[i]]; };
        if (tw.kind === 'bullet' || tw.kind === 'zone') hurt(target, tw.dmg, s.damageType);
        else if (tw.kind === 'chain') {
          const hit = [target];
          let cur = target;
          for (let j = 0; j < (s.chains || 0); j++) {
            const [cx, cz] = pos(cur);
            let nx = null, nd = (s.chainRange || 2.4) ** 2;
            for (const e of alive) {
              if (e.dead || hit.includes(e)) continue;
              const [x, z] = pos(e);
              const d2 = (x - cx) ** 2 + (z - cz) ** 2;
              if (d2 <= nd) { nd = d2; nx = e; }
            }
            if (!nx) break;
            hit.push(nx); cur = nx;
          }
          hit.forEach((e, k) => hurt(e, tw.dmg * Math.pow(s.chainFalloff ?? 0.7, k), s.damageType));
        } else if (tw.kind === 'mortar') {
          const [tx, tz] = pos(target);
          const r = s.blastRadius;
          const extra = (s.burnDps ? s.burnDps * s.burnTime * R.burnShare : 0) + (s.bomblets ? s.bomblets * s.bombletDamage * R.bombletShare : 0);
          for (const e of alive) {
            if (e.dead) continue;
            const [x, z] = pos(e);
            const d = Math.hypot(x - tx, z - tz);
            if (d <= r) hurt(e, (tw.dmg + extra * R.efficiency) * (1 - (1 - (s.blastEdge ?? 0.6)) * (d / r)), 'blast');
          }
        } else if (tw.kind === 'snare') {
          if (tw.dmg > 0) for (const e of alive) {
            if (e.dead) continue;
            const i = Math.min(e.L.n - 1, Math.floor(e.d / ds));
            if (tw.cov[e.L.li][i]) hurt(e, tw.dmg, s.damageType);
          }
        }
      }
      for (let i = alive.length - 1; i >= 0; i--) if (alive[i].dead) alive.splice(i, 1);
    }
    // Anything still alive when the replay times out reaches the Relay.
    for (const e of alive) { const v = e.def.boss ? siege.damage * siege.maxSlams : e.def.coreDamage; lost += v; e.L.lost += v; e.L.by[e.type] = (e.L.by[e.type] || 0) + v; }
  }

  lost = Math.round(lost * R.lossScale);
  const threat = lanes.reduce((s, L) => s + L.threat, 0) || 1;
  const laneOut = lanes.map((L) => {
    const f = L.threat > 0 ? L.lost / L.threat : 0;
    const dots = L.threat === 0 ? 3 : L.covered === 0 ? 0 : f <= R.dots[0] ? 3 : f <= R.dots[1] ? 2 : f <= R.dots[2] ? 1 : 0;
    // The path's top leaker (critic K2 #8): the enemy type that takes the most Relay health through it.
    const top = Object.entries(L.by).sort((a, b) => b[1] - a[1])[0];
    return { name: L.lane.name.replace(/lane/i, 'path'), short: L.lane.short, lost: Math.round(L.lost * R.lossScale), dots, top: top && Math.round(top[1] * R.lossScale) >= 1 ? top[0] : null };
  });
  const hp = run.relayHp;
  const lo = Math.max(0, Math.round(lost * R.band[0] - 2));
  const hi = Math.max(0, Math.round((lost * R.band[1] + 3) * (scene.night <= 1 ? R.firstNightHi ?? 1 : 1)));
  let level = 'risky';
  if (lost >= hp * R.weakShare || !scene.towers.length) level = 'weak';
  else if (lost <= Math.max(R.strongLoss, run.relayMax * R.strongShare) && laneOut.every((l) => l.dots >= 2)) level = 'strong';
  return { level, lost, lo: Math.min(lo, hi), hi, lanes: laneOut, ratio: 1 - lost / threat };
}
