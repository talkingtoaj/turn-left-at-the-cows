// Radio subtitle maths with no browser in it (safe to import from node checks).
// The radio subtitle HUD was removed (owner: not needed); tools/check-radio-subs.mjs still tests these.
//
//   subtitleCues(seg)          the segment's English lines as timed cues
//   cueIndexAt(cues, t)        which cue is on at t seconds into the segment
//   patchyText(text, key, clear)   the words that survive a weak signal
//   subtitleReach(clear)       'full' | 'patchy' | 'none' for a signal * tuning value
//   gibberishTag(seg)          '[Earl, in his own words]' for a guest spot
//
// Timing: a segment's script is split into cards (blank line = new card), long
// cards are split again at sentence ends, and the segment's seconds are shared out
// by word count. Uses seg.seconds, so the real lengths from
// `npm run radio:bake -- <dir> --write-durations` are picked up with no change here.
// A line that starts with '~' is a local talking gibberish: it keeps its slot in the
// timing but has no subtitle text (see gibberishTag).

const MAX_CARD_CHARS = 110;
const MIN_WEIGHT = 2; // a one-word line still gets a moment

// Signal * dial quality at or above this and every word shows.
export const SUBS_FULL_AT = 0.55;
// Below this the voice is too faint to follow and there is no subtitle at all.
export const SUBS_NONE_BELOW = 0.12;

function splitSentences(card) {
  const parts = card.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) || [card];
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (cur && (cur + p).length > MAX_CARD_CHARS) {
      out.push(cur.trim());
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const cueCache = new WeakMap();

// -> [{ text, gibberish, start, end }] in seconds from the segment's start. Empty for music.
export function subtitleCues(seg) {
  if (!seg || !seg.spoken || !seg.subtitle) return [];
  let cues = cueCache.get(seg);
  if (cues && cues.seconds === seg.seconds) return cues.list;
  const items = [];
  for (const card of seg.subtitle.split(/\n\s*\n/)) {
    const raw = card.trim();
    if (!raw) continue;
    if (raw.startsWith('~')) {
      const text = raw.replace(/^~\s*/, '');
      items.push({ text, gibberish: true, weight: Math.max(MIN_WEIGHT, text.split(/\s+/).length) });
    } else {
      for (const s of splitSentences(raw.replace(/\s*\n\s*/g, ' '))) {
        items.push({ text: s, gibberish: false, weight: Math.max(MIN_WEIGHT, s.split(/\s+/).length) });
      }
    }
  }
  const total = items.reduce((a, c) => a + c.weight, 0) || 1;
  const list = [];
  let t = 0;
  for (const c of items) {
    const len = (c.weight / total) * seg.seconds;
    list.push({ text: c.gibberish ? '' : c.text, gibberish: c.gibberish, start: t, end: t + len });
    t += len;
  }
  cueCache.set(seg, { seconds: seg.seconds, list });
  return list;
}

// Index of the cue on at t, or -1 (past the end).
export function cueIndexAt(cues, t) {
  for (let i = 0; i < cues.length; i++) if (t < cues[i].end) return t < cues[i].start ? -1 : i;
  return -1;
}

export function subtitleReach(clear) {
  if (clear < SUBS_NONE_BELOW) return 'none';
  return clear >= SUBS_FULL_AT ? 'full' : 'patchy';
}

// A steady 0..1 number for word i of a cue, so a word does not flicker on and off.
function wordRoll(key, i) {
  let h = 2166136261 ^ (key * 7919 + i * 104729);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 10000) / 10000;
}

// Weak signal: the weaker it is, the more words fall out. Runs of lost words become one "...".
export function patchyText(text, key, clear) {
  if (clear >= SUBS_FULL_AT) return text;
  const lose = Math.min(0.9, (SUBS_FULL_AT - clear) / (SUBS_FULL_AT - SUBS_NONE_BELOW)); // 0 .. 0.9
  const words = text.split(/\s+/);
  const out = [];
  let gap = false;
  for (let i = 0; i < words.length; i++) {
    if (wordRoll(key, i) < lose) {
      if (!gap) out.push('...');
      gap = true;
    } else {
      out.push(words[i]);
      gap = false;
    }
  }
  return out.join(' ');
}

// 'Dewey Halloran and Earl (gibberish)' -> '[Earl, in his own words]'
export function gibberishTag(seg) {
  const m = /\band\s+([^()]+?)\s*\(gibberish\)/i.exec(seg.speaker || '');
  return '[' + (m ? m[1] : 'The guest') + ', in his own words]';
}
