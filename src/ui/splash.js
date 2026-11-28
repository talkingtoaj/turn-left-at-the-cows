// Start screen: the map on the passenger seat (SPEC 6h). Plain DOM, no game
// code, so it shows the moment the page opens. The top of the screen is a
// windshield: a painted country scene until the live world (src3/main.js
// preloadMenu) fades in behind it. Below it, the dash: a notepad with the
// jobs and the big Continue / Play button, and the paper map of Ashford
// County with the jobs pencilled on (./splashMap.js).
// Also holds the shared how-to-play content (the map screen's Help tab uses it).

import { injectUiStyle, el } from './style.js';
import { SPLASH_CSS } from './splashStyle.js';
import { mapSVG } from './splashMap.js';
import { MISSION_LIST } from '../game/missionList.js';
import { loadProgress, nextUnfinishedIndex, canSaveProgress } from '../game/progress.js';
import { timerText } from '../hud/format.js';
import { milesText } from '../units.js';
import { unlockAudio, sharedAudioContext, isMuted, setMuted, onMuteChange } from '../audio/context.js';
import { available as mapsAvailable } from '../net/mapsApi.js';
import { getRecords, recordRows } from '../net/records.js';
import { touristFor } from '../game/tourists.js';
import { tipsEnabled, setTipsEnabled } from '../game/tips.js';
import { WAKE_MS, MARKS, TURN_MS, CATCH_MS, CRANK_FROM_MS, startsWithKey, keyTurn, newChain, stepChain, restSway } from '../../src3/keystart.js';

export const TITLE = 'Turn Left at the Cows';
// Tagline is the owner's own words (SPEC 9p). The subline was removed (I10-splash-subline).
export const TAGLINE = "It's 1992, you have no GPS and a map five years out of date. Things have shifted in that time. You just might need to ask directions from the locals.";
export const PITCH = TAGLINE;
export const PITCH_LINE = 'GeoGuessr, but you drive, and the locals might be unreliable.';
export const SHORT_LINE = 'Get directions. Get lost. Find it anyway.';

const SEEN_KEY = 'askalocal.seenIntro';

// [bold start, rest]
export const STEPS = [
  ['You have a job to do.', ' Take something to a place you have never been.'],
  ['Ask the locals.', ' Stop, get out (F) and walk up to someone. Press E and they tell you the way. Click a name they say to ask about it. New names give you new things to ask.'],
  ['Look around.', ' On foot, look at a tower or a hill and press E: a local beside you will tell you what it is. Listen too: planes, bells and creeks all point somewhere.'],
  ['Draw your own map.', ' Press M and sketch what you heard. Your notebook keeps every word they said.'],
  ['Printed maps can lie.', ' Roads close, bridges wash out and names change. Trust what you see.'],
  ['Read the clues.', ' Road signs, the compass, the trip meter and the clock tell you where you are.'],
];

// [keys (or plain text for a mouse action), what it does, optional version it only applies to (unused since the 2D drop)]
export const CONTROLS = [
  [['Arrows', 'WASD'], 'Drive / walk'],
  [['F'], 'Get out of the car / back in'],
  ['Click and hold right mouse', 'Turn your head'], // plain text key cell, owner's words (#88)
  [['E'], 'Talk'],
  [['M'], 'Map'],
  [['T'], 'Radio on / off (it finds a station by itself)'],
  [['K'], 'Mute'],
  [['C'], 'Camera'],
  [['H'], 'Horn'],
];
// Still work, listed nowhere (owner, 2026-11-23, #88): Shift jogs, the mouse
// looks around on foot, Enter starts the next mission.

// Fills `parent` with the "how it works" list and the controls table.
export function renderHowTo(parent, version) {
  const cols = el('div', 'ui-cols', parent);
  const left = el('div', null, cols);
  el('h3', 'ui-h', left, 'How it works');
  const ol = el('ol', 'ui-steps', left);
  for (const [b, rest] of STEPS) {
    const li = el('li', null, ol);
    el('b', null, li, b);
    li.append(rest);
  }
  const right = el('div', null, cols);
  el('h3', 'ui-h', right, 'Controls');
  const table = el('table', 'ui-keys', right);
  for (const [keys, what, only] of CONTROLS) {
    const tr = el('tr', only && only !== version ? 'ui-off' : null, table);
    const k = el('td', null, tr);
    if (typeof keys === 'string') { k.textContent = keys; k.className = 'ui-mouse'; } // a mouse action, not a key
    else keys.forEach((key) => el('kbd', 'ui-kbd', k, key));
    el('td', null, tr, what);
  }
  // Tips on or off (src/game/tips.js), remembered in this browser.
  const tipRow = el('label', 'ui-tips', right);
  const box = el('input', null, tipRow);
  box.type = 'checkbox';
  box.checked = tipsEnabled();
  tipRow.append(' Show tips while I play');
  box.addEventListener('change', () => setTipsEnabled(box.checked));
  return cols;
}

