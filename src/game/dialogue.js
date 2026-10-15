// Topic-based dialogue over WORLD.locals (see src/world/npcs.js).
// No UI here: the HUDs call these and show the returned lines.

import { WORLD } from '../world/world.js';
import { TOPIC_BY_ID } from '../world/topics.js';
import { currentMission } from './missions.js';

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
  state.talkedTo.add(npcId);
  return npc.greeting ? [...npc.greeting] : [];
}

// Lines the NPC says about a topic. Adds the topics they mention to
// state.knownTopics and every line to state.notebook.
export function ask(npcId, topicId, state) {
  const npc = getNpc(npcId);
  if (!npc) return [];
  state.talkedTo.add(npcId);
  state.knownTopics.add(topicId);
  const entry = npc.topics && npc.topics[topicId];
  let lines;
  if (entry) {
    lines = [...entry.lines];
    for (const t of entry.unlocks || []) state.knownTopics.add(t);
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
