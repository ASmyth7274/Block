'use strict';
// ---------------------------------------------------------------------------
// Keyboard & mouse input (touch controls live in ui/touch.js)
// ---------------------------------------------------------------------------
class Input {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.virtual = new Set();      // keys held by touch controls
    this.buttons = 0;              // mouse buttons held (bitmask, game only)
    this.dx = 0; this.dy = 0;
    this.mx = 0; this.my = 0;      // GUI-space mouse
    this.locked = false;
    this.lastLockLoss = 0;
    this.textTarget = null;
    const cv = game.guiCanvas;
    this.el = cv;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    cv.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.onWheel(e); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
    // hidden text input for text fields & chat (brings up mobile keyboards)
    this.textEl = document.getElementById('textinput');
    if (this.textEl) {
      this.textEl.addEventListener('input', () => { if (this.textTarget) this.textTarget.setText(this.textEl.value, this.textEl.selectionStart); });
      this.textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.onKeyDown(e, true); }
        else e.stopPropagation();
        setTimeout(() => { if (this.textTarget && this.textEl) this.textTarget.cursor = this.textEl.selectionStart; }, 0);
      });
    }
  }
  isDown(code) { return this.keys.has(code) || this.virtual.has(code); }
  focusText(field) {
    this.textTarget = field;
    if (!this.textEl) return;
    this.textEl.value = field ? field.text : '';
    if (field) {
      this.textEl.maxLength = field.maxLength || 256;
      try { this.textEl.focus({ preventScroll: true }); this.textEl.setSelectionRange(field.text.length, field.text.length); } catch (e) { /* ignore */ }
    } else this.textEl.blur();
  }
  guiPos(e) {
    const r = this.el.getBoundingClientRect();
    const g = this.game.gui;
    const px = (e.clientX - r.left) * (this.el.width / r.width), py = (e.clientY - r.top) * (this.el.height / r.height);
    return [Math.floor(px / g.scale), Math.floor(py / g.scale)];
  }
  requestLock() {
    if (this.game.settings.touchControls && IS_TOUCH) return;
    if (this.locked) return;
    if (performance.now() - this.lastLockLoss < 1100) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.el.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.el.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  onLockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    if (was && !this.locked) {
      this.lastLockLoss = performance.now();
      this.keys.clear(); this.buttons = 0;
      this.game.onPointerLockLost();
    }
  }
  onKeyDown(e, fromText) {
    const g = this.game;
    if (this.textTarget && !fromText && document.activeElement === this.textEl) return;
    if (e.code === 'F11') { e.preventDefault(); g.toggleFullscreen(); return; }
    if (['F1', 'F2', 'F3', 'F5', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'Slash', 'Quote'].includes(e.code) || (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight')) e.preventDefault();
    if (g.screen) { g.screen.keyDown(e); return; }
    if (e.repeat) return;
    this.keys.add(e.code);
    g.onGameKey(e);
  }
  onKeyUp(e) {
    this.keys.delete(e.code);
    if (this.game.screen && this.game.screen.keyUp) this.game.screen.keyUp(e);
  }
  onMouseDown(e) {
    const g = this.game;
    g.audio.unlock();
    if (g.screen) {
      const [x, y] = this.guiPos(e);
      this.mx = x; this.my = y;
      g.screen.mouseDown(x, y, e.button, e);
      return;
    }
    if (!this.locked) { this.requestLock(); return; }
    this.buttons |= (1 << e.button);
    g.onGameMouse(e.button, true);
  }
  onMouseUp(e) {
    const g = this.game;
    this.buttons &= ~(1 << e.button);
    if (g.screen) { const [x, y] = this.guiPos(e); g.screen.mouseUp(x, y, e.button, e); return; }
    g.onGameMouse(e.button, false);
  }
  onMouseMove(e) {
    if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; return; }
    const [x, y] = this.guiPos(e);
    this.mx = x; this.my = y;
    if (this.game.screen && this.game.screen.mouseMove) this.game.screen.mouseMove(x, y, e);
  }
  onWheel(e) {
    const g = this.game;
    const d = Math.sign(e.deltaY);
    if (g.screen) { if (g.screen.wheel) g.screen.wheel(d); return; }
    g.onGameWheel(d);
  }
  consumeLook() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }
}