// ---------- pictures (inline SVG, decorative) ----------

// The painted country seen through the windshield before the live world is in.
// A small padlock for jobs that aren't open yet.
const PADLOCK = '<svg viewBox="0 0 16 18" width="15" height="17"><path d="M4.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="2" y="8" width="12" height="9" rx="1.5" fill="currentColor"/></svg>';

const PAINTED = `<svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <path d="M0,150 C160,110 300,140 460,120 C640,96 780,130 960,110 C1060,100 1140,112 1200,104 L1200,300 L0,300 Z" fill="#9db08a"/>
  <path d="M0,190 C200,160 360,180 560,168 C760,156 900,176 1200,160 L1200,300 L0,300 Z" fill="#d9b45a"/>
  <path d="M0,232 C240,214 420,226 640,218 C860,210 1000,224 1200,214 L1200,300 L0,300 Z" fill="#8fa66f"/>
  <g fill="#5e7350"><circle cx="210" cy="150" r="16"/><circle cx="232" cy="146" r="20"/><circle cx="256" cy="152" r="14"/>
    <circle cx="880" cy="128" r="14"/><circle cx="900" cy="124" r="18"/></g>
  <g transform="translate(700 150)"><rect x="0" y="-26" width="38" height="26" fill="#b3261e"/><path d="M-4,-26 L19,-44 L42,-26 Z" fill="#7c1812"/></g>
  <g stroke="#4a4a48" stroke-width="2" fill="none"><path d="M1040,150 L1052,40 L1064,150 M1044,120 L1060,120 M1047,90 L1057,90 M1050,62 L1055,62"/></g>
  <circle cx="1052" cy="38" r="4" fill="#e04a3a"/>
  <g stroke="#6b5a42" stroke-width="3"><path d="M0,262 L1200,250"/><path d="M0,276 L1200,264"/>
    <path d="M60,250 v34 M200,248 v34 M340,246 v34 M480,245 v34 M620,244 v34 M760,242 v34 M900,240 v34 M1040,238 v34 M1180,236 v34"/></g>
</svg>`;

// A local leaning on a fence.
const LOCAL = `<svg viewBox="0 0 120 96" aria-hidden="true">
  <g stroke="#3a3128" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M4,62 L116,58"/><path d="M4,76 L116,72"/><path d="M14,54 v40 M60,52 v40 M106,50 v40"/>
  </g>
  <g fill="#3a3128">
    <path d="M44,58 C44,40 50,32 60,32 C70,32 76,40 76,58 Z" fill="#6f9fb8"/>
    <circle cx="60" cy="22" r="9" fill="#e2b48c"/>
    <path d="M46,16 L74,16 L70,10 L50,10 Z"/><rect x="42" y="15" width="36" height="3" rx="1"/>
    <path d="M46,56 L40,64 M74,56 L82,62" stroke="#e2b48c" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>`;

const ARROW = `<svg class="sp-arrow" viewBox="0 0 70 56" aria-hidden="true">
  <path d="M6,48 C30,50 52,40 54,12" fill="none" stroke="#4a4a48" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M44,20 L54,8 L62,22" fill="none" stroke="#4a4a48" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const PENCIL = `<svg class="sp-pencil" viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0,4 L330,4 L330,18 L0,18 Z" fill="#d9b45a"/><path d="M0,4 L330,4 L330,9 L0,9 Z" fill="#e6c574"/>
  <path d="M0,3 L22,3 L22,19 L0,19 Z" fill="#c9a6a0"/><path d="M22,3 L34,3 L34,19 L22,19 Z" fill="#9a9a96"/>
  <path d="M330,4 L380,11 L330,18 Z" fill="#e8d2a8"/><path d="M368,9.3 L380,11 L368,12.7 Z" fill="#3a3128"/>
