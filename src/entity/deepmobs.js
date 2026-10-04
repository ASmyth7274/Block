'use strict';
// ---------------------------------------------------------------------------
// The Listener: the blind keeper of the Hush. It cannot see you - it hears
// you. Every footstep, every block broken, every door and every arrow that
// lands raises its suspicion of whoever made the sound; once it is sure, it
// comes for them, and what it cannot reach it strikes with a wave of sound
// that passes through stone. Only wool stops it. Sneak, muffle, throw
// things to send it the wrong way - or run. Left in peace for a minute, it
// digs back down into the dark.
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'listener', name: 'Listener', egg: ['#101c1f', '#3fe0d6'], cat: 'monster', lore: 'The blind keeper of the Hush. It cannot see you, but it hears everything: footsteps, digging, doors, arrows landing. Sneak, muffle your steps with wool and throw things to lead it astray - and do not wake the shriekers that call it up.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

class Listener extends Monster {
  constructor(world) {
    super(world, 'listener');
    this.maxHealth = this.health = 250;
    this.w = 0.9; this.h = 2.9; this.eye = 2.45;
    this.baseSpeed = 0.26; this.damage = 18;
    this.followRange = 48;
    this.persistent = true;          // it leaves when it chooses to (see dig)
    this.xpValue = 5;
    this.suspicion = new Map();      // creature -> how sure it is that they are there (0-150)
    this.emerge = 0; this.dig = 0;   // rising out of the floor / sinking back into it
    this.quiet = 0;                  // ticks since it last heard anything at all
    this.inspect = null; this.inspectT = 0;
    this.flare = 0;                  // the dish opening wide: it just heard something
    this.roarT = 0;
    this.wave = 0; this.waveCool = 0;
    this.sniffT = 120 + this.rnd(120);
    this.hearCool = 0;
    this.stuckT = 0; this.bestD2 = Infinity;
    this.talkInterval = 200;
    this.pathNodes = 500;
    this.swims = true;
  }
  knockback(dx, dz, s) { super.knockback(dx, dz, s * 0.08); }
  // how sure it is about a creature; at 80 it comes for them
  suspect(e, amt) {
    if (!e || e === this || e.dead || e.removed || e.type === 'listener' || !e.hurt) return;
    if (e.type === 'player' && (!e.survivalLike || this.world.difficulty === 0)) return;
    const v = Math.min(150, (this.suspicion.get(e) || 0) + amt);
    this.suspicion.set(e, v);
    const cur = this.target;
    if (v >= 80 && cur !== e && (!cur || v > (this.suspicion.get(cur) || 0) + 20)) {
      this.target = e; this.unseen = 0; this.clearPath(); this.stuckT = 0; this.bestD2 = Infinity;
      if (!cur) this.roar();
    }
  }
  roar() {
    if (this.emerge > 0 || this.dig > 0) return;
    this.roarT = 50; this.flare = 50;
    this.game.audio.play('listener_roar', 3, 0.95 + Math.random() * 0.1, this.x, this.y + this.eye, this.z);
  }
  // something made a sound nearby (see Hush.vibrate)
  hear(game, x, y, z, loud, src) {
    if (this.emerge > 0 || this.dig > 0 || this.dead) return;
    const w = this.world;
    // it needs a moment to listen between sounds, unless the sound is a loud one
    if (w.time < this.hearCool && loud < 30) return;
    this.hearCool = w.time + 20;
    this.quiet = 0;
    this.flare = Math.max(this.flare, 24);
    this.lookAtPoint(x, y, z, 30);
    if (src && src !== this) this.suspect(src, loud >= 30 ? 35 : 10 + loud);
    if (!this.target) { this.inspect = [x, y, z]; this.inspectT = 300; this.clearPath(); }
    if (w.time - (this.lastListen || 0) > 30) { this.lastListen = w.time; game.audio.play('listener_listen', 1.4, 0.9 + Math.random() * 0.2, this.x, this.y + this.eye, this.z); }
  }
  onRevenge(e) { if (e && e !== this) this.suspect(e, 100); }
  hurt(amount, src) {
    // the hush wave does not trouble it, nor does its own kind
    if (src && (src.type === 'sonic' || (src.entity && src.entity.type === 'listener'))) return false;
    if (this.emerge > 0 || this.dig > 0) { if (src && src.type !== 'void') return false; }
    return super.hurt(amount, src);
  }
  aiTick(game) {
    const w = this.world;
    if (this.waveCool > 0) this.waveCool--;
    if (this.flare > 0) this.flare--;
    // rising out of the floor, or sinking back into it
    if (this.emerge > 0) { this.emerge--; this.earthFx(game, this.emerge % 20 === 19); if (this.emerge === 0) this.roar(); return; }
    if (this.dig > 0) { if (++this.dig > 100) this.removed = true; this.earthFx(game, this.dig % 20 === 1); return; }
    if (this.roarT > 0) { this.roarT--; if (this.target) this.lookAtEntity(this.target, 2); return; }
    this.quiet++;
    // suspicion fades, slowly
    if (this.age % 4 === 0) for (const [e, v] of this.suspicion) {
      if (e.dead || e.removed || v <= 1 || (e.type === 'player' && !e.survivalLike) || this.distSqTo(e) > 64 * 64) { this.suspicion.delete(e); if (this.target === e) this.target = null; continue; }
      this.suspicion.set(e, v - 1);
    }
    const t = this.target;
    if (t && (t.dead || t.removed || (this.suspicion.get(t) || 0) < 60 || (t.type === 'player' && !t.survivalLike))) { this.target = null; this.clearPath(); this.inspect = [t.x, t.y, t.z]; this.inspectT = 200; }
    if (this.target) { this.hunt(game, this.target); return; }
    this.wave = 0;
    // now and then it stops and tastes the air
    if (--this.sniffT <= 0) { this.sniffT = 120 + this.rnd(120); this.sniff(game); }
    // go and see what made that noise
    if (this.inspect) {
      const [x, y, z] = this.inspect;
      if (--this.inspectT <= 0 || this.distanceSq(x, y, z) < 3) { this.inspect = null; this.clearPath(); }
      else if (this.pathDone && this.age % 10 === 0) { if (!this.navigateTo(x, y, z, 0.75, 40)) this.steerTo(x, y, z, 0.75); }
      return;
    }
    // a whole minute of quiet: back down into the dark it goes
    if (this.quiet > 1200 && this.onGround) { this.startDig(game); return; }
    if (this.pathDone && Math.random() < 1 / 200) this.wander(8, 3, 0.55);
  }
  sniff(game) {
    let best = null, bd = 12 * 12;
    const p = game.player;
    const cands = this.world.entitiesInBox(this.x - 12, this.y - 6, this.z - 12, this.x + 12, this.y + 6, this.z + 12, (e) => e.category === 'monster' || e.category === 'creature');
    if (p && !p.dead && p.survivalLike) cands.push(p);
    for (const e of cands) { if (e === this || e.type === 'listener') continue; const d2 = this.distSqTo(e); if (d2 < bd) { bd = d2; best = e; } }
    this.flare = Math.max(this.flare, 30);
    game.audio.play('listener_listen', 1.2, 0.7, this.x, this.y + this.eye, this.z);
    if (best) { this.lookAtEntity(best, 30); this.suspect(best, best.type === 'player' ? 30 : 15); }
  }
  hunt(game, t) {
    const d2 = this.distSqTo(t);
    if (this.wave > 0) {
      this.lookAtEntity(t, 2); this.flare = 40;
      if (--this.wave === 0) this.releaseWave(game, t);
      return;
    }
    // making no headway towards it?
    if (this.age % 20 === 0) { if (d2 < this.bestD2 - 1) { this.bestD2 = d2; this.stuckT = 0; } else this.stuckT += 20; }
    if (this.waveCool <= 0 && d2 < 15 * 15 && d2 > 3.5 * 3.5 && (this.stuckT >= 60 || Math.random() < 0.012)) { this.chargeWave(game); return; }
    const dd = this.chase(1.3);
    // close enough to touch: it knows exactly where you are
    if (dd < 2.5 * 2.5) this.suspect(t, 4);
    this.tryMelee(t, dd, this.damage);
  }
  meleeReach(t) { return 3.2 * 3.2 + t.w; }
  chargeWave(game) {
    this.wave = 34; this.waveCool = 100; this.stuckT = 0; this.bestD2 = Infinity;
    this.clearPath(); this.stopMoving();
    game.audio.play('listener_charge', 2.2, 1, this.x, this.y + this.eye, this.z);
  }
  // the hush wave: straight through stone, and only wool will stop it
  releaseWave(game, t) {
    const w = this.world, sx = this.x, sy = this.y + 1.9, sz = this.z;
    const tx = t.x, ty = t.y + (t.eye || t.h * 0.6), tz = t.z;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (d > 20) return;
    const n = Math.ceil(d * 2);
    let reach = d, blocked = false;
    for (let i = 1; i < n; i++) {
      const id = w.getBlock(Math.floor(sx + dx * i / n), Math.floor(sy + dy * i / n), Math.floor(sz + dz * i / n));
      if (id === B.WOOL || id === B.CARPET) { reach = d * i / n; blocked = true; break; }
    }
    game.audio.play('listener_wave', 3, 1, sx, sy, sz);
    if (game.settings.particles !== 'minimal') {
      const L = game.particles.layer('particle_glint');
      for (let s = 1.2; s < reach; s += 0.8) {
        const cx = sx + dx / d * s, cy = sy + dy / d * s, cz = sz + dz / d * s;
        // a ring of light at each step, square to the line of the blast
        const ux = -dz / d, uz = dx / d;
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU, rr = 0.35 + s * 0.02;
          game.particles.add({ x: cx + Math.cos(a) * ux * rr, y: cy + Math.sin(a) * rr, z: cz + Math.cos(a) * uz * rr, vx: dx / d * 0.05, vy: 0, vz: dz / d * 0.05, size: 0.07, life: 8 + Math.floor(s * 0.4), layer: L, r: 0.35, g: 0.95, b: 0.9, collide: false, bright: true, fade: true });
        }
      }
    }
    if (blocked || t.dead) return;
    t.hurt(t.type === 'player' ? scaleMobDamage(w, 10) : 10, { type: 'sonic', entity: this, knockback: 1.1 });
  }
  startDig(game) {
    this.dig = 1; this.target = null; this.clearPath();
    game.audio.play('listener_dig', 2.5, 0.9, this.x, this.y, this.z);
  }
  earthFx(game, sound) {
    const w = this.world, bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
    const id = w.getBlock(bx, by, bz) || B.DEEPSTONE;
    if (game.settings.particles !== 'minimal' && this.age % 2 === 0) {
      const tex = game.particles.blockTexture(id, w.getMeta(bx, by, bz), 1), tint = game.particles.blockTint(id, 0);
      for (let i = 0; i < 4; i++) game.particles.digging(this.x + (Math.random() - 0.5) * 1.6, this.y + 0.1, this.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.15, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15, tex, tint);
    }
    if (sound) game.audio.playBlock(BLOCKS[id] ? BLOCKS[id].sound : 'stone', 'break', this.x, this.y, this.z);
  }
  mobTick(game) {
    const p = game.player;
    if (this.emerge > 0 || this.dig > 0) return;
    // its heart beats faster the surer it is
    const sure = this.target ? 1 : Math.min(1, Math.max(...[0, ...this.suspicion.values()]) / 80);
    const period = Math.round(40 - sure * 26);
    if (this.age % period === 0 && p && this.distSqTo(p) < 20 * 20) game.audio.play('listener_heart', 0.5 + sure * 0.5, 1, this.x, this.y + 1.8, this.z);
    // and its presence darkens the world around it
    if (this.age % 120 === 0 && p && !p.dead && p.survivalLike && this.distSqTo(p) < 20 * 20) Brewing.addEffect(p, 'darkness', 260, 0);
    // heavy footfalls
    if (this.onGround && (this.x !== this.px || this.z !== this.pz)) {
      this.stepAcc = (this.stepAcc || 0) + Math.hypot(this.x - this.px, this.z - this.pz);
      if (this.stepAcc > 1.6) { this.stepAcc = 0; game.audio.play('listener_step', 1.1, 0.9 + Math.random() * 0.15, this.x, this.y, this.z); }
    }
  }
  checkDespawn(game) {
    // gone far from anyone (or the world at peace): down it goes
    const p = game.player;
    if (this.world.difficulty === 0 || (p && this.distSqTo(p) > 112 * 112)) this.removed = true;
  }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.echo_heart, 1);
    this.drop(ITEM_IDS.hush_shard, 3 + this.rnd(4));
  }
  saySound() { return this.emerge > 0 || this.dig > 0 ? null : 'listener_say'; }
  soundVolume() { return 1.6; }
  soundPitch() { return 0.9 + Math.random() * 0.15; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 2, this.z);
    // halfway out of the floor
    let sink = 0;
    if (this.emerge > 0) sink = (this.emerge - partial) / 60;
    else if (this.dig > 0) sink = Math.min(1, (this.dig + partial) / 100);
    const pose = er.bipedPose(this, partial, 'biped');
    const t = this.age + partial;
    // a slow, heavy gait; the long arms hang a little out from the body
    pose.rleg[0] *= 0.55; pose.lleg[0] *= 0.55;
    pose.rarm = [pose.rarm[0] * 0.5, 0, 0.1 + Math.cos(t * 0.07) * 0.03];
    pose.larm = [pose.larm[0] * 0.5, 0, -0.1 - Math.cos(t * 0.07) * 0.03];
    const sp = this.pswing + (this.swingProgress - this.pswing) * partial;
    if (sp > 0) { const s = Math.sin(sp * Math.PI); pose.rarm[0] = s * 1.9; pose.larm[0] = s * 1.9; }
    if (this.wave > 0) { const k = 1 - this.wave / 34; pose.rarm = [0.4, 0, 0.3 + k * 0.6]; pose.larm = [0.4, 0, -0.3 - k * 0.6]; pose.head = [-0.3 * k, pose.head[1], 0]; }
    if (sink > 0) { pose.rarm = [2.6 - sink, 0, 0.3]; pose.larm = [2.4 - sink, 0, -0.3]; }
    const base = er.baseMatrix(this, rx, ry - sink * this.h, rz, partial, 1.1);
    const col = er.entColor(this);
    er.drawModel(MODELS.listener, 'listener', base, pose, col, sky, blk, { only: ['body'] });
    er.drawModel(MODELS.listener, 'listener_limbs', base, pose, col, sky, blk, { only: ['rarm', 'larm', 'rleg', 'lleg'] });
    er.drawModel(MODELS.listener, 'listener_head', base, pose, col, sky, blk, { only: ['head'] });
    // the dish hangs off the head and flares wide when it hears something
    const hp = MODELS.listener.head.pivot, hr = pose.head.rot || pose.head;
    let hm = M3.mul(base, M3.trans(hp[0], hp[1], hp[2]));
    if (hr[2]) hm = M3.mul(hm, M3.rz(hr[2])); if (hr[1]) hm = M3.mul(hm, M3.ry(hr[1])); if (hr[0]) hm = M3.mul(hm, M3.rx(hr[0]));
    const fl = Math.min(1, Math.max(0, this.flare - partial) / 12) * 0.55 + Math.sin(t * 0.11) * 0.03;
    const dp = { dishT: [fl, 0, 0], dishB: [-fl, 0, 0], dishR: [0, -fl, 0], dishL: [0, fl, 0] };
    er.drawModel(MODELS.listenerDish, 'listener_head', hm, dp, col, sky, blk);
    // the ribs, the whorl of its dish and its heart glow with every beat
    const sure = this.target ? 1 : Math.min(1, Math.max(...[0, ...this.suspicion.values()]) / 80);
    const period = 40 - sure * 26, ph = (t % period) / period;
    const v = Math.round(90 + 165 * Math.max(Math.exp(-ph * 7), this.wave > 0 ? 1 - this.wave / 34 : 0));
    const gc = [v, v, v, 255];
    er.drawModel(MODELS.listener, 'listener_glow', base, pose, gc, -1, 0, { only: ['body'], inflate: 0.03 });
    er.drawModel(MODELS.listener, 'listener_head_glow', base, pose, gc, -1, 0, { only: ['head'], inflate: 0.03 });
    er.drawModel(MODELS.listenerDish, 'listener_head_glow', hm, dp, gc, -1, 0, { inflate: 0.03 });
  }
  save() {
    const d = super.save();
    if (this.emerge) d.emerge = this.emerge;
    if (this.dig) d.dig = this.dig;
    d.quiet = this.quiet;
    return d;
  }
  load(d) {
    super.load(d);
    this.emerge = d.emerge || 0; this.dig = d.dig || 0; this.quiet = d.quiet || 0;
    Hush.noteListener();
  }
}
MOB_CLASSES.listener = Listener;
