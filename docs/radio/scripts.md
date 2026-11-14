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

> WHAY, Radio Ashford, ten ten on your AM dial. Ashford's own, on the hill. This is Dewey Halloran.
>
> I've got records, a farm report, and a freshly brewed pot of coffee. So stay with me.

#### ashford_farm.mp3: Farm report (about 40 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Farm report. Read the prices flat and serious like the numbers matter. Slow down and get warmer for the Vern Sutter news.

> Time for the farm report. Corn is a little over two dollars a bushel. Soybeans, a little under six. Hogs are steady and cattle are steady, and so are the people who raise them, mostly.
>
> Hay is up, because it rained when it shouldn't have.
>
> Vern Sutter is home from the hospital and doing fine. His wheat was ready and the rain was coming, so three churches sent combines. They got every acre in before the first drop. Vern says thank you, and the coffee is on him.

#### ashford_ad_1.mp3: Ad (about 19 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Ad. A touch more salesman than usual, but still Dewey: he thinks ads are a little silly. Smile on "do not mix them up".

> Earl's Gas and Garage, on Main Street. Regular gas, a dollar and five cents a gallon. Pop in the cooler. Worms in the other cooler. Please do not mix them up.
>
> Earl's. If you can see the pumps, you've found it.

#### ashford_link_2.mp3: DJ link (about 27 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Link about the Olympics. Mildly grumpy and fond at the same time.

> The Olympics start in Barcelona this month, and they say the American basketball team is made of professionals. Pros, in the Olympics. In my day you needed a day job to get in.
>
> I'll be watching at the Millers'. Theirs is the only television that gets Channel 6. Mrs. Miller says I can come over if I bring a pie.

#### ashford_swap.mp3: Swap shop (about 34 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Swap shop. Read like a very serious list. Deadpan on "slightly used". A tiny pause before "Gerald".

> Swap shop. Call the station, or tell Earl at the pumps and he'll tell me.
>
> First up. A caller wants to trade a slightly used manure spreader for a VCR. His words: slightly used. Next, a two-bottom plow, good shape, wants a rowboat.
>
> Wanted, one left boot, size ten, brown. Please don't ask about the right one. And last, five kittens, free, all of them named Gerald.
>
> That's the swap shop. Fair trades only.

#### ashford_weather.mp3: Weather and wind report (about 23 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Weather and wind. A forecast for the week, not a live report. Dry on "why".

> The weather and wind, from the weather service, for the week. Highs in the upper seventies, which is cool for July. They blame a volcano in the Philippines that blew up last year.
>
> Winds mostly from the west, about ten miles an hour. Showers are possible. Bring the laundry in early.

#### ashford_ad_2.mp3: Ad (about 21 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Ad. Same sales voice as the first ad. A sigh on "and sigh".

> Hendricks Hardware and Feed, out on Highway 9. We sell nails, rope, chicken wire, and every kind of bucket. Bring your broken thing and Mr. Hendricks will look at it and sigh. He can usually fix it.
>
> Hendricks. We have a new shipment of garden hoses.

#### ashford_traffic.mp3: Traffic report (about 15 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Traffic report. Read it like a serious bulletin, with a straight face. Let "three cars" land with a pause before it.

> Traffic report. Combine on Highway 9, backup is nine miles long. That's three cars, folks.
>
> If you're one of the three, the combine will pull over at the next driveway. They always do.

#### ashford_notices.mp3: Local notices and birthdays (about 44 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Local notices and birthdays. A warm, slow read, like he is reading off the back of an envelope. Laugh a little on "eleven years".

> Local notices. The youth group at St. Anne's is washing cars in the church lot on Saturday. It's by donation, and the money goes to their mission trip. Mrs. Miller is back from her sister's. And the school board will not meet this month, because nobody can find the key.
>
> Birthdays. Happy birthday to Martha Ruggles, who is eighty-one. Happy birthday to Tommy Pratt, who is seven and wants it known that he is nearly eight.
>
> And happy birthday to the man at the pumps, who says he is forty-nine. He has said so for eleven years.

#### ashford_guest.mp3: Guest spot (about 48 s)

**Speaker:** Dewey Halloran and Earl (gibberish)

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Guest spot. Earl is the flattest man in the county: mumbling, low, no ups and downs, short bursts. His lines are made-up sounds with real sentence rhythm, not a real language. Record Earl as a second voice (older man, flat, mumbly). Leave a 3 to 4 second gap after each Dewey line where Earl speaks. Dewey answers as if every word made sense.

> I've got a visitor. Earl, from the pumps on Main Street. Earl, say hello.
>
> ~ Mm. Nuh-hmm. Dannow poddle, ressa ka lun bo. Hmf.
>
> Is that right? Folks, Earl says the pumps are open till six, and the coffee is free if you bring your own cup. Is that right, Earl?
>
> ~ Woomba. Heh.
>
> He says it is. And Earl says to stay off Mill Lane. It goes up from the highway to where the mill used to be, and it stops there. It always has.
>
> Thanks, Earl. Come back any time. Maybe bring a cup.

#### ashford_link_4.mp3: DJ link (about 18 s)

**Speaker:** Dewey Halloran

**Voice notes:** Dewey: older man, slow, dry, a little gravel, easygoing. Mid-western American. Small smile in the voice, long pauses between sentences. Link about tractors. Dry. Let the last joke sit, no laugh.

> The paper says experts think tractors will drive themselves someday. Orville Dahl called the station to say his already does. The brakes went out in April, and he calls it a runaway success.
>
> More music, then back with me.

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

#### brandt_link_1.mp3: DJ link (about 18 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Opening link. Big energy but still friendly, like she is talking across the counter. Laugh on "stiff".