</svg>`;

const COMPASS = `<svg class="sp-compass" viewBox="0 0 88 88" aria-hidden="true">
  <circle cx="44" cy="44" r="40" fill="#8c8f94"/><circle cx="44" cy="44" r="35" fill="#f1ead6" stroke="#4a4a48"/>
  <g stroke="#4a4a48" stroke-width="1.2"><path d="M44,12 v6 M44,70 v6 M12,44 h6 M70,44 h6"/></g>
  <text x="40" y="27" font-size="10" font-family="Oswald, sans-serif" fill="#3a3128">N</text>
  <g transform="rotate(-24 44 44)"><path d="M44,20 L49,44 L39,44 Z" fill="#b3261e"/><path d="M44,68 L49,44 L39,44 Z" fill="#4a4a48"/></g>
  <circle cx="44" cy="44" r="3" fill="#3a3128"/>
</svg>`;

// The ignition switch (#98), and the little instrument cluster that wakes when it turns.
const KEY_C = { x: 75, y: 70 }; // the bezel's centre in the key's drawing
const KEY_HOLE = 19; // how far the keychain's hole is from the centre, near one end of the head
const polar = (deg, r) => [KEY_C.x + r * Math.sin((deg * Math.PI) / 180), KEY_C.y - r * Math.cos((deg * Math.PI) / 180)];
// A 1980s ignition: chrome bezel set in the dash, OFF ACC ON START round it, a
// car key in the slot and a keychain hanging from it. From the driver's seat
// the key points at you, so only the plastic head shows, edge on, as a thick
// bar across the lock; the metal is inside. Not a button: it is only drawn,
// the game turns it.
const KEY = `<svg class="sp-keysvg" viewBox="0 0 150 186" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="spk-chrome" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f4f5f7"/><stop offset="0.45" stop-color="#a9adb3"/><stop offset="1" stop-color="#5d6065"/></radialGradient>
    <radialGradient id="spk-face" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#6a6d73"/><stop offset="1" stop-color="#2a2b2e"/></radialGradient>
    <linearGradient id="spk-head" x1="0" x2="1"><stop offset="0" stop-color="#3a3b40"/><stop offset="0.35" stop-color="#1d1e21"/><stop offset="1" stop-color="#101113"/></linearGradient>
    <linearGradient id="spk-fob" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#c0392f"/><stop offset="1" stop-color="#7a231c"/></linearGradient>
  </defs>
  <circle cx="75" cy="72" r="46" fill="#000" opacity="0.35"/>
  <circle cx="75" cy="70" r="42" fill="#151618"/>
  <circle cx="75" cy="70" r="39" fill="url(#spk-chrome)" stroke="#2c2d30" stroke-width="1"/>
  <circle cx="75" cy="70" r="31" fill="#17181a" stroke="#8b8f95" stroke-width="1.2"/>
  <circle cx="75" cy="70" r="20" fill="url(#spk-face)" stroke="#9a9ea4" stroke-width="1"/>
  ${MARKS.map((m) => {
    const [x1, y1] = polar(m.deg, 42.5), [x2, y2] = polar(m.deg, 48), [tx, ty] = polar(m.deg, 61);
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}" stroke="#d8d4c4" stroke-width="1.6" stroke-linecap="round"/><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="middle" font-family="Oswald, 'Arial Narrow', sans-serif" font-weight="600" font-size="9" letter-spacing="0.5" fill="#e8e3d0">${m.name}</text>`;
  }).join('')}
  <g class="sp-keyturn" transform="translate(75 70) rotate(${MARKS[0].deg})">
    <rect x="-4" y="-25" width="13" height="52" rx="6" fill="#000" opacity="0.45"/>
    <rect x="-5.5" y="-27" width="12" height="52" rx="6" fill="#08080a"/>
    <rect x="-6.5" y="-27.5" width="11" height="51" rx="5.5" fill="url(#spk-head)" stroke="#5a5d64" stroke-width="0.9"/>
    <path d="M-4.6,-21 V19" stroke="#6b6e75" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>
  </g>
  <g class="sp-chain" transform="translate(${polar(MARKS[0].deg, KEY_HOLE).map((v) => v.toFixed(2)).join(' ')})">
    <ellipse cx="0" cy="5" rx="4.4" ry="6" fill="none" stroke="#b9bdc3" stroke-width="1.5"/>
    <path d="M0,11 V17" stroke="#9a9ea4" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="0" cy="20" rx="2.4" ry="3.6" fill="none" stroke="#9a9ea4" stroke-width="1.3"/>
    <path d="M0,24 V28" stroke="#9a9ea4" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="-7.5" y="30" width="15" height="22" rx="5" fill="url(#spk-fob)" stroke="#4a130e" stroke-width="1"/>
    <circle cx="0" cy="35" r="1.8" fill="#2a0b08"/>
    <path d="M-4.5,40 C-4,45 -3,47 -2,48" fill="none" stroke="#f0a49a" stroke-width="1" opacity="0.6" stroke-linecap="round"/>
  </g>
