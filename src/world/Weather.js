// Weather / day modifiers in the jungle (critic J N2). Today's weather comes from the run (Run.weatherFor: seeded per
// run and night, from WEATHER.fromNight, WEATHER.chance of a day); tuning in src/data/weather.js.
//
// Gameplay goes through plain fields on the scene that the entities read (1 / false when there is no weather):
//   scene.detectMult       × creatures' sight (ExploreEnemy idle → alert)          rain
//   scene.noiseMult        × the radius at which your cutting draws creatures       rain
//   scene.noRustle         no fern-push sound / creature rustle cue                 rain
//   scene.staminaRegenMult × stamina refill (Player)                                heat
//   + pods(list): extra spore pods (heat) · Run.lootMults reads `lootScrap` (fog)
// Look and sound: PostFx uniforms (tint, a dithered fog / haze veil, 1-px rain streaks), PostFx.lightMult (fog),
// Ambience.shaftMult (light shafts), rain ripples on the ground (Fx.ring) and AmbientAudio.setRain.

import { WEATHER, RAIN_LOOK } from '../data/weather.js';
import { SPORES, LEVEL } from '../data/jungle.js';
import { makeRng, subSeed } from '../core/rng.js';
import { el } from '../ui/ui.js';
import '../ui/objectives.css';

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    const run = this.game.run;
    this.def = run.weather ? run.weather() : null;
    this.key = this.def?.key || null;
    this.rippleT = 0;
    const d = this.def;
    scene.detectMult = d?.detect ?? 1;
    scene.noiseMult = d?.noise ?? 1;
    scene.noRustle = !!d?.noRustle;
    scene.staminaRegenMult = d?.staminaRegen ?? 1;
  }

  /** Today's spore pods: Heat grows extra ones (× WEATHER pods) beside the others, on open, dry ground. */
  pods(list) {
    const d = this.def;
    if (!d?.pods || d.pods <= 1 || !list.length) return list;
    const run = this.game.run, w = this.scene.world;
    const rng = makeRng(subSeed(run.seed, run.night, 'heat-pods'));
    const out = list.slice();
    let want = Math.round(list.length * (d.pods - 1));
    for (const p of rng.shuffle(list.slice())) {
      if (want <= 0) break;
      for (let t = 0; t < 12; t++) {
        const a = rng.next() * Math.PI * 2, r = SPORES.spacing * (0.8 + rng.next() * 0.8);
        const x = Math.round((p.x + Math.cos(a) * r) * 2) / 2, z = Math.round((p.z + Math.sin(a) * r) * 2) / 2;
        if (!w.inBounds(Math.floor(x), Math.floor(z)) || w.blockedCircle(x, z, 0.35, false) || w.levelAt(x, z) <= LEVEL.water) continue;
        if (out.some((q) => Math.hypot(q.x - x, q.z - z) < SPORES.spacing * 0.75)) continue;
        out.push({ id: `${p.id}_h${want}`, x, z, region: p.region });
        want--;
        break;
      }
    }
    return out;
  }

  /** Hook the look and sound up (call once PostFx and Ambience exist). */
  apply() {
    const d = this.def, sc = this.scene;
    const U = sc.post?.uniforms;
    if (sc.post) sc.post.lightMult = d?.lightMult ?? 1;
    if (U?.uWTint) {
      U.uWTint.value.set(...(d?.tint || [1, 1, 1]));
      U.uFog.value = d?.fog || 0;
      if (d?.fogColor) U.uFogCol.value.set(...d.fogColor);
      if (d?.fogRange && U.uFogR) U.uFogR.value.set(...d.fogRange);
      U.uRain.value = d?.rain || 0;
      const R = RAIN_LOOK;
      U.uRainK.value.set(R.gap, R.len, R.speed, R.slant);
      U.uRainP.value.set(R.period[0], R.period[1], R.mix);
      U.uRainCol.value.set(...R.color);
    }
    if (sc.ambience) sc.ambience.shaftMult = d?.shafts ?? 1;
    this.game.sfx?.ambient?.setRain?.(d?.audio || 0);
  }

  /** A small tag under the district name (top right) and the first-day line. */
  hud(hud) {
    const d = this.def;
    if (!d || !hud?.tr) return;
    this.tag = el(`div.j-weather.${this.key}`, { title: `${d.name}: ${d.short}` }, `${d.icon} ${d.name}`);
    hud.tr.append(this.tag);
    this.scene.later?.(2.4, () => this.scene.toast(`${d.name} today: ${d.short}`, '', 4));
  }

  update(dt) {
    const d = this.def;
    if (!d?.ripples) return;
    // Rain ripples: little rings popping on the ground around the view (not on water-logged deep tiles or in trunks).
    const sc = this.scene, R = RAIN_LOOK.ripple;
    this.rippleT -= dt * d.ripples;
    let n = 0;
    while (this.rippleT <= 0 && n++ < 4) {
      this.rippleT += 1;
      const x = sc.camFocus.x + (Math.random() - 0.5) * 20, z = sc.camFocus.z + (Math.random() - 0.5) * 12;
      if (sc.world.blockedAt(Math.floor(x), Math.floor(z), false)) continue;
      sc.fx.ring({ x, y: -0.03, z }, { color: R.color, radius: R.radius, life: R.life, from: 0.05 });
    }
  }

  dispose() {
    this.game.sfx?.ambient?.setRain?.(0);
    this.tag?.remove();
  }
}
