// CSS for the start screen: "paper on the dash" (SPEC 6h). The live world
// shows through the windshield at the top; the dash and the paper map on
// the passenger seat fill the rest.
// Palette: dash #1c1d1f / #3a3c40, amber #e6b450, paper #f1ead6 / #d8ccb4,
// graphite #4a4a48, ink #3a3128, barn red #b3261e, sky #6f9fb8, straw #d9b45a.

export const SPLASH_CSS = `
.sp { position: fixed; inset: 0; z-index: 1000; display: grid; grid-template-rows: minmax(190px, 42vh) 1fr;
  color: #f1ead6; font-family: Georgia, "Libre Baskerville", serif; overflow: hidden; transition: opacity 0.5s; }
.sp * { box-sizing: border-box; }
.sp.sp-out { opacity: 0; pointer-events: none; }
.sp button { font: inherit; color: inherit; }
.sp :focus { outline: none; }
.sp :focus-visible { outline: 3px solid #e6b450; outline-offset: 3px; }
.sp-paper :focus-visible, .sp-howto :focus-visible { outline-color: #b3261e; }
.sp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Windshield: transparent glass in a dark frame, so the world (#app) shows. */
.sp-top { position: relative; overflow: hidden; padding: 14px 16px 0; }
.sp-glass { position: relative; height: 100%; border-radius: 34px 34px 10px 10px / 40px 40px 10px 10px;
  box-shadow: 0 0 0 200px #1c1d1f, inset 0 0 0 3px #2b2c2f, inset 0 0 40px rgba(0,0,0,0.45); }
.sp-paint { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; transition: opacity 1.4s ease;
  background: linear-gradient(#6f9fb8 0%, #a9c6d2 55%, #dfe3d6 70%); }
.sp-paint svg { position: absolute; left: 0; bottom: 0; width: 100%; height: 62%; }
body[data-world="live"] .sp-paint { opacity: 0; }
.sp-glare { position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0.10) 0 18%, transparent 18% 60%, rgba(255,255,255,0.05) 60% 64%, transparent 64%); }
.sp-mirror { position: absolute; top: 0; left: 50%; width: 132px; height: 34px; margin-left: -66px; border-radius: 0 0 10px 10px;
  background: #26272a; box-shadow: 0 3px 6px rgba(0,0,0,0.4); }

/* The title on a cream road sign, pinned to the top left of the glass. */
.sp-sign { position: absolute; left: clamp(14px, 3vw, 40px); top: clamp(18px, 4vh, 40px); max-width: min(520px, calc(100% - 28px));
  padding: 12px 18px 12px; background: #f1ead6; color: #3a3128; border: 3px solid #3a3128; border-radius: 10px;
  box-shadow: 0 0 0 4px #f1ead6, 0 10px 24px rgba(0,0,0,0.35); transform: rotate(-1.5deg); }
.sp-sign h1 { margin: 0; font: 600 clamp(28px, 4.4vw, 50px)/0.95 Oswald, "Arial Narrow", Impact, sans-serif; letter-spacing: 0.02em;
  text-transform: uppercase; color: #3a3128; }
.sp-sign h1 .sp-cows { color: #b3261e; }
.sp-sign p { margin: 8px 0 0; font: clamp(15px, 1.5vw, 17px)/1.3 Georgia, "Libre Baskerville", serif; font-style: italic; color: #3a3128; }
.sp-arrow { position: absolute; right: -40px; top: 2px; width: 70px; height: 56px; pointer-events: none; }
.sp-pin { position: absolute; right: 14px; top: -10px; width: 16px; height: 16px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #e0574a, #b3261e 55%, #7c1812); box-shadow: 1px 2px 2px rgba(0,0,0,0.4); }

/* First visit: a local at a fence, one line, then gone. Never blocks. */
.sp-local { position: absolute; right: clamp(16px, 5vw, 70px); bottom: 10px; display: flex; align-items: flex-end; gap: 8px;
  pointer-events: none; animation: sp-in 0.6s ease both; }
.sp-local svg { width: 120px; height: 96px; }
.sp-local.sp-gone { animation: sp-out 0.6s ease both; }
.sp-say { margin-bottom: 44px; padding: 6px 12px; background: #f1ead6; color: #3a3128; border-radius: 4px;
  font: 24px/1.1 Caveat, "Segoe Print", cursive; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
.sp-skip { pointer-events: auto; margin-left: 6px; padding: 2px 8px; font: 13px Oswald, "Arial Narrow", sans-serif !important; letter-spacing: 0.08em;
  background: transparent; border: 1px solid #3a3128; border-radius: 3px; cursor: pointer; color: #3a3128 !important; vertical-align: middle; }
@keyframes sp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes sp-out { to { opacity: 0; transform: translateY(8px); } }

/* Dash. */
.sp-dash { position: relative; display: grid; grid-template-columns: minmax(280px, 36%) 1fr; gap: clamp(14px, 2.5vw, 34px);
  padding: 18px clamp(16px, 3vw, 40px) 18px; min-height: 0;
  background: linear-gradient(#3a3c40, #1c1d1f 22px), #1c1d1f; border-top: 1px solid #4a4c51; }
.sp-dash::before { content: ''; position: absolute; left: 0; right: 0; top: -1px; height: 6px; background: linear-gradient(#55575c, transparent); opacity: 0.5; }

/* Notepad: the list of jobs and the big button. */
.sp-pad { display: flex; flex-direction: column; min-height: 0; gap: 12px; }
.sp-paper { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 16px 12px; color: #3a3128;
  background: #f1ead6; border-radius: 2px 2px 3px 3px; transform: rotate(-0.6deg);
  background-image: repeating-linear-gradient(transparent 0 29px, rgba(111,159,184,0.35) 29px 30px);
  background-position: 0 44px; box-shadow: 0 10px 22px rgba(0,0,0,0.5); }
.sp-paper::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; height: 8px;
  background: radial-gradient(circle at 6px 0, transparent 5px, #f1ead6 5.5px) 0 0 / 12px 8px repeat-x; }
.sp-paper h2 { margin: 0 0 6px; font: 600 13px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.18em; text-transform: uppercase; color: #b3261e; }
.sp-jobs { list-style: none; margin: 0; padding: 0; }
.sp-jobs li { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 4px 8px; min-height: 30px; padding: 2px 0; }
.sp-jobs li.is-hot { background: rgba(230,180,80,0.25); }
.sp-mark { font: 24px/1 Caveat, cursive; color: #4a4a48; text-align: center; }
.sp-jobs .done .sp-mark { color: #2f6a35; }
.sp-jname { font: 23px/1.05 Caveat, "Segoe Print", cursive; color: #3a3128; }
.sp-jbest { display: block; font: 18px/1 Caveat, cursive; color: #4a4a48; }
.sp-jbtn { padding: 3px 10px; font: 500 13px Oswald, "Arial Narrow", sans-serif !important; letter-spacing: 0.08em; text-transform: uppercase;
  color: #3a3128 !important; background: transparent; border: 1.5px solid #3a3128; border-radius: 3px; cursor: pointer; }
.sp-jbtn:hover { background: #d8ccb4; }
.sp-savenote { margin: 8px 0 0; font: 14px/1.3 Georgia, serif; font-style: italic; color: #7c1812; }

.sp-go { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sp-play { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px 26px 11px; min-width: 210px;
  background: #e6b450; color: #1c1d1f !important; border: 0; border-radius: 6px; cursor: pointer; text-align: left;
  box-shadow: 0 4px 0 #9c7426, 0 8px 18px rgba(0,0,0,0.45); transition: transform 0.08s, box-shadow 0.08s; }
.sp-play b { font: 600 30px/1 Oswald, "Arial Narrow", Impact, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
.sp-play small { font: 15px/1.2 Georgia, serif; font-style: italic; max-width: 260px; }
.sp-play:hover { background: #f0c463; }
.sp-play:active { transform: translateY(3px); box-shadow: 0 1px 0 #9c7426, 0 4px 10px rgba(0,0,0,0.45); }
.sp-play:disabled { cursor: progress; opacity: 0.85; }
.sp-key { width: 48px; height: 48px; padding: 0; border-radius: 50%; border: 2px solid #4a4c51; cursor: pointer;
  background: radial-gradient(circle, #2b2c2f 40%, #111 70%); }
.sp-key svg { width: 100%; height: 100%; transition: transform 0.35s cubic-bezier(.3,1.6,.5,1); }
.sp-key.on svg { transform: rotate(70deg); }
.sp-small { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sp-chip { padding: 6px 12px; background: #2b2c2f; border: 1px solid #55575c; border-radius: 4px; cursor: pointer;
  font: 500 14px Oswald, "Arial Narrow", sans-serif !important; letter-spacing: 0.08em; text-transform: uppercase; color: #f1ead6 !important; }
.sp-chip:hover { background: #3a3c40; }
.sp-chip[aria-pressed="true"] { color: #e6b450 !important; }
.sp-hint { font: 13px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.06em; color: #b9b6ac; }
.sp-phone { padding: 12px 14px; background: #f1ead6; color: #3a3128; border-radius: 4px; }
.sp-phone p { margin: 0 0 10px; font: 17px/1.35 Georgia, serif; }
.sp-phone strong { font: 600 19px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.04em; display: block; margin-bottom: 4px; }
.sp-phone .sp-play { min-width: 0; padding: 10px 20px; }
.sp-phone .sp-play b { font-size: 20px; }
.sp-err { margin: 0; padding: 8px 12px; background: #f1ead6; color: #7c1812; border-left: 4px solid #b3261e; font: 15px/1.35 Georgia, serif; }

/* The map on the passenger seat, with a coffee ring, a pencil and a compass. */
.sp-seat { position: relative; min-height: 0; display: flex; align-items: center; justify-content: center; }
.sp-map { position: relative; width: 100%; max-height: 100%; aspect-ratio: 820 / 470; max-width: calc((100vh - 42vh - 60px) * 820 / 470);
  background: #f1ead6; color: #3a3128; border-radius: 2px; transform: rotate(1.2deg); box-shadow: 0 14px 30px rgba(0,0,0,0.55);
  background-image:
    linear-gradient(90deg, transparent 49.6%, rgba(58,49,40,0.10) 50%, transparent 50.4%),
    linear-gradient(transparent 49.4%, rgba(58,49,40,0.08) 50%, transparent 50.6%),
    radial-gradient(ellipse at 15% 10%, rgba(255,252,240,0.9), transparent 55%),
    radial-gradient(ellipse at 85% 95%, rgba(216,204,180,0.95), transparent 60%); }
.sp-mapsvg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mp-title { font: bold 22px "Libre Baskerville", Georgia, serif; letter-spacing: 0.12em; fill: #3a3128; }
.mp-sub { font: 10px "Libre Baskerville", Georgia, serif; letter-spacing: 0.2em; fill: #4a4a48; }
.mp-county { font: 12px "Libre Baskerville", Georgia, serif; letter-spacing: 0.3em; fill: #8a7f6c; }
.mp-town { font: 14px "Libre Baskerville", Georgia, serif; fill: #3a3128; }
.mp-town.mp-small { font-size: 11px; fill: #4a4a48; }
.mp-roadname { font: 600 10px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.18em; fill: #4a4a48; }
.mp-road { stroke: #4a4a48; stroke-width: 2.6; }
.mp-gap { stroke-dasharray: 3 6; }
.mp-water { stroke: #6f9fb8; }
.mp-house { fill: none; stroke: #4a4a48; stroke-width: 1.2; }
.mp-hand { font: 21px Caveat, "Segoe Print", cursive; fill: #4a4a48; }
.mp-faint { fill: #8a8478; }
.mp-best { fill: #2f6a35; }
.mp-next { fill: #b3261e; font-size: 23px; }
.mp-circle { stroke: #b3261e; stroke-width: 2.4; }
.mp-tick { stroke: #2f6a35; stroke-width: 3; }
.mp-dot { fill: #8a8478; }
.mp-north path { stroke: #4a4a48; stroke-width: 2; fill: none; }
.mp-north text { font: 18px Caveat, cursive; fill: #4a4a48; }
.mp-m.is-hot .mp-circle, .mp-m.is-hot .mp-tick { stroke-width: 4.5; }
.mp-m.is-hot text { text-decoration: underline; }
.sp-ring { position: absolute; right: 26%; bottom: 6%; width: 22%; aspect-ratio: 1; border-radius: 50%; pointer-events: none;
  box-shadow: inset 0 0 0 5px rgba(120,78,38,0.22), inset 0 0 0 9px rgba(120,78,38,0.07), 0 0 0 2px rgba(120,78,38,0.08);
  transform: rotate(20deg) scaleY(0.97); }
.sp-pencil { position: absolute; left: 4%; bottom: -16px; width: 52%; height: 22px; pointer-events: none; transform: rotate(-8deg); filter: drop-shadow(0 4px 3px rgba(0,0,0,0.45)); }
.sp-compass { position: absolute; right: -22px; bottom: -26px; width: 88px; height: 88px; pointer-events: none; filter: drop-shadow(0 5px 5px rgba(0,0,0,0.5)); }
.sp-note { position: absolute; left: 3%; bottom: 9%; padding: 6px 12px 7px; background: #f6e7a4; color: #3a3128 !important; border: 0;
  border-radius: 1px; transform: rotate(-3deg); cursor: pointer; box-shadow: 0 3px 6px rgba(0,0,0,0.3); font: 22px/1 Caveat, "Segoe Print", cursive !important; }
.sp-note:hover { background: #fbeeb5; }

/* How to play: a sheet that folds out over the map. */
.sp-howto { position: absolute; inset: 0; z-index: 3; overflow: auto; padding: 18px 22px 16px; color: #3a3128; background: #f1ead6;
  border-radius: 3px; box-shadow: 0 14px 30px rgba(0,0,0,0.6); animation: sp-in 0.25s ease both; }
.sp-howto[hidden] { display: none; }
.sp-howto h2.sp-hh { margin: 0 0 10px; font: 600 22px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
.sp-howto .ui-cols { gap: 18px; }
.sp-howto .ui-steps li { font-size: 15px; }
.sp-howto .ui-h { color: #b3261e; }
.sp-howclose { position: absolute; right: 12px; top: 12px; padding: 4px 10px; background: transparent; border: 1.5px solid #3a3128; border-radius: 3px;
  cursor: pointer; font: 500 13px Oswald, "Arial Narrow", sans-serif !important; letter-spacing: 0.08em; text-transform: uppercase; color: #3a3128 !important; }
.sp-howfoot { margin: 10px 0 0; font: 20px Caveat, cursive; color: #4a4a48; }

/* Short screens: tighten. */
@media (max-height: 640px) and (min-width: 761px) {
  .sp { grid-template-rows: minmax(150px, 36vh) 1fr; }
  .sp-map { max-width: calc((100vh - 36vh - 50px) * 820 / 470); }
  .sp-play b { font-size: 24px; }
  .sp-play { padding: 9px 20px; }
  .sp-sign h1 { font-size: 30px; }
}

/* Phones and narrow windows: one column that scrolls; map below the list. */
@media (max-width: 760px) {
  .sp { display: block; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .sp-top { height: 34vh; min-height: 220px; padding: 10px 10px 0; }
  .sp-sign { left: 12px; top: 22px; padding: 10px 12px; }
  .sp-sign h1 { font-size: clamp(26px, 8vw, 36px); }
  .sp-arrow { display: none; }
  .sp-local { display: none; }
  .sp-dash { display: flex; flex-direction: column; padding: 16px 16px 40px; }
  .sp-paper { overflow: visible; }
  .sp-map { max-width: 100%; transform: none; }
  .sp-compass { width: 64px; height: 64px; right: -6px; bottom: -18px; }
  .sp-howto { position: fixed; inset: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .sp, .sp-paint, .sp-key svg, .sp-local, .sp-howto { transition: none !important; animation: none !important; }
}
`;
