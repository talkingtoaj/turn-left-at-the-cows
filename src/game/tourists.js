// Tourists (issue 27). One per mission at a fixed spot, an easy-to-miss egg.
// A tourist is a local flagged `tourist` in a world add-on (the spot, see
// src/world/addons/tourist_fenwick.js); this table holds what she says, the
// three replies, and the win-screen ticks, keyed by mission id. To give
// another mission a tourist, add an entry here and an add-on entry for her.
//
// Strangers speak plain English: no gibberish voice, just the subtitle box.
// Replies are written the way locals talk. Exactly one is right
// (`right: true`); `route` lists the roads each reply sends her along, and
// tools/check-tourists.mjs walks them against the world data. No score.
//
// Line ids (for the review page, lines/issue27.json) are in the `id` fields.

import { MISSION_LIST } from './missionList.js';

export const TOURISTS = {
  m1_parcel: {
    localId: 'tourist_miami',
    // The place she wants, a topic id (src/world/topics.js). Never the goal.
    placeTopic: 'calder',
    placeName: 'Calder',
    // Where the right route ends: a town in the world data.
    placeTown: 'calder',
    ask: [
      { id: 't1-ask-1', text: "Oh, thank goodness, a person! Hi. I'm visiting from Miami. We've been up and down this lane twice now, and the burned mill keeps showing up." },
      { id: 't1-ask-2', text: "We're trying to get to Calder. Which way would you say?" },
    ],
    choices: [
      {
        id: 't1-reply-b', right: false,
        route: ['mill_lane', 'hwy9', 'creek_rd'],
        text: "Back down to the highway and right, through Ashford. Take Creek Road all the way up. Calder's at the top end, just past the old bridge.",
        thanks: "Right through Ashford, then Creek Road. Got it! Thank you so much. Back home people just honk at us.",
        notebook: "Sent a woman from Miami to Calder by Creek Road. Might want to check that.",
        tick: "Misdirected a pesky tourist. Keeping Ashford safe from rubber-necks.",
      },
      {
        id: 't1-reply-a', right: true,
        route: ['mill_lane', 'hwy9', 'rt40'],
        text: "Back down this lane to the highway. Left, and keep on Highway 9 round the bend and over the creek. Then right at the Route 40 sign. Calder's at the far end, silos and all.",
        thanks: "Left on the highway, then Route 40. Got it! Thank you so much. Back home people just honk at us.",
        notebook: "Told a woman from Miami the way to Calder: left on Highway 9, right at the Route 40 sign.",
        tick: "Helped a tourist from Miami. Spreading good vibes.",
      },
      {
        id: 't1-reply-c', right: false,
        route: ['mill_lane', 'hwy9', 'millbrook_st', 'farm_rd'],
        text: "Left on the highway and straight on past the Route 40 sign, into Millbrook. Hartley Lane's the dirt one with the big red barn. Calder's right behind it.",
        thanks: "Left, then straight on to Millbrook and the red barn. Got it! Thank you so much. Back home people just honk at us.",
        notebook: "Sent a woman from Miami to Calder by way of Hartley Lane. Might want to check that.",
        tick: "Misdirected a pesky tourist. Keeping Ashford safe from rubber-necks.",
      },
    ],
    after: "Still here. Writing it all down. Thank you again!",
  },
};

export function currentMissionId(state) {
  const m = MISSION_LIST[state.missionIndex];
  return m ? m.id : null;
}

// The tourist def for a mission, or null.
export function touristFor(missionId) {
  return TOURISTS[missionId] || null;
}

// The tourist for a local id in the current mission, or null.
export function touristByLocal(state, localId) {
  const t = TOURISTS[currentMissionId(state)];
  return t && t.localId === localId ? t : null;
}

// What to show when you walk up: { name, pages, choices } where `choices` is
// null once she has been answered.
export function openTourist(state, localId) {
  const t = touristByLocal(state, localId);
  if (!t) return null;
  const done = state.tourists[localId];
  if (done) return { name: 'The tourist', pages: [t.after], choices: null };
  return { name: 'The tourist, visiting from Miami', pages: t.ask.map((a) => a.text), choices: t.choices.map((c) => c.text) };
}

// You picked reply `index`. Records it, writes the notebook line, and returns
// her answer. Picking twice does nothing the second time.
export function answerTourist(state, localId, index) {
  const t = touristByLocal(state, localId);
  const c = t && t.choices[index];
  if (!c || state.tourists[localId]) return null;
  state.tourists[localId] = { index, right: !!c.right };
  state.notebook.push({
    npcId: localId, name: 'The tourist', topicId: t.placeTopic, text: c.notebook,
    missionId: currentMissionId(state), clockMinutes: state.clockMinutes,
  });
  return [c.thanks];
}

// Lines for the win panel's tick list: one per tourist you answered in this
// mission.
export function touristTicks(state, missionId) {
  const t = TOURISTS[missionId];
  const done = t && state.tourists[t.localId];
  return done ? [t.choices[done.index].tick] : [];
}
