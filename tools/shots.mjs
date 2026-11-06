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

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'shot'] = process.argv;

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
  { name: 'slope', car: { x: 2440, y: 470, heading: 60 }, cam: [2420, 6, 520], look: [2500, 0, 440] },
  { name: 'dirtroad', car: { road: 'farm_rd', at: 0.45 } },
  { name: 'dirtroad_low', car: { road: 'creek_rd', at: 0.3 }, rel: [-3.2, 0.9, 5] },
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
await page.goto(`${base}/three.html?stats&res=1`);
await page.waitForSelector('button');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// Dismiss the mission card.
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

fs.mkdirSync(outDir, { recursive: true });
const stats = {};
for (const v of VIEWS) {
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
      if (v.cam) {
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
        c.lookAt(st.car.x + fx * 6, H(st.car.x, st.car.y) + 0.6, st.car.y + fy * 6);
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
