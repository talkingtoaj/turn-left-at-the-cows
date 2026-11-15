// Acting cues for the DJ takes, for ElevenLabs v3 (it reads [tags] as delivery
// directions and does not say them). Not loaded by the game: subtitles come from
// `subtitle` in segments.js. Only the tags, punctuation and capitals may differ
// from the approved words; tools/check-radio.mjs checks the words match.
// Guest spots keep their ~ lines so the paragraphs line up with the subtitle.
//
// Rocky only for now: the owner found her v2 takes stilted (2026-11-15).

export const ACTING_MODEL = 'eleven_v3';

export const ACTING = {
  brandt_link_1:
    "[cheerfully] You're on WBRT, Brandt thirteen-forty, the tallest voice in Brandt! I'm Rocky Tillman.\n\n" +
    "[warmly] I've got records, the farm report, and several new items for Swap Shop. Stay with us!",

  brandt_intro_1: "[upbeat] Let's start with General Davie Wigglebottom the Third, and Sunday Mornin' Rush!",

  brandt_farm:
    "[briskly] Brandt Co-op is bidding two dollars twenty-five for corn, five dollars fifty-eight for soybeans, and three dollars thirty-seven for wheat. Butcher hogs are around forty-three fifty, and choice steers are holding near seventy-four.\n\n" +
    "[matter-of-fact] The elevator asks wheat trucks to use the south scale until further notice. [slowing down, amused] The office also has a new fax machine. Calvin Roark faxed a picture of his prize hog to the feed counter... [chuckles] just to see if it works.",

  brandt_ad_1:
    "[upbeat, a bit loud, selling it] Peg's diner in Brandt serves breakfast from six, with eggs, sausage, biscuits, and coffee kept hot! Lunch includes meat loaf, chicken-fried steak, and a vegetable plate. [excited] Pie this week is apple, cherry, or coconut cream! [back to normal] Whole pies may be ordered one day ahead.",

  brandt_intro_2: "[warmly] Here's Davie Brown with Deacon Dan Can Dance!",

  brandt_link_2:
    "[cheerfully] The Olympics start in Barcelona later this month! Lou's got a television going in the bay at the garage, set on a crate. [chuckles] People are asking about the basketball, with the pros in it. You can hear it from the lot if the door's up. [playfully] I'll get down for some of it.",

  brandt_swap:
    "[like a game show host] Swap shop! Leave a note at the garage or the diner. I'll read them on the air.\n\n" +
    "Carl Bemis has a boom pole for a three-point hitch. He wants truck chains.\n\n" +
    "[a little unsure] Ruth Keller has a girl's bike, twenty-inch wheels, needs a tube. She'll trade for a playpen.\n\n" +
    "[puzzled] A window fan that works, for canning jars... No name on the note. [laughs] Ask Peg.",

  brandt_intro_3: "[brightly] Alicia Havernstein next. This is Don't Make Me Wait.",

  brandt_weather:
    "[matter-of-fact] The week stays cooler than usual, with highs from seventy-six to eighty and west winds near ten miles an hour. A shower may pass through Wednesday night, with better drying weather afterward.\n\n" +
    "[clearly, a little slower] A note for anyone watching the flying club east of Brandt: airplanes take off and land into the wind. With a west wind, they'll approach low from the east and land going west. [reassuring] That is normal traffic for the field, though livestock owners nearby may want to keep gates secured.",

  brandt_ad_2:
    "[upbeat, selling it] Lou's Garage. We fix what you drove in on! Tires, brakes, oil, belts. [playfully] If your car is making a noise, do the noise for us. [warmly] We like noises.\n\n" +
    "[upbeat] Lou's, in Brandt. If it has wheels, bring it!",

  brandt_thought:
    "[softly, slower] Time for Thought for the Road, a short word Pastor Dale Weber of Brandt Community Church drops off each week.\n\n" +
    "[gently] He writes, even on a road you know well, you can't see over the next hill. He finds comfort in knowing God can. He's looking after you, and the fellow coming the other way.\n\n" +
    "[warmly] Drive safely, folks.",

  brandt_notices:
    "[warm, a little quick] St. Luke's will hold its annual pie auction Friday at seven in the fellowship hall. Pie donations may be brought in after four, and coffee will be provided.\n\n" +
    "Brandt Co-op reminds growers that the south scale opens at six during wheat harvest. The north scale remains closed for repairs.\n\n" +
    "[concerned] A black-and-white farm dog named Patch is missing from the Miller place. He has a red collar and is friendly. Leave word at the diner if seen.\n\n" +
    "[slowing down, warmly] Birthday wishes go to Helen Ward, sixty-six... and Tommy Reese, nine!",

  brandt_intro_4: "[relaxed] From the Tin Shed Boys, Sunday Afternoon Jazz.",

  brandt_guest:
    "[cheerfully] Lou from the garage is here, dropping off a part for the transmitter. Lou, say hello!\n\n" +
    "~ Mm. Hrmph. Gorra nash, bidda lunk, ottle ottle rum. Hnh.\n\n" +
    "[laughs] Good to see you too. Lou, people keep asking me how to find the flying club. I tell them the planes go round and round the field on a fine day, and they never fly over the middle. So you drive to the middle of the circle.\n\n" +
    "~ Hnh. Gorra nash.\n\n" +
    "[amused] I thought so.\n\n" +
    "~ Bidda lunk. Hrmph.\n\n" +
    "[warmly] Thanks, Lou! That's Lou's Garage, here in Brandt, if your car needs looking at.",

  brandt_link_3:
    "[cheerfully] The phones are lit up again! One caller says that someday you'll pick any song, any time, no DJ needed. [amused] He thinks it'll come through the phone line, or maybe through the air. He wasn't sure about that part.\n\n" +
    "[laughs nervously] Ha, ha. Sure, sir. They'll always need ol' Rocky... right?",
};
