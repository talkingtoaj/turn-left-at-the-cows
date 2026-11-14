// Radio segment list. Engine-free: plain data, no imports, safe to load from
// node scripts (the AM tool, check scripts) and from the game.
//
// Read by: the radio player (#19), the AM tool (#20), and #21.
// Scripts and music briefs for the owner are in docs/radio/scripts.md.
// SPEC 9o "Radio" has the rules these follow.
//
// STATIONS (array), each:
//   id          'ashford' | 'brandt'
//   name        what the DJ calls the station
//   callSign    four letters
//   freqKhz     AM dial position in kHz (1992 US AM steps by 10)
//   homeTown    the only town the station names
//   mastId      id of the radio mast landmark that broadcasts it. 'mast' exists in
//               data.js. 'mast_brandt' is NEW and must be added near Brandt
//               (data_brandt.js or addons.js, kind 'radio_mast') by whoever builds #20/#21.
//   dj          { name, voice }  voice is a short note for ElevenLabs
//   tagline     the line the jingle and first link use
//   rotation    segment ids in the order the station loops them, then starts over.
//               Every segment of the station appears exactly once.
//
// SEGMENTS (array), each:
//   id          'ashford_link_1' (station_kind_n)
//   station     station id
//   kind        'link' | 'farm' | 'swap' | 'weather' | 'ad' | 'notices' | 'guest'   (spoken)
//               'jingle' | 'music'                                                  (music)
//   spoken      true for the 11 spoken pieces, false for the 5 music slots
//   file        file name the owner records to, MP3, in the owner's masters folder.
//               The AM tool writes the same name into public/.
//   seconds     length in seconds. A guess until `npm run radio:bake -- <dir> --write-durations`
//               copies the real baked length here.
//   speaker     who is talking (spoken only)
//   subtitle    English subtitle text (spoken only, '' for music). Blank line = new
//               subtitle card. A line starting with '~' is a local talking gibberish:
//               show NO subtitle for it (only the guest spot has these).
//   voiceNotes  ElevenLabs notes (spoken) or the music brief (music)
//   scriptKey   spoken only: id of the line in T17 review (same as `id`), so approved
//               edits can be applied back to this file.
//
// Rules the scripts follow (SPEC 9o): own home town only, never a live "here"
// report, no "today / tonight / this morning" (the player can tune in at any
// clock time), July 1992, no real song or artist names.

// Where the AM tool writes baked files and where the radio player streams them
// from. Folder under public/, one subfolder per station. URL for a segment:
//   radioAudioUrl(seg)  ->  '/radio/ashford/ashford_link_1.mp3'
// (the AM tool writes public/radio/<station>/<file>.)
export const RADIO_AUDIO_DIR = 'radio';
export function radioAudioUrl(seg) {
  return '/' + RADIO_AUDIO_DIR + '/' + seg.station + '/' + seg.file;
}

export const STATIONS = [
  {
    id: 'ashford',
    name: 'Radio Ashford',
    callSign: 'WHAY',
    freqKhz: 1010,
    homeTown: 'Ashford',
    mastId: 'mast',
    dj: { name: 'Dewey Halloran', voice: 'Older man, slow and dry, a little gravel, easygoing' },
    tagline: "Ashford's own, on the hill.",
    rotation: [
      'ashford_jingle', 'ashford_link_1', 'ashford_music_1', 'ashford_farm', 'ashford_ad_1',
      'ashford_music_2', 'ashford_link_2', 'ashford_swap', 'ashford_music_3', 'ashford_weather',
      'ashford_ad_2', 'ashford_link_3', 'ashford_notices', 'ashford_music_4', 'ashford_guest',
      'ashford_link_4',
    ],
  },
  {
    id: 'brandt',
    name: 'Brandt 1340',
    callSign: 'WBRT',
    freqKhz: 1340,
    homeTown: 'Brandt',
    mastId: 'mast_brandt',
    dj: { name: 'Rocky Tillman', voice: 'Woman in her thirties, bright and quick, big laugh, small-town warm' },
    tagline: 'The tallest voice in Brandt, second only to the elevator.',
    rotation: [
      'brandt_jingle', 'brandt_link_1', 'brandt_music_1', 'brandt_farm', 'brandt_ad_1',
      'brandt_music_2', 'brandt_link_2', 'brandt_swap', 'brandt_music_3', 'brandt_weather',
      'brandt_ad_2', 'brandt_link_3', 'brandt_notices', 'brandt_music_4', 'brandt_guest',
      'brandt_link_4',
    ],
  },
];