</svg>`;
const GAUGE = (cls) => `<svg class="sp-gauge" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#101113" stroke="#55575c" stroke-width="2"/>
  <g stroke="#b9b6ac" stroke-width="1.5"><path d="M8,34 l3,-2 M6,24 h4 M10,13 l3,2 M24,6 v4 M38,13 l-3,2 M42,24 h-4 M40,34 l-3,-2"/></g>
  <g class="${cls}"><path d="M24,26 L24,9" stroke="#e04a3a" stroke-width="2" stroke-linecap="round"/></g><circle cx="24" cy="26" r="3" fill="#3a3c40"/></svg>`;

// ---------- small helpers ----------

function readFlag(key) {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch (e) {
    return false;
  }
}
function writeFlag(key) {
  try {
    globalThis.localStorage?.setItem(key, '1');
  } catch (e) {
    // fine
  }
}

// ---------- the screen ----------

// Shows the start screen. Returns:
//   { first, windshieldRect(), showWorld(), started: Promise }
// load(index) is awaited when the player starts; the screen then fades.
// phone: a touch-only device (keyboard game): show a note and a share
// button instead of Play.
// keystart: 'fly' | 'wake' | 'fade' | 'off' (src3/keystart.js keyStartMode).
// With fly or wake, load(index, { wake, setFly, rect }) gets a promise that
// settles when the dash has woken, a way to report the shot's progress, and
// the glass rectangle.
export function showSplash({ version = '3d', load, preferred = null, phone = false, keystart = 'off' }) {
  injectUiStyle();
  const style = document.createElement('style');
  style.dataset.owner = 'splash';
  style.textContent = SPLASH_CSS;
  document.head.appendChild(style);

  const done = loadProgress().missions;
  const anyDone = MISSION_LIST.some((m) => done[m.id]);
  const allDone = MISSION_LIST.every((m) => done[m.id]);
  const first = preferred ?? nextUnfinishedIndex(MISSION_LIST);

  const root = el('div', 'sp', document.body);
  root.id = 'splash';

  // Windshield.
  const top = el('header', 'sp-top', root);
  const glass = el('div', 'sp-glass', top);
  const paint = el('div', 'sp-paint', glass);
  paint.innerHTML = PAINTED;
  el('div', 'sp-glare', glass);
  el('div', 'sp-mirror', glass);
  const sign = el('div', 'sp-sign', glass);
  el('span', 'sp-pin', sign);
  const h1 = el('h1', null, sign);
  h1.append('Turn Left at the ');
  el('span', 'sp-cows', h1, 'Cows');
  sign.insertAdjacentHTML('beforeend', ARROW);
  el('p', null, sign, TAGLINE);

  // First visit: a local at a fence says the line, then goes. Never blocks.
  let local = null;
  if (!anyDone && !readFlag(SEEN_KEY) && !phone) {
    writeFlag(SEEN_KEY);
    local = el('div', 'sp-local', glass);
    local.innerHTML = LOCAL;
    const say = el('div', 'sp-say', local, '“Oh, you can’t miss it.”');
    const skip = el('button', 'sp-skip', say, 'Skip');
    skip.type = 'button';
    const gone = () => {
      if (!local) return;
      const l = local;
      local = null;
      l.classList.add('sp-gone');
      setTimeout(() => l.remove(), 600);
    };
    skip.addEventListener('click', gone);
    setTimeout(gone, 6500);
  }

  // Dash.
  const dash = el('main', 'sp-dash', root);
  const pad = el('section', 'sp-pad', dash);
  pad.setAttribute('aria-label', 'Your deliveries');
  const paper = el('div', 'sp-paper', pad);
  el('h2', null, paper, 'Deliveries out of Ashford');
  const list = el('ol', 'sp-jobs', paper);
  let start = null;
  const hot = (id, on) => {
    root.querySelectorAll(`[data-mission="${id}"]`).forEach((n) => n.classList.toggle('is-hot', on));
  };
  MISSION_LIST.forEach((m, i) => {
    const rec = done[m.id];
    // A job opens once the one before it is done (or it's the one Continue plays).
    const locked = !rec && i !== first && i > 0 && !done[MISSION_LIST[i - 1].id];
    const li = el('li', rec ? 'done' : locked ? 'locked' : null, list);
    li.dataset.mission = m.id;
    const mark = el('span', 'sp-mark', li, rec ? '✓' : i === first ? '○' : locked ? '' : String(i + 1));
    if (locked) mark.innerHTML = PADLOCK;
    mark.setAttribute('aria-hidden', 'true');
    const name = el('span', 'sp-jname', li, m.title);
    if (rec) el('span', 'sp-jbest', name, `best ${timerText(rec.bestMs)}, ${milesText(rec.bestDistance)}`);
    el('span', 'sp-sr', name, rec ? ' (done)' : i === first ? ' (next)' : locked ? ' (locked: finish the one before it first)' : '');
    if (locked) {
      el('span', null, li);
    } else if (!phone) {
      const b = el('button', 'sp-jbtn', li, rec ? 'Replay' : 'Play');
      b.type = 'button';
      b.dataset.mission = m.id;
      b.setAttribute('aria-label', `${rec ? 'Replay' : 'Play'} ${m.title}`);
      b.addEventListener('click', () => start(i));
    } else {
      el('span', null, li);
    }
    for (const [on, off] of [['mouseenter', 'mouseleave'], ['focusin', 'focusout']]) {
      li.addEventListener(on, () => hot(m.id, true));
      li.addEventListener(off, () => hot(m.id, false));
    }
  });
  if (!canSaveProgress()) el('p', 'sp-savenote', paper, 'Progress can’t be saved in this window.');

  // All-player records (src/net/records.js) under each job's name, only when
  // the server answers and someone has set one.
  getRecords().then((all) => {
    if (!all || !root.isConnected) return;
    MISSION_LIST.forEach((m) => {
      const name = list.querySelector(`li[data-mission="${m.id}"] .sp-jname`);
      if (!name) return;
      for (const [k, ms] of recordRows(all[m.id], !!touristFor(m.id))) {
        el('span', 'sp-jrec', name, `${k}: ${timerText(ms)}`);
      }
    });
  });

  // Finished jobs get a "Maps" link to the map wall (src/ui/mapShare.js,
  // loaded on click; straight to the wall, no pick), only when the map
  // server answers.
  if (anyDone) {
    mapsAvailable().then((config) => {
      if (!config || !root.isConnected) return;
      MISSION_LIST.forEach((m) => {
        if (!done[m.id]) return;
        const name = list.querySelector(`li[data-mission="${m.id}"] .sp-jbest`);
        if (!name) return;
        const b = el('button', 'sp-jmaps', name, 'Maps');
        b.type = 'button';
        b.setAttribute('aria-label', `Other drivers’ maps for ${m.title}`);
        b.addEventListener('click', async () => {
          const { openMapWall } = await import('./mapShare.js');
          openMapWall({ missionId: m.id, missionTitle: m.title, pick: false });
        });
      });
    });
  }

  const go = el('div', 'sp-go', pad);
  let btn = null;
  let keyBtn = null;
  let errBox = null;
  if (!phone) {
    btn = el('button', 'sp-play', go);
    btn.id = 'splash-start';
    btn.type = 'button';
    const big = allDone ? 'Drive again' : anyDone ? 'Continue' : 'Play';
    el('b', null, btn, big);
    el('small', null, btn, `${first + 1}. ${MISSION_LIST[first].title}`);
    // The ignition switch (only drawn, not a button) and the dash that wakes.
    keyBtn = el('div', 'sp-key', go);
    keyBtn.setAttribute('aria-hidden', 'true');
    keyBtn.innerHTML = KEY;
    const cluster = el('div', 'sp-cluster', go);
    cluster.setAttribute('aria-hidden', 'true');
    cluster.innerHTML = GAUGE('sp-n1') + GAUGE('sp-n2')
      + '<span class="sp-lamp sp-l-batt"></span><span class="sp-lamp sp-l-oil"></span><span class="sp-lamp sp-l-check"></span><span class="sp-lamp sp-l-radio"></span>';
  } else {
    const box = el('div', 'sp-phone', go);
    el('strong', null, box, 'Made for keyboard on a laptop or desktop');
    el('p', null, box, `${PITCH_LINE} Send yourself the link and play on a computer.`);
    const share = el('button', 'sp-play', box);
    share.type = 'button';
    el('b', null, share, 'Share link');
    // In case this is a computer after all (a keyboard on a tablet).
    const anyway = el('button', 'sp-chip', box, 'I have a keyboard: play');
    anyway.type = 'button';
    anyway.addEventListener('click', () => start(first));
    const msg = el('span', 'sp-hint', box);
    msg.setAttribute('role', 'status');
    share.addEventListener('click', async () => {
      const url = location.origin + location.pathname;
      try {
        if (navigator.share) {
          await navigator.share({ title: TITLE, text: SHORT_LINE, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        msg.textContent = ' Link copied.';
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        msg.textContent = ` ${url}`;
      }
    });
  }

  const small = el('div', 'sp-small', pad);
  const how = el('button', 'sp-chip', small, 'How to play');
  how.type = 'button';
  how.setAttribute('aria-expanded', 'false');
  how.setAttribute('aria-controls', 'sp-howto');
  const mute = el('button', 'sp-chip', small);
  mute.type = 'button';
  const showMute = () => {
    mute.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
    mute.setAttribute('aria-pressed', String(isMuted()));
  };
  showMute();
  const unMute = onMuteChange(showMute);
  mute.addEventListener('click', () => setMuted(!isMuted()));

  // The map on the passenger seat.
  const seat = el('section', 'sp-seat', dash);
  seat.setAttribute('aria-label', 'Darlene’s 1987 map of Fenwick County');
  const map = el('div', 'sp-map', seat);
  // Darlene's 1987 map (src3/map/splashMap1987.js) once the world data has
  // loaded; the plain pencil sketch if it can't.
  const marks = el('div', 'sp-marks', map);
  const hookMarks = () => marks.querySelectorAll('.mp-m').forEach((g) => {
    g.addEventListener('mouseenter', () => hot(g.dataset.mission, true));
    g.addEventListener('mouseleave', () => hot(g.dataset.mission, false));
  });
  const sketchMap = () => {
    marks.innerHTML = mapSVG({ missions: MISSION_LIST, done, next: first });
    hookMarks();
  };
  import('../../src3/map/splashMap1987.js').then((m) => {
    if (!root.isConnected) return;
    const cv = m.mapCanvas(Math.max(600, Math.round(map.clientWidth * 1.25)));
    cv.className = 'sp-mapcv';
    map.classList.add('sp-1987');
    marks.replaceChildren(cv);
    marks.insertAdjacentHTML('beforeend', m.marksSVG({ missions: MISSION_LIST, done, next: first }));
    hookMarks();
  }).catch(sketchMap);
  el('div', 'sp-ring', map);
  map.insertAdjacentHTML('beforeend', PENCIL + COMPASS);
  const note = el('button', 'sp-note', map, 'How to play →');
  note.type = 'button';
  note.setAttribute('aria-hidden', 'true');
  note.tabIndex = -1; // the chip above is the keyboard way in
  const sheet = el('div', 'sp-howto', map);
  sheet.id = 'sp-howto';
  sheet.hidden = true;
  sheet.setAttribute('role', 'region');
  sheet.setAttribute('aria-label', 'How to play');
  el('h2', 'sp-hh', sheet, 'How to play');
  const closeHow = el('button', 'sp-howclose', sheet, 'Close');
  closeHow.type = 'button';
  renderHowTo(sheet, version);
  el('p', 'sp-howfoot', sheet, 'Press H while driving to see this again.');
  let howFrom = null;
  const setHow = (open, from) => {
    sheet.hidden = !open;
    how.setAttribute('aria-expanded', String(open));
    if (open) {
      howFrom = from || how;
      closeHow.focus({ preventScroll: true });
    } else if (howFrom) {
      howFrom.focus({ preventScroll: true });
    }
  };
  how.addEventListener('click', () => setHow(sheet.hidden, how));
  note.addEventListener('click', () => setHow(true, how));
  closeHow.addEventListener('click', () => setHow(false));

  performance.mark('menu-visible');

  // Keys: the game never sees them while this is up. Buttons work as
  // buttons (Tab, Enter, Space); Enter with nothing focused starts; K mutes.
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'KeyK') setMuted(!isMuted());
    else if (e.key === 'Escape' && !sheet.hidden) setHow(false);
    else if (e.key === 'Enter' && btn && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      start(first);
    }
  };
  window.addEventListener('keydown', onKey, true);

  let resolveStarted;
  const started = new Promise((r) => {
    resolveStarted = r;
  });
  let going = false;
  start = async (index) => {
    if (going) return;
    going = true;
    // Inside the click or key handler: the only place Safari lets sound start.
    unlockAudio();
    const buttons = [...root.querySelectorAll('button')];
    for (const b of buttons) b.disabled = true;
    if (btn) btn.querySelector('b').textContent = 'Starting…';
    if (errBox) errBox.remove();
    // The dash wakes (CSS) while the game starts; the game waits for it.
    // Only mission 1 gets the key turn and the fly-out (#98); the rest jump straight in.
    const waking = (keystart === 'fly' || keystart === 'wake') && startsWithKey(MISSION_LIST[index].id);
    let wake = Promise.resolve();
    if (waking) {
      turnAt = performance.now();
      wake = new Promise((r) => setTimeout(() => { root.classList.add('sp-wake'); r(); }, CATCH_MS)).then(() => new Promise((r) => setTimeout(r, WAKE_MS)));
    }
    try {
      await load(index, waking ? {
        wake,
        crankAt: turnAt + CRANK_FROM_MS, // the engine sound waits for START
        rect: () => api.windshieldRect(),
        // The painting (when the world was not drawn behind the glass yet) goes at once.
        setFly: (p) => { root.classList.add('sp-flying'); root.style.setProperty('--fly', String(p)); },
      } : undefined);
    } catch (e) {
      console.warn('[splash] the game could not start', e);
      errBox = el('p', 'sp-err', pad, 'The game could not start in this browser. It needs WebGL (3D graphics); try another browser or computer.');
      errBox.setAttribute('role', 'alert');
      for (const b of buttons) b.disabled = false;
      root.classList.remove('sp-wake');
      root.style.removeProperty('--fly');
      turnAt = 0;
      if (btn) btn.querySelector('b').textContent = 'Try again';
      going = false;
      return;
    }
    window.removeEventListener('keydown', onKey, true);
    unMute();
    document.body.classList.remove('menu-open');
    root.classList.add('sp-out');
    setTimeout(() => {
      root.remove();
      style.remove();
    }, 520);
    resolveStarted();
  };
  // The key and its keychain: sways at rest, turns by itself on a mission 1 start.
  let turnAt = 0;
  if (keyBtn && (keystart === 'fly' || keystart === 'wake')) {
    const turner = keyBtn.querySelector('.sp-keyturn');
    const chainEl = keyBtn.querySelector('.sp-chain');
    const chain = newChain(0);
    const born = performance.now();
    let last = born;
    let lastMark = 0;
    const tick = () => {
      const c = sharedAudioContext();
      if (!c || c.state !== 'running' || isMuted()) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.03);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.06);
    };
    const frame = () => {
      if (!keyBtn.isConnected) return;
      const now = performance.now();
      const ms = turnAt ? now - turnAt : 0;
      const { deg, mark } = keyTurn(ms);
      if (mark !== lastMark) { if (turnAt) tick(); lastMark = mark; }
      turner.setAttribute('transform', 'translate(75 70) rotate(' + deg.toFixed(2) + ')');
      const rad = (deg * Math.PI) / 180;
      const px = 75 + KEY_HOLE * Math.sin(rad);
      const py = KEY_C.y - KEY_HOLE * Math.cos(rad);
      stepChain(chain, (now - last) / 1000, px, turnAt ? 0 : restSway(now - born));
      last = now;
      chainEl.setAttribute('transform', 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') rotate(' + (-chain.psi * 180 / Math.PI).toFixed(2) + ')');
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  if (btn) {
    btn.addEventListener('click', () => start(first));
    btn.focus({ preventScroll: true });
  }

  const api = {
    first,
    started,
    // Where the windshield glass is (CSS px), for drawing the live world.
    windshieldRect() {
      const r = glass.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
    // The live world is drawing behind the glass: fade the painting out.
    showWorld() {
      document.body.dataset.world = 'live';
      performance.mark('world-visible');
    },
  };
  return api;
}
