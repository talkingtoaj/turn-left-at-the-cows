// Checks the words painted on signs: km in world data shows as miles.
//   node tools/check-sign-text.mjs
import assert from 'node:assert/strict';
import { signLineText, signSize, signStyle } from '../src3/world3d/signtext.js';

assert.equal(signLineText('Calder 2.5 km'), 'Calder 1½ mi');
assert.equal(signLineText('Dunmore 1 km'), 'Dunmore ½ mi');
assert.equal(signLineText('Brandt 22 km'), 'Brandt 13½ mi');
assert.equal(signLineText('Corley 33 km'), 'Corley 20½ mi');
assert.equal(signLineText('FORD'), 'FORD');
assert.ok(signSize(['A']).w >= 1.6);
assert.ok(signSize(['→ Quarry Road, Route 40', '↑ Ridge Road']).w <= 6.6);
assert.equal(signStyle(['BRIDGE OUT', 'ROAD CLOSED']).board, 0xe07b20);
console.log('sign text OK');
