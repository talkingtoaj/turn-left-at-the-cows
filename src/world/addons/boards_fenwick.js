// Hand-painted boards at crafted places (issue 9). They are not road signs:
// they sit in world.boards, so nothing reads them as directions and they
// teach no place names. Words are in lines/issue9.json for owner review.
//   x, y: the board; faces: heading the front looks toward (the road);
//   mount: 'gate' | 'stake' | 'fence' (see buildBoards in src3/world3d/props.js).
export const BOARDS_FENWICK = {
  boards: [
    // Pruitt farm, sheep field gate on the west side of Pruitt Lane.
    { id: 'bd_eggs', look: 0, x: 2965.7, y: 1110, faces: 112, mount: 'gate', lines: ['EGGS $1 A DOZEN.', 'Leave money in the tin.'] },
    // Hartley Lane, a leaning stake by the farmhouse.
    { id: 'bd_slow', look: 1, x: 2600, y: 489, faces: 238, mount: 'stake', lines: ['SLOW.', 'Children playing.'] },
  ],
};
