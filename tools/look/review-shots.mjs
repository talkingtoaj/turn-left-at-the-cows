// Review screenshots for a round: a list of views, each a URL query and an
// optional pinned camera, saved as <outDir>/<prefix><name>.png, with draw
// calls and triangles from ?stats in <outDir>/stats.json.
//
//   node tools/look/review-shots.mjs <baseUrl> <outDir> <prefix> <views.json|name,...> [extra query]
//
// views.json: [{ name, q: 'spot=ashford', cam: [x, up, y], look: [x, up, y],
//   drive: { speed, heading } (car keeps that speed, e.g. through a puddle),
//   until: 'js expression' (wait until true, e.g. the car reaching a puddle),
//   wait: ms }]. cam/look are relative to the ground there (as shots.mjs).
// Built-in sets: see VIEWS below (pick by name with a comma list).

import fs from 'fs';
import path from 'path';
import os from 'os';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = '', which = '', extra = ''] = process.argv;

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

// Round 8 review views.
export const VIEWS = [
  // Part A: scatter fixes.
  { name: 'stony_rocks', q: 'spot=3000,238,90', cam: [2996, 1.8, 238], look: [3012, 1.0, 231] },
  { name: 'gorse_close', q: 'spot=3000,238,90', cam: [2998, 1.6, 236], look: [3004, 0.6, 230] },
  { name: 'raven_crag', q: 'spot=5366,1263,12' },
  { name: 'tinkers_rocks', q: 'spot=1500,1525,334' },
  { name: 'the_anvil', q: 'spot=636,1473,280' },
  // Part B: dry / wet pairs.
  { name: 'paved_road', q: 'spot=ashford' },
  { name: 'dirt_road', q: 'spot=dirtroad' },
  // Pasture pf_4 by Route 40 (next to Withy Bottoms), two hollows from the road.
  { name: 'pasture_puddles', q: 'spot=2474.9,1406.5,79.2', cam: [2458, 2.6, 1398], look: [2447, 0, 1381] },
  // Withy Bottoms (willow) by Route 40.
  { name: 'willow_mud', q: 'spot=2420.4,1416.9,79.1', cam: [2438, 2.2, 1404], look: [2452, 0.3, 1436] },
  { name: 'town_ashford', q: 'spot=ashford', cam: [600, 2.2, 2440], look: [640, 1.5, 2400] },
  // The car through the Mill Lane puddle at 45 km/h (chase camera).
  { name: 'splash', q: 'spot=1464.4,2121.9,356.8', drive: { speed: 12.5 }, until: 'window.__state.car.y < 2098.2', wait: 300 },
  { name: 'splash_side', q: 'spot=1464.4,2121.9,356.8', cam: [1472, 1.3, 2090], look: [1463, 0.5, 2097], drive: { speed: 12.5 }, until: 'window.__state.car.y < 2099.5', wait: 0 },
  // Mid-rain: looking along the road at streaks (run with rain=on&wet=0.4).
  { name: 'mid_rain_streaks', q: 'spot=dirtroad' },
];

const list = which.endsWith('.json')
  ? JSON.parse(fs.readFileSync(which, 'utf8'))
  : VIEWS.filter((v) => !which || which.split(',').includes(v.name));

const pw = await import(findPlaywright());
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
fs.mkdirSync(outDir, { recursive: true });
const statsFile = path.join(outDir, 'stats.json');
const allStats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : {};
const errors = [];

for (const v of list) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${prefix}${v.name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${prefix}${v.name}: ${e}`));
  const q = ['stats', 'res=1', v.q, extra].filter(Boolean).join('&');
  await page.goto(`${base}/three.html?${q}`);
  await page.waitForSelector('button');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); // dismiss the mission card
  await page.waitForTimeout(500);
  if (v.cam) {
    await page.evaluate((v) => {
      const { renderer, world3d } = window.__three;
      const H = (x, y) => world3d.terrain.heightAt(x, y);
      const orig = renderer.render.bind(renderer);
      renderer.render = (s, c) => {
        c.position.set(v.cam[0], H(v.cam[0], v.cam[2]) + v.cam[1], v.cam[2]);
        c.up.set(0, 1, 0);
        c.lookAt(v.look[0], H(v.look[0], v.look[2]) + v.look[1], v.look[2]);
        c.updateMatrixWorld();
        world3d.sky.position.copy(c.position);
        orig(s, c);
      };
    }, v);
  }
  if (v.drive) {
    await page.evaluate((d) => {
      const s = window.__state;
      if (d.x !== undefined) { s.car.x = d.x; s.car.y = d.y; }
      if (d.heading !== undefined) s.car.heading = d.heading;
      window.__driveHold = setInterval(() => { s.car.speed = d.speed; }, 16);
    }, v.drive);
  }
  if (v.until) await page.waitForFunction(v.until, null, { timeout: 180000, polling: 50 });
  await page.waitForTimeout(v.wait ?? 3500);
  const file = path.join(outDir, `${prefix}${v.name}.png`);
  for (let k = 1; k < (Number(process.env.BURST) || 0); k++) {
    await page.screenshot({ path: file.replace('.png', `_${k}.png`) });
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: file });
  if (v.drive && process.env.PROBE) console.log('probe', await page.evaluate(process.env.PROBE));
  const st = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /calls \d+/.test(d.textContent) && d.style.position === 'fixed');
    return el ? el.textContent.split('\n').filter((l) => /calls/.test(l)).join(' | ') : null;
  });
  allStats[`${prefix}${v.name}`] = st;
  console.log(file, st);
  await page.close();
}
fs.writeFileSync(statsFile, JSON.stringify(allStats, null, 1));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
