// What the share postcard (#81) says, as plain data: no DOM, so
// tools/check-postcard.mjs can check it. src/ui/postcard.js draws it.
//
//   postcardFacts(run) -> { heading, title, rows: [[label, value], ...], postmark, clock }
//     run: { missionTitle, goalName, timeMs, metres, clockMinutes, localsAsked, tows }
//   postcardFileName(missionId) -> "turn-left-at-the-cows-m1_parcel.png"
//
// Every word here is already on the win screen (same labels, same number
// formats), so the card and the win screen always agree.

import { timerText, clockText } from '../hud/format.js';
import { milesText } from '../units.js';
import { towedText } from '../game/tow.js';

export function postcardFacts(run) {
  const rows = [
    ['Trip time', timerText(run.timeMs || 0)],
    ['Distance', milesText(run.metres || 0, 2)],
    ['Clock', clockText(run.clockMinutes || 0)],
    ['Locals asked', String(run.localsAsked || 0)],
  ];
  if (run.tows) rows.push(['Towed', towedText(run.tows)]);
  const goal = run.goalName || 'the end';
  return {
    heading: `You made it to ${goal}`,
    title: run.missionTitle || '',
    rows,
    postmark: run.goalName || '',
    clock: clockText(run.clockMinutes || 0),
  };
}

export function postcardFileName(missionId) {
  const id = String(missionId || 'trip').replace(/[^a-z0-9_-]+/gi, '-');
  return `turn-left-at-the-cows-${id}.png`;
}
