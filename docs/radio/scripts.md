# Radio scripts, July 1992

Two AM stations. The machine-readable list is `src/radio/segments.js`; this page is the same content for people. File names are what you record to (MP3, one per segment). Edit scripts here and in T17 review; approved text is copied back into the list.

## Radio audio

How to turn your recordings into the files the game plays.

1. Make a folder outside the repo for your masters. The default is `radio-masters`, next to the repo folder (`../radio-masters`). Any folder works if you pass it in. Never put masters inside the repo or in `public/`.
2. Drop your recordings in it. Name each one like the file names below, for example `ashford_link_1`, `brandt_music_3`. The extension can be mp3, wav, m4a or flac. Both stations are in the same folder.
3. From the repo root, run:

   ```
   npm run radio:bake -- ../radio-masters
   ```

   You can use another folder instead, or set `RADIO_MASTERS=/some/folder`. You need ffmpeg installed.
4. The tool turns each file into a small AM-radio sound (thin voice, mono, low bitrate, all files at the same loudness, music too) and writes it to `public/radio/<station>/<name>.mp3`. These small files are what ships.
5. It then prints the real length of each file, the segments that have no master yet, and any file in your folder that matches no segment (usually a typo in the name).
6. Add `--write-durations` to also copy the real lengths into `src/radio/segments.js`, so the schedule uses true lengths. Run it again any time you replace a recording. To redo just a few, add `--only ashford_link_1,brandt_farm`.

Commit the new files in `public/radio/` and the changed `segments.js`.

## House rules for every script

- July 1992. A station names only its own home town. Never a live "here" report.
- No "today", "tonight" or "this morning". The player can tune in at any clock time. Weather is always a forecast for the week.
- Plain, short sentences. A DJ says what a person would say on air.
- Two themes run through the scripts. (a) 1992 people meet future tech without knowing it (VCR, fax machine, a caller predicting streaming music, self-driving tractors); the joke is that the listener knows how it turns out. (b) Church life is shown warmly as part of the town (churches bringing combines, a youth car wash for a mission trip, a weekly Thought for the Road from the pastor). Never preachy, no wink, no cow puns.
- Each station has 11 spoken pieces. Ashford swaps one DJ link for a traffic report (`traffic`); Brandt swaps one DJ link for Thought for the Road (`thought`).
- Real 1992 things are light jokes only: Barcelona Olympics, Perot, line dancing, cool summer, farm prices. Prices are round numbers for flavour.
- Lines starting with `~` are a local talking gibberish. Make nonsense sounds with real sentence rhythm. They get no subtitle.
- Music is instrumental, no real song or artist names, no spoken titles.
- True clues only. The Ashford guest spot says Mill Lane stops at the old mill (it does). The Brandt guest spot says to drive to the middle of the planes' circling (right). The weather reports match Ray's and Dagny's lines about wind.

## Voices to set up in ElevenLabs

| Voice | Station | Notes |
|---|---|---|
| Dewey Halloran | Radio Ashford | Older man, slow and dry, a little gravel, easygoing |
| Rocky Tillman | Brandt 1340 | Woman in her thirties, bright and quick, big laugh, small-town warm |
| Earl | Radio Ashford guest spot | Older man, flat, mumbly, no ups and downs. Gibberish only. |
| Lou | Brandt 1340 guest spot | Man, low and gruff, grumpy but kind. Gibberish only. |

Ad reads use the DJ voice with a bit more salesman in it. The player's subtitles show the English text; the guest's gibberish is shown with no subtitle.

Approx. length of each loop: about 14 minutes per station. Stations keep their own time, so tuning away and back finds them moved on.

---

## Radio Ashford (WHAY, 1010 AM)

- Home town: Ashford. Mast id: `mast` (the existing mast).
- DJ: Dewey Halloran. Older man, slow and dry, a little gravel, easygoing.
- Tagline: "Ashford's own, on the hill."
- Loop order: ashford_jingle, ashford_link_1, ashford_music_1, ashford_farm, ashford_ad_1, ashford_music_2, ashford_link_2, ashford_swap, ashford_music_3, ashford_weather, ashford_ad_2, ashford_traffic, ashford_notices, ashford_music_4, ashford_guest, ashford_link_4

### Music slots (you make these)

