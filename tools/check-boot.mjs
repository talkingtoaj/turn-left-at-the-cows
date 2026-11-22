// Starts the 3D game in a headless browser and fails if it throws on the way
// in. check:all never loads the scene, so a crash at start-up passed it once.
//
//   npm run check:boot
//
// Starts its own Vite server. Missing private assets (assets.txt) only cause
// failed loads, which are ignored; uncaught errors and console errors fail.

import { createServer } from 'vite';
import { launchChromium } from './browser.mjs';

const RUN_MS = 6000; // frames to run after the scene is up

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await launchChromium();
const errors = [];
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.stack || e}`));
  page.on('console', (m) => {
    const t = m.text();
    // The menu loads the game behind it and catches a failure as a warning (src3/boot.js).
    if (m.type() === 'warning' && /could not load/.test(t)) errors.push(`load failed: ${t}`);
    if (m.type() !== 'error') return;
    if (/Failed to load resource|404|net::ERR_/.test(t)) return; // private assets absent
    errors.push(`console: ${t}`);
  });
  // Mission 1 with its weather opening, as a new player sees it.
  await page.goto(`${base}/three.html`);
  await page.waitForSelector('button', { timeout: 60000 });
  await page.keyboard.press('Enter');
  // Wait for the scene, but stop as soon as an error shows up.
  const until = Date.now() + 180000;
  while (!(await page.evaluate(() => !!(window.__three && window.__state)))) {
    if (errors.length) throw new Error('error before the scene came up');
    if (Date.now() > until) throw new Error('scene not up after 180 s');
    await page.waitForTimeout(500);
  }
  const startFrame = await page.evaluate(() => window.__three.renderer.info.render.frame);
  await page.keyboard.press('Enter'); // close the mission card
  await page.waitForTimeout(RUN_MS);
  const frames = (await page.evaluate(() => window.__three.renderer.info.render.frame)) - startFrame;
  if (frames < 2) errors.push(`only ${frames} frames drawn in ${RUN_MS / 1000} s`);
  ok = errors.length === 0;
  console.log(`check:boot: scene up, ${frames} frames drawn`);
} catch (e) {
  errors.push(String(e));
} finally {
  await browser.close();
  await server.close();
}
if (!ok) {
  console.error('check:boot FAILED');
  for (const e of errors) console.error(' ', e);
  process.exit(1);
}
console.log('check:boot: ok, no errors');
