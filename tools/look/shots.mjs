// Look test: old/new screenshot pairs at the review spots (src3/spots.js)
// plus pinned close-ups, with draw calls and triangles from ?stats.
//
//   node tools/look/shots.mjs <baseUrl> <outDir> [old|new|both] [extra query]
//   e.g. node tools/look/shots.mjs http://localhost:5299 /tmp/look both
//
// ONLY=hartley,fence limits the views.
// Writes <outDir>/old_<name>.png and new_<name>.png, and stats.json.

import fs from 'fs';
import path from 'path';
import os from 'os';

const [, , base = 'http://localhost:5199', outDir = '.', which = 'both', extra = ''] = process.argv;

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

// spot: a review spot (chase camera). cam/look: pinned camera, [x, up, y]
// relative to the ground there.
const VIEWS = [
  { name: 'ashford', spot: 'ashford' },
  { name: 'forest', spot: 'forest' },
  { name: 'hartley', spot: 'hartley' },
  { name: 'slope', spot: 'slope' },
  { name: 'dirtroad', spot: 'dirtroad' },
  { name: 'building', spot: 'hartley', cam: [2668, 1.7, 452], look: [2692, 3.5, 424] },
  { name: 'fence', spot: 'hartley', cam: [2630, 1.8, 410], look: [2680, 3, 365] },
  { name: 'tower', spot: 'ashford', cam: [1560, 2, 2335], look: [1530, 12, 2300] },
];

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

for (const mode of which === 'both' ? ['old', 'new'] : [which]) {
  for (const v of VIEWS.filter((w) => !process.env.ONLY || process.env.ONLY.split(',').includes(w.name))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${mode} ${v.name}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${mode} ${v.name}: ${e}`));
    const q = `stats&res=1&spot=${v.spot}${mode === 'old' ? '&look=old' : ''}${extra ? `&${extra}` : ''}`;
    await page.goto(`${base}/three.html?${q}`);
    await page.waitForSelector('button');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 180000 });
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
          world3d.sky.position.copy(c.position); // the sky dome follows the camera
          orig(s, c);
        };
      }, v);
    }
    await page.waitForTimeout(3500);
    const file = path.join(outDir, `${mode}_${v.name}.png`);
    await page.screenshot({ path: file });
    const st = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) => /calls \d+/.test(d.textContent) && d.style.position === 'fixed');
      return el ? el.textContent.split('\n').filter((l) => /calls/.test(l)).join(' | ') : null;
    });
    allStats[`${mode}_${v.name}`] = st;
    console.log(file, st);
    await page.close();
  }
}
fs.writeFileSync(statsFile, JSON.stringify(allStats, null, 1));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
