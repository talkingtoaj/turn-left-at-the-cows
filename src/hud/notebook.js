// Notebook helpers: what the player has heard, grouped by who said it.
// Pure functions over state.notebook (no Phaser).

import { getNpc, topicLabel } from '../game/dialogue.js';

// Groups state.notebook by person, in the order you first heard from them.
// Entries keep notebook order (newest last).
// -> [{ key, title, entries: [{ topicId, topic, text, brief }] }]
export function notebookGroups(notebook) {
  const groups = new Map();
  for (const n of notebook) {
    const key = n.npcId || '_brief';
    let gr = groups.get(key);
    if (!gr) {
      const npc = n.npcId ? getNpc(n.npcId) : null;
      const title = npc ? `${npc.name}, ${npc.role}` : n.name || 'The job';
      gr = { key, title, entries: [] };
      groups.set(key, gr);
    }
    gr.entries.push({ topicId: n.topicId, topic: topicLabel(n.topicId), text: n.text, brief: !!n.brief });
  }
  return [...groups.values()];
}

// Has the player already asked this person about this topic?
export function askedAbout(notebook, npcId, topicId) {
  return notebook.some((n) => n.npcId === npcId && n.topicId === topicId && !n.brief);
}
