// Radio subtitles (issue 21). While a spoken segment plays on the tuned station its
// English lines show here, timed across the segment (src/radio/subtitles.js).
//   weak signal   words drop out to "..." as the signal and tuning fall; none when too faint
//   guest spots   the local's gibberish lines show a tag, "[Earl, in his own words]", not words;
//                 the DJ's lines show as normal
//   music         a small note line with the slot name
//   dead air      (file missing) no subtitles, unless the dev flag ?radiosubs=1 is on. Then the
//                 scripts show in full over the static so they can be read in game before the
//                 owner's audio exists. Players never see subtitles over silence.
// Look: the same dark card and cream text as the locals' talk box (./talk.js), smaller, at the top
// centre so it stays clear of the dash, the hint line and the talk box at the bottom.
//
//   const subs = createRadioSubs(hudRoot, radio)
//   subs.update()          every frame

import { subtitleCues, cueIndexAt, patchyText, subtitleReach, gibberishTag } from '../../src/radio/subtitles.js';

const CSS = `
.rsub { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); width: max-content;
  max-width: min(620px, calc(100% - 700px), calc(100% - 32px)); min-width: min(300px, calc(100% - 32px)); padding: 8px 16px 9px;
  background: rgba(35,37,42,0.92); border: 2px solid #6b6e74; border-radius: 10px; box-shadow: 4px 4px 0 rgba(0,0,0,0.3);
  pointer-events: none; display: none; box-sizing: border-box; }
.rsub-who { color: #e6b450; font-weight: bold; font-size: 13px; margin-bottom: 3px; }
.rsub-text { color: #ece7d8; font-size: 16px; line-height: 1.4; }
.rsub.rsub-gib .rsub-text { color: #a9acb2; font-style: italic; }
.rsub.rsub-music { padding: 4px 12px 5px; border-width: 1px; min-width: 0; }
.rsub.rsub-music .rsub-who { display: none; }
.rsub.rsub-music .rsub-text { color: #a9acb2; font-size: 13px; }
.rsub.rsub-dev { border-style: dashed; }
@media (max-width: 760px) { .rsub { max-width: calc(100% - 32px); top: 64px; } }
`;

const flag = () => {
  try {
    return new URLSearchParams(location.search).get('radiosubs') === '1';
  } catch (e) {
    return false;
  }
};

const KIND_NAME = { jingle: 'station jingle', music: 'music' };

export function createRadioSubs(root, radio) {
  if (!root || !radio) return { update() {} };
  const dev = flag();
  const style = document.createElement('style');
  style.dataset.owner = 'radiosubs';
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'rsub';
  box.setAttribute('role', 'status');
  const whoEl = document.createElement('div');
  whoEl.className = 'rsub-who';
  const textEl = document.createElement('div');
  textEl.className = 'rsub-text';
  box.append(whoEl, textEl);
  root.appendChild(box);

  const air = { segment: null, offset: 0, mode: 'off', clear: 0 };
  let shown = false;
  let lastKey = '';

  function hide() {
    if (!shown) return;
    shown = false;
    box.style.display = 'none';
    lastKey = '';
  }

  function show(key, cls, who, text) {
    if (key !== lastKey) {
      lastKey = key;
      box.className = 'rsub ' + cls + (dev && air.mode === 'dead' ? ' rsub-dev' : '');
      whoEl.textContent = who;
      textEl.textContent = text;
    }
    if (!shown) {
      shown = true;
      box.style.display = 'block';
    }
  }

  function update() {
    radio.airInfo(air);
    const seg = air.segment;
    if (!seg || air.mode === 'wait') return hide();
    const dead = air.mode === 'dead';
    if (dead && !dev) return hide(); // never subtitles over silence for players
    const reach = dead ? 'full' : subtitleReach(air.clear); // the dev view reads scripts whole
    if (reach === 'none') return hide();
    if (!seg.spoken) {
      const n = /_(\d)$/.exec(seg.id);
      const slot = (KIND_NAME[seg.kind] || 'music') + (n ? ' ' + n[1] : '');
      return show(seg.id, 'rsub-music', '', '♪ ' + slot + (dead ? ' (no audio yet)' : ''));
    }
    const cues = subtitleCues(seg);
    const i = cueIndexAt(cues, air.offset);
    if (i < 0) return hide();
    const cue = cues[i];
    if (cue.gibberish) return show(seg.id + i + 'g', 'rsub-gib', '', gibberishTag(seg));
    const dj = (seg.speaker || '').split(' and ')[0];
    const text = reach === 'full' ? cue.text : patchyText(cue.text, i + seg.id.length, air.clear);
    // Weak signal: the text changes as the signal moves, so key on it.
    return show(seg.id + i + text, '', dj, text);
  }

  return { update };
}
