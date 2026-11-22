// Dev tool: how much CPU the roadside carpet (src3/world3d/carpet3d.js)
// takes per frame while driving. Loads the game headless, then steps the
// carpet frame by frame with the camera chasing a car down a road at a fixed
// speed (no rendering in between, so only the carpet's own work is timed).
// Prints mean, p95 and worst ms per frame and the bytes it queues for upload.
// Needs a running dev server.
//
//   node tools/carpet-perf.mjs <url> [road] [speeds m/s, comma list] [res level]
//   e.g. node tools/carpet-perf.mjs http://localhost:5261 ridge_rd 16,25
//
// res level (0 full .. 3 lowest, src3/resscale.js STEPS) sets the carpet's
// reach as the resolution scaler would.

import fs from 'fs';
import path from 'path';
import os from 'os';

const [, , base = 'http://localhost:5199', road = 'ridge_rd', speedList = '16,25', resLevel = '0', reps = '3'] = process.argv;

function findPlaywright() {
  const root = path.join(os.homedir(), '.npm/_npx');
  for (const d of fs.readdirSync(root)) {
    const p = path.join(root, d, 'node_modules/playwright-core/index.js');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('playwright-core not found under ~/.npm/_npx');
}

function findChrome() {
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('chromium not found');
}

// cam: [x, up, y] relative to ground at (x, y), look: [x, up, y] likewise.
// car: { x, y, heading } or { road, at } (fraction along a road).
const VIEWS = [
  // Hartley Farm: the crop field north of the yard, close and wide.
  { name: 'hartley', car: { x: 2610, y: 490, heading: 0 }, cam: [2770, 2.5, 395], look: [2700, 0, 350] },
  { name: 'hartley_wide', car: { x: 2610, y: 490, heading: 0 }, cam: [2560, 40, 520], look: [2720, 0, 380] },
  { name: 'hartley_edge', car: { x: 2610, y: 490, heading: 0 }, cam: [2630, 1.8, 410], look: [2680, 3, 365] },
  { name: 'hartley_pasture', car: { x: 2745, y: 540, heading: 90 }, cam: [2752, 2.2, 532], look: [2830, 0, 440] },
  // Hartley cows, standing in the pasture among the herd (#37).
  // `cows: [dist, up]` aims the camera at the cow nearest the car from `dist` m away.
  { name: 'cows_close', car: { x: 2745, y: 540, heading: 90 }, cows: [7, 1.8] },
  { name: 'cows_herd', car: { x: 2745, y: 540, heading: 90 }, cows: [22, 7] },
  // Okafor's herd of 16: the cow nearest the car's west side, from 14 m.
  { name: 'cows_okafor', car: { x: 4935, y: 2125, heading: 0 }, cows: [14, 3] },
  { name: 'cows_okafor_low', car: { x: 4935, y: 2125, heading: 0 }, cows: [5, 1] },
  // Steep pasture west of the farm: trough and feeder on the slope.
  { name: 'slope', car: { x: 2498, y: 564, heading: 0 }, cam: [2506, 1.6, 452], look: [2488, 0.3, 430] },
  { name: 'slope_wide', car: { x: 2498, y: 564, heading: 0 }, cam: [2530, 8, 480], look: [2480, 0, 420] },
  // Dirt roads with the car on them: chase view, and low beside the car.
  { name: 'dirtroad', car: { road: 'ridge_rd', at: 0.5 } },
  { name: 'dirtroad_low', car: { road: 'creek_rd', at: 0.3 }, rel: [-3.2, 0.9, 5] },
  // Paved roads: chase view and low beside the car (edge and centre lines).
  { name: 'paved', car: { road: 'hwy9', at: 0.4 } },
  { name: 'paved_low', car: { road: 'rt40', at: 0.5 }, rel: [-3.2, 0.9, 5] },
  { name: 'dirtroad_ridge_low', car: { road: 'ridge_rd', at: 0.5 }, rel: [2.8, 0.8, 7.5] },
  // The player's car up close (roof rack, parcels, mud flaps, dings): relLook
  // aims at a point on the car (local right, up, back) instead of ahead of it.
  { name: 'car_rear_high', car: { road: 'hwy9', at: 0.4 }, rel: [2.6, 2.7, 5.2], relLook: [0, 0.9, 0.3] },
  { name: 'car_side', car: { road: 'hwy9', at: 0.4 }, rel: [-4.6, 1.3, -0.6], relLook: [0, 0.8, 0.2] },
  { name: 'car_front_right', car: { road: 'hwy9', at: 0.4 }, rel: [3.4, 1.5, -3.6], relLook: [0, 0.8, -0.4] },
  { name: 'car_roof', car: { road: 'hwy9', at: 0.4 }, rel: [1.7, 2.5, 2.4], relLook: [0, 1.55, 0.45] },
  { name: 'car_trunk', car: { road: 'hwy9', at: 0.4 }, rel: [1.4, 1.5, 4.2], relLook: [0.3, 0.9, 1.8] },
  // Pruitt Lane (dirt) meeting Route 40: STOP sign, about 15 m and up high.
  { name: 'junction_stop', car: { x: 2965, y: 1100, heading: 180 }, cam: [2981.5, 1.4, 1276], look: [2978, 1.2, 1296] },
  { name: 'junction_wide', car: { x: 2965, y: 1100, heading: 180 }, cam: [3005, 14, 1265], look: [2978, 0, 1300] },
  // A wire fence by Hartley Farm, low along the posts (weeds at its foot).
  { name: 'fence_low', car: { x: 2610, y: 490, heading: 0 }, cam: [2617, 1.4, 556], look: [2628, 0.4, 578] },
  // Wildflowers and clover (#41): a damp bottom by Pond Road, a dry meadow by Farm Road.
  { name: 'flowers_damp', car: { x: 4912, y: 674, heading: 0 }, cam: [4907, 1.7, 677], look: [4885, 0, 668] },
  { name: 'flowers_dry', car: { x: 2598, y: 493, heading: 0 }, cam: [2603, 1.7, 497], look: [2628, 0, 490] },
];

const pw = await import(findPlaywright());
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/three.html?res=1`);
await page.waitForSelector('button');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// Dismiss the mission card.
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
// The mission card can come up after the intro card: click its Start too.
for (let k = 0; k < 3; k++) {
  const start = page.locator('button:visible', { hasText: /^Start$/ });
  if (!(await start.count())) break;
  await start.first().click();
  await page.waitForTimeout(800);
}


const runs = [];
for (const speed of speedList.split(',').map(Number)) {
  for (let rep = 0; rep < Number(reps); rep++) {
    runs.push(await page.evaluate(async ({ road, speed, resLevel }) => {
      const { WORLD } = await import('/src/world/world.js');
      const { camera, world3d } = window.__three;
      const carpet = world3d.scatter.carpet;
      // The scaler's step as detail: level 0 is 1 (full), the last level 0.
      if (carpet.setDetail) carpet.setDetail(1 - Number(resLevel) / 3, true);
      const r = WORLD.roads.find((q) => q.id === road);
      const pts = r.points;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = cum[cum.length - 1];
      const at = (d) => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
        const a = pts[i - 1];
        const b = pts[i];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      const H = (x, y) => world3d.terrain.heightAt(x, y);
      // The carpet centres on the camera last drawn (the ruts' onBeforeRender).
      const ruts = carpet.object.getObjectByName('carpet_ruts');
      const meshes = ['carpet_grass', 'carpet_pebbles', 'carpet_clover', 'carpet_flowers'].map((n) => carpet.object.getObjectByName(n));
      const place = (d) => {
        const [x, y] = at(d);
        const [bx, by] = at(Math.max(0, d - 6));
        camera.position.set(bx, H(bx, by) + 2.5, by);
        camera.lookAt(x, H(x, y) + 0.6, y);
        camera.updateMatrixWorld();
        if (ruts) ruts.onBeforeRender(null, null, camera);
      };
      // Jump to the start and settle (builds every tile, like a teleport).
      let d = Math.min(total * 0.05, 60);
      place(d);
      for (let k = 0; k < 120; k++) carpet.update(camera);
      const dt = 1 / 60;
      self.__cprof = {};
      const ms = [];
      const bytes = [];
      while (d < total - 30) {
        d += speed * dt;
        place(d);
        const t0 = performance.now();
        carpet.update(camera);
        ms.push(performance.now() - t0);
        let b = 0;
        for (const m of meshes) {
          if (!m.instanceMatrix.needsUpdate && m.instanceMatrix.version === m.__v) continue;
          m.__v = m.instanceMatrix.version;
          for (const u of m.instanceMatrix.updateRanges) b += u.count * 4;
          for (const u of m.instanceColor.updateRanges) b += u.count * 4;
        }
        bytes.push(b);
      }
      const s = [...ms].sort((a, b) => a - b);
      const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
      return {
        speed, frames: ms.length, mean: +mean.toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), worst: +s[s.length - 1].toFixed(3),
        over2: ms.filter((x) => x > 2).length, uploadKBworst: Math.round(Math.max(...bytes) / 1024), uploadKBmean: +(bytes.reduce((a, b) => a + b, 0) / bytes.length / 1024).toFixed(1),
        counts: carpet.counts(),
      };
    }, { road, speed, resLevel }));
  }
}
for (const r of runs) console.log(JSON.stringify(r));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
