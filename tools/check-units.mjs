// Checks the display-units helper (src/units.js).  node tools/check-units.mjs
import assert from 'node:assert/strict';
import * as U from '../src/units.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

near(U.mphFromMps(0), 0);
near(U.mphFromMps(20), 44.7387, 1e-3);
assert.equal(U.mphText(20), '45 mph');
near(U.milesFromMetres(1609.344), 1);
near(U.feetFromMetres(1), 3.2808399, 1e-6);
near(U.odometerHundredths(1609.344), 100);
assert.equal(U.milesText(5500), '3.4 mi');
assert.equal(U.milesText(5500, 2), '3.42 mi');
assert.equal(U.feetText(91.44), '300 ft');
assert.equal(U.shortDistanceText(91.44), '300 ft');
assert.equal(U.shortDistanceText(4000), '2.5 mi');
assert.equal(U.signMiles(10), 0.5);
assert.equal(U.signMilesText(10), '½');
assert.equal(U.signMilesText(1609), '1');
assert.equal(U.signMilesText(4023), '2½');
assert.equal(U.signMilesText(3300), '2');
assert.equal(U.signMilesText(16093), '10');
console.log('check-units: ok');
