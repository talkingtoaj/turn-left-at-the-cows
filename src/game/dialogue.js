// Topic-based dialogue over WORLD.locals (see src/world/npcs.js).
// No UI here: the HUDs call these and show the returned lines.

import { WORLD } from '../world/world.js';
import { TOPIC_BY_ID, TOPICS } from '../world/topics.js';
import { currentMission } from './missions.js';
import { rememberMet } from './progress.js';

// Marks a local as talked to this mission, and remembered for good.
function meet(state, npcId) {
  state.talkedTo.add(npcId);
  rememberMet(npcId);
}

export function getNpc(npcId) {
  return WORLD.locals.find((l) => l.id === npcId) || null;
}

export function topicLabel(topicId) {
  const t = TOPIC_BY_ID[topicId];
  return t ? t.label : topicId;
}

// Topics the player can ask about: everything they know, with the current
// mission's goal topic always first. [{ id, label, isGoal }]
export function listTopics(npcId, state) {
  const m = currentMission(state);
  const goal = m ? m.goalTopic : null;
  const ids = [...state.knownTopics].filter((id) => id !== goal && TOPIC_BY_ID[id]);
  ids.sort((a, b) => topicLabel(a).localeCompare(topicLabel(b)));
  if (goal) ids.unshift(goal);
  return ids.map((id) => ({ id, label: topicLabel(id), isGoal: id === goal }));
}

// What the NPC says when you walk up. Marks them as talked to.
export function greet(npcId, state) {
  const npc = getNpc(npcId);
  if (!npc) return [];
  meet(state, npcId);
  return npc.greeting ? [...npc.greeting] : [];
}

