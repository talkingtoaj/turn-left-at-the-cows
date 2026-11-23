// Seed maps for the map wall (#82): a few deliberately poor maps for every
// mission, drawn from the real roads with a shaky hand (skill 0 to 0.45:
// roads left out, a road that isn't there, a bridge in the wrong place, a
// question mark), so the wall isn't empty on day one and a player's own map
// looks good beside them. Made-up nicknames; votes come from made-up voters.
//
//   node tools/seed-maps.mjs                       sum up what it would make
//   node tools/seed-maps.mjs --out seed.json        write the maps to a file
//   ADMIN_TOKEN=... node tools/seed-maps.mjs --post http://127.0.0.1:8080
//                                                   load them into a server
//
// --post goes to POST /api/admin/seed (server/mapshare/app.py). Each map has
// a fixed id (seed-<mission>-<n>), so posting twice adds nothing. Only
// localhost unless --live is given too: loading the live server waits for
// the owner's go-ahead.

import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { MISSIONS } from '../src/game/missions.js';
import { regionWorld } from '../src/world/world.js';
import { printFrame } from '../src/map/oldMap.js';
import { makeRng } from '../src/map/draw.js';
import { PAPER, THICK_W, THIN_W, trueMapDef } from '../src3/map/sketchRender.js';

// The prototype's names (prototype/map-gallery), seen by the owner.
export const SEED_NAMES = ['Gravel Gus', 'lost_in_fenwick', 'MapMom', 'NorthIsUp', 'Tilly', 'Barnstormer', 'kit',
  'Dusty Rhodes', 'Corn Dog', 'Sunday Driver', 'Pencil Pete'];

const PAPER_W = 960;
const PAPER_H = 640;
const clampPt = ([x, y]) => [Math.min(PAPER_W, Math.max(0, x)), Math.min(PAPER_H, Math.max(0, y))];
const r1 = (v) => Math.round(v * 10) / 10;

// A poor sketch of one mission's area. Ported from the prototype's fakeSketch.
export function fakeSketch(rnd, skill, world, def, goal) {
  const { P } = printFrame(PAPER, def.bounds);
  const cx = PAPER.x + PAPER.w / 2;
  const cy = PAPER.y + PAPER.h / 2;
  const skew = 1 + (rnd() - 0.5) * (1 - skill) * 0.5;
  const rot = (rnd() - 0.5) * (1 - skill) * 0.5;
  const dx = (rnd() - 0.5) * 120;
  const dy = (rnd() - 0.5) * 60;
  const amp = 2 + (1 - skill) * 12;
  const T = ([x, y]) => {
    const [px, py] = P([x, y]);
    const ux = (px - cx) * skew;
    const uy = (py - cy) * skew;
    return clampPt([cx + dx + ux * Math.cos(rot) - uy * Math.sin(rot), cy + dy + ux * Math.sin(rot) + uy * Math.cos(rot)]);
  };
  const b = def.bounds;
  const inB = ([x, y]) => x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;
  const strokes = [];
  for (const r of world.roads) {
    const pts = r.points.filter(inB);
    if (pts.length < 2) continue;
    if (rnd() < 0.35 * (1 - skill) + 0.1) continue; // forgot this road
    const step = Math.max(1, Math.floor(pts.length / 14));
    let wob = 0;
    const out = [];
    for (let i = 0; i < pts.length; i += step) {
      wob += (rnd() - 0.5) * amp;
      wob *= 0.7;
      const [x, y] = T(pts[i]);
      out.push(clampPt([x + wob, y + (rnd() - 0.5) * amp]).map(r1));
    }
    out.push(T(pts[pts.length - 1]).map(r1));
    const s = { points: out, width: r.type === 'paved' ? THICK_W : THIN_W };
    if (r.type === 'dirt' && rnd() < 0.7) s.dash = true;
    strokes.push(s);
  }
  if (rnd() < 1 - skill) {
    // A road that isn't there.
    const a = [PAPER.x + 120 + rnd() * 600, PAPER.y + 80 + rnd() * 400];
    strokes.push({ points: [a, [a[0] + 80 + rnd() * 120, a[1] + (rnd() - 0.5) * 140]].map(clampPt).map((p) => p.map(r1)), width: THIN_W });
  }
  const stamps = [];
  const labels = [];
  const stamp = (kind, [x, y], extra = {}) => stamps.push({ kind, x: r1(x), y: r1(y), ...extra });
  const label = (text, [x, y], extra = {}) => labels.push({ text, x: r1(x), y: r1(y), ...extra });
  const g = T([goal.x, goal.y]);
  stamp('x', g, { color: 0xb3261e });
  const short = goal.name.split(' ')[0];
  label(rnd() < 0.5 ? short : goal.name, clampPt([g[0] + 16, g[1] - 4]), { color: 0xb3261e });
  for (const t of world.towns || []) {
    if (!inB([t.x, t.y]) || rnd() < 0.3) continue;
    const p = T([t.x, t.y]);
    label(t.name, clampPt([p[0] + 10, p[1] + 18]));
    stamp('house', p);
  }
  for (const l of world.landmarks || []) {
    if (!inB([l.x, l.y]) || rnd() < 0.5) continue;
    const kind = { church: 'church', water_tower: 'water_tower', radio_mast: 'radio_mast', mill_ruin: 'mill' }[l.kind];
    if (kind) stamp(kind, T([l.x, l.y]));
  }
  const wrongBridge = rnd() < (1 - skill) * 0.7;
  for (const br of (world.bridges || []).filter((q) => inB([q.x, q.y])).slice(0, 6)) {
    if (rnd() < 0.5) continue;
    let p = T([br.x, br.y]);
    if (wrongBridge && rnd() < 0.5) p = clampPt([p[0] + (rnd() < 0.5 ? -1 : 1) * (60 + rnd() * 90), p[1] + (rnd() - 0.5) * 120]);
    stamp('bridge', p);
  }
  if (rnd() < 0.6) stamp('question', [PAPER.x + 200 + rnd() * 500, PAPER.y + 120 + rnd() * 340]);
  return { strokes, stamps, labels };
}

