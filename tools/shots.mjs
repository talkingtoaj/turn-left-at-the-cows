// Dev tool: screenshots of fixed review views in the 3D version, plus draw
// calls and triangles from ?stats. Needs a running dev server.
//
//   node tools/shots.mjs <url> <outDir> <prefix>
//   e.g. node tools/shots.mjs http://localhost:5199 /tmp/shots after
//
// Views place the car and, for most, pin the camera so before and after
// shots show exactly the same thing.

import fs from 'fs';
import path from 'path';
import os from 'os';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'shot', only = ''] = process.argv; // only: comma list of view names

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
await page.goto(`${base}/three.html?stats&res=1${process.env.SHOTS_QUERY ? `&${process.env.SHOTS_QUERY}` : ''}`); // SHOTS_QUERY=rain=on for wet shots
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

fs.mkdirSync(outDir, { recursive: true });
const stats = {};
for (const v of VIEWS.filter((w) => !only || only.split(',').includes(w.name))) {
  await page.evaluate(async (v) => {
    const { WORLD } = await import('/src/world/world.js');
    const st = window.__state;
    let { x, y, heading } = v.car;
    if (v.car.road) {
      const r = WORLD.roads.find((q) => q.id === v.car.road);
      const i = Math.floor(r.points.length * v.car.at);
      const [ax, ay] = r.points[i];
      const [bx, by] = r.points[i + 1];
      x = ax;
      y = ay;
      heading = (Math.atan2(bx - ax, -(by - ay)) * 180) / Math.PI;
      // Keep right like the traffic does.
      const len = Math.hypot(bx - ax, by - ay);
      x += (-(by - ay) / len) * -1.2;
      y += ((bx - ax) / len) * -1.2;
    }
    st.car.x = x;
    st.car.y = y;
    st.car.heading = heading;
    st.car.speed = 0;
    const { renderer, camera, world3d } = window.__three;
    if (!renderer.__orig) renderer.__orig = renderer.render.bind(renderer);
    const H = (px, py) => world3d.terrain.heightAt(px, py);
    renderer.render = (s, c) => {
      if (v.cows && window.__amb) {
        // Aim at the cow nearest the car, from the car's side of it.
        let best = null;
        for (const a of window.__amb.animals) {
          if (a.kind !== 'cow') continue;
          const d = Math.hypot(a.x - st.car.x, a.y - st.car.y);
          if (!best || d < best.d) best = { a, d };
        }
        if (best) {
          const { a, d } = best;
          const px = a.x + ((st.car.x - a.x) / d) * v.cows[0];
          const py = a.y + ((st.car.y - a.y) / d) * v.cows[0];
          c.position.set(px, H(px, py) + v.cows[1], py);
          c.up.set(0, 1, 0);
          c.lookAt(a.x, H(a.x, a.y) + 0.8, a.y);
          c.updateMatrixWorld();
        }
      } else if (v.cam) {
        c.position.set(v.cam[0], H(v.cam[0], v.cam[2]) + v.cam[1], v.cam[2]);
        c.up.set(0, 1, 0);
        c.lookAt(v.look[0], H(v.look[0], v.look[2]) + v.look[1], v.look[2]);
        c.updateMatrixWorld();
      } else if (v.rel) {
        // Low view beside the car, looking at it (local right, up, back).
        const h = (st.car.heading * Math.PI) / 180;
        const fx = Math.sin(h);
        const fy = -Math.cos(h);
        const px = st.car.x + -fy * v.rel[0] - fx * v.rel[2];
        const py = st.car.y + fx * v.rel[0] - fy * v.rel[2];
        c.position.set(px, H(px, py) + v.rel[1], py);
        c.up.set(0, 1, 0);
        if (v.relLook) {
          const [lr, lu, lb] = v.relLook;
          const lx = st.car.x + -fy * lr - fx * lb;
          const ly = st.car.y + fx * lr - fy * lb;
          c.lookAt(lx, H(st.car.x, st.car.y) + lu, ly);
        } else c.lookAt(st.car.x + fx * 6, H(st.car.x, st.car.y) + 0.6, st.car.y + fy * 6);
        c.updateMatrixWorld();
      }
      renderer.__orig(s, c);
    };
  }, v);
  await page.waitForTimeout(2500);
  const file = path.join(outDir, `${prefix}_${v.name}.png`);
  await page.screenshot({ path: file });
  stats[v.name] = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /calls \d+/.test(d.textContent) && d.style.position === 'fixed');
    return el ? el.textContent.split('\n').filter((l) => /calls/.test(l)).join(' | ') : null;
  });
  console.log(file, stats[v.name]);
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
