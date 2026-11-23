// Road bridges (#78): what each intact bridge gets, decided from its data
// only (no three.js), so tools/check-bridges.mjs can test it.
//
//   through truss  long spans (36 m and up): steel trusses each side, tied
//                  overhead, with a portal at each end the road runs through
//   pony truss     30 to 36 m paved spans: low trusses each side, no overhead
//   plain          the rest: girders under the deck, a pier pair in the water
//
// Paved roads get concrete end posts, steel rails and a guardrail run in at
// each corner. Dirt roads get a plank deck and timber rails.
// The name plate shows the road's own name (no new words, SPEC 9r).

export const BRIDGE = {
  THROUGH_MIN: 36, // m: spans this long get a through truss
  PONY_MIN: 30, // m: paved spans this long get a pony truss
  THROUGH_H: 6.2, // m: top chord above the deck
  PONY_H: 2.1,
  PORTAL_DEPTH: 0.9, // m: portal beam under the top chord
  KNEE: 0.7, // m: knee braces drop below the portal beam at the truss
  PANEL: 4.5, // m: wanted panel length
  CLEAR_MIN: 4.9, // m: least headroom over the road lanes (semis are 4.1)
};

// Panel count: even (so the truss is the same both halves), at least 4.
export function panelCount(L) {
  return Math.max(4, 2 * Math.round(L / (2 * BRIDGE.PANEL)));
}

export function trussKind(b, road) {
  if (!b.intact || b.kind !== 'bridge') return null;
  if (b.length >= BRIDGE.THROUGH_MIN) return 'through';
  if (road && road.type === 'paved' && b.length >= BRIDGE.PONY_MIN) return 'pony';
  return null;
}

// Headroom over the road at lx (m from the centre line) under a through
// truss's portal: the portal beam's underside, lowered near the trusses
// where the knee braces hang down.
export function portalClearance(b, lx) {
  const T = b.width / 2 + 0.15; // truss line
  const H = BRIDGE.THROUGH_H;
  const under = H - BRIDGE.PORTAL_DEPTH;
  const kneeW = 1.6; // knee runs this far in from the truss
  const inFromTruss = T - Math.abs(lx);
  if (inFromTruss >= kneeW) return under;
  return under - BRIDGE.KNEE * (1 - Math.max(0, inFromTruss) / kneeW);
}

export function bridgePlan(b, road) {
  const paved = !!road && road.type === 'paved';
  const truss = trussKind(b, road);
  const n = panelCount(b.length);
  return {
    paved,
    truss,
    panels: n,
    panelLen: b.length / n,
    height: truss === 'through' ? BRIDGE.THROUGH_H : truss === 'pony' ? BRIDGE.PONY_H : 0,
    piers: !truss, // trusses span bank to bank
    plate: road && road.name ? road.name.toUpperCase() : null,
    guardrail: paved, // steel guardrail runs in at each corner
  };
}
