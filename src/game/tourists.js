// Tourists (issue 27). One per mission at a fixed spot, an easy-to-miss egg.
// A tourist is a local flagged `tourist` in a world add-on (the spot, see
// src/world/addons/tourist_fenwick.js); this table holds what she says, the
// three replies, and the win-screen ticks, keyed by mission id. To give
// another mission a tourist, add an entry here and an add-on entry for her.
//
// Strangers mumble in a gibberish voice with subtitles, like locals do
// (src/audio/voice.js gives each one a voice). Replies are written the way
// locals talk. Exactly one is right (`right: true`); `route` lists the roads
// each reply sends her along, and `names` lists the topic ids the words name.
// tools/check-tourists.mjs walks the routes against the world data and checks
// `names` matches the words. A reply is offered only once you know every name
// in it (state.knownTopics); "Sorry, I don't know" is always the last option.
// Picking it gets her `sorry` line, no tick, no notebook line, and she asks
// again next time you walk up. No score.
//
// Line ids (for the review page, lines/issue27.json) are in the `id` fields.

import { MISSION_LIST } from './missionList.js';

export const TOURISTS = {
  m1_parcel: {
    localId: 'tourist_miami',
    name: 'The tourist',
    title: 'The tourist, visiting from Miami',
    // The place she wants, a topic id (src/world/topics.js). Never the goal.
    placeTopic: 'calder',
    placeName: 'Calder',
    // Where the right route ends: a town in the world data (or `placeAt: [x, y]`).
    placeTown: 'calder',
    ask: [
      { id: 't1-ask-1', text: "Oh, thank goodness, a person! Hi. I'm visiting from Miami. We've been up and down this lane twice now." },
      { id: 't1-ask-2', text: "We're trying to get to Calder. Which way would you say?" },
    ],
    choices: [
      {
        id: 't1-reply-b', right: false,
        names: ['hwy9', 'ashford', 'creek_rd', 'old_bridge'],
        route: ['mill_lane', 'hwy9', 'creek_rd'],
        text: "Back down to the highway and right, through Ashford. Take Creek Road all the way up. Calder's at the top end, just past the old bridge.",
        thanks: "Right through Ashford, then Creek Road. Got it! Thank you so much.",
        notebook: "Misdirected a woman from Miami.",
        tick: "Misdirected a pesky tourist. Keeping Ashford safe from rubber-necks.",
      },
      {
        id: 't1-reply-a', right: true,
        names: ['hwy9', 'rt40'],
        route: ['mill_lane', 'hwy9', 'rt40'],
        text: "Back down this lane to the highway. Left, and keep on Highway 9 around the bend and over the creek. Then right at the Route 40 sign. Calder's at the far end, silos and all.",
        thanks: "Left on the highway, then Route 40. Got it! Thank you so much.",
        notebook: "Helped a woman from Miami find Calder.",
        tick: "Helped a tourist from Miami. Spreading good vibes.",
      },
      {
        id: 't1-reply-c', right: false,
        names: ['hwy9', 'rt40', 'millbrook'],
        route: ['mill_lane', 'hwy9', 'millbrook_st', 'farm_rd'],
        text: "Left on the highway and straight on past the Route 40 sign, into Millbrook. Hartley Lane's the dirt one with the big red barn. Calder's right behind it.",
        thanks: "Left, then straight on to Millbrook and the red barn. Got it! Thank you so much.",
        notebook: "Misdirected a woman from Miami.",
        tick: "Misdirected a pesky tourist. Keeping Ashford safe from rubber-necks.",
      },
    ],
    sorry: "Oh, that's all right. Thanks anyway!",
    after: "Still here. Writing it all down. Thank you again!",
  },
  m2_cabin: {
    localId: 'tourist_lawyer',
    name: 'The lawyer',
    title: 'The lawyer, down from the city',
    // Ade Okafor's dairy on Old River Road, with the papers from his wife.
    placeTopic: 'okafor_farm',
    placeName: 'the Okafor dairy',
    placeAt: [4915, 2032],
    ask: [
      { id: 't2-ask-1', text: "Afternoon. Sorry to stop you. I'm a lawyer, down from the city, and I took a wrong turn about an hour ago." },
      { id: 't2-ask-2', text: "I'm looking for the Okafor dairy. I have some papers for Ade Okafor, from his wife. Which way do I go?" },
    ],
    choices: [
      {
        id: 't2-reply-b', right: false,
        names: ['hwy9', 'rt40', 'calder', 'diner'],
        route: ['dolan_ln', 'hwy9', 'rt40', 'calder_st'],
        text: "Left on the highway, then the Route 40 turn east. Keep on into Calder and past the diner. The dairy's on the road just south of town.",
        thanks: "Left, Route 40, past the diner in Calder. Got it. Thank you.",
        notebook: "Misdirected a lawyer.",
        tick: "Saved Ade from being served divorce papers.",
      },
      {
        id: 't2-reply-a', right: true,
        names: ['hwy9', 'river_rd', 'okafor_farm'],
        route: ['dolan_ln', 'hwy9', 'river_rd'],
        text: "Back out to the highway and left. Go south till you pass the old railroad bank, then on to where the road bends hard. Old River Road goes off east, the dirt one. Through the ford, and you'll see the Okafor dairy.",
        thanks: "Left, past the railroad bank, then Old River Road and the ford. Got it. Thank you.",
        notebook: "Helped a lawyer find the Okafor dairy.",
        tick: "Helped a lawyer find the Okafor dairy. Somebody's having a bad day.",
      },
      {
        id: 't2-reply-c', right: false,
        names: ['hwy9', 'millbrook', 'ridge_rd', 'covered_bridge'],
        route: ['dolan_ln', 'hwy9', 'millbrook_st', 'ridge_rd'],
        text: "Right on the highway, up to Millbrook. Then Church Street and Ridge Road east, past the covered bridge. The dairy's on the Dunmore side.",
        thanks: "Right to Millbrook, then Ridge Road past the covered bridge. Got it. Thank you.",
        notebook: "Misdirected a lawyer.",
        tick: "Saved Ade from being served divorce papers.",
      },
    ],
    sorry: "That's all right. Thank you anyway.",
    after: "Still here. Reading my map. Thanks again.",
  },
  m3_airfield: {
    localId: 'tourist_spotter',
    name: 'The plane spotter',
    title: 'The plane spotter, with binoculars',
    // The diner in Brandt (Peg's). Never the goal, Kestrel Field.
    placeTopic: 'diner_b',
    placeName: 'the diner in Brandt',
    placeAt: [1622, 1640],
    ask: [
      { id: 't3-ask-1', text: "Hello! Sorry. I drove up from the city to watch the little planes. They come right over this road. Now I'm hungry." },
      { id: 't3-ask-2', text: "Everyone says the diner in Brandt has the best pie in Harlan County. Which way is that from here?" },
    ],
    choices: [
      {
        id: 't3-reply-b', right: false,
        names: ['rt40', 'pike_lane', 'kestrel_field', 'planes'],
        route: ['oakham_rd', 'rt40', 'pike_ln'],
        text: "Left on Route 40, then right up Pike Lane, past Hal's sheep. The flying club does pie too, and you can watch the planes while you eat.",
        thanks: "Left, then Pike Lane past the sheep. Got it. Thank you!",
        notebook: "Misdirected a plane spotter.",
        tick: "Sent a plane spotter the wrong way.",
      },
      {
        id: 't3-reply-a', right: true,
        names: ['rt40', 'brandt', 'station_rd'],
        route: ['oakham_rd', 'rt40'],
        text: "Up to Route 40 and left, and keep on through Brandt. Past the gas pumps and Station Road, and the diner's on your right. Peg's the waitress. Try the pie.",
        thanks: "Left, through Brandt, past the gas pumps. Got it. Thank you!",
        notebook: "Helped a plane spotter find the diner.",
        tick: "Helped a plane spotter find the diner in Brandt.",
      },
      {
        id: 't3-reply-c', right: false,
        names: ['rt40', 'station_rd', 'brandt_elevator'],
        route: ['oakham_rd', 'rt40', 'station_rd', 'north_rd'],
        text: "Left on Route 40 and right at Station Road, by the gas pumps. Go north up to the elevator. The diner's just across from it.",
        thanks: "Left, then Station Road up to the elevator. Got it. Thanks a lot!",
        notebook: "Misdirected a plane spotter.",
        tick: "Sent a pesky plane spotter the wrong way.",
      },
    ],
    sorry: "No problem. Thanks anyway!",
    after: "Still here. Watching a plane. Thanks again!",
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
  if (done) return { name: t.name, pages: [t.after], choices: null };
  return { name: t.title, pages: t.ask.map((a) => a.text), choices: touristReplies(state, localId).texts };
}

export const SORRY_TEXT = "Sorry, I don't know.";

// The replies on offer now: only those whose every named place you have come
// across, then "Sorry, I don't know." last. { texts, idx } where idx[i] is the
// reply's place in the table, or -1 for the sorry option.
export function touristReplies(state, localId) {
  const t = touristByLocal(state, localId);
  const texts = [];
  const idx = [];
  if (t) {
    t.choices.forEach((c, i) => {
      if (c.names.every((id) => state.knownTopics.has(id))) {
        texts.push(c.text);
        idx.push(i);
      }
    });
  }
  texts.push(SORRY_TEXT);
  idx.push(-1);
  return { texts, idx };
}

// You picked reply `index` (-1 is "Sorry, I don't know"). Records it, writes
// the notebook line, and returns her answer. Picking twice does nothing the
// second time. "Sorry" records nothing: she thanks you and asks again later.
export function answerTourist(state, localId, index) {
  const t = touristByLocal(state, localId);
  if (!t || state.tourists[localId]) return null;
  if (index === -1) return [t.sorry];
  const c = t.choices[index];
  if (!c) return null;
  state.tourists[localId] = { index, right: !!c.right };
  state.notebook.push({
    npcId: localId, name: t.name, topicId: t.placeTopic, text: c.notebook,
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
