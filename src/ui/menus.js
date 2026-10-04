'use strict';
// ---------------------------------------------------------------------------
// Menu screens
// ---------------------------------------------------------------------------
const GAME_VERSION = 'Alpha 1.0';
const SPLASHES = [
  'Punch a tree!', 'Now with 100% more meteors!', 'Dig straight down? Maybe not.', 'Procedurally pixelated!', 'Also try real life!',
  'Contains no creepers!', 'Boomcaps are not your friend!', 'Follow the wisps!', 'Lumite glows in the dark!', 'Who is the Stranger?',
  'The moors remember.', 'Hand-placed pixels!', 'Infinite-ish!', 'Look up at night!', 'Salted jerky never spoils!',
  'Cobalt runs deep!', 'Autumn is always here!', 'Redwoods reach the clouds!', 'Ashes to ashes!', 'Not a clone!',
  'Made with the classics in mind!', 'Sheep come in many colours!', 'Also try fishing!', 'Water flows downhill!', 'Exploration awaits!',
  'Find the runestones!', 'Bring a torch!', '20 ticks per second!', 'Shooting stars!', 'Nostalgia included!',
  'Totally not 2011!', 'Pixels all the way down!', 'Do distribute!', 'Uncharted!', 'Gold is soft, starmetal is not!',
  'Quicksand is quick!', 'Rope makes caves easy!', 'Check the journal!', 'Moo!', 'Your world, your rules!',
  'Fork the world!', 'Export your world!', 'Runs on a toaster!', 'Touch friendly!', 'Ninety-nine blocks and counting!',
  'Hearts and hunger!', 'Bramble pie is delicious!', 'Craft responsibly!', 'Splash text!', 'Seeds of adventure!',
];

