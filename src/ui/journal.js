'use strict';
// ---------------------------------------------------------------------------
// Explorer's Journal & milestones (achievements)
// ---------------------------------------------------------------------------
const MILESTONES = [
  { id: 'wood', name: 'Timber!', desc: 'Punch a tree until a log pops out', icon: () => [B.LOG, 0] },
  { id: 'bench', name: 'Benchmark', desc: 'Craft a crafting table', icon: () => [B.CRAFTING_TABLE, 0] },
  { id: 'pick', name: 'Stone Age', desc: 'Craft a stone pickaxe', icon: () => [ITEM_IDS.stone_pickaxe, 0] },
  { id: 'furnace', name: 'Hot Topic', desc: 'Build a furnace', icon: () => [B.FURNACE, 0] },
  { id: 'iron', name: 'Iron Will', desc: 'Smelt an iron ingot', icon: () => [ITEM_IDS.iron_ingot, 0] },
  { id: 'bread', name: 'Bread Winner', desc: 'Bake a loaf of bread', icon: () => [ITEM_IDS.bread, 0] },
  { id: 'kill', name: 'Monster Hunter', desc: 'Defeat a hostile monster', icon: () => [ITEM_IDS.iron_sword, 0] },
  { id: 'bed', name: 'Home Sweet Home', desc: 'Sleep through the night', icon: () => [ITEM_IDS.bed, 0] },
  { id: 'diamond', name: 'Shiny!', desc: 'Find a diamond', icon: () => [ITEM_IDS.diamond, 0] },
  { id: 'deep', name: 'Into the Deep', desc: 'Descend near the lava lakes', icon: () => [ITEM_IDS.lava_bucket, 0] },
  { id: 'high', name: 'Head in the Clouds', desc: 'Climb above the clouds', icon: () => [B.SNOW, 0] },
  { id: 'cobalt', name: 'Cobalt Blue', desc: 'Mine cobalt ore', icon: () => [B.COBALT_ORE, 0] },
  { id: 'jade', name: 'Jaded', desc: 'Find jade in the high places', icon: () => [ITEM_IDS.jade, 0] },
  { id: 'lumite', name: 'Glow Up', desc: 'Discover lumite crystals', icon: () => [B.LUMITE_CRYSTAL, 0] },
  { id: 'star', name: 'Starstruck', desc: 'Find a fallen star', icon: () => [B.STARMETAL_ORE, 0] },
  { id: 'starsword', name: 'Overkill', desc: 'Forge a starmetal sword', icon: () => [ITEM_IDS.starmetal_sword, 0] },
  { id: 'armor', name: 'Suited Up', desc: 'Wear a full set of armour', icon: () => [ITEM_IDS.iron_chestplate, 0] },
  { id: 'treasure', name: 'X Marks the Spot', desc: 'Dig up buried treasure', icon: () => [B.CHEST, 0] },
  { id: 'wisp', name: 'Follow the Light', desc: 'Meet a wisp', icon: () => [ITEM_IDS.wisp_essence, 0] },
  { id: 'stranger', name: 'Not Alone', desc: 'Glimpse the Stranger', icon: () => [ITEM_IDS.spawn_egg, 0] },
  { id: 'rune', name: 'Runic', desc: 'Wake a runestone', icon: () => [B.RUNESTONE, 0] },
  { id: 'biomes10', name: 'Off the Map', desc: 'Discover 10 biomes', icon: () => [ITEM_IDS.compass, 0] },
  { id: 'biomesAll', name: 'World Traveller', desc: 'Discover every biome', icon: () => [ITEM_IDS.wayfinder, 0] },
  { id: 'harvest', name: 'Green Thumb', desc: 'Harvest fully grown wheat', icon: () => [ITEM_IDS.wheat, 0] },
  { id: 'breed', name: 'Rancher', desc: 'Breed two animals', icon: () => [ITEM_IDS.wheat, 0] },
  { id: 'tame', name: 'Best Friend', desc: 'Tame a wolf with bones', icon: () => [ITEM_IDS.bone, 0] },
  { id: 'tnt', name: 'Kaboom', desc: 'Craft TNT', icon: () => [B.TNT, 0] },
  { id: 'fish', name: 'Gone Fishing', desc: 'Catch a fish', icon: () => [ITEM_IDS.fish, 0] },
  { id: 'sail', name: 'Set Sail', desc: 'Row a boat 500 blocks', icon: () => [ITEM_IDS.boat, 0] },
  { id: 'village', name: 'Neighbours', desc: 'Find a village', icon: () => [B.HAY_BALE, 0] },
  { id: 'trade', name: 'Fair Trade', desc: 'Trade with a villager', icon: () => [ITEM_IDS.jade, 0] },
  { id: 'mineshaft', name: 'Down the Shaft', desc: 'Find a chest minecart in an abandoned mineshaft', icon: () => [ITEM_IDS.chest_minecart, 0] },
  { id: 'rails', name: 'On the Rails', desc: 'Ride a minecart 1000 blocks', icon: () => [ITEM_IDS.minecart, 0] },
  { id: 'bottle', name: 'Message Received', desc: 'Read a message in a bottle', icon: () => [ITEM_IDS.message_bottle, 0] },
  { id: 'enchant', name: 'Enchanter', desc: 'Enchant an item at an enchanting table', icon: () => [B.ENCHANTING_TABLE, 0] },
  { id: 'lamp', name: 'Bright Idea', desc: 'Light an ember lamp with a circuit', icon: () => [B.EMBER_LAMP_ON, 0] },
  { id: 'portal', name: 'Gateway', desc: 'Build and light an Underworld portal', icon: () => [B.OBSIDIAN, 0] },
  { id: 'underworld', name: 'Hot Under the Collar', desc: 'Step into the Underworld', icon: () => [B.BRIMSTONE, 0] },
  { id: 'fortress', name: 'Brimstone Bastion', desc: 'Find an Underworld fortress', icon: () => [B.BRIMSTONE_BRICKS, 0] },
  { id: 'flare', name: 'Playing with Fire', desc: 'Collect a flare rod', icon: () => [ITEM_IDS.flare_rod, 0] },
  { id: 'wailer', name: 'Hush Now', desc: 'Bring down a wailer', icon: () => [ITEM_IDS.wailer_tear, 0] },
  { id: 'regions', name: 'Underworld Cartographer', desc: 'Discover every region of the Underworld', icon: () => [B.SUNSTONE, 0] },
];
const BIOME_DESCRIPTIONS = {
  ocean: 'Endless water. Sunken ruins rest on the sea floor.', deep_ocean: 'The water grows dark and cold.', plains: 'Rolling grass, wildflowers and the occasional lonely oak.',
  desert: 'Sand, cacti and the bones of old wells. Watch for quicksand.', mountains: 'Peaks above the clouds. Jade hides in the stone.', forest: 'Oaks and birches. A good first home.',
  birch_forest: 'Pale trunks as far as the eye can see.', taiga: 'Spruce and pine, ferns and deer.', snowy_tundra: 'A white, windswept plain.', snowy_taiga: 'Snow-laden spruce forests.',
  swamp: 'Murky water and twisted oaks. Lights drift here at night.', jungle: 'Towering trees, vines and melons.', mushroom_island: 'A strange island of giant mushrooms.',
  beach: 'Sand between land and sea.', river: 'Rivers wind toward the ocean.', autumn_forest: 'Red and gold maples, forever in autumn.', redwood_grove: 'Colossal red trunks that pierce the sky.',
  moors: 'Heather, peat and mist. Stone circles keep old secrets.', ashen_wastes: 'Ash and basalt around pools of lava. Sulfur glitters in the rock.',
  salt_flats: 'Blinding white salt crust. Stars fall here often.', meadow: 'Flowers in every colour.', canyon: 'Banded red cliffs rich in gold.', stone_shore: 'Bare stone where mountains meet the sea.',
  brimstone_depths: 'Underworld. Lava seas beneath a roof of red rock, lit by sunstone.', bone_shoals: 'Underworld. Drifts of bone sand and the ribs of long-dead giants. Bloodcap grows wild.',
  cinder_hollows: 'Underworld. Ash, basalt pillars and smouldering vents. Magma slimes bask here.', glimmering_grotto: 'Underworld. Smoky quartz spires and clusters of sunstone: a rare, bright refuge.',
};
class JournalScreen extends Screen {
  constructor(game, parent) { super(game); this.parent = parent; this.background = 'world'; this.tab = 0; this.page = 0; this.pauses = !!parent; }
  init() {
    const cx = this.W / 2;
    this.bw = Math.min(300, this.W - 20); this.bh = Math.min(190, this.H - 50);
    this.bx = Math.floor(cx - this.bw / 2); this.by = Math.floor((this.H - this.bh) / 2) - 8;
    const tabs = ['Biomes', 'Creatures', 'Milestones'];
    tabs.forEach((t, i) => this.add(new Button(this.bx + i * 72, this.by - 22, 70, 20, () => (this.tab === i ? '§e' : '') + t, () => { this.tab = i; this.page = 0; })));
    this.add(new Button(this.bx, this.by + this.bh + 4, 40, 20, '<', () => { this.page = Math.max(0, this.page - 1); }));
    this.add(new Button(this.bx + this.bw - 40, this.by + this.bh + 4, 40, 20, '>', () => { this.page = Math.min(this.pages() - 1, this.page + 1); }));
    this.add(new Button(cx - 40, this.by + this.bh + 4, 80, 20, 'Close', () => this.close()));
  }
  entries() {
    const p = this.game.player;
    if (this.tab === 0) return BIOMES.filter(Boolean).map((b) => ({ known: !!p.discovered.biomes[b.id], title: b.name, text: BIOME_DESCRIPTIONS[b.key] || '' }));
    if (this.tab === 1) return MOB_TYPES.filter((m) => m && !m.hidden).map((m) => ({ known: !!p.discovered.mobs[m.key], title: m.name, text: m.lore || '' }));
    return MILESTONES.map((a) => ({ known: !!p.achievements[a.id], title: a.name, text: a.desc, icon: a.icon(), always: true }));
  }
  perPage() { return Math.max(1, Math.floor((this.bh - 30) / 30)) * 2; }
  pages() { return Math.max(1, Math.ceil(this.entries().length / this.perPage())); }
  close() { if (this.parent) this.game.openScreen(this.parent); else this.game.closeScreen(); }
  draw(gui, mx, my) {
    gui.worldOverlay();
    const ctx = gui.ctx, x = this.bx, y = this.by, w = this.bw, h = this.bh;
    // book
    ctx.fillStyle = '#3a2410'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#f2e5c6'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e2d2ae'; ctx.fillRect(x + w / 2 - 1, y, 2, h);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(120,80,40,' + (0.06 - i * 0.01) + ')'; ctx.fillRect(x + w / 2 - 2 - i * 2, y, 2, h); ctx.fillRect(x + w / 2 + i * 2, y, 2, h); }
    const ents = this.entries();
    const known = ents.filter((e) => e.known).length;
    const title = ['Biomes', 'Creatures', 'Milestones'][this.tab];
    gui.text(title + '  ' + known + '/' + ents.length, x + 8, y + 6, '#5a3a1a', false);
    gui.textRight((this.page + 1) + '/' + this.pages(), x + w - 8, y + 6, '#8a6a4a', false);
    const per = this.perPage(), half = per / 2;
    const list = ents.slice(this.page * per, this.page * per + per);
    list.forEach((e, i) => {
      const col = i < half ? 0 : 1;
      const row = i % half;
      const ex = x + 8 + col * (w / 2), ey = y + 20 + row * 30;
      const pw = w / 2 - 16;
      if (e.icon) { if (!e.known) ctx.globalAlpha = 0.3; gui.item(new ItemStack(e.icon[0], 1, e.icon[1]), ex, ey + 2); ctx.globalAlpha = 1; }
      const tx = e.icon ? ex + 20 : ex;
      const tw = e.icon ? pw - 20 : pw;
      if (e.known || e.always) {
        gui.text(e.title, tx, ey, e.known ? '#3a2410' : '#9a8a70', false);
        const lines = gui.font.wrap(e.text, tw);
        lines.slice(0, 2).forEach((l, k) => gui.text(l, tx, ey + 10 + k * 9, e.known ? '#6a5030' : '#b0a080', false));
      } else {
        gui.text('???', tx, ey, '#9a8a70', false);
        gui.text('Not yet discovered', tx, ey + 10, '#b0a080', false);
      }
    });
    for (const wd of this.widgets) wd.draw(gui, mx, my);
  }
  keyDown(e) {
    if (e.code === KEYS.journal || e.key === 'Escape') { this.close(); return; }
    if (e.key === 'ArrowRight') this.page = Math.min(this.pages() - 1, this.page + 1);
    if (e.key === 'ArrowLeft') this.page = Math.max(0, this.page - 1);
  }
}
