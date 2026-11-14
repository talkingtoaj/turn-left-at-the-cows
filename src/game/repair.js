// Repairs: stop at a garage (or a farm with a workshop) and get the car
// fixed, for some time on the clock. Engine-free: main.js finds the shop in
// reach each frame (state.nearRepair), the HUD shows the prompt and calls
// repairCar on E.
//
//   const shop = repairNear(W, x, y, onFoot)   shop in reach, or null
//   needsRepair(state.damage)                  anything worth fixing?
//   repairCar(state, shop) -> { minutes, line } fixes the car, clock runs on

import { freshDamage, PARTS } from './damage.js';
import { minutesToMs } from './clock.js';

// Per region, by building id. kind 'garage': a full fix. kind 'farm': a
// farmer with a welder patches the car up (most of the way), quicker.
export const REPAIR_SHOPS = {
  fenwick: [
    { buildingId: 'a_gas', kind: 'garage', mechanic: 'Earl', name: "Earl's gas station" },
    { buildingId: 'm_h3', kind: 'garage', mechanic: 'Nell', name: "Nell's garage" },
    { buildingId: 'c_feed', kind: 'garage', mechanic: 'Sid', name: 'Calder Feed & Farm' },
    { buildingId: 'p_barn', kind: 'farm', mechanic: 'the farmer', name: 'the farm workshop' },
    { buildingId: 'o_barn', kind: 'farm', mechanic: 'the farmer', name: 'the farm workshop' },
  ],
  brandt: [
    { buildingId: 'br_gas', kind: 'garage', mechanic: 'Lou', name: "Lou's gas station" },
    { buildingId: 'oak_store', kind: 'garage', mechanic: 'the storekeeper', name: 'the Oakham store' },
    { buildingId: 'dg_barn', kind: 'farm', mechanic: 'the farmer', name: 'the farm workshop' },
  ],
};

const REACH_CAR = 24; // metres from the building's middle, in the car
const REACH_FOOT = 14; // on foot
const FARM_PATCH = 0.85; // a farm fix brings each part up to this
const MINUTES = { garage: 30, farm: 20 };

const LINES = {
  garage: [
    'There. Good as new, near enough. Go easy on her.',
    "All fixed. Those back roads'll do it every time.",
    "Done. Next time, maybe don't hit the cows.",
  ],
  farm: [
    "Patched her up. She'll get you to a proper garage.",
    "Wire and a bit of welding. She'll hold. Probably.",
  ],
};

const shopCache = new WeakMap();
function shopsIn(W) {
  if (shopCache.has(W)) return shopCache.get(W);
  const out = [];
  for (const s of REPAIR_SHOPS[W.regionId] || []) {
    const b = (W.buildings || []).find((q) => q.id === s.buildingId);
    if (b) out.push({ ...s, x: b.x, y: b.y });
  }
  shopCache.set(W, out);
  return out;
}

export function repairShops(W) {
  return shopsIn(W);
}

export function repairNear(W, x, y, onFoot = false) {
  const reach = onFoot ? REACH_FOOT : REACH_CAR;
  let best = null;
  let bestD = reach;
  for (const s of shopsIn(W)) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// Worth a stop: any part below 97% (or a dent to beat out).
export function needsRepair(d) {
  return !!d && !d.brokenDown && PARTS.some((p) => d[p] < 0.97);
}

// Fixes the car at `shop`. The clock and trip timer run on. A garage gives a
// fresh car (dents too); a farm patches each part up to FARM_PATCH and
// leaves the dents. Returns { minutes, line }.
export function repairCar(state, shop) {
  const kind = shop.kind === 'farm' ? 'farm' : 'garage';
  const old = state.damage;
  if (kind === 'garage' || !old) {
    const d = freshDamage();
    d.dentsV = ((old && old.dentsV) || 0) + 1;
    state.damage = d;
  } else {
    for (const p of PARTS) old[p] = Math.max(old[p], FARM_PATCH);
    old.stall = 0;
  }
  const minutes = MINUTES[kind];
  state.clockMinutes = (state.clockMinutes + minutes) % 1440;
  state.elapsedMs += minutesToMs(minutes); // the clock runs at real speed
  state.repairs = (state.repairs || 0) + 1;
  const lines = LINES[kind];
  const line = lines[(state.repairs - 1) % lines.length];
  return { minutes, line };
}