// -------------------------------------------------------------------- logo
const Logo = (() => {
  let cache = null;
  function build() {
    const text = 'BLOCKLANDS';
    const F = 4;   // GUI pixels per font pixel
    let w = 0;
    for (const ch of text) w += GLYPHS[ch].w + 1;
    w -= 1;
    const mask = [];
    let ox = 0;
    for (const ch of text) {
      const g = GLYPHS[ch];
      g.rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') mask.push([ox + rx, g.top + ry]); });
      ox += g.w + 1;
    }
    const W = (w + 2) * F, H = 10 * F;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const has = new Set(mask.map(([x, y]) => x + ',' + y));
    const stone = TexGen.T.stone, cob = TexGen.T.cobblestone;
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
    // extrusion (depth) first
    for (let d = 3; d >= 1; d--) for (const [mx, my] of mask) for (let yy = 0; yy < F; yy++) for (let xx = 0; xx < F; xx++) {
      const sc = 0.32 + (3 - d) * 0.04;
      const c = cob.get((mx * F + xx) & 15, (my * F + yy) & 15);
      put(mx * F + xx + d, my * F + yy + d, [c[0] * sc, c[1] * sc, c[2] * sc]);
    }
    for (const [mx, my] of mask) for (let yy = 0; yy < F; yy++) for (let xx = 0; xx < F; xx++) {
      const c = stone.get((mx * F + xx) & 15, (my * F + yy) & 15);
      let k = 1.08;
      if (yy === 0 && !has.has(mx + ',' + (my - 1))) k = 1.38;
      if (xx === 0 && !has.has((mx - 1) + ',' + my)) k = 1.26;
      if (yy === F - 1 && !has.has(mx + ',' + (my + 1))) k = 0.78;
      if (xx === F - 1 && !has.has((mx + 1) + ',' + my)) k = 0.86;
      put(mx * F + xx, my * F + yy, [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  return { get() { if (!cache) cache = build(); return cache; } };
})();

// -------------------------------------------------------------------- title
class TitleScreen extends Screen {
  constructor(game) {
    super(game);
    this.background = 'panorama';
    this.pauses = false;
    this.splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    const d = new Date();
    if (d.getMonth() === 11 && d.getDate() >= 24 && d.getDate() <= 26) this.splash = 'Happy holidays!';
    if (d.getMonth() === 0 && d.getDate() === 1) this.splash = 'Happy new year!';
    if (d.getMonth() === 9 && d.getDate() === 31) this.splash = 'Spooky!';
  }
  init() {
    const W = this.W, H = this.H, cx = W / 2;
    const y = Math.floor(H / 4 + 48);
    this.add(new Button(cx - 100, y, 200, 20, 'Singleplayer', () => this.game.openScreen(new WorldSelectScreen(this.game, this))));
    this.add(new Button(cx - 100, y + 24, 200, 20, 'How to Play', () => this.game.openScreen(new HowToPlayScreen(this.game, this))));
    this.add(new Button(cx - 100, y + 48, 200, 20, 'About Blocklands', () => this.game.openScreen(new AboutScreen(this.game, this))));
    this.add(new Button(cx - 100, y + 84, 98, 20, 'Options...', () => this.game.openScreen(new OptionsScreen(this.game, this))));
    this.add(new Button(cx + 2, y + 84, 98, 20, () => document.fullscreenElement ? 'Windowed' : 'Fullscreen', () => this.game.toggleFullscreen()));
  }
  draw(gui, mx, my) {
    const ctx = gui.ctx, W = this.W, H = this.H;
    // panorama tint (top light, bottom dark) like the classic menu
    gui.gradient(0, 0, W, H, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.42)');
    const logo = Logo.get();
    const lx = Math.floor(W / 2 - logo.width / 2), ly = 30;
    ctx.drawImage(logo, lx, ly);
    // splash
    const t = performance.now();
    let s = 1.8 - Math.abs(Math.sin((t % 1000) / 1000 * TAU) * 0.1);
    s = s * 100 / (gui.textWidth(this.splash) + 32);
    ctx.save();
    ctx.translate(Math.floor(lx + logo.width - 10), ly + logo.height - 4);
    ctx.rotate(-20 * DEG);
    ctx.scale(s, s);
    gui.font.draw(ctx, this.splash, -Math.floor(gui.textWidth(this.splash) / 2), -4, '#ffff00');
    ctx.restore();
    for (const w of this.widgets) w.draw(gui, mx, my);
    gui.text('Blocklands ' + GAME_VERSION, 2, H - 10, '#ffffff');
    gui.textRight('A fan tribute. Not affiliated with Mojang.', W - 2, H - 10, '#ffffff');
  }
  keyDown(e) { if (e.key === 'Escape') return; super.keyDown(e); }
}

// -------------------------------------------------------------------- world list
class WorldSelectScreen extends Screen {
  constructor(game, parent) {
    super(game); this.parent = parent; this.title = 'Select World';
    this.worlds = []; this.sel = -1; this.scroll = 0; this.loading = true; this.lastClick = 0;
    this.refresh();
  }
  refresh() {
    this.loading = true;
    this.game.storage.listWorlds().then((ws) => {
      this.worlds = ws.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      this.loading = false;
      if (this.sel >= this.worlds.length) this.sel = this.worlds.length - 1;
      if (this.sel < 0 && this.worlds.length) this.sel = 0;
      this.updateButtons();
    }).catch((e) => { console.error(e); this.loading = false; this.error = 'Could not open saved worlds (storage blocked?)'; });
  }
  init() {
    const W = this.W, H = this.H, cx = W / 2;
    this.listTop = 32; this.listBottom = H - 80;
    this.bPlay = this.add(new Button(cx - 154, H - 76, 150, 20, 'Play Selected World', () => this.play()));
    this.add(new Button(cx + 4, H - 76, 150, 20, 'Create New World', () => this.game.openScreen(new CreateWorldScreen(this.game, this))));
    this.bRename = this.add(new Button(cx - 154, H - 52, 72, 20, 'Rename', () => this.game.openScreen(new RenameWorldScreen(this.game, this, this.worlds[this.sel]))));
    this.bDelete = this.add(new Button(cx - 76, H - 52, 72, 20, 'Delete', () => {
      const w = this.worlds[this.sel];
      this.game.openScreen(new ConfirmScreen(this.game, this, 'Are you sure you want to delete this world?', "'" + w.name + "' will be lost forever! (A long time!)", 'Delete', () => {
        this.game.storage.deleteWorld(w.id).then(() => { this.game.openScreen(this); this.refresh(); });
      }));
    }));
    this.bExport = this.add(new Button(cx + 4, H - 52, 72, 20, 'Export', () => this.exportWorld()));
    this.add(new Button(cx + 82, H - 52, 72, 20, 'Import', () => this.importWorld()));
    this.add(new Button(cx - 75, H - 28, 150, 20, 'Cancel', () => this.close()));
    this.updateButtons();
  }
  updateButtons() {
    const ok = this.sel >= 0 && this.sel < this.worlds.length;
    for (const b of [this.bPlay, this.bRename, this.bDelete, this.bExport]) if (b) b.enabled = ok;
  }
  play() { const w = this.worlds[this.sel]; if (w) this.game.startWorld(w); }
  exportWorld() {
    const w = this.worlds[this.sel]; if (!w) return;
    this.status = 'Exporting...';
    this.game.storage.exportWorld(w.id).then((blob) => {
      downloadBlob(blob, w.name.replace(/[^\w\- ]+/g, '_') + '.blocklands');
      this.status = 'Exported "' + w.name + '"';
    }).catch((e) => { console.error(e); this.status = 'Export failed: ' + e.message; });
  }
  importWorld() {
    pickFile('.blocklands,.json,.gz,application/octet-stream').then((f) => {
      if (!f) return;
      this.status = 'Importing...';
      return this.game.storage.importWorld(f).then((info) => { this.status = 'Imported "' + info.name + '"'; this.refresh(); });
    }).catch((e) => { console.error(e); this.status = 'Import failed: ' + e.message; });
  }
  draw(gui, mx, my) {
    gui.dirtBackground(0, 0.75);
    const W = this.W, top = this.listTop, bottom = this.listBottom;
    gui.listBackground(0, top, W, bottom - top);
    const ctx = gui.ctx;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bottom - top); ctx.clip();
    const lw = 220, lx = Math.floor(W / 2 - lw / 2);
    if (this.loading) gui.textCentered('Loading worlds...', W / 2, top + 20, '#a0a0a0');
    else if (this.error) gui.textCentered(this.error, W / 2, top + 20, '#ff5555');
    else if (!this.worlds.length) gui.textCentered('No worlds yet - create one!', W / 2, top + 20, '#a0a0a0');
    this.worlds.forEach((w, i) => {
      const y = top + 4 + i * 36 - this.scroll;
      if (y + 36 < top || y > bottom) return;
      if (i === this.sel) { ctx.fillStyle = '#808080'; ctx.fillRect(lx - 2, y - 2, lw + 4, 36); ctx.fillStyle = '#000000'; ctx.fillRect(lx - 1, y - 1, lw + 2, 34); }
      gui.text(w.name, lx + 2, y + 1, '#ffffff');
      gui.text((w.folder || w.id.slice(0, 8)) + ' (' + formatDate(w.lastPlayed || w.created) + ')', lx + 2, y + 12, '#808080');
      const mode = { survival: 'Survival Mode', creative: 'Creative Mode', hardcore: 'Hardcore Mode!' }[w.gameMode] || w.gameMode;
      gui.text(mode + (w.cheats ? ', Cheats' : '') + (w.worldType && w.worldType !== 'default' ? ', ' + worldTypeName(w.worldType) : ''), lx + 2, y + 22, w.gameMode === 'hardcore' ? '#ff5555' : '#808080');
    });
    ctx.restore();
    gui.textCentered(this.title, W / 2, 15, '#ffffff');
    for (const w of this.widgets) w.draw(gui, mx, my);
    if (this.status) gui.textCentered(this.status, W / 2, bottom + 2 - 12, '#ffff55');
  }
  mouseDown(mx, my, btn) {
    if (super.mouseDown(mx, my, btn)) return true;
    if (my >= this.listTop && my < this.listBottom) {
      const i = Math.floor((my - this.listTop - 4 + this.scroll) / 36);
      if (i >= 0 && i < this.worlds.length) {
        const now = performance.now();
        if (i === this.sel && now - this.lastClick < 400) this.play();
        this.sel = i; this.lastClick = now; this.updateButtons();
      }
    }
    return true;
  }
  wheel(d) {
    const max = Math.max(0, this.worlds.length * 36 + 8 - (this.listBottom - this.listTop));
    this.scroll = clamp(this.scroll + d * 18, 0, max);
  }
  keyDown(e) {
    if (e.key === 'ArrowDown') { this.sel = Math.min(this.worlds.length - 1, this.sel + 1); this.updateButtons(); return; }
    if (e.key === 'ArrowUp') { this.sel = Math.max(0, this.sel - 1); this.updateButtons(); return; }
    if (e.key === 'Enter') { this.play(); return; }
    super.keyDown(e);
  }
}
function worldTypeName(t) { return { default: 'Default', large: 'Large Biomes', islands: 'Archipelago', flat: 'Superflat' }[t] || t; }

// -------------------------------------------------------------------- create world
class CreateWorldScreen extends Screen {
  constructor(game, parent) {
    super(game); this.parent = parent; this.title = 'Create New World';
    this.name = 'New World'; this.seed = ''; this.mode = 'survival'; this.more = false;
    this.structures = true; this.worldType = 'default'; this.cheats = false; this.bonusChest = false;
  }
  init() {
    const W = this.W, H = this.H, cx = W / 2;
    this.nameField = this.add(new TextField(cx - 100, 60, 200, 20, this.name, 32));
    this.nameField.onChange = (t) => { this.name = t; };
    this.nameField.onEnter = () => this.create();
    this.seedField = this.add(new TextField(cx - 100, 60, 200, 20, this.seed, 32));
    this.seedField.onChange = (t) => { this.seed = t; };
    this.seedField.onEnter = () => this.create();
    this.bMode = this.add(new Button(cx - 75, 115, 150, 20, () => 'Game Mode: ' + { survival: 'Survival', hardcore: 'Hardcore', creative: 'Creative' }[this.mode], () => {
      this.mode = { survival: 'hardcore', hardcore: 'creative', creative: 'survival' }[this.mode];
      if (this.mode === 'creative') this.cheats = true; else if (this.mode === 'hardcore') this.cheats = false;
    }));
    this.bMore = this.add(new Button(cx - 75, 187, 150, 20, () => this.more ? 'Done' : 'More World Options...', () => { this.more = !this.more; this.sync(); }));
    this.bStruct = this.add(new Button(cx - 155, 100, 150, 20, () => 'Generate Structures: ' + (this.structures ? 'ON' : 'OFF'), () => { this.structures = !this.structures; }));
    this.bType = this.add(new Button(cx + 5, 100, 150, 20, () => 'World Type: ' + worldTypeName(this.worldType), () => {
      const order = ['default', 'large', 'islands', 'flat'];
      this.worldType = order[(order.indexOf(this.worldType) + 1) % order.length];
    }));
    this.bCheats = this.add(new Button(cx - 155, 151, 150, 20, () => 'Allow Cheats: ' + (this.cheats ? 'ON' : 'OFF'), () => { this.cheats = !this.cheats; }));
    this.bBonus = this.add(new Button(cx + 5, 151, 150, 20, () => 'Bonus Chest: ' + (this.bonusChest ? 'ON' : 'OFF'), () => { this.bonusChest = !this.bonusChest; }));
    this.add(new Button(cx - 155, H - 28, 150, 20, 'Create New World', () => this.create()));
    this.add(new Button(cx + 5, H - 28, 150, 20, 'Cancel', () => this.close()));
    this.sync();
  }
  sync() {
    const m = this.more;
    this.nameField.visible = !m; this.bMode.visible = !m;
    this.seedField.visible = m; this.bStruct.visible = m; this.bType.visible = m; this.bCheats.visible = m; this.bBonus.visible = m;
    this.bCheats.enabled = this.mode !== 'hardcore';
    if (!m && !this.nameField.focused) { this.nameField.focused = true; this.game.input.focusText(this.nameField); }
  }
  create() {
    if (this.creating) return;
    this.creating = true;
    let seed;
    const s = this.seed.trim();
    if (!s) seed = (Math.random() * 4294967296) | 0;
    else if (/^-?\d+$/.test(s) && Math.abs(Number(s)) < 2147483648) seed = Number(s) | 0;
    else seed = stringHash(s);
    const info = {
      name: this.name.trim() || 'New World', seed, gameMode: this.mode, worldType: this.worldType, structures: this.structures,
      cheats: this.mode === 'creative' ? this.cheats : (this.mode === 'hardcore' ? false : this.cheats), bonusChest: this.bonusChest,
      difficulty: this.mode === 'hardcore' ? 3 : 2,
    };
    this.game.input.focusText(null);
    this.game.createWorld(info);
  }
  draw(gui, mx, my) {
    gui.dirtBackground();
    const W = this.W, cx = W / 2;
    gui.textCentered(this.title, cx, 20, '#ffffff');
    if (!this.more) {
      gui.text('World Name', cx - 100, 47, '#a0a0a0');
      const desc = {
        survival: ['Search for resources, crafting, gain', 'levels, health and hunger'],
        hardcore: ['Same as survival mode, locked at hardest', 'difficulty, and one life only'],
        creative: ['Unlimited resources, free flying and', 'destroy blocks instantly'],
      }[this.mode];
      gui.text(desc[0], cx - 100, 137, '#a0a0a0'); gui.text(desc[1], cx - 100, 149, '#a0a0a0');
    } else {
      gui.text('Seed for the World Generator', cx - 100, 47, '#a0a0a0');
      gui.text('Leave blank for a random seed', cx - 100, 85, '#a0a0a0');
      gui.text('Villages, ruins, camps, craters...', cx - 155, 122, '#a0a0a0');
      gui.text('Commands like /gamemode', cx - 155, 173, '#a0a0a0');
    }
    for (const w of this.widgets) w.draw(gui, mx, my);
  }
  keyDown(e) { if (e.key === 'Enter') { this.create(); return; } super.keyDown(e); }
}

class RenameWorldScreen extends Screen {
  constructor(game, parent, info) { super(game); this.parent = parent; this.info = info; this.title = 'Rename World'; }
  init() {
    const cx = this.W / 2, H = this.H;
    this.field = this.add(new TextField(cx - 100, 60, 200, 20, this.info.name, 32));
    this.field.focused = true; this.game.input.focusText(this.field);
    this.field.onEnter = () => this.done();
    this.add(new Button(cx - 100, H / 4 + 96 + 12, 200, 20, 'Rename', () => this.done()));
    this.add(new Button(cx - 100, H / 4 + 120 + 12, 200, 20, 'Cancel', () => this.close()));
  }
  done() {
    const name = this.field.text.trim(); if (!name) return;
    this.game.storage.renameWorld(this.info.id, name).then(() => { this.close(); if (this.parent.refresh) this.parent.refresh(); });
  }
  draw(gui, mx, my) { super.draw(gui, mx, my); gui.text('World Name', this.W / 2 - 100, 47, '#a0a0a0'); }
}

class ConfirmScreen extends Screen {
  constructor(game, parent, line1, line2, yes, onYes, no) { super(game); this.parent = parent; this.l1 = line1; this.l2 = line2; this.yes = yes; this.onYes = onYes; this.no = no || 'Cancel'; }
  init() {
    const cx = this.W / 2, H = this.H;
    this.add(new Button(cx - 155, H / 6 + 96, 150, 20, this.yes, () => this.onYes()));
    this.add(new Button(cx + 5, H / 6 + 96, 150, 20, this.no, () => this.close()));
  }
  draw(gui, mx, my) {
    if (this.parent && this.parent.background === 'world') gui.worldOverlay(); else gui.dirtBackground();
    gui.textCentered(this.l1, this.W / 2, 70, '#ffffff');
    gui.textCentered(this.l2, this.W / 2, 90, '#a0a0a0');
    for (const w of this.widgets) w.draw(gui, mx, my);
  }
}

class MessageScreen extends Screen {
  constructor(game, parent, title, lines) { super(game); this.parent = parent; this.ttl = title; this.lines = lines || []; }
  init() { this.add(new Button(this.W / 2 - 100, this.H - 40, 200, 20, 'Done', () => this.close())); }
  draw(gui, mx, my) {
    gui.dirtBackground();
    gui.textCentered(this.ttl, this.W / 2, 20, '#ffffff');
    let y = 45;
    for (const l of this.lines) { for (const ln of gui.font.wrap(l, Math.min(360, this.W - 40))) { gui.textCentered(ln, this.W / 2, y, '#e0e0e0'); y += 11; } y += 4; }
    for (const w of this.widgets) w.draw(gui, mx, my);
  }
}

class AboutScreen extends MessageScreen {
  constructor(game, parent) {
    super(game, parent, 'About Blocklands', [
      '§eBlocklands§r is a love letter to the early days of block games: the sense of not knowing what lies over the next hill.',
      'Every texture, sound, tune and creature is generated by code - no original game assets are used.',
      'New to explore: Autumn Woods, Redwood Groves, Moorland stone circles, the Ashen Wastes, Salt Flats, Red Canyons, glowing lumite caves and falling stars.',
      '§7Not affiliated with or endorsed by Mojang or Microsoft.',
    ]);
  }
}

// -------------------------------------------------------------------- loading
class LoadingScreen extends Screen {
  constructor(game, text) { super(game); this.text = text || 'Loading world'; this.sub = 'Building terrain'; this.progress = 0; this.pauses = false; }
  draw(gui) {
    gui.dirtBackground(0, 0.75);
    gui.textCentered(this.text, this.W / 2, this.H / 2 - 20, '#ffffff');
    gui.textCentered(this.sub, this.W / 2, this.H / 2 + 0, '#ffffff');
    gui.progress(this.W / 2 - 50, this.H / 2 + 16, 100, this.progress);
  }
  keyDown() {}
  mouseDown() { return true; }
}

// -------------------------------------------------------------------- options
class OptionsScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Options'; if (parent && parent.background === 'world') this.background = 'world'; }
  init() {
    const g = this.game, s = g.settings, cx = this.W / 2, y0 = Math.floor(this.H / 6);
    this.add(new Slider(cx - 155, y0 - 12, 150, (v) => 'FOV: ' + (Math.round(30 + v * 80) === 70 ? 'Normal' : Math.round(30 + v * 80) === 110 ? 'Quake Pro' : Math.round(30 + v * 80)), (s.fov - 30) / 80, (v) => { s.fov = Math.round(30 + v * 80); g.saveSettings(); }, 80));
    const w = g.world;
    this.add(new Button(cx + 5, y0 - 12, 150, 20, () => 'Difficulty: ' + ['Peaceful', 'Easy', 'Normal', 'Hard'][w ? w.difficulty : 2], () => {
      if (!w || w.info.gameMode === 'hardcore') return;
      w.difficulty = (w.difficulty + 1) % 4; w.info.difficulty = w.difficulty;
    })).enabled = !!w && w.info.gameMode !== 'hardcore';
    this.add(new Button(cx - 155, y0 + 36, 150, 20, 'Skin Customization...', () => g.openScreen(new SkinScreen(g, this))));
    this.add(new Button(cx + 5, y0 + 36, 150, 20, 'Music & Sounds...', () => g.openScreen(new SoundScreen(g, this))));
    this.add(new Button(cx - 155, y0 + 60, 150, 20, 'Video Settings...', () => g.openScreen(new VideoScreen(g, this))));
    this.add(new Button(cx + 5, y0 + 60, 150, 20, 'Controls...', () => g.openScreen(new ControlsScreen(g, this))));
    this.add(new Button(cx - 155, y0 + 84, 150, 20, 'How to Play...', () => g.openScreen(new HowToPlayScreen(g, this))));
    this.add(new Button(cx + 5, y0 + 84, 150, 20, () => 'Touch Controls: ' + (s.touchControls ? 'ON' : 'OFF'), () => { s.touchControls = !s.touchControls; g.saveSettings(); g.updateTouch(); }));
    this.add(new Button(cx - 100, y0 + 144, 200, 20, 'Done', () => this.close()));
  }
}
class VideoScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Video Settings'; this.background = parent.background; }
  init() {
    const g = this.game, s = g.settings, cx = this.W / 2;
    const L = cx - 155, Rx = cx + 5;
    let y = Math.floor(this.H / 6) - 12;
    const row = () => { const r = y; y += 24; return r; };
    let r = row();
    this.add(new Button(L, r, 150, 20, () => 'Graphics: ' + (s.graphics === 'fancy' ? 'Fancy' : 'Fast'), () => { s.graphics = s.graphics === 'fancy' ? 'fast' : 'fancy'; g.saveSettings(); g.applyVideo(); }));
    this.add(new Slider(Rx, r, 150, (v) => 'Render Distance: ' + Math.round(2 + v * 14) + ' chunks', (s.renderDistance - 2) / 14, (v) => { s.renderDistance = Math.round(2 + v * 14); g.saveSettings(); }, 14));
    r = row();
    this.add(new Button(L, r, 150, 20, () => 'Smooth Lighting: ' + (s.smoothLighting ? 'ON' : 'OFF'), () => { s.smoothLighting = !s.smoothLighting; g.saveSettings(); g.applyVideo(); }));
    this.add(new Slider(Rx, r, 150, (v) => 'Max Framerate: ' + (v >= 1 ? 'Unlimited' : Math.round(30 + v * 230) + ' fps'), s.maxFps ? (s.maxFps - 30) / 230 : 1, (v) => { s.maxFps = v >= 1 ? 0 : Math.round(30 + v * 230); g.saveSettings(); }, 23));
    r = row();
    this.add(new Button(L, r, 150, 20, () => 'View Bobbing: ' + (s.viewBobbing ? 'ON' : 'OFF'), () => { s.viewBobbing = !s.viewBobbing; g.saveSettings(); }));
    this.add(new Button(Rx, r, 150, 20, () => 'GUI Scale: ' + (s.guiScale ? s.guiScale : 'Auto'), () => { s.guiScale = (s.guiScale + 1) % 5; g.saveSettings(); g.resize(); }));
    r = row();
    this.add(new Slider(L, r, 150, (v) => 'Brightness: ' + (v === 0 ? 'Moody' : v === 1 ? 'Bright' : '+' + Math.round(v * 100) + '%'), s.brightness, (v) => { s.brightness = v; g.saveSettings(); }));
    this.add(new Button(Rx, r, 150, 20, () => 'Clouds: ' + ({ fancy: 'Fancy', fast: 'Fast', off: 'OFF' }[s.clouds]), () => { s.clouds = { fancy: 'fast', fast: 'off', off: 'fancy' }[s.clouds]; g.saveSettings(); }));
    r = row();
    this.add(new Button(L, r, 150, 20, () => 'Particles: ' + ({ all: 'All', decreased: 'Decreased', minimal: 'Minimal' }[s.particles]), () => { s.particles = { all: 'decreased', decreased: 'minimal', minimal: 'all' }[s.particles]; g.saveSettings(); }));
    this.add(new Button(Rx, r, 150, 20, () => 'Mipmaps: ' + (s.mipmaps ? 'ON' : 'OFF') + ' (restart)', () => { s.mipmaps = !s.mipmaps; g.saveSettings(); }));
    r = row();
    this.add(new Slider(L, r, 150, (v) => 'Render Scale: ' + Math.round((0.5 + v * 0.5) * 100) + '%', (s.renderScale - 0.5) / 0.5, (v) => { s.renderScale = 0.5 + v * 0.5; g.saveSettings(); g.resize(); }, 10));
    this.add(new Button(Rx, r, 150, 20, () => 'Show FPS: ' + (s.showFps ? 'ON' : 'OFF'), () => { s.showFps = !s.showFps; g.saveSettings(); }));
    this.add(new Button(cx - 100, this.H - 27, 200, 20, 'Done', () => this.close()));
  }
}
class SoundScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Music & Sound Options'; this.background = parent.background; }
  init() {
    const g = this.game, s = g.settings, cx = this.W / 2;
    const y = Math.floor(this.H / 6) - 12;
    this.add(new Slider(cx - 155, y, 310, (v) => 'Music: ' + (v === 0 ? 'OFF' : Math.round(v * 100) + '%'), s.music, (v) => { s.music = v; g.saveSettings(); g.audio.setVolumes(s); }));
    this.add(new Slider(cx - 155, y + 24, 310, (v) => 'Sounds: ' + (v === 0 ? 'OFF' : Math.round(v * 100) + '%'), s.sound, (v) => { s.sound = v; g.saveSettings(); g.audio.setVolumes(s); }));
    this.add(new Button(cx - 155, y + 48, 310, 20, 'Play a Tune Now', () => g.music.playNow()));
    this.add(new Button(cx - 100, this.H / 6 + 168, 200, 20, 'Done', () => this.close()));
  }
}
class ControlsScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Controls'; this.background = parent.background; }
  init() {
    const g = this.game, s = g.settings, cx = this.W / 2;
    const y = 32;
    this.add(new Slider(cx - 155, y, 150, (v) => 'Sensitivity: ' + (v === 0 ? '*yawn*' : v === 1 ? 'HYPERSPEED!!!' : Math.round(v * 200) + '%'), s.sensitivity, (v) => { s.sensitivity = v; g.saveSettings(); }));
    this.add(new Button(cx + 5, y, 150, 20, () => 'Invert Mouse: ' + (s.invertMouse ? 'ON' : 'OFF'), () => { s.invertMouse = !s.invertMouse; g.saveSettings(); }));
    this.add(new Slider(cx - 155, y + 24, 150, (v) => 'Touch Look: ' + Math.round(v * 200) + '%', s.touchSensitivity, (v) => { s.touchSensitivity = v; g.saveSettings(); }));
    this.add(new Button(cx + 5, y + 24, 150, 20, () => 'Auto-Jump: ' + (s.autoJump ? 'ON' : 'OFF'), () => { s.autoJump = !s.autoJump; g.saveSettings(); }));
    this.add(new Button(cx - 100, this.H - 27, 200, 20, 'Done', () => this.close()));
  }
  draw(gui, mx, my) {
    super.draw(gui, mx, my);
    const rows = [['Move', 'W A S D'], ['Jump / Swim / Fly up', 'Space'], ['Sneak / Fly down', 'Shift'], ['Sprint', 'Ctrl or double-tap W'], ['Inventory', 'E'], ['Drop item', 'Q (Ctrl+Q: stack)'],
      ['Hotbar', '1-9 / mouse wheel'], ['Swap offhand', 'F'], ['Pick block', 'Middle click'], ['Chat / commands', 'T  /  /'], ['Explorer\'s Journal / Map', 'J / M'], ['Hide HUD / Screenshot', 'F1 / F2'], ['Debug screen', 'F3'], ['Third person', 'F5'], ['Fullscreen', 'F11']];
    let y = 86;
    for (const [a, b] of rows) {
      if (y > this.H - 40) break;
      gui.textRight(a, this.W / 2 - 6, y, '#e0e0e0'); gui.text(b, this.W / 2 + 6, y, '#ffff80');
      y += 10;
    }
  }
}
class SkinScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Skin Customization'; this.background = parent.background; }
  init() {
    const g = this.game, s = g.settings, cx = this.W / 2, y = Math.floor(this.H / 6);
    const skins = ['wanderer', 'explorer', 'miner'];
    const names = { wanderer: 'Wanderer', explorer: 'Explorer', miner: 'Miner', custom: 'Custom' };
    this.add(new Button(cx - 100, y, 200, 20, () => 'Skin: ' + names[s.skin], () => {
      const all = s.customSkin ? skins.concat(['custom']) : skins;
      s.skin = all[(all.indexOf(s.skin) + 1) % all.length]; g.saveSettings();
    }));
    this.add(new Button(cx - 100, y + 24, 200, 20, 'Load Skin from PNG (64x32)...', () => {
      pickFile('image/png').then((f) => { if (f) g.loadCustomSkin(f); });
    }));
    this.add(new Button(cx - 100, y + 48, 200, 20, () => 'Name: ' + s.username, () => g.openScreen(new NameScreen(g, this))));
    this.add(new Button(cx - 100, this.H / 6 + 168, 200, 20, 'Done', () => this.close()));
  }
}
class NameScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Your Name'; this.background = parent.background; }
  init() {
    const cx = this.W / 2;
    this.f = this.add(new TextField(cx - 100, 60, 200, 20, this.game.settings.username, 16));
    this.f.focused = true; this.game.input.focusText(this.f);
    this.f.onEnter = () => this.done();
    this.add(new Button(cx - 100, 100, 200, 20, 'Done', () => this.done()));
  }
  done() { const n = this.f.text.trim(); if (n) { this.game.settings.username = n; this.game.saveSettings(); } this.close(); }
}

