// Display units (ADR 0001). The world, physics and every tool stay in metres
// and m/s. Anything the player SEES goes through here: mph, miles, feet, and
// whole or half miles for road signs. Pure functions, no engine imports, so
// signs, local lines, the tow card and the load screen can all call them.
//
//   mphFromMps(mps)            m/s -> mph (a number, not rounded)
//   milesFromMetres(m)         metres -> miles (a number)
//   feetFromMetres(m)          metres -> feet (a number)
//   odometerHundredths(m)      metres -> hundredths of a mile (for the dash drums)
//   milesText(m, digits = 1)   "3.4 mi"
//   feetText(m)                "300 ft" (rounded to the nearest 10)
//   shortDistanceText(m)       feet under a quarter mile, else miles ("300 ft", "2.5 mi")
//   signMiles(m)               nearest half mile as a number (2.5)
//   signMilesText(m)           sign style, no unit: "2", "2½", "½"
//   mphText(mps)               "45 mph" (whole number)

export const METRES_PER_MILE = 1609.344;
export const FEET_PER_METRE = 3.280839895;
export const MPS_TO_MPH = 3600 / METRES_PER_MILE; // 2.2369...

export const mphFromMps = (mps) => mps * MPS_TO_MPH;
export const milesFromMetres = (m) => m / METRES_PER_MILE;
export const feetFromMetres = (m) => m * FEET_PER_METRE;
export const odometerHundredths = (m) => (m / METRES_PER_MILE) * 100;

export const mphText = (mps) => `${Math.round(mphFromMps(mps))} mph`;
export const milesText = (m, digits = 1) => `${milesFromMetres(m).toFixed(digits)} mi`;
export const feetText = (m) => `${Math.round(feetFromMetres(m) / 10) * 10} ft`;

// Under a quarter mile people say feet; beyond that, miles.
export function shortDistanceText(m) {
  return m < METRES_PER_MILE / 4 ? feetText(m) : milesText(m);
}

// Road signs round to the nearest half mile (never below a half).
export const signMiles = (m) => Math.max(0.5, Math.round(milesFromMetres(m) * 2) / 2);

export function signMilesText(m) {
  const mi = signMiles(m);
  const whole = Math.floor(mi);
  if (mi - whole !== 0.5) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}
