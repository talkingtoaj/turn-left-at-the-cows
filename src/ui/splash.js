// Start screen: the map on the passenger seat (SPEC 6h). Plain DOM, no game
// code, so it shows the moment the page opens. The top of the screen is a
// windshield: a painted country scene until the live world (src3/main.js
// preloadMenu) fades in behind it. Below it, the dash: a notepad with the
// jobs and the big Continue / Play button, and the paper map of Ashford
// County with the jobs pencilled on (./splashMap.js).
// Also holds the shared how-to-play content (the H help panel uses it).

import { injectUiStyle, el } from './style.js';
import { SPLASH_CSS } from './splashStyle.js';
import { mapSVG } from './splashMap.js';
import { MISSION_LIST } from '../game/missionList.js';
import { loadProgress, nextUnfinishedIndex, canSaveProgress } from '../game/progress.js';
import { timerText } from '../hud/format.js';
import { unlockAudio, isMuted, setMuted, onMuteChange } from '../audio/context.js';
import { soundBytes } from '../audio/sounds.js';

export const TITLE = 'Turn Left at the Cows';
export const TAGLINE = 'There was a time before GPS, when finding your way required you to ask a local.';
export const PITCH = TAGLINE;
export const PITCH_LINE = 'GeoGuessr, but you drive, and the locals might be unreliable.';
export const SHORT_LINE = 'Get directions. Get lost. Find it anyway.';

const SEEN_KEY = 'askalocal.seenIntro';

// [bold start, rest]
export const STEPS = [
  ['You have a job to do.', ' Take something to a place you have never been.'],
  ['Ask the locals.', ' Pick a topic, like a place name, and they tell you the way. New names give you new things to ask.'],
  ['Draw your own map.', ' Press M and sketch what you heard. Your notebook keeps every word they said.'],
  ['Printed maps can lie.', ' Roads close, bridges wash out and names change. Trust what you see.'],
  ['Read the clues.', ' Road signs, the compass, the trip meter and the clock tell you where you are.'],
];

// [keys, what it does, optional version it only applies to (unused since the 2D drop)]
export const CONTROLS = [
  [['Arrows', 'WASD'], 'Drive'],
  [['Space'], 'Handbrake'],
  [['E'], 'Talk / next'],
  [['1-9'], 'Pick a topic'],
  [['M'], 'Map'],
  [['N'], 'North-up / heading-up'],
  [['K'], 'Mute'],
  [['C'], 'Camera'],
  [['B'], 'Horn'],
  [['H'], 'Help'],
  [['Enter'], 'Next mission'],
];

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
    keys.forEach((key) => el('kbd', 'ui-kbd', k, key));
    el('td', null, tr, what);
  }
  return cols;
}

// ---------- pictures (inline SVG, decorative) ----------

// The painted country seen through the windshield before the live world is in.
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

const KEY = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="10" fill="#55575c"/>
  <g transform="translate(24 24)"><rect x="-3" y="-17" width="6" height="18" rx="1.5" fill="#c9ccd1"/>
  <rect x="-8" y="-24" width="16" height="10" rx="4" fill="#e6b450"/></g>