- **ashford_jingle.mp3** (jingle, about 8 s). Station ID sting, about 8 seconds. Twangy electric guitar and a plucked banjo, a quick little rising run that ends on a happy chord. No singing. Worn and warm, like a tune the hardware store has played for forty years.
- **ashford_music_1.mp3** (music, about 130 s). About 2 minutes. Slow country waltz in 3/4. Dusty slide guitar, brushed drums, upright bass, a lonely fiddle on the tune. Mood: a porch at sundown. Instrumental, no vocals.
- **ashford_music_2.mp3** (music, about 125 s). About 2 minutes. Upbeat 1992 country line-dance shuffle in 4/4. Twangy electric guitar, handclaps, a steady kick-and-snare, a fiddle break. Mood: church hall floor on a Saturday. Instrumental.
- **ashford_music_3.mp3** (music, about 135 s). About 2 minutes. Old-time gospel hymn feel, slow 4/4. Wheezy pump organ and a small choir humming "ooh" with no words, soft acoustic guitar. Mood: the church on a quiet Sunday. Instrumental plus hum only.
- **ashford_music_4.mp3** (music, about 125 s). About 2 minutes. Honky-tonk piano and fiddle, bouncy 2-beat two-step. A bit of brush snare and a walking bass. Mood: a Saturday night that is going fine. Instrumental.

### Spoken pieces (record these in ElevenLabs)

#### ashford_link_1.mp3: DJ link (about 16 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Opening link. Unhurried. Pause after the call sign.

**Source:** A Claude

> WHAY, Radio Ashford, ten ten on your AM dial. Ashford's own, on the hill. This is Dewey Halloran.
>
> I've got records, a farm report, and a freshly brewed pot of coffee. So stay with me.

#### ashford_farm.mp3: Farm report (about 42 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Farm report. Read the prices flat and serious like the numbers matter. Slow down and get warmer for the Vern Sutter news.

**Source:** D Grok fresh

> Farm report. Corn is two dollars and thirty cents a bushel. Wheat, three-twenty. Soybeans, five-sixty. Hogs are forty-six a hundredweight, fat cattle seventy-four. That's the last board the co-op grain elevator phoned in.
>
> Wheat has been slow in the cool weather, still green in some of the low ground. Vern Sutter had surgery and couldn't get his cut, so St. Anne's and two other churches brought combines and got his wheat in before the rain. His wife said they finished before supper. If you need a hand with a field, call the station.

#### ashford_ad_1.mp3: Ad (about 19 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Ad. A touch more salesman than usual, but still Dewey: he thinks ads are a little silly.

**Source:** C GPT fresh

> This farm report is brought to you by Earl's Gas and Garage on Main Street in Ashford. Regular gas is a dollar five a gallon. Earl also has night crawlers, cold pop, fan belts, and someone on duty for repairs until six.

#### ashford_link_2.mp3: DJ link (about 12 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Link about the Olympics. Mildly grumpy and fond at the same time.

**Source:** C GPT fresh

> The Barcelona Olympics begin later this month, and the American basketball team will have professional players for the first time. They're calling it the Dream Team.

#### ashford_swap.mp3: Swap shop (about 33 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Swap shop. Read like a very serious list. Deadpan on "slightly used".

**Source:** B GPT edit

> Swap Shop. Call the station, or tell Earl at the pumps and he'll pass it along.
>
> First up, a caller wants to trade a slightly used manure spreader for a VCR. His words: slightly used. There's also a two-bottom plow in good shape. The owner would like a rowboat.
>
> Wanted, one left work boot, size ten, brown. And five kittens are free to a good home.
>
> That's Swap Shop for this week.

#### ashford_weather.mp3: Weather and wind report (about 21 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Weather and wind. A forecast for the week, not a live report. Dry on "why".

**Source:** C GPT fresh

> Cool for July through most of the week, with afternoon highs in the upper seventies and nights near fifty-five. Some forecasters still blame last year's volcano in the Philippines. West winds around ten miles an hour, with a chance of scattered showers Wednesday and again late Friday.

#### ashford_ad_2.mp3: Ad (about 16 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Ad. Same sales voice as the first ad.

**Source:** D Grok fresh

> Hendricks Hardware and Feed, out on Highway 9. Baling twine, salt blocks, and steel fence posts came in. If you need a gate or a hinge they don't have, they can order it. Ask for Don.

#### ashford_traffic.mp3: Traffic report (about 15 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Traffic report. Read it like a serious bulletin, with a straight face. Let "three cars" land with a pause before it.

**Source:** C GPT fresh

> A combine is moving north on Highway 9, and the backup is nine miles long. That's three cars, folks. Give him room at the bridge, and everyone should get through without any trouble.

#### ashford_notices.mp3: Local notices and birthdays (about 42 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Local notices and birthdays. A warm, slow read, like he is reading off the back of an envelope.

**Source:** C GPT fresh

> St. Anne's youth group will hold a car wash Saturday from nine until two in the church lot. Proceeds help send eight young people on their summer mission trip. Cars are four dollars, pickups five, and extra donations are welcome.
>
> The library needs volunteers to carry boxes Thursday evening. Call Mrs. Talbot before five. The Fenwick County blood drive is Tuesday at the school gym; appointments are helpful, though walk-ins will be taken.
>
> Birthday wishes go to Ruth Bell, seventy-eight, and Andrew Keene, twelve. Ruth's family says there will be cake after supper.

