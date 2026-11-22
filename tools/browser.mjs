// Shared by the browser tools (shots, check-boot): find Playwright and a
// Chromium without adding them to package.json. Locally they come from any
// earlier `npx playwright`; in CI from `npx -y playwright@1.65.1 install chromium`.

import fs from 'fs';
import path from 'path';
import os from 'os';

function findPlaywright() {
  const root = path.join(os.homedir(), '.npm/_npx');
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const p = path.join(root, d, 'node_modules/playwright-core/index.js');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('playwright-core not found under ~/.npm/_npx (run: npx -y playwright@1.65.1 install chromium)');
}

function findChrome() {
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('chromium not found under ~/.cache/ms-playwright');
}

// Chromium with software WebGL, so it runs with no GPU.
export async function launchChromium() {
  const pw = await import(findPlaywright());
  const { chromium } = pw.default || pw;
  return chromium.launch({
    executablePath: findChrome(),
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
}