</svg>`;

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

// Turning the key: a short burst of the idle engine (after a real click).
async function engineBurst() {
  const ctx = unlockAudio();
  if (!ctx || isMuted()) return;
  try {
    const ab = await soundBytes('engine/idle');
    const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej));
    const g = ctx.createGain();
    g.connect(ctx.destination);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(g);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.12);
    g.gain.setTargetAtTime(0, t + 1.3, 0.25);
    s.playbackRate.setValueAtTime(1.3, t);
    s.playbackRate.setTargetAtTime(1, t + 0.15, 0.25);
    s.start(t);
    s.stop(t + 2.6);
  } catch (e) {
    // No sound: the key is only for fun.
  }
}

// ---------- the screen ----------

// Shows the start screen. Returns:
//   { first, windshieldRect(), showWorld(), started: Promise }
// load(index) is awaited when the player starts; the screen then fades.
// phone: a touch-only device (keyboard game): show a note and a share
// button instead of Play.
export function showSplash({ version = '3d', load, preferred = null, phone = false }) {
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
  el('h2', null, paper, 'Deliveries in Ashford County');
  const list = el('ol', 'sp-jobs', paper);
  let start = null;
  const hot = (id, on) => {
    root.querySelectorAll(`[data-mission="${id}"]`).forEach((n) => n.classList.toggle('is-hot', on));
  };
  MISSION_LIST.forEach((m, i) => {
    const rec = done[m.id];
    const li = el('li', rec ? 'done' : null, list);
    li.dataset.mission = m.id;
    const mark = el('span', 'sp-mark', li, rec ? '✓' : i === first ? '○' : String(i + 1));
    mark.setAttribute('aria-hidden', 'true');
    const name = el('span', 'sp-jname', li, m.title);
    if (rec) el('span', 'sp-jbest', name, `best ${timerText(rec.bestMs)}, ${(rec.bestDistance / 1000).toFixed(1)} km`);
    el('span', 'sp-sr', name, rec ? ' (done)' : i === first ? ' (next)' : '');
    if (!phone) {
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

  const go = el('div', 'sp-go', pad);
  let btn = null;
  let errBox = null;
  if (!phone) {
    btn = el('button', 'sp-play', go);
    btn.id = 'splash-start';
    btn.type = 'button';
    const big = allDone ? 'Drive again' : anyDone ? 'Continue' : 'Play';
    el('b', null, btn, big);
    el('small', null, btn, `${first + 1}. ${MISSION_LIST[first].title}`);
    const key = el('button', 'sp-key', go);
    key.type = 'button';
    key.title = 'Turn the key';
    key.setAttribute('aria-label', 'Turn the key (engine sound)');
    key.innerHTML = KEY;
    key.addEventListener('click', () => {
      key.classList.add('on');
      setTimeout(() => key.classList.remove('on'), 1600);
      engineBurst();
    });
  } else {
    const box = el('div', 'sp-phone', go);
    el('strong', null, box, 'Made for keyboard on a laptop or desktop');
    el('p', null, box, `${PITCH_LINE} Send yourself the link and play on a computer.`);
    const share = el('button', 'sp-play', box);
    share.type = 'button';
    el('b', null, share, 'Share link');
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
  if (!phone) el('span', 'sp-hint', small, 'Enter to start · K mutes');

  // The map on the passenger seat.
  const seat = el('section', 'sp-seat', dash);
  seat.setAttribute('aria-label', 'Map of Ashford County');
  const map = el('div', 'sp-map', seat);
  map.innerHTML = mapSVG({ missions: MISSION_LIST, done, next: first });
  el('div', 'sp-ring', map);
  map.insertAdjacentHTML('beforeend', PENCIL + COMPASS);
  map.querySelectorAll('.mp-m').forEach((g) => {
    g.addEventListener('mouseenter', () => hot(g.dataset.mission, true));
    g.addEventListener('mouseleave', () => hot(g.dataset.mission, false));
  });
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
    if (going || phone) return;
    going = true;
    // Inside the click or key handler: the only place Safari lets sound start.
    unlockAudio();
    const buttons = [...root.querySelectorAll('button')];
    for (const b of buttons) b.disabled = true;
    if (btn) btn.querySelector('b').textContent = 'Starting…';
    if (errBox) errBox.remove();
    try {
      await load(index);
    } catch (e) {
      console.warn('[splash] the game could not start', e);
      errBox = el('p', 'sp-err', pad, 'The game could not start in this browser. It needs WebGL (3D graphics); try another browser or computer.');
      errBox.setAttribute('role', 'alert');
      for (const b of buttons) b.disabled = false;
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
  if (btn) {
    btn.addEventListener('click', () => start(first));
    btn.focus({ preventScroll: true });
  }

  return {
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
}