// -------------------------------------------------------------------- in-game
class PauseScreen extends Screen {
  constructor(game) { super(game); this.title = 'Game menu'; this.background = 'world'; }
  init() {
    const g = this.game, cx = this.W / 2, y = Math.floor(this.H / 4) + 8;
    this.add(new Button(cx - 100, y, 200, 20, 'Back to Game', () => g.closeScreen()));
    this.add(new Button(cx - 100, y + 24, 98, 20, 'Journal', () => g.openScreen(new JournalScreen(g, this))));
    this.add(new Button(cx + 2, y + 24, 98, 20, 'Statistics', () => g.openScreen(new StatsScreen(g, this))));
    this.add(new Button(cx - 100, y + 48, 98, 20, 'Options...', () => g.openScreen(new OptionsScreen(g, this))));
    this.add(new Button(cx + 2, y + 48, 98, 20, 'Export World', () => g.exportCurrentWorld()));
    this.add(new Button(cx - 100, y + 96, 200, 20, 'Save and Quit to Title', () => g.quitToTitle()));
  }
  draw(gui, mx, my) {
    super.draw(gui, mx, my);
    if (this.game.saveStatus) gui.textCentered(this.game.saveStatus, this.W / 2, this.H - 14, '#a0a0a0');
  }
  close() { this.game.closeScreen(); }
}
class StatsScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.title = 'Statistics'; this.background = 'world'; }
  init() { this.add(new Button(this.W / 2 - 100, this.H - 30, 200, 20, 'Done', () => this.close())); }
  draw(gui, mx, my) {
    super.draw(gui, mx, my);
    const p = this.game.player, st = p.stats;
    const min = Math.floor(st.playTime / 1200);
    const rows = [['Time played', Math.floor(min / 60) + 'h ' + (min % 60) + 'm'], ['Distance travelled', (st.distance / 1000).toFixed(2) + ' km'], ['Blocks mined', st.blocksMined], ['Items crafted', st.itemsCrafted],
      ['Jumps', st.jumps], ['Mobs killed', st.mobsKilled], ['Damage taken', Math.round(st.damageTaken)], ['Deaths', st.deaths],
      ['Biomes discovered', Object.keys(p.discovered.biomes).length + ' / ' + BIOMES.filter(Boolean).length], ['Creatures seen', Object.keys(p.discovered.mobs).length],
      ['Fish caught', st.fishCaught || 0], ['Distance by boat', ((st.sailed || 0) / 1000).toFixed(2) + ' km']];
    let y = 40;
    for (const [a, b] of rows) { gui.text(a, this.W / 2 - 110, y, '#e0e0e0'); gui.textRight(String(b), this.W / 2 + 110, y, '#ffff80'); y += 12; }
  }
}
class DeathScreen extends Screen {
  constructor(game) { super(game); this.background = 'none'; this.ticks = 0; this.pauses = false; }
  init() {
    const g = this.game, cx = this.W / 2, y = Math.floor(this.H / 4);
    const hardcore = g.world && g.world.info.gameMode === 'hardcore';
    if (hardcore) {
      this.add(new Button(cx - 100, y + 72, 200, 20, 'Delete world', () => g.deleteCurrentWorld()));
    } else {
      this.add(new Button(cx - 100, y + 72, 200, 20, 'Respawn', () => g.respawn()));
      this.add(new Button(cx - 100, y + 96, 200, 20, 'Title screen', () => g.quitToTitle()));
    }
    for (const w of this.widgets) w.enabled = this.ticks >= 20;
  }
  tick() { this.ticks++; if (this.ticks === 20) for (const w of this.widgets) w.enabled = true; }
  draw(gui, mx, my) {
    gui.gradient(0, 0, this.W, this.H, 'rgba(80,0,0,0.38)', 'rgba(128,48,48,0.63)');
    const hardcore = this.game.world && this.game.world.info.gameMode === 'hardcore';
    const t = hardcore ? 'Game over!' : 'You died!';
    const tw = gui.textWidth(t) * 2;
    gui.textScaled(t, Math.floor(this.W / 2 - tw / 2), 30, '#ffffff', 2);
    if (hardcore) gui.textCentered('You cannot respawn in hardcore mode!', this.W / 2, 144, '#ffffff');
    if (this.game.deathMessage) gui.textCentered(this.game.deathMessage, this.W / 2, 85, '#ffffff');
    gui.textCentered('Score: §e' + this.game.player.score, this.W / 2, 100, '#ffffff');
    for (const w of this.widgets) w.draw(gui, mx, my);
  }
  keyDown() {}
}

