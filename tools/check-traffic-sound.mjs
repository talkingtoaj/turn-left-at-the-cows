// Checks the traffic engine sound rules (SPEC 9q, #39): diesel on trucks and
// pickups, petrol on cars; each vehicle sounds from where it is (pan, level,
// highs) and pitches down as it passes, frame after frame.
//   node tools/check-traffic-sound.mjs
import { engineOf, pickHeard, passBy, doppler, idPitch, HEAR_R, MAX_VOICES, pickCrunch, crunchBy, CRUNCH_R, MAX_CRUNCH } from '../src/audio/trafficSound.js';

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

// Gravel crunch under traffic tires (#49).
const dirtCar = { id: 'car3', x: 0, y: -6, heading: 90, speed: 13.4, onDirt: true };
const paveCar = { ...dirtCar, onDirt: false };
ok('crunch on a dirt road', crunchBy(ear, 0, dirtCar).gain > 0.03, f(crunchBy(ear, 0, dirtCar).gain));
ok('no crunch on paved', crunchBy(ear, 0, paveCar).gain === 0 && pickCrunch(ear, [paveCar]).length === 0);
ok('no crunch when stopped', crunchBy(ear, 0, { ...dirtCar, speed: 0 }).gain === 0 && pickCrunch(ear, [{ ...dirtCar, speed: 0 }]).length === 0);
ok('crunch is a bed under the engine', crunchBy(ear, 0, dirtCar).gain < passBy(ear, 0, dirtCar, 'petrol').gain && crunchBy(ear, 0, dirtCar).gain < passBy(ear, 0, dirtCar, 'diesel').gain * 0.6,
  `${f(crunchBy(ear, 0, dirtCar).gain)} vs petrol ${f(passBy(ear, 0, dirtCar, 'petrol').gain)}`);
ok('faster crunches louder', crunchBy(ear, 0, { ...dirtCar, speed: 20 }).gain > crunchBy(ear, 0, { ...dirtCar, speed: 5 }).gain);
const cd = [6, 15, 30, 50, 69].map((y) => crunchBy(ear, 0, { ...dirtCar, y: -y }).gain);
ok('crunch fades with distance', cd.every((g, i) => i === 0 || g < cd[i - 1]), cd.map(f).join(' '));
ok('crunch fades to almost nothing at its edge', cd[4] < cd[0] * 0.02);
ok('silent past its range', crunchBy(ear, 0, { ...dirtCar, y: -(CRUNCH_R + 1) }).gain === 0 && pickCrunch(ear, [{ ...dirtCar, y: -(CRUNCH_R + 1) }]).length === 0);
ok('crunch is heard closer in than engines', CRUNCH_R < HEAR_R);
ok('crunch is panned like the car', crunchBy(ear, 0, { ...dirtCar, x: -20 }).pan < -0.3 && crunchBy(ear, 0, { ...dirtCar, x: 20 }).pan > 0.3);
// Frame by frame: a car comes along a paved road, turns onto dirt, passes
// you, brakes and stops. Crunch only once on dirt, then dies as it stops.
const run = [];
let car = { id: 'car4', x: -60, y: -6, heading: 90, speed: 13.4, onDirt: false };
for (let i = 0; i < 160; i++) {
  if (car.x > -40) car.onDirt = true;
  if (car.x > 20) car.speed = Math.max(0, car.speed - 0.5);
  car = { ...car, x: car.x + car.speed * 0.1 };
  run.push({ x: car.x, speed: car.speed, onDirt: car.onDirt, g: crunchBy(ear, 0, car).gain, n: pickCrunch(ear, [car]).length });
}
ok('frames: silent while on paved', run.filter((r) => !r.onDirt).every((r) => r.g === 0 && r.n === 0));
ok('frames: crunches once on dirt and rolling', run.filter((r) => r.onDirt && r.speed > 2).every((r) => r.g > 0 && r.n === 1));
const near = run.reduce((a, r) => (Math.abs(r.x) < Math.abs(a.x) ? r : a));
ok('frames: loudest as it passes', run.every((r) => r.g <= near.g + 1e-9));
ok('frames: dies down as it slows', run.filter((r) => r.x > 20 && r.speed > 0).every((r, i, a) => i === 0 || r.g <= a[i - 1].g + 1e-9));
ok('frames: silent once stopped', run[run.length - 1].speed === 0 && run[run.length - 1].g === 0 && run[run.length - 1].n === 0);
// Only the nearest few crunch, and the set follows as cars move.
const dirtMany = Array.from({ length: 8 }, (_, i) => ({ id: `car${i}`, x: 5 + i * 6, y: 0, heading: 0, speed: 10, onDirt: true }));
ok(`at most ${MAX_CRUNCH} cars crunch`, pickCrunch(ear, dirtMany).length === MAX_CRUNCH);
ok('the crunch voices are the nearest', pickCrunch(ear, dirtMany).map((v) => v.id).join() === 'car0,car1,car2');
const dirtMoved = dirtMany.map((v, i) => ({ ...v, x: 60 - i * 6, onDirt: i !== 7 }));
ok('next frame the crunch set follows (and skips the car now on paved)', pickCrunch(ear, dirtMoved).map((v) => v.id).join() === 'car6,car5,car4');

if (bad) {
  console.log(`${bad} failed`);
  process.exit(1);
}
console.log('all ok');
