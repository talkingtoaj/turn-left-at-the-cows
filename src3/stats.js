// Dev stats overlay, shown when the URL has ?stats. FPS, frame time, CPU time
// per frame, draw calls and triangles (main and shadow pass), render scale.

export function createStats(renderer, enabled) {
  if (!enabled) return { begin() {}, end() {}, enabled: false };

  // Count what the shadow pass draws by wrapping it. info.render is reset at
  // the start of each render() call and the shadow pass runs inside it.
  const shadow = { calls: 0, tris: 0, ran: false };
  const sm = renderer.shadowMap;
  const orig = sm.render.bind(sm);
  sm.render = (...args) => {
    const ran = sm.enabled && (sm.autoUpdate || sm.needsUpdate);
    const c0 = renderer.info.render.calls;
    const t0 = renderer.info.render.triangles;
    orig(...args);
    shadow.ran = ran;
    if (ran) {
      shadow.calls = renderer.info.render.calls - c0;
      shadow.tris = renderer.info.render.triangles - t0;
    }
  };

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;top:6px;z-index:9999;pointer-events:none;'
    + 'font:12px/1.35 monospace;color:#e8ffe8;background:rgba(0,0,0,0.6);padding:5px 8px;border-radius:4px;white-space:pre';
  document.body.appendChild(el);

  let frames = 0;
  let acc = 0;
  let cpuAcc = 0;
  let worst = 0;
  let shadowRuns = 0;
  let prev = 0;
  let t0 = 0;
  let last = { calls: 0, tris: 0 };

  return {
    enabled: true,
    shadow,
    begin(now) {
      t0 = performance.now();
      if (prev) {
        const dt = now - prev;
        acc += dt;
        if (dt > worst) worst = dt;
      }
      prev = now;
    },
    // extra: optional text lines to show (render scale etc).
    end(extra) {
      const i = renderer.info.render;
      last = { calls: i.calls, tris: i.triangles };
      cpuAcc += performance.now() - t0;
      frames++;
      if (shadow.ran) shadowRuns++;
      if (acc < 500) return;
      const fps = (frames * 1000) / acc;
      el.textContent = [
        `FPS ${fps.toFixed(0)}  frame ${(acc / frames).toFixed(1)} ms (worst ${worst.toFixed(0)})`,
        `cpu ${(cpuAcc / frames).toFixed(1)} ms`,
        `calls ${last.calls}  tris ${(last.tris / 1000).toFixed(0)}k`,
        `shadow ${shadow.calls} calls  ${(shadow.tris / 1000).toFixed(0)}k tris  ${shadowRuns}/${frames} frames`,
        extra || '',
      ].join('\n');
      frames = 0;
      acc = 0;
      cpuAcc = 0;
      worst = 0;
      shadowRuns = 0;
    },
  };
}
