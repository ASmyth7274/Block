'use strict';
// ---------------------------------------------------------------------------
// Player interaction: targeting, mining, placing, attacking, using items
// ---------------------------------------------------------------------------
class Interaction {
  constructor(game) {
    this.game = game;
    this.hit = null;          // block hit
    this.entity = null;       // targeted entity
    this.breaking = null;     // { x, y, z, id, progress, prev }
    this.hitDelay = 0;
    this.useDelay = 0;
    this.left = false; this.right = false;
    this.rayOverride = null;  // touch: [dx, dy, dz]
    this.soundTimer = 0;
  }
  reach() { return this.game.player.creative ? 5 : 4.5; }
  entityReach() { return this.game.player.creative ? 5 : 3.5; }
  lookDir() {
    if (this.rayOverride) return this.rayOverride;
    const p = this.game.player;
    return [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
  }
  // called every frame with interpolated eye position
  updateTarget(eye) {
    const g = this.game, p = g.player, w = g.world;
    if (!p || p.dead || p.sleeping) { this.hit = null; this.entity = null; return; }
    const [dx, dy, dz] = this.lookDir();
    const reach = this.reach();
    const hit = raycastBlocks(w, eye[0], eye[1], eye[2], dx, dy, dz, reach);
    let ent = null, et = hit ? hit.t : reach;
    const er = Math.min(this.entityReach(), et);
    for (const e of w.entities) {
      if (e.removed || e.dead || !e.hurt || e === p || e === p.riding) continue;
      if (Math.abs(e.x - eye[0]) > 8 || Math.abs(e.z - eye[2]) > 8) continue;
      e.updateBox();
      const b = e.box.copy(); b.x0 -= 0.1; b.y0 -= 0.1; b.z0 -= 0.1; b.x1 += 0.1; b.y1 += 0.1; b.z1 += 0.1;
      const h = rayBox(eye[0], eye[1], eye[2], dx, dy, dz, b);
      if (h && h.t <= er && h.t < et) { et = h.t; ent = e; }
    }
    this.entity = ent;
    this.hit = ent ? null : hit;
  }

  // ---------------------------------------------------------------- input
  press(button) {
    const g = this.game, p = g.player;
    if (!p || p.dead) return;
    if (button === 0) { this.left = true; this.attackOrMine(true); }
    else if (button === 2) { this.right = true; this.use(); this.useDelay = 4; }
    else if (button === 1) this.pickBlock();
  }
  release(button) {
    if (button === 0) { this.left = false; this.stopMining(); }
    else if (button === 2) { this.right = false; this.noRepeat = false; }
  }
  tick() {
    const g = this.game, p = g.player;
    if (!p || p.dead) { this.breaking = null; return; }
    if (this.hitDelay > 0) this.hitDelay--;
    if (this.useDelay > 0) this.useDelay--;
    if (this.left) this.attackOrMine(false);
    else this.stopMining();
    if (this.right && this.useDelay === 0 && !p.useItem && !this.noRepeat) { this.use(); this.useDelay = 4; }
  }

  // ---------------------------------------------------------------- mining
  strength(id, meta) {
    const p = this.game.player;
    const d = BLOCKS[id];
    if (!d || d.hardness < 0) return 0;
    if (d.hardness === 0) return 1;
    const held = p.inventory.held();
    const tool = held ? toolOf(held.id) : null;
    let speed = 1;
    if (tool) {
      if (tool.kind === d.tool) speed = tool.speed;
      if (tool.kind === 'sword' && id === B.COBWEB) speed = 15;
      if (tool.kind === 'sword' && (id === B.LEAVES || id === B.PUMPKIN || id === B.MELON || id === B.VINE || id === B.LEAF_LITTER)) speed = 1.5;
      if (tool.kind === 'shears' && (id === B.LEAVES || id === B.COBWEB)) speed = 15;
      if (tool.kind === 'shears' && (id === B.WOOL || id === B.CARPET)) speed = 5;
      if (tool.kind === 'shears' && id === B.VINE) speed = 2;
      if (tool.kind === 'axe' && (id === B.LEAVES || id === B.HUGE_MUSHROOM_BROWN || id === B.HUGE_MUSHROOM_RED)) speed = Math.max(speed, tool.speed * 0.5);
    }
    const eff = Enchant.level(held, 'efficiency');
    if (eff && speed > 1) speed += eff * eff + 1;
    if (p.headInWater && !Enchant.level(p.inventory.armor.items[0], 'aqua_affinity')) speed *= 0.2;
    if (!p.onGround && !p.flying) speed *= 0.2;
    if (p.effects.haste) speed *= 1.4;
    const can = this.canHarvest(id, tool);
    return speed / d.hardness / (can ? 30 : 100);
  }
  canHarvest(id, tool) {
    const d = BLOCKS[id];
    if (!d.needsTool) return true;
    if (!tool) return false;
    if (id === B.COBWEB) return tool.kind === 'sword' || tool.kind === 'shears';
    return tool.kind === d.tool && tool.level >= d.level;
  }
  attackOrMine(first) {
    const g = this.game, p = g.player, w = g.world;
    if (p.useItem) return;
    if (this.entity) {
      if (first) { this.attack(this.entity); p.swing(); }
      this.breaking = null;
      return;
    }
    if (first || this.left) p.swing();
    const hit = this.hit;
    if (!hit) { this.breaking = null; return; }
    if (this.hitDelay > 0) return;
    const id = w.getBlock(hit.x, hit.y, hit.z);
    if (id === 0 || BT.fluid[id]) { this.breaking = null; return; }
    if (id === B.EMBER_ORE) w.setBlock(hit.x, hit.y, hit.z, B.EMBER_ORE_LIT, 0);
    if (p.creative) {
      if (!first && this.hitDelay > 0) return;
      const held = p.inventory.held();
      if (held && toolOf(held.id) && toolOf(held.id).kind === 'sword') return;
      this.breakBlock(hit.x, hit.y, hit.z);
      this.hitDelay = 5;
      return;
    }
    const b = this.breaking;
    if (!b || b.x !== hit.x || b.y !== hit.y || b.z !== hit.z || b.id !== id) {
      this.breaking = { x: hit.x, y: hit.y, z: hit.z, id, progress: 0, prev: 0 };
      this.soundTimer = 0;
      if (first && BLOCKS[id].onPunch) BLOCKS[id].onPunch(w, hit.x, hit.y, hit.z);
    }
    const br = this.breaking;
    const s = this.strength(id, w.getMeta(hit.x, hit.y, hit.z));
    br.prev = br.progress;
    br.progress += s;
    if (this.soundTimer % 4 === 0) {
      const d = BLOCKS[id];
      g.audio.playBlock(d.sound, 'hit', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }
    this.soundTimer++;
    if (this.soundTimer % 2 === 0 && g.settings.particles !== 'minimal') g.particles.hitBlock(hit.x, hit.y, hit.z, hit.face, id, w.getMeta(hit.x, hit.y, hit.z));
    if (br.progress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z);
      this.breaking = null;
      this.hitDelay = 5;
    }
  }
  stopMining() { this.breaking = null; }
  breakBlock(x, y, z) {
    const g = this.game, p = g.player, w = g.world;
    const id = w.getBlock(x, y, z), meta = w.getMeta(x, y, z);
    const d = BLOCKS[id];
    if (!d || id === 0) return;
    if (d.hardness < 0 && !p.creative) return;
    const held = p.inventory.held();
    const tool = held ? toolOf(held.id) : null;
    g.particles.breakBlock(x, y, z, id, meta);
    g.audio.playBlock(d.sound, 'break', x + 0.5, y + 0.5, z + 0.5);
    // chest contents spill out
    const te = w.getTile(x, y, z);
    if (te && te.items && !(te.type === 'chest' && p.creative && false)) {
      for (const s of te.items) if (s) Behaviors.dropStack(g, x + 0.5, y + 0.5, z + 0.5, s);
      te.items.fill(null);
    }
    w.setBlock(x, y, z, 0, 0);
    Behaviors.onBroken(g, x, y, z, id, meta);
    if (!p.creative) {
      if (this.canHarvest(id, tool)) Behaviors.dropBlock(g, x, y, z, id, meta, tool, held);
      if (tool && d.hardness > 0) p.inventory.damageHeld(p, tool.kind === 'sword' ? 2 : 1);
      else if (tool && tool.kind === 'shears' && (id === B.LEAVES || id === B.COBWEB || id === B.VINE || id === B.TALL_GRASS)) p.inventory.damageHeld(p, 1);
      p.exhaust(0.025);
    }
    p.stats.blocksMined++;
    g.onBlockBroken(id, meta, x, y, z);
  }

  // ---------------------------------------------------------------- combat
  attack(e) {
    const g = this.game, p = g.player;
    if (!e.hurt || e.dead) return;
    const held = p.inventory.held();
    const tool = held ? toolOf(held.id) : null;
    let dmg = tool ? tool.attack : 1;
    const crit = p.fallDistance > 0 && !p.onGround && !p.onLadder() && !p.inWater && !p.flying;
    if (crit) dmg *= 1.5;
    const bonus = Enchant.attackBonus(held, e);
    dmg += bonus;
    let kb = 0.4 + Enchant.level(held, 'knockback') * 0.5;
    if (p.sprinting) { kb += 0.5; p.sprinting = false; p.vx *= 0.6; p.vz *= 0.6; }
    const ok = e.hurt(dmg, { type: 'player', entity: p, knockback: kb });
    if (ok) {
      if (crit) g.particles.crit(e.x, e.y + e.h * 0.6, e.z, 12);
      if (bonus > 0) g.particles.crit(e.x, e.y + e.h * 0.6, e.z, 10, true);
      const fa = Enchant.level(held, 'fire_aspect');
      if (fa) e.fire = Math.max(e.fire || 0, fa * 80);
      if (tool && !p.creative) p.inventory.damageHeld(p, tool.kind === 'sword' ? 1 : 2);
      p.exhaust(0.3);
      if (e.onAttackedByPlayer) e.onAttackedByPlayer(p);
    }
  }

  // ---------------------------------------------------------------- using
  use() {
    const g = this.game, p = g.player, w = g.world;
    if (p.useItem) return;
    const held = p.inventory.held();
    // entity interactions
    if (this.entity) {
      if (this.entity.interact && this.entity.interact(p, held)) { p.swing(); return; }
    }
    if (this.hit) {
      const hit = this.hit;
      if (!p.sneaking || !held) { if (Behaviors.useBlock(g, p, hit)) { p.swing(); return; } }
      if (held) {
        if (held.id < 256) { if (Behaviors.tryPlace(g, p, held, hit)) { p.swing(); return; } }
        else if (Behaviors.useItemOnBlock(g, p, held, hit)) { p.swing(); return; }
      }
    }
    if (!held) return;
    this.useInAir(held);
  }
  useInAir(held) {
    const g = this.game, p = g.player, w = g.world;
    const I = ITEM_IDS;
    if (held.id === I.bucket) {
      const eye = g.eyePos(1);
      const [dx, dy, dz] = this.lookDir();
      const h = raycastBlocks(w, eye[0], eye[1], eye[2], dx, dy, dz, this.reach(), { fluids: true });
      if (h && BT.fluid[h.id] && h.meta === 0) {
        w.setBlock(h.x, h.y, h.z, 0, 0);
        g.audio.play(h.id === B.WATER ? 'bucket_fill' : 'bucket_fill_lava', 0.8);
        const full = new ItemStack(h.id === B.WATER ? I.water_bucket : I.lava_bucket, 1, 0);
        if (p.creative) { /* keep empty bucket */ }
        else if (held.count <= 1) p.inventory.setHeld(full);
        else { p.inventory.decrementHeld(1); g.giveItem(full); }
        p.swing();
      }
      return;
    }
    if (held.id === I.snowball || held.id === I.egg) {
      g.spawnEntity(new Thrown(w, p, held.id === I.snowball ? 'snowball' : 'egg'));
      g.audio.play('bow', 0.5, 0.4 / (Math.random() * 0.4 + 0.8));
      if (!p.creative) p.inventory.decrementHeld(1);
      p.swing();
      return;
    }
    if (held.id === I.fishing_rod) {
      this.noRepeat = true;
      if (p.fishHook && !p.fishHook.removed) {
        const d = p.fishHook.retract(g);
        if (d && !p.creative) p.inventory.damageHeld(p, d);
      } else {
        g.audio.play('bow', 0.5, 0.4 / (Math.random() * 0.4 + 0.8));
        const h = new FishHook(w, p);
        p.fishHook = h;
        g.spawnEntity(h);
      }
      p.swing();
      return;
    }
    if (held.id === I.boat) { this.noRepeat = true; if (g.placeBoat(held)) p.swing(); return; }
    if (held.id === I.message_bottle) { this.noRepeat = true; g.readMessageBottle(); return; }
    if (held.id === I.prospector_rod) { g.useProspectorRod(); return; }
    if (held.id === I.wayfinder) { g.useWayfinder(); return; }
    if (held.id === I.journal) { g.openJournal(); return; }
    if (held.id === I.map) { g.openMap(); return; }
    if (held.id === I.wisp_essence) { if (g.releaseWisp()) { if (!p.creative) p.inventory.decrementHeld(1); p.swing(); } return; }
    if (held.id === I.spawn_egg && this.hit) return;
    if (p.startUse(held)) return;
  }
  pickBlock() {
    const g = this.game, p = g.player;
    let pk = null;
    if (this.entity && this.entity.type === 'boat') pk = [ITEM_IDS.boat, this.entity.wood];
    else if (this.entity && this.entity.type === 'painting') pk = [ITEM_IDS.painting, 0];
    else if (this.entity && p.creative) {
      const mt = MOB_TYPES.findIndex((m) => m && m.key === this.entity.type);
      if (mt >= 0) pk = [ITEM_IDS.spawn_egg, mt];
    } else if (this.hit) pk = pickBlockItem(this.hit.id, this.hit.meta);
    if (!pk) return;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) { const s = inv.main.items[i]; if (s && s.id === pk[0] && s.dmg === pk[1]) { inv.selected = i; return; } }
    if (p.creative) {
      let slot = inv.selected;
      if (inv.main.items[slot]) { for (let i = 0; i < 9; i++) if (!inv.main.items[i]) { slot = i; break; } }
      inv.main.set(slot, new ItemStack(pk[0], 1, pk[1]));
      inv.selected = slot;
    } else {
      const i = inv.findSlot(pk[0], pk[1]);
      if (i >= 9) { const tmp = inv.main.items[inv.selected]; inv.main.items[inv.selected] = inv.main.items[i]; inv.main.items[i] = tmp; inv.main.changed(); }
    }
  }
}
