// STUB: placeholder until the real Briefing scene lands.
import { el, panel } from '../ui/ui.js';

export class BriefingScene {
  constructor(game) { this.game = game; }
  enter(params) {
    this.game.ui.append(panel('', el('h2', 'Briefing (stub)'), el('p.muted', JSON.stringify(params || {}).slice(0, 200))));
  }
  update(dt) {}
  exit() {}
}
