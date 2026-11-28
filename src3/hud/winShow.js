// The animated win screen's maps (#94, SPEC 9s item 8): your map first, a
// pencil traces the 1992 roads, each shift is circled and ticked, the count
// rolls up. Click or any key skips to the finished frame. The timing lives in
// ./winShowTimeline.js. Drawn with canvas 2D on top of the same pieces the
// still screen is made of (renderShiftLayers), so the last frame is the
// still screen.

import { WORLD } from '../../src/world/world.js';
import { printFrame } from '../../src/map/oldMap.js';
import { PAPER } from '../map/sketchPaper.js';
import { renderShiftLayers, SHIFT_CROP } from '../map/sketchRender.js';
import { isMuted } from '../../src/audio/context.js';
import { scratchStart, scratchMove, scratchStop } from '../map/mapSound.js';
import { winTimeline, TIMES } from './winShowTimeline.js';

const PAPER_COLOR = '#eee2c0';
const ROAD_REVEAL = 20; // how wide a strip of the 1992 sheet each pencil stroke uncovers (sheet units)
const RING_R = 17; // matches the ring size in sketchRender
const WEDGE_R = 260; // a ring's wedge reveal reaches this far from the ring centre (sheet units)

// The pencil scratch is the map's (#92, src3/map/mapSound.js): one looping
// sound whose loudness follows how fast the pencil moves. It goes quiet by
// itself when we stop moving it. Muted or no audio yet: nothing plays.
const PENCIL_SPEED = 0.5; // map px per ms, a steady hand
function makeScratch() {
  let on = false;
  const stop = () => { if (on) { scratchStop(); on = false; } };
  const move = () => {
    if (isMuted()) { stop(); return; }
    if (!on) on = scratchStart(); // false until the sound has loaded
    if (on) scratchMove(PENCIL_SPEED);
  };
  return { move, stop };
}

function drawPencil(ctx, x, y, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.9);
  ctx.scale(k, k);
  ctx.fillStyle = '#e0b030';
  ctx.fillRect(4, -3, 34, 6);
  ctx.fillStyle = '#d9a089';
  ctx.fillRect(38, -3, 6, 6);
  ctx.fillStyle = '#e8d3a8';
  ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(4, 3); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#444';
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-1.5, -1.2); ctx.lineTo(-1.5, 1.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(4, -3, 34, 6);
  ctx.restore();
}