> You're on WBRT, Brandt thirteen-forty, the tallest voice in Brandt. I'm Rocky Tillman.
>
> I've got records, the farm report, and a swap shop that is getting out of hand. Don't touch that dial. Seriously, it's stiff, you'll break it.

#### brandt_farm.mp3: Farm report (about 37 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Farm report. Reads the numbers fast and proud, slows down for the fax machine.

> Farm report, Brandt style. Corn is around two twenty a bushel. Soybeans, just under six. Wheat, about three forty. Hogs are up a little, cattle are flat, and milk is thirteen dollars a hundredweight.
>
> The co-op elevator asks that trucks line up on the right side of the road. And the co-op got a fax machine. Somebody faxed a picture of his prize hog to the feed store, just to see if it works. The feed store says it came through fine.

#### brandt_ad_1.mp3: Ad (about 24 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Ad for the diner. Sales voice, a bit loud on purpose, then drops to normal on the last line.

> The diner in Brandt. Pie of the day, coffee all day, and Peg will tell you your business before you tell it to her.
>
> Try the apple pie with cream on top, the way Ray Kessler has it. Sit anywhere. Peg says that is the only rule, and she doesn't like it either.

#### brandt_link_2.mp3: DJ link (about 23 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Link about the Olympics. Cheerful and a bit silly.

> The Olympics start in Barcelona this month, and I have decided to cheer for everybody. Even the person who comes last in the long jump. Especially that person.
>
> The garage in Brandt already has a television going in the bay. If you need an oil change, expect to watch some gymnastics.

#### brandt_swap.mp3: Swap shop (about 27 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Swap shop. Speak it like a game show host who is a little worried about the items.

> Swap shop. Leave a note at the garage or the diner and I'll read it out.
>
> This week. A pickup bed, no truck attached, wants a truck. A saddle, hardly sat in. A ladder, because a man bought one and can't remember why. A tuba, one owner, one lung.
>
> And a pie safe, free to anyone who can carry it.

#### brandt_weather.mp3: Weather and wind report (about 35 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Weather and wind. A forecast for the week, not a live report. Matter-of-fact, clear on the planes line.

> Weather and wind, from the weather service, for the week. Cool for July, highs in the low seventies, and a lot of folks are digging their sweaters out of the cedar chest.
>
> Winds mostly from the west, about ten miles an hour. The planes at the flying club east of town take off and land into the wind. A west wind means they come in from the east, low, and land going west.
>
> Hold on to your hat.

#### brandt_ad_2.mp3: Ad (about 17 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Ad for the garage. Same sales voice as the first ad. Warm on "we like noises".

> Lou's Garage. We fix what you drove in on. Tires, brakes, oil, belts. If your car is making a noise, do the noise for us. We like noises.
>
> Lou's, in Brandt. If it has wheels, bring it.

#### brandt_thought.mp3: Thought for the Road (about 28 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Thought for the Road. Rocky drops the big energy: softer, slower, no grin. Reads the pastor's word plainly, like a note she respects.

> Thought for the Road. It's a short word from Pastor Dale Weber of the Brandt Community Church, and he drops it off every week.
>
> He says, even on the roads you know best, you can't see over the next hill. He finds that a comfort, because God can. He's looking after you, and the fellow coming the other way. Drive safe, folks.

#### brandt_notices.mp3: Local notices and birthdays (about 42 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Local notices and birthdays. Warm and a little fast, then slow on the last birthday.

> Local notices. St. Luke's holds its pie auction on Sunday. If you plan to bid, bring cash and bring a fork. The elevator asks everyone to stop leaving old tires by the scale. Lost, a brown dog named Biscuit. He doesn't answer to anything else.
>
> Birthdays. Happy birthday to Wendell Olsen, who is sixty-two. Happy birthday to Josie Lindgren, who is six, asked for a pony, got a bicycle, and says that is fine.
>
> And happy birthday to Lou at the garage, who said no party. Peg is bringing a cake anyway.

#### brandt_guest.mp3: Guest spot (about 46 s)

**Speaker:** Rocky Tillman and Lou (gibberish)

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Guest spot. Lou is gruff and short, a low mutter. His lines are made-up sounds with real sentence rhythm, not a real language. Record Lou as a second voice (man, low, gruff, grumpy but kind). Leave a 3 to 4 second gap after each Rocky line where Lou speaks. Rocky answers as if every word made sense.

> I have a visitor. Lou from the garage dropped off a part, and I told him he's not leaving until he says hello. Lou, you're on.
>
> ~ Mm. Hrmph. Gorra nash, bidda lunk, ottle ottle rum. Hnh.
>
> Is that right? Folks, Lou says you'll hear the flying club planes long before you see them. He says they go round and round the field on a fine day, and they never fly right over the middle.
>
> So if you are ever trying to find them, don't drive to where they are. Drive to the middle. Did I get that right, Lou?
>
> ~ Hnh.
>
> He says I did. Thanks, Lou. Now go home.

#### brandt_link_3.mp3: DJ link (about 21 s)

**Speaker:** Rocky Tillman

**Voice notes:** Rocky: woman in her thirties, bright and quick, big laugh, small-town warm. Mid-western American. Talks like she is grinning. Link with the caller. Cheerful at first. The laugh after "Ha, ha" is nervous and a little too long. Small pause before "right?".

> The phones are lit up again. One caller says that someday you'll pick any song, any time, no DJ needed. He says it will come through the phone line, or maybe the air, he wasn't sure.
>
> Ha, ha. Sure, sir. They'll always need ol' Rocky... right?
