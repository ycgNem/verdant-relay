// Keyboard + mouse state. `down` = held, `pressed` = went down this frame (cleared by endFrame).
// Mouse position is kept in normalized device coords of the stage, for raycasting.

export class Input {
  constructor(stage) {
    this.stage = stage;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false };
    this.buttons = new Set();
    this.clicked = new Set();

    this._onKeyDown = (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    this._onKeyUp = (e) => this.down.delete(e.code);
    this._onMove = (e) => {
      const r = stage.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
      this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x <= r.width && this.mouse.y <= r.height;
    };
    this._onMouseDown = (e) => {
      // Only clicks on the game view count; clicks on UI buttons are handled by the DOM.
      if (e.target.closest && e.target.closest('.ui-block')) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    };
    this._onMouseUp = (e) => this.buttons.delete(e.button);
    this._onBlur = () => { this.down.clear(); this.buttons.clear(); };
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMove);
    stage.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    stage.addEventListener('contextmenu', this._onContext);
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  mouseHeld(b = 0) { return this.buttons.has(b); }
  mouseClicked(b = 0) { return this.clicked.has(b); }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
  }
}
