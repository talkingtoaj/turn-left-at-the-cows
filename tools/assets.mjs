#!/usr/bin/env node
// Our own art and sound live in a private bucket, not in git (assets.txt).
//
//   npm run assets          pull them from the bucket into public/ (needs gcloud
//                           and read access to the bucket)
//   npm run assets:push     upload the ones on disk to the bucket
//   npm run check:assets    fail if any of them is tracked by git (part of
//                           check:all); list any missing on disk
//
// Bucket: ASSETS_BUCKET env var, else turn-left-at-the-cows-assets. Paths in
// the bucket match the repo paths (gs://<bucket>/public/radio/...).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = process.env.ASSETS_BUCKET || 'turn-left-at-the-cows-assets';
const entries = fs
  .readFileSync(path.join(ROOT, 'assets.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function run(cmd, args) {
  console.log('$ ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(r.error ? r.error.message : `${cmd} exited ${r.status}`);
    process.exit(1);
  }
}

const mode = process.argv[2] || 'check';

if (mode === 'pull') {
  // The bucket holds only these files, so one rsync of public/ brings them all.
  // No delete flag: files already on disk that the bucket lacks are kept.
  run('gcloud', ['storage', 'rsync', '--recursive', `gs://${BUCKET}/public`, 'public']);
} else if (mode === 'push') {
  for (const e of entries) {
    const local = path.join(ROOT, e);
    if (!fs.existsSync(local)) {
      console.warn('skip, not on disk: ' + e);
      continue;
    }
    if (e.endsWith('/')) run('gcloud', ['storage', 'rsync', '--recursive', e.slice(0, -1), `gs://${BUCKET}/${e.slice(0, -1)}`]);
    else run('gcloud', ['storage', 'cp', e, `gs://${BUCKET}/${e}`]);
  }
} else if (mode === 'check') {
  const tracked = spawnSync('git', ['ls-files', '--', ...entries], { cwd: ROOT, encoding: 'utf8' });
  if (tracked.status !== 0) {
    console.error('check:assets: git ls-files failed');
    process.exit(1);
  }
  const bad = tracked.stdout.split('\n').filter(Boolean);
  if (bad.length) {
    console.error('check:assets: these are ours and must not be in git (see assets.txt):\n  ' + bad.join('\n  '));
    process.exit(1);
  }
  const missing = entries.filter((e) => !fs.existsSync(path.join(ROOT, e)));
  if (missing.length) console.log('check:assets: not on disk (run `npm run assets` to get them): ' + missing.join(', '));
  console.log(`check:assets: ok, none of the ${entries.length} entries in assets.txt is tracked`);
} else {
  console.error('usage: node tools/assets.mjs pull | push | check');
  process.exit(1);
}
