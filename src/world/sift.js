'use strict';
// ---------------------------------------------------------------------------
// The Sift: where lost things go. Anything left lying in the world until it
// fades away, or dropped into the void, sifts down here in time and turns up
// in the lost-and-found chest beside the Far Gate. The Sift also remembers
// which city gate you came through, so it can send you back there.
// ---------------------------------------------------------------------------
const Sift = (() => {
  const MAX_LOST = 160;
  function state(info) {
    if (!info.sift) info.sift = { lost: [], back: null, visits: 0, found: 0 };
    return info.sift;
  }
  // something was lost to the world: it begins its long fall
  function lose(w, stack) {
    if (!w || w.menu || !stack || stack.count <= 0 || w.dim === DIM_SIFT) return;   // what is lost in the Sift stays lost
    const st = state(w.info);
    st.lost.push(stack.toJSON());
    if (st.lost.length > MAX_LOST) st.lost.splice(0, st.lost.length - MAX_LOST);
  }
  function arrival(w) {
    const y = w.localGen.arrivalY ? w.localGen.arrivalY() : 61;
    return [0.5, y, 3.5];
  }
  // the lost-and-found by the Far Gate: whatever has come down since you were last here
  function fillChest(game) {
    const w = game.world, st = state(w.info);
    const y = w.localGen.arrivalY ? w.localGen.arrivalY() : 61;
    const [cx, , cz] = WG.SIFT.CHEST;
    const te = w.getTile(cx, y, cz);
    if (!te || !te.items) return 0;
    let n = 0;
    while (st.lost.length) {
      const slot = te.items.findIndex((s) => !s);
      if (slot < 0) break;
      const s = ItemStack.fromJSON(st.lost.shift());
      if (!s || !itemExists(s.id)) continue;
      te.items[slot] = s; n++;
    }
    if (n) { w.markTileChanged(cx, cz); st.found += n; }
    return n;
  }
  return { state, lose, arrival, fillChest };
})();
