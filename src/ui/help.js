// H key: the how-to-play panel as a pause overlay (same content as the
// splash). H or Esc closes it. The caller pauses and unpauses the game.

import { injectUiStyle, el, trapKeys } from './style.js';
import { renderHowTo, TITLE, PITCH } from './splash.js';

// Opens the panel. onClose runs once when it closes. Returns { close }.
export function openHelp({ version, onClose }) {
  injectUiStyle();
  const shade = el('div', 'ui-shade ui-dim', document.body);
  shade.id = 'help-panel';
  const paper = el('div', 'ui-paper', shade);
  el('div', 'ui-paused', paper, 'PAUSED');
  el('div', 'ui-close', paper, 'H or Esc: back');
  el('h1', 'ui-title', paper, TITLE);
  el('p', 'ui-pitch', paper, PITCH);
  renderHowTo(paper, version);
  const foot = el('div', 'ui-foot', paper);
  const btn = el('button', 'ui-btn', foot, 'Back to the road');
  btn.type = 'button';
  el('span', 'ui-note', foot, 'or press H or Esc');

  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    untrap();
    shade.remove();
    onClose?.();
  };
  const untrap = trapKeys((e) => {
    if (e.repeat) return;
    if (e.key === 'Escape' || e.key === 'h' || e.key === 'H') close();
  });
  btn.addEventListener('click', close);
  return { close, get open() { return open; } };
}
