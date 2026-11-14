// Intro card: Darlene's handwritten note, shown once after Start and before
// mission 1's card (SPEC 9o, "Intro card"). Also readable from the Help
// panel (renderIntroNote). The text is the owner's own. Line id: intro-darlene-note.
//
// "Seen" is kept in localStorage under INTRO_KEY, next to the saved progress.
// Every storage call is wrapped, so a blocked store just shows the note
// each visit.

import { injectUiStyle, el, trapKeys } from './style.js';

export const INTRO_KEY = 'askalocal.introSeen.v1';

export const INTRO_TEXT =
  'Darlene asked if you can cover her shift, but she only had a map for you five years out of date. ' +
  '"This\'ll help," she claimed, "but the county\'s shifted since then. ' +
  'If you get lost, just ask a local. They\'ll know the way."';

const OPEN_GUARD_MS = 300;

function storage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch (e) {
    return null;
  }
}

export function introSeen() {
  try {
    const s = storage();
    return !!(s && s.getItem(INTRO_KEY));
  } catch (e) {
    return false;
  }
}

export function markIntroSeen() {
  try {
    const s = storage();
    if (s) s.setItem(INTRO_KEY, '1');
  } catch (e) {
    // blocked: it will show again next visit
  }
}

export function clearIntroSeen() {
  try {
    const s = storage();
    if (s) s.removeItem(INTRO_KEY);
  } catch (e) {
    // nothing saved anyway
  }
}

// The note itself, as a block you can put in any parent.
export function renderIntroNote(parent) {
  const note = el('div', 'ui-note-hand', parent);
  el('p', null, note, INTRO_TEXT);
  el('div', 'ui-note-sign', note, 'Darlene');
  return note;
}

// Opens the card. onClose runs once. Marks the note as seen. Returns { close }.
export function openIntroCard({ onClose } = {}) {
  injectUiStyle();
  markIntroSeen();
  const shade = el('div', 'ui-shade ui-dim', document.body);
  shade.id = 'intro-card';
  const card = el('div', 'ui-card ui-intro', shade);
  renderIntroNote(card);
  const foot = el('div', 'ui-card-foot', card);
  el('span', null, foot, 'Press E or Enter');
  const btn = el('button', 'ui-btn', foot, 'Okay');
  btn.type = 'button';

  const openedAt = performance.now();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    untrap();
    shade.remove();
    onClose?.();
  };
  const untrap = trapKeys((e) => {
    if (e.repeat || performance.now() - openedAt < OPEN_GUARD_MS) return;
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') close();
  });
  btn.addEventListener('click', close);
  return { close, get open() { return open; } };
}