// `per` seed maps for every mission, the same each run (apart from dates).
export function makeSeedMaps({ per = 8, now = Date.now() } = {}) {
  const out = [];
  MISSIONS.forEach((mission, mi) => {
    const world = regionWorld(mission.region);
    const def = trueMapDef(mission, world);
    const rnd = makeRng(1987 + mi * 101);
    const names = [...SEED_NAMES].sort(() => rnd() - 0.5).slice(0, Math.min(per, SEED_NAMES.length));
    names.forEach((nickname, i) => {
      const skill = rnd() * 0.45;
      const sketch = fakeSketch(makeRng(100 + mi * 1000 + i), skill, world, def, mission.goal);
      out.push({
        key: `${mission.id}-${String(i).padStart(2, '0')}`,
        mission: mission.id,
        region: mission.region,
        seed: null,
        nickname,
        sketch,
        votes: Math.min(20, Math.round(skill * skill * 40 * rnd())),
        timeMs: Math.round((6 + (1 - skill) * 14 + rnd() * 4) * 60000),
        km: Math.round((9 + (1 - skill) * 9 + rnd() * 3) * 10) / 10,
        tows: rnd() < (1 - skill) * 0.5 ? 1 + Math.floor(rnd() * 2) : 0,
        created: new Date(now - (i + 1) * 3.7e6 * (1 + rnd())).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
    });
  });
  return out;
}

async function main(argv) {
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const per = Number(arg('--per') || 8);
  const maps = makeSeedMaps({ per });
  const byMission = {};
  for (const m of maps) byMission[m.mission] = (byMission[m.mission] || 0) + 1;
  console.log('seed maps:', JSON.stringify(byMission), `(${Math.round(JSON.stringify(maps).length / 1024)} KB)`);
  const outFile = arg('--out');
  if (outFile) {
    writeFileSync(outFile, JSON.stringify({ maps }, null, 0));
    console.log('wrote', outFile);
  }
  const base = arg('--post');
  if (!base) return;
  const url = new URL('/api/admin/seed', base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && !argv.includes('--live')) {
    throw new Error(`not posting to ${url.host}: only localhost unless --live is given (the owner says when)`);
  }
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error('set ADMIN_TOKEN');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ maps }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`);
  const res = JSON.parse(text);
  console.log(`posted to ${url.host}: ${res.added.length} added, ${res.skipped.length} already there`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error('seed-maps:', e.message);
    process.exit(1);
  });
}
