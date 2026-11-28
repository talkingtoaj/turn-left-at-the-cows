# Turn Left at the Cows

A driving game about finding your way in the countryside with outdated maps, your own sketch, and directions from locals. These are the words we use for the game's world and how it plays.

## People

**Relief carrier**:
The player. They cover Darlene's rural mail route in their own car while her wrist heals, and do favours for people along the way.
_Avoid_: courier, driver, mail person

**Local**:
A person in the world you can walk up to and talk with. They speak gibberish with subtitles and give directions that are partly wrong.
_Avoid_: NPC, villager

**Tourist**:
A stranger parked at one fixed spot in a mission who asks the player for directions. Easy to miss, sometimes off the main way.
_Avoid_: lost driver, hitchhiker

## Missions

**Win screen**:
The screen at the end of a mission: your map snapshots, the trip stats, a line from the person you delivered to, and ticked extras like helping the tourist. There is no score.
_Avoid_: score screen, results screen

**Showpiece**:
Heavy optional scenery, such as the road crew, shown only when the frame rate has room. It is decided while still out of sight, so it never pops in or out in view.
_Avoid_: optional asset, extra

## Maps

**Map**:
Any map handed to the player, printed or drawn by someone else, such as Darlene's 1987 county map or Mrs Hartley's map. Maps have mistakes in them on purpose.
_Avoid_: printed map (for a hand-drawn one), sketch

**Sketch**:
The map the player draws for themselves on the map screen. Only ever the player's own drawing, except that mission 1's starts with a few marks in the same pencil (Ashford, the gas station, the start street and a piece of Highway 9).
_Avoid_: drawing, hand map, my map

**Map wall**:
The corkboard of every shared sketch for one mission, most votes first, with the real map pinned beside them. The player gets there by picking the better of two other drivers' sketches (a pick is a thumbs-up), or straight from the start screen's Maps link.
_Avoid_: gallery, maps page, map board (that is the server)

**Seed map**:
A deliberately poor sketch made by `tools/seed-maps.mjs` and loaded by an admin so the map wall isn't empty. Made-up nickname, never anyone's own.

## Getting lost

**Trap**:
A spot where a map or a local's directions lead a careless player wrong, placed on purpose by the mission's author. Traps come from a fixed list in the spec.
_Avoid_: trick, gotcha, lie (a lie is one mistake inside a map)

**Tell**:
The clue in the world that lets an observant player catch a trap, such as a mailbox at a driveway or a road sign at a junction. Every trap has one.
_Avoid_: sign (that word means a road sign), hint

## Places

**Lookout**:
A high place the player can climb on foot to see the real land around them, with no labels or markers.
_Avoid_: viewpoint, vista
