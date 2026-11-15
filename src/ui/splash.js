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
import { milesText } from '../units.js';
import { unlockAudio, isMuted, setMuted, onMuteChange } from '../audio/context.js';
import { available as mapsAvailable } from '../net/mapsApi.js';
import { myMap } from '../game/myMaps.js';
import { tipsEnabled, setTipsEnabled } from '../game/tips.js';

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
  ['Ask the locals.', ' Stop, get out (F) and walk up to someone. Press E and they tell you the way. Click a name they say, or press its number, to ask about it. New names give you new things to ask.'],
  ['Look around.', ' On foot, look at a tower or a hill and press E: a local beside you will tell you what it is. Listen too: planes, bells and creeks all point somewhere.'],
  ['Draw your own map.', ' Press M and sketch what you heard. Your notebook keeps every word they said.'],
  ['Printed maps can lie.', ' Roads close, bridges wash out and names change. Trust what you see.'],
  ['Read the clues.', ' Road signs, the compass, the trip meter and the clock tell you where you are.'],
];

// [keys, what it does, optional version it only applies to (unused since the 2D drop)]
export const CONTROLS = [
  [['Arrows', 'WASD'], 'Drive / walk'],
  [['Space'], 'Handbrake'],
  [['F'], 'Get out of the car / back in'],
  [['Mouse'], 'Look around on foot (click; Esc lets go)'],
  [['Shift'], 'Jog'],
  [['Right mouse'], 'Hold: turn your head in the car, squint on foot'],
  [['E'], 'Talk / next / "What\u2019s that?"'],
  [['1-4'], 'Ask about an underlined name'],
  [['M'], 'Map'],
  [['N'], 'North-up / heading-up'],
  [['T'], 'Radio on / off (it finds a station by itself)'],
  [[',', '.'], 'Radio volume down / up. Or drag the knob, or roll the mouse wheel over it'],
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

  // Finished jobs get a "Maps" link to other drivers' maps (src/ui/mapShare.js,
  // loaded on click), only when the map server answers.
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
          const { openMapsBrowser } = await import('./mapShare.js');
          openMapsBrowser({ missionId: m.id, missionTitle: m.title, mySketch: myMap(m.id)?.sketch || null });
        });
      });
    });
  }

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
