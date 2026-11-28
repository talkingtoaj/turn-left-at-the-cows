// Dev tool (#95): shots of the road crew, plus draw calls and triangles from ?stats.
// Needs a running dev server.
//
//   node tools/shots-roadcrew.mjs <url> <outDir> <prefix>
//   SHOTS_QUERY='opening=off&showpieces=off' for the same views without the crew
//
// The car stands on Highway 9 near the crew; the dig loop is held at a chosen
// second (__crew.seek) so before and after views match.

import fs from 'fs';
import path from 'path';
import { launchChromium } from './browser.mjs';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'crew', only = ''] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

// car: crew-local [u, off] and heading offset; cam/look: crew-local [u, up, off].
const VIEWS = [
  { name: 'chase_far', car: [-70, 2.25], t: 1.7 },
  { name: 'chase_near', car: [-30, 2.25], t: 5.2 },
  { name: 'chase_pass', car: [-16, 2.25], t: 7.8 },
  { name: 'chase_abreast', car: [3, 2.25], t: 1.7 },
  { name: 'foot_dig', car: [-30, 2.25], cam: [-9, 1.7, 3.2], look: [0, 1.4, 8.4], t: 1.7 },
  { name: 'foot_scoop', car: [-30, 2.25], cam: [-9, 1.7, 3.2], look: [0, 1.6, 8.0], t: 3.6 },
  { name: 'foot_dump', car: [-30, 2.25], cam: [-8, 1.7, 3.4], look: [3, 2.2, 6.2], t: 7.8 },
  { name: 'foot_worker', car: [-30, 2.25], cam: [-22, 1.6, 3.4], look: [-13, 1.3, 5.0], t: 1.7 },
  { name: 'foot_truck', car: [-30, 2.25], cam: [18, 1.7, 3.0], look: [7, 1.8, 6.0], t: 8.0 },
  { name: 'wide', car: [-30, 2.25], cam: [-26, 14, -9], look: [2, 0.5, 6.5], t: 5.2 },
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/three.html?stats&res=1&${process.env.SHOTS_QUERY || 'opening=off&showpieces=on'}`);
await page.waitForSelector('button');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
async function dismissCards() {
  for (let k = 0; k < 3; k++) {
    const btn = page.locator('button:visible', { hasText: /^(Start|Okay)$/ });
    if (!(await btn.count())) break;
    await btn.first().click();
    await page.waitForTimeout(800);
  }
}
await dismissCards();

const stats = {};
for (const v of VIEWS.filter((w) => !only || only.split(',').includes(w.name))) {
  await page.evaluate(async (v) => {
    const { WORLD } = await import('/src/world/world.js');
    const { crewFrame, crewToWorld } = await import('/src/world/roadcrew.js');
    const F = crewFrame(WORLD);
    const st = window.__state;
    const c0 = crewToWorld(F, v.car[0], v.car[1]);
    st.car.x = c0.x;
    st.car.y = c0.y;
    st.car.heading = F.heading;
    st.car.speed = 0;
    const crew = window.__crew;
    if (crew) { crew.freeze = true; crew.seek(v.t); }
    const { renderer, camera, world3d } = window.__three;
    if (!renderer.__orig) renderer.__orig = renderer.render.bind(renderer);
    const H = (p) => world3d.terrain.heightAt(p.x, p.y);
    renderer.render = (s, c) => {
      if (v.cam) {
        const p = crewToWorld(F, v.cam[0], v.cam[2]);
        c.position.set(p.x, H(p) + v.cam[1], p.y);
        c.up.set(0, 1, 0);
        const q = crewToWorld(F, v.look[0], v.look[2]);
        c.lookAt(q.x, H(q) + v.look[1], q.y);
        c.updateMatrixWorld();
      }
      renderer.__orig(s, c);
    };
  }, v);
  await page.waitForTimeout(3000);
  await dismissCards();
  const file = path.join(outDir, `${prefix}_${v.name}.png`);
  await page.screenshot({ path: file });
  stats[v.name] = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /calls \d+/.test(d.textContent) && d.style.position === 'fixed');
    const crew = window.__crew;
    return (el ? el.textContent.split('\n').filter((l) => /calls/.test(l)).join(' | ') : null) + (crew ? ` | crew shown ${crew.shown} wave ${crew.wave.toFixed(2)}` : ' | no crew');
  });
  console.log(file, stats[v.name]);
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
