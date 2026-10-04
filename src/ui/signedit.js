'use strict';
// ---------------------------------------------------------------------------
// Sign editing: four lines of up to 15 characters, typed straight onto the
// board like the classic editor (Enter / arrows move between lines).
// ---------------------------------------------------------------------------
class SignEditScreen extends Screen {
  constructor(game, te) {
    super(game);
    this.signTE = te;
    this.background = 'world';
    this.line = 0;
    const scr = this;
    // text-field stand-ins so the hidden input (and phone keyboards) can type into each line
    this.fields = [0, 1, 2, 3].map((i) => ({
      maxLength: 15, cursor: (te.lines[i] || '').length,
      get text() { return te.lines[i] || ''; },
      setText(t, cur) {
        let v = String(t).replace(/§/g, '').slice(0, 15);
        while (v && Paintings.textWidth(v) > 90) v = v.slice(0, -1);
        te.lines[i] = v;
        this.cursor = Math.min(cur === undefined || cur === null ? v.length : cur, v.length);
        if (v !== String(t)) scr.game.input.focusText(this);
      },
    }));
  }
  init() {
    this.add(new Button(this.W / 2 - 100, Math.min(this.H - 28, this.boardY() + 108), 200, 20, 'Done', () => this.close()));
    this.focusLine(this.line);
  }
  boardY() { return Math.max(28, Math.floor(this.H / 2 - 70)); }
  focusLine(i) { this.line = i; this.game.input.focusText(this.fields[i]); }
  keyDown(e) {
    if (e.key === 'Escape' || (e.key === 'Enter' && this.line === 3)) { this.close(); return; }
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Tab') { this.focusLine((this.line + 1) & 3); return; }
    if (e.key === 'ArrowUp') { this.focusLine((this.line + 3) & 3); }
  }
  mouseDown(mx, my, btn) {
    if (super.mouseDown(mx, my, btn)) return true;
    const by = this.boardY(), bx = Math.floor(this.W / 2 - 60);
    if (mx >= bx && mx < bx + 120 && my >= by && my < by + 60) this.focusLine(clamp(Math.floor((my - by - 10) / 10), 0, 3));
    else this.focusLine(this.line);
    return true;
  }
  onClose() {
    const g = this.game, te = this.signTE;
    if (g.world) g.world.markTileChanged(te.x, te.z);
    g.input.focusText(null);
  }
  close() { this.game.closeScreen(); }
  draw(gui, mx, my) {
    gui.worldOverlay();
    const ctx = gui.ctx, te = this.signTE, w = this.game.world;
    gui.textCentered('Edit sign message:', this.W / 2, this.boardY() - 18, '#ffffff');
    const meta = w ? w.getMeta(te.x, te.y, te.z) : 0, id = w ? w.getBlock(te.x, te.y, te.z) : B.SIGN;
    const wood = WOOD[(id === B.SIGN ? meta >> 4 : meta >> 2) & 7] || 'oak';
    const bx = Math.floor(this.W / 2 - 60), by = this.boardY();
    const tex = TexGen.T['planks_' + wood], logt = TexGen.T['log_' + wood];
    if (!tex._cv) tex._cv = tex.toCanvas(1);
    if (logt && !logt._cv) logt._cv = logt.toCanvas(1);
    ctx.imageSmoothingEnabled = false;
    // post
    if (id !== B.WALL_SIGN && logt) for (let y = 0; y < 70; y += 32) ctx.drawImage(logt._cv, 0, 0, 2, Math.min(16, (70 - y) / 2), this.W / 2 - 5, by + 60 + y, 10, Math.min(32, 70 - y));
    // board (planks at 2x)
    for (let y = 0; y < 60; y += 32) for (let x = 0; x < 120; x += 32) {
      const sw = Math.min(16, (120 - x) / 2), sh = Math.min(16, (60 - y) / 2);
      ctx.drawImage(tex._cv, 0, 0, sw, sh, bx + x, by + y, sw * 2, sh * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx, by + 58, 120, 2); ctx.fillRect(bx + 118, by, 2, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, 120, 2); ctx.fillRect(bx, by, 2, 58);
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    for (let j = 0; j < 4; j++) {
      let s = te.lines[j] || '';
      if (j === this.line) s = '> ' + s + (blink ? '_' : ' ') + ' <';
      gui.textCentered(s, this.W / 2, by + 10 + j * 10, '#000000', false);
    }
    for (const wd of this.widgets) wd.draw(gui, mx, my);
  }
}
