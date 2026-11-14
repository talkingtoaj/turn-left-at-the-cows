// Add-on world data. A region can list extra data modules (same shape as the
// main data, any subset of keys, plus new kinds such as masts or props).
// They are merged into the region's source at build time, so separate lanes
// can add places without editing one big data file. See DATA.md.
//
// Merge rules, per key:
//   array     add-on items are appended after the main ones
//   object    shallow merge, add-on keys win (e.g. ambient, printedMaps)
//   other     only set when the main data has no value for the key
// Keys the build step does not know pass through to the built world as is.

export function mergeAddons(base, addons = []) {
  const out = { ...base };
  for (const add of addons) {
    for (const [key, val] of Object.entries(add)) {
      const cur = out[key];
      if (Array.isArray(val)) {
        out[key] = Array.isArray(cur) ? [...cur, ...val] : [...val];
      } else if (val && typeof val === 'object') {
        out[key] = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur, ...val } : { ...val };
      } else if (cur === undefined) {
        out[key] = val;
      }
    }
  }
  return out;
}
