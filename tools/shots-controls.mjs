// Dev tool: screenshots for the controls list (#88): the start screen's
// How to play sheet, the hint bar, and the map screen (with the Help tab when
// it exists). Needs a running dev server.
//
//   node tools/shots-controls.mjs <url> <outDir> <prefix>

import fs from 'fs';
import { launchChromium } from './browser.mjs';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'controls'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/three.html?opening=off`);
await page.waitForSelector('button');
await page.getByText('How to play', { exact: true }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/${prefix}-start.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^PLAY/i }).first().click();
await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
for (let k = 0; k < 3; k++) {
  const btn = page.locator('button:visible', { hasText: /^(Start|Okay)$/ });
  if (!(await btn.count())) break;
  await btn.first().click();
  await page.waitForTimeout(800);
}
await page.screenshot({ path: `${outDir}/${prefix}-hints.png` });
await page.keyboard.press('m');
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/${prefix}-map.png` });
// The Help tab (if there is one): click it by its place on the 960 x 640 sheet.
const tab = await page.evaluate(() => (window.__map?.tabs().find((t) => t.id === 'help') || null));
if (tab) {
  const r = await page.locator('canvas.map-canvas').boundingBox();
  await page.mouse.click(r.x + (tab.x + tab.w / 2) * (r.width / 960), r.y + tab.y * (r.height / 640));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${prefix}-map-help.png` });
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'ok');
