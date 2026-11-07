// The context tip on screen (round 12): a small paper tag pinned at the top
// left, written in pencil (Caveat), in the "paper on the dash" look. Which
// tip and when is src/game/tips.js; this only draws it.
//   const view = createTipsView(ui); view.show(tip | null) every frame.

const CSS = `
.tip-tag { position: absolute; left: 18px; top: 22px; max-width: min(360px, calc(100% - 36px));
  padding: 8px 14px 9px 16px; background: #f1ead6; color: #3a3128; border-radius: 3px;
  font: 22px/1.15 Caveat, "Segoe Print", "Comic Sans MS", cursive; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  transform: rotate(-1.2deg) translateY(-8px); opacity: 0; transition: opacity 0.35s, transform 0.35s; pointer-events: none; z-index: 5; }
.tip-tag.tip-on { opacity: 1; transform: rotate(-1.2deg); }
.tip-tag::before { content: ''; position: absolute; left: 50%; top: -7px; width: 46px; height: 14px; margin-left: -23px;
  background: rgba(217,180,90,0.75); transform: rotate(2deg); }
.tip-tag::after { content: 'tip'; position: absolute; right: 8px; top: -15px; font: 11px Oswald, "Arial Narrow", sans-serif;
  letter-spacing: 0.12em; text-transform: uppercase; color: #e6b450; }
@media (prefers-reduced-motion: reduce) { .tip-tag { transition: none; } }
`;

export function createTipsView(root) {
  const style = document.createElement('style');
  style.dataset.owner = 'tips';
  style.textContent = CSS;
  document.head.appendChild(style);
  const tag = document.createElement('div');
  tag.className = 'tip-tag';
  tag.setAttribute('role', 'status');
  tag.setAttribute('aria-live', 'polite');
  const hud = root.querySelector('.hud-root') || root;
  hud.appendChild(tag);
  let shown = null;
  return {
    show(tip) {
      const id = tip ? tip.id : null;
      if (id === shown) return;
      shown = id;
      if (tip) tag.textContent = tip.text;
      tag.classList.toggle('tip-on', !!tip);
    },
    get current() {
      return shown;
    },
  };
}