const DEWEY = 'Dewey Halloran';
const ROCKY = 'Rocky Tillman';
const DEWEY_VOICE = 'Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. ';
const ROCKY_VOICE = 'Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. ';

function spoken(id, station, kind, seconds, speaker, voiceNotes, subtitle) {
  return {
    id, station, kind, spoken: true, file: id + '.mp3', seconds, speaker, subtitle, voiceNotes, scriptKey: id,
  };
}
function music(id, station, kind, seconds, brief) {
  return { id, station, kind, spoken: false, file: id + '.mp3', seconds, speaker: '', subtitle: '', voiceNotes: brief };
}

export const SEGMENTS = [
  // ------------------------------------------------------------ Radio Ashford
  music('ashford_jingle', 'ashford', 'jingle', 8,
    'Station ID sting, about 8 seconds. Twangy electric guitar and a plucked banjo, a quick little rising run that ends on a happy chord. No singing. Worn and warm, like a tune the hardware store has played for forty years.'),
  spoken('ashford_link_1', 'ashford', 'link', 20, DEWEY,
    DEWEY_VOICE + 'Opening link. Unhurried. Pause after the call sign. Slight laugh on "went cold".',
    "WHAY, Radio Ashford, ten ten on your AM dial. Ashford's own, on the hill. This is Dewey Halloran.\n\nI've got records, a farm report, and a coffee that went cold around the second song. Stay with me."),
  music('ashford_music_1', 'ashford', 'music', 130,
    'About 2 minutes. Slow country waltz in 3/4. Dusty slide guitar, brushed drums, upright bass, a lonely fiddle on the tune. Mood: a porch at sundown. Instrumental, no vocals.'),
  spoken('ashford_farm', 'ashford', 'farm', 36, DEWEY,
    DEWEY_VOICE + 'Farm report. Read it flat and serious like the numbers matter, then let the cows line land as a deadpan.',
    "Time for the farm report. Corn is a little over two dollars a bushel. Soybeans, a little under six. Hogs are steady and cattle are steady, and so are the people who raise them, mostly.\n\nHay is up, because it rained when it shouldn't have. A cool summer, folks. Corn likes warm nights and we haven't had many.\n\nAnd check your gates. Somebody's cows were seen walking down Main Street on Sunday, and I won't say whose."),
  spoken('ashford_ad_1', 'ashford', 'ad', 22, DEWEY,
    DEWEY_VOICE + 'Ad. A touch more salesman than usual, but still Dewey: he thinks ads are a little silly. Smile on "do not mix them up".',
    "Earl's Gas and Garage, on Main Street. Regular gas, a dollar and five cents a gallon. Pop in the cooler. Worms in the other cooler. Please do not mix them up.\n\nEarl's. If you can see the pumps, you've found it."),
  music('ashford_music_2', 'ashford', 'music', 125,
    'About 2 minutes. Upbeat 1992 country line-dance shuffle in 4/4. Twangy electric guitar, handclaps, a steady kick-and-snare, a fiddle break. Mood: church hall floor on a Saturday. Instrumental.'),
  spoken('ashford_link_2', 'ashford', 'link', 24, DEWEY,
    DEWEY_VOICE + 'Link about the Olympics. Mildly grumpy and fond at the same time.',
    "The Olympics start in Barcelona this month, and they say the American basketball team is made of professionals. Pros, in the Olympics. In my day you needed a day job to get in.\n\nI'll be watching at the Millers'. Theirs is the only television that gets Channel 6. Mrs. Miller says I can come over if I bring a pie."),
  spoken('ashford_swap', 'ashford', 'swap', 34, DEWEY,
    DEWEY_VOICE + 'Swap shop. Read like a very serious list. A tiny pause before "Gerald".',
    "Swap shop. Call the station, or tell Earl at the pumps and he'll tell me.\n\nFirst up. A two-bottom plow, good shape, wants a rowboat. Next, a washing machine that walks across the floor when it spins. Free to a home with a strong back.\n\nWanted, one left boot, size ten, brown. Please don't ask about the right one. And last, five kittens, free, all of them named Gerald.\n\nThat's the swap shop. Fair trades only."),
  music('ashford_music_3', 'ashford', 'music', 135,
    'About 2 minutes. Old-time gospel hymn feel, slow 4/4. Wheezy pump organ and a small choir humming "ooh" with no words, soft acoustic guitar. Mood: the church on a quiet Sunday. Instrumental plus hum only.'),
  spoken('ashford_weather', 'ashford', 'weather', 28, DEWEY,
    DEWEY_VOICE + 'Weather and wind. A forecast for the week, not a live report. Dry on "why".',
    "The weather and wind, from the weather service, for the week. Highs in the upper seventies, which is cool for July. They blame a volcano in the Philippines that blew up last year.\n\nWinds mostly from the west, about ten miles an hour. Showers are possible. Bring the laundry in early."),
  spoken('ashford_ad_2', 'ashford', 'ad', 24, DEWEY,
    DEWEY_VOICE + 'Ad. Same sales voice as the first ad. A sigh on "and sigh".',
    "Hendricks Hardware and Feed, out on Highway 9. We sell nails, rope, chicken wire, and every kind of bucket. Bring your broken thing and Mr. Hendricks will look at it and sigh. He can usually fix it.\n\nHendricks. We have a new shipment of garden hoses."),
  music('ashford_music_4', 'ashford', 'music', 125,
    'About 2 minutes. Honky-tonk piano and fiddle, bouncy 2-beat two-step. A bit of brush snare and a walking bass. Mood: a Saturday night that is going fine. Instrumental.'),
  spoken('ashford_link_3', 'ashford', 'link', 22, DEWEY,
    DEWEY_VOICE + 'Link about the election. Gentle joke, not mean. Pause before "Creek Road".',
    "Folks keep asking me about Mr. Perot. He was in the race, now he's out, and I can't keep up. A man at the pumps asked who I'm voting for. I said whoever fixes the bridge on Creek Road.\n\nThat's all I've got on politics."),
  spoken('ashford_notices', 'ashford', 'notices', 40, DEWEY,
    DEWEY_VOICE + 'Local notices and birthdays. A warm, slow read, like he is reading off the back of an envelope. Laugh a little on "eleven years".',
    "Local notices. St. Anne's is having a bake sale on Saturday. The ladies ask that nobody sample the pies before they're priced. Mrs. Miller is back from her sister's. And the school board will not meet this month, because nobody can find the key.\n\nBirthdays. Happy birthday to Martha Ruggles, who is eighty-one. Happy birthday to Tommy Pratt, who is seven and wants it known that he is nearly eight.\n\nAnd happy birthday to the man at the pumps, who says he is forty-nine. He has said so for eleven years."),
  spoken('ashford_guest', 'ashford', 'guest', 48, 'Dewey Halloran and Earl (gibberish)',
    DEWEY_VOICE + 'Guest spot. Earl is the flattest man in the county: mumbling, low, no ups and downs, short bursts. His lines are made-up sounds with real sentence rhythm, not a real language. Record Earl as a second voice (older man, flat, mumbly). Leave a 3 to 4 second gap after each Dewey line where Earl speaks. Dewey answers as if every word made sense.',
    "I've got a visitor. Earl, from the pumps on Main Street. Earl, say hello.\n\n~ Mm. Nuh-hmm. Dannow poddle, ressa ka lun bo. Hmf.\n\nIs that right? Folks, Earl says the pumps are open till six, and the coffee is free if you bring your own cup. Is that right, Earl?\n\n~ Woomba. Heh.\n\nHe says it is. And Earl says to stay off Mill Lane. It goes up from the highway to where the mill used to be, and it stops there. It always has.\n\nThanks, Earl. Come back any time. Maybe bring a cup."),
  spoken('ashford_link_4', 'ashford', 'link', 24, DEWEY,
    DEWEY_VOICE + 'Link about line dancing and the church hall. Fond, a little worried about the floor.',
    "Line dancing is all anyone wants to do. Every Saturday somebody's cousin shows up in new boots, and the church hall floor is not what it was.\n\nIf you must dance, stay off the loose board by the piano. That's all I'm saying. More music, then back with me."),

  // ------------------------------------------------------------- Brandt 1340
  music('brandt_jingle', 'brandt', 'jingle', 8,
    'Station ID sting, about 8 seconds. Bright, bouncy: a snare roll, a jangly guitar chord, a little organ riff going up. No singing. Sounds like a diner jukebox playing the first bar of a happy song.'),
  spoken('brandt_link_1', 'brandt', 'link', 22, ROCKY,
    ROCKY_VOICE + 'Opening link. Big energy but still friendly, like she is talking across the counter. Laugh on "stiff".',
    "You're on WBRT, Brandt thirteen-forty, the tallest voice in town, second only to the elevator. I'm Rocky Tillman.\n\nI've got records, the farm report, and a swap shop that is getting out of hand. Don't touch that dial. Seriously, it's stiff, you'll break it."),
  music('brandt_music_1', 'brandt', 'music', 130,
    'About 2 minutes. Early rock and roll shuffle, 12-bar blues feel. Twangy guitar, honky piano, brushed drums, a sax solo in the middle. Mood: the diner jukebox on a busy afternoon. Instrumental.'),
  spoken('brandt_farm', 'brandt', 'farm', 38, ROCKY,
    ROCKY_VOICE + 'Farm report. Reads the numbers fast and proud, slows down for the Pikes line.',
    "Farm report, Brandt style. Corn is around two twenty a bushel. Soybeans, just under six. Wheat, about three forty. Hogs are up a little, cattle are flat, and milk is thirteen dollars a hundredweight.\n\nThe co-op elevator asks that trucks line up on the right side of the road. And if you are missing a sheep, call the Pikes. They have extras."),
  spoken('brandt_ad_1', 'brandt', 'ad', 24, ROCKY,
    ROCKY_VOICE + 'Ad for the diner. Sales voice, a bit loud on purpose, then drops to normal on the last line.',
    "The diner in Brandt. Pie of the day, coffee all day, and Peg will tell you your business before you tell it to her.\n\nTry the apple pie with cream on top, the way Ray Kessler has it. Sit anywhere. Peg says that is the only rule, and she doesn't like it either."),
  music('brandt_music_2', 'brandt', 'music', 125,
    'About 2 minutes. Easy 1992 soft-pop, mid-tempo 4/4. Warm electric piano, clean guitar, light drum machine, a small synth pad. Mood: windows down on the highway. Instrumental.'),
  spoken('brandt_link_2', 'brandt', 'link', 24, ROCKY,
    ROCKY_VOICE + 'Link about the Olympics. Cheerful and a bit silly.',
    "The Olympics start in Barcelona this month, and I have decided to cheer for everybody. Even the person who comes last in the long jump. Especially that person.\n\nThe garage in Brandt already has a television going in the bay. If you need an oil change, expect to watch some gymnastics."),
  spoken('brandt_swap', 'brandt', 'swap', 34, ROCKY,
    ROCKY_VOICE + 'Swap shop. Speak it like a game show host who is a little worried about the items.',
    "Swap shop. Leave a note at the garage or the diner and I'll read it out.\n\nThis week. A pickup bed, no truck attached, wants a truck. A saddle, hardly sat in. A ladder, because a man bought one and can't remember why. A tuba, one owner, one lung.\n\nAnd a pie safe, free, if you eat what's in it. Please, nothing that is still attached to a barn."),
  music('brandt_music_3', 'brandt', 'music', 135,
    'About 2 minutes. Polka, quick 2/4 oompah. Accordion lead, tuba bass, snare on the off beat, a clarinet answering the tune. Mood: a grain elevator picnic. Instrumental.'),
  spoken('brandt_weather', 'brandt', 'weather', 32, ROCKY,
    ROCKY_VOICE + 'Weather and wind. A forecast for the week, not a live report. Matter-of-fact, clear on the planes line.',
    "Weather and wind, from the weather service, for the week. Cool for July, highs in the low seventies, and a lot of folks are digging their sweaters out of the cedar chest.\n\nWinds mostly from the west, about ten miles an hour. The planes at the flying club east of town take off and land into the wind. A west wind means they come in from the east, low, and land going west.\n\nHold on to your hat."),
  spoken('brandt_ad_2', 'brandt', 'ad', 24, ROCKY,
    ROCKY_VOICE + 'Ad for the garage. Same sales voice as the first ad. Warm on "we like noises".',
    "Lou's Garage. We fix what you drove in on. Tires, brakes, oil, belts. If your car is making a noise, do the noise for us. We like noises.\n\nLou's, in Brandt. If it has wheels, bring it."),
  music('brandt_music_4', 'brandt', 'music', 125,
    'About 2 minutes. Slow twangy ballad, 6/8. Steel guitar, a soft snare, warm bass, a little bell. Mood: nobody in the diner but the last piece of pie. Instrumental.'),
  spoken('brandt_link_3', 'brandt', 'link', 22, ROCKY,
    ROCKY_VOICE + 'Link about line dancing. Playful, a little exasperated.',
    "Everybody wants to line dance. Peg says the diner is not a dance floor, but somebody keeps putting masking tape lines on it.\n\nThe tape is still there. So are the boots. I'm not saying who."),
  spoken('brandt_notices', 'brandt', 'notices', 42, ROCKY,
    ROCKY_VOICE + 'Local notices and birthdays. Warm and a little fast, then slow on the last birthday.',
    "Local notices. St. Luke's holds its pie auction on Sunday. If you plan to bid, bring cash and bring a fork. The elevator asks everyone to stop leaving old tires by the scale. Lost, a brown dog named Biscuit. He doesn't answer to anything else.\n\nBirthdays. Happy birthday to Wendell Olsen, who is sixty-two. Happy birthday to Josie Lindgren, who is six, asked for a pony, got a bicycle, and says that is fine.\n\nAnd happy birthday to Lou at the garage, who said no party. Peg is bringing a cake anyway."),
  spoken('brandt_guest', 'brandt', 'guest', 46, 'Rocky Tillman and Lou (gibberish)',
    ROCKY_VOICE + 'Guest spot. Lou is gruff and short, a low mutter. His lines are made-up sounds with real sentence rhythm, not a real language. Record Lou as a second voice (man, low, gruff, grumpy but kind). Leave a 3 to 4 second gap after each Rocky line where Lou speaks. Rocky answers as if every word made sense.',
    "I have a visitor. Lou from the garage dropped off a part, and I told him he's not leaving until he says hello. Lou, you're on.\n\n~ Mm. Hrmph. Gorra nash, bidda lunk, ottle ottle rum. Hnh.\n\nIs that right? Folks, Lou says you'll hear the flying club planes long before you see them. He says they go round and round the field on a fine day, and they never fly right over the middle.\n\nSo if you are ever trying to find them, don't drive to where they are. Drive to the middle. Did I get that right, Lou?\n\n~ Hnh.\n\nHe says I did. Thanks, Lou. Now go home."),
  spoken('brandt_link_4', 'brandt', 'link', 24, ROCKY,
    ROCKY_VOICE + 'Link about the election. Friendly, laughing at herself.',
    "Mr. Perot said he is out of the race, and my phone rang six times in one minute. Three were the same man.\n\nFolks, I'm a deejay. Call me about requests, not politics. Politics I can't play. I've tried."),
];

export function segmentsOf(stationId) {
  return SEGMENTS.filter((s) => s.station === stationId);
}
export function segmentById(id) {
  return SEGMENTS.find((s) => s.id === id) || null;
}