#### ashford_guest.mp3: Guest spot (about 45 s)

**Speaker:** Dewey Halloran and Earl (gibberish)

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Guest spot. Earl is the flattest man in the county: mumbling, low, no ups and downs, short bursts. His lines are made-up sounds with real sentence rhythm, not a real language. Record Earl as a second voice (older man, flat, mumbly). Leave a 3 to 4 second gap after each Dewey line where Earl speaks. Dewey does not translate or repeat what Earl says. He just carries on.

**Source:** New (owner: the DJ must not interpret the local)

> I've got Earl in the studio, from the pumps on Main Street. Earl, say hello to everybody.
>
> ~ Mm. Nuh-hmm. Dannow poddle, ressa ka lun bo. Hmf.
>
> Well, it's good to have you. Earl, I keep telling folks that Mill Lane only goes up as far as where the old mill was, and it stops there. They still drive up it looking for a way through.
>
> ~ Woomba. Heh. Ressa ka, ressa ka lun.
>
> That's what I keep saying.
>
> ~ Hmf. Dannow.
>
> All right, Earl. Thanks for coming in. That's Earl, from Earl's Gas and Garage on Main Street.

#### ashford_link_4.mp3: DJ link (about 19 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Link about tractors. Dry. Let the last joke sit, no laugh.

**Source:** B GPT edit

> The paper says experts think tractors will drive themselves someday. Orville Dahl called the station to say his already does. The brakes went out in April, and he calls it a runaway success.
>
> We'll have another record, then I'll be back.

---

## Brandt 1340 (WBRT, 1340 AM)

- Home town: Brandt. Mast id: `mast_brandt` (new mast, needs adding near Brandt).
- DJ: Rocky Tillman. Woman in her thirties, bright and quick, big laugh, small-town warm.
- Tagline: "The tallest voice in Brandt."
- Loop order: brandt_jingle, brandt_link_1, brandt_music_1, brandt_farm, brandt_ad_1, brandt_music_2, brandt_link_2, brandt_swap, brandt_music_3, brandt_weather, brandt_ad_2, brandt_thought, brandt_notices, brandt_music_4, brandt_guest, brandt_link_3

### Music slots (you make these)

- **brandt_jingle.mp3** (jingle, about 8 s). Station ID sting, about 8 seconds. Bright, bouncy: a snare roll, a jangly guitar chord, a little organ riff going up. No singing. Sounds like a diner jukebox playing the first bar of a happy song.
- **brandt_music_1.mp3** (music, about 130 s). About 2 minutes. Early rock and roll shuffle, 12-bar blues feel. Twangy guitar, honky piano, brushed drums, a sax solo in the middle. Mood: the diner jukebox on a busy afternoon. Instrumental.
- **brandt_music_2.mp3** (music, about 125 s). About 2 minutes. Easy 1992 soft-pop, mid-tempo 4/4. Warm electric piano, clean guitar, light drum machine, a small synth pad. Mood: windows down on the highway. Instrumental.
- **brandt_music_3.mp3** (music, about 135 s). About 2 minutes. Polka, quick 2/4 oompah. Accordion lead, tuba bass, snare on the off beat, a clarinet answering the tune. Mood: a grain elevator picnic. Instrumental.
- **brandt_music_4.mp3** (music, about 125 s). About 2 minutes. Slow twangy ballad, 6/8. Steel guitar, a soft snare, warm bass, a little bell. Mood: nobody in the diner but the last piece of pie. Instrumental.

### Spoken pieces (record these in ElevenLabs)

#### brandt_link_1.mp3: DJ link (about 13 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Opening link. Big energy but still friendly, like she is talking across the counter.

**Source:** B GPT edit

> You're on WBRT, Brandt thirteen-forty, the tallest voice in Brandt. I'm Rocky Tillman.
>
> I've got records, the farm report, and several new items for Swap Shop. Stay with us.

#### brandt_farm.mp3: Farm report (about 33 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Farm report. Reads the numbers fast and proud, slows down for the fax machine.

**Source:** C GPT fresh

> Brandt Co-op is bidding two dollars twenty-five for corn, five dollars fifty-eight for soybeans, and three dollars thirty-seven for wheat. Butcher hogs are around forty-three fifty, and choice steers are holding near seventy-four.
>
> The elevator asks wheat trucks to use the south scale until further notice. The office also has a new fax machine. Calvin Roark faxed a picture of his prize hog to the feed counter just to see if it works.

#### brandt_ad_1.mp3: Ad (about 20 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Ad for the diner. Sales voice, a bit loud on purpose, then drops to normal on the last line.

**Source:** C GPT fresh

