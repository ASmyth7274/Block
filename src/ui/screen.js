'use strict';
// ---------------------------------------------------------------------------
// GUI screens & widgets
// ---------------------------------------------------------------------------
class Widget {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.visible = true; this.enabled = true; }
  hit(mx, my) { return this.visible && mx >= this.x && my >= this.y && mx < this.x + this.w && my < this.y + this.h; }
  draw() {}
  mouseDown() { return false; }
  mouseUp() {}
  mouseMove() {}
}
class Button extends Widget {
  constructor(x, y, w, h, label, onClick) { super(x, y, w, h || 20); this.label = label; this.onClick = onClick; this.tooltip = null; }
  text() { return typeof this.label === 'function' ? this.label() : this.label; }
  draw(gui, mx, my) {
    if (!this.visible) return;
    const hov = this.enabled && this.hit(mx, my);
    gui.button(this.x, this.y, this.w, this.h, this.text(), !this.enabled ? 'disabled' : hov ? 'hover' : 'normal');
  }
  mouseDown(mx, my, btn, screen) {
    if (!this.enabled || !this.hit(mx, my) || btn !== 0) return false;
    screen.game.audio.play('click', 0.6);
    if (this.onClick) this.onClick(this);
    return true;
  }
}
class Slider extends Widget {
  constructor(x, y, w, label, value, onChange, steps) { super(x, y, w, 20); this.labelFn = label; this.value = value; this.onChange = onChange; this.dragging = false; this.steps = steps || 0; }
  draw(gui, mx, my) {
    if (!this.visible) return;
    gui.button(this.x, this.y, this.w, this.h, null, 'disabled');
    const kx = this.x + Math.round(this.value * (this.w - 8));
    const hov = this.hit(mx, my) || this.dragging;
    gui.button(kx, this.y, 8, this.h, null, hov ? 'hover' : 'normal');
    gui.textCentered(this.labelFn(this.value), this.x + this.w / 2, this.y + 6, hov ? '#ffffa0' : '#e0e0e0');
  }
  setFrom(mx) {
    let v = clamp((mx - this.x - 4) / (this.w - 8), 0, 1);
    if (this.steps) v = Math.round(v * this.steps) / this.steps;
    if (v !== this.value) { this.value = v; if (this.onChange) this.onChange(v); }
  }
  mouseDown(mx, my, btn, screen) { if (!this.hit(mx, my) || btn !== 0) return false; this.dragging = true; this.setFrom(mx); screen.game.audio.play('click', 0.6); return true; }
  mouseMove(mx) { if (this.dragging) this.setFrom(mx); }
  mouseUp() { this.dragging = false; }
}
class TextField extends Widget {
  constructor(x, y, w, h, text, maxLength) { super(x, y, w, h || 20); this.text = text || ''; this.maxLength = maxLength || 32; this.focused = false; this.cursor = this.text.length; this.onChange = null; this.onEnter = null; this.placeholder = ''; this.blink = 0; }
  setText(t, cur) { this.text = String(t).slice(0, this.maxLength); this.cursor = cur === undefined || cur === null ? this.text.length : Math.min(cur, this.text.length); if (this.onChange) this.onChange(this.text); }
  draw(gui, mx, my) {
    if (!this.visible) return;
    const ctx = gui.ctx;
    ctx.fillStyle = this.focused ? '#ffffff' : '#a0a0a0'; ctx.fillRect(this.x - 1, this.y - 1, this.w + 2, this.h + 2);
    ctx.fillStyle = '#000000'; ctx.fillRect(this.x, this.y, this.w, this.h);
    const ty = this.y + Math.floor((this.h - 8) / 2);
    let shown = this.text;
    while (gui.textWidth(shown) > this.w - 10 && shown.length) shown = shown.slice(1);
    if (!this.text && this.placeholder && !this.focused) gui.text(this.placeholder, this.x + 4, ty, '#707070');
    else gui.text(shown, this.x + 4, ty, this.enabled ? '#e0e0e0' : '#707070');
    this.blink++;
    if (this.focused && Math.floor(this.blink / 18) % 2 === 0) {
      const off = shown.length - (this.text.length - this.cursor);
      const cx = this.x + 4 + gui.textWidth(shown.slice(0, Math.max(0, off))) + (off > 0 ? 1 : 0);
      if (this.cursor >= this.text.length) gui.text('_', cx, ty, '#e0e0e0');
      else { ctx.fillStyle = '#d0d0d0'; ctx.fillRect(cx, ty - 1, 1, 10); }
    }
    void mx; void my;
  }
  mouseDown(mx, my, btn, screen) {
    const was = this.focused;
    this.focused = this.enabled && this.hit(mx, my);
    if (this.focused) { screen.game.input.focusText(this); return true; }
    if (was) screen.game.input.focusText(null);
    return false;
  }
  key(e) {
    if (!this.focused) return false;
    if (e.key === 'Enter') { if (this.onEnter) this.onEnter(this.text); return true; }
    return false;
  }
}

class Screen {
  constructor(game) {
    this.game = game;
    this.widgets = [];
    this.parent = null;
    this.background = 'dirt';
    this.pauses = true;
    this.title = '';
  }
  get gui() { return this.game.gui; }
  get W() { return this.game.gui.w; }
  get H() { return this.game.gui.h; }
  init() {}
  layout() { this.widgets = []; this.init(); }
  add(w) { this.widgets.push(w); return w; }
  drawBackground(gui) {
    if (this.background === 'dirt') gui.dirtBackground();
    else if (this.background === 'world') gui.worldOverlay();
    else if (this.background === 'panorama') { /* drawn by the 3D renderer */ }
  }
  draw(gui, mx, my) {
    this.drawBackground(gui);
    if (this.title) gui.textCentered(this.title, this.W / 2, 15, '#ffffff');
    for (const w of this.widgets) w.draw(gui, mx, my);
    for (const w of this.widgets) if (w.tooltip && w.hit && w.hit(mx, my)) gui.tooltip(Array.isArray(w.tooltip) ? w.tooltip : [w.tooltip], mx, my);
  }
  mouseDown(mx, my, btn) {
    for (const w of this.widgets.slice()) if (w.visible && w.mouseDown(mx, my, btn, this)) return true;
    return false;
  }
  mouseUp(mx, my, btn) { for (const w of this.widgets) w.mouseUp(mx, my, btn, this); }
  mouseMove(mx, my) { for (const w of this.widgets) w.mouseMove(mx, my, this); }
  keyDown(e) {
    for (const w of this.widgets) if (w instanceof TextField && w.key(e)) return;
    if (e.key === 'Escape') { this.close(); return; }
    if (e.key === 'Tab') {
      const fields = this.widgets.filter((w) => w instanceof TextField && w.visible && w.enabled);
      if (fields.length) {
        const i = fields.findIndex((f) => f.focused);
        fields.forEach((f) => { f.focused = false; });
        const n = fields[(i + 1) % fields.length];
        n.focused = true; this.game.input.focusText(n);
      }
    }
  }
  keyUp() {}
  wheel() {}
  tick() {}
  onClose() {}
  close() { this.game.openScreen(this.parent || null); }
}
