'use strict';
// ---------------------------------------------------------------------------
// Enchanting, following the classic table: bookshelves raise the power,
// three offers cost 1-3 levels (and lapis), the enchantments rolled depend
// on the item's enchantability. Enchantments live in stack.tag.ench.
// ---------------------------------------------------------------------------
const Enchant = (() => {
  // [id, key, name, max level, weight, applies-to, min(l), max(l)]
  const DEFS = [
    [0, 'protection', 'Protection', 4, 10, 'armor', (l) => 1 + (l - 1) * 11, (l) => 21 + (l - 1) * 11],
    [1, 'fire_protection', 'Fire Protection', 4, 5, 'armor', (l) => 10 + (l - 1) * 8, (l) => 22 + (l - 1) * 8],
    [2, 'feather_falling', 'Feather Falling', 4, 5, 'boots', (l) => 5 + (l - 1) * 6, (l) => 15 + (l - 1) * 6],
    [3, 'blast_protection', 'Blast Protection', 4, 2, 'armor', (l) => 5 + (l - 1) * 8, (l) => 17 + (l - 1) * 8],
    [4, 'projectile_protection', 'Projectile Protection', 4, 5, 'armor', (l) => 3 + (l - 1) * 6, (l) => 18 + (l - 1) * 6],
    [5, 'respiration', 'Respiration', 3, 2, 'helmet', (l) => 10 * l, (l) => 10 * l + 30],
    [6, 'aqua_affinity', 'Aqua Affinity', 1, 2, 'helmet', () => 1, () => 41],
    [7, 'thorns', 'Thorns', 3, 1, 'chest', (l) => 10 + 20 * (l - 1), (l) => 60 + 20 * (l - 1)],
    [16, 'sharpness', 'Sharpness', 5, 10, 'weapon', (l) => 1 + (l - 1) * 11, (l) => 21 + (l - 1) * 11],
    [17, 'smite', 'Smite', 5, 5, 'weapon', (l) => 5 + (l - 1) * 8, (l) => 25 + (l - 1) * 8],
    [18, 'bane_of_arthropods', 'Bane of Arthropods', 5, 5, 'weapon', (l) => 5 + (l - 1) * 8, (l) => 25 + (l - 1) * 8],
    [19, 'knockback', 'Knockback', 2, 5, 'weapon', (l) => 5 + 20 * (l - 1), (l) => 55 + 20 * (l - 1)],
    [20, 'fire_aspect', 'Fire Aspect', 2, 2, 'weapon', (l) => 10 + 20 * (l - 1), (l) => 60 + 20 * (l - 1)],
    [21, 'looting', 'Looting', 3, 2, 'weapon', (l) => 15 + (l - 1) * 9, (l) => 65 + (l - 1) * 9],
    [32, 'efficiency', 'Efficiency', 5, 10, 'digger', (l) => 1 + 10 * (l - 1), (l) => 51 + 10 * (l - 1)],
    [33, 'silk_touch', 'Silk Touch', 1, 1, 'digger', () => 15, () => 65],
    [34, 'unbreaking', 'Unbreaking', 3, 5, 'breakable', (l) => 5 + (l - 1) * 8, (l) => 55 + (l - 1) * 8],
    [35, 'fortune', 'Fortune', 3, 2, 'digger', (l) => 15 + (l - 1) * 9, (l) => 65 + (l - 1) * 9],
    [48, 'power', 'Power', 5, 10, 'bow', (l) => 1 + (l - 1) * 10, (l) => 16 + (l - 1) * 10],
    [49, 'punch', 'Punch', 2, 2, 'bow', (l) => 12 + (l - 1) * 20, (l) => 37 + (l - 1) * 20],
    [50, 'flame', 'Flame', 1, 2, 'bow', () => 20, () => 50],
    [51, 'infinity', 'Infinity', 1, 1, 'bow', () => 20, () => 50],
    [61, 'luck_of_the_sea', 'Luck of the Sea', 3, 2, 'rod', (l) => 15 + (l - 1) * 9, (l) => 65 + (l - 1) * 9],
    [62, 'lure', 'Lure', 3, 2, 'rod', (l) => 15 + (l - 1) * 9, (l) => 65 + (l - 1) * 9],
  ];
  const E = {}, BY_ID = {};
  for (const d of DEFS) { const o = { id: d[0], key: d[1], name: d[2], max: d[3], weight: d[4], type: d[5], min: d[6], maxc: d[7] }; E[d[1]] = o; BY_ID[d[0]] = o; }
  const GROUPS = [['protection', 'fire_protection', 'blast_protection', 'projectile_protection'], ['sharpness', 'smite', 'bane_of_arthropods'], ['silk_touch', 'fortune']];
  const compatible = (a, b) => a !== b && !GROUPS.some((g) => g.includes(a.key) && g.includes(b.key));
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const MAT_ENCH = { wood: 15, stone: 5, iron: 14, gold: 22, diamond: 10, cobalt: 12, starmetal: 18, leather: 15 };
  const ARMOR_ENCH = { leather: 15, iron: 9, gold: 25, diamond: 10, cobalt: 11, starmetal: 16 };

  function kindOf(id) {
    const t = toolOf(id), a = armorOf(id);
    if (a) return ['helmet', 'chest', 'legs', 'boots'][a.slot];
    if (t) { if (t.kind === 'sword') return 'weapon'; if (t.kind === 'pickaxe' || t.kind === 'axe' || t.kind === 'shovel') return 'digger'; if (t.kind === 'hoe') return 'hoe'; return null; }
    if (id === ITEM_IDS.bow) return 'bow';
    if (id === ITEM_IDS.fishing_rod) return 'rod';
    return null;
  }
  function enchantability(id) {
    const t = toolOf(id), a = armorOf(id);
    if (a) return ARMOR_ENCH[a.mat] || 10;
    if (t && t.mat) return MAT_ENCH[t.mat] || 10;
    if (id === ITEM_IDS.bow || id === ITEM_IDS.fishing_rod) return 1;
    return 0;
  }
  function applies(def, kind) {
    if (!kind) return false;
    switch (def.type) {
      case 'armor': return kind === 'helmet' || kind === 'chest' || kind === 'legs' || kind === 'boots';
      case 'boots': case 'helmet': case 'chest': return kind === def.type;
      case 'breakable': return true;
      default: return def.type === kind;
    }
  }
  function list(stack) { return (stack && stack.tag && stack.tag.ench) || []; }
  function level(stack, key) {
    if (!stack || !stack.tag || !stack.tag.ench) return 0;
    const id = E[key].id;
    for (const e of stack.tag.ench) if (e[0] === id) return e[1];
    return 0;
  }
  function has(stack) { return !!(stack && stack.tag && stack.tag.ench && stack.tag.ench.length); }
  function name(id, lvl) { const d = BY_ID[id]; return d ? d.name + (d.max > 1 || lvl > 1 ? ' ' + (ROMAN[lvl] || lvl) : '') : 'Unknown'; }
  function canEnchant(stack) { return stack && stack.count === 1 && !has(stack) && kindOf(stack.id) && enchantability(stack.id) > 0; }

  // the classic three costs for the given bookshelf power
  function offerCost(rng, slot, power, stack) {
    if (enchantability(stack.id) <= 0) return 0;
    power = Math.min(power, 15);
    const k = rng.nextInt(8) + 1 + (power >> 1) + rng.nextInt(power + 1);
    const c = slot === 0 ? Math.max(Math.floor(k / 3), 1) : slot === 1 ? Math.floor(k * 2 / 3) + 1 : Math.max(k, power * 2);
    return c < slot + 1 ? 0 : c;
  }
  function pickWeighted(rng, arr) {
    let tot = 0; for (const a of arr) tot += a.def.weight;
    let r = rng.nextInt(tot);
    for (const a of arr) { r -= a.def.weight; if (r < 0) return a; }
    return arr[arr.length - 1];
  }
  // what a given cost buys (deterministic for the seed)
  function roll(rng, stack, cost) {
    let j = enchantability(stack.id);
    if (j <= 0) return [];
    j = Math.floor(j / 2);
    j = 1 + rng.nextInt((j >> 1) + 1) + rng.nextInt((j >> 1) + 1);
    const k = j + cost;
    const f = (rng.nextFloat() + rng.nextFloat() - 1) * 0.15;
    const l = Math.max(1, Math.floor(k * (1 + f) + 0.5));
    const kind = kindOf(stack.id);
    let avail = [];
    for (const def of DEFS.map((d) => E[d[1]])) {
      if (!applies(def, kind)) continue;
      for (let lv = def.max; lv >= 1; lv--) if (l >= def.min(lv) && l <= def.maxc(lv)) { avail.push({ def, lvl: lv }); break; }
    }
    if (!avail.length) return [];
    const out = [pickWeighted(rng, avail)];
    for (let i = l; rng.nextInt(50) <= i; i >>= 1) {
      avail = avail.filter((a) => out.every((o) => compatible(o.def, a.def)));
      if (!avail.length) break;
      out.push(pickWeighted(rng, avail));
    }
    return out.map((a) => [a.def.id, a.lvl]);
  }
  function apply(stack, ench) { stack.tag = Object.assign({}, stack.tag || {}, { ench: ench.map((e) => [e[0], e[1]]) }); }
  // bookshelves around a table, in the classic pattern
  function shelves(w, x, y, z) {
    const out = [];
    const shelf = (dx, dy, dz) => { if (w.getBlock(x + dx, y + dy, z + dz) === B.BOOKSHELF) out.push([x + dx, y + dy, z + dz]); };
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      if ((j === 0 && k === 0) || w.getBlock(x + k, y, z + j) !== 0 || w.getBlock(x + k, y + 1, z + j) !== 0) continue;
      shelf(k * 2, 0, j * 2); shelf(k * 2, 1, j * 2);
      if (k !== 0 && j !== 0) { shelf(k * 2, 0, j); shelf(k * 2, 1, j); shelf(k, 0, j * 2); shelf(k, 1, j * 2); }
    }
    return out;
  }
  function power(w, x, y, z) { return Math.min(15, shelves(w, x, y, z).length); }
  // damage modifiers and the like
  function attackBonus(stack, target) {
    let b = 0;
    const s = level(stack, 'sharpness'); if (s) b += s * 1.25;
    const sm = level(stack, 'smite'); if (sm && target && target.undead) b += sm * 2.5;
    const ba = level(stack, 'bane_of_arthropods'); if (ba && target && target.arthropod) b += ba * 2.5;
    return b;
  }
  // classic enchantment protection factor for a damage source
  function protection(armorItems, src) {
    let epf = 0;
    const t = src && src.type;
    for (const a of armorItems) {
      if (!a) continue;
      const p = level(a, 'protection'); if (p && t !== 'void' && t !== 'starve') epf += Math.floor((6 + p * p) * 0.75 / 3);
      const fp = level(a, 'fire_protection'); if (fp && (t === 'fire' || t === 'lava')) epf += Math.floor((6 + fp * fp) * 1.25 / 3);
      const ff = level(a, 'feather_falling'); if (ff && t === 'fall') epf += Math.floor((6 + ff * ff) * 2.5 / 3);
      const bp = level(a, 'blast_protection'); if (bp && t === 'explosion') epf += Math.floor((6 + bp * bp) * 1.5 / 3);
      const pp = level(a, 'projectile_protection'); if (pp && t === 'arrow') epf += Math.floor((6 + pp * pp) * 1.5 / 3);
    }
    if (epf <= 0) return 0;
    epf = Math.min(25, epf);
    epf = ((epf + 1) >> 1) + Math.floor(Math.random() * ((epf >> 1) + 1));
    return Math.min(20, epf) * 0.04;
  }
  // unbreaking: true if this use should cost durability
  function wears(stack, armor) {
    const u = level(stack, 'unbreaking');
    if (!u) return true;
    if (armor) return Math.random() < 0.6 + 0.4 / (u + 1);
    return Math.random() < 1 / (u + 1);
  }
  return { E, BY_ID, list, level, has, name, canEnchant, kindOf, enchantability, offerCost, roll, apply, power, shelves, attackBonus, protection, wears };
})();
