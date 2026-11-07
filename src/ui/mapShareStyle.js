// CSS for shared maps ("paper on the dash", SPEC 9l): the strip on the
// mission-complete screen, the share form and the other drivers' maps.
// Palette: dash #1c1d1f / #3a3c40, amber #e6b450, paper #f1ead6 / #d8ccb4,
// graphite #4a4a48, ink #3a3128, barn red #b3261e.

export const MAP_SHARE_CSS = `
.ms-strip { margin: 16px auto 0; padding: 12px 14px; max-width: 760px; display: flex; flex-wrap: wrap; gap: 10px 14px;
  align-items: center; justify-content: center; border-top: 1px dashed rgba(241,234,214,0.18); }
.ms-strip p { margin: 0; font: 14px/1.35 Georgia, serif; font-style: italic; color: #b9b6ac; }
.ms-strip .ms-done { color: #d9d4c5; font-style: normal; }
.ms-strip .ms-done b { color: #e6b450; font-weight: normal; font-family: Caveat, cursive; font-size: 21px; }

.ms-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer; border-radius: 5px;
  font: 500 15px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
  background: #2b2c2f; color: #f1ead6; border: 1px solid #55575c; }
.ms-btn:hover { background: #3a3c40; }
.ms-btn:disabled { opacity: 0.55; cursor: default; }
.ms-btn.ms-main { background: #e6b450; color: #1c1d1f; border-color: #e6b450; box-shadow: 0 3px 0 #9c7426; }
.ms-btn.ms-main:hover { background: #f0c463; }
.ms-btn.ms-on { background: #e6b450; color: #1c1d1f; border-color: #e6b450; }
.ms-btn.ms-quiet { background: transparent; border-color: transparent; color: #b9b6ac; text-transform: none; letter-spacing: 0.02em;
  font: 14px Georgia, serif; text-decoration: underline; text-underline-offset: 3px; padding: 6px 8px; }
.ms-btn svg { width: 18px; height: 18px; }
.ms-btn:focus { outline: none; }
.ms-btn:focus-visible, .ms-card:focus-visible, .ms-input:focus-visible { outline: 3px solid #f1ead6; outline-offset: 3px; }
.ms-paper .ms-btn:focus-visible, .ms-paper .ms-input:focus-visible { outline-color: #b3261e; }

.ms-shade { position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(12,12,14,0.78); color: #f1ead6; font-family: Georgia, "Libre Baskerville", serif; }
.ms-shade * { box-sizing: border-box; }
.ms-panel { position: relative; width: min(1120px, 100%); max-height: 100%; overflow: auto; padding: 18px 22px 20px;
  background: linear-gradient(#3a3c40, #1c1d1f 26px), #1c1d1f; border-radius: 10px; border-top: 1px solid #55575c;
  box-shadow: 0 18px 40px rgba(0,0,0,0.6); }
.ms-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-bottom: 14px; padding-right: 44px; }
.ms-head h2 { margin: 0; font: 600 22px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: #e6b450; }
.ms-head .ms-sub { font: 22px/1 Caveat, cursive; color: #d9d4c5; }
.ms-sorts { display: flex; gap: 6px; margin-left: auto; }
.ms-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; padding: 0; justify-content: center;
  font: 22px/1 Georgia, serif; text-transform: none; }

.ms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; }
.ms-card { display: block; width: 100%; padding: 8px 8px 10px; text-align: left; cursor: pointer; color: #3a3128;
  background: #f1ead6; border: 0; border-radius: 2px; box-shadow: 0 8px 16px rgba(0,0,0,0.45); font: inherit;
  transform: rotate(var(--tilt, 0deg)); transition: transform 0.12s; }
.ms-card:hover { transform: rotate(0deg) translateY(-2px); }
.ms-card canvas { display: block; width: 100%; height: auto; outline: 1px solid rgba(58,49,40,0.12); }
.ms-card .ms-name { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 6px;
  font: 24px/1 Caveat, "Segoe Print", cursive; color: #3a3128; }
.ms-card .ms-votes { font: 500 14px Oswald, "Arial Narrow", sans-serif; color: #7c1812; white-space: nowrap; }
.ms-card .ms-trip { display: block; margin-top: 3px; font: 13px Georgia, serif; color: #6b6158; }
.ms-badge { display: inline-block; margin-left: 6px; padding: 1px 6px; vertical-align: middle; border-radius: 3px;
  font: 500 11px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; background: #3a3128; color: #f1ead6; }
.ms-empty, .ms-msg { margin: 26px auto; max-width: 520px; text-align: center; font: 17px/1.4 Georgia, serif; font-style: italic; color: #d9d4c5; }
.ms-more { display: flex; justify-content: center; margin-top: 16px; }

.ms-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
.ms-sheet h3 { margin: 0 0 8px; font: 500 14px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #b9b6ac; }
.ms-sheet h3 b { font: 26px/1 Caveat, cursive; letter-spacing: 0; text-transform: none; color: #f1ead6; font-weight: normal; }
.ms-sheet .ms-pad { padding: 8px; background: #f1ead6; border-radius: 2px; box-shadow: 0 10px 22px rgba(0,0,0,0.5); }
.ms-sheet canvas { display: block; width: 100%; height: auto; }
.ms-sheet .ms-none { aspect-ratio: 840 / 576; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center;
  color: #6b6158; font: 24px/1.2 Caveat, cursive; }
.ms-sheet .ms-trip { margin-top: 8px; font: 14px Georgia, serif; color: #b9b6ac; }
.ms-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
.ms-actions .ms-note { font: 14px Georgia, serif; font-style: italic; color: #b9b6ac; }
.ms-back { margin-bottom: 12px; }

.ms-form { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 1fr); gap: 22px; align-items: start; }
.ms-paper { padding: 16px 18px; color: #3a3128; background: #f1ead6; border-radius: 2px; box-shadow: 0 10px 22px rgba(0,0,0,0.5);
  background-image: repeating-linear-gradient(transparent 0 29px, rgba(111,159,184,0.3) 29px 30px); background-position: 0 50px; }
.ms-paper h3 { margin: 0 0 8px; font: 600 13px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.18em; text-transform: uppercase; color: #b3261e; }
.ms-paper p { margin: 0 0 12px; font: 15px/1.4 Georgia, serif; }
.ms-paper label { display: block; font: 22px/1.2 Caveat, cursive; }
.ms-input { display: block; width: 100%; margin: 4px 0 4px; padding: 6px 10px; font: 24px/1.1 Caveat, "Segoe Print", cursive; color: #3a3128;
  background: rgba(255,255,255,0.55); border: 0; border-bottom: 2px solid #4a4a48; border-radius: 2px; }
.ms-paper small { display: block; margin-bottom: 12px; font: 13px Georgia, serif; color: #6b6158; }
.ms-captcha { min-height: 70px; margin: 6px 0 12px; }
.ms-status { min-height: 1.4em; margin-top: 10px; font: 15px/1.35 Georgia, serif; }
.ms-status.ms-bad { color: #7c1812; }
.ms-paper .ms-btn:not(.ms-main) { background: transparent; color: #3a3128; border-color: #3a3128; }
.ms-paper .ms-btn:not(.ms-main):hover { background: #d8ccb4; }
.ms-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }

@media (max-width: 720px) {
  .ms-compare, .ms-form { grid-template-columns: 1fr; }
  .ms-sorts { margin-left: 0; }
  .ms-panel { padding: 16px 16px 18px; }
}
`;
