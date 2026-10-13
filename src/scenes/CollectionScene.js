// STUB: placeholder until the real Collection scene lands.
import { el, panel } from '../ui/ui.js';

export class CollectionScene {
  constructor(game) { this.game = game; }
  enter(params) {
    this.game.ui.append(panel('', el('h2', 'Collection (stub)'), el('p.muted', JSON.stringify(params || {}).slice(0, 200))));
  }
  update(dt) {}
  exit() {}
}