// -------------------------------------------------------------------- how to play (legacy console style pages)
const HOW_TO_PLAY = [
  ['Basics', 'Look around with the mouse and move with W A S D. Jump with Space, sneak with Shift (you will not fall off edges while sneaking) and sprint with Ctrl or by double-tapping W.', 'Hold the left mouse button to break blocks and attack. Use the right mouse button to place blocks, open things and use items. Scroll or press 1-9 to pick a hotbar slot.'],
  ['Your First Day', 'Punch a tree to collect logs, then open your inventory (E) and turn them into planks in the 2x2 crafting grid. Four planks make a Crafting Table: place it to unlock the 3x3 grid.', 'Craft a wooden pickaxe, find stone, and upgrade. Before night falls, build a shelter and light it with torches (coal on a stick) - monsters spawn in the dark.'],
  ['Survival', 'Your health regenerates while your hunger bar is nearly full. Eat by holding the right mouse button with food selected. Sprinting, jumping and fighting make you hungry faster.', 'Falling from high places, drowning, fire, lava and monsters all hurt. Wear armour to take less damage. If you die you drop your items where you fell.'],
  ['Mining & Smelting', 'Ores hide underground: coal, iron, gold, ember, lapis, diamonds - and new finds like cobalt deep in slate, sulfur near lava and jade in high places.', 'Smelt ores in a Furnace with fuel such as coal, charcoal, wood or peat. Better pickaxes mine harder materials: some ores need iron or diamond tools.'],
  ['Farming', 'Till grass or dirt with a hoe and plant seeds near water. Crops need light to grow. Bone meal speeds up growth.', 'Animals give food, leather and wool. Shear sheep for wool and use buckets to collect milk. Brambles in the forest give berries you can bake into pies.'],
  ['Companions', 'Wolves roam forests and taigas in packs. Strike one and the whole pack turns on you - but offer a wild wolf bones and it may become your companion. A collar shows it is yours.', 'Right-click your wolf to make it sit or follow. It fights at your side and keeps up wherever you go. Feed it meat to heal it, breed two tame wolves with meat, and dye its collar any colour you like.'],
  ['Exploration', 'The world is huge. Biomes have their own plants, creatures and treasures: look for camps, ruined towers, hermit huts, desert wells and sunken ruins.', 'Your Explorer\'s Map (M) fills in as you travel, and your Explorer\'s Journal (J) records every biome and creature you discover. Some secrets are rare - keep travelling!'],
  ['Waterways', 'Craft a boat from five planks to cross lakes and seas: right-click to climb in, steer with W and the mouse, and press Shift to hop out. Do not ram the shore at full speed!', 'Cast a fishing rod into water and wait for the float to dip, then reel in. Different waters hold different fish, and now and then a bottle washes up with a note about buried treasure.'],
  ['Ember Circuits', 'Ember dust laid on the ground carries power from levers, buttons, pressure plates and ember torches, growing weaker with every block. Ember torches invert a signal, relays repeat and delay it.', 'Powered lamps light up, doors and trapdoors swing open, TNT ignites, note blocks sing and pistons push (sticky pistons pull too). Build gates, clocks and secret doors - just like the old days.'],
  ['Enchanting', 'Build an enchanting table from a book, two diamonds and obsidian. Surround it with bookshelves (one block of air between them and the table) and it grows stronger - fifteen shelves is the most it can use.', 'Put in a tool, weapon, armour piece, bow or rod and some lapis lazuli, then choose one of three offers. Stronger offers cost more experience levels and lapis. The runes only hint at what you will get...'],
  ['Mysteries', 'On clear nights, watch the sky. Falling stars leave craters lined with starmetal - the strongest material of all, but you will need a diamond pickaxe.', 'Lights drift over swamps after dark. Some say they lead to buried treasure. On the moors, ancient runestones hum when touched with jade...'],
  ['Creative Mode', 'In Creative mode you can fly (double-tap Space), break blocks instantly and take any block from the creative inventory (E).', 'Worlds with cheats enabled accept commands: open chat with T and type /help.'],
  ['Saving & Sharing', 'Your worlds save automatically in your browser. Use Export on the world list (or in the pause menu) to download a .blocklands file.', 'Import it on any device - including your phone - to continue where you left off or share your world with friends.'],
];
class HowToPlayScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.page = 0; if (parent && parent.background === 'world') this.background = 'world'; }
  init() {
    const cx = this.W / 2, H = this.H;
    this.add(new Button(cx - 155, H - 28, 100, 20, '< Previous', () => { this.page = (this.page + HOW_TO_PLAY.length - 1) % HOW_TO_PLAY.length; }));
    this.add(new Button(cx - 50, H - 28, 100, 20, 'Done', () => this.close()));
    this.add(new Button(cx + 55, H - 28, 100, 20, 'Next >', () => { this.page = (this.page + 1) % HOW_TO_PLAY.length; }));
  }
  draw(gui, mx, my) {
    this.drawBackground(gui);
    const [title, ...paras] = HOW_TO_PLAY[this.page];
    gui.textCentered('How to Play', this.W / 2, 12, '#a0a0a0');
    gui.textScaled(title, Math.floor(this.W / 2 - gui.textWidth(title)), 26, '#ffff55', 2);
    let y = 52;
    const width = Math.min(340, this.W - 40);
    for (const p of paras) { for (const l of gui.font.wrap(p, width)) { gui.text(l, Math.floor(this.W / 2 - width / 2), y, '#e0e0e0'); y += 11; } y += 8; }
    gui.textCentered((this.page + 1) + ' / ' + HOW_TO_PLAY.length, this.W / 2, this.H - 42, '#808080');
    for (const w of this.widgets) w.draw(gui, mx, my);
  }
  keyDown(e) {
    if (e.key === 'ArrowRight') { this.page = (this.page + 1) % HOW_TO_PLAY.length; return; }
    if (e.key === 'ArrowLeft') { this.page = (this.page + HOW_TO_PLAY.length - 1) % HOW_TO_PLAY.length; return; }
    super.keyDown(e);
  }
}
