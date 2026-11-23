// Frame budget check (#86): drives a fixed set of views through tools/shots.mjs
// and fails when any view draws more than the limits below (draw calls and
// triangles, main pass and shadow pass, from ?stats). Agent browsers render
// in software, so frame times mean nothing here, but the counts are right
// (docs/agents/frame-rate.md).
//
//   npm run check:budget                 # starts its own Vite server
//   node tools/check-budget.mjs --url http://localhost:5299
//   node tools/check-budget.mjs --extra-tris 300000   # self-test: must fail
//
// Takes about five minutes, so it is not in check:all: run it before each
// merge into jam/detail. Prints a markdown table to paste into a PR.

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'vite';

// Limits for every view. Picked on jam/detail at 831437d (2026-11-23): the
// worst view there, plus room for the detail tickets still in flight (trees,
// semis, mud, dog) and for the few percent the counts move between runs as
// traffic and cows wander. See docs/agents/frame-rate.md for how to move them.
// Worst on that day: calls 102, tris 476k, shadow 26 calls and 95k tris, all
// in traffic_row (six traffic cars pinned in view).
export const LIMITS = {
  calls: 120, // all draw calls in a frame, shadow pass included (+18 over the worst)
  tris: 600000, // all triangles in a frame, shadow pass included (+124k, about 26%)
  shadowCalls: 32, // shadow pass only (+6)
  shadowTris: 130000, // shadow pass only (+35k, about 37%)
};

// Views from tools/shots.mjs. region: which region to load them in.
const VIEWS = {
  // Ashford, Calder, Millbrook and the farms (the default region).
  default: [
    // Towns and their busiest buildings.
    'church_close', 'church_road', 'gas_a_close', 'gas_a_wide', 'elev_a_close', 'shop_m_close', 'shop_c_close', 'porch_p_close',
    // Farms.
    'hartley_wide', 'hartley_pasture', 'cows_herd', 'barnsilo_close', 'parked6x6_hartley_yard',
    // Open road.
    'paved', 'paved_low', 'dirtroad', 'verge_hwy', 'traffic_row',
    // The heaviest landmark views.
    'silo_close', 'silo_top', 'verge_culvert', 'tower_close', 'tower_road',
  ],
  // Brandt region (SHOTS_QUERY spot=brandt).
  brandt: ['semib_close', 'gas_b_wide', 'churchb_board', 'elev_b_sign', 'shop_b_close'],
};
const QUERY = { default: 'opening=off', brandt: 'opening=off&spot=brandt' };

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const extraTris = opt('--extra-tris');

let server = null;
let base = opt('--url');
if (!base) {
  // Silent: the page's undecodable sounds (private assets absent) would flood the log.
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'silent' });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
const here = path.dirname(new URL(import.meta.url).pathname);

// One shots.mjs run per region, side by side. Resolves its stdout.
function run(region) {
  return new Promise((resolve) => {
    const env = { ...process.env, SHOTS_QUERY: QUERY[region], SHOTS_NO_PNG: '1' };
    if (extraTris) env.SHOTS_EXTRA_TRIS = extraTris;
    const p = spawn(process.execPath, [path.join(here, 'shots.mjs'), base, outDir, region, VIEWS[region].join(',')], { env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ region, code, out }));
  });
}

// "<dir>/<region>_<view>.png calls 85  tris 447k | shadow 17 calls  72k tris  1/1 frames"
export function parseLine(line) {
  const m = /([\w]+)\.png calls (\d+)\s+tris (\d+)k \| shadow (\d+) calls\s+(\d+)k tris/.exec(line);
  if (!m) return null;
  return { name: m[1], calls: +m[2], tris: +m[3] * 1000, shadowCalls: +m[4], shadowTris: +m[5] * 1000 };
}

const t0 = Date.now();
let results;
try {
  results = await Promise.all(Object.keys(VIEWS).map(run));
} finally {
  if (server) await server.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}

const rows = [];
const problems = [];
for (const { region, code, out } of results) {
  if (code !== 0) problems.push(`shots.mjs (${region}) exited ${code}:\n${out.split('\n').slice(-15).join('\n')}`);
  const got = new Map();
  for (const line of out.split('\n')) {
    const r = parseLine(line);
    if (r) got.set(r.name.slice(region.length + 1), r);
  }
  for (const view of VIEWS[region]) {
    const r = got.get(view);
    if (!r) { problems.push(`${view}: no stats`); continue; }
    const over = Object.keys(LIMITS).filter((k) => r[k] > LIMITS[k]);
    for (const k of over) problems.push(`${view}: ${k} ${r[k]} over the limit ${LIMITS[k]}`);
    rows.push({ view, region, ...r, over });
  }
}

const k = (n) => `${Math.round(n / 1000)}k`;
const worst = (key) => Math.max(...rows.map((r) => r[key]));
console.log('| view | region | calls | tris | shadow calls | shadow tris |');
console.log('|---|---|--:|--:|--:|--:|');
for (const r of rows) {
  const mark = (key, s) => (r.over.includes(key) ? `**${s}**` : s);
  console.log(`| ${r.view} | ${r.region} | ${mark('calls', r.calls)} | ${mark('tris', k(r.tris))} | ${mark('shadowCalls', r.shadowCalls)} | ${mark('shadowTris', k(r.shadowTris))} |`);
}
if (rows.length) console.log(`| **worst** | | ${worst('calls')} | ${k(worst('tris'))} | ${worst('shadowCalls')} | ${k(worst('shadowTris'))} |`);
console.log(`| **limit** | | ${LIMITS.calls} | ${k(LIMITS.tris)} | ${LIMITS.shadowCalls} | ${k(LIMITS.shadowTris)} |`);
console.log(`\n${rows.length} views in ${Math.round((Date.now() - t0) / 1000)} s${extraTris ? ` (with ${extraTris} extra triangles)` : ''}`);
if (problems.length) {
  console.error('check:budget FAILED');
  for (const p of problems) console.error(' ', p);
  process.exit(1);
}
console.log('check:budget: ok, every view inside the budget');
