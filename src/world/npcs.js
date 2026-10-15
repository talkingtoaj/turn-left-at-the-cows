// People the player can talk to. Topic-based, hand-written dialogue.
//
// Each NPC:
//   id, name, role, x, y        where they stand (within ~20 m of a road)
//   greeting: [lines]           said when you walk up
//   topics: { topicId: { lines: [...], unlocks: [topicIds] } }
//                               what they say when asked about a topic.
//                               `unlocks` are topics they mention, which the
//                               player can then ask other people about.
//   fallback: [lines]           for topics they know nothing about (one is picked)
//   profile: hidden facts, not used by code yet. Groundwork for a future
//            procedural direction generator:
//     home, work: place/building/town ids or [x, y]
//     routes: road ids they drive often (they know these well)
//     yearsHere: how long they have lived here (old-timers use old names)
//     style: 'landmarks' | 'roads' | 'compass' | 'distances' (how they give directions)
//     reliability: notes on what they get wrong
// Each string in a lines array is one page of dialogue. Topic ids are in topics.js.

export const NPCS = [
  // ---------------------------------------------------------------- mission 1
  {
    id: 'earl', name: 'Earl', role: 'gas station attendant', x: 680, y: 2398,
    greeting: ["Morning! Fill her up? No? Then what can I do for you?"],
    topics: {
      hartley_farm: {
        lines: [
          "Hartley Farm? Sure. Quickest way's the old Creek Road.",
          "Go straight north out of town on the dirt road, right here by the station. Keep going a good while, couple kilometres.",
          "You'll cross the old bridge over Willow Creek. After that the road bends right, east, past the radio mast up on the hill.",
          "Follow it into Millbrook. Farm's out the northeast side of town. Big red barn, can't miss it.",
        ],
        unlocks: ['creek_rd', 'willow_creek', 'old_bridge', 'radio_mast', 'millbrook'],
      },
      creek_rd: {
        lines: ["Creek Road starts right here by the pumps and runs north. Dirt the whole way. Mind the potholes."],
        unlocks: ['willow_creek'],
      },
      millbrook: {
        lines: ["Millbrook's up north-east. Highway 9 gets you there too. Longer, but it's paved."],
        unlocks: ['hwy9'],
      },
      hwy9: {
        lines: ["Highway 9 runs east out of town, past the water tower, then swings north up to Millbrook."],
        unlocks: ['water_tower', 'millbrook'],
      },
      radio_mast: {
        lines: ["The radio mast? Up on the hill past the creek. Red light on top. You can see it for miles at night."],
      },
      willow_creek: {
        lines: ["Willow Creek cuts right across the county, west to east. Dot's usually fishing it, up by the old bridge."],
        unlocks: ['old_bridge'],
      },
      old_bridge: {
        lines: ["Old wooden bridge on Creek Road. Been there since before I was born. Creaks a bit."],
      },
      water_tower: {
        lines: ["Water tower's out east on the highway. Big silver tank on legs. Kids paint things on it every summer."],
      },
      ashford: {
        lines: ["Ashford? You're standing in it. Church, gas station, five houses and me."],
      },
      loon_pond: {
        lines: ["Loon Pond? That's way out past Calder, over the river. Never been. Fish don't bite for me anyway."],
        unlocks: ['calder', 'coldwater'],
      },
    },
    fallback: ["Can't say I know it. I mostly stay by the pumps.", "Never heard of it, sorry."],
    profile: {
      home: 'ashford', work: 'a_gas', routes: ['creek_rd', 'hwy9', 'ashford_st'], yearsHere: 38, style: 'landmarks',
      reliability: "Knows mission 1 roads well but has not driven Creek Road since spring: does not know the bridge washed out.",
    },
  },
  {
    id: 'dot', name: 'Dot', role: 'fishing by the creek', x: 628, y: 1395,
    greeting: ["Shh. You'll scare the fish. ...Well? What is it?"],
    topics: {
      hartley_farm: {
        lines: [
          "The bridge? Ha. Washed out in the spring floods. County still hasn't fixed it.",
          "You'll have to go back down to the highway and head east. Past the water tower, keep on till the road turns north and crosses the creek on the new bridge.",
          "That takes you right up into Millbrook. And don't bother with the lane by the water tower. Dead end. The old mill burned down years ago.",
        ],
        unlocks: ['hwy9', 'water_tower', 'mill_lane', 'old_mill', 'millbrook'],
      },
      old_bridge: {
        lines: ["Washed out in the spring floods, like I said. Nobody's crossing here unless they swim."],
      },
      creek_rd: {
        lines: ["Past the bridge the road's fine. Getting across is the problem now."],
      },
      willow_creek: {
        lines: ["Best trout in the county, right here. Don't you tell anyone."],
      },
      mill_lane: {
        lines: ["Mill Lane goes up from the highway to where the mill was. Stops there. Always did, whatever the old maps say."],
        unlocks: ['old_mill'],
      },
      old_mill: {
        lines: ["Burned in, oh, '91? Just walls left now, down by the creek."],
      },
      hwy9: {
        lines: ["The highway's the long way round. But it's the only way round, now."],
      },
      radio_mast: {
        lines: ["You can see the mast from here on a clear day. North-east, on the hill. Across the water, mind."],
      },
    },
    fallback: ["No idea. I just fish."],
    profile: {
      home: [520, 2380], work: null, routes: ['creek_rd', 'hwy9'], yearsHere: 25, style: 'landmarks',
      reliability: "Accurate and current about the creek and the bridge. Short on patience.",
    },
  },

  // ---------------------------------------------------------------- mission 2
  {
    id: 'hartley', name: 'Mrs Hartley', role: 'at Hartley Farm', x: 2632, y: 455,
    greeting: ["Oh, hello again, dear. Come in out of the wind."],
    topics: {
      toms_cabin: {
        lines: [
          "Take Church Street north out of Millbrook. Past the last houses it turns into Ridge Road.",
          "Stay on Ridge Road all the way. You'll pass through Dunmore. There's a store and not much else.",
          "Then over the Coldwater on the old covered bridge. Lovely thing, red, with a little roof on it.",
          "Keep on till you meet Pond Road and turn left. The cabin's at the end, past the campground. Tom's truck will be out front.",
        ],
        unlocks: ['millbrook', 'ridge_rd', 'dunmore', 'covered_bridge', 'coldwater', 'pond_rd', 'campground', 'loon_pond'],
      },
      hartley_farm: {
        lines: ["You're standing on it, dear. Forty-six years this spring."],
      },
      ridge_rd: {
        lines: ["Ridge Road's the old road east. My grandfather drove cattle along it."],
      },
      dunmore: {
        lines: ["Dunmore's hardly a town. Gus Lindqvist keeps the store. He'll set you right if you're lost."],
      },
      covered_bridge: {
        lines: ["The covered bridge over the river. Tom proposed to a girl on it once. She said no, poor boy."],
        unlocks: ['coldwater'],
      },
      loon_pond: {
        lines: ["Tom's been up at Loon Pond since April. Says he's fishing. I think he's hiding from his sister."],
      },
      calder: {
        lines: ["Calder? That's the long way round, down on Route 40. No, Ridge Road's quicker."],
        unlocks: ['rt40'],
      },
      millbrook: {
        lines: ["Millbrook's just down our lane. Church Street runs right through the middle."],
      },
    },
    fallback: ["Oh, I couldn't tell you. I don't get out that way any more."],
    profile: {
      home: 'hartley_farm', work: 'hartley_farm', routes: ['farm_rd', 'millbrook_st', 'ridge_rd'], yearsHere: 46, style: 'landmarks',
      reliability: "Has not driven east in about four years. Does not know the covered bridge collapsed. Mixes up Pond Road and Lookout Road (says turn left, should be straight on / right). Her sketch squashes distances.",
    },
  },
  {
    id: 'gus', name: 'Gus', role: 'runs the Dunmore store', x: 3372, y: 272,
    greeting: ["Afternoon. If you're after milk, I'm out till Thursday."],
    topics: {
      toms_cabin: {
        lines: [
          "Tom Hartley's place? Up on Loon Pond, sure. He was in Tuesday for bait.",
          "You won't get there on Ridge Road, though. The covered bridge roof came down under the snow in February. They've fenced it off.",
          "Take Quarry Road, south from the corner here. It comes out on Route 40 right by the river bridge. Go east over the river into Calder.",
          "In Calder, turn left up Pond Road. Goes all the way to the pond.",
        ],
        unlocks: ['covered_bridge', 'quarry_rd', 'rt40', 'coldwater', 'calder', 'pond_rd', 'loon_pond'],
      },
      covered_bridge: {
        lines: ["Roof came down in February. Heavy snow. County says they'll fix it. County says a lot of things."],
      },
      quarry_rd: {
        lines: ["Quarry Road. Watch for the gravel trucks. They don't slow down for anybody."],
        unlocks: ['quarry'],
      },
      ridge_rd: {
        lines: ["Ridge Road goes on east to the river. Dead end now, with the bridge out. Folks still try it."],
      },
      calder: {
        lines: ["Calder's the next town east, over the river. Got a diner, a grain elevator, and a stoplight they never turn on."],
        unlocks: ['diner', 'grain_silos'],
      },
      dunmore: {
        lines: ["Dunmore Corners. Four houses, one store, and me. Population's been nine since 1980."],
      },
      loon_pond: {
        lines: ["Good fishing at Loon Pond. Better than the river. Don't tell Tom I said so."],
      },
      rt40: {
        lines: ["Route 40 runs east and west, south of here. East to Calder, west to Highway 9."],
        unlocks: ['hwy9'],
      },
    },
    fallback: ["Never heard of it. And I've heard of most things."],
    profile: {
      home: 'd_h1', work: 'd_store', routes: ['ridge_rd', 'quarry_rd', 'rt40'], yearsHere: 31, style: 'roads',
      reliability: "Up to date. Says Quarry Road meets Route 40 'right by the river bridge'; really about 600 m west of it.",
    },
  },
  {
    id: 'marisol', name: 'Marisol', role: 'quarry foreman', x: 3572, y: 770,
    greeting: ["Hard hat area. What can I do for you?"],
    topics: {
      toms_cabin: {
        lines: [
          "A cabin on Loon Pond? Couldn't tell you which one. I know the pond's north-east of Calder.",
          "From here go south to Route 40, then east. Calder's maybe two kilometres along. You'll see the grain silos before anything else.",
        ],
        unlocks: ['rt40', 'calder', 'grain_silos', 'loon_pond'],
      },
      quarry_rd: {
        lines: ["South from here takes you down to Route 40. North goes up to Dunmore and Ridge Road."],
        unlocks: ['rt40', 'dunmore', 'ridge_rd'],
      },
      rt40: {
        lines: ["Route 40 runs east-west. East for Calder. West takes you back toward Highway 9."],
        unlocks: ['calder', 'hwy9'],
      },
      calder: {
        lines: ["Calder's east. About two kilometres once you hit Route 40. Look for the silos."],
        unlocks: ['grain_silos'],
      },
      quarry: {
        lines: ["Calder Stone Company. We've been digging this hole since 1962. Gets bigger every year."],
      },
      grain_silos: {
        lines: ["Big grey silos on the east side of Calder. You can see them from the top of the quarry."],
      },
      loon_pond: {
        lines: ["North-east of Calder, I think. My crew goes swimming there in August."],
      },
    },
    fallback: ["Sorry. I'm not from around here. Four years and I still get lost."],
    profile: {
      home: 'calder', work: 'quarry', routes: ['quarry_rd', 'rt40'], yearsHere: 4, style: 'compass',
      reliability: "Directions by compass, distances too long: Quarry Road to Calder is about 1 km, she says two.",
    },
  },
  {
    id: 'bev', name: 'Bev', role: 'waitress at the diner', x: 4655, y: 1150,
    greeting: ["Sit anywhere, hon. Coffee's fresh, pie's yesterday's."],
    topics: {
      toms_cabin: {
        lines: [
          "Tom? Tall fella, beard, tips in quarters? He's up at Loon Pond.",
          "Pond Road, north out of town, right by the diner here. It goes through the brook. No bridge, you just drive through. It's shallow this time of year.",
          "Past that there's a fork. Keep right for the pond. Left goes up to the fire tower.",
        ],
        unlocks: ['pond_rd', 'loon_brook', 'brook_ford', 'lookout', 'loon_pond'],
      },
      diner: {
        lines: ["This was the schoolhouse till '78. My mother learned her letters right where you're sitting."],
        unlocks: ['schoolhouse'],
      },
      schoolhouse: {
        lines: ["You're in it, hon. They made it a diner when the school bus started running to Brandt."],
        unlocks: ['brandt'],
      },
      calder: {
        lines: ["You're in it. That's most of it, out the window there."],
      },
      river_rd: {
        lines: ["Old River Road? Goes south past the Okafor place, then through the river. I wouldn't, in a car like that."],
        unlocks: ['okafor_farm', 'river_ford'],
      },
      pond_rd: {
        lines: ["Pond Road starts right outside. Head north, you can't miss it."],
      },
      loon_pond: {
        lines: ["Pretty up there. Loons and all. Mosquitoes the size of sparrows, though."],
      },
    },
    fallback: ["Hm. Ask Hank at the grain elevator. He knows every road from here to the state line."],
    profile: {
      home: 'calder', work: 'c_diner', routes: ['pond_rd', 'rt40', 'calder_st'], yearsHere: 22, style: 'landmarks',
      reliability: "Accurate. Says 'keep right' at the fork, which is correct for someone coming from Calder.",
    },
  },
  {
    id: 'hank', name: 'Hank', role: 'runs the grain elevator', x: 4955, y: 1158,
    greeting: ["Help you? Mind the trucks."],
    topics: {
      toms_cabin: {
        lines: [
          "Hartley's boy? Pond Road, from the corner by the diner. About two and a half kilometres to the end.",
          "Half a kilometre and you hit the ford. Another half or so there's a fork with Ridge Road. Stay on Pond Road, it bends east.",
          "Cabin's the last thing before the water. If you see the campground, you're nearly there.",
        ],
        unlocks: ['pond_rd', 'brook_ford', 'ridge_rd', 'campground', 'loon_pond'],
      },
      grain_silos: {
        lines: ["Forty metres tall, those silos. You can see them from the lookout, and from most places with a view."],
        unlocks: ['lookout'],
      },
      rt40: {
        lines: ["Route 40 goes east to Brandt, twenty-odd kilometres. West, it meets Highway 9 below Millbrook."],
        unlocks: ['brandt', 'hwy9', 'millbrook'],
      },
      covered_bridge: {
        lines: ["Covered bridge is shut. Has been since February. People still drive out there and turn round."],
      },
      ridge_rd: {
        lines: ["Ridge Road runs west from Pond Road to the river. Goes nowhere now, with the bridge shut."],
      },
      calder: {
        lines: ["Calder. Grain, gravel and gossip."],
      },
    },
    fallback: ["Can't help you there."],
    profile: {
      home: 'calder', work: 'silos', routes: ['rt40', 'pond_rd', 'river_rd'], yearsHere: 35, style: 'distances',
      reliability: "Gives distances, always about half again too long: Pond Road is about 1.6 km to the cabin, he says two and a half.",
    },
  },
  {
    id: 'frank', name: 'Frank', role: 'fire lookout volunteer', x: 5165, y: 318,
    greeting: ["Come up for the view? Two hundred steps. Worth every one."],
    topics: {
      toms_cabin: {
        lines: [
          "Ha. Let me guess. Somebody told you to turn left at Pond Road. Happens every week.",
          "The pond's east of here. Go back down this road to the fork and turn left. Pond Road runs east along the hill to the water.",
          "From up top I can see his truck. Cabin's on the west shore, right where the road ends.",
        ],
        unlocks: ['pond_rd', 'loon_pond'],
      },
      lookout: {
        lines: ["Built in 1934. I sit up there June to September and watch for smoke."],
      },
      loon_pond: {
        lines: ["Loon Pond's due east of here. You can see it shine in the afternoon."],
      },
      grain_silos: {
        lines: ["Those are the Calder silos, south-west of here. Best landmark in the county."],
        unlocks: ['calder'],
      },
      covered_bridge: {
        lines: ["From the tower you can see the hole in the roof. Like a broken tooth."],
      },
    },
    fallback: ["Can't see it from up here, whatever it is."],
    profile: {
      home: 'calder', work: 'lookout', routes: ['lookout_rd', 'pond_rd'], yearsHere: 12, style: 'compass',
      reliability: "Accurate, thinks in compass bearings. Knows people get Pond Road wrong.",
    },
  },
  {
    id: 'ade', name: 'Ade', role: 'dairy farmer', x: 4890, y: 2002,
    greeting: ["Hello there. Mind the cows. They think they own the road."],
    topics: {
      toms_cabin: {
        lines: ["Loon Pond? Go north on this road into Calder, then up Pond Road. You can't miss it."],
        unlocks: ['calder', 'pond_rd', 'loon_pond'],
      },
      river_ford: {
        lines: ["The ford's fine in summer. Water up to your hubcaps. In spring, forget it."],
      },
      river_rd: {
        lines: ["Old River Road runs west from here, through the ford, all the way back to Highway 9."],
        unlocks: ['river_ford', 'hwy9'],
      },
      okafor_farm: {
        lines: ["Forty head of Holsteins and one bad-tempered goat. Welcome."],
      },
      calder: {
        lines: ["Calder's just north. Ten minutes on this road."],
      },
    },
    fallback: ["I don't know that one, sorry."],
    profile: {
      home: 'okafor_farm', work: 'okafor_farm', routes: ['river_rd', 'calder_st', 'rt40'], yearsHere: 12, style: 'roads',
      reliability: "Accurate but brief. Thinks everything is 'ten minutes'.",
    },
  },
  {
    id: 'mabel', name: 'Mabel', role: 'retired teacher', x: 2972, y: 1085,
    greeting: ["Well now. Visitors. Sit, sit. Mind the sheep."],
    topics: {
      toms_cabin: {
        lines: [
          "The Hartley boy's cabin? Out on Loon Pond. Go east on the highway to Calder.",
          "Turn left at the schoolhouse. That's Pond Road.",
          "Then it's along the brook a ways and up past the old fire tower. You'll find it.",
        ],
        unlocks: ['rt40', 'calder', 'schoolhouse', 'pond_rd', 'loon_brook', 'lookout'],
      },
      schoolhouse: {
        lines: ["Calder schoolhouse. I taught there thirty years. White building with a bell on the roof. You can't miss it."],
      },
      rt40: {
        lines: ["Route 40. We just call it the highway. It was gravel when I was a girl."],
      },
      covered_bridge: {
        lines: ["The covered bridge on Ridge Road. We went courting there. Is it still standing?"],
      },
      pruitt_farm: {
        lines: ["My husband's family built this place. I keep the sheep now. They keep me."],
      },
    },
    fallback: ["Oh, I don't get out much now, dear."],
    profile: {
      home: 'pruitt_farm', work: null, routes: ['pruitt_ln', 'rt40'], yearsHere: 71, style: 'landmarks',
      reliability: "Outdated landmarks: the schoolhouse is the diner now (bell gone). 'Up past the fire tower' is wrong: the tower is up a side road.",
    },
  },
];
