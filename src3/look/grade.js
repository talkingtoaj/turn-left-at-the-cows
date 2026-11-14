// The country look's colour grade, all in one place. Every knob has a default
// here and can be changed from the URL (for tuning) or, later, overridden by
// a per-mission preset: pass `preset` to makeGrade and its values win over the
// defaults (the URL still wins over both).
//
// What it does, in order of effect:
//  - olive and straw greens: greens lose some blue and gain some red
//  - teal shadows, warm highlights: split toning
//  - lifted blacks: shadows never go fully black
//  - cream fog: the fog and horizon colour is pulled toward cream
//  - soft vignette and light grain: a screen overlay (see applyOverlay)
//
// The colour part runs inside the tone mapping (one shader chunk, no extra
// pass). Set &grade=0 to turn the whole thing off.

export const GRADE_DEFAULTS = {
  on: 1,
  olive: 0.22, // 0..1, how far greens slide toward olive and straw
  warm: 0.06, // highlights, added to red, taken from blue
  teal: 0.05, // shadows, added to green and blue
  lift: 0.012, // lifted blacks (linear light added to the darkest tones)
  cream: 0.5, // 0..1, how much the fog is pulled toward cream
  vig: 0.28, // vignette strength, 0 is none
  grain: 0.05, // grain strength, 0 is none
};

export const CREAM = [1.0, 0.94, 0.8]; // linear multiplier for the fog

export function makeGrade(params, preset = null) {
  const g = { ...GRADE_DEFAULTS, ...(preset || {}) };
  for (const k of Object.keys(GRADE_DEFAULTS)) {
    const key = k === 'on' ? 'grade' : 'g_' + k;
    if (params.has(key)) g[k] = Number(params.get(key));
  }
  return g;
}

// GLSL for the body of CustomToneMapping, after ACES. `color` is linear.
export function gradeGLSL(g) {
  if (!g.on) return '';
  const f = (n) => n.toFixed(4);
  return `
  float gl = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  float greenness = clamp( ( color.g - max( color.r, color.b ) ) * 6.0, 0.0, 1.0 );
  color.r += color.g * greenness * ${f(g.olive * 0.35)};
  color.b *= 1.0 - greenness * ${f(g.olive * 0.5)};
  float hi = smoothstep( 0.35, 0.95, gl );
  float sh = 1.0 - smoothstep( 0.0, 0.35, gl );
  color += vec3( ${f(g.warm)}, ${f(g.warm * 0.3)}, ${f(-g.warm)} ) * hi;
  color += vec3( ${f(-g.teal * 0.4)}, ${f(g.teal * 0.5)}, ${f(g.teal)} ) * sh * 0.5;
  color = color * ( 1.0 - ${f(g.lift)} ) + vec3( ${f(g.lift)} );
  color = max( color, vec3( 0.0 ) );`;
}

// Fog and horizon tint (linear multiplier for a colour).
export function creamTint(g) {
  const k = g.on ? g.cream : 0;
  return [1 + (CREAM[0] - 1) * k, 1 + (CREAM[1] - 1) * k, 1 + (CREAM[2] - 1) * k];
}

// Vignette and grain as one fixed overlay on the page. Cheap: the browser
// composites it, and the game renders nothing extra. Call again with a new
// grade (for presets) to change it.
export function applyOverlay(g, parent = document.getElementById('app') || document.body) {
  let el = document.getElementById('grade-overlay');
  if (!g.on || (g.vig <= 0 && g.grain <= 0)) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'grade-overlay';
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
    parent.appendChild(el);
  }
  const noise = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(noise)}")`;
  const vig = `radial-gradient(ellipse at 50% 50%, rgba(30,24,10,0) 55%, rgba(30,24,10,${g.vig.toFixed(3)}) 120%)`;
  // Grain strength is the noise layer's own alpha, via a second element.
  let gr = el.firstChild;
  if (!gr) {
    gr = document.createElement('div');
    el.appendChild(gr);
  }
  // A faint colour wash from a mission preset ([r, g, b, alpha]).
  const w = g.wash;
  const wash = w ? `linear-gradient(rgba(${w[0]},${w[1]},${w[2]},${w[3]}),rgba(${w[0]},${w[1]},${w[2]},${w[3]})), ` : '';
  el.style.background = wash + vig;
  gr.style.cssText = `position:absolute;inset:0;background:${url};opacity:${g.grain.toFixed(3)};mix-blend-mode:overlay;`;
}
