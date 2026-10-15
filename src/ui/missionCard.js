// Mission card shown at the start of every mission: a pinned job ticket
// with the title, who gave the job, the brief and the goal's name (never a
// distance or direction). E or Enter closes it. The caller locks driving.

import { injectUiStyle, el, trapKeys } from './style.js';
import { MISSIONS } from '../game/missions.js';
import { getNpc } from '../game/dialogue.js';

// Ignore E / Enter this soon after the card opens, so a key that was
// already on its way (or held down) does not close it unread.
const OPEN_GUARD_MS = 300;

// What the card says for mission `index`.
export function missionCardInfo(index) {
  const m = MISSIONS[index];
  if (!m) return null;
  const giver = m.giverNpcId ? getNpc(m.giverNpcId) : null;
  return {
    kicker: `Mission ${index + 1}`,
    title: m.title,
    from: giver ? `From: ${giver.name}` : 'Your job',
    lines: m.brief,
    goal: `Goal: ${m.goal.name}`,
  };
}

// Opens the card for mission `index`. onClose runs once. Returns { close }.
export function openMissionCard(index, { onClose } = {}) {
  const info = missionCardInfo(index);
  if (!info) {
    onClose?.();
    return { close() {}, open: false };
  }
  injectUiStyle();
  const shade = el('div', 'ui-shade ui-dim', document.body);
  shade.id = 'mission-card';
  const card = el('div', 'ui-card', shade);
  el('div', 'ui-card-kicker', card, info.kicker);
  el('h2', 'ui-card-title', card, info.title);
  el('div', 'ui-card-from', card, info.from);
  const brief = el('div', 'ui-card-brief', card);
  for (const line of info.lines) el('p', null, brief, line);
  el('div', 'ui-card-goal', card, info.goal);
  const foot = el('div', 'ui-card-foot', card);
  el('span', null, foot, 'Press E or Enter to start');
  const btn = el('button', 'ui-btn', foot, 'Start');
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
