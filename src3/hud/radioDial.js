// The radio's tuning dial, drawn inside the dash slot (#hud-radio-slot, 58 x 52).
//   top row    power lamp (click to switch on / off) and the dial number
//   middle     the scale with a needle: click or drag to tune; the two
//              stations have a small notch each (the dial leans toward one)
// Keys (src3/main.js): T power, comma / period tune (Shift: bigger steps).
// The slot's own "RADIO" label sits along its bottom edge.

import { DIAL_MIN, DIAL_MAX } from '../../src/radio/radioLogic.js';

const STYLE = `
.rdial { position: absolute; inset: 0; pointer-events: auto; user-select: none; touch-action: none; }
.rdial-top { position: absolute; left: 4px; right: 4px; top: 3px; height: 14px; display: flex; align-items: center;
  justify-content: space-between; cursor: pointer; }
.rdial-lamp { width: 7px; height: 7px; border-radius: 50%; background: #3a2a22; box-shadow: inset 0 0 2px #000; }
.rdial.rdial-on .rdial-lamp { background: #ffb347; box-shadow: 0 0 5px #ff9d2e, inset 0 0 1px #fff3; }
.rdial-num { font: 500 12px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.04em; color: #5c564a; }
.rdial.rdial-on .rdial-num { color: #ffcf7a; text-shadow: 0 0 4px rgba(255,170,60,0.6); }
.rdial-scale { position: absolute; left: 4px; right: 4px; top: 19px; height: 18px; border-radius: 3px; cursor: ew-resize;
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
  root.title = 'Radio: T on / off, comma and period to tune';
  const top = div('rdial-top', root);
  const lamp = div('rdial-lamp', top);
  const num = div('rdial-num', top);
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
  top.addEventListener('click', () => radio.toggle());

  // Tuning: click or drag along the scale. Near a station it settles on it.
  let dragging = false;
  const tuneTo = (e) => {
    const r = scale.getBoundingClientRect();
    const f = DIAL_MIN + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (DIAL_MAX - DIAL_MIN);
    let snap = Math.round(f / 10) * 10;
    for (const st of radio.stations) if (Math.abs(f - st.freqKhz) < 14) snap = st.freqKhz;
    radio.setFreq(snap);
    if (!radio.on) radio.setOn(true);
  };
  scale.addEventListener('pointerdown', (e) => {
    dragging = true;
    scale.setPointerCapture?.(e.pointerId);
    tuneTo(e);
    e.preventDefault();
  });
  scale.addEventListener('pointermove', (e) => { if (dragging) tuneTo(e); });
  const up = () => { dragging = false; };
  scale.addEventListener('pointerup', up);
  scale.addEventListener('pointercancel', up);

  let lastFreq = -1;
  let lastOn = null;
  return {
    update() {
      if (radio.on !== lastOn) {
        lastOn = radio.on;
        root.classList.toggle('rdial-on', lastOn);
      }
      if (radio.freq !== lastFreq) {
        lastFreq = radio.freq;
        needle.style.left = frac(lastFreq) + '%';
        num.textContent = String(Math.round(lastFreq));
      }
    },
  };
}