// opts: { def, now, shifts, seen (Set of ids), marks, w (css px), countText(n) }
// Then set show.countEl, and call start(root), renderAt(sec) or finish().
// Returns { left, right (canvases), playing, skip() }.
export function createShiftShow(opts) {
  const { def, now, shifts, seen, marks, w, countText } = opts;
  const L = renderShiftLayers({ def, shifts, seen, sketch: marks }, w);
  const R = renderShiftLayers({ def: now, shifts, seen, labels: true }, w);
  const flags = shifts.map((s) => seen.has(s.id));
  const tl = winTimeline(flags);
  const mk = (src) => {
    const c = document.createElement('canvas');
    c.width = src.base.width;
    c.height = src.base.height;
    return c;
  };
  const left = mk(L);
  const right = mk(R);
  const s = R.scale;
  const sides = [
    { src: L, cv: left, ctx: left.getContext('2d'), settled: document.createElement('canvas'), parts: ['ring'] },
    { src: R, cv: right, ctx: right.getContext('2d'), settled: document.createElement('canvas'), parts: ['ring', 'label', 'tick'] },
  ];
  sides.forEach((sd) => {
    sd.settled.width = sd.cv.width;
    sd.settled.height = sd.cv.height;
    sd.sctx = sd.settled.getContext('2d');
    sd.sctx.drawImage(sd.src.base, 0, 0);
    sd.layers = new Map(); // in-progress piece canvases
    sd.baked = new Set();
  });

  // 1992 roads in sheet units, as a list of polylines, trace order: longest first.
  const { P } = printFrame(PAPER, now.bounds);
  const toPx = (pt) => { const [x, y] = P(pt); return [(x - SHIFT_CROP.x) * s, (y - SHIFT_CROP.y) * s]; };
  const frame = printFrame(PAPER, now.bounds).frame;
  const roads = WORLD.roads
    .map((r) => r.points.map(toPx))
    .filter((p) => p.length > 1)
    .sort((a, b) => b.length - a.length);
  const lens = roads.map((p) => p.reduce((a, q, i) => a + (i ? Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0));
  const totalLen = lens.reduce((a, b) => a + b, 0) || 1;
  const mask = mk(R);
  const mctx = mask.getContext('2d');
  const tmp = mk(R);
  const tctx = tmp.getContext('2d');
  let maskLen = 0; // how much of the trace is already in the mask
  // The pencil head at distance d along all the roads end to end.
  const advanceMask = (d) => {
    mctx.save();
    mctx.beginPath();
    mctx.rect((frame.x - SHIFT_CROP.x) * s, (frame.y - SHIFT_CROP.y) * s, frame.size * s, frame.size * s);
    mctx.clip();
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.lineWidth = ROAD_REVEAL * s;
    mctx.strokeStyle = '#000';
    let acc = 0;
    let head = null;
    for (let r = 0; r < roads.length; r++) {
      const pts = roads[r];
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const a0 = acc;
        acc += seg;
        if (acc <= maskLen) continue;
        if (a0 >= d) { r = roads.length; break; }
        const from = Math.max(0, maskLen - a0) / (seg || 1);
        const to = Math.min(1, (d - a0) / (seg || 1));
        const ax = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * from;
        const ay = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * from;
        const bx = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * to;
        const by = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * to;
        mctx.beginPath(); mctx.moveTo(ax, ay); mctx.lineTo(bx, by); mctx.stroke();
        head = [bx, by];
      }
    }
    mctx.restore();
    maskLen = Math.max(maskLen, d);
    return head;
  };

  const piece = (sd, i, part) => {
    const key = i + part;
    if (!sd.layers.has(key)) sd.layers.set(key, sd.src.mark(i, part));
    return sd.layers.get(key);
  };
  const bake = (sd, i, part) => {
    const key = i + part;
    if (sd.baked.has(key)) return;
    sd.sctx.drawImage(piece(sd, i, part), 0, 0);
    sd.baked.add(key);
    sd.layers.delete(key);
  };

  const scratch = makeScratch();
  let tip = null; // { ctx, x, y }

  // tmp = the 1992 sheet seen only where the pencil has been; returns the pencil head.
  const maskedSheet = (p) => {
    const head = advanceMask(p * totalLen);
    tctx.globalCompositeOperation = 'copy';
    tctx.drawImage(mask, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.drawImage(R.base, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    return head;
  };

  const drawWedge = (sd, i, p) => {
    const [cx, cy] = sd.src.at(i);
    const c = sd.ctx;
    c.save();
    c.beginPath();
    c.moveTo(cx, cy);
    const a0 = -Math.PI / 2;
    c.arc(cx, cy, WEDGE_R * s, a0, a0 + Math.PI * 2 * p);
    c.closePath();
    c.clip();
    c.drawImage(piece(sd, i, 'ring'), 0, 0);
    c.restore();
    const a = a0 + Math.PI * 2 * p;
    return { ctx: c, x: cx + Math.cos(a) * RING_R * 1.1 * s, y: cy + Math.sin(a) * RING_R * s };
  };

  function render(sec, quiet) {
    const st = tl.at(sec);
    tip = null;
    const [ls, rs] = sides;
    const buzz = () => { if (!quiet) scratch.move(); };
    // Finished pieces go into the settled sheets first.
    shifts.forEach((_, i) => {
      if (st.rings[i] >= 1) { bake(ls, i, 'ring'); bake(rs, i, 'ring'); }
      if (st.labels[i] >= 1) bake(rs, i, 'label');
      if (st.ticks[i] >= 1) bake(rs, i, 'tick');
    });
    // Left: your map, then circles as they are drawn.
    ls.ctx.drawImage(ls.settled, 0, 0);
    // Right: blank paper, the roads coming in, then the whole sheet.
    const c = rs.ctx;
    if (st.trace < 1) {
      c.fillStyle = PAPER_COLOR;
      c.fillRect(0, 0, rs.cv.width, rs.cv.height);
      if (st.trace > 0) {
        const head = maskedSheet(st.trace);
        c.drawImage(tmp, 0, 0);
        if (head) { tip = { ctx: c, x: head[0], y: head[1] }; buzz(); }
      }
    } else {
      // the rest of the sheet (water, names) fades in as the pencil lifts
      c.fillStyle = PAPER_COLOR;
      c.fillRect(0, 0, rs.cv.width, rs.cv.height);
      maskedSheet(1);
      c.drawImage(tmp, 0, 0);
      c.globalAlpha = Math.min(1, (sec - (TIMES.hold + TIMES.trace)) / TIMES.settle);
      c.drawImage(rs.settled, 0, 0);
      c.globalAlpha = 1;
    }
    // Circles being drawn, words and ticks coming in.
    shifts.forEach((_, i) => {
      if (st.rings[i] > 0 && st.rings[i] < 1) {
        const t1 = drawWedge(rs, i, st.rings[i]);
        drawWedge(ls, i, st.rings[i]);
        tip = t1;
        buzz();
      }
      for (const part of ['label', 'tick']) {
        const p = part === 'label' ? st.labels[i] : st.ticks[i];
        if (p > 0 && p < 1) {
          c.globalAlpha = p;
          c.drawImage(piece(rs, i, part), 0, 0);
          c.globalAlpha = 1;
        }
      }
    });
    if (tip) drawPencil(tip.ctx, tip.x, tip.y, s * 0.9);
    if (show.countEl) show.countEl.textContent = countText(st.count);
    return st;
  }

  const show = { left, right, playing: false, render, countEl: null, renderAt: (sec) => render(sec, true) };

  // Finished frame at once: the same pieces, all in place.
  function finish() {
    show.playing = false;
    scratch.stop();
    if (show._raf) cancelAnimationFrame(show._raf);
    const total = shifts.length;
    for (let i = 0; i < total; i++) {
      for (const sd of sides) for (const part of sd.parts) {
        if (part === 'tick' && !flags[i]) continue;
        bake(sd, i, part);
      }
    }
    for (const sd of sides) { sd.ctx.setTransform(1, 0, 0, 1, 0, 0); sd.ctx.drawImage(sd.settled, 0, 0); }
    if (show.countEl) show.countEl.textContent = countText(tl.at(tl.end).count);
    show.detach && show.detach();
  }

  show.skip = finish;
  show.end = tl.end;
  show.finish = finish;

  show.start = (root) => {
    show.playing = true;
    const t0 = performance.now();
    const onKey = (e) => { e.stopImmediatePropagation(); e.preventDefault(); finish(); };
    const onClick = (e) => { e.stopPropagation(); e.preventDefault(); finish(); };
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('click', onClick, true);
    show.detach = () => {
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('click', onClick, true);
      show.detach = null;
    };
    const frame1 = () => {
      if (!show.playing) return;
      if (!left.isConnected) { show.detach && show.detach(); scratch.stop(); show.playing = false; return; }
      const sec = (performance.now() - t0) / 1000;
      if (sec >= tl.end) { finish(); return; }
      render(sec);
      show._raf = requestAnimationFrame(frame1);
    };
    render(0, true);
    show._raf = requestAnimationFrame(frame1);
  };
  return show;
}
