'use strict';
// ---------------------------------------------------------------------------
// Chat screen & commands
// ---------------------------------------------------------------------------
class ChatScreen extends Screen {
  constructor(game, initial) { super(game); this.background = 'none'; this.initial = initial || ''; this.pauses = false; this.histIdx = -1; }
  init() {
    this.field = this.add(new TextField(2, this.H - 14, this.W - 4, 12, this.initial, 256));
    this.field.focused = true;
    this.game.input.focusText(this.field);
    this.field.onEnter = (t) => this.send(t);
  }
  send(t) {
    t = t.trim();
    const g = this.game;
    if (t) {
      g.chatHistory.push(t);
      if (t.startsWith('/')) Commands.run(g, t.slice(1));
      else g.hud.message('<' + g.settings.username + '> ' + t);
    }
    g.closeScreen();
  }
  draw(gui, mx, my) {
    const ctx = gui.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(2, this.H - 14, this.W - 4, 12);
    this.game.hud.drawChat(gui, true);
    this.field.draw(gui, mx, my);
    if (this.field.text.startsWith('/')) {
      const sug = Commands.suggest(this.field.text.slice(1));
      if (sug.length) {
        let y = this.H - 26 - (sug.length - 1) * 10;
        for (const s of sug.slice(0, 8)) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(2, y - 1, gui.textWidth('/' + s) + 4, 10); gui.text('/' + s, 4, y, '#a0a0a0'); y += 10; }
      }
    }
  }
  keyDown(e) {
    const h = this.game.chatHistory;
    if (e.key === 'Escape') { this.game.closeScreen(); return; }
    if (e.key === 'Enter') { this.send(this.field.text); return; }
    if (e.key === 'ArrowUp' && h.length) { this.histIdx = this.histIdx < 0 ? h.length - 1 : Math.max(0, this.histIdx - 1); this.field.setText(h[this.histIdx]); this.game.input.focusText(this.field); return; }
    if (e.key === 'ArrowDown' && this.histIdx >= 0) { this.histIdx++; if (this.histIdx >= h.length) { this.histIdx = -1; this.field.setText(''); } else this.field.setText(h[this.histIdx]); this.game.input.focusText(this.field); return; }
    if (e.key === 'Tab') {
      const sug = Commands.suggest(this.field.text.slice(1));
      if (this.field.text.startsWith('/') && sug.length) { this.field.setText('/' + sug[0] + ' '); this.game.input.focusText(this.field); }
    }
  }
  mouseDown(mx, my, btn) {
    // on touch screens, tapping above the input box closes the chat
    if (this.game.touch && this.game.touch.active && my < this.H - 18) { this.game.closeScreen(); return true; }
    super.mouseDown(mx, my, btn); this.field.focused = true; this.game.input.focusText(this.field); return true;
  }
}

