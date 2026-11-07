// Splash page and the shared how-to-play content (also used by the H help
// panel). Plain DOM, no game code, so it shows before the game loads.

import { injectUiStyle, el, trapKeys } from './style.js';

export const TITLE = 'Ask a Local';
export const PITCH = "No GPS. No 'you are here' dot. Just you, the locals, and the map you draw.";

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
// version: '2d' | '3d' (dims keys the other version does not use).
export function renderHowTo(parent, version) {
  const cols = el('div', 'ui-cols', parent);
  const left = el('div', null, cols);
  el('h2', 'ui-h', left, 'How it works');
  const ol = el('ol', 'ui-steps', left);
  for (const [b, rest] of STEPS) {
    const li = el('li', null, ol);
    el('b', null, li, b);
    li.append(rest);
  }
  const right = el('div', null, cols);
  el('h2', 'ui-h', right, 'Controls');
  const table = el('table', 'ui-keys', right);
  for (const [keys, what, only] of CONTROLS) {
    const tr = el('tr', only && only !== version ? 'ui-off' : null, table);
    const k = el('td', null, tr);
    keys.forEach((key) => el('span', 'ui-kbd', k, key));
    el('td', null, tr, what);
  }
  return cols;
}

// Shows the splash. Resolves when the player starts (click, Enter or
// Space). `load` is awaited before the splash goes away (the real game).
export function showSplash({ version, load }) {
  injectUiStyle();
  const shade = el('div', 'ui-shade ui-splash-bg', document.body);
  shade.id = 'splash';
  const paper = el('div', 'ui-paper', shade);
  const h = el('h1', 'ui-title', paper, TITLE);
  el('small', null, h, 'a driving game with no GPS');
  el('p', 'ui-pitch', paper, PITCH);
  renderHowTo(paper, version);

  const foot = el('div', 'ui-foot', paper);
  const btn = el('button', 'ui-btn', foot, 'Start driving');
  btn.id = 'splash-start';
  btn.type = 'button';
  el('span', 'ui-note', foot, 'or press Enter');

  return new Promise((resolve) => {
    let started = false;
    let untrap = null;
    const start = async () => {
      if (started) return;
      started = true;
      btn.disabled = true;
      btn.textContent = 'Loading...';
      try {
        await load();
      } finally {
        // Keep swallowing keys until the game is in, so the Enter or Space
        // that started it never reaches the game.
        untrap?.();
        shade.remove();
        resolve();
      }
    };
    btn.addEventListener('click', start);
    untrap = trapKeys((e) => {
      if (e.key === 'Tab') return;
      if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) start();
    });
    btn.focus({ preventScroll: true });
  });
}
