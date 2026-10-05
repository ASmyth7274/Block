'use strict';
// ---------------------------------------------------------------------------
// Brewing, the classic way: water bottles in the stand, bloodcap makes them
// awkward, then an ingredient decides the effect. Ember dust draws a potion
// out longer, sunstone dust makes it stronger, a fermented spider eye turns it
// bad, and gunpowder makes it something to throw.
// ---------------------------------------------------------------------------
const Brewing = (() => {
  const I = ITEM_IDS;
  const P = {}; POTIONS.forEach((p, i) => { P[p.key] = i; });
  const BREW_TIME = 400;
  const AWKWARD = {
    sugar: 'swiftness', glistering_melon: 'healing', spider_eye: 'poison', wailer_tear: 'regeneration', flare_powder: 'strength',
    magma_cream: 'fire_resistance', glimmerfin: 'night_vision', pufferfish: 'water_breathing', slimeball: 'leaping', starfruit: 'featherfall',
  };
  const MUNDANE = ['sugar', 'glistering_melon', 'spider_eye', 'wailer_tear', 'flare_powder', 'magma_cream', 'ember_dust', 'slimeball'];
  const CORRUPT = {
    swiftness: 'slowness', leaping: 'slowness', fire_resistance: 'slowness', healing: 'harming', poison: 'harming',
    night_vision: 'invisibility', strength: 'weakness', regeneration: 'weakness',
  };
  const keyOf = (st) => { if (!st) return null; for (const k in I) if (I[k] === st.id) return k; return null; };
  const INGREDIENTS = new Set(['bloodcap', 'sunstone_dust', 'ember_dust', 'fermented_spider_eye', 'gunpowder', ...Object.keys(AWKWARD)]);
  function isIngredient(st) { return !!st && st.id >= 256 && INGREDIENTS.has(keyOf(st)); }
  function isBottle(st) { return !!st && (st.id === I.potion || st.id === I.splash_potion); }

  // what an ingredient makes of one bottle (or null)
  function result(bottle, ing) {
    if (!isBottle(bottle) || !ing) return null;
    const k = keyOf(ing), d = bottle.dmg, p = potionOf(d), splash = bottle.id === I.splash_potion;
    const make = (key, bits) => new ItemStack(bottle.id, 1, P[key] | (bits || 0));
    if (k === 'gunpowder') return splash ? null : new ItemStack(I.splash_potion, 1, d);
    if (p.key === 'water') {
      if (k === 'bloodcap') return make('awkward');
      if (k === 'sunstone_dust') return make('thick');
      if (k === 'fermented_spider_eye') return make('weakness');
      if (MUNDANE.includes(k)) return make('mundane');
      return null;
    }
    if (p.key === 'awkward') return AWKWARD[k] ? make(AWKWARD[k]) : null;
    if (!p.effect) return null;
    if (k === 'fermented_spider_eye') {
      const to = CORRUPT[p.key];
      if (!to) return null;
      const tp = POTIONS[P[to]];
      return make(to, ((d & 64) && tp.strong ? 64 : 0) | ((d & 128) && !tp.instant ? 128 : 0));
    }
    if (k === 'ember_dust') return (!p.instant && !(d & 128)) ? make(p.key, 128) : null;
    if (k === 'sunstone_dust') return (p.strong && !(d & 64)) ? make(p.key, 64) : null;
    return null;
  }
  function canBrew(te) {
    const ing = te.items[3];
    if (!isIngredient(ing)) return false;
    for (let i = 0; i < 3; i++) if (result(te.items[i], ing)) return true;
    return false;
  }
  // a game tick for one stand
  function tick(game, te, c) {
    const w = game.world;
    let dirty = false;
    if (te.brewTime > 0) {
      const ingKey = te.items[3] ? te.items[3].id : -1;
      if (!canBrew(te) || ingKey !== te.lastIng) { te.brewTime = 0; dirty = true; }
      else if (--te.brewTime === 0) {
        const ing = te.items[3];
        for (let i = 0; i < 3; i++) { const r = result(te.items[i], ing); if (r) te.items[i] = r; }
        ing.count--;
        if (ing.count <= 0) te.items[3] = null;
        game.audio.play('brew_done', 0.7, 1, te.x + 0.5, te.y + 0.5, te.z + 0.5);
        if (game.player && game.player.distanceSq(te.x + 0.5, te.y + 0.5, te.z + 0.5) < 64) game.achieve('brew');
        dirty = true;
      }
    } else if (canBrew(te)) { te.brewTime = BREW_TIME; te.lastIng = te.items[3].id; dirty = true; }
    // the bubbling while it works
    if (te.brewTime > 0 && game.ticks % 2 === 0 && game.settings.particles !== 'minimal') {
      game.particles.add({ x: te.x + 0.5 + (Math.random() - 0.5) * 0.3, y: te.y + 0.75 + Math.random() * 0.2, z: te.z + 0.5 + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0.01, vz: 0, size: 0.04, life: 12, layer: game.particles.layer('particle_glint'), r: 0.8, g: 0.8, b: 0.9, collide: false, fade: true });
      if (game.ticks % 40 === 0) game.audio.play('brew', 0.3, 0.9 + Math.random() * 0.2, te.x + 0.5, te.y + 0.5, te.z + 0.5);
    }
    // the holders show which bottles are in
    const m = (te.items[0] ? 1 : 0) | (te.items[1] ? 2 : 0) | (te.items[2] ? 4 : 0);
    if (w.getMeta(te.x, te.y, te.z) !== m) {
      const i = (te.y << 8) | ((te.z & 15) << 4) | (te.x & 15);
      w.setBlock(te.x, te.y, te.z, B.BREWING_STAND, m, 4);
      c.tiles.set(i, te);
      dirty = true;
    }
    if (dirty) c.modified = true;
  }

  // ------------------------------------------------------------ effects
  // apply a potion to a creature; scale is 1 for drinking, less for a distant splash
  function applyPotion(game, e, d, scale, src) {
    const p = potionOf(d);
    if (!p.effect || !e || e.dead) return;
    const amp = (d & 64) ? 1 : 0;
    if (p.instant) {
      // healing hurts the undead, harming heals them
      const heal = (p.effect === 'heal') !== !!e.undead;
      const n = (4 << amp) * scale;
      if (heal) { if (e.heal) e.heal(Math.max(1, Math.round(n))); }
      else if (e.hurt) e.hurt(Math.max(1, Math.round(n * 1.5)), { type: 'magic', entity: src || null });
      return;
    }
    const t = Math.round(potionDuration(d) * scale);
    if (t < 20) return;
    if (e.undead && (p.effect === 'poison' || p.effect === 'regen')) return;
    addEffect(e, p.effect, t, amp);
  }
  function addEffect(e, k, t, amp) {
    if (!e.effects) e.effects = {};
    if (!e.effectAmp) e.effectAmp = {};
    const cur = e.effects[k] || 0, curAmp = e.effectAmp[k] || 0;
    if (amp > curAmp || (amp === curAmp && t > cur)) { e.effects[k] = t; e.effectAmp[k] = amp; }
  }
  function amp(e, k) { return (e.effectAmp && e.effectAmp[k]) || 0; }
  function level(e, k) { return e.effects && e.effects[k] ? 1 + amp(e, k) : 0; }
  // the blended colour of everything an entity is under (for its swirl of particles)
  function swirlColor(e) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const k in e.effects) { const ef = EFFECTS[k]; if (!ef) continue; const c = hexToRgb(ef.color); r += c[0]; g += c[1]; b += c[2]; n++; }
    return n ? [r / n / 255, g / n / 255, b / n / 255] : null;
  }
  return { result, isIngredient, isBottle, canBrew, tick, applyPotion, addEffect, amp, level, swirlColor, BREW_TIME, P };
})();