const Commands = (() => {
  const C = {};
  const ok = (g, m) => g.hud.message(m, '#a0a0a0');
  const err = (g, m) => g.hud.message(m, '#ff5555');
  const coord = (s, base) => { if (s === undefined) return NaN; if (s.startsWith('~')) return base + (s.length > 1 ? parseFloat(s.slice(1)) : 0); return parseFloat(s); };
  const findItem = (name) => {
    name = name.toLowerCase().replace(/^minecraft:|^blocklands:/, '');
    if (ITEM_IDS[name] !== undefined) return ITEM_IDS[name];
    if (BLOCK_KEYS[name] !== undefined) return BLOCK_KEYS[name];
    if (/^\d+$/.test(name)) return parseInt(name, 10);
    // fuzzy: by display name
    for (let i = 1; i < 1024; i++) { if (itemExists(i) && itemName(i, 0).toLowerCase().replace(/ /g, '_') === name) return i; }
    return -1;
  };
  const cmd = (name, usage, cheat, fn) => { C[name] = { usage, cheat, fn }; };
  cmd('help', '/help', false, (g) => {
    ok(g, '--- Commands (cheats ' + (g.world.info.cheats ? 'on' : 'off') + ') ---');
    for (const k in C) ok(g, C[k].usage);
  });
  cmd('gamemode', '/gamemode <survival|creative>', true, (g, a) => {
    const m = { 0: 'survival', s: 'survival', survival: 'survival', 1: 'creative', c: 'creative', creative: 'creative' }[(a[0] || '').toLowerCase()];
    if (!m) return err(g, 'Usage: /gamemode <survival|creative>');
    g.player.setGameMode(m); ok(g, 'Set own game mode to ' + m[0].toUpperCase() + m.slice(1) + ' Mode');
  });
  cmd('time', '/time <set|add> <value|day|night>', true, (g, a) => {
    const w = g.world;
    if (a[0] === 'query') return ok(g, 'The time is ' + (w.dayTime % 24000));
    const v = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 }[a[1]] !== undefined ? { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 }[a[1]] : parseInt(a[1], 10);
    if (isNaN(v)) return err(g, 'Usage: /time <set|add> <value>');
    if (a[0] === 'set') w.dayTime = Math.floor(w.dayTime / 24000) * 24000 + v; else if (a[0] === 'add') w.dayTime += v; else return err(g, 'Usage: /time <set|add> <value>');
    ok(g, 'Set the time to ' + (w.dayTime % 24000));
  });
  cmd('weather', '/weather <clear|rain|thunder> [seconds]', true, (g, a) => {
    const w = g.world, d = (parseInt(a[1], 10) || 300 + Math.floor(Math.random() * 600)) * 20;
    if (a[0] === 'clear') { w.raining = false; w.thundering = false; w.rainTime = d; w.thunderTime = d; }
    else if (a[0] === 'rain') { w.raining = true; w.thundering = false; w.rainTime = d; }
    else if (a[0] === 'thunder') { w.raining = true; w.thundering = true; w.rainTime = d; w.thunderTime = d; }
    else return err(g, 'Usage: /weather <clear|rain|thunder>');
    ok(g, 'Changing to ' + a[0] + ' weather');
  });
  cmd('tp', '/tp <x> <y> <z>', true, (g, a) => {
    const p = g.player;
    const x = coord(a[0], p.x), y = coord(a[1], p.y), z = coord(a[2], p.z);
    if ([x, y, z].some(isNaN)) return err(g, 'Usage: /tp <x> <y> <z>');
    p.setPos(x, y, z); p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
    ok(g, 'Teleported to ' + x.toFixed(1) + ', ' + y.toFixed(1) + ', ' + z.toFixed(1));
  });
  cmd('give', '/give <item> [count] [data]', true, (g, a) => {
    if (!a[0]) return err(g, 'Usage: /give <item> [count] [data]');
    const id = findItem(a[0]);
    if (id < 0 || !itemExists(id)) return err(g, 'Unknown item: ' + a[0]);
    const n = Math.max(1, Math.min(64 * 36, parseInt(a[1], 10) || 1)), d = parseInt(a[2], 10) || 0;
    let left = n;
    while (left > 0) { const k = Math.min(left, maxStackOf(id)); g.giveItem(new ItemStack(id, k, d)); left -= k; }
    ok(g, 'Given [' + itemName(id, d) + '] * ' + n);
  });
  cmd('kill', '/kill', false, (g) => { g.player.hurt(1000, { type: 'void' }); });
  cmd('seed', '/seed', false, (g) => ok(g, 'Seed: ' + g.world.seed));
  cmd('difficulty', '/difficulty <peaceful|easy|normal|hard>', true, (g, a) => {
    const d = { peaceful: 0, p: 0, 0: 0, easy: 1, e: 1, 1: 1, normal: 2, n: 2, 2: 2, hard: 3, h: 3, 3: 3 }[(a[0] || '').toLowerCase()];
    if (d === undefined) return err(g, 'Usage: /difficulty <peaceful|easy|normal|hard>');
    g.world.difficulty = d; g.world.info.difficulty = d; ok(g, 'Set game difficulty to ' + ['Peaceful', 'Easy', 'Normal', 'Hard'][d]);
  });
  cmd('spawnpoint', '/spawnpoint', true, (g) => { const p = g.player; p.spawnPoint = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), forced: true }; ok(g, 'Set spawn point'); });
  cmd('summon', '/summon <creature> [x y z]', true, (g, a) => {
    const p = g.player;
    const t = (a[0] || '').toLowerCase();
    if (!MOB_TYPES.some((m) => m && m.key === t)) return err(g, 'Unknown creature. Try: ' + MOB_TYPES.filter(Boolean).map((m) => m.key).join(', '));
    const x = a.length >= 4 ? coord(a[1], p.x) : p.x - Math.sin(p.yaw) * 2, y = a.length >= 4 ? coord(a[2], p.y) : p.y, z = a.length >= 4 ? coord(a[3], p.z) : p.z - Math.cos(p.yaw) * 2;
    g.spawnMob(t, x, y, z); ok(g, 'Object successfully summoned');
  });
  cmd('clear', '/clear', true, (g) => { g.player.inventory.main.clear(); g.player.inventory.armor.clear(); g.player.inventory.offhand.clear(); ok(g, 'Cleared the inventory'); });
  cmd('xp', '/xp <amount>[L]', true, (g, a) => {
    const s = a[0] || ''; const lv = /l$/i.test(s); const n = parseInt(s, 10);
    if (isNaN(n)) return err(g, 'Usage: /xp <amount>[L]');
    if (lv) { g.player.xpLevel = Math.max(0, g.player.xpLevel + n); } else g.player.addXP(n);
    ok(g, 'Given ' + n + (lv ? ' levels' : ' experience'));
  });
  cmd('heal', '/heal', true, (g) => { const p = g.player; p.health = p.maxHealth; p.food = 20; p.saturation = 5; p.fire = 0; p.effects = {}; ok(g, 'Healed'); });
  cmd('locate', '/locate <biome>', true, (g, a) => {
    const q = (a.join(' ') || '').toLowerCase();
    const bi = BIOMES.findIndex((b) => b && (b.key === q.replace(/ /g, '_') || b.name.toLowerCase() === q));
    if (bi < 0) return err(g, 'Unknown biome. Try: ' + BIOMES.filter(Boolean).map((b) => b.key).join(', '));
    const p = g.player, gen = g.world.localGen;
    for (let r = 32; r < 6000; r += 32) {
      const steps = Math.max(8, Math.floor(r * TAU / 32));
      for (let s = 0; s < steps; s++) {
        const an = s / steps * TAU, x = Math.round(p.x + Math.cos(an) * r), z = Math.round(p.z + Math.sin(an) * r);
        if (gen.biomeAt(x, z) === bi) return ok(g, 'The nearest ' + BIOMES[bi].name + ' is at ' + x + ', ' + z + ' (' + r + ' blocks away)');
      }
    }
    err(g, 'Could not find ' + BIOMES[bi].name + ' nearby');
  });
  cmd('setblock', '/setblock <x> <y> <z> <block> [data]', true, (g, a) => {
    const p = g.player;
    const x = Math.floor(coord(a[0], p.x)), y = Math.floor(coord(a[1], p.y)), z = Math.floor(coord(a[2], p.z));
    const id = findItem(a[3] || '');
    if ([x, y, z].some(isNaN) || id < 0 || id >= 256) return err(g, 'Usage: /setblock <x> <y> <z> <block> [data]');
    g.world.setBlock(x, y, z, id, parseInt(a[4], 10) || 0); ok(g, 'Block placed');
  });
  cmd('gamerule', '/gamerule <rule> [true|false]', true, (g, a) => {
    const r = g.world.gameRules;
    if (!a[0]) return ok(g, Object.keys(r).join(', '));
    if (!(a[0] in r)) return err(g, 'No game rule called ' + a[0]);
    if (a[1] === undefined) return ok(g, a[0] + ' = ' + r[a[0]]);
    r[a[0]] = a[1] === 'true'; g.world.info.gameRules = r; ok(g, 'Game rule ' + a[0] + ' has been updated to ' + r[a[0]]);
  });
  cmd('say', '/say <message>', false, (g, a) => g.hud.message('[' + g.settings.username + '] ' + a.join(' '), '#ff55ff'));
  cmd('me', '/me <action>', false, (g, a) => g.hud.message('* ' + g.settings.username + ' ' + a.join(' ')));

  function run(g, line) {
    const parts = line.trim().split(/\s+/);
    const name = (parts.shift() || '').toLowerCase();
    const c = C[name];
    if (!c) return err(g, 'Unknown command. Try /help for a list of commands');
    if (c.cheat && !g.world.info.cheats) return err(g, 'You do not have permission to use this command (cheats are off)');
    try { c.fn(g, parts); } catch (e) { console.error(e); err(g, 'An error occurred: ' + e.message); }
  }
  function suggest(prefix) {
    const p = prefix.toLowerCase();
    if (p.includes(' ')) return [];
    return Object.keys(C).filter((k) => k.startsWith(p)).sort();
  }
  return { run, suggest };
})();
