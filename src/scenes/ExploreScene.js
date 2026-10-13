// STUB: placeholder until the real Explore scene lands.
import { el, panel } from '../ui/ui.js';

export class ExploreScene {
  constructor(game) { this.game = game; }
  enter(params) {
    this.game.ui.append(panel('', el('h2', 'Explore (stub)'), el('p.muted', JSON.stringify(params || {}).slice(0, 200))));
  }
  update(dt) {}
  exit() {}
}
