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
//               data.js. 'mast_brandt' is in src/world/addons/masts_brandt.js.
//   dj          { name, voice }  voice is a short note for ElevenLabs
//   tagline     the line the jingle and first link use
//   rotation    segment ids in the order the station loops them, then starts over.
//               Every segment of the station appears exactly once.
//
// SEGMENTS (array), each:
//   id          'ashford_link_1' (station_kind_n)
//   station     station id
//   kind        'link' | 'farm' | 'swap' | 'weather' | 'ad' | 'notices' | 'guest'
//               | 'traffic' | 'thought'                                          (spoken)
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
      'ashford_ad_2', 'ashford_traffic', 'ashford_notices', 'ashford_music_4', 'ashford_guest',
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
    tagline: 'The tallest voice in Brandt.',
    rotation: [
      'brandt_jingle', 'brandt_link_1', 'brandt_music_1', 'brandt_farm', 'brandt_ad_1',
      'brandt_music_2', 'brandt_link_2', 'brandt_swap', 'brandt_music_3', 'brandt_weather',
      'brandt_ad_2', 'brandt_thought', 'brandt_notices', 'brandt_music_4', 'brandt_guest',
      'brandt_link_3',
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
  music("ashford_jingle", "ashford", "jingle", 8,
    "Station ID sting, about 8 seconds. Twangy electric guitar and a plucked banjo, a quick little rising run that ends on a happy chord. No singing. Worn and warm, like a tune the hardware store has played for forty years."),
  spoken("ashford_link_1", "ashford", "link", 16, DEWEY,
    DEWEY_VOICE + "Opening link. Unhurried. Pause after the call sign.",
    "WHAY, Radio Ashford, ten ten on your AM dial. Ashford's own, on the hill. This is Dewey Halloran.\n\nI've got records, a farm report, and a freshly brewed pot of coffee. So stay with me."),
  music("ashford_music_1", "ashford", "music", 130,
    "About 2 minutes. Slow country waltz in 3/4. Dusty slide guitar, brushed drums, upright bass, a lonely fiddle on the tune. Mood: a porch at sundown. Instrumental, no vocals."),
  spoken("ashford_farm", "ashford", "farm", 42, DEWEY,
    DEWEY_VOICE + "Farm report. Read the prices flat and serious like the numbers matter. Slow down and get warmer for the Vern Sutter news.",
    "Farm report. Corn is two dollars and thirty cents a bushel. Wheat, three-twenty. Soybeans, five-sixty. Hogs are forty-six a hundredweight, fat cattle seventy-four. That's the last board the co-op grain elevator phoned in.\n\nWheat has been slow in the cool weather, still green in some of the low ground. Vern Sutter had surgery and couldn't get his cut, so St. Anne's and two other churches brought combines and got his wheat in before the rain. His wife said they finished before supper. If you need a hand with a field, call the station."),
  spoken("ashford_ad_1", "ashford", "ad", 19, DEWEY,
    DEWEY_VOICE + "Ad. A touch more salesman than usual, but still Dewey: he thinks ads are a little silly.",
    "This farm report is brought to you by Earl's Gas and Garage on Main Street in Ashford. Regular gas is a dollar five a gallon. Earl also has night crawlers, cold pop, fan belts, and someone on duty for repairs until six."),
  music("ashford_music_2", "ashford", "music", 125,
    "About 2 minutes. Upbeat 1992 country line-dance shuffle in 4/4. Twangy electric guitar, handclaps, a steady kick-and-snare, a fiddle break. Mood: church hall floor on a Saturday. Instrumental."),
  spoken("ashford_link_2", "ashford", "link", 12, DEWEY,
    DEWEY_VOICE + "Link about the Olympics. Mildly grumpy and fond at the same time.",
    "The Barcelona Olympics begin later this month, and the American basketball team will have professional players for the first time. They're calling it the Dream Team."),
  spoken("ashford_swap", "ashford", "swap", 33, DEWEY,
    DEWEY_VOICE + "Swap shop. Read like a very serious list. Deadpan on \"slightly used\".",
    "Swap Shop. Call the station, or tell Earl at the pumps and he'll pass it along.\n\nFirst up, a caller wants to trade a slightly used manure spreader for a VCR. His words: slightly used. There's also a two-bottom plow in good shape. The owner would like a rowboat.\n\nWanted, one left work boot, size ten, brown. And five kittens are free to a good home.\n\nThat's Swap Shop for this week."),
  music("ashford_music_3", "ashford", "music", 135,
    "About 2 minutes. Old-time gospel hymn feel, slow 4/4. Wheezy pump organ and a small choir humming \"ooh\" with no words, soft acoustic guitar. Mood: the church on a quiet Sunday. Instrumental plus hum only."),
  spoken("ashford_weather", "ashford", "weather", 21, DEWEY,
    DEWEY_VOICE + "Weather and wind. A forecast for the week, not a live report. Dry on \"why\".",
    "Cool for July through most of the week, with afternoon highs in the upper seventies and nights near fifty-five. Some forecasters still blame last year's volcano in the Philippines. West winds around ten miles an hour, with a chance of scattered showers Wednesday and again late Friday."),
  spoken("ashford_ad_2", "ashford", "ad", 16, DEWEY,
    DEWEY_VOICE + "Ad. Same sales voice as the first ad.",
    "Hendricks Hardware and Feed, out on Highway 9. Baling twine, salt blocks, and steel fence posts came in. If you need a gate or a hinge they don't have, they can order it. Ask for Don."),
  spoken("ashford_traffic", "ashford", "traffic", 15, DEWEY,
    DEWEY_VOICE + "Traffic report. Read it like a serious bulletin, with a straight face. Let \"three cars\" land with a pause before it.",
    "A combine is moving north on Highway 9, and the backup is nine miles long. That's three cars, folks. Give him room at the bridge, and everyone should get through without any trouble."),
  spoken("ashford_notices", "ashford", "notices", 42, DEWEY,
    DEWEY_VOICE + "Local notices and birthdays. A warm, slow read, like he is reading off the back of an envelope.",
    "St. Anne's youth group will hold a car wash Saturday from nine until two in the church lot. Proceeds help send eight young people on their summer mission trip. Cars are four dollars, pickups five, and extra donations are welcome.\n\nThe library needs volunteers to carry boxes Thursday evening. Call Mrs. Talbot before five. The Fenwick County blood drive is Tuesday at the school gym; appointments are helpful, though walk-ins will be taken.\n\nBirthday wishes go to Ruth Bell, seventy-eight, and Andrew Keene, twelve. Ruth's family says there will be cake after supper."),
  music("ashford_music_4", "ashford", "music", 125,
    "About 2 minutes. Honky-tonk piano and fiddle, bouncy 2-beat two-step. A bit of brush snare and a walking bass. Mood: a Saturday night that is going fine. Instrumental."),
  spoken("ashford_guest", "ashford", 'guest', 45, "Dewey Halloran and Earl (gibberish)",
    DEWEY_VOICE + "Guest spot. Earl is the flattest man in the county: mumbling, low, no ups and downs, short bursts. His lines are made-up sounds with real sentence rhythm, not a real language. Record Earl as a second voice (older man, flat, mumbly). Leave a 3 to 4 second gap after each Dewey line where Earl speaks. Dewey does not translate or repeat what Earl says. He just carries on.",
    "I've got Earl in the studio, from the pumps on Main Street. Earl, say hello to everybody.\n\n~ Mm. Nuh-hmm. Dannow poddle, ressa ka lun bo. Hmf.\n\nWell, it's good to have you. Earl, I keep telling folks that Mill Lane only goes up as far as where the old mill was, and it stops there. They still drive up it looking for a way through.\n\n~ Woomba. Heh. Ressa ka, ressa ka lun.\n\nThat's what I keep saying.\n\n~ Hmf. Dannow.\n\nAll right, Earl. Thanks for coming in. That's Earl, from Earl's Gas and Garage on Main Street."),
  spoken("ashford_link_4", "ashford", "link", 19, DEWEY,
    DEWEY_VOICE + "Link about tractors. Dry. Let the last joke sit, no laugh.",
    "The paper says experts think tractors will drive themselves someday. Orville Dahl called the station to say his already does. The brakes went out in April, and he calls it a runaway success.\n\nWe'll have another record, then I'll be back."),

  // ------------------------------------------------------------- Brandt 1340
  music("brandt_jingle", "brandt", "jingle", 8,
    "Station ID sting, about 8 seconds. Bright, bouncy: a snare roll, a jangly guitar chord, a little organ riff going up. No singing. Sounds like a diner jukebox playing the first bar of a happy song."),
  spoken("brandt_link_1", "brandt", "link", 13, ROCKY,
    ROCKY_VOICE + "Opening link. Big energy but still friendly, like she is talking across the counter.",
    "You're on WBRT, Brandt thirteen-forty, the tallest voice in Brandt. I'm Rocky Tillman.\n\nI've got records, the farm report, and several new items for Swap Shop. Stay with us."),
  music("brandt_music_1", "brandt", "music", 130,
    "About 2 minutes. Early rock and roll shuffle, 12-bar blues feel. Twangy guitar, honky piano, brushed drums, a sax solo in the middle. Mood: the diner jukebox on a busy afternoon. Instrumental."),
  spoken("brandt_farm", "brandt", "farm", 33, ROCKY,
    ROCKY_VOICE + "Farm report. Reads the numbers fast and proud, slows down for the fax machine.",
    "Brandt Co-op is bidding two dollars twenty-five for corn, five dollars fifty-eight for soybeans, and three dollars thirty-seven for wheat. Butcher hogs are around forty-three fifty, and choice steers are holding near seventy-four.\n\nThe elevator asks wheat trucks to use the south scale until further notice. The office also has a new fax machine. Calvin Roark faxed a picture of his prize hog to the feed counter just to see if it works."),
  spoken("brandt_ad_1", "brandt", "ad", 20, ROCKY,
    ROCKY_VOICE + "Ad for the diner. Sales voice, a bit loud on purpose, then drops to normal on the last line.",
    "Peg's diner in Brandt serves breakfast from six, with eggs, sausage, biscuits, and coffee kept hot. Lunch includes meat loaf, chicken-fried steak, and a vegetable plate. Pie this week is apple, cherry, or coconut cream. Whole pies may be ordered one day ahead."),
  music("brandt_music_2", "brandt", "music", 125,
    "About 2 minutes. Easy 1992 soft-pop, mid-tempo 4/4. Warm electric piano, clean guitar, light drum machine, a small synth pad. Mood: windows down on the highway. Instrumental."),
  spoken("brandt_link_2", "brandt", "link", 24, ROCKY,
    ROCKY_VOICE + "Link about the Olympics. Cheerful and a bit silly.",
    "The Olympics start in Barcelona later this month. Lou's got a television going in the bay at the garage, set on a crate. People are asking about the basketball, with the pros in it. You can hear it from the lot if the door's up. I'll get down for some of it."),
  spoken("brandt_swap", "brandt", "swap", 28, ROCKY,
    ROCKY_VOICE + "Swap shop. Speak it like a game show host who is a little worried about the items.",
    "Swap shop. Leave a note at the garage or the diner. I'll read them on the air.\n\nCarl Bemis has a boom pole for a three-point hitch. He wants truck chains.\n\nRuth Keller has a girl's bike, twenty-inch wheels, needs a tube. She'll trade for a playpen.\n\nA window fan that works, for canning jars. No name on the note. Ask Peg."),
  music("brandt_music_3", "brandt", "music", 135,
    "About 2 minutes. Polka, quick 2/4 oompah. Accordion lead, tuba bass, snare on the off beat, a clarinet answering the tune. Mood: a grain elevator picnic. Instrumental."),
  spoken("brandt_weather", "brandt", "weather", 37, ROCKY,
    ROCKY_VOICE + "Weather and wind. A forecast for the week, not a live report. Matter-of-fact, clear on the planes line.",
    "The week stays cooler than usual, with highs from seventy-six to eighty and west winds near ten miles an hour. A shower may pass through Wednesday night, with better drying weather afterward.\n\nA note for anyone watching the flying club east of Brandt: airplanes take off and land into the wind. With a west wind, they'll approach low from the east and land going west. That is normal traffic for the field, though livestock owners nearby may want to keep gates secured."),
  spoken("brandt_ad_2", "brandt", "ad", 17, ROCKY,
    ROCKY_VOICE + "Ad for the garage. Same sales voice as the first ad. Warm on \"we like noises\".",
    "Lou's Garage. We fix what you drove in on. Tires, brakes, oil, belts. If your car is making a noise, do the noise for us. We like noises.\n\nLou's, in Brandt. If it has wheels, bring it."),
  spoken("brandt_thought", "brandt", "thought", 26, ROCKY,
    ROCKY_VOICE + "Thought for the Road. Rocky drops the big energy: softer, slower, no grin. Reads the pastor's word plainly, like a note she respects.",
    "Time for Thought for the Road, a short word Pastor Dale Weber of Brandt Community Church drops off each week.\n\nHe writes, even on a road you know well, you can't see over the next hill. He finds comfort in knowing God can. He's looking after you, and the fellow coming the other way.\n\nDrive safely, folks."),
  spoken("brandt_notices", "brandt", "notices", 40, ROCKY,
    ROCKY_VOICE + "Local notices and birthdays. Warm and a little fast, then slow on the last birthday.",
    "St. Luke's will hold its annual pie auction Friday at seven in the fellowship hall. Pie donations may be brought in after four, and coffee will be provided.\n\nBrandt Co-op reminds growers that the south scale opens at six during wheat harvest. The north scale remains closed for repairs.\n\nA black-and-white farm dog named Patch is missing from the Miller place. He has a red collar and is friendly. Leave word at the diner if seen.\n\nBirthday wishes go to Helen Ward, sixty-six, and Tommy Reese, nine."),
  music("brandt_music_4", "brandt", "music", 125,
    "About 2 minutes. Slow twangy ballad, 6/8. Steel guitar, a soft snare, warm bass, a little bell. Mood: nobody in the diner but the last piece of pie. Instrumental."),
  spoken("brandt_guest", "brandt", 'guest', 45, "Rocky Tillman and Lou (gibberish)",
    ROCKY_VOICE + "Guest spot. Lou is gruff and short, a low mutter. His lines are made-up sounds with real sentence rhythm, not a real language. Record Lou as a second voice (man, low, gruff, grumpy but kind). Leave a 3 to 4 second gap after each Rocky line where Lou speaks. Rocky does not translate or repeat what Lou says. She just carries on.",
    "Lou from the garage is here, dropping off a part for the transmitter. Lou, say hello.\n\n~ Mm. Hrmph. Gorra nash, bidda lunk, ottle ottle rum. Hnh.\n\nGood to see you too. Lou, people keep asking me how to find the flying club. I tell them the planes go round and round the field on a fine day, and they never fly over the middle. So you drive to the middle of the circle.\n\n~ Hnh. Gorra nash.\n\nI thought so.\n\n~ Bidda lunk. Hrmph.\n\nThanks, Lou. That's Lou's Garage, here in Brandt, if your car needs looking at."),
  spoken("brandt_link_3", "brandt", "link", 22, ROCKY,
    ROCKY_VOICE + "Link with the caller. Cheerful at first. The laugh after \"Ha, ha\" is nervous and a little too long. Small pause before \"right?\".",
    "The phones are lit up again. One caller says that someday you'll pick any song, any time, no DJ needed. He thinks it'll come through the phone line, or maybe through the air. He wasn't sure about that part.\n\nHa, ha. Sure, sir. They'll always need ol' Rocky... right?"),
];

export function segmentsOf(stationId) {
  return SEGMENTS.filter((s) => s.station === stationId);
}
export function segmentById(id) {
  return SEGMENTS.find((s) => s.id === id) || null;
}
