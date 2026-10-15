// Shared CSS for the DOM screens both versions use: splash, how-to-play
// panel and mission card. Paper map look: cream paper, dark ink, red marks.

const CSS = `
.ui-shade { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
  padding: 16px; box-sizing: border-box; overflow-y: auto; font-family: Georgia, "Times New Roman", serif; color: #2c2620; }
.ui-shade * { box-sizing: border-box; }
.ui-shade.ui-splash-bg { background-color: #2f3a2c;
  background-image:
    repeating-radial-gradient(circle at 18% 30%, transparent 0 34px, rgba(236,228,207,0.07) 34px 36px),
    repeating-radial-gradient(circle at 82% 78%, transparent 0 42px, rgba(236,228,207,0.06) 42px 44px); }
.ui-shade.ui-dim { background: rgba(10,11,12,0.62); }

.ui-paper { position: relative; margin: auto; width: min(760px, 100%); padding: 26px 30px 22px;
  background-color: #efe6cf;
  background-image:
    linear-gradient(rgba(120,100,70,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120,100,70,0.08) 1px, transparent 1px),
    radial-gradient(ellipse at 30% 20%, rgba(255,250,235,0.7), transparent 60%),
    radial-gradient(ellipse at 80% 90%, rgba(150,120,80,0.18), transparent 55%);
  background-size: 32px 32px, 32px 32px, 100% 100%, 100% 100%;
  border: 1px solid #b9a984; border-radius: 4px;
  box-shadow: 0 0 0 6px rgba(239,230,207,0.12), 6px 8px 0 rgba(0,0,0,0.35); }
.ui-paper::before { content: ''; position: absolute; inset: 9px; border: 1.5px solid rgba(90,70,45,0.45);
  border-radius: 2px; pointer-events: none; }

.ui-title { margin: 0; text-align: center; font-size: clamp(38px, 8vw, 60px); letter-spacing: 0.08em;
  font-weight: bold; color: #3b2f22; line-height: 1.05; }
.ui-title small { display: block; font-size: 13px; letter-spacing: 0.3em; color: #9a3a2a; font-weight: normal;
  margin-top: 6px; text-transform: uppercase; }
.ui-pitch { margin: 12px auto 18px; max-width: 620px; text-wrap: balance; text-align: center; font-size: 18px; font-style: italic;
  color: #4a3c2c; line-height: 1.4; }
.ui-cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 22px; align-items: start; }
@media (max-width: 640px) { .ui-cols { grid-template-columns: 1fr; gap: 14px; } .ui-paper { padding: 22px 18px 18px; } }
.ui-h { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #9a3a2a;
  border-bottom: 1px dashed rgba(90,70,45,0.5); padding-bottom: 4px; }
.ui-steps { margin: 0; padding: 0; list-style: none; counter-reset: step; }
.ui-steps li { position: relative; padding-left: 30px; margin-bottom: 9px; font-size: 15.5px; line-height: 1.4; }
.ui-steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 1px;
  width: 21px; height: 21px; border: 1.5px solid #9a3a2a; border-radius: 50%; color: #9a3a2a;
  font: bold 12px/18px "Courier New", Courier, monospace; text-align: center; }
.ui-steps b { color: #3b2f22; }
.ui-keys { width: 100%; border-collapse: collapse; font-size: 14.5px; }
.ui-keys td { padding: 3px 4px; border-bottom: 1px dotted rgba(90,70,45,0.35); vertical-align: middle; }
.ui-keys td:first-child { white-space: nowrap; width: 1%; padding-right: 12px; }
.ui-keys tr.ui-off td { opacity: 0.5; }
.ui-kbd { display: inline-block; min-width: 22px; padding: 1px 6px; margin: 1px 2px 1px 0; border: 1px solid #6b5a42;
  border-bottom-width: 2px; border-radius: 4px; background: #f8f2e2; text-align: center;
  font: bold 12px/18px "Courier New", Courier, monospace; color: #2c2620; }
.ui-foot { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 18px;
  position: sticky; bottom: -16px; z-index: 1; padding: 10px 0 12px; background: #efe6cf; border-top: 1px dashed rgba(90,70,45,0.4); }
@media (max-height: 640px) {
  .ui-paper { padding-top: 16px; }
  .ui-title { font-size: 36px; }
  .ui-pitch { margin: 6px auto 10px; font-size: 16px; }
  .ui-steps li { margin-bottom: 5px; font-size: 14.5px; }
  .ui-keys td { padding: 1px 4px; font-size: 13.5px; }
  .ui-btn { padding: 8px 26px; font-size: 17px; }
}
.ui-btn { font: bold 19px Georgia, serif; letter-spacing: 0.06em; padding: 11px 34px; color: #f8f2e2;
  background: #9a3a2a; border: 2px solid #6e2418; border-radius: 4px; cursor: pointer; box-shadow: 3px 3px 0 rgba(0,0,0,0.3); }
.ui-btn:hover, .ui-btn:focus-visible { background: #b0452f; outline: 2px dashed #3b2f22; outline-offset: 3px; }
.ui-btn:disabled { opacity: 0.7; cursor: wait; }
.ui-note { font-size: 13px; color: #6b5a42; }
.ui-link { font-size: 13px; color: #6b5a42; }
.ui-link a { color: #3b2f22; }

/* Mission card: a pinned job ticket, not a dialogue box. */
.ui-card { position: relative; margin: auto; width: min(560px, 100%); padding: 22px 26px 18px;
  background: #f6f0de; border: 1px solid #b9a984; border-radius: 3px; transform: rotate(-0.6deg);
  box-shadow: 6px 8px 0 rgba(0,0,0,0.35);
  background-image: repeating-linear-gradient(transparent 0 27px, rgba(80,110,160,0.18) 27px 28px);
  background-position: 0 70px; }
.ui-card::before { content: ''; position: absolute; left: 50%; top: -9px; width: 18px; height: 18px; margin-left: -9px;
  border-radius: 50%; background: radial-gradient(circle at 35% 35%, #e0574a, #8e2318); box-shadow: 1px 2px 2px rgba(0,0,0,0.4); }
.ui-card-kicker { font: bold 12px "Courier New", Courier, monospace; letter-spacing: 0.25em; color: #9a3a2a; text-transform: uppercase; }
.ui-card-title { margin: 4px 0 2px; font-size: clamp(22px, 5vw, 28px); line-height: 1.15; color: #2c2620; }
.ui-card-from { font: 14px "Courier New", Courier, monospace; color: #5a4a36; margin-bottom: 12px; }
.ui-card-brief p { margin: 0 0 10px; font-size: 16.5px; line-height: 1.45; font-style: italic; color: #2f2820; }
.ui-card-goal { display: inline-block; margin: 6px 0 12px; padding: 6px 14px; border: 2px solid #9a3a2a; border-radius: 3px;
  color: #9a3a2a; font: bold 17px "Courier New", Courier, monospace; letter-spacing: 0.04em; transform: rotate(-1.5deg); }
.ui-card-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
  border-top: 1px dashed rgba(90,70,45,0.5); padding-top: 10px; font: 13px "Courier New", Courier, monospace; color: #5a4a36; }
.ui-card-foot .ui-btn { font-size: 15px; padding: 6px 18px; }

.ui-paused { position: absolute; top: 14px; right: 18px; font: bold 12px "Courier New", Courier, monospace;
  letter-spacing: 0.2em; color: #9a3a2a; }
.ui-close { position: absolute; top: 14px; left: 18px; font: 13px "Courier New", Courier, monospace; color: #6b5a42; }
`;

let injected = false;
export function injectUiStyle() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.dataset.owner = 'ui';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// While a modal screen is up, it gets every key first (capture phase on
// window) and stops the key there, so the game never sees it. K (mute) is
// let through. handler(e) returns nothing; the key is swallowed either way.
export function trapKeys(handler) {
  const onKey = (e) => {
    if (e.code === 'KeyK' && !e.ctrlKey && !e.metaKey && !e.altKey) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    e.stopPropagation();
    if (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'Enter') e.preventDefault();
    handler(e);
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
