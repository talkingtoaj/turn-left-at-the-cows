// CSS for shared maps ("paper on the dash", SPEC 9l): the strip on the
// mission-complete screen, the share form and the map wall.
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
.ms-btn:focus-visible, .mw-card:focus-visible, .mw-pin:focus-visible, .ms-input:focus-visible { outline: 3px solid #f1ead6; outline-offset: 3px; }
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
.ms-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; padding: 0; justify-content: center;
  font: 22px/1 Georgia, serif; text-transform: none; }

.ms-empty, .ms-msg { margin: 26px auto; max-width: 520px; text-align: center; font: 17px/1.4 Georgia, serif; font-style: italic; color: #d9d4c5; }
.ms-more { display: flex; justify-content: center; margin-top: 16px; }

.ms-sheet h3 { display: flex; align-items: flex-end; min-height: 30px; margin: 0 0 8px; font: 500 14px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #b9b6ac; }
.ms-sheet h3 b { font: 26px/1 Caveat, cursive; letter-spacing: 0; text-transform: none; color: #f1ead6; font-weight: normal; }
.ms-sheet .ms-pad { padding: 8px; background: #f1ead6; border-radius: 2px; box-shadow: 0 10px 22px rgba(0,0,0,0.5); }
.ms-sheet canvas { display: block; width: 100%; height: auto; }
.ms-sheet .ms-none { aspect-ratio: 840 / 576; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center;
  color: #6b6158; font: 24px/1.2 Caveat, cursive; }
.ms-sheet .ms-trip { margin-top: 8px; font: 14px Georgia, serif; color: #b9b6ac; }
.ms-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
.ms-actions .ms-note { font: 14px Georgia, serif; font-style: italic; color: #b9b6ac; }

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


/* The map wall (#82): pick one of two, then the corkboard. */
.ms-panel.mw-panel { width: min(1240px, 100%); }
.mw-sub::before { content: "· "; }
.mw-help { width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: 50%; font: 600 17px Georgia, serif; text-transform: none; }
.mw-again { margin-left: auto; }

.mw-q { outline: none; margin: 0 0 14px; text-align: center; font: 30px/1.1 Caveat, cursive; color: #f1ead6; }
.mw-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.mw-card { display: block; width: 100%; padding: 8px 8px 12px; text-align: left; cursor: pointer; color: #3a3128; font: inherit;
  background: #f1ead6; border: 4px solid transparent; border-radius: 2px; box-shadow: 0 8px 16px rgba(0,0,0,.45);
  transition: border-color .12s, opacity .3s; }
@media (hover: hover) { .mw-card:hover:not(:disabled) { border-color: #e6b450; } }
.mw-card:disabled { cursor: default; }
.mw-card.mw-win { border-color: #e6b450; }
.mw-card.mw-lose { opacity: .55; }
.mw-card canvas { display: block; width: 100%; height: auto; }
.mw-n { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 4px; font: 24px/1.15 Caveat, cursive; color: #3a3128; }
.mw-n b { font: 500 14px Oswald, "Arial Narrow", sans-serif; color: #7c1812; text-align: right; }
.mw-nav { display: flex; flex-wrap: wrap; gap: 8px 14px; justify-content: center; margin-top: 12px; }
.mw-status { text-align: center; color: #f0a59c; }

.mw-cork { position: relative; min-height: 420px; padding: 30px 26px 26px; border-radius: 4px; display: flex; flex-wrap: wrap;
  gap: 26px 26px; align-content: flex-start; align-items: flex-start; justify-content: center;
  background: radial-gradient(circle at 20% 30%, rgba(0,0,0,.06) 0 2px, transparent 3px) 0 0/14px 14px,
    radial-gradient(circle at 70% 60%, rgba(255,255,255,.08) 0 1px, transparent 2px) 0 0/9px 9px, #b48a57;
  box-shadow: inset 0 0 0 10px #6b4a2a, inset 0 0 30px rgba(0,0,0,.35); }
.mw-pin { position: relative; flex: 0 0 auto; padding: 7px 7px 9px; color: #3a3128; font: inherit; text-align: left; cursor: pointer;
  background: #f1ead6; border: 0; box-shadow: 0 6px 12px rgba(0,0,0,.4); transform: rotate(var(--t, 0deg)); transition: transform .12s; }
.mw-pin.mw-big { width: 300px; }
.mw-pin.mw-mid { width: 240px; }
.mw-pin.mw-small { width: 170px; }
@media (hover: hover) { button.mw-pin:hover { transform: rotate(0deg) scale(1.03); z-index: 2; } }
.mw-pin::before { content: ""; position: absolute; top: -6px; left: 50%; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff8a7a, #b3261e 60%, #6d1410); box-shadow: 0 2px 3px rgba(0,0,0,.5); }
.mw-pin canvas { display: block; width: 100%; height: auto; }
.mw-pin.mw-small .mw-n { font-size: 20px; }
.mw-pin.mw-real { cursor: default; background: #e6d6ab; }
.mw-pin.mw-real .mw-n { color: #7c1812; }
.mw-pin.mw-hl { outline: 4px solid #e6b450; outline-offset: 3px; z-index: 1; }
.mw-pin.mw-pop { animation: mw-pop .7s ease-out; }
@keyframes mw-pop { 0% { transform: rotate(0deg) scale(1.2); } 100% { transform: rotate(var(--t, 0deg)) scale(1); } }
.mw-sticky { position: absolute; right: -10px; top: 14px; padding: 2px 8px; transform: rotate(8deg); background: #f4e27a; color: #3a3128;
  font: 20px/1.2 Caveat, cursive; box-shadow: 0 2px 4px rgba(0,0,0,.3); pointer-events: none; }

.mw-light { position: absolute; inset: 0; z-index: 2; display: flex; padding: 20px; overflow: auto; background: rgba(8,8,10,.94); }
.mw-box { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start;
  width: min(1180px, 100%); margin: auto; padding: 46px 18px 18px; }
.mw-box .ms-sheet h3.mw-who { font: 26px/1 Caveat, cursive; letter-spacing: 0; text-transform: none; color: #d9d4c5; }
.mw-box .ms-close { top: 4px; right: 4px; }
.mw-box .ms-pad.mw-realpad { background: #e6d6ab; }

.mw-tut { position: absolute; inset: 0; z-index: 3; display: flex; padding: 16px; overflow: auto;
  background: rgba(10,10,10,.7); }
.mw-note { position: relative; width: min(540px, 100%); margin: auto; padding: 30px 32px 24px; color: #3a3128; background: #f1ead6;
  transform: rotate(-1.2deg); box-shadow: 0 18px 40px rgba(0,0,0,.6); animation: mw-drop .45s cubic-bezier(.2,1.4,.4,1); }
.mw-note::before { content: ""; position: absolute; top: -9px; left: 50%; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff8a7a, #b3261e 60%, #6d1410); box-shadow: 0 3px 4px rgba(0,0,0,.5); }
@keyframes mw-drop { 0% { transform: translateY(-60px) rotate(4deg); opacity: 0; } 100% { transform: rotate(-1.2deg); opacity: 1; } }
.mw-note h3 { margin: 0 0 12px; font: 600 26px Oswald, "Arial Narrow", sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #7c1812; }
.mw-note p { margin: 0 0 8px; font: 24px/1.2 Caveat, cursive; }
.mw-note .ms-btn { margin-top: 14px; }
.mw-note .ms-btn:focus-visible { outline-color: #b3261e; }
.mw-demo { position: relative; height: 150px; margin: 6px 0 16px; padding-bottom: 14px; overflow: hidden; display: flex; gap: 22px;
  justify-content: center; align-items: flex-end; background: #b48a57; border-radius: 3px; box-shadow: inset 0 0 0 5px #6b4a2a; }
.mw-mini { width: 104px; padding: 4px; background: #f1ead6; box-shadow: 0 3px 6px rgba(0,0,0,.4); }
.mw-mini canvas { display: block; width: 100%; height: auto; }
.mw-mini-b { animation: mw-climb 3.6s ease-in-out infinite; }
.mw-mini-a { animation: mw-fade 3.6s ease-in-out infinite; }
.mw-plus { position: absolute; left: 50%; bottom: 90px; margin-left: 40px; opacity: 0; color: #f4e27a; text-shadow: 0 1px 2px #000;
  font: 600 18px Oswald, "Arial Narrow", sans-serif; animation: mw-plus 3.6s ease-out infinite; }
.mw-hand { position: absolute; left: 50%; bottom: 0; font-size: 30px; animation: mw-hand 3.6s ease-in-out infinite; }
@keyframes mw-hand { 0% { transform: translate(-150px, 30px); } 25% { transform: translate(55px, -40px); } 32% { transform: translate(55px, -34px); } 45%, 100% { transform: translate(160px, 40px); } }
@keyframes mw-climb { 0%, 28% { transform: none; outline: 0 solid #e6b450; } 32% { outline: 4px solid #e6b450; } 45%, 80% { transform: translateY(-46px) rotate(-3deg); outline: 4px solid #e6b450; } 100% { transform: none; outline: 0 solid #e6b450; } }
@keyframes mw-fade { 0%, 30% { opacity: 1; } 45%, 80% { opacity: .45; } 100% { opacity: 1; } }
@keyframes mw-plus { 0%, 30% { opacity: 0; transform: none; } 36% { opacity: 1; } 60% { opacity: 0; transform: translateY(-40px); } 100% { opacity: 0; } }

/* No motion: the note shows the end of the story (the picked map up, the other faded). */
@media (prefers-reduced-motion: reduce) {
  .mw-note, .mw-pin.mw-pop, .mw-mini-a, .mw-mini-b, .mw-plus, .mw-hand { animation: none; }
  .mw-mini-b { transform: translateY(-46px) rotate(-3deg); outline: 4px solid #e6b450; }
  .mw-mini-a { opacity: .45; }
  .mw-plus { opacity: 1; transform: translateY(-30px); }
  .mw-hand { transform: translate(55px, -10px); }
  .mw-pin, .mw-card { transition: none; }
}

@media (max-width: 720px) {
  .ms-form, .mw-box { grid-template-columns: 1fr; }
  .ms-panel { padding: 16px 16px 18px; }
  .mw-pair { grid-template-columns: 1fr; gap: 14px; }
  .mw-q { font-size: 25px; }
  .mw-again { margin-left: 0; }
  .mw-sub::before { content: none; }
  .mw-light { padding: 10px; }
  .mw-box { padding: 46px 4px 8px; }
  .mw-cork { padding: 24px 12px 16px; gap: 20px 12px; }
  .mw-pin.mw-big, .mw-pin.mw-mid { width: 100%; max-width: 300px; }
  .mw-pin.mw-small { width: calc(50% - 6px); }
  .mw-note { padding: 24px 18px 18px; }
  .mw-note p { font-size: 21px; }
  .mw-demo .mw-hand { display: none; }
}
`;