// ---------------------------------------------------------------------------
// A thrown splash potion: bursts where it lands and splashes everyone nearby
// ---------------------------------------------------------------------------
class ThrownPotion extends Thrown {
  constructor(world, shooter, dmg) {
    super(world, shooter, 'potion');
    this.type = 'potion';
    this.dmg = dmg;
    const sp = 0.5, yaw = shooter.yaw, pitch = shooter.pitch - 0.35;
    this.vx = -Math.sin(yaw) * Math.cos(pitch) * sp; this.vy = Math.sin(pitch) * sp + 0.1; this.vz = -Math.cos(yaw) * Math.cos(pitch) * sp;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    const w = this.world;
    const hit = raycastBlocks(w, this.x, this.y, this.z, this.vx, this.vy, this.vz, len, { collision: true });
    let target = null, tb = hit ? hit.t : len;
    for (const e of w.entities.concat(game.player ? [game.player] : [])) {
      if (e === this || e.removed || !e.hurt || e.dead || (e === this.shooter && this.age < 5)) continue;
      e.updateBox();
      const h = rayBox(this.x, this.y, this.z, this.vx / len, this.vy / len, this.vz / len, e.box);
      if (h && h.t < tb) { tb = h.t; target = e; }
    }
    if (target || hit) { this.burst(game, target, tb / len); return; }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.vx *= 0.99; this.vy *= 0.99; this.vz *= 0.99; this.vy -= 0.05;
    this.updateBox();
    if (this.age > 400) this.removed = true;
  }
  burst(game, target, f) {
    const w = this.world;
    this.removed = true;
    this.x += this.vx * f; this.y += this.vy * f; this.z += this.vz * f;
    const col = hexToRgb(potionOf(this.dmg).color).map((v) => v / 255);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, s = Math.random() * 0.15;
      game.particles.add({ x: this.x, y: this.y + 0.1, z: this.z, vx: Math.cos(a) * s, vy: 0.1 + Math.random() * 0.15, vz: Math.sin(a) * s, size: 0.06, life: 20 + Math.floor(Math.random() * 15), gravity: 0.01, layer: game.particles.layer('particle_glint'), r: col[0], g: col[1], b: col[2], fade: true });
    }
    game.particles.burst(this.x, this.y, this.z, 'splash_' + potionOf(this.dmg).key, 8);
    game.audio.play('potion_splash', 1, 0.9 + Math.random() * 0.1, this.x, this.y, this.z);
    // everyone within four blocks feels it, less the further they stand
    const all = w.entities.concat(game.player && !game.player.dead ? [game.player] : []);
    for (const e of all) {
      if (e.removed || e.dead || !e.hurt || !e.category && e.type !== 'player') continue;
      const d2 = e.distanceSq(this.x, this.y, this.z);
      if (d2 >= 16) continue;
      let k = 1 - Math.sqrt(d2) / 4;
      if (e === target) k = 1;
      Brewing.applyPotion(game, e, this.dmg, k * 0.75 + (e === target ? 0.25 : 0), this.shooter);
    }
  }
  render(er, rx, ry, rz) {
    const cam = er.game.camera;
    const [sky, blk] = er.lightAt(this.x, this.y, this.z);
    let m = M3.trans(rx, ry, rz);
    m = M3.mul(m, M3.ry(cam.yaw));
    m = M3.mul(m, M3.scale(0.4, 0.4, 0.4));
    m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
    er.drawItem(new ItemStack(ITEM_IDS.splash_potion, 1, this.dmg), m, sky, blk, 255, true);
  }
  save() { return null; }
}
