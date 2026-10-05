'use strict';
// ---------------------------------------------------------------------------
// Blocklands: the game shell. Main loop, camera, world lifecycle & saving,
// world ticking (time, weather, blocks, entities), and the glue between the
// renderer, GUI, input, audio and gameplay systems.
// ---------------------------------------------------------------------------
const TICK_MS = 50;
const MENU_SEEDS = [1337, 20111118, 404, 8675309, 31415, 777, 2468, 99, 12345, 4242];

// blocks that receive random ticks
const RANDOM_TICK = new Uint8Array(256);
for (const id of [B.GRASS, B.MYCELIUM, B.SAPLING, B.WHEAT, B.CARROTS, B.POTATOES, B.FARMLAND, B.SUGAR_CANE, B.CACTUS, B.LEAVES, B.ICE, B.SNOW_LAYER,
  B.EMBER_ORE_LIT, B.BRAMBLE, B.MUSHROOM_BROWN, B.MUSHROOM_RED, B.GLOWSHROOM, B.FIRE, B.WATER, B.BLOODCAP, B.PORTAL, B.GLOW_VINE, B.GLOW_VINE_BERRIES, B.STARVINE, B.MELON_STEM, B.PUMPKIN_STEM]) if (id !== undefined) RANDOM_TICK[id] = 1;

// ore values for the prospector's rod
const PROSPECT = (() => {
  const m = new Map();
  const add = (id, v) => { if (id !== undefined) m.set(id, v); };
  add(B.COAL_ORE, 1); add(B.SULFUR_ORE, 2); add(B.IRON_ORE, 3); add(B.EMBER_ORE, 4); add(B.EMBER_ORE_LIT, 4); add(B.LAPIS_ORE, 5);
  add(B.GOLD_ORE, 6); add(B.LUMITE_CRYSTAL, 6); add(B.JADE_ORE, 7); add(B.QUARTZ_ORE, 3); add(B.COBALT_ORE, 8); add(B.DIAMOND_ORE, 10); add(B.STARMETAL_ORE, 12);
  return m;
})();

function compassWord(dx, dz) {
  const a = Math.atan2(dx, -dz);            // 0 = north (-Z), clockwise
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

// Players are drawn like any humanoid in third person / inventory preview
Player.prototype.render = function (er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, this.game.playerSkin(), 'biped'); };

