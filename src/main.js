// Boot: load sprites, create the Game shell, register scenes, start at the title.
//
// Debug / testing shortcuts (URL params), e.g.
//   ?debug=explore&district=flooded_transit&night=2
//   ?debug=defense&night=4&scrap=400&circuits=10&biofiber=10
//   ?debug=briefing | summary | results
// They start a fresh run and jump straight to that scene. `window.vr` exposes the game in the console.
// Debug runs don't count toward lifetime stats and don't overwrite the real run save unless &save=1.

import './ui/style.css';
import { Game } from './core/Game.js';
import { Assets } from './core/Assets.js';
import { Run } from './core/Run.js';
import { loadRun } from './core/Save.js';
import { Music } from './core/Music.js';
import { DISTRICT_KEYS } from './data/districts.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { BriefingScene } from './scenes/BriefingScene.js';
import { JungleScene } from './scenes/JungleScene.js';
import { SummaryScene } from './scenes/SummaryScene.js';
import { DefenseScene } from './scenes/DefenseScene.js';
import { ResultsScene } from './scenes/ResultsScene.js';

async function boot() {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  ui.innerHTML = '<div class="loading">Loading…</div>';
  const assets = new Assets();
  await assets.load();

  const game = new Game({ stage, canvas: document.getElementById('view'), ui, flash: document.getElementById('flash'), assets });
  game.music = new Music(game);
  game.register('title', TitleScene);
  game.register('settings', SettingsScene);
  game.register('collection', CollectionScene);
  game.register('briefing', BriefingScene);
  game.register('explore', JungleScene);
  game.register('summary', SummaryScene);
  game.register('defense', DefenseScene);
  game.register('results', ResultsScene);
  window.vr = { game, Run, loadRun };

  const q = new URLSearchParams(location.search);
  const dbg = q.get('debug');
  if (dbg) {
    game.run = Run.create(game.meta);
    game.run.debug = true;   // keeps debug runs out of lifetime stats / records
    game.run.noSave = q.get('save') !== '1';   // and away from the real run save (add &save=1 to test Continue)
    game.run.night = Math.max(1, Math.min(6, Number(q.get('night')) || 1));
    game.run.guided = q.get('guided') === '1';   // &guided=1: the first-run guided night 1 (src/data/guide.js)
    for (const k of ['scrap', 'circuits', 'biofiber', 'intel']) if (q.has(k)) game.run.res[k] = Number(q.get(k));
    if (q.has('skills')) game.run.skills = q.get('skills').split(',');
    if (q.has('points')) game.run.skillPoints = Number(q.get('points'));
    const district = q.get('district') || DISTRICT_KEYS[0];
    game.run.stats.peak = { ...game.run.res };   // results show the debug start's resources, not the default 60 Scrap
    if (dbg === 'explore' || dbg === 'defense' || dbg === 'summary') game.run.chooseDistrict(district);
    if (dbg === 'defense') game.run.stats.districts = [];   // no expedition happened: don't list a visited district
    if (dbg === 'summary') {
      game.run.applyExpedition({ district, extracted: true, carried: { scrap: 40, circuits: 2, biofiber: 1, intel: 1 }, objectiveDone: true, boon: { text: 'Debug boon: +10% tower rate.', towerRate: 1.1 }, optionals: [], events: [], skillPointsEarned: 1, medsLeft: 0, playerHp: 80, kills: 5 }, game);
    }
    if (dbg === 'results') {
      game.go('results', { result: game.run.finish(game, q.get('victory') === '1') });
    } else {
      game.go(dbg, { district });
    }
  } else {
    game.go('title');
  }
  game.start();
}

boot();
