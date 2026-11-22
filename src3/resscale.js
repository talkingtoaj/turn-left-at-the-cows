// Render resolution. The pixel ratio is capped (sharp laptop screens would
// otherwise draw 4x the pixels), and drops a step at a time when frames stay
// slow, so built-in graphics keep a steady frame rate.
//
// ?res=<n> in the URL fixes the scale (for example ?res=1 for screenshots).

const MAX_RATIO = 1.5; // pixel ratio cap
const MIN_RATIO = 0.6; // never go blurrier than this
const STEPS = [1, 0.85, 0.72, 0.6]; // fractions of the capped ratio
const SLOW_MS = 20; // average frame time that counts as slow (under 50 fps)
const FAST_MS = 17.5; // steady 60 fps
const WINDOW_MS = 1500; // averaging window for stepping down
const UP_AFTER_MS = 5000; // smooth for this long before trying a sharper step
const WARMUP_MS = 2500; // ignore frames right after start or a change

export function createResScale(renderer, params) {
  const base = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const fixed = params.has('res') ? Math.max(0.25, Math.min(2, Number(params.get('res')) || 1)) : null;
  let level = 0;
  let ceiling = 0; // best level we may go back up to (raised after a failed try)
  let sinceChange = 0;
  let acc = 0;
  let n = 0;
  let goodFor = 0;
  let lastUp = -1; // time since the last step up, or -1

  const ratioOf = (lv) => Math.max(Math.min(base, MIN_RATIO), base * STEPS[lv]);
  const apply = () => {
    const r = fixed != null ? fixed : ratioOf(level);
    if (renderer.getPixelRatio() !== r) renderer.setPixelRatio(r);
    sinceChange = 0;
    acc = 0;
    n = 0;
    goodFor = 0;
  };
  apply();

  return {
    get ratio() { return renderer.getPixelRatio(); },
    get level() { return level; },
    // 1 at the sharpest step .. 0 at the blurriest (the grass carpet's reach follows it).
    get detail() { return fixed != null ? 1 : 1 - level / (STEPS.length - 1); },
    // frameMs: real time since the last frame. Call once per frame.
    update(frameMs) {
      if (fixed != null) return;
      if (frameMs > 250) return; // tab was hidden or a hitch while loading
      sinceChange += frameMs;
      if (lastUp >= 0) lastUp += frameMs;
      if (sinceChange < WARMUP_MS) return;
      acc += frameMs;
      n++;
      if (acc < WINDOW_MS) return;
      const avg = acc / n;
      acc = 0;
      n = 0;
      if (avg > SLOW_MS && level < STEPS.length - 1) {
        // A sharper step that failed right away is not tried again.
        if (lastUp >= 0 && lastUp < UP_AFTER_MS + WARMUP_MS) ceiling = level + 1;
        lastUp = -1;
        level++;
        apply();
      } else if (avg < FAST_MS) {
        goodFor += WINDOW_MS;
        if (goodFor >= UP_AFTER_MS && level > ceiling) {
          level--;
          lastUp = 0;
          apply();
        }
      } else {
        goodFor = 0;
      }
    },
  };
}
