// Dev tool: the win screen and the share postcard (#81) for each mission.
// Needs a running dev server. Opens ?shifts=now (src3/devShifts.js), which
// goes straight to the win screen with sample pencil marks, screenshots it,
// then presses the postcard button (when there is one) and saves the PNG
// the player would download.
//
//   node tools/shots-postcard.mjs <url> <outDir> <prefix> [missionIds]
//   e.g. node tools/shots-postcard.mjs http://localhost:5297 /tmp/shots after

import fs from 'fs';
import path from 'path';
import { launchChromium } from './browser.mjs';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'shot', only = 'm1_parcel,m2_cabin,m3_airfield'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const browser = await launchChromium();
for (const id of only.split(',')) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 }, acceptDownloads: true });
  page.on('pageerror', (e) => console.log('pageerror', id, e.message));
  await page.goto(`${base}/three.html?opening=off&shifts=now&mission=${id}`);
  await page.waitForSelector('button', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.hud-win', { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, `${prefix}_win_${id}.png`) });
  // A plausible trip for the card (?shifts=now jumps straight to the end).
  await page.evaluate(() => {
    const st = window.__state;
    st.elapsedMs = 754000;
    st.odometer = 8530;
    st.tows = 2;
    for (const id of ['a', 'b', 'c']) st.talkedTo.add(id);
  });
  const btn = await page.$('.hud-win-card');
  if (btn) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), btn.click()]);
    const file = path.join(outDir, `${prefix}_postcard_${id}.png`);
    await dl.saveAs(file);
    console.log(id, 'postcard', dl.suggestedFilename(), '->', file);
  } else console.log(id, 'no postcard button');
  await page.close();
}
await browser.close();