> Peg's diner in Brandt serves breakfast from six, with eggs, sausage, biscuits, and coffee kept hot. Lunch includes meat loaf, chicken-fried steak, and a vegetable plate. Pie this week is apple, cherry, or coconut cream. Whole pies may be ordered one day ahead.

#### brandt_link_2.mp3: DJ link (about 24 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Link about the Olympics. Cheerful and a bit silly.

**Source:** D Grok fresh

> The Olympics start in Barcelona later this month. Lou's got a television going in the bay at the garage, set on a crate. People are asking about the basketball, with the pros in it. You can hear it from the lot if the door's up. I'll get down for some of it.

#### brandt_swap.mp3: Swap shop (about 28 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Swap shop. Speak it like a game show host who is a little worried about the items.

**Source:** D Grok fresh

> Swap shop. Leave a note at the garage or the diner. I'll read them on the air.
>
> Carl Bemis has a boom pole for a three-point hitch. He wants truck chains.
>
> Ruth Keller has a girl's bike, twenty-inch wheels, needs a tube. She'll trade for a playpen.
>
> A window fan that works, for canning jars. No name on the note. Ask Peg.

#### brandt_weather.mp3: Weather and wind report (about 37 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Weather and wind. A forecast for the week, not a live report. Matter-of-fact, clear on the planes line.

**Source:** C GPT fresh

> The week stays cooler than usual, with highs from seventy-six to eighty and west winds near ten miles an hour. A shower may pass through Wednesday night, with better drying weather afterward.
>
> A note for anyone watching the flying club east of Brandt: airplanes take off and land into the wind. With a west wind, they'll approach low from the east and land going west. That is normal traffic for the field, though livestock owners nearby may want to keep gates secured.

#### brandt_ad_2.mp3: Ad (about 17 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Ad for the garage. Same sales voice as the first ad. Warm on "we like noises".

**Source:** A Claude

> Lou's Garage. We fix what you drove in on. Tires, brakes, oil, belts. If your car is making a noise, do the noise for us. We like noises.
>
> Lou's, in Brandt. If it has wheels, bring it.

#### brandt_thought.mp3: Thought for the Road (about 26 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Thought for the Road. Rocky drops the big energy: softer, slower, no grin. Reads the pastor's word plainly, like a note she respects.

**Source:** B GPT edit

> Time for Thought for the Road, a short word Pastor Dale Weber of Brandt Community Church drops off each week.
>
> He writes, even on a road you know well, you can't see over the next hill. He finds comfort in knowing God can. He's looking after you, and the fellow coming the other way.
>
> Drive safely, folks.

#### brandt_notices.mp3: Local notices and birthdays (about 40 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Local notices and birthdays. Warm and a little fast, then slow on the last birthday.

**Source:** C GPT fresh

> St. Luke's will hold its annual pie auction Friday at seven in the fellowship hall. Pie donations may be brought in after four, and coffee will be provided.
>
> Brandt Co-op reminds growers that the south scale opens at six during wheat harvest. The north scale remains closed for repairs.
>
> A black-and-white farm dog named Patch is missing from the Miller place. He has a red collar and is friendly. Leave word at the diner if seen.
>
> Birthday wishes go to Helen Ward, sixty-six, and Tommy Reese, nine.

#### brandt_guest.mp3: Guest spot (about 45 s)

**Speaker:** Rocky Tillman and Lou (gibberish)

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Guest spot. Lou is gruff and short, a low mutter. His lines are made-up sounds with real sentence rhythm, not a real language. Record Lou as a second voice (man, low, gruff, grumpy but kind). Leave a 3 to 4 second gap after each Rocky line where Lou speaks. Rocky does not translate or repeat what Lou says. She just carries on.

**Source:** New (owner: the DJ must not interpret the local)

> Lou from the garage is here, dropping off a part for the transmitter. Lou, say hello.
>
> ~ Mm. Hrmph. Gorra nash, bidda lunk, ottle ottle rum. Hnh.
>
> Good to see you too. Lou, people keep asking me how to find the flying club. I tell them the planes go round and round the field on a fine day, and they never fly over the middle. So you drive to the middle of the circle.
>
> ~ Hnh. Gorra nash.
>
> I thought so.
>
> ~ Bidda lunk. Hrmph.
>
> Thanks, Lou. That's Lou's Garage, here in Brandt, if your car needs looking at.

#### brandt_link_3.mp3: DJ link (about 22 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Link with the caller. Cheerful at first. The laugh after "Ha, ha" is nervous and a little too long. Small pause before "right?".

**Source:** B GPT edit

> The phones are lit up again. One caller says that someday you'll pick any song, any time, no DJ needed. He thinks it'll come through the phone line, or maybe through the air. He wasn't sure about that part.
>
> Ha, ha. Sure, sir. They'll always need ol' Rocky... right?
