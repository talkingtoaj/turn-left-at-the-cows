// The radio's dial, drawn inside the dash slot (#hud-radio-slot, 58 x 52).
//   top row    power lamp and the dial number (click either to switch on / off),
//              and the volume knob on the right
//   middle     the scale with a needle; the two stations have a small notch each
// The dial is a display only: the radio tunes itself (src/radio/radio.js), so the
// needle and number move on their own when it sweeps to another station.
// Volume knob: drag it (up or right is louder) or roll the mouse wheel over the
// radio. Turning it up switches the radio on. For a moment after a change the
// number shows the volume. At 0% the lamp goes dark, as if off.
// Keys (src3/main.js): T power.
// The slot's own "RADIO" label sits along its bottom edge.

import { DIAL_MIN, DIAL_MAX } from '../../src/radio/radioLogic.js';

const KNOB_SWEEP = 270; // degrees the knob turns from 0% to 100%
const DRAG_PX = 80; // pixels of drag for the full range
const WHEEL_STEP = 0.05;
const SHOW_VOLUME_MS = 1200;

const STYLE = `
.rdial { position: absolute; inset: 0; pointer-events: auto; user-select: none; touch-action: none; }
.rdial-top { position: absolute; left: 4px; right: 3px; top: 2px; height: 15px; display: flex; align-items: center;
  justify-content: space-between; }
.rdial-power { display: flex; align-items: center; gap: 4px; height: 100%; cursor: pointer; }
.rdial-lamp { width: 7px; height: 7px; border-radius: 50%; background: #3a2a22; box-shadow: inset 0 0 2px #000; flex: none; }
.rdial.rdial-on .rdial-lamp { background: #ffb347; box-shadow: 0 0 5px #ff9d2e, inset 0 0 1px #fff3; }
.rdial-num { font: 500 12px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.02em; color: #5c564a; min-width: 24px; }
.rdial.rdial-on .rdial-num { color: #ffcf7a; text-shadow: 0 0 4px rgba(255,170,60,0.6); }
.rdial-knob { position: relative; width: 13px; height: 13px; flex: none; border-radius: 50%; cursor: ns-resize;
  background: radial-gradient(circle at 40% 35%, #77705f, #3a3630 55%, #1d1b18 100%);
  box-shadow: 0 1px 1px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(0,0,0,0.5); }
.rdial-ptr { position: absolute; left: 50%; top: 1px; width: 2px; height: 5px; margin-left: -1px; border-radius: 1px;
  background: #b9b09a; transform-origin: 50% 5.5px; }
.rdial.rdial-on .rdial-ptr { background: #ffcf7a; }
.rdial-scale { position: absolute; left: 4px; right: 4px; top: 19px; height: 18px; border-radius: 3px;
  background: #14110e; box-shadow: inset 0 0 3px #000; overflow: hidden; }
.rdial-ticks { position: absolute; inset: 0; }
.rdial-tick { position: absolute; bottom: 0; width: 1px; height: 5px; background: #6c6454; }
.rdial-tick.rdial-big { height: 8px; background: #8d846f; }
.rdial-st { position: absolute; top: 2px; width: 3px; height: 3px; margin-left: -1px; border-radius: 50%; background: #6c6454; }
.rdial.rdial-on .rdial-st { background: #ffcf7a; }
.rdial-needle { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #d9432f;
  box-shadow: 0 0 3px rgba(255,80,50,0.7); }
.rdial:not(.rdial-on) .rdial-needle { background: #7a3a30; box-shadow: none; }
`;

let styled = false;
const div = (cls, parent) => {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
};

// radio: from src/radio/radio.js. Returns { update() }, called every frame.
export function createRadioDial(slot, radio) {
  if (!slot) return { update() {} };
  if (!styled) {
    styled = true;
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }
  const root = div('rdial', slot);
  root.title = 'Radio: T on / off, the knob for volume. It finds the station by itself.';
  const top = div('rdial-top', root);
  const power = div('rdial-power', top);
  div('rdial-lamp', power);
  const num = div('rdial-num', power);
  const knob = div('rdial-knob', top);
  const ptr = div('rdial-ptr', knob);
  const scale = div('rdial-scale', root);
  const ticks = div('rdial-ticks', scale);
  const frac = (f) => ((f - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 100;
  for (let f = 600; f <= 1600; f += 100) {
    const t = div('rdial-tick' + (f % 500 === 0 ? ' rdial-big' : ''), ticks);
    t.style.left = frac(f) + '%';
  }
  for (const st of radio.stations) {
    const d = div('rdial-st', ticks);
    d.style.left = frac(st.freqKhz) + '%';
  }
  const needle = div('rdial-needle', scale);

  // Power: the lamp and number.
  power.addEventListener('click', () => radio.toggle());

  // Volume: drag the knob, or roll the wheel anywhere over the radio.
  let drag = null;
  knob.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, v: radio.volume };
    knob.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  knob.addEventListener('pointermove', (e) => {
    if (!drag) return;
    radio.setVolume(drag.v + (drag.y - e.clientY + e.clientX - drag.x) / DRAG_PX);
  });
  const up = () => { drag = null; };
  knob.addEventListener('pointerup', up);
  knob.addEventListener('pointercancel', up);
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY) radio.nudgeVolume(e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
  }, { passive: false });

  const knobAngle = (v) => 'rotate(' + (v - 0.5) * KNOB_SWEEP + 'deg)';
  let lastFreq = -1;
  let lastLit = null;
  let lastVol = radio.volume;
  ptr.style.transform = knobAngle(lastVol);
  let volUntil = 0;
  let showing = '';
  return {
    update() {
      if (radio.lit !== lastLit) {
        lastLit = radio.lit;
        root.classList.toggle('rdial-on', lastLit);
      }
      const vol = radio.volume;
      if (vol !== lastVol) {
        lastVol = vol;
        volUntil = performance.now() + SHOW_VOLUME_MS;
        ptr.style.transform = knobAngle(vol);
      }
      if (radio.freq !== lastFreq) {
        lastFreq = radio.freq;
        needle.style.left = frac(lastFreq) + '%';
      }
      const text = performance.now() < volUntil ? Math.round(vol * 100) + '%' : String(Math.round(lastFreq / 10) * 10);
      if (text !== showing) {
        showing = text;
        num.textContent = text;
      }
    },
  };
}