class Game {
  constructor() {
    this.settings = Settings.load();
    this.glCanvas = document.getElementById('gl');
    this.guiCanvas = document.getElementById('gui');
    this.storage = new WorldStorage();
    try {
      this.renderer = new Renderer(this, this.glCanvas);
    } catch (e) {
      console.error(e);
      this.fatal('Blocklands needs WebGL 2, which this browser or device does not support.', String(e && e.message || e));
      return;
    }
    this.gui = new GuiRenderer(this, this.guiCanvas);
    this.entityRenderer = new EntityRenderer(this, this.renderer);
    this.particles = new Particles(this);
    this.audio = new AudioEngine(this);
    this.music = new MusicEngine(this);
    this.hud = new Hud(this);
    this.interaction = new Interaction(this);
    this.spawner = new MobSpawner(this);
    this.input = new Input(this);
    this.touch = new TouchControls(this);
    this.camera = { x: 0, y: 80, z: 0, yaw: 0, pitch: 0, fov: 70, roll: 0, bobPitch: 0, bobX: 0, bobY: 0 };
    this.world = null; this.player = null; this.screen = null;
    this.ticks = 0; this.tickAcc = 0; this.lastFrame = performance.now();
    this.portalFx = 0; this.homeOnSave = false;
    this.thirdPerson = 0; this.hideHud = false; this.showDebug = false;
    this.cursorStack = null; this.chatHistory = [];
    this.sleepFade = 0; this.deathMessage = ''; this.saveStatus = '';
    this.handSway = [0, 0]; this.armYaw = 0; this.armPitch = 0;
    this.fovMod = 1; this.pfovMod = 1;
    this.mist = 0; this.waterTime = 0; this.darkT = 0;
    this.treasures = new Map();
    this.entityKeys = new Set(); this.pendingEntityLoads = new Set();
    this.loading = null;
    this.frames = 0; this.fpsTime = performance.now();
    this.ambienceTimer = 6000 + Math.floor(Math.random() * 6000);
    this.lastHeldKey = '';
    this.customSkinLoaded = false;
    this.rodCooldown = 0; this.wayCooldown = 0;
    this.deathScreenShown = false;
    if (this.settings.customSkin) this.loadCustomSkinData(this.settings.customSkin);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 50));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.saveWorld(); if (this.world && !this.world.menu && !this.screen && this.player && !this.player.dead) this.openPause(); } });
    window.addEventListener('pagehide', () => this.saveWorld());
    window.addEventListener('beforeunload', () => this.saveWorld());
    this.showTitle();
    const sp = document.getElementById('splash'); if (sp) sp.remove();
    const loop = (t) => { requestAnimationFrame(loop); try { this.frame(t); } catch (e) { this.reportError(e); } };
    requestAnimationFrame(loop);
  }

  fatal(msg, detail) {
    const el = document.getElementById('fatal');
    if (el) { el.style.display = 'flex'; el.querySelector('.msg').textContent = msg; el.querySelector('.detail').textContent = detail || ''; }
  }
  reportError(e) {
    console.error(e);
    if (!this.errorShown) { this.errorShown = true; if (this.hud) this.hud.message('§cError: ' + (e && e.message || e), '#ff5555'); }
  }

  // ------------------------------------------------------------ display
  resize() {
    if (!this.renderer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    let rs = this.settings.renderScale || 1;
    const maxPx = IS_MOBILE ? 1.8e6 : 5e6;
    if (pw * ph * rs * rs > maxPx) rs = Math.sqrt(maxPx / (pw * ph));
    this.renderer.resize(Math.max(1, Math.round(pw * rs)), Math.max(1, Math.round(ph * rs)));
    this.gui.resize(pw, ph);
    if (this.screen) this.screen.layout();
  }
  saveSettings() { Settings.save(this.settings); if (this.audio) this.audio.setVolumes(this.settings); }
  applyVideo() {
    const r = this.renderer;
    r.mesher.fancy = this.settings.graphics !== 'fast';
    r.mesher.smooth = this.settings.smoothLighting;
    if (this.world) for (const c of this.world.chunks.values()) c.markAllDirty();
  }
  updateTouch() { this.touch.update(); }
  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else {
        const p = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (p && p.then) p.then(() => { try { if (IS_MOBILE && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
      }
    } catch (e) { /* unsupported */ }
  }

  // ------------------------------------------------------------ skins
  playerSkin() { return this.settings.skin === 'custom' ? (this.customSkinLoaded ? 'custom' : 'wanderer') : (Skins.slots[this.settings.skin] ? this.settings.skin : 'wanderer'); }
  loadCustomSkinData(url) {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 64, 32, 0, 0, 64, 32);
      Skins.setCustom(ctx.getImageData(0, 0, 64, 32));
      this.entityRenderer.uploadSkins();
      this.customSkinLoaded = true;
    };
    img.src = url;
  }
  loadCustomSkin(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result);
      const img = new Image();
      img.onload = () => {
        if (img.width !== 64 || (img.height !== 32 && img.height !== 64)) { this.hud.message('Skins must be 64x32 (or 64x64) PNG images', '#ff5555'); return; }
        this.settings.customSkin = url; this.settings.skin = 'custom'; this.saveSettings();
        this.loadCustomSkinData(url);
      };
      img.src = url;
    };
    fr.readAsDataURL(file);
  }

  // ------------------------------------------------------------ screens
  openScreen(s) {
    const old = this.screen;
    if (old && old !== s) { try { old.onClose(); } catch (e) { console.error(e); } }
    this.screen = s;
    if (s) {
      this.input.releaseLock();
      this.interaction.release(0); this.interaction.release(2);
      this.input.keys.clear(); this.input.buttons = 0;
      this.touch.reset();
      s.layout();
    } else {
      this.input.focusText(null);
      if (this.world && !this.world.menu && !this.touch.active) this.input.requestLock();
    }
    this.glCanvas.style.filter = s instanceof TitleScreen ? 'blur(2.5px)' : '';
  }
  closeScreen() { this.openScreen(null); }
  openPause() { if (this.player && !this.player.dead) { this.saveWorld(); this.openScreen(new PauseScreen(this)); } }
  openChat(initial) { this.openScreen(new ChatScreen(this, initial || '')); }
  openInventory() { const p = this.player; if (!p || p.dead) return; this.openScreen(p.creative ? new CreativeScreen(this) : new InventoryScreen(this)); }
  openJournal() { this.openScreen(new JournalScreen(this, null)); }
  openMap() { if (this.maps) this.openScreen(new MapScreen(this)); }
  onPointerLockLost() { if (!this.screen && this.player && !this.loading && !this.player.dead) this.openPause(); }
  isPaused() { return !!(this.screen && this.screen.pauses) || !!this.loading; }

  // ------------------------------------------------------------ title / worlds
  showTitle() {
    this.closeWorld();
    const seed = MENU_SEEDS[Math.floor(Math.random() * MENU_SEEDS.length)];
    const times = [1000, 3000, 6000, 11600, 22900];
    const info = { id: 'menu', name: 'menu', seed, worldType: 'default', structures: true, dayTime: times[Math.floor(Math.random() * times.length)] };
    const w = new World(this, info, { menu: true });
    this.world = w; this.player = null;
    this.menuCam = null;
    w.gen.findSpawn((pos) => { if (this.world === w) this.menuCam = { x: pos.x + 0.5, z: pos.z + 0.5, y: 100, yaw: Math.random() * TAU, ty: 100, ready: false }; });
    this.openScreen(new TitleScreen(this));
  }
  closeWorld() {
    if (this.world) { this.world.dispose(); this.world = null; }
    this.player = null;
    this.particles.clear();
    this.treasures.clear();
    this.audio.stopLoops();
    this.cursorStack = null;
    this.thirdPerson = 0;
    this.loading = null;
    this.sleepFade = 0;
    this.maps = null;
    this.homeOnSave = false;
  }
  createWorld(opts) {
    const info = Object.assign({
      id: newWorldId(), created: Date.now(), lastPlayed: Date.now(), version: 1, time: 0, dayTime: 0,
    }, opts);
    info.folder = info.name.replace(/[^\w\- ]+/g, '_');
    this.storage.putWorld(info).then(() => this.startWorld(info, true)).catch((e) => { console.error(e); this.startWorld(info, true); });
  }
  startWorld(info, isNew, title) {
    const ls = new LoadingScreen(this, title || (isNew ? 'Generating level' : 'Loading level'));
    ls.sub = 'Building terrain';
    this.openScreen(ls);
    this.closeWorld();
    this.loading = { phase: 'keys', screen: ls, info, isNew, t0: performance.now() };
    Promise.all([this.storage.chunkKeys(info.id), this.storage.entityKeys(info.id)]).then(([ck, ek]) => {
      if (!this.loading || this.loading.info !== info) return;
      this.beginWorld(info, isNew, ck, ek);
    }).catch((e) => { console.error(e); this.beginWorld(info, isNew, new Set(), new Set()); });
  }
  beginWorld(info, isNew, chunkKeys, entityKeys) {
    const dim = (info.player && info.player.dim) || 0;
    info.savedKeys = [...chunkKeys];
    const w = new World(this, info, { storage: this.storage, dim });
    delete info.savedKeys;
    this.world = w;
    this.entityKeys = dimKeys(entityKeys, dim);
    this.pendingEntityLoads = new Set();
    w.onChunkEntities = (c, m, fromSave) => this.onChunkEntities(c, m, fromSave);
    w.onChunkUnload = (c) => this.onChunkUnload(c);
    w.onChunkLoaded = (c) => this.onChunkLoaded(c);
    w.onTileRemoved = (te, x, y, z) => this.onTileRemoved(te, x, y, z);
    const p = new Player(w, this);
    this.player = p;
    this.maps = new MapStore(this, info.id);
    this.maps.load(this.storage);
    this.settings.lastWorld = info.id; this.saveSettings();
    if (info.player) {
      p.load(info.player);
      if (p.dead || p.health <= 0) p.health = p.maxHealth;
      this.loading.phase = 'chunks';
    } else {
      p.setGameMode(info.gameMode === 'creative' ? 'creative' : (info.gameMode === 'hardcore' ? 'hardcore' : 'survival'));
      if (w.spawn) { p.setPos(w.spawn.x + 0.5, w.spawn.y, w.spawn.z + 0.5); this.loading.phase = 'chunks'; this.loading.place = !info.player; }
      else {
        this.loading.phase = 'spawn';
        w.gen.findSpawn((pos) => {
          if (this.world !== w || !this.loading) return;
          p.setPos(pos.x + 0.5, 100, pos.z + 0.5);
          this.loading.phase = 'chunks'; this.loading.place = true;
        });
      }
    }
    if (!info.travel) { this.hud.chat.length = 0; this.portalFx = 0; }
    this.deathScreenShown = false;
  }
  tickLoading() {
    const L = this.loading, w = this.world, p = this.player;
    if (!w || !p || L.phase !== 'chunks') { if (L.screen) L.screen.sub = L.phase === 'spawn' ? 'Finding a place to start' : 'Opening world'; return; }
    const rd = this.settings.renderDistance;
    w.updateStreaming(p.x, p.z, rd);
    this.renderer.camX = p.x; this.renderer.camZ = p.z;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const R = Math.min(2, rd);
    let need = 0, have = 0, meshed = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      need++;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (c) { have++; if (!c.anyDirty || Math.abs(dx) === R || Math.abs(dz) === R) meshed++; }
    }
    L.screen.progress = (have + meshed) / (need * 2);
    L.screen.sub = have < need ? 'Building terrain' : 'Preparing spawn area';
    if (have >= need && meshed >= need) this.finishLoading();
  }
  finishLoading() {
    const L = this.loading, w = this.world, p = this.player;
    if (L.place) {
      const x = Math.floor(p.x), z = Math.floor(p.z);
      let y = w.topSolidY(x, z) + 1;
      if (y < 1) y = 80;
      p.setPos(x + 0.5, y, z + 0.5);
      w.spawn = { x, y, z };
      w.info.spawn = w.spawn;
      if (L.isNew && w.info.bonusChest) this.placeBonusChest(x, y, z);
      // like the old console editions, every new adventure starts with a map
      if (L.isNew && !p.creative) p.inventory.main.set(8, new ItemStack(ITEM_IDS.map, 1, 0));
    }
    if (!w.spawn && !w.dim) w.spawn = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    const travel = w.info.travel;
    if (travel) { delete w.info.travel; this.arrive(travel); }
    this.loading = null;
    this.closeScreen();
    this.camera.yaw = p.yaw;
    this.armYaw = p.yaw; this.armPitch = p.pitch;
    if (L.isNew) {
      this.hud.message('§eWelcome to Blocklands, ' + this.settings.username + '!');
      this.hud.message('§7Press §fJ§7 for your Explorer\'s Journal' + (this.touch.active ? '' : ', §fT§7 to chat') + '.');
    }
    this.saveWorld();
    this.music.nextStart = performance.now() + 30000 + Math.random() * 60000;
    if (w.info.hardcoreDead) {
      // a hardcore world stays lost
      p.health = 0; p.dead = true; p.deathTime = 20;
      this.deathMessage = this.settings.username + ' perished in this world';
      this.deathScreenShown = true;
      this.openScreen(new DeathScreen(this));
    }
  }
  placeBonusChest(x, y, z) {
    const w = this.world;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2]]) {
      const cx = x + dx, cz = z + dz, cy = w.topSolidY(cx, cz) + 1;
      if (cy < 1 || !BT.solid[w.getBlock(cx, cy - 1, cz)] || BT.fluid[w.getBlock(cx, cy - 1, cz)]) continue;
      w.setBlock(cx, cy, cz, B.CHEST, 0);
      const te = w.getTile(cx, cy, cz);
      if (te) {
        const I = ITEM_IDS;
        const items = [[I.wood_pickaxe, 1], [I.wood_axe, 1], [I.apple, 4], [I.bread, 3], [B.LOG, 6], [B.PLANKS, 8], [I.stick, 10], [B.TORCH, 8], [I.seeds, 4]];
        items.forEach(([id, n], i) => { if (id !== undefined) te.items[(i * 3) % 27] = new ItemStack(id, n, 0); });
      }
      return;
    }
  }
  saveWorld() {
    const w = this.world, p = this.player;
    if (!w || w.menu || !p || this.loading) return Promise.resolve();
    const info = w.info;
    try {
      info.player = p.save();
      if (this.homeOnSave) {
        // died below and quit: wake up back home next time
        const s = info.spawn || { x: 0, y: 80, z: 0 };
        Object.assign(info.player, { dim: 0, x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
        info.travel = { respawn: true };
      }
      info.time = w.time; info.dayTime = w.dayTime;
      info.raining = w.raining; info.thundering = w.thundering; info.rainTime = w.rainTime; info.thunderTime = w.thunderTime;
      info.entityInit = [...w.entityInit];
      info.spawn = w.spawn; info.difficulty = w.difficulty; info.gameRules = w.gameRules;
      info.lastPlayed = Date.now();
      w.saveAll();
      this.saveLoadedEntities();
      if (this.maps) this.maps.save(this.storage);
      this.storage.putWorld(info);
      return this.storage.flush();
    } catch (e) { console.error('save failed', e); return Promise.resolve(); }
  }
  // ------------------------------------------------------------ dimensions
  // Cross to the other dimension: save this side, then reopen the world on the far side.
  travel(dim, opts) {
    const w = this.world, p = this.player;
    if (!w || !p || w.menu || this.loading) return;
    opts = opts || {};
    const info = w.info;
    if (p.riding) p.riding.dismount();
    if (p.sleeping) this.wakeUp();
    const saved = this.saveWorld();
    const pd = p.save();
    pd.dim = dim; pd.mount = undefined;
    if (opts.respawn || opts.home) {
      // back to your bed (or the world spawn), after a death or through the Star Well
      info.travel = opts.respawn ? { respawn: true } : { home: true };
      const s = this.homeSpot();
      pd.x = s[0]; pd.y = s[1]; pd.z = s[2];
    } else if (dim === DIM_ISLES) {
      info.travel = { dim, isles: true };
      const a = Isles.ARRIVE;
      pd.x = a[0] + 0.5; pd.y = a[1] + 1; pd.z = a[2] + 0.5;
    } else if (dim === DIM_SIFT) {
      // through a city gate: remember the way back (a couple of steps out of the gate)
      const st = Sift.state(info);
      st.back = [p.x + Math.sin(p.yaw) * 2.5, p.y, p.z + Math.cos(p.yaw) * 2.5];
      info.travel = { dim, sift: true };
      const g = WG.makeGenerator(w.seed, { dim: DIM_SIFT, type: 'default', structures: true });
      pd.x = 0.5; pd.y = g.arrivalY(); pd.z = 3.5;
    } else if (opts.fromSift) {
      const back = Sift.state(info).back || this.homeSpot();
      info.travel = { fromSift: true };
      pd.x = back[0]; pd.y = back[1]; pd.z = back[2];
    } else {
      const [tx, tz] = Portals.target(w.dim, p.x, p.z);
      const link = Portals.nearest(info, dim, tx, tz, dim === 0 ? 128 : 16);
      info.travel = { dim, x: tx, y: p.y, z: tz, link: link || null };
      pd.x = link ? link[1] + 0.5 : tx; pd.y = link ? link[2] : p.y; pd.z = link ? link[3] + 0.5 : tz;
    }
    const title = opts.respawn ? 'Respawning' : dim === DIM_ISLES ? 'Entering the Far Isles' : w.dim === DIM_ISLES ? 'Leaving the Far Isles'
      : dim === DIM_SIFT ? 'Entering the Sift' : w.dim === DIM_SIFT ? 'Leaving the Sift' : dim === 1 ? 'Entering the Underworld' : 'Leaving the Underworld';
    const ls = new LoadingScreen(this, title);
    ls.sub = 'Building terrain';
    this.openScreen(ls);
    this.loading = { phase: 'saving', screen: ls, info };
    const go = () => { info.player = pd; this.storage.putWorld(info).then(() => this.startWorld(info, false, title), () => this.startWorld(info, false, title)); };
    saved.then(go, go);
  }
  // step out of a portal on the far side (or back at home after a death below)
  arrive(t) {
    const w = this.world, p = this.player;
    if (t.respawn) { this.respawn(true); return; }
    if (t.sift || t.fromSift) {
      if (t.sift) {
        const a = Sift.arrival(w);
        p.setPos(a[0], a[1], a[2]); p.yaw = p.pyaw = Math.PI; p.pitch = 0;
        const st = Sift.state(w.info); st.visits = (st.visits || 0) + 1;
        const n = Sift.fillChest(this);
        if (st.visits === 1) this.hud.message('§7Grey sand, falling for ever. Things lost in your world sift down here, in time.');
        if (n) this.hud.message('§eThe lost-and-found by the gate holds ' + n + ' thing' + (n > 1 ? 's' : '') + ' that went astray.');
        this.achieve('sift');
      }
      p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
      p.portalLock = true; p.portalTime = 0;
      this.portalFx = 1;
      this.ambienceTimer = 200 + Math.floor(Math.random() * 300);
      this.audio.play('sift_gate_open', 1.2, 1.1);
      return;
    }
    if (t.home || t.isles) {
      if (t.home) this.placeHome(true);
      else { const a = Isles.platform(w); p.setPos(a[0], a[1], a[2]); p.yaw = p.pyaw = Math.PI / 2; p.pitch = 0; this.achieve('isles'); }
      p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
      p.portalLock = true; p.portalTime = 0;
      this.portalFx = 1;
      this.ambienceTimer = 200 + Math.floor(Math.random() * 300);
      this.audio.play('rift_travel', 0.7, 0.9 + Math.random() * 0.2);
      return;
    }
    const spot = Portals.arrive(w, t);
    const dx = spot.axis ? 0 : 1, dz = spot.axis ? 1 : 0;
    p.setPos(spot.x + 0.5 + dx * 0.5, spot.y, spot.z + 0.5 + dz * 0.5);
    p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
    p.portalLock = true; p.portalTime = 0;
    this.portalFx = 1;
    this.ambienceTimer = 300 + Math.floor(Math.random() * 400);
    this.audio.play('portal_travel', 0.6, 0.8 + Math.random() * 0.4);
    if (w.dim === 1) this.achieve('underworld');
  }
  tickPortal() {
    const p = this.player, w = this.world;
    let inPortal = false, inRift = false, inGate = false, inStar = null;
    if (!p.dead && !p.riding && !p.sleeping) {
      const b = p.box;
      for (let x = Math.floor(b.x0); x <= Math.floor(b.x1 - 1e-4); x++) for (let y = Math.floor(b.y0); y <= Math.floor(b.y1 - 1e-4); y++) for (let z = Math.floor(b.z0); z <= Math.floor(b.z1 - 1e-4); z++) {
        const id = w.getBlock(x, y, z);
        if (id === B.PORTAL) inPortal = true; else if (id === B.RIFT) inRift = true; else if (id === B.SIFT_GATE) inGate = true;
        else if (id === B.STAR_GATEWAY && !inStar) inStar = [x, y, z];
      }
    }
    if (inPortal && w.dim === DIM_ISLES) inPortal = false;
    if (!inPortal && !inRift && !inGate && !inStar) p.portalLock = false;
    // a star gateway throws you across the gulf at once
    if (inStar && !p.portalLock) { p.portalLock = true; Wyrm.travel(this, inStar[0], inStar[1], inStar[2]); return; }
    // a city gate, once woken, opens on the Sift
    if (inGate && !p.portalLock) {
      p.portalLock = true;
      if (w.dim === DIM_SIFT) this.travel(0, { fromSift: true });
      else if (!w.dim) this.travel(DIM_SIFT);
      return;
    }
    // a rift takes you at once: out to the Far Isles, or home through the Star Well
    if (inRift && !p.portalLock) {
      p.portalLock = true;
      if (w.dim === DIM_ISLES) this.leaveIsles();
      else if (!w.dim) this.travel(DIM_ISLES);
      return;
    }
    if (inPortal && !p.portalLock) {
      if (p.portalTime === 0) this.audio.play('portal_trigger', 0.5, 0.8 + Math.random() * 0.4);
      p.portalTime++;
      this.portalFx = Math.min(1, this.portalFx + 0.0125);
      if (p.portalTime >= (p.creative ? 2 : 80)) { p.portalTime = 0; this.travel(w.dim === 1 ? 0 : 1); return; }
    } else {
      p.portalTime = 0;
      this.portalFx = Math.max(0, this.portalFx - 0.05);
    }
    // the hum of a nearby portal
    if (w.time % 20 === 0 && Math.random() < 0.25) {
      const x = Math.floor(p.x) + Math.floor(Math.random() * 17) - 8, y = Math.floor(p.y) + Math.floor(Math.random() * 9) - 4, z = Math.floor(p.z) + Math.floor(Math.random() * 17) - 8;
      if (w.getBlock(x, y, z) === B.PORTAL) this.audio.play('portal_hum', 0.35, 0.8 + Math.random() * 0.4, x + 0.5, y + 0.5, z + 0.5);
    }
  }
  quitToTitle() {
    const p = this.player;
    if (p && p.dead && this.world && this.world.info.gameMode !== 'hardcore') {
      if (this.world.dim) { this.resetVitals(p); this.homeOnSave = true; } else this.respawn(true);
    }
    this.saveStatus = 'Saving world...';
    const done = () => { this.saveStatus = ''; this.showTitle(); };
    this.saveWorld().then(done, done);
  }
  deleteCurrentWorld() {
    const w = this.world; if (!w) return;
    const id = w.info.id;
    this.closeWorld();
    this.storage.deleteWorld(id).then(() => this.showTitle(), () => this.showTitle());
  }
  exportCurrentWorld() {
    const w = this.world; if (!w || w.menu) return;
    this.saveStatus = 'Exporting...';
    this.saveWorld().then(() => this.storage.exportWorld(w.info.id)).then((blob) => {
      downloadBlob(blob, (w.info.name || 'world').replace(/[^\w\- ]+/g, '_') + '.blocklands');
      this.saveStatus = 'World exported';
    }).catch((e) => { console.error(e); this.saveStatus = 'Export failed: ' + e.message; });
  }

  // ------------------------------------------------------------ entity persistence
  persistable(e) { return e.type === 'item' || e.type === 'xp' || e.type === 'boat' || e.type === 'minecart' || e.type === 'painting' || e.type === 'star_crystal' || (e.category && e.category !== 'special' && (e.persistent || e.category === 'creature')); }
  onChunkEntities(c, m, fromSave) {
    const w = this.world, key = c.key;
    if (this.entityKeys.has(key)) {
      this.pendingEntityLoads.add(key);
      this.storage.loadEntities(w.info.id, key + w.keyBase).then((list) => {
        this.pendingEntityLoads.delete(key);
        if (this.world !== w || !w.chunks.has(key) || !list) return;
        for (const d of list) { const e = entityFromData(w, d); if (e) w.addEntity(e); }
      }).catch((e) => { this.pendingEntityLoads.delete(key); console.error(e); });
    } else if (!w.entityInit.has(key + w.keyBase) && m.entities && m.entities.length) {
      for (const d of m.entities) {
        if (d.type === 'minecart') {
          // chest minecarts left behind in old mineshafts
          const c = new Minecart(w, d.x, d.y, d.z, d.kind || 0);
          c.relic = true;
          if (c.items && d.items) for (const it of d.items) { const s = ItemStack.fromJSON(it); if (s && it.slot >= 0 && it.slot < 27 && !c.items[it.slot]) c.items[it.slot] = s; }
          w.addEntity(c);
        } else if (d.type === 'star_crystal') w.addEntity(new StarCrystal(w, d.x, d.y, d.z));
        else this.spawnMob(d.type, d.x, d.y, d.z, d.extra);
      }
    }
    if (!fromSave || m.entities) w.entityInit.add(key + w.keyBase);
  }
  onChunkUnload(c) {
    const w = this.world, key = c.key;
    const list = [];
    for (const e of w.entities) {
      if (e.removed) continue;
      if ((Math.floor(e.x) >> 4) !== c.cx || (Math.floor(e.z) >> 4) !== c.cz || e.keepLoaded) continue;
      if (this.persistable(e)) { const d = e.save(); if (d) list.push(d); }
      e.removed = true;
    }
    for (const [k, t] of this.treasures) if ((t.x >> 4) === c.cx && (t.z >> 4) === c.cz) this.treasures.delete(k);
    if (w.menu || this.pendingEntityLoads.has(key)) return;
    if (list.length) { this.storage.saveEntities(w.info.id, key + w.keyBase, list); this.entityKeys.add(key); }
    else if (this.entityKeys.has(key)) { this.storage.saveEntities(w.info.id, key + w.keyBase, null); this.entityKeys.delete(key); }
  }
  saveLoadedEntities() {
    const w = this.world;
    const groups = new Map();
    for (const e of w.entities) {
      if (e.removed || !this.persistable(e)) continue;
      const key = ckey(Math.floor(e.x) >> 4, Math.floor(e.z) >> 4);
      if (!w.chunks.has(key)) continue;
      const d = e.save(); if (!d) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    for (const key of w.chunks.keys()) {
      if (this.pendingEntityLoads.has(key)) continue;
      const list = groups.get(key);
      if (list) { this.storage.saveEntities(w.info.id, key + w.keyBase, list); this.entityKeys.add(key); }
      else if (this.entityKeys.has(key)) { this.storage.saveEntities(w.info.id, key + w.keyBase, null); this.entityKeys.delete(key); }
    }
  }
  onChunkLoaded(c) {
    if (this.world && this.world.menu) return;
    for (const te of c.tiles.values()) if (te.type === 'chest' && te.buried) this.treasures.set(te.x + ',' + te.y + ',' + te.z, { x: te.x, y: te.y, z: te.z });
    const marks = this.world.info.treasureMarks;
    if (marks) for (const m of marks) if (!m.placed && (m.x >> 4) === c.cx && (m.z >> 4) === c.cz) this.tryBuryTreasure(m);
  }
  onTileRemoved(te, x, y, z) {
    this.treasures.delete(x + ',' + y + ',' + z);
    if (te.items) for (const s of te.items) if (s) Behaviors.dropStack(this, x + 0.5, y + 0.5, z + 0.5, s);
  }
  nearestTreasure(x, z, range) {
    let best = null, bd = range * range;
    for (const t of this.treasures.values()) { const d = (t.x + 0.5 - x) ** 2 + (t.z + 0.5 - z) ** 2; if (d < bd) { bd = d; best = t; } }
    return best;
  }
  isTreasureOpen(t) { return !this.treasures.has(t.x + ',' + t.y + ',' + t.z); }
  markTreasure(t) {
    this.hud.showAction('§bThe wisp fades... something is buried here.');
    for (let i = 0; i < 20; i++) this.particles.sparkle(t.x + 0.5, this.world.topSolidY(t.x, t.z) + 1.3, t.z + 0.5, 0.6, 1, 0.9, 1, 1.2);
  }

  // ------------------------------------------------------------ spawning helpers
  spawnEntity(e) { if (this.world) this.world.addEntity(e); return e; }
  spawnMob(type, x, y, z, opts) {
    if (!this.world) return null;
    const m = createMob(type, this.world, opts);
    if (!m) return null;
    m.setPos(x, y, z);
    m.yaw = Math.random() * TAU; m.bodyYaw = m.pbodyYaw = m.headYaw = m.pheadYaw = m.pyaw = m.yaw;
    if (opts && opts.baby && m.setBaby) m.setBaby();
    if (opts && opts.fromEgg) m.persistent = true;
    this.world.addEntity(m);
    return m;
  }
  spawnXP(x, y, z, amount) {
    let v = Math.floor(amount);
    while (v > 0) { const s = xpSplit(v); v -= s; this.spawnEntity(new XPOrb(this.world, x, y, z, s)); }
  }
  dropStack(stack, all) {
    const p = this.player; if (!p || !stack) return;
    const e = new ItemEntity(this.world, p.x, p.y + p.eye - 0.3, p.z, stack);
    const s = 0.3, yaw = p.yaw, pitch = p.pitch;
    e.vx = -Math.sin(yaw) * Math.cos(pitch) * s; e.vz = -Math.cos(yaw) * Math.cos(pitch) * s; e.vy = Math.sin(pitch) * s + 0.1;
    const a = Math.random() * TAU, f = 0.02 * Math.random();
    e.vx += Math.cos(a) * f; e.vz += Math.sin(a) * f; e.vy += (Math.random() - Math.random()) * 0.1;
    e.pickupDelay = 40;
    this.spawnEntity(e);
    void all;
  }
  dropHeld(all) {
    const p = this.player; if (!p || p.dead) return;
    const s = p.inventory.held(); if (!s) return;
    const n = all ? s.count : 1;
    const d = s.copy(); d.count = n;
    p.inventory.decrementHeld(n);
    this.dropStack(d);
    p.swing();
    this.noise(p.x, p.y + 1, p.z, 'drop', p);
  }
  giveItem(stack) {
    const p = this.player; if (!p || !stack) return;
    const left = p.inventory.add(stack);
    const n = typeof left === 'number' ? left : (left && left.count) || 0;
    if (n > 0) { const d = stack.copy(); d.count = n; this.dropStack(d); }
  }
  spawnItemParticles(stack, n, eating) {
    const p = this.player; if (!p) return;
    const yaw = p.yaw, pitch = p.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    this.particles.itemBreak(stack, p.x + fx * 0.5, p.y + p.eye - 0.15 + fy * 0.5, p.z + fz * 0.5, n, eating, [fx, fy, fz]);
  }
  selectSlot(i) {
    const p = this.player; if (!p) return;
    p.inventory.selected = clamp(i, 0, 8);
  }
  eyePos(partial) {
    const p = this.player;
    const [x, y, z] = p.lerpPos(partial === undefined ? 1 : partial);
    const eo = p.peyeOffset + (p.eyeOffset - p.peyeOffset) * (partial === undefined ? 1 : partial);
    return [x, y + 1.62 + eo, z];
  }
  updateTargetNow() { if (this.player) this.interaction.updateTarget(this.eyePos(1)); }
  useHeld() { return !!(this.input.buttons & 4) || this.touch.useHeld; }

  // ------------------------------------------------------------ input (in game)
  onGameKey(e) {
    const p = this.player;
    const c = e.code;
    if (!p || !this.world || this.world.menu || this.loading) return;
    if (c.startsWith('Digit')) { const n = parseInt(c.slice(5), 10) - 1; if (n >= 0 && n < 9) this.selectSlot(n); return; }
    if (c === 'Escape') { this.openPause(); return; }
    if (c === KEYS.debug) { this.showDebug = !this.showDebug; return; }
    if (c === KEYS.hideHud) { this.hideHud = !this.hideHud; return; }
    if (c === KEYS.screenshot) { this.screenshotPending = true; return; }
    if (c === KEYS.perspective) { this.thirdPerson = (this.thirdPerson + 1) % 3; return; }
    if (p.dead) return;
    if (c === KEYS.inventory) { this.openInventory(); return; }
    if (c === KEYS.drop) { this.dropHeld(e.ctrlKey); return; }
    if (c === KEYS.chat) { e.preventDefault(); this.openChat(''); return; }
    if (c === KEYS.command) { e.preventDefault(); this.openChat('/'); return; }
    if (c === KEYS.journal) { this.openJournal(); return; }
    if (c === KEYS.map) {
      if (p.creative || p.inventory.findSlot(ITEM_IDS.map) >= 0) this.openMap();
      else this.hud.showAction('You need an Explorer\'s Map (eight paper around a compass)');
      return;
    }
    if (c === KEYS.swapHands) {
      const inv = p.inventory, a = inv.held(), b = inv.offhandItem();
      inv.main.set(inv.selected, b); inv.offhand.set(0, a);
    }
  }
  onGameMouse(button, down) {
    if (!this.player || this.loading) return;
    if (down) this.interaction.press(button); else this.interaction.release(button);
  }
  onGameWheel(d) { const p = this.player; if (!p) return; this.selectSlot((p.inventory.selected + d + 9) % 9); }
  updateLook(dt) {
    const p = this.player;
    const [dx, dy] = this.input.consumeLook();
    if (!p || this.screen || p.dead || p.sleeping) return;
    if (dx || dy) {
      const f = this.settings.sensitivity * 0.6 + 0.2, k = f * f * f * 8 * 0.15 * DEG;
      p.yaw -= dx * k;
      p.pitch = clamp(p.pitch - dy * k * (this.settings.invertMouse ? -1 : 1), -Math.PI / 2 + 0.0001, Math.PI / 2 - 0.0001);
    }
    // the held item lags slightly behind the view
    const a = 1 - Math.pow(0.5, dt / 50);
    this.armYaw += wrapRadians(p.yaw - this.armYaw) * a;
    this.armPitch += (p.pitch - this.armPitch) * a;
    this.handSway[0] = -wrapRadians(p.yaw - this.armYaw) / DEG;
    this.handSway[1] = -(p.pitch - this.armPitch) / DEG;
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    if (!this.renderer) return;
    if (this.settings.maxFps > 0 && now - this.lastFrame < 1000 / this.settings.maxFps - 1.5) return;
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    this.frames++;
    if (now - this.fpsTime >= 1000) { this.hud.fps = Math.round(this.frames * 1000 / (now - this.fpsTime)); this.frames = 0; this.fpsTime = now; }
    this.music.update();
    this.tickAcc += dt;
    let n = 0;
    while (this.tickAcc >= TICK_MS && n < 10) { this.tick(); this.tickAcc -= TICK_MS; n++; }
    if (n >= 10) this.tickAcc = 0;
    const partial = this.isPaused() && this.player ? 1 : clamp(this.tickAcc / TICK_MS, 0, 1);
    this.updateLook(dt);
    if (this.touch.active) this.touch.frame();
    this.render(partial, dt);
  }

  tick() {
    this.ticks++;
    if (this.screen) this.screen.tick();
    const w = this.world;
    if (!w) return;
    if (w.menu) { w.time++; this.renderer.atlas.tickAnimations(); this.tickMenu(); return; }
    if (this.loading) { this.tickLoading(); return; }
    if (this.isPaused()) return;
    const p = this.player;
    w.time++;
    if (w.gameRules.doDaylightCycle) w.dayTime++;
    this.tickWeather();
    if (w.lightningFlash > 0) w.lightningFlash--;
    this.pfovMod = this.fovMod;
    p.tick(this.input);
    this.tickHold();
    this.tickPlayerEnvironment();
    this.tickPortal();
    if (this.loading) return;
    this.interaction.tick();
    this.tickEntities();
    this.pickup();
    this.spawner.tick();
    this.tickScheduled();
    this.tickRandom();
    this.tickTiles();
    this.tickSleep();
    this.tickAmbient();
    this.displayTicks();
    this.particles.tick();
    this.hud.tick();
    this.renderer.atlas.tickAnimations();
    DynamicItems.update(this);
    this.tickWaterways();
    if (w.time % 40 === 9) {
      if (!w.dim) { this.checkVillages(); this.checkVaults(); this.checkCities(); } else if (w.dim === 1) this.checkFortress();
      else if (w.dim === DIM_SIFT) this.checkRelics();
      else if (w.dim === DIM_ISLES) this.checkObservatory();
    }
    Circuits.tickPlates(this);
    Hush.tick(this);
    Wyrm.tick(this);
    Golems.tickVillages(this);
    w.updateStreaming(p.x, p.z, this.settings.renderDistance);
    // held item name popup
    const h = p.inventory.held();
    const hk = p.inventory.selected + ':' + (h ? h.id + '/' + h.dmg : '');
    if (hk !== this.lastHeldKey) { this.lastHeldKey = hk; this.hud.setItemName(h); }
    // fov modifier
    let fm = 1;
    if (p.flying) fm *= 1.1;
    if (p.sprinting) fm *= 1.15;
    if (p.gliding) fm *= 1.05 + Math.min(0.2, Math.hypot(p.vx, p.vy, p.vz) * 0.12);
    if (p.effects.slow) fm *= 0.9;
    if (p.useItem && p.useItem.id === ITEM_IDS.bow) { let f = (p.useMax - p.useTime) / 20; f = f > 1 ? 1 : f * f; fm *= 1 - f * 0.15; }
    this.fovMod += (fm - this.fovMod) * 0.5;
    if (p.headInWater) this.waterTime = Math.min(600, this.waterTime + 1); else this.waterTime = 0;
    if (w.time % 10 === 0) this.checkDiscoveries();
    if (w.time % 10 === 5 && this.maps && !w.dim) this.maps.tick();
    if (w.time % 20 === 0) this.checkMilestones();
    if (w.time % 600 === 0) this.saveWorld();
    // death
    if (p.dead && p.deathTime >= 20 && !this.deathScreenShown) { this.deathScreenShown = true; this.openScreen(new DeathScreen(this)); }
  }
  tickMenu() {
    const w = this.world, mc = this.menuCam;
    if (!mc) return;
    w.updateStreaming(mc.x, mc.z, Math.min(this.settings.renderDistance, 7));
    if (w.isLoaded(Math.floor(mc.x), Math.floor(mc.z))) {
      let top = SEA_LEVEL;
      for (let i = 0; i < 9; i++) { const x = Math.floor(mc.x + Math.sin(i) * 12), z = Math.floor(mc.z + Math.cos(i * 1.3) * 12); if (w.isLoaded(x, z)) top = Math.max(top, w.heightAt(x, z)); }
      mc.ty = top + 8;
      if (!mc.ready) { mc.y = mc.ty; mc.ready = true; }
    }
    mc.y += (mc.ty - mc.y) * 0.02;
  }

  // ------------------------------------------------------------ world systems
  tickWeather() {
    const w = this.world, R = w.rng;
    if (w.gameRules.doWeatherCycle !== false) {
      if (w.thunderTime <= 0) w.thunderTime = w.thundering ? 3600 + R.nextInt(12000) : 12000 + R.nextInt(168000);
      else if (--w.thunderTime <= 0) w.thundering = !w.thundering;
      if (w.rainTime <= 0) w.rainTime = w.raining ? 12000 + R.nextInt(12000) : 12000 + R.nextInt(168000);
      else if (--w.rainTime <= 0) w.raining = !w.raining;
    }
    if (w.dim) { w.prevRainStrength = w.rainStrength = 0; w.prevThunderStrength = w.thunderStrength = 0; return; }
    w.prevRainStrength = w.rainStrength; w.prevThunderStrength = w.thunderStrength;
    w.rainStrength = clamp(w.rainStrength + (w.raining ? 0.01 : -0.01), 0, 1);
    w.thunderRaw = clamp((w.thunderRaw || 0) + (w.thundering ? 0.01 : -0.01), 0, 1);
    w.thunderStrength = w.thunderRaw * w.rainStrength;
    // lightning near the player
    const p = this.player;
    if (w.thunderStrength > 0.5 && R.nextInt(400) === 0) {
      const x = Math.floor(p.x) + R.nextInt(97) - 48, z = Math.floor(p.z) + R.nextInt(97) - 48;
      if (w.isLoaded(x, z)) {
        const y = w.heightAt(x, z);
        if (w.isRainingAt(x, y, z)) this.spawnEntity(new LightningBolt(w, x + 0.5, y, z + 0.5));
      }
    }
  }
  tickPlayerEnvironment() {
    const p = this.player, w = this.world;
    if (p.dead || p.creative) return;
    // suffocation
    const ex = Math.floor(p.x), ey = Math.floor(p.y + p.eye), ez = Math.floor(p.z);
    const hid = w.getBlock(ex, ey, ez);
    if (BT.opaque[hid] && BT.solid[hid] && !p.sleeping) p.hurt(1, { type: 'suffocate' });
    // cactus & thorny bushes
    const b = p.box;
    for (let x = Math.floor(b.x0 - 0.01); x <= Math.floor(b.x1 + 0.01); x++) for (let z = Math.floor(b.z0 - 0.01); z <= Math.floor(b.z1 + 0.01); z++) for (let y = Math.floor(b.y0); y <= Math.floor(b.y1); y++) {
      const id = w.getBlock(x, y, z);
      if (id === B.CACTUS) {
        if (b.x1 > x + 0.0625 - 0.01 && b.x0 < x + 0.9375 + 0.01 && b.z1 > z + 0.0625 - 0.01 && b.z0 < z + 0.9375 + 0.01) p.hurt(1, { type: 'cactus' });
      } else if (id === B.BRAMBLE && (Math.abs(p.x - p.px) > 0.003 || Math.abs(p.z - p.pz) > 0.003) && !p.sneaking) {
        p.hurt(1, { type: 'bramble' });
      }
    }
  }
  tickEntities() {
    const w = this.world, list = w.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.removed) continue;
      const bx = Math.floor(e.x), bz = Math.floor(e.z);
      if (!w.isLoaded(bx, bz) && !e.keepLoaded) continue;
      try { e.tick(this); } catch (err) { console.error('entity tick', e.type, err); e.removed = true; }
      if (e.checkDespawn && !e.removed) e.checkDespawn(this);
    }
    // gentle pushing between creatures, boats (and the player)
    const p = this.player;
    const living = list.filter((e) => !e.removed && (e.category || e.type === 'boat' || e.type === 'minecart') && !e.dead && !e.noClip && e.type !== 'wisp' && e.type !== 'stranger');
    w.solids = living.filter((e) => e.solid);
    if (p && !p.dead) living.push(p);
    for (let i = 0; i < living.length; i++) {
      const a = living[i];
      for (let j = i + 1; j < living.length; j++) {
        const b = living[j];
        if (a.riding === b || b.riding === a || (a.riding && a.riding === b.riding)) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        const r = (a.w + b.w) / 2;
        if (Math.abs(dx) >= r || Math.abs(dz) >= r) continue;
        if (a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01) continue;
        let d = Math.max(Math.abs(dx), Math.abs(dz));
        if (d < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = 0.5; }
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        let f = 1 / d; if (f > 1) f = 1;
        const kx = dx / l * f * 0.05, kz = dz / l * f * 0.05;
        if ((a !== p || !p.creative) && !a.riding) { a.vx -= kx; a.vz -= kz; }
        if ((b !== p || !p.creative) && !b.riding) { b.vx += kx; b.vz += kz; }
      }
    }
    // potion swirls round anything under an effect
    if (this.ticks % 2 === 0 && this.settings.particles !== 'minimal') {
      const glint = this.particles.layer('particle_glint');
      for (const e of list.concat(p && !p.dead ? [p] : [])) {
        if (e.removed || e.dead || !e.effects || (e === p && !this.thirdPerson) || Math.random() < 0.5) continue;
        const col = Brewing.swirlColor(e);
        if (!col || (e.effects.invisible && Math.random() < 0.8)) continue;
        this.particles.add({ x: e.x + (Math.random() - 0.5) * e.w, y: e.y + Math.random() * e.h, z: e.z + (Math.random() - 0.5) * e.w, vx: 0, vy: 0.03, vz: 0, size: 0.07, life: 14 + Math.floor(Math.random() * 8), layer: glint, r: col[0], g: col[1], b: col[2], fade: true, collide: false });
      }
    }
    if (list.some((e) => e.removed)) {
      const keep = [];
      for (const e of list) { if (e.removed) w.entityMap.delete(e.id); else keep.push(e); }
      w.entities = keep;
    }
  }
  pickup() {
    const p = this.player, w = this.world;
    if (!p || p.dead) return;
    const b = p.box;
    for (const e of w.entities) {
      if (e.removed) continue;
      if (e.type === 'item') {
        if (e.pickupDelay > 0) continue;
        if (e.x < b.x0 - 1 || e.x > b.x1 + 1 || e.y < b.y0 - 0.5 || e.y > b.y1 + 0.5 || e.z < b.z0 - 1 || e.z > b.z1 + 1) continue;
        const st = e.stack;
        const before = st.count;
        const left = p.inventory.add(st);
        const n = typeof left === 'number' ? left : (left && left.count) || 0;
        if (n < before) {
          this.audio.play('pop', 0.2, ((Math.random() - Math.random()) * 0.7 + 1) * 2);
          this.onPickup(st, before - n);
          if (n <= 0) e.removed = true; else st.count = n;
        }
      } else if (e.type === 'xp') {
        if (e.delay > 0 || (this.xpCooldown || 0) > this.ticks) continue;
        if (e.x < b.x0 - 0.3 || e.x > b.x1 + 0.3 || e.y < b.y0 - 0.3 || e.y > b.y1 + 0.3 || e.z < b.z0 - 0.3 || e.z > b.z1 + 0.3) continue;
        e.removed = true;
        this.xpCooldown = this.ticks + 2;
        p.addXP(e.value);
        this.audio.play('orb', 0.1, 0.5 * ((Math.random() - Math.random()) * 0.7 + 1.8));
      }
    }
  }
  tickScheduled() {
    const w = this.world, q = w.tickQueue;
    let n = 0;
    while (q.size && q.peekKey() <= w.time && n < 1500) {
      const t = q.pop();
      w.tickPending.delete(t.key);
      if (!w.isLoaded(t.x, t.z)) continue;
      Behaviors.scheduledTick(w, t.x, t.y, t.z, t.id);
      n++;
    }
  }
  tickRandom() {
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const R = Math.min(this.settings.renderDistance, 7);
    const snowing = w.rainStrength > 0.3;
    for (const c of w.chunks.values()) {
      if (Math.abs(c.cx - pcx) > R || Math.abs(c.cz - pcz) > R) continue;
      const bl = c.blocks, mt = c.meta;
      for (let s = 0; s < CH_SECTIONS; s++) {
        for (let k = 0; k < 3; k++) {
          const idx = (s << 12) | ((Math.random() * 4096) | 0);
          const id = bl[idx];
          if (!RANDOM_TICK[id]) continue;
          Behaviors.randomTick(w, c.cx * 16 + (idx & 15), idx >> 8, c.cz * 16 + ((idx >> 4) & 15), id, mt[idx]);
        }
      }
      // freezing water & settling snow
      if (Math.random() < 1 / 16) {
        const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0;
        const x = c.cx * 16 + lx, z = c.cz * 16 + lz;
        const y = c.heightmap[(lz << 4) | lx];
        if (y > 0 && y < CH_H - 1) {
          const bio = c.biomes[(lz << 4) | lx];
          const cold = w.localGen.tempAt(bio, y) < 0.15;
          if (cold) {
            const below = c.blocks[((y - 1) << 8) | (lz << 4) | lx];
            if (below === B.WATER && c.meta[((y - 1) << 8) | (lz << 4) | lx] === 0 && w.getBlockLight(x, y, z) < 10) w.setBlock(x, y - 1, z, B.ICE, 0);
            else if (snowing && w.raining && c.blocks[(y << 8) | (lz << 4) | lx] === 0 && BT.opaque[below] && below !== B.ICE && w.getBlockLight(x, y, z) < 10) w.setBlock(x, y, z, B.SNOW_LAYER, 0);
          }
        }
      }
    }
  }
  tickTiles() {
    const w = this.world, p = this.player;
    for (const c of w.chunks.values()) {
      if (!c.tiles.size) continue;
      for (const te of c.tiles.values()) {
        if (te.type === 'furnace') this.tickFurnace(te, c);
        else if (te.type === 'brewing') Brewing.tick(this, te, c);
        else if (te.type === 'hopper') Machines.tickHopper(this, te);
        else if (te.type === 'gauge') Circuits.tickGauge(this, te);
        else if (te.type === 'enchanting') this.tickEnchantTable(te);
        else if (te.type === 'spawner') { const dx = te.x + 0.5 - p.x, dy = te.y + 0.5 - p.y, dz = te.z + 0.5 - p.z; if (dx * dx + dy * dy + dz * dz < 256) this.tickSpawner(te); }
      }
    }
  }
  tickFurnace(te, c) {
    const w = this.world, it = te.items;
    const was = te.burn > 0;
    let dirty = false;
    if (te.burn > 0) te.burn--;
    const rec = it[0] ? Recipes.smeltResult(it[0]) : null;
    let can = false;
    if (rec) { const o = it[2]; can = !o || (o.id === rec.output.id && o.dmg === rec.output.dmg && o.count + rec.output.count <= maxStackOf(o.id)); }
    if (te.burn === 0 && can) {
      const fuel = it[1];
      const fv = fuel ? fuelValue(fuel.id, fuel.dmg) : 0;
      if (fv > 0) {
        te.burn = te.burnMax = fv;
        fuel.count--;
        if (fuel.count <= 0) { const def = ITEMS[fuel.id]; it[1] = def && def.container ? new ItemStack(ITEM_IDS[def.container], 1, 0) : null; }
        dirty = true;
      }
    }
    if (te.burn > 0 && can) {
      if (++te.cook >= 200) {
        te.cook = 0;
        const o = it[2];
        if (!o) it[2] = new ItemStack(rec.output.id, rec.output.count, rec.output.dmg); else o.count += rec.output.count;
        it[0].count--; if (it[0].count <= 0) it[0] = null;
        te.xp += rec.xp;
        dirty = true;
      }
    } else if (te.cook > 0) te.cook = te.burn > 0 ? 0 : Math.max(0, te.cook - 2);
    if (was !== (te.burn > 0)) {
      const i = (te.y << 8) | ((te.z & 15) << 4) | (te.x & 15);
      const meta = w.getMeta(te.x, te.y, te.z);
      w.setBlock(te.x, te.y, te.z, te.burn > 0 ? B.FURNACE_LIT : B.FURNACE, meta, 4);
      c.tiles.set(i, te);
      dirty = true;
    }
    if (dirty) c.modified = true;
  }
  // the floating book turns to face you and opens; glyphs drift in from bookshelves
  tickEnchantTable(te) {
    const p = this.player;
    const dx = p.x - (te.x + 0.5), dy = p.y - (te.y + 0.5), dz = p.z - (te.z + 0.5), d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 1024) return;
    te.pSpread = te.spread; te.pRot = te.rot;
    if (d2 < 9 && !p.dead) {
      te.tRot = Math.atan2(dz, dx);
      te.spread += 0.1;
      if (te.spread < 0.5 || Math.random() < 1 / 40) { const f1 = te.flipT; do { te.flipT += Math.floor(Math.random() * 4) - Math.floor(Math.random() * 4); } while (f1 === te.flipT); }
    } else { te.tRot += 0.02; te.spread -= 0.1; }
    te.rot += wrapRadians(te.tRot - te.rot) * 0.4;
    te.spread = clamp(te.spread, 0, 1);
    te.ticks++;
    te.pFlip = te.flip;
    const f = clamp((te.flipT - te.flip) * 0.4, -0.2, 0.2);
    te.flipA += (f - te.flipA) * 0.9; te.flip += te.flipA;
    if (d2 < 256 && this.settings.particles !== 'minimal' && te.ticks % 2 === 0) {
      for (const s of Enchant.shelves(this.world, te.x, te.y, te.z)) if (Math.random() < 1 / 16) this.particles.glyph(s[0] + 0.5, s[1] + 1, s[2] + 0.5, te.x + 0.5, te.y + 1.25, te.z + 0.5);
    }
  }
  tickSpawner(te) {
    const w = this.world;
    if (Math.random() < 0.3) { this.particles.smoke(te.x + Math.random(), te.y + Math.random(), te.z + Math.random(), 1); this.particles.flame(te.x + Math.random(), te.y + Math.random(), te.z + Math.random()); }
    if (te.delay > 0) { te.delay--; return; }
    if (w.difficulty === 0) { te.delay = 200; return; }
    const near = w.entitiesInBox(te.x - 4, te.y - 4, te.z - 4, te.x + 5, te.y + 5, te.z + 5, (e) => e.type === te.mob).length;
    if (near < 6) {
      for (let i = 0, n = 0; i < 8 && n < 4; i++) {
        const x = te.x + Math.floor((Math.random() - Math.random()) * 4) , y = te.y + Math.floor(Math.random() * 3) - 1, z = te.z + Math.floor((Math.random() - Math.random()) * 4);
        if (!this.spawner.canStand(x, y, z, te.mob === 'spider' ? 1 : 2)) continue;
        if ((w.getLightRaw(x, y, z) & 15) > 11) continue;
        const m = this.spawnMob(te.mob, x + 0.5, y, z + 0.5);
        if (m) { n++; this.particles.smoke(x + 0.5, y + 0.5, z + 0.5, 6, true); }
      }
    }
    te.delay = 200 + Math.floor(Math.random() * 600);
  }
  tickSleep() {
    const p = this.player, w = this.world;
    if (p.sleeping) {
      p.sleepTimer++;
      this.sleepFade = Math.min(100, p.sleepTimer);
      if (w.isDaytime() && p.sleepTimer > 10 && w.dayTime % 24000 < 12000 && p.sleepTimer < 100) { this.wakeUp(); return; }
      if (p.sleepTimer >= 100) {
        if (!w.isDaytime() || w.thundering) {
          w.dayTime = w.dayTime - (w.dayTime % 24000) + 24000;
          if (w.raining || w.thundering) { w.raining = false; w.thundering = false; w.rainTime = 0; w.thunderTime = 0; }
          this.achieve('bed');
        }
        this.wakeUp();
      }
    } else if (this.sleepFade > 0) this.sleepFade = Math.max(0, this.sleepFade - 5);
  }
  tickAmbient() {
    const p = this.player, w = this.world, a = this.audio;
    // rain & wind ambience
    const bx = Math.floor(p.x), bz = Math.floor(p.z), by = Math.floor(p.y + p.eye);
    const bio = BIOMES[w.biomeAt(bx, bz)];
    let rv = 0;
    if (w.rainStrength > 0 && bio && bio.rain > 0 && !w.isSnowingAt(bx, by, bz)) {
      const open = w.canSeeSky(bx, by, bz);
      rv = w.rainStrength * (open ? 0.45 : (by > w.heightAt(bx, bz) - 8 ? 0.15 : 0));
    }
    a.loop('rain', rv * this.settings.sound);
    const wind = clamp((p.y - 95) / 40, 0, 0.45) * (w.canSeeSky(bx, by, bz) ? 1 : 0) + (bio && bio.key === 'moors' ? 0.08 : 0);
    a.loop('wind', wind * this.settings.sound);
    // the Underworld: a constant low roar and the odd far-off moan
    a.loop('under_drone', w.dim === 1 ? 0.3 * this.settings.sound : 0);
    // the Far Isles: a cold breath of air and, now and then, the stars ringing
    a.loop('isles_air', w.dim === 2 ? 0.32 * this.settings.sound : 0);
    // the rush of air past a glider
    a.loop('glide_wind', p && p.gliding ? Math.min(1, Math.hypot(p.vx, p.vy, p.vz) * 0.9) * 0.8 * this.settings.sound : 0);
    // the Sift: wind over the dunes, and now and then a bell, very far away
    a.loop('sift_wind', w.dim === DIM_SIFT ? 0.4 * this.settings.sound : 0);
    // the deep caves have air of their own
    if (w.time % 10 === 0) { const cb = w.dim ? -1 : w.biomeAt3(bx, by, bz); this.caveAir = cb === HUSH_BIOME ? 1 : cb === MOSSGLOW_BIOME ? 2 : 0; }
    this.caveAirV = this.caveAirV || [0, 0];
    this.caveAirV[0] += ((this.caveAir === 1 ? 0.5 : 0) - this.caveAirV[0]) * 0.05;
    this.caveAirV[1] += ((this.caveAir === 2 ? 0.35 : 0) - this.caveAirV[1]) * 0.05;
    a.loop('hush_air', this.caveAirV[0] * this.settings.sound);
    a.loop('moss_air', this.caveAirV[1] * this.settings.sound);
    if (w.dim === 1) {
      if (--this.ambienceTimer <= 0) {
        const ang = Math.random() * TAU;
        a.play('under_moan', 0.9, 0.7 + Math.random() * 0.4, p.x + Math.sin(ang) * 12, p.y + 4, p.z + Math.cos(ang) * 12);
        this.ambienceTimer = 600 + Math.floor(Math.random() * 1400);
      }
    } else if (w.dim === DIM_SIFT) {
      if (--this.ambienceTimer <= 0) {
        const ang = Math.random() * TAU;
        a.play('sift_bell', 0.5, 0.7 + Math.random() * 0.3, p.x + Math.sin(ang) * 14, p.y + 4, p.z + Math.cos(ang) * 14);
        this.ambienceTimer = 700 + Math.floor(Math.random() * 1500);
      }
    } else if (w.dim === 2) {
      if (--this.ambienceTimer <= 0) {
        const ang = Math.random() * TAU;
        a.play('isles_chime', 0.45, 0.85 + Math.random() * 0.3, p.x + Math.sin(ang) * 10, p.y + 5, p.z + Math.cos(ang) * 10);
        this.ambienceTimer = 300 + Math.floor(Math.random() * 900);
      }
    } else if (--this.ambienceTimer <= 0) {
      const x = bx + Math.floor(Math.random() * 31) - 15, y = by + Math.floor(Math.random() * 15) - 7, z = bz + Math.floor(Math.random() * 31) - 15;
      if (w.getBlock(x, y, z) === 0 && w.getLightRaw(x, y, z) === 0 && y < w.heightAt(x, z) - 4) {
        a.play('cave', 0.7, 0.8 + Math.random() * 0.2, x + 0.5, y + 0.5, z + 0.5);
        this.ambienceTimer = 6000 + Math.floor(Math.random() * 12000);
      } else this.ambienceTimer = 20;
    }
    // rain splashes on the ground around the player
    if (w.rainStrength > 0.2 && this.settings.particles !== 'minimal') {
      const n = Math.floor(14 * w.rainStrength * w.rainStrength * this.particles.density());
      for (let i = 0; i < n; i++) {
        const x = bx + Math.floor(Math.random() * 21) - 10, z = bz + Math.floor(Math.random() * 21) - 10;
        const y = w.heightAt(x, z);
        if (Math.abs(y - p.y) > 12 || !w.isRainingAt(x, y, z) || w.isSnowingAt(x, y, z)) continue;
        const top = w.getBlock(x, y - 1, z);
        if (top === 0) continue;
        if (top === B.LAVA) this.particles.smoke(x + Math.random(), y + 0.1, z + Math.random(), 1);
        else this.particles.rainSplash(x + Math.random(), y + 0.05, z + Math.random());
      }
    }
  }
  // random block display effects near the player (torch flames, lava pops, drips, sparkles...)
  displayTicks() {
    const p = this.player, w = this.world, P = this.particles;
    if (this.settings.particles === 'minimal') return;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const n = this.settings.particles === 'decreased' ? 200 : 450;
    for (let i = 0; i < n; i++) {
      const r = i < n / 2 ? 16 : 6;
      const x = bx + Math.floor(Math.random() * (r * 2 + 1)) - r, y = by + Math.floor(Math.random() * (r * 2 + 1)) - r, z = bz + Math.floor(Math.random() * (r * 2 + 1)) - r;
      const id = w.getBlock(x, y, z);
      if (id === 0) continue;
      switch (id) {
        case B.TORCH: {
          const m = w.getMeta(x, y, z);
          let ox = 0, oz = 0, lift = 0;
          if (m >= 1 && m <= 4) { lift = 3.5 / 16; const L = [null, [-8, 0, 1, 0], [8, 0, -1, 0], [0, -8, 0, 1], [0, 8, 0, -1]][m]; ox = (L[0] * 0.62 + L[2] * 4) / 16; oz = (L[1] * 0.62 + L[3] * 4) / 16; }
          const fx = x + 0.5 + ox, fy = y + 0.7 + lift, fz = z + 0.5 + oz;
          P.smoke(fx, fy + 0.05, fz, 1); P.flame(fx, fy, fz);
          break;
        }
        case B.SIFT_GATE:
          if (Math.random() < 0.35) {
            const m = w.getMeta(x, y, z), off = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.2);
            const gold = Math.random() < 0.08, px = x + ((m & 1) ? 0.5 + off : Math.random()), pz = z + ((m & 1) ? Math.random() : 0.5 + off);
            P.add({ x: px, y: y + Math.random(), z: pz, vx: (m & 1) ? off * 0.03 : 0, vy: -0.01 - Math.random() * 0.02, vz: (m & 1) ? 0 : off * 0.03, size: gold ? 0.06 : 0.035, life: 30 + Math.floor(Math.random() * 30),
              layer: P.layer('particle_glint'), r: gold ? 1 : 0.85, g: gold ? 0.88 : 0.85, b: gold ? 0.55 : 0.92, collide: false, bright: true, fade: true });
          }
          if (Math.random() < 0.004) this.audio.play('sift_hum', 0.5, 0.85 + Math.random() * 0.3, x + 0.5, y + 0.5, z + 0.5);
          break;
        case B.FIRE:
          if (Math.random() < 0.5) P.smoke(x + Math.random(), y + Math.random() * 0.5 + 0.5, z + Math.random(), 1, true);
          if (Math.random() < 0.04) this.audio.play('fire', 0.6, 0.7 + Math.random() * 0.3, x + 0.5, y + 0.5, z + 0.5);
          break;
        case B.LAVA:
          if (w.getBlock(x, y + 1, z) === 0 && Math.random() < 0.02) {
            P.add({ x: x + Math.random(), y: y + 1, z: z + Math.random(), vx: (Math.random() - 0.5) * 0.1, vy: 0.15 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.1, size: 0.08, life: 20 + Math.floor(Math.random() * 20), gravity: 0.03, layer: P.layer('particle_flame'), bright: true, shrink: true });
            if (Math.random() < 0.3) this.audio.play('lava_pop', 0.2 + Math.random() * 0.2, 0.9 + Math.random() * 0.15, x + 0.5, y + 1, z + 0.5);
          }
          break;
        case B.FURNACE_LIT: {
          if (Math.random() < 0.3) {
            const f = w.getMeta(x, y, z) & 3, d = HFACE_DIR[f];
            const fx = x + 0.5 + d[0] * 0.52, fz = z + 0.5 + d[1] * 0.52, fy = y + Math.random() * 6 / 16;
            const s = (Math.random() - 0.5) * 0.6;
            P.smoke(fx + (d[1] ? s : 0), fy, fz + (d[0] ? s : 0), 1); P.flame(fx + (d[1] ? s : 0), fy, fz + (d[0] ? s : 0));
          }
          break;
        }
        case B.EMBER_ORE_LIT: P.sparkle(x + Math.random(), y + Math.random(), z + Math.random(), 1, 0.3, 0.1, 1, 0.3); break;
        case B.LUMITE_CRYSTAL: case B.LUMITE_LAMP: if (Math.random() < 0.15) P.sparkle(x + 0.5, y + 0.5, z + 0.5, 0.5, 0.9, 1, 1, 1.1); break;
        case B.GLOWSHROOM: if (Math.random() < 0.2) P.sparkle(x + 0.5, y + 0.4, z + 0.5, 0.5, 1, 0.6, 1, 0.6); break;
        case B.MYCELIUM: if (Math.random() < 0.08 && w.getBlock(x, y + 1, z) === 0) P.add({ x: x + Math.random(), y: y + 1.1, z: z + Math.random(), vx: 0, vy: 0.01, vz: 0, size: 0.03, life: 40, layer: P.layer('particle_glint'), r: 0.7, g: 0.6, b: 0.7, collide: false, fade: true }); break;
        case B.LEAVES:
          if (w.rainStrength > 0.3 && Math.random() < 0.05 && w.getBlock(x, y - 1, z) === 0 && w.isRainingAt(x, y + 1, z)) P.drip(x + Math.random(), y - 0.05, z + Math.random(), false);
          break;
        default:
          if (BT.opaque[id] && Math.random() < 0.05 && w.getBlock(x, y - 1, z) === 0) {
            const above = w.getBlock(x, y + 1, z);
            if (above === B.WATER || above === B.LAVA) P.drip(x + Math.random(), y - 0.05, z + Math.random(), above === B.LAVA);
          }
      }
    }
  }

  // ------------------------------------------------------------ player events
  onFootstep(p, landing) {
    const w = this.world;
    let x = Math.floor(p.x), y = Math.floor(p.y - 0.2), z = Math.floor(p.z);
    let id = w.getBlock(x, y + 1, z) === B.SNOW_LAYER ? B.SNOW_LAYER : w.getBlock(x, y, z);
    if (id === 0) { y = Math.floor(p.y - 0.6); id = w.getBlock(x, y, z); }
    const d = BLOCKS[id];
    if (!d || BT.fluid[id]) return;
    this.audio.playBlock(d.sound, 'step', p.x, p.y, p.z);
    const boots = p.inventory.armor.items[3];
    if (id !== B.WOOL && id !== B.CARPET && !(boots && ITEMS[boots.id] && ITEMS[boots.id].silent)) this.noise(p.x, p.y, p.z, landing ? 'land' : 'step', p);
    if (landing) this.audio.playBlock(d.sound, 'step', p.x, p.y, p.z);
  }
  onBiomeEnter(b) {
    const p = this.player, bi = BIOMES[b];
    if (!bi) return;
    if (!p.discovered.biomes[b]) {
      p.discovered.biomes[b] = true;
      this.hud.toast('Biome discovered!', bi.name, this.biomeIcon(bi.key), '#55ff55');
      this.audio.play('discover', 0.7);
      const known = (dim) => BIOMES.filter((x) => x && (x.dim || 0) === dim);
      const n = Object.keys(p.discovered.biomes).filter((k) => BIOMES[k] && !BIOMES[k].dim).length;
      if (n >= 10) this.achieve('biomes10');
      if (known(0).every((x) => p.discovered.biomes[x.id])) this.achieve('biomesAll');
      if (bi.dim === 1 && known(1).every((x) => p.discovered.biomes[x.id])) this.achieve('regions');
      if (bi.key === 'drift_isles') this.achieve('drift');
    }
  }
  biomeIcon(key) {
    const I = ITEM_IDS;
    const map = {
      ocean: [I.water_bucket, 0], deep_ocean: [I.water_bucket, 0], plains: [B.TALL_GRASS, 1], desert: [B.SAND, 0], mountains: [B.STONE, 0], forest: [B.SAPLING, 0],
      birch_forest: [B.LOG, 2], taiga: [B.LOG, 1], snowy_tundra: [B.SNOW, 0], snowy_taiga: [B.SNOW, 0], swamp: [B.LILY_PAD, 0], jungle: [B.LOG, 3],
      mushroom_island: [B.MUSHROOM_RED, 0], beach: [B.SAND, 0], river: [I.water_bucket, 0], autumn_forest: [B.LEAVES, 4], redwood_grove: [B.LOG, 5], moors: [B.FLOWER, 4],
      ashen_wastes: [B.ASH, 0], salt_flats: [B.SALT, 0], meadow: [B.FLOWER, 3], canyon: [B.SAND, 1], stone_shore: [B.COBBLESTONE, 0],
      brimstone_depths: [B.BRIMSTONE, 0], bone_shoals: [B.BONESAND, 0], cinder_hollows: [B.BASALT, 0], glimmering_grotto: [B.SUNSTONE, 0],
      great_isle: [B.STARSTONE, 0], starlit_gulf: [B.OBSIDIAN, 0], drift_isles: [B.STARSTONE_BRICKS, 0],
      the_hush: [B.HUSHMOSS, 0], mossglow_caves: [B.GLOW_VINE_BERRIES, 0],
      grey_dunes: [B.SIFT_SAND, 0], relic_fields: [B.SILTSTONE_BRICKS, 2], glass_wastes: [B.SIFT_GLASS, 0], silent_shelves: [B.SILTSTONE, 0], the_hollows: [B.SILTSTONE_BRICKS, 3],
      grand_peaks: [B.SNOW, 0], highlands: [B.TALL_GRASS, 1], spire_woods: [B.MOSSY_COBBLESTONE, 0], tablelands: [B.STONE, 0], glacier: [B.PACKED_ICE, 0],
    };
    const e = map[key] || [B.GRASS, 0];
    return new ItemStack(e[0], 1, e[1]);
  }
  onAte() { const p = this.player; if (p) this.noise(p.x, p.y + 1, p.z, 'eat', p); }
  // the Hush hears everything: something made a sound here
  noise(x, y, z, kind, src) { if (this.world && !this.world.menu) Hush.vibrate(this, x, y, z, kind, src === undefined ? this.player : src); }
  onPickup(st) {
    const p = this.player;
    p.discovered.items[st.id] = true;
    const I = ITEM_IDS;
    if (st.id === I.diamond) this.achieve('diamond');
    if (st.id === B.LOG) this.achieve('wood');
    if (st.id === I.jade) this.achieve('jade');
    if (st.id === I.lumite_shard) this.achieve('lumite');
    if (st.id === B.COBALT_ORE) this.achieve('cobalt');
    if (st.id === B.STARMETAL_ORE) this.achieve('star');
    if (st.id === I.flare_rod) this.achieve('flare');
    if (st.id === B.WYRM_EGG) this.achieve('egg');
  }
  onPlayerDeath(src) {
    const p = this.player, w = this.world;
    if (p.riding) p.riding.dismount();
    this.deathMessage = this.deathText(src);
    this.hud.message(this.deathMessage);
    p.lastDeath = { dim: w.dim, x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    if (p.sleeping) this.wakeUp();
    if (!w.gameRules.keepInventory) {
      for (const s of p.inventory.dropAll()) {
        const e = new ItemEntity(w, p.x, p.y + 1.2, p.z, s);
        const f = Math.random() * 0.5, a = Math.random() * TAU;
        e.vx = -Math.sin(a) * f; e.vz = Math.cos(a) * f; e.vy = 0.2;
        e.pickupDelay = 40;
        this.spawnEntity(e);
      }
      const xp = Math.min(p.xpLevel * 7, 100);
      if (xp > 0) this.spawnXP(p.x, p.y + 0.5, p.z, xp);
      p.xpLevel = 0; p.xp = 0;
    }
    this.cursorStack = null;
    this.interaction.release(0); this.interaction.release(2);
    if (w.info.gameMode === 'hardcore') { w.info.hardcoreDead = true; this.saveWorld(); }
  }
  deathText(src) {
    const n = this.settings.username;
    const by = src && src.entity ? (src.entity.type === 'player' ? 'themselves' : (MOB_INDEX[src.entity.type] ? MOB_INDEX[src.entity.type].name : 'something')) : null;
    switch (src && src.type) {
      case 'fall': return n + ' hit the ground too hard';
      case 'lava': return n + ' tried to swim in lava';
      case 'fire': return n + ' burned to death';
      case 'drown': return n + ' drowned';
      case 'starve': return n + ' starved to death';
      case 'void': return n + ' fell out of the world';
      case 'explosion': return n + ' blew up';
      case 'fireball': return n + ' was fireballed' + (by && by !== 'themselves' ? ' by a ' + by : '');
      case 'lightning': return n + ' was struck by lightning';
      case 'magic': return n + ' was killed by magic';
      case 'sonic': return n + ' was silenced' + (by && by !== 'themselves' ? ' by the ' + by : '');
      case 'cactus': return n + ' was pricked to death';
      case 'bramble': return n + ' was scratched to death by brambles';
      case 'suffocate': return n + ' suffocated in a wall';
      case 'arrow': return n + ' was shot by ' + (by ? (by === 'themselves' ? 'themselves' : 'a ' + by) : 'an arrow');
      case 'mob': return n + ' was slain by ' + (by ? 'a ' + by : 'a monster');
      case 'command': return n + ' was killed';
    }
    return n + ' died';
  }
  resetVitals(p) {
    p.dead = false; p.deathTime = 0; p.health = p.maxHealth; p.hurtTime = 0; p.hurtResist = 0;
    p.food = 20; p.saturation = 5; p.exhaustion = 0; p.air = 300; p.fire = 0; p.effects = {};
    p.fallDistance = 0; p.vx = p.vy = p.vz = 0; p.sleeping = false; p.useItem = null;
    if (p.riding) p.riding.dismount();
  }
  respawn(silent) {
    const p = this.player, w = this.world;
    if (!p) return;
    this.resetVitals(p);
    // a death in another dimension wakes you back home
    if (w.dim) { this.deathScreenShown = false; if (!this.loading) this.travel(0, { respawn: true }); return; }
    this.placeHome(silent);
    this.deathScreenShown = false;
    this.particles.clear();
    if (!silent) this.closeScreen();
  }
  // where home is, as far as anyone can tell from another dimension
  homeSpot() {
    const p = this.player, s = p && p.spawnPoint;
    if (s) { if (Array.isArray(s)) return [s[0] + 0.5, s[1], s[2] + 0.5]; return [s.x + 0.5, s.y + (s.forced ? 0 : 0.6), s.z + 0.5]; }
    const ws = (this.world && this.world.info.spawn) || { x: 0, y: 80, z: 0 };
    return [ws.x + 0.5, ws.y, ws.z + 0.5];
  }
  // stand the player at their bed, or the world spawn if the bed is gone
  placeHome(silent) {
    const p = this.player, w = this.world;
    let pos = null;
    if (p.spawnPoint) {
      const s = p.spawnPoint;
      if (Array.isArray(s)) pos = [s[0] + 0.5, s[1], s[2] + 0.5];
      else if (s.forced) pos = [s.x + 0.5, s.y, s.z + 0.5];
      else if (w.isLoaded(s.x, s.z) && w.getBlock(s.x, s.y, s.z) !== B.BED) { p.spawnPoint = null; if (!silent) this.hud.message('Your home bed was missing or obstructed'); }
      else pos = [s.x + 0.5, s.y + 0.6, s.z + 0.5];
    }
    if (!pos) { const s = w.spawn || { x: 0, y: 80, z: 0 }; const y = w.isLoaded(s.x, s.z) ? Math.max(s.y, w.topSolidY(s.x, s.z) + 1) : s.y; pos = [s.x + 0.5, y, s.z + 0.5]; }
    p.setPos(pos[0], pos[1], pos[2]);
  }
  // set the player down somewhere far off in this same world, and keep them there
  // (no falling) until the ground under them has loaded
  holdPlayer(x, y, z, yaw) {
    const p = this.player;
    p.setPos(x, y, z); p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
    if (yaw !== undefined) { p.yaw = p.pyaw = yaw; p.pitch = 0; }
    this.hold = { x, y, z, t: 0, w: this.world };
    this.portalFx = 1;
  }
  tickHold() {
    const h = this.hold, p = this.player, w = this.world;
    if (!h) return;
    if (h.w !== w || p.dead) { this.hold = null; return; }
    h.t++;
    let ready = true;
    for (const [dx, dz] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) if (!w.isLoaded(Math.floor(h.x) + dx, Math.floor(h.z) + dz)) ready = false;
    if (ready && h.t > 4 || h.t > 600) { this.hold = null; return; }
    p.setPos(h.x, h.y, h.z); p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
    this.portalFx = Math.max(this.portalFx, 0.6);
  }
  // through the Star Well and home; the first time, the long way round
  leaveIsles() {
    const p = this.player;
    if (!p.seenEnding && Isles.state(this.world.info).kills > 0) { this.openScreen(new EndingScreen(this, () => { p.seenEnding = true; this.travel(0, { home: true }); })); return; }
    this.travel(0, { home: true });
  }
  releaseBow(p, ticks) {
    const held = p.inventory.held();
    let f = ticks / 20;
    f = (f * f + f * 2) / 3;
    if (f < 0.1) return;
    if (f > 1) f = 1;
    const infinity = Enchant.level(held, 'infinity') > 0;
    const hasArrow = p.creative || infinity || p.inventory.main.count(ITEM_IDS.arrow) > 0;
    if (!hasArrow) return;
    const a = new Arrow(this.world, p, f * 3, 1);
    if (f >= 1) a.crit = true;
    a.pickup = !p.creative && !infinity;
    const pw = Enchant.level(held, 'power'); if (pw) a.damage += pw * 0.5 + 0.5;
    a.punch = Enchant.level(held, 'punch');
    if (Enchant.level(held, 'flame')) a.fire = 2000;
    this.spawnEntity(a);
    this.audio.play('bow', 1, 1 / (Math.random() * 0.4 + 1.2) + f * 0.5);
    if (!p.creative) { if (!infinity) p.inventory.main.removeItems(ITEM_IDS.arrow, undefined, 1); if (held) p.inventory.damageHeld(p, 1); }
  }
  tryUseBed(x, y, z, m) {
    const p = this.player, w = this.world;
    if (!p || p.sleeping || p.dead) return;
    const d = HFACE_DIR[m & 3];
    const hx = (m & 4) ? x : x + d[0], hz = (m & 4) ? z : z + d[1];
    if (w.getBlock(hx, y, hz) !== B.BED) return;
    if (p.distanceSq(hx + 0.5, y + 0.5, hz + 0.5) > 9 && p.distanceSq(x + 0.5, y + 0.5, z + 0.5) > 9) { this.hud.showAction('You are too far away from the bed'); return; }
    if (w.dim) {
      // there is no rest in the Underworld: the bed bursts into flame
      const d2 = HFACE_DIR[m & 3], fx = (m & 4) ? x - d2[0] : x, fz = (m & 4) ? z - d2[1] : z;
      w.setBlock(hx, y, hz, 0, 0, 4); w.setBlock(fx, y, fz, 0, 0, 4);
      Behaviors.explode(this, hx + 0.5, y + 0.5, hz + 0.5, 5, { type: 'bed' }, true);
      return;
    }
    if (w.isDaytime() && !w.thundering) { this.hud.showAction('You can only sleep at night'); return; }
    const near = w.entitiesInBox(hx - 8, y - 5, hz - 8, hx + 9, y + 6, hz + 9, (e) => e.hostile && !e.dead);
    if (near.length) { this.hud.showAction('You may not rest now, there are monsters nearby'); return; }
    p.sleeping = true; p.sleepTimer = 0;
    p.bedPos = { x: hx, y, z: hz };
    p.sleepYaw = Math.atan2(d[0], d[1]);
    p.setPos(hx + 0.5, y + 0.5625, hz + 0.5);
    p.vx = p.vy = p.vz = 0;
    p.yaw = Math.atan2(d[0], d[1]); p.pitch = 0;
    if (!p.spawnPoint || p.spawnPoint.x !== hx || p.spawnPoint.z !== hz) this.hud.message('Respawn point set');
    p.spawnPoint = { x: hx, y, z: hz };
  }
  wakeUp() {
    const p = this.player;
    if (!p || !p.sleeping) return;
    p.sleeping = false; p.sleepTimer = 0;
    if (p.bedPos) {
      const w = this.world, b = p.bedPos;
      let spot = null;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = b.x + dx, z = b.z + dz;
        if (dx === 0 && dz === 0) continue;
        if (!BT.solid[w.getBlock(x, b.y, z)] && !BT.solid[w.getBlock(x, b.y + 1, z)] && BT.solid[w.getBlock(x, b.y - 1, z)]) { spot = [x + 0.5, b.y, z + 0.5]; break; }
      }
      if (spot) p.setPos(spot[0], spot[1], spot[2]); else p.setPos(b.x + 0.5, b.y + 0.6, b.z + 0.5);
    }
  }
  onCrafted(stack) {
    const p = this.player, I = ITEM_IDS;
    p.stats.itemsCrafted += stack.count;
    p.discovered.items[stack.id] = true;
    if (stack.id === B.CRAFTING_TABLE) this.achieve('bench');
    if (stack.id === I.stone_pickaxe) this.achieve('pick');
    if (stack.id === B.FURNACE) this.achieve('furnace');
    if (stack.id === I.bread) this.achieve('bread');
    if (stack.id === B.TNT) this.achieve('tnt');
    if (stack.id === I.starmetal_sword) this.achieve('starsword');
  }
  onSmelted(stack) {
    this.player.discovered.items[stack.id] = true;
    if (stack.id === ITEM_IDS.iron_ingot) this.achieve('iron');
  }
  onChestOpened() {}
  onTreasureFound(te) {
    this.treasures.delete(te.x + ',' + te.y + ',' + te.z);
    const marks = this.world.info.treasureMarks;
    if (marks) this.world.info.treasureMarks = marks.filter((m) => !m.placed || Math.abs(m.x - te.x) > 2 || Math.abs(m.z - te.z) > 2);
    this.achieve('treasure');
    this.audio.play('discover', 0.8, 1.1);
    this.hud.showAction('§eYou found buried treasure!');
    if (this.player) this.player.discovered.structures.treasure = (this.player.discovered.structures.treasure || 0) + 1;
  }
  onBlockBroken(id, meta) {
    if (id === B.WHEAT && meta >= 7) this.achieve('harvest');
    if (id === B.COBALT_ORE) this.achieve('cobalt');
    if (id === B.STARMETAL_ORE) this.achieve('star');
    if (id === B.LUMITE_CRYSTAL) this.achieve('lumite');
    if (id === B.LOG) this.achieve('wood');
  }
  onBlockPlaced() {}
  onMobKilled(m) {
    const p = this.player;
    p.stats.mobsKilled++;
    if (m.hostile) this.achieve('kill');
    if (m.type === 'listener') this.achieve('listener');
  }
  onBred() { this.achieve('breed'); }
  onStrangerSeen() {
    const p = this.player;
    if (!p.discovered.mobs.stranger) { p.discovered.mobs.stranger = true; this.hud.toast('Creature discovered', 'The Stranger', new ItemStack(ITEM_IDS.spawn_egg, 1, MOB_INDEX.stranger.index), '#aaaaaa'); }
    this.achieve('stranger');
  }
  achieve(id) {
    const p = this.player;
    if (!p || p.achievements[id]) return;
    const m = MILESTONES.find((a) => a.id === id);
    if (!m) return;
    p.achievements[id] = true;
    const ic = m.icon();
    this.hud.toast('Milestone reached!', m.name, new ItemStack(ic[0], 1, ic[1]), '#ffff55');
    this.audio.play('levelup', 0.5, 1.2);
  }
  checkDiscoveries() {
    const p = this.player, w = this.world;
    if (p.dead) return;
    const ex = p.x, ey = p.y + p.eye, ez = p.z;
    for (const e of w.entities) {
      if (e.removed || !e.def || e.dead || e.type === 'stranger') continue;
      if (p.discovered.mobs[e.type]) continue;
      const d2 = e.distanceSq(ex, ey, ez);
      if (d2 > 20 * 20) continue;
      if (!lineOfSight(w, ex, ey, ez, e.x, e.y + e.h * 0.6, e.z)) continue;
      p.discovered.mobs[e.type] = true;
      this.hud.toast('Creature discovered', e.def.name, new ItemStack(ITEM_IDS.spawn_egg, 1, e.def.index), '#55ffff');
      if (e.type === 'wisp') this.achieve('wisp');
    }
  }
  checkMilestones() {
    const p = this.player;
    if (p.dead) return;
    if (this.world.dim) return;
    if (p.y < 14 && !p.creative && !p.achievements.deep) {
      const w = this.world, bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
      let lava = false;
      for (let x = bx - 6; x <= bx + 6 && !lava; x++) for (let z = bz - 6; z <= bz + 6 && !lava; z++) for (let y = Math.max(1, by - 4); y <= by + 2; y++) if (w.getBlock(x, y, z) === B.LAVA) { lava = true; break; }
      if (lava) this.achieve('deep');
    }
    if (p.y > 152) this.achieve('high');
    const a = p.inventory.armor.items;
    if (a[0] && a[1] && a[2] && a[3]) this.achieve('armor');
  }

  // ------------------------------------------------------------ special items & blocks
  useProspectorRod() {
    const p = this.player, w = this.world;
    if (this.rodCooldown > this.ticks) return;
    this.rodCooldown = this.ticks + 20;
    const R = 10;
    const px = Math.floor(p.x), py = Math.floor(p.y + 1), pz = Math.floor(p.z);
    let best = null, bv = 0, bd = 1e9;
    for (let x = px - R; x <= px + R; x++) for (let z = pz - R; z <= pz + R; z++) for (let y = Math.max(1, py - R); y <= Math.min(CH_H - 1, py + R); y++) {
      const v = PROSPECT.get(w.getBlock(x, y, z));
      if (!v) continue;
      const d = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
      if (v > bv || (v === bv && d < bd)) { bv = v; bd = d; best = [x, y, z]; }
    }
    p.swing();
    if (!p.creative) p.inventory.damageHeld(p, 1);
    if (!best) { this.hud.showAction('The rod is still. Nothing valuable nearby.'); this.audio.play('click', 0.4, 0.6); return; }
    const id = w.getBlock(best[0], best[1], best[2]);
    const dx = best[0] - px, dy = best[1] - py, dz = best[2] - pz;
    const dist = Math.round(Math.sqrt(bd));
    const vert = dy < -1 ? ', ' + (-dy) + ' below' : dy > 1 ? ', ' + dy + ' above' : '';
    const dir = (Math.abs(dx) + Math.abs(dz) > 1) ? ' to the ' + compassWord(dx, dz) : ' right here';
    this.hud.showAction('§eThe rod twitches: ' + blockName(id, 0) + ' (' + dist + ' blocks' + dir + vert + ')');
    this.audio.play('chime', 0.6, 0.6 + (1 - dist / 18) * 1.0);
    const l = Math.sqrt(bd) || 1;
    for (let i = 1; i < 6; i++) this.particles.sparkle(p.x + dx / l * i * 0.5, p.y + 1.4 + dy / l * i * 0.5, p.z + dz / l * i * 0.5, 1, 0.9, 0.3, 1, 0.1);
  }
  findUndiscoveredBiome(x0, z0) {
    const p = this.player, gen = this.world.localGen;
    for (let r = 48; r <= 2400; r += 48) {
      const n = Math.max(8, Math.floor(TAU * r / 48));
      let found = null;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        const x = Math.round(x0 + Math.sin(a) * r), z = Math.round(z0 - Math.cos(a) * r);
        const b = gen.biomeAt(x, z);
        if (BIOMES[b] && !p.discovered.biomes[b]) { found = { b, x, z, r }; break; }
      }
      if (found) return found;
    }
    return null;
  }
  useWayfinder() {
    const p = this.player, w = this.world;
    if (this.wayCooldown > this.ticks) return;
    this.wayCooldown = this.ticks + 40;
    p.swing();
    const sp = p.spawnPoint && Array.isArray(p.spawnPoint) ? { x: p.spawnPoint[0], z: p.spawnPoint[2] } : p.spawnPoint;
    const home = sp || w.spawn;
    if (home) {
      const dx = home.x + 0.5 - p.x, dz = home.z + 0.5 - p.z, d = Math.round(Math.hypot(dx, dz));
      this.hud.message('§bWayfinder:§r home is ' + (d < 3 ? 'right here' : d + ' blocks to the ' + compassWord(dx, dz)) + '.');
    }
    const f = this.findUndiscoveredBiome(p.x, p.z);
    if (f) {
      const dx = f.x - p.x, dz = f.z - p.z;
      this.hud.message('§bWayfinder:§r uncharted lands (' + BIOMES[f.b].name + ') lie ~' + f.r + ' blocks to the ' + compassWord(dx, dz) + '.');
      this.hud.showAction('§b' + BIOMES[f.b].name + ': ' + compassWord(dx, dz) + ', ~' + f.r + ' blocks');
      const l = Math.hypot(dx, dz) || 1;
      for (let i = 1; i < 10; i++) this.particles.sparkle(p.x + dx / l * i * 0.6, p.y + 1.3, p.z + dz / l * i * 0.6, 0.4, 1, 0.8, 1, 0.1);
    } else this.hud.showAction('§bThe needle spins lazily. You have seen it all.');
    this.audio.play('chime', 0.6, 1.3);
  }
  useRunestone(x, y, z) {
    const p = this.player, w = this.world;
    const h = p.inventory.held();
    if (!h || h.id !== ITEM_IDS.jade) { this.hud.showAction('§7The runestone is cold. Perhaps something green would wake it.'); return; }
    if (!p.creative) p.inventory.decrementHeld(1);
    this.audio.play('rune', 1, 1, x + 0.5, y + 0.5, z + 0.5);
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; this.particles.sparkle(x + 0.5 + Math.sin(a) * 1.5, y + 1 + (i % 5) * 0.3, z + 0.5 + Math.cos(a) * 1.5, 0.4, 1, 0.7, 1, 0.2); }
    p.effects.regen = Math.max(p.effects.regen || 0, 300);
    p.effects.speed = Math.max(p.effects.speed || 0, 2400);
    p.effects.nightVision = Math.max(p.effects.nightVision || 0, 2400);
    const f = this.findUndiscoveredBiome(x, z);
    if (f) this.hud.message('§aThe runestone hums. You glimpse the ' + BIOMES[f.b].name + ', some ' + f.r + ' blocks to the ' + compassWord(f.x - x, f.z - z) + '.');
    else this.hud.message('§aThe runestone hums softly. You feel at home in this world.');
    this.achieve('rune');
    void w;
  }
  releaseWisp() {
    const p = this.player;
    const t = this.nearestTreasure(p.x, p.z, 160);
    if (!t) { this.hud.showAction('§7The essence flickers... nothing is buried nearby.'); return false; }
    const m = this.spawnMob('wisp', p.x - Math.sin(p.yaw) * 1.5, p.y + 1.6, p.z - Math.cos(p.yaw) * 1.5);
    if (m) { m.guided = true; m.goal = t; m.persistent = false; }
    this.audio.play('wisp', 1, 1.2);
    return true;
  }

  // ------------------------------------------------------------ waterways: boats, fishing, bottles, signs
  placeBoat(held) {
    const p = this.player, w = this.world;
    const eye = this.eyePos(1);
    const [dx, dy, dz] = this.interaction.lookDir();
    const h = raycastBlocks(w, eye[0], eye[1], eye[2], dx, dy, dz, this.interaction.reach(), { fluids: true, anyFluid: true });
    if (!h) return false;
    let y = h.y + 1;
    if (BT.fluid[h.id]) { if (h.id !== B.WATER) return false; }
    else if (h.id === B.SNOW_LAYER) y = h.y;
    else if (h.face !== 1) return false;
    const b = new Boat(w, h.x + 0.5, y, h.z + 0.5, held.dmg);
    b.yaw = b.pyaw = Math.round(p.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const room = b.box.copy(); room.x0 += 0.1; room.y0 += 0.1; room.z0 += 0.1; room.x1 -= 0.1; room.y1 -= 0.1; room.z1 -= 0.1;
    if (collectBoxes(w, room, []).length) return false;
    this.spawnEntity(b);
    this.audio.playBlock('wood', 'place', b.x, b.y, b.z);
    if (!p.creative) p.inventory.decrementHeld(1);
    return true;
  }
  // a minecart goes onto the rail you click (a little higher on a slope)
  placeMinecart(held, hit) {
    const p = this.player, w = this.world;
    const s = Rails.shapeOf(hit.id, hit.meta);
    const c = new Minecart(w, hit.x + 0.5, hit.y + 0.0625 + (Rails.ascending(s) ? 0.5 : 0), hit.z + 0.5, held.id === ITEM_IDS.chest_minecart ? 1 : 0);
    c.yaw = c.pyaw = (s === 1 || s === 2 || s === 3) ? 0 : Math.PI / 2;
    this.spawnEntity(c);
    this.audio.playBlock('metal', 'place', c.x, c.y, c.z);
    if (!p.creative) p.inventory.decrementHeld(1);
    return true;
  }
  openSignEditor(te) { if (this.player && !this.player.dead) this.openScreen(new SignEditScreen(this, te)); }
  onFished(stack) {
    const p = this.player, I = ITEM_IDS;
    p.discovered.items[stack.id] = true;
    p.stats.fishCaught = (p.stats.fishCaught || 0) + 1;
    if ([I.fish, I.salmon, I.sunfish, I.pufferfish, I.glimmerfin].includes(stack.id)) this.achieve('fish');
  }
  readMessageBottle() {
    const p = this.player, w = this.world, gen = w.localGen;
    const good = { beach: 1, swamp: 1, desert: 1, plains: 1, meadow: 1, forest: 1, birch_forest: 1, jungle: 1, salt_flats: 1, stone_shore: 1, canyon: 1, autumn_forest: 1, moors: 1, taiga: 1, mushroom_island: 1 };
    let spot = null;
    for (let i = 0; i < 120 && !spot; i++) {
      const a = Math.random() * TAU, r = 160 + Math.random() * 340;
      const x = Math.floor(p.x + Math.sin(a) * r), z = Math.floor(p.z - Math.cos(a) * r);
      const b = BIOMES[gen.biomeAt(x, z)];
      if (!b || b.key === 'ocean' || b.key === 'deep_ocean' || b.key === 'river') continue;
      if (i < 80 && !good[b.key]) continue;
      spot = { x, z, b };
    }
    p.swing();
    if (!p.creative) p.inventory.decrementHeld(1);
    this.audio.play('chime', 0.6, 0.9);
    if (!spot) { this.hud.showAction('§7The note inside is too faded to read.'); return; }
    const marks = w.info.treasureMarks || (w.info.treasureMarks = []);
    const mark = { x: spot.x, z: spot.z, seed: (Math.random() * 2147483647) | 0, placed: false };
    marks.push(mark);
    this.tryBuryTreasure(mark);
    const d = Math.round(Math.hypot(spot.x - p.x, spot.z - p.z));
    const who = ['Captain Ashby', 'Old Marrow', 'a lost sailor', 'Wren the Bold', 'the Salt Widow', 'one-eyed Pell'][Math.floor(Math.random() * 6)];
    this.hud.message('§eThe note reads:§r "My treasure lies buried in the ' + spot.b.name + ', about ' + d + ' blocks ' + compassWord(spot.x - p.x, spot.z - p.z) + ' of here. Dig where the X is." - ' + who);
    this.hud.showAction('§eAn X has been marked on your Explorer\'s Map');
    this.achieve('bottle');
  }
  tryBuryTreasure(mark) {
    const w = this.world;
    if (mark.placed || !w.isLoaded(mark.x, mark.z)) return false;
    const DIG = new Set([B.SAND, B.GRASS, B.DIRT, B.GRAVEL, B.PODZOL, B.MYCELIUM, B.ASH, B.SALT, B.TERRACOTTA, B.CLAY, B.PEAT, B.SNOW, B.STONE, B.SANDSTONE]);
    let best = null;
    for (let r = 0; r <= 8 && !best; r++) for (let dx = -r; dx <= r && !best; dx++) for (let dz = -r; dz <= r && !best; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = mark.x + dx, z = mark.z + dz;
      if (!w.isLoaded(x, z)) continue;
      const y = w.topSolidY(x, z);
      if (y < 8 || BT.fluid[w.getBlock(x, y + 1, z)] || !DIG.has(w.getBlock(x, y, z))) continue;
      best = { x, y, z };
    }
    if (!best) {
      const y = w.topSolidY(mark.x, mark.z);
      if (y < 8) return false;
      best = { x: mark.x, y, z: mark.z };
    }
    const cy = best.y - 3;
    const rng = new Noise.Random(mark.seed >>> 0);
    w.setBlock(best.x, cy, best.z, B.CHEST, rng.nextInt(4));
    const te = w.getTile(best.x, cy, best.z);
    if (te) {
      te.load({ items: w.localGen.loot(rng, 'treasure') });
      te.buried = true;
      this.treasures.set(best.x + ',' + cy + ',' + best.z, { x: best.x, y: cy, z: best.z });
    }
    mark.placed = true; mark.x = best.x; mark.y = cy; mark.z = best.z;
    return true;
  }
  // walking into a village for the first time puts it on the map
  // stumbling into one of the old Vaults
  checkVaults() {
    const p = this.player, w = this.world;
    if (!w.localGen.vaultAt || p.y > 50) return;
    for (let i = 0; i < 3; i++) {
      const L = w.localGen.vaultAt(i), b = L.box;
      if (p.x < b[0] || p.x > b[3] || p.z < b[2] || p.z > b[5] || p.y < b[1] || p.y > b[4]) continue;
      const list = w.info.vaults || (w.info.vaults = []);
      if (list.includes(i)) return;
      list.push(i);
      this.hud.toast('Vault discovered!', 'An ancient Vault', new ItemStack(B.STONE_BRICKS, 1, 3), '#55ffff');
      this.audio.play('discover', 0.7, 0.7);
      this.achieve('vault');
      return;
    }
  }
  // stumbling on one of the lost things half-buried in the Sift
  checkRelics() {
    const p = this.player, w = this.world;
    const L = w.localGen.nearestRelic && w.localGen.nearestRelic(p.x, p.z);
    if (!L || (L.x - p.x) ** 2 + (L.z - p.z) ** 2 > 12 * 12) return;
    const st = Sift.state(w.info), key = L.x + ',' + L.z;
    st.relics = st.relics || [];
    if (st.relics.includes(key)) return;
    st.relics.push(key);
    const name = { house: 'A sunken cottage', tower: 'A fallen tower', ship: 'A stranded ship', statue: 'A buried colossus', arch: 'A door to nowhere', bell: 'The sunken bell', cart: 'A runaway cart' }[L.kind] || 'Something lost';
    this.hud.toast('Relic found', name, new ItemStack(B.SILTSTONE_BRICKS, 1, 2), '#d8d0f0');
    this.audio.play('discover', 0.7, 0.75);
    this.achieve('relic');
  }
  // coming upon one of the old observatories out on the Drift Isles
  checkObservatory() {
    const p = this.player, g = this.world.localGen;
    if (p.achievements.observatory || !g.column || !g.isleKind) return;
    const col = g.column(Math.floor(p.x), Math.floor(p.z)), d = col && col[2];
    if (!d || g.isleKind(d) !== 'observatory' || (d.x - p.x) ** 2 + (d.z - p.z) ** 2 > 18 * 18) return;
    this.hud.toast('Discovered', 'An old observatory', new ItemStack(ITEM_IDS.orrery_gear, 1, 0), '#d8d0f0');
    this.audio.play('discover', 0.7, 0.9);
    this.achieve('observatory');
  }
  // coming down into a forgotten city
  checkCities() {
    const p = this.player, w = this.world;
    if (!w.localGen.nearestCity || p.y > 60 || (w.genOpts && (w.genOpts.structures === false || w.genOpts.type === 'flat'))) return;
    const L = w.localGen.nearestCity(p.x, p.z);
    if (!L) return;
    const b = L.box;
    if (p.x < b[0] || p.x > b[3] || p.z < b[2] || p.z > b[5] || p.y < b[1] || p.y > b[4]) return;
    const list = w.info.cities || (w.info.cities = []);
    if (list.some((c) => c[0] === L.x && c[1] === L.z)) return;
    list.push([L.x, L.z]);
    this.hud.toast('City discovered!', 'A forgotten city', new ItemStack(B.DEEPSTONE_BRICKS, 1, 2), '#5fe0d0');
    this.audio.play('discover', 0.7, 0.6);
    this.achieve('city');
  }
  // walking into the walls of an Underworld fortress
  checkFortress() {
    const p = this.player, w = this.world;
    const L = w.localGen.fortressNear && w.localGen.fortressNear(p.x, p.z);
    if (!L || p.y < L.F - 4 || p.y > L.F + 8) return;
    const list = w.info.fortresses || (w.info.fortresses = []);
    if (list.some((f) => f[0] === L.sx && f[1] === L.sz)) return;
    list.push([L.sx, L.sz]);
    this.hud.toast('Fortress discovered!', 'Brimstone Fortress', new ItemStack(B.BRIMSTONE_BRICKS, 1, 0), '#ff8855');
    this.audio.play('discover', 0.7, 0.8);
    this.achieve('fortress');
  }
  checkVillages() {
    const w = this.world, p = this.player;
    if (!w || !p || w.menu || !w.localGen || !w.localGen.villageAt || w.genOpts && w.genOpts.structures === false || (w.genOpts && w.genOpts.type === 'flat')) return;
    const cx = Math.floor(p.x) >> 4, cz = Math.floor(p.z) >> 4;
    const list = w.info.villages || (w.info.villages = []);
    for (let rx = Math.floor((cx - 4) / 20); rx <= Math.floor((cx + 4) / 20); rx++) for (let rz = Math.floor((cz - 4) / 20); rz <= Math.floor((cz + 4) / 20); rz++) {
      const V = w.localGen.villageAt(rx, rz);
      if (!V || (V.x - p.x) ** 2 + (V.z - p.z) ** 2 > 48 * 48) continue;
      if (list.some((v) => v.x === V.x && v.z === V.z)) continue;
      list.push({ x: V.x, z: V.z, style: V.style });
      this.hud.toast('Village discovered!', { plains: 'A village on the plains', desert: 'A desert village', taiga: 'A taiga village' }[V.style] || 'A village', new ItemStack(B.HAY_BALE, 1, 0), '#ffd060');
      this.audio.play('discover', 0.8, 1.05);
      this.achieve('village');
    }
  }
  tickWaterways() {
    const p = this.player, w = this.world;
    // the rod's icon shows the cast line
    const held = p.inventory.held();
    const cast = !!(p.fishHook && !p.fishHook.removed && held && held.id === ITEM_IDS.fishing_rod);
    if (cast !== FISHING.cast) {
      FISHING.cast = cast;
      const icons = this.gui.icons, pre = ITEM_IDS.fishing_rod + ':';
      for (const k of [...icons.cache.keys()]) if (k.startsWith(pre)) icons.cache.delete(k);
    }
    // climb back into the boat you saved the game in
    const m = p.pendingMount;
    if (m) {
      const b = w.entities.find((e) => (e.type === 'boat' || (e.type === 'minecart' && e.kind === 0)) && !e.removed && !e.rider && Math.abs(e.x - m.x) < 1.5 && Math.abs(e.z - m.z) < 1.5 && Math.abs(e.y - m.y) < 2);
      if (b) { b.mount(p); p.pendingMount = null; }
      else if (--m.t <= 0) p.pendingMount = null;
    }
    if (p.riding) {
      const v = p.riding, d = Math.hypot(v.x - v.px, v.z - v.pz);
      if (v.type === 'minecart') { p.stats.carted = (p.stats.carted || 0) + d; if (p.stats.carted >= 1000) this.achieve('rails'); }
      else { p.stats.sailed = (p.stats.sailed || 0) + d; if (p.stats.sailed >= 500) this.achieve('sail'); }
    }
  }

  // ------------------------------------------------------------ rendering
  setupCamera(partial) {
    const cam = this.camera, p = this.player, w = this.world;
    cam.roll = 0; cam.bobPitch = 0; cam.bobX = 0; cam.bobY = 0;
    if (!p) {
      const mc = this.menuCam;
      const t = performance.now() / 1000;
      if (mc) { cam.x = mc.x; cam.y = mc.y; cam.z = mc.z; cam.yaw = mc.yaw + t * 0.045; cam.pitch = -0.12 + Math.sin(t * 0.07) * 0.06; }
      else { cam.x = 0; cam.y = 90; cam.z = 0; cam.yaw = t * 0.05; cam.pitch = 0; }
      cam.fov = 70;
      return;
    }
    const [x, y, z] = p.lerpPos(partial);
    let eye = 1.62 + p.peyeOffset + (p.eyeOffset - p.peyeOffset) * partial;
    if (p.sleeping) eye = 0.2;
    if (p.dead) eye = 1.62 - Math.min(1, (p.deathTime + partial) / 20) * 1.3;
    cam.x = x; cam.y = y + eye; cam.z = z;
    cam.yaw = p.yaw; cam.pitch = p.sleeping ? 0.25 : p.pitch;
    if (this.settings.viewBobbing && !this.thirdPerson && !p.sleeping) {
      const dw = p.distWalked - p.pdistWalked, f1 = -(p.distWalked + dw * partial);
      const bob = p.pbob + (p.bob - p.pbob) * partial, bp = p.pbobPitch + (p.bobPitch - p.pbobPitch) * partial;
      cam.bobX = Math.sin(f1 * Math.PI) * bob * 0.5;
      cam.bobY = -Math.abs(Math.cos(f1 * Math.PI) * bob);
      cam.roll = Math.sin(f1 * Math.PI) * bob * 3 * DEG;
      cam.bobPitch = (Math.abs(Math.cos(f1 * Math.PI - 0.2) * bob) * 5 + bp) * DEG;
    }
    if (p.hurtTime > 0 || p.dead) {
      let f = p.dead ? Math.min(1, (p.deathTime + partial) / 20) : (p.hurtTime - partial) / 10;
      if (p.dead) cam.roll += 40 * DEG * f;
      else { f = Math.sin(f * f * f * f * Math.PI); cam.roll -= f * 14 * DEG * Math.cos(p.hurtDir * DEG); cam.bobPitch += f * 6 * DEG * Math.sin(p.hurtDir * DEG); }
    }
    let fov = this.settings.fov * (this.pfovMod + (this.fovMod - this.pfovMod) * partial);
    if (p.headInWater) fov *= 60 / 70;
    cam.fov = fov;
    if (this.thirdPerson) {
      if (this.thirdPerson === 2) { cam.yaw = p.yaw + Math.PI; cam.pitch = -p.pitch; }
      const fx = -Math.sin(cam.yaw) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
      let dist = 4;
      const h = raycastBlocks(w, cam.x, cam.y, cam.z, -fx, -fy, -fz, 4.2, { collision: true });
      if (h) dist = Math.max(0.3, h.t - 0.25);
      cam.x -= fx * dist; cam.y -= fy * dist; cam.z -= fz * dist;
    }
  }
  render(partial, dt) {
    const r = this.renderer, gl = r.gl, w = this.world, p = this.player, gui = this.gui;
    const cam = this.camera;
    gui.begin();
    if (w && !this.loading) {
      this.setupCamera(partial);
      r.updateMeshes(w, this.screen && this.screen.pauses ? 2 : 4);
      if (p && !p.dead && !this.screen) this.interaction.updateTarget(this.eyePos(partial));
      this.audio.setListener(cam.x, cam.y, cam.z, cam.yaw);
      // fluid at the camera
      let inFluid = null;
      const cx = Math.floor(cam.x), cy = Math.floor(cam.y), cz = Math.floor(cam.z);
      const cid = w.getBlock(cx, cy, cz);
      if (cid === B.WATER) { const top = cy + 1 - fluidHeightFrac(w.getMeta(cx, cy, cz)); if (cam.y < top) inFluid = 'water'; }
      else if (cid === B.LAVA) inFluid = 'lava';
      // moorland mist
      let mistT = 0;
      if (p) { const b = BIOMES[w.biomeAt(cx, cz)]; if (b && b.key === 'moors' && w.canSeeSky(cx, cy, cz)) mistT = 0.6 + 0.4 * w.rainStrength; }
      this.mist += (mistT - this.mist) * Math.min(1, dt / 3000);
      let nv = 0;
      if (p && p.effects.nightVision) { const t = p.effects.nightVision; nv = t > 200 ? 1 : 0.7 + Math.sin((t - partial) * Math.PI * 0.2) * 0.3; }
      // darkness: comes on over a second, then beats like a slow heart
      this.darkT += ((p && p.effects.darkness ? 1 : 0) - this.darkT) * Math.min(1, dt / 700);
      const dark = this.darkT < 0.01 ? 0 : this.darkT * (0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin((w.time + partial) / 60 * TAU), 2));
      const er = this.entityRenderer;
      const hooks = {
        lightExtra: { nightVision: nv, darkness: dark }, dark,
        inFluid, waterVision: this.waterTime / 600,
        moorMist: this.mist > 0.01 ? this.mist : 0,
        drawWorldObjects: (rr, pt) => {
          er.render(cam, pt);
          this.particles.render(rr, cam, pt);
          if (p && !this.hideHud && !p.dead && this.interaction.hit) er.drawSelection(cam, this.interaction.hit, this.interaction.breaking);
        },
        drawWeather: (rr, pt) => this.drawWeather(rr, pt),
        drawHand: p ? (rr, pt) => er.drawHand(cam, pt) : null,
      };
      r.render(w, cam, partial, hooks);
      if (p && !this.screen && !this.hideHud && !this.thirdPerson && !p.dead && !p.sleeping) this.drawCrosshair();
      if (this.screen && this.screen.previewRect && p) this.drawPreview(this.screen.previewRect, this.screen.previewMouse, partial);
    } else {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (this.loading && w) r.updateMeshes(w, 12);
    }
    if (p && w && !w.menu && !this.loading) { this.hud.draw(gui, partial); this.touch.draw(gui); }
    if (this.screen) {
      if (this.screen.previewRect) this.screen.previewRect = null;
      this.screen.draw(gui, this.input.mx, this.input.my);
      const pr = this.screen.previewRect;
      if (pr && p) { const s = gui.scale; gui.ctx.clearRect(pr[0], pr[1], pr[2], pr[3]); void s; }
    }
    if (this.screenshotPending) { this.screenshotPending = false; this.takeScreenshot(); }
  }
  drawCrosshair() {
    const r = this.renderer, gl = r.gl, b = r.batch, s = this.gui.scale * (r.width / this.guiCanvas.width);
    const W = r.width, H = r.height;
    const m = Mat4.create();
    Mat4.ortho(m, 0, W, H, 0, -1, 1);
    b.reset();
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const L = Math.round(4.5 * s), T = Math.max(1, Math.round(s));
    const er = this.entityRenderer, col = [255, 255, 255, 255];
    const q = (x0, y0, x1, y1) => er.quadOut(b, [[x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x0, y0, 0]], [[0, 0], [0, 0], [0, 0], [0, 0]], 0, col, -1, 0);
    const h0 = cx - L, h1 = cx + L + T;
    q(h0, cy, h1, cy + T);
    q(cx, cy - L, cx + T, cy);
    q(cx, cy + T, cx + T, cy + L + T);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE_MINUS_SRC_COLOR);
    r.useEnt(m, 2, -1, false);
    b.flush();
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  }
  drawPreview(rect, mouse, partial) {
    const r = this.renderer, gl = r.gl, p = this.player, er = this.entityRenderer;
    const f = r.width / this.guiCanvas.width * this.gui.scale;
    const vx = Math.round(rect[0] * f), vw = Math.round(rect[2] * f), vh = Math.round(rect[3] * f);
    const vy = r.height - Math.round(rect[1] * f) - vh;
    if (vw <= 0 || vh <= 0) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(vx, vy, vw, vh);
    gl.viewport(vx, vy, vw, vh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const S = rect[3] / 2.25;
    const hw = rect[2] / 2 / S, top = rect[3] / S;
    const proj = Mat4.create();
    Mat4.ortho(proj, -hw, hw, -0.1, top - 0.1, -10, 10);
    // the figure follows the mouse
    const mx = mouse ? mouse[0] - (rect[0] + rect[2] / 2) : 0, my = mouse ? mouse[1] - (rect[1] + rect[3] * 0.3) : 0;
    const by = Math.PI + Math.atan(mx / 40) * 20 * DEG, hy = Math.PI + Math.atan(mx / 40) * 40 * DEG, pt = -Math.atan(my / 40) * 20 * DEG;
    const proxy = Object.create(p);
    Object.assign(proxy, { x: p.x, y: 300, z: p.z, bodyYaw: by, pbodyYaw: by, headYaw: hy, pheadYaw: hy, pitch: -pt, ppitch: -pt, limbAmount: 0, prevLimbAmount: 0, limbSwing: 0, hurtTime: 0, dead: false, deathTime: 0, sneaking: false, sleeping: false, swingProgress: 0, pswing: 0 });
    er.skinBatch.reset(); r.batch.reset();
    er.drawHumanoid(proxy, 0, 0, 0, 1, this.playerSkin(), 'biped', { glow: true });
    gl.disable(gl.CULL_FACE);
    r.useEnt(proj, 1, 0.1, false); er.skinBatch.flush();
    r.useEnt(proj, 0, 0.1, false); r.batch.flush();
    er.flushGlint(proj);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, r.width, r.height);
    void partial;
  }
  drawWeather(r, partial) {
    const w = this.world, cam = this.camera;
    const sift = w.dim === 3;
    const rain = sift ? 0.3 : w.prevRainStrength + (w.rainStrength - w.prevRainStrength) * partial;
    if (rain <= 0.01) return;
    const gl = r.gl, b = r.batch, er = this.entityRenderer;
    b.reset();
    const R = this.settings.graphics === 'fancy' ? 10 : 5;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y), cz = Math.floor(cam.z);
    const t = w.time + partial;
    const rainL = r.atlas.layer('rain'), snowL = r.atlas.layer('snowfall');
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!w.isLoaded(x, z)) continue;
      const bid = w.biomeAt(x, z), bi = BIOMES[bid];
      if (!bi || (bi.rain <= 0 && !sift)) continue;
      const top = w.heightAt(x, z);
      const y0 = Math.max(top, cy - R), y1 = Math.max(top, cy + R);
      if (y1 <= y0) continue;
      const ddx = x + 0.5 - cam.x, ddz = z + 0.5 - cam.z, dist2 = ddx * ddx + ddz * ddz;
      const alpha = ((1 - dist2 / (R * R)) * 0.5 + 0.5) * rain;
      if (alpha <= 0.02) continue;
      const snow = sift || w.localGen.tempAt(bid, top) < 0.15;
      const dl = Math.sqrt(dist2) || 1;
      const ox = -ddz / dl * 0.5, oz = ddx / dl * 0.5;
      const px = x + 0.5 - cam.x, pz = z + 0.5 - cam.z, yb = y0 - cam.y, yt = y1 - cam.y;
      const rnd = ((x * x * 3121 + x * 45238971 + z * z * 418711 + z * 13761) & 31);
      // the 16px weather tiles repeat 4x across each column for thin streaks / small flakes
      let v0, v1, u0 = 0, u1 = 4;
      if (snow) {
        const f = (t + rnd) / 512 * (sift ? 2.2 : 6);
        v0 = y1 * 2 - f * 4; v1 = y0 * 2 - f * 4;
        const drift = Math.sin((t + rnd * 7) * 0.01) * 1.5 + rnd * 0.1;
        u0 += drift; u1 += drift;
      } else {
        const f = (t + rnd) / 32 * (3 + (rnd & 7) / 8) * 2;
        v0 = y1 - f; v1 = y0 - f;
        u0 += rnd * 0.37; u1 += rnd * 0.37;
      }
      const l = w.getLightRaw(x, Math.max(top, cy), z);
      const col = sift ? [196, 192, 214, Math.round(alpha * 200)] : snow ? [255, 255, 255, Math.round(alpha * 255)] : [255, 255, 255, Math.round(alpha * 210)];
      er.quadOut(b, [[px - ox, yb, pz - oz], [px + ox, yb, pz + oz], [px + ox, yt, pz + oz], [px - ox, yt, pz - oz]], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], snow ? snowL : rainL, col, (l >> 4) / 15, (l & 15) / 15);
    }
    if (!b.n) return;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    r.useEnt(r.vp, 0, 0.01, true);
    b.flush();
    gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
  }
  takeScreenshot() {
    try {
      const cv = document.createElement('canvas');
      cv.width = this.guiCanvas.width; cv.height = this.guiCanvas.height;
      const ctx = cv.getContext('2d');
      ctx.drawImage(this.glCanvas, 0, 0, cv.width, cv.height);
      ctx.drawImage(this.guiCanvas, 0, 0);
      const d = new Date(), pad = (n) => String(n).padStart(2, '0');
      const name = 'blocklands_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + '.' + pad(d.getSeconds()) + '.png';
      cv.toBlob((blob) => { if (blob) { downloadBlob(blob, name); this.hud.message('Saved screenshot as ' + name); } });
    } catch (e) { this.hud.message('Could not take screenshot: ' + e.message, '#ff5555'); }
  }
}

// ---------------------------------------------------------------------------
window.addEventListener('load', () => {
  try { window.game = new Game(); }
  catch (e) {
    console.error(e);
    const el = document.getElementById('fatal');
    if (el) { el.style.display = 'flex'; el.querySelector('.msg').textContent = 'Blocklands failed to start.'; el.querySelector('.detail').textContent = String(e && e.stack || e); }
  }
});
