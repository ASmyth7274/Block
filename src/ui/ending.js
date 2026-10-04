'use strict';
// ---------------------------------------------------------------------------
// The way home from the Far Isles, the first time: a poem and the credits,
// rising slowly through a field of stars. Hold a key (or touch) to hurry it,
// Escape to skip.
// ---------------------------------------------------------------------------
const ENDING_TEXT = [
  '§bTHE LONG WAY HOME', '',
  'The first morning, you had nothing.',
  'A hill of grass. A square sun.',
  'A tree that let you take it apart, piece by piece.', '',
  'You did not know the rules,',
  'so you made some up.',
  'Wood becomes planks. Planks become a table.',
  'A table becomes everything else.', '',
  'That first night was long.',
  'You dug into a hillside and shut the door behind you with dirt,',
  'and listened to the things that walk in the dark,',
  'and waited for the light.', '',
  'It came. It always comes.',
  'That was the first thing the world taught you.', '',
  '§dThen you went looking.', '',
  'Down, through stone that rang under your pick,',
  'past seams of coal and iron, past water falling in the dark,',
  'to where the lava lights the caves from below.', '',
  'Out, across plains and moors and autumn woods,',
  'to villages where people trade in jade',
  'and every house has a door you could knock on.', '',
  'Through a frame of black glass into a hotter country,',
  'where the wailers weep and the charred keep their old forts,',
  'and back again, with your hands full.', '',
  'You followed a seeker\'s eye into the earth,',
  'and found the Vaults, and the frame, and the twelve empty sockets.',
  'You filled them. You stepped through.', '',
  'And here, at the edge of everything,',
  'past the last of the stone and the last of the sky,',
  'the Starwyrm waited, as it had always waited,',
  'for someone stubborn enough to come.', '',
  '§dYou were stubborn enough.', '', '', '',
  'Listen.', '',
  'Nothing you built was ever small.',
  'A dirt hut is a promise: I will be here tomorrow.',
  'A torch on a cave wall is a promise: I will find my way back.',
  'A bridge across the void is a promise: I am not finished.', '',
  'The world is made of little squares,',
  'and so is everything worth making.',
  'One at a time. Then another. Then another.', '',
  'There are isles beyond these isles.',
  'There are seas no one has sailed and caves no one has lit.',
  'There are mountains you walked past without climbing.', '',
  '§dThey will keep.', '',
  'Go home now. Sleep in your own bed.',
  'Wake to the square sun over the hill of grass.', '',
  'The world is still out there,',
  'and it is still yours,',
  'and it is not finished either.',
  '', '', '', '', '', '',
  '§e§lBLOCKLANDS', '',
  '§7for the days when the world was new',
  '§7and nobody had mapped it yet', '', '', '',
  '§bWorlds, creatures & words', 'made for you', '',
  '§bMusic', 'composed fresh, every time,', 'by the little piano inside your computer', '',
  '§bEvery texture', 'painted pixel by pixel', '', '', '',
  '§7With thanks to everyone who ever',
  '§7built a dirt hut on the first night,',
  '§7lost a pickaxe to lava,',
  '§7or walked a little further',
  '§7just to see what was over the next hill.', '', '', '', '',
  '§fThank you for playing.',
];

class EndingScreen extends Screen {
  constructor(game, onDone) {
    super(game);
    this.background = 'none';
    this.onDone = onDone;
    this.scroll = 0; this.prevScroll = 0;
    this.fast = false; this.held = 0;
    this.done = false;
    const rng = new Noise.Random(5150);
    this.stars = Array.from({ length: 160 }, () => [rng.nextFloat(), rng.nextFloat(), 0.3 + rng.nextFloat() * 0.7, rng.nextFloat() * TAU]);
    this.t = 0;
    if (game.music) { game.music.stop(2); game.music.nextStart = performance.now() + 2500; game.music.forceMood = 'ending'; }
  }
  tick() {
    this.t++;
    this.prevScroll = this.scroll;
    this.scroll += (this.fast || this.held > 0 ? 2.4 : 0.55);
    if (this.held > 0) this.held--;
    const total = ENDING_TEXT.length * 12 + this.H + 40;
    if (this.scroll > total) this.close();
  }
  draw(gui, mx, my) {
    const W = this.W, H = this.H, ctx = gui.ctx;
    gui.rect(0, 0, W, H, '#05030a');
    // the stars drift up behind the words, more slowly
    for (const [sx, sy, b, ph] of this.stars) {
      const y = ((sy * H - this.scroll * 0.25 * b) % H + H) % H;
      const tw = 0.6 + 0.4 * Math.sin(this.t * 0.07 + ph);
      const v = Math.floor(120 + 135 * b * tw);
      gui.rect(Math.floor(sx * W), Math.floor(y), b > 0.85 ? 2 : 1, b > 0.85 ? 2 : 1, 'rgb(' + Math.floor(v * 0.85) + ',' + Math.floor(v * 0.8) + ',' + v + ')');
    }
    const y0 = H + 20 - this.scroll;
    ENDING_TEXT.forEach((line, i) => {
      const y = Math.floor(y0 + i * 12);
      if (y < -12 || y > H + 12 || !line) return;
      const big = line.indexOf('§l') >= 0;
      const fade = Math.min(1, Math.min(y + 12, H - y) / 40);
      ctx.globalAlpha = clamp(fade, 0, 1);
      if (big) { const s = line.replace(/§./g, ''); gui.textScaled(s, Math.floor(W / 2 - gui.textWidth(s)), y - 4, '#ffe866', 2, true); }
      else gui.textCentered(line, W / 2, y, '#e8e4f4', true);
      ctx.globalAlpha = 1;
    });
    if (this.t < 200) { ctx.globalAlpha = clamp((200 - this.t) / 60, 0, 1); gui.textRight(this.game.touch && this.game.touch.active ? 'Tap and hold to hurry' : 'Hold any key to hurry, Esc to skip', W - 4, 4, '#6a6480'); ctx.globalAlpha = 1; }
  }
  keyDown(e) { if (e.key === 'Escape') { this.close(); return; } this.fast = true; }
  keyUp() { this.fast = false; }
  mouseDown() { this.fast = true; return true; }
  mouseUp() { this.fast = false; }
  close() {
    if (this.done) return;
    this.done = true;
    if (this.game.music && this.game.music.forceMood === 'ending') this.game.music.forceMood = null;
    this.game.openScreen(null);
    if (this.onDone) this.onDone();
  }
}
