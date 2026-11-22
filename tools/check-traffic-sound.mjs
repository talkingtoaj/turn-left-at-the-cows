// Checks the traffic engine sound rules (SPEC 9q, #39): diesel on trucks and
// pickups, petrol on cars; each vehicle sounds from where it is (pan, level,
// highs) and pitches down as it passes, frame after frame.
//   node tools/check-traffic-sound.mjs
import { engineOf, pickHeard, passBy, doppler, idPitch, HEAR_R, MAX_VOICES } from '../src/audio/trafficSound.js';

let bad = 0;
const ok = (name, cond, info = '') => {
  if (!cond) bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? `: ${info}` : ''}`);
};
const f = (x) => x.toFixed(3);

// Engines by type.
ok('pickup is diesel', engineOf('pickup') === 'diesel');
ok('farm truck is diesel', engineOf('farmtruck') === 'diesel');
ok('sedan, wagon, hatch are petrol', ['sedan', 'wagon', 'hatch'].every((t) => engineOf(t) === 'petrol'));

// You stand still at the origin, facing north. A car drives east along
// y = -6 (6 m ahead of you) at 20 m/s, frame by frame.
const ear = { x: 0, y: 0, heading: 0 };
const frames = [];
for (let x = -150; x <= 150; x += 2) {
  const v = { id: 'car0', x, y: -6, heading: 90, speed: 20 };
  frames.push({ x, ...passBy(ear, 0, v, 'petrol') });
}
const at = (x) => frames.find((p) => p.x === x);
const coming = at(-40);
const going = at(40);
ok('coming: pitched up (Doppler over 1)', doppler(ear, 0, { x: -40, y: -6, heading: 90, speed: 20 }) > 1.04);
ok('going: pitched down (Doppler under 1)', doppler(ear, 0, { x: 40, y: -6, heading: 90, speed: 20 }) < 0.96);
ok('it pitches down as it passes', coming.rate > going.rate, `${f(coming.rate)} then ${f(going.rate)}`);
let falling = true;
for (let i = 1; i < frames.length; i++) if (frames[i].rate > frames[i - 1].rate + 1e-9) falling = false;
ok('the pitch only ever falls through the pass', falling);
ok('the drop is a few semitones, not a siren', coming.rate / going.rate < 1.3 && coming.rate / going.rate > 1.08, f(coming.rate / going.rate));
ok('louder as it comes closer', at(-20).gain > at(-60).gain && at(0).gain > at(-20).gain);
ok('quieter as it goes away', at(60).gain < at(20).gain);
ok('loudest when beside you', frames.every((p) => p.gain <= at(0).gain + 1e-9));
ok('brighter close up', at(0).lowpass > at(-80).lowpass);
ok('heard from the left while coming from the west', at(-40).pan < -0.3, f(at(-40).pan));
ok('heard from the right once past to the east', at(40).pan > 0.3, f(at(40).pan));
ok('in front of you it is nearly centred', Math.abs(at(0).pan) < 0.05, f(at(0).pan));
ok('silent at the edge of hearing', passBy(ear, 0, { id: 'car0', x: HEAR_R + 1, y: 0, heading: 90, speed: 20 }, 'petrol').gain === 0);
ok('fades in gently near the edge', at(-150).gain < at(-110).gain * 0.5);

// Diesel versus petrol, same place and speed.
const v0 = { id: 'car2', x: 0, y: -20, heading: 90, speed: 15 };
const dz = passBy(ear, 0, v0, 'diesel');
const pz = passBy(ear, 0, v0, 'petrol');
ok('the diesel is louder than the quiet petrol hum', dz.gain > pz.gain * 1.5, `${f(dz.gain)} vs ${f(pz.gain)}`);
ok('faster sounds higher (more RPM)', passBy(ear, 0, { ...v0, speed: 22 }, 'petrol').rate > passBy(ear, 0, { ...v0, speed: 5 }, 'petrol').rate);
ok('a stopped car still idles', passBy(ear, 0, { ...v0, speed: 0 }, 'diesel').gain > 0);
ok('a tractor sounds lower than a diesel truck', passBy(ear, 0, v0, 'tractor').rate < dz.rate);

// You drive too: an oncoming car you meet head on drops further than one
// passing you while you stand.
const meet = (earSpeed) => {
  const e = { x: 0, y: 0, heading: 0 };
  const a = { id: 'car0', x: 3, y: -40, heading: 180, speed: 20 };
  const b = { id: 'car0', x: 3, y: 40, heading: 180, speed: 20 };
  return passBy(e, earSpeed, a, 'petrol').rate / passBy(e, earSpeed, b, 'petrol').rate;
};
ok('meeting at speed drops more than standing still', meet(20) > meet(0), `${f(meet(20))} vs ${f(meet(0))}`);

// Pitch per vehicle stays in a small band and differs between ids.
ok('pitch per vehicle stays within 6%', ['car0', 'car1', 'car9', 'hz_truck_3'].every((id) => Math.abs(idPitch(id) - 1) <= 0.06));
ok('two cars differ a little', idPitch('car1') !== idPitch('car2'));

// Only the nearest few are heard.
const many = Array.from({ length: 10 }, (_, i) => ({ id: `car${i}`, x: 10 + i * 15, y: 0, heading: 0, speed: 10 }));
const heard = pickHeard(ear, many);
ok(`at most ${MAX_VOICES} heard`, heard.length === MAX_VOICES);
ok('nearest first', heard[0].id === 'car0' && heard[MAX_VOICES - 1].id === `car${MAX_VOICES - 1}`);
ok('none out of earshot', pickHeard(ear, [{ id: 'x', x: HEAR_R + 5, y: 0 }]).length === 0);
// Next frame the far ones come close: the heard set follows.
const moved = many.map((v, i) => ({ ...v, x: 300 - i * 30 }));
ok('the heard set follows as cars move', pickHeard(ear, moved)[0].id === 'car9');

if (bad) {
  console.log(`${bad} failed`);
  process.exit(1);
}
console.log('all ok');