// Lines the NPC says about a topic. Adds every line to state.notebook. The
// names in the lines are learned as each page is shown (learnMentions), so
// you only learn what you have read.
export function ask(npcId, topicId, state) {
  const npc = getNpc(npcId);
  if (!npc) return [];
  meet(state, npcId);
  state.knownTopics.add(topicId);
  const entry = npc.topics && npc.topics[topicId];
  let lines;
  if (entry) {
    lines = [...entry.lines];
  } else {
    // Same fallback line every time for the same topic.
    const fb = npc.fallback && npc.fallback.length ? npc.fallback : ["Never heard of it."];
    let h = 0;
    for (const c of topicId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    lines = [fb[h % fb.length]];
  }
  const m = currentMission(state);
  for (const text of lines) {
    const dup = state.notebook.some((n) => n.npcId === npcId && n.topicId === topicId && n.text === text);
    if (dup) continue;
    state.notebook.push({
      npcId, name: npc.name, topicId, text, missionId: m ? m.id : null, clockMinutes: state.clockMinutes,
    });
  }
  return lines;
}

// Does this NPC have a real answer (not a fallback) for the topic?
export function knowsAbout(npcId, topicId) {
  const npc = getNpc(npcId);
  return !!(npc && npc.topics && npc.topics[topicId]);
}

// Simple talk used by the HUDs until the topic menu exists: greeting, then
// the answer about the current mission's goal.
export function quickTalk(npcId, state) {
  const m = currentMission(state);
  const lines = greet(npcId, state);
  if (m) lines.push(...ask(npcId, m.goalTopic, state));
  return lines;
}

// ---------------------------------------------------------------- round 12
// Talking on foot: no topic list first. Walk up, press E, and the local
// greets you and answers about the current mission's goal at once. Names
// of topics in what they say are underlined; you ask about one by clicking
// it or pressing its number (src3/hud/talk.js).

const REF_LISTS = {
  place: 'places', town: 'towns', road: 'roads', creek: 'creeks', lake: 'lakes',
  landmark: 'landmarks', bridge: 'bridges', building: 'buildings', outcrop: 'outcrops',
};

// Does topic t point at something in world W (or beyond its edge)? Two
// regions can each have a "the diner"; only the one here counts.
export function topicHere(t, W) {
  const ref = t && t.ref;
  if (!ref || ref.type === 'offmap') return true;
  const list = W[REF_LISTS[ref.type]];
  return !!(list && list.some((q) => q.id === ref.id));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new WeakMap();

// Every way each topic here is said, longest first: [{ id, re }].
function patternsFor(W) {
  if (patterns.has(W)) return patterns.get(W);
  const out = [];
  for (const t of TOPICS) {
    if (!topicHere(t, W)) continue;
    const names = new Set([t.label.replace(/^the\s+/i, ''), ...(t.aliases || [])]);
    for (const n of names) out.push({ id: t.id, n });
  }
  out.sort((a, b) => b.n.length - a.n.length);
  const list = out.map(({ id, n }) => ({ id, re: new RegExp(`(?<![\\w'])${esc(n)}(?![\\w'])`, 'gi') }));
  patterns.set(W, list);
  return list;
}

// Topic names in a line, in the order they come: [{ id, start, end }],
// never overlapping (the longest name wins). `W`: the world (WORLD).
export function topicMentions(text, W = WORLD) {
  const taken = [];
  for (const { id, re } of patternsFor(W)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some((q) => start < q.end && end > q.start)) continue;
      taken.push({ id, start, end });
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}

// The names to offer on a page: the first `max` different topics mentioned,
// in order, leaving out `skip` (the topic being answered).
export function topicChoices(text, skip = null, max = 4, W = WORLD) {
  const out = [];
  for (const m of topicMentions(text, W)) {
    if (m.id === skip || out.some((q) => q.id === m.id)) continue;
    if (out.length >= max) break;
    out.push(m);
  }
  return out;
}

// Walking up and pressing E: the greeting, then straight away the answer
// about the current mission's goal (or their "never heard of it").
// Returns [{ text, topicId }] pages.
export function openTalk(npcId, state) {
  const m = currentMission(state);
  const pages = greet(npcId, state).map((text) => ({ text, topicId: null }));
  if (m) for (const text of ask(npcId, m.goalTopic, state)) pages.push({ text, topicId: m.goalTopic });
  return pages;
}

function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// Will this local say something about the thing (so they point at it)? The
// same test askWhatsThat uses, with no side effects.
export function whatsThatKnows(npcId, topicId) {
  const npc = getNpc(npcId);
  const t = TOPIC_BY_ID[topicId];
  if (!npc || !t) return false;
  return !!(npc.topics && npc.topics[topicId]) || hash01(`${npcId}:${topicId}`) < t.fame;
}

// "What's that?" about something you are looking at, asked of a local
// standing with you. Someone with lines about it says them (and you learn
// the name); otherwise a well-known thing gets its name ("That? That's the
// Grey Stones."), depending on how famous it is; else they don't know.
// Everything goes in the notebook. Returns lines.
export function askWhatsThat(npcId, topicId, state) {
  const npc = getNpc(npcId);
  const t = TOPIC_BY_ID[topicId];
  if (!npc || !t) return [];
  if (npc.topics && npc.topics[topicId]) return ask(npcId, topicId, state);
  meet(state, npcId);
  const knows = whatsThatKnows(npcId, topicId);
  const name = t.label.charAt(0).toUpperCase() + t.label.slice(1);
  const text = knows
    ? (t.kind === 'farm' ? `That? That's ${t.label}.` : `That? ${name}. Been there as long as I can remember.`)
    : "That? Couldn't tell you, sorry. Never paid it much mind.";
  if (knows) state.knownTopics.add(topicId);
  const m = currentMission(state);
  if (!state.notebook.some((n) => n.npcId === npcId && n.topicId === topicId && n.text === text)) {
    state.notebook.push({ npcId, name: npc.name, topicId: knows ? topicId : null, text, missionId: m ? m.id : null, clockMinutes: state.clockMinutes });
  }
  return [text];
}

// No one to ask: a note to yourself. If someone has named it to you, it is
// that ("St. Anne's Church, to the north-east. Something to ask about.");
// else just what you see ("Hm, what's that? Something to the north-east,
// a few hundred yards off."). Returns the note's text (null if the same
// note is already in the notebook).
export function noteLandmark(topicId, where, state) {
  const t = TOPIC_BY_ID[topicId];
  const known = t && state.knownTopics.has(topicId);
  const far = where.d < 150 ? 'close by' : where.d < 400 ? 'a few hundred yards off' : 'a long way off';
  const name = known ? t.label.charAt(0).toUpperCase() + t.label.slice(1) : null;
  const text = known
    ? `${name}, to the ${where.dir}. Something to ask about.`
    : `Hm, what's that? Something to the ${where.dir}, ${far}.`;
  const m = currentMission(state);
  const entry = { npcId: null, name: 'My notes', self: true, topicId: known ? topicId : null, text, missionId: m ? m.id : null, clockMinutes: state.clockMinutes };
  const dup = state.notebook.some((n) => n.self && n.text === text);
  if (!dup) state.notebook.push(entry);
  return { text, known: !!known, topicId: known ? topicId : null, fresh: !dup };
}

// ---------------------------------------------------------------- learning names
// You can only ask about a name you have come across: read in what a local
// said, read on a sign, or been close to the thing itself.

// Learns every topic named in `text` (a page of dialogue, a sign). Returns
// the ids that were new.
export function learnMentions(text, state, W = WORLD) {
  const fresh = [];
  for (const m of topicMentions(text, W)) {
    if (state.knownTopics.has(m.id)) continue;
    state.knownTopics.add(m.id);
    fresh.push(m.id);
  }
  return fresh;
}

// How close you must be to learn a thing's name by being there (metres).
const NEAR_LIST = { place: 'places', town: 'towns', landmark: 'landmarks', bridge: 'bridges', building: 'buildings', outcrop: 'outcrops' };
const nearCache = new WeakMap();
function nearTargets(W) {
  if (nearCache.has(W)) return nearCache.get(W);
  const out = [];
  const seenRef = new Set();
  for (const t of TOPICS) {
    const ref = t.ref;
    const list = ref && NEAR_LIST[ref.type] && W[NEAR_LIST[ref.type]];
    const q = list && list.find((o) => o.id === ref.id);
    // One topic per thing (Kestrel Field, not also "the planes" and "the wind").
    const key = ref && `${ref.type}:${ref.id}`;
    if (!q || q.x == null || seenRef.has(key)) continue;
    seenRef.add(key);
    const reach = ref.type === 'town' ? Math.min(150, (q.ambienceR || 200) * 0.6)
      : ref.type === 'bridge' ? 30 : Math.max(60, (q.r || 0) + 30);
    out.push({ id: t.id, x: q.x, y: q.y, reach });
  }
  nearCache.set(W, out);
  return out;
}

// Learns the names of things within reach of (x, y). Returns the new ids.
export function learnNearby(state, x, y, W = WORLD) {
  const fresh = [];
  for (const n of nearTargets(W)) {
    if (state.knownTopics.has(n.id)) continue;
    if (Math.hypot(n.x - x, n.y - y) > n.reach) continue;
    state.knownTopics.add(n.id);
    fresh.push(n.id);
  }
  return fresh;
}
