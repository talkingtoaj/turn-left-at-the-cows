// Showpiece gate (#95, SPEC 9s item 9). Showpieces are heavy optional scenery
// (the road crew is the first). They show only when the frame rate has room,
// and they never pop in or out where the player can see it happen.
//
// Engine-free: src3/main.js feeds it numbers once a frame, tools/check-roadcrew.mjs
// calls it over many frames with changing input.
//
//   showpiecesMode(params)            'on' | 'off' | 'auto'   (?showpieces=on|off)
//   wantShowpiece(mode, detail)       what the frame rate allows right now
//   createShowpieceGate({ mode })     .update({ detail, dist, behind, eligible }) -> shown
//
// detail is the resolution scaler's number (src3/resscale.js: 1 at the sharpest
// step, 0 at the blurriest, and 1 when ?res= pins it). At 0 the showpieces are
// skipped. A pinned ?res= counts as room, so a shot or a laptop check is not
// fooled by the scaler.
//
// The shown state changes only while the thing is out of sight: farther than
// SIGHT_M, or behind the camera. While in view it holds whatever it was.
// With latch: true a shown piece stays shown for good (the road crew has
// solid parts the car bumps into, so it must not vanish and leave a wall).

export const SIGHT_M = 300; // m: past this a showpiece is out of sight (the fog is thick by then)

export function showpiecesMode(params) {
  const v = params && params.get ? params.get('showpieces') : null;
  return v === 'on' || v === 'off' ? v : 'auto';
}

export function wantShowpiece(mode, detail) {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return detail > 0;
}

// How far a showpiece is out of sight, from the camera. A showpiece fills a disc
// of radius r around (cx, cz) (ground plane, three.js x/z). Returns
// { dist, behind }: dist is the distance to the nearest point it could have, and
// behind is true when the whole disc lies behind the camera's plane (so none of it
// can be in the frustum). cam: { x, z }, fwd: unit { x, z } the way the camera faces.
export function sightOf(cam, fwd, cx, cz, r) {
  const dx = cx - cam.x;
  const dz = cz - cam.z;
  const len = Math.hypot(fwd.x, fwd.z) || 1;
  const along = (dx * fwd.x + dz * fwd.z) / len;
  return { dist: Math.max(0, Math.hypot(dx, dz) - r), behind: along < -r };
}

export function createShowpieceGate({ mode = 'auto', latch = false, sightM = SIGHT_M } = {}) {
  let shown = false;
  let started = false;
  return {
    get shown() { return shown; },
    // detail: scaler detail 0..1; dist: m from the camera; behind: true when the
    // piece is behind the camera; eligible: false while the world says not yet
    // (the opening storm) or not here.
    update({ detail = 1, dist = Infinity, behind = false, eligible = true } = {}) {
      const want = eligible && wantShowpiece(mode, detail);
      if (!started) {
        started = true;
        // The very first frame of a forced mode applies at once (shots, laptop
        // checks): the load screen is still up, nobody sees it.
        if (mode !== 'auto') { shown = want; return shown; }
      }
      const outOfSight = behind || dist > sightM;
      if (want !== shown && outOfSight && !(latch && shown)) shown = want;
      return shown;
    },
  };
}
