// People in the Brandt region (region 2, mission 3: the airfield). Same
// format as ./npcs.js. Nobody here gives the airfield away: the town has
// only heard the planes, the one person with directions is out of date (the
// lane she sends you down was fenced off in 1984), and the farmer at the end
// of it tells you to go round, or to watch the planes.

export const NPCS_BRANDT = [
  {
    id: 'lou', name: 'Lou', role: 'mechanic at the Brandt garage', x: 1792, y: 1617,
    greeting: ["Afternoon. You're not from round here. Plates give it away."],
    topics: {
      kestrel_field: {
        lines: [
          "The flying club? Out east of town somewhere. I fix their mower, not their planes. Never been up there myself.",
          "Tell you what, though. You'll hear them before you see them. On a fine day they go round and round all morning.",
          "Head east on Route 40 and keep your window down.",
        ],
        unlocks: ['planes', 'rt40'],
      },
      planes: {
        lines: [
          "Little high-wing jobs. Cubs, a Cessna or two. Up one side, along, down the other side, land, off again. Drives my dog crazy.",
          "Funny thing. They never fly straight over the field itself, always round it. So don't drive to where they are. Drive to the middle.",
        ],
      },
      brandt: {
        lines: ["Brandt. Garage, diner, church, the elevator. Five hundred and some people and half of them owe me money."],
        unlocks: ['brandt_elevator', 'diner_b'],
      },
      rt40: {
        lines: ["Route 40 runs east and west through town. West goes back to Calder, east to Corley, eventually."],
        unlocks: ['corley', 'sandy_creek'],
      },
      north_rd: {
        lines: ["North Road starts at the top of Station Road by the elevator and runs up to the farms. Dirt the whole way."],
      },
      field_lane: {
        lines: ["Field Lane? Off North Road, on the right. Goes out to Dagny's place. Can't say what's past that."],
        unlocks: ['dagny_farm'],
      },
      oakham: {
        lines: ["Oakham's south-east. Oakham Road off the highway is quickest. South Road gets you there too, the long way."],
        unlocks: ['oakham_rd', 'south_rd'],
      },
      sandy_creek: {
        lines: ["Sandy Creek runs north to south, just east of town. The highway bridge is fine. Up north there's only a ford."],
      },
      corley: {
        lines: ["Corley? Thirty-odd kilometres east. Bigger town. Don't bother."],
      },
      ray: {
        lines: ["Ray Kessler. The flying fellow. Comes in for petrol for his mower and talks about wind for an hour."],
      },
      windsock: {
        lines: ["The orange sock thing? That's at the airfield. Never seen it myself."],
      },
    },
    fallback: ["Couldn't tell you. Ask Peg at the diner, she hears everything.", "Never heard of it. I mostly see the underside of cars."],
    profile: {
      home: 'brandt', work: 'br_gas', routes: ['rt40', 'station_rd'], yearsHere: 19, style: 'compass',
      reliability: "Never been to the airfield. Knows the planes circle it, and says so: the one honest clue.",
    },
  },
  {
    id: 'peg', name: 'Peg', role: 'waitress at the diner', x: 1622, y: 1619,
    greeting: ["Sit anywhere, hon. Coffee? ...Oh, you just want to ask something. Go on then."],
    topics: {
      kestrel_field: {
        lines: [
          "Oh, Kestrel Field! It was an army training strip in the war. Ray Kessler runs a little flying club out there now. He's in here every morning for pie.",
          "Take Station Road north out of town, past the elevator, and keep on up North Road.",
          "Turn right on Field Lane and follow it east, over the ford, till you see the windsock. Bright orange, you can't miss it.",
        ],
        unlocks: ['north_rd', 'field_lane', 'windsock', 'ray', 'brandt_elevator', 'station_rd'],
      },
      windsock: {
        lines: [
          "A great orange stocking on a pole, to show the pilots the wind. Ray says they always take off and land facing into it.",
          "Wind's mostly from the west round here. Not always.",
        ],
        unlocks: ['wind'],
      },
      wind: {
        lines: ["You'll see which way it's blowing from the chimney smoke. And the planes, if you know what Ray knows."],
      },
      ray: {
        lines: ["Ray Kessler. Flew crop dusters for forty years. Has the apple pie with the cream on top, every day, eight o'clock."],
      },
      brandt_elevator: {
        lines: ["The old co-op elevator, at the top of Station Road. Tallest thing in Brandt. You can see it from anywhere in town."],
      },
      station_rd: {
        lines: ["Station Road's our main street, the one going north from the highway. No station any more, mind."],
      },
      north_rd: {
        lines: ["North Road goes up from the elevator, past the turn for Field Lane, to the Lindgren place at the top."],
      },
      field_lane: {
        lines: ["Field Lane goes off North Road on the right, maybe a kilometre up. That's the way to the airfield. Always was."],
      },
      planes: {
        lines: ["You hear them going over all morning. I don't look up any more."],
      },
      brandt: {
        lines: ["Born here, never left. Well, Corley once. Didn't care for it."],
      },
    },
    fallback: ["No idea, hon. More coffee?", "Never heard of it. You could ask Lou at the garage."],
    profile: {
      home: 'brandt', work: 'br_diner', routes: ['station_rd', 'north_rd'], yearsHere: 52, style: 'roads',
      reliability: "Has not been out to the airfield since the 1970s: sends you down Field Lane, which Dagny fenced off in 1984.",
    },
  },
  {
    id: 'dagny', name: 'Dagny', role: 'farmer at the end of Field Lane', x: 2470, y: 946,
    greeting: ["This is the end of the road, friend. Literally."],
    topics: {
      kestrel_field: {
        lines: [
          "Field Lane used to run on to the strip, back when it was the army's. I fenced it off in '84 after one of their planes put down in my barley. Haven't spoken to Ray Kessler since.",
          "You'll have to go round. Back to the highway and east over the creek. Turn left at the cows. That's Pike Lane, and the club got in from that side.",
          "Or watch the planes. Ray's lot fly round and round the field all day. Whatever's in the middle of all that circling, that's it.",
        ],
        unlocks: ['rt40', 'planes', 'sandy_creek', 'pike_lane'],
      },
      planes: {
        lines: [
          "Every ten minutes, round they go. Up off the strip, out over the highway, back along it, and down again.",
          "When the wind's in the west they come in from the east, low, and land going west. Other way round when it's from the east.",
        ],
        unlocks: ['wind'],
      },
      wind: {
        lines: ["Wind? Look at the smoke. Look at their sock if you can see it. They land into it, always."],
      },
      field_lane: {
        lines: ["My lane now, near enough. The old county map still shows it going through. It doesn't."],
      },
      pike_lane: {
        lines: ["Pike Lane, off Route 40. Hal Pike let the club have the top of it. Ask Hal, he's usually at his gate."],
        unlocks: ['hal_pike'],
      },
      dagny_farm: {
        lines: ["Barley, a few cows, and a lot of aeroplanes. Mostly the aeroplanes."],
      },
      ray: {
        lines: ["Kessler. Hmph."],
      },
      windsock: {
        lines: ["Orange thing on a pole. Over there, past my barley, if it's not lying flat."],
      },
    },
    fallback: ["Don't know it.", "Couldn't say."],
    profile: {
      home: 'dagny_farm', work: 'dagny_farm', routes: ['field_lane', 'north_rd'], yearsHere: 40, style: 'compass',
      reliability: "Right about everything, but won't name the club's lane until asked about Pike Lane.",
    },
  },
  {
    id: 'hal', name: 'Hal Pike', role: 'sheep farmer, at his gate', x: 3279, y: 1691,
    greeting: ["Mind the sheep if you're turning in. They've no road sense."],
    topics: {
      kestrel_field: {
        lines: [
          "The strip? Up my lane, past the house and the top paddock. The club's at the far end, behind their hangars.",
          "Shut the gate after you if it's shut. It never is.",
        ],
        unlocks: ['pike_lane'],
      },
      pike_lane: {
        lines: ["My lane. Right here. It goes up past the house to the club and stops."],
      },
      planes: {
        lines: ["Come right over the house when the wind's in the east. Sheep don't mind. I mind."],
      },
      hal_pike: {
        lines: ["That's me. Pike. Sheep. Since 1961."],
      },
      ray: {
        lines: ["Ray's all right. Pays his rent for the top of the lane in whisky."],
      },
      dagny_farm: {
        lines: ["Dagny's west of the strip, on Field Lane. She and Ray don't talk. Don't bring it up."],
      },
    },
    fallback: ["Can't help you there.", "Never heard of it."],
    profile: {
      home: 'hal_pike', work: 'hal_pike', routes: ['pike_lane', 'rt40'], yearsHere: 63, style: 'landmarks',
      reliability: "Gives it away if you find him, which is the point.",
    },
  },
  {
    id: 'ames', name: 'Mrs Ames', role: 'runs the Oakham store', x: 3924, y: 2318,
    greeting: ["Hello, love. We close for lunch at twelve, mind."],
    topics: {
      kestrel_field: {
        lines: [
          "An airfield? North of the highway somewhere, I think. I've heard the planes, love, but I've never been.",
          "If you can see them going round and round, the field's in the middle of the round, isn't it? Stands to reason.",
          "You'd do better asking in Brandt. West on the highway.",
        ],
        unlocks: ['planes', 'brandt', 'rt40'],
      },
      oakham: {
        lines: ["Oakham. A store, a water tower and eleven people. Twelve on a Sunday."],
        unlocks: ['oakham_tower'],
      },
      oakham_tower: {
        lines: ["The water tower's just behind the store. Painted it myself in '79. Well, my husband did."],
      },
      mallard_pond: {
        lines: ["Mallard Pond, west of here off South Road. Nice for a picnic."],
      },
      planes: {
        lines: ["I hear them some mornings, far off. Like a big bee in a jar."],
      },
      south_rd: {
        lines: ["South Road runs west from here to Brandt, the long way, past the pond and over the creek."],
        unlocks: ['mallard_pond'],
      },
    },
    fallback: ["Never heard of it, love.", "You'd have to ask someone in Brandt."],
    profile: {
      home: 'oakham', work: 'oak_store', routes: ['oakham_rd', 'south_rd'], yearsHere: 47, style: 'landmarks',
      reliability: "Never been north of the highway; guesses well.",
    },
  },
  {
    id: 'ray', name: 'Ray Kessler', role: 'at the flying club', x: 3312, y: 1047,
    greeting: ["Hello! You found us. Most people follow the noise."],
    topics: {
      kestrel_field: {
        lines: ["Kestrel Field. Eight hundred metres of grass, two hangars and the best kettle in the county. Built by the army in '42."],
      },
      planes: {
        lines: [
          "We fly a left-hand circuit when we land west, right-hand when we land east. Either way the downwind leg runs out over the highway. Keeps the noise off Brandt.",
          "So if you see one flying along Route 40, look north. The field's a kilometre up, give or take.",
        ],
      },
      windsock: {
        lines: ["The sock points where the wind's going. We take off and land facing the other way, into it."],
      },
      wind: {
        lines: ["Mostly westerly. Some days it swings round to the east and everything goes the other way."],
      },
      ray: {
        lines: ["Crop dusting for forty years, and now I teach youngsters to go round in circles."],
      },
      dagny_farm: {
        lines: ["Ah. Dagny. We had a small disagreement about some barley. In 1984."],
      },
    },
    fallback: ["No idea. I only know things from above."],
    profile: {
      home: 'kestrel_field', work: 'kestrel_field', routes: ['pike_lane', 'rt40'], yearsHere: 44, style: 'compass',
      reliability: "At the goal. Explains the circuit after you have found it.",
    },
  },
];
