// Fence details (#61): field gates with hinges and a latch, post caps, and
// the odd broken board on rail fences. Drawn into the Tris sets of the
// field's fence (fields3d.js), so they add no draw calls. Where they go is
// decided in fencePlan.js.

import { brokenBoard } from './fencePlan.js';

export const GALV = 0x9aa0a4; // galvanized tube gate
export const IRON = 0x34363a; // hinges, latch, chain
export const GATE_WOOD = 0x7b6750; // a wooden gate, a shade greyer than the rails

// A low four-sided cap on a square post's top (three.js coords [x, up, y]):
// rain runs off, and the post stops reading as a plain stick.
export function postCap(T, x, top, y, w, rise = 0.06) {
  const h = w / 2;
  const tip = [x, top + rise, y];
  const c = [[x - h, top, y - h], [x + h, top, y - h], [x + h, top, y + h], [x - h, top, y + h]];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const out = [(a[0] + b[0]) / 2 - x, 0.5, (a[2] + b[2]) / 2 - y];
    T.tri(a, b, tip, out);
  }
}

// A closed gate between gate posts a and b ({x, y}). wood: a board gate for
// rail fences, else a galvanized tube gate. T: { posts, rails, metal, iron }
// Tris sets. H: ground height. Returns the leaf's bottom (for the audit).
export function addGate(T, a, b, H, wood) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const at = (s) => [a.x + ux * s, a.y + uy * s];
  // The leaf is rigid and level: it clears the highest ground under it.
  let ground = -Infinity;
  for (let k = 0; k <= 6; k++) {
    const [x, y] = at(0.15 + ((L - 0.3) * k) / 6);
    ground = Math.max(ground, H(x, y));
  }
  const bot = ground + 0.1;
  const top = bot + (wood ? 1.15 : 1.12);
  const ha = H(a.x, a.y);
  const hb = H(b.x, b.y);
  // Heavy gate posts, a little taller than the fence's, capped.
  const pw = 0.22;
  for (const [p, h] of [[a, ha], [b, hb]]) {
    const ptop = Math.max(h + 1.42, top + 0.12);
    T.posts.beam([p.x, h - 0.3, p.y], [p.x, ptop, p.y], pw, pw);
    postCap(T.posts, p.x, ptop, p.y, pw);
  }
  const s0 = pw / 2 + 0.04; // hinge gap
  const s1 = L - pw / 2 - 0.05; // latch gap
  const P = (s, up) => {
    const [x, y] = at(s);
    return [x, up, y];
  };
  const bar = (Tr, s, u0, s2, u1, w, t) => Tr.beam(P(s, u0), P(s2, u1), w, t);
  if (wood) {
    const R = T.gate;
    // Five boards, the ends and a middle stile, and a brace from the
    // bottom of the hinge end up to the top of the latch end.
    for (let k = 0; k < 5; k++) {
      const up = bot + 0.07 + ((top - bot - 0.14) * k) / 4;
      bar(R, s0, up, s1, up, 0.13, 0.04);
    }
    for (const s of [s0 + 0.05, (s0 + s1) / 2, s1 - 0.05]) R.beam(P(s, bot), P(s, top), 0.1, 0.06);
    bar(R, s0 + 0.08, bot + 0.1, s1 - 0.1, top - 0.08, 0.12, 0.05);
    // Strap hinges over the top and bottom boards.
    for (const up of [bot + 0.07, top - 0.07]) bar(T.iron, s0 - 0.06, up, s0 + 0.55, up, 0.05, 0.075);
  } else {
    const M = T.metal;
    // Six tubes, closer at the bottom (keeps the calves in), the end
    // uprights, a middle stay and a diagonal brace.
    const ups = [0, 0.16, 0.34, 0.55, 0.8, 1].map((f) => bot + (top - bot) * f);
    ups.forEach((up, k) => bar(M, s0, up, s1, up, k === 5 ? 0.06 : 0.042, k === 5 ? 0.06 : 0.042));
    for (const s of [s0, s1]) M.beam(P(s, bot - 0.02), P(s, top + 0.02), 0.06, 0.06);
    const mid = (s0 + s1) / 2;
    M.beam(P(mid, bot), P(mid, top), 0.04, 0.03);
    bar(M, s0, bot + 0.02, mid, top - 0.02, 0.04, 0.03);
    // Hinge pins: a collar on the leaf, a bolt into the post, top and bottom.
    for (const up of [ups[1], ups[5]]) bar(T.iron, s0 - 0.12, up, s0 + 0.06, up, 0.07, 0.08);
  }
  // Latch: a slide bolt on the leaf's end, a keeper on the post, and a
  // chain looped round the post below it.
  const lu = top - 0.2;
  bar(T.iron, s1 - 0.22, lu, s1 + 0.02, lu, 0.06, 0.07);
  bar(T.iron, s1 - 0.02, lu, s1 + 0.14, lu, 0.025, 0.025);
  bar(T.iron, L - pw / 2 - 0.02, lu - 0.04, L - pw / 2 - 0.02, lu + 0.08, 0.05, pw + 0.04);
  bar(T.iron, s1 - 0.03, lu - 0.16, L - pw / 2 + 0.03, lu - 0.22, 0.03, pw + 0.05);
  return bot;
}

// One rail of a rail fence from post p (height hp) to q (hq), up m above the
// ground, broken or whole. Returns false when the rail is whole (the caller
// draws it the usual way).
export function addBrokenRail(R, fieldId, run, k, rail, p, hp, q, hq, up, H) {
  const kind = brokenBoard(fieldId, run, k, rail);
  if (!kind) return false;
  if (kind === 'missing') {
    // A short stub left nailed to one post.
    const t = 0.18;
    R.beam([p.x, hp + up, p.y], [p.x + (q.x - p.x) * t, hp + up - 0.03, p.y + (q.y - p.y) * t], 0.14, 0.05);
    return true;
  }
  // Which end let go, and a nudge off the fence line so it doesn't sit in it.
  const flip = k % 2 === 1;
  const [A, ha, B] = flip ? [q, hq, p] : [p, hp, q];
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const nx = -(B.y - A.y) / L;
  const ny = (B.x - A.x) / L;
  const side = rail % 2 ? 1 : -1;
  if (kind === 'drop') {
    // One end on the ground short of the far post.
    const ex = B.x - ((B.x - A.x) / L) * 0.35 + nx * side * 0.12;
    const ey = B.y - ((B.y - A.y) / L) * 0.35 + ny * side * 0.12;
    R.beam([A.x, ha + up, A.y], [ex, H(ex, ey) + 0.04, ey], 0.14, 0.05);
    return true;
  }
  // Snapped in the middle: both halves hang from their nails.
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const hm = H(mx, my);
  const sag = Math.min(up - 0.12, 0.45);
  for (const [E, he, s] of [[A, ha, 1], [B, flip ? hp : hq, -1]]) {
    const tx = mx + ((E.x - mx) * 0.08) + nx * side * 0.04 * s;
    const ty = my + ((E.y - my) * 0.08) + ny * side * 0.04 * s;
    R.beam([E.x, he + up, E.y], [tx, hm + up - sag + (s > 0 ? 0 : 0.08), ty], 0.14, 0.05);
  }
  return true;
}
