// The how-to-play content, shown as the Help tab on the map screen
// (src3/map/map.js). Same content as the start screen's How to play sheet,
// plus Darlene's note. Before #88 this was an overlay opened with H.

import { injectUiStyle, el } from './style.js';
import { renderIntroNote } from './introCard.js';
import { renderHowTo, TITLE, PITCH } from './splash.js';

// Fills `parent` (which should have the ui-paper look) with the help.
export function renderHelp(parent, version) {
  injectUiStyle();
  el('h1', 'ui-title', parent, TITLE);
  el('p', 'ui-pitch', parent, PITCH);
  renderHowTo(parent, version);
  const foot = el('div', 'ui-foot', parent);
  const noteBtn = el('button', 'ui-pbtn', foot, "Darlene's note");
  noteBtn.type = 'button';
  noteBtn.setAttribute('aria-expanded', 'false');
  let noteEl = null;
  noteBtn.addEventListener('click', () => {
    if (noteEl) {
      noteEl.remove();
      noteEl = null;
    } else {
      noteEl = renderIntroNote(parent);
      noteEl.classList.add('ui-help-note');
      parent.insertBefore(noteEl, foot);
      noteEl.scrollIntoView?.({ block: 'nearest' });
    }
    noteBtn.setAttribute('aria-expanded', String(!!noteEl));
  });
}
