// Dev: list fields (kind, crop, centre, size) and landmarks. node tools/dev-fields.mjs
import { WORLD } from '../src/world/world.js';

for (const f of WORLD.fields) {
  const xs = f.polygon.map((p) => p[0]);
  const ys = f.polygon.map((p) => p[1]);
  const cx = xs.reduce((a, b) => a + b) / xs.length;
  const cy = ys.reduce((a, b) => a + b) / ys.length;
  console.log(f.id, f.kind, f.crop || '', f.animals ? f.animals.kind : '', Math.round(cx), Math.round(cy), Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys)), f.rowAngle, f.farm || '');
}
console.log(Object.keys(WORLD));
console.log(WORLD.landmarks.map((l) => `${l.id}:${l.kind}@${l.x},${l.y}`).join(' '));
