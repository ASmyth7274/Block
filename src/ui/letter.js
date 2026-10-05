'use strict';
// ---------------------------------------------------------------------------
// Lost letters: notes, lists and love letters that went astray and sifted
// down into the Sift. Each letter's damage value says which one it is.
// ---------------------------------------------------------------------------
const LOST_LETTERS = [
  ['To whoever finds this -', 'I left my pickaxe by the river, the good one, the one with the chip in the handle. If you see it, it\'s yours now. I\'ve made peace with it. Mostly.', '- R.'],
  ['Dear Mum,', 'The village here trades in jade, of all things. I bought a map off a fisherman. It shows an X on a beach. I am going to dig until I find it or the sun comes up. Don\'t worry.', '- your loving Tam'],
  ['Note to self:', 'Do NOT dig straight down.', 'Do NOT dig straight down.', '(I dug straight down.)'],
  ['Wren,', 'The city under the hill is not empty. Something down there is listening. We took off our boots and walked on wool, and still the floor clicked under us like teeth. Don\'t follow.', '- Ash'],
  ['To buy:', 'Wool (lots)', 'Torches', 'Bread', 'Something for the noise', 'A better door'],
  ['If you are reading this, the Sift has you too. Don\'t panic. Sit by the gate. Things come down from above in their own time - buckets, boots, a whole cart once. Someone up there is very careless. I like them.'],
  ['To the one who keeps leaving torches in my cave:', 'Thank you.', '- the bat'],
  ['I named the wolf Biscuit. Biscuit does not answer to Biscuit. Biscuit answers to bones. We understand each other.'],
  ['Dear Stranger,', 'I see you at the edge of the trees every evening. You never come closer. I\'ve left a chair out on the porch. It is a nice chair.', '- the house on the hill'],
  ['Day forty on the isles. The tall black spires sing when the wind moves. Something circles overhead, too big to be a bird. I have stopped looking up.'],
  ['Bramble Pie, as my grandmother made it (she never measured anything):', 'berries, enough', 'sugar, more than that', 'an egg, if the hens agree'],
  ['To the cartographers\' guild:', 'Your map of the eastern moors is wrong. The stones move. Please stop sending people out there with it.', '- a concerned shepherd'],
  ['I followed the light over the swamp for three nights. On the fourth it stopped, and hovered, and waited for me to dig. I found a chest of gold and a very rude note from a pirate.'],
  ['My dearest -', 'The Underworld is hot and loud and the wailers cry all night. But I brought you a flower from the bone shoals. It is red, and it bites. I think you\'ll like it.'],
  ['Lost: one saddle, brown leather, well loved. Last seen on a pig that is no longer speaking to me.'],
  ['To whoever built the stone circle on the moor:', 'Please put my sheep back.'],
  ['They say if you drop something and walk away long enough, it ends up here. So here is my letter, dropped on purpose. Hello, future me. Did you ever finish the castle?'],
  ['There is a door in the dunes with nothing behind it. I walked through it twelve times. On the thirteenth I came out somewhere else. I am writing this from somewhere else.'],
  ['The grains fall here as they fall in the gate. Look closely: every speck is something somebody lost. Most of them are socks.'],
  ['To the miner who keeps blowing up the hill by my house:', 'I have counted eleven craters.', 'This is not a cave. It is my garden.'],
  ['Ma, I\'m fine. The Listener didn\'t hear me. Well - it heard me, but I was faster. Mostly faster. Please send more wool.'],
  ['Somewhere under the deepest hollow in the Sift there is a cave full of bells. When the sand shifts, they ring. I have never found it. I have heard it every night.'],
  ['If found, please return to:', 'the second village past the big oak,', 'the house with the blue door,', 'care of Old Marrow.', '(He\'ll know.)'],
  ['Do not trust the gleaners. They are small and they are sweet and they will take your boots while you are still in them.'],
];
function lostLetter(d) { return LOST_LETTERS[(d >>> 0) % LOST_LETTERS.length]; }

class LetterScreen extends Screen {
  constructor(game, d) {
    super(game);
    this.background = 'world';
    this.lines = lostLetter(d);
    this.pauses = false;
  }
  draw(gui, mx, my) {
    gui.worldOverlay();
    const W = 230, font = gui.font;
    const wrapped = [];
    this.lines.forEach((l, i) => { if (i) wrapped.push(''); for (const s of font.wrap(l, W - 30)) wrapped.push(s); });
    const H = wrapped.length * 10 + 46, x = Math.floor(this.W / 2 - W / 2), y = Math.floor(Math.max(8, this.H / 2 - H / 2));
    // a sheet of old paper, a little foxed at the edges
    gui.rect(x - 1, y - 1, W + 2, H + 2, '#5a4a30');
    gui.rect(x, y, W, H, '#e2d6b4');
    gui.rect(x + 2, y + 2, W - 4, H - 4, '#e9dec0');
    for (let k = 0; k < 18; k++) { const px = x + 3 + ((k * 53) % (W - 8)), py = y + 3 + ((k * 31) % (H - 8)); gui.rect(px, py, 2, 1, '#d4c6a0'); }
    gui.textCentered('A Lost Letter', this.W / 2, y + 8, '#6a4a22');
    wrapped.forEach((s, i) => gui.text(s, x + 15, y + 24 + i * 10, '#3a2a18'));
    // a broken wax seal
    gui.rect(x + W - 22, y + H - 20, 10, 10, '#8a1a1a'); gui.rect(x + W - 20, y + H - 18, 6, 6, '#b8302a'); gui.rect(x + W - 18, y + H - 16, 2, 2, '#e0605a');
    gui.textCentered(this.game.touch && this.game.touch.active ? 'Tap to put it away' : 'Click or press Esc to put it away', this.W / 2, y + H + 8, '#bbbbbb', true);
  }
  keyDown(e) { if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') this.game.closeScreen(); }
  mouseDown() { this.game.closeScreen(); return true; }
}
