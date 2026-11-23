// Shared maps: share your hand-drawn map after a mission, then the map
// wall: pick the better of two other drivers' maps (a thumbs-up), then see
// every map for that mission pinned to a corkboard beside the real map.
// Talks to the server through src/net/mapsApi.js; when there is no server
// (local dev, offline) the strip says so in one line and the game carries
// on as before.
//
//   mountShareStrip(parent, ctx)   the row on the mission-complete screen
//     ctx: { missionId, missionTitle, region, seed, shareKey,
//            getSketch(), stats: { timeMs, km, tows } }
//   wallAfterMission({ missionId, missionTitle, shareKey }) -> Promise
//     the pick, then the wall, as the player leaves the win screen (once per
//     win screen; resolves when it closes, or at once with no map board)
//   openMapWall({ missionId, missionTitle, pick, onClose }) the wall, with
//     the pick first when pick is true (the start screen's Maps link: false)
//
// Plain DOM. The start screen loads it on demand. Pair picking, pin order and
// the note flag are in ./mapWallPick.js (checked by tools/check-map-wall.mjs).

import { el } from './style.js';
import { MAP_SHARE_CSS } from './mapShareStyle.js';
import { renderSketchCanvas } from '../../src3/map/sketchPaper.js';
import { renderPrintedMapCanvas, trueMapDef } from '../../src3/map/sketchRender.js';
import { regionWorld } from '../world/world.js';
import { MISSIONS } from '../game/missions.js';
import {
  pickPair, wallOrder, pinSize, pinTilt, newestId, uniqueMaps, noteSeen, markNoteSeen, PIN_PX,
} from './mapWallPick.js';
import { timerText } from '../hud/format.js';
import { milesText } from '../units.js';
import {
  available, listMaps, shareMap, vote, report, compactSketch, sketchIsEmpty, loadTurnstile,
} from '../net/mapsApi.js';
import { markShared } from '../game/myMaps.js';

const shared = new Map(); // shareKey -> the map as shared (this page load)

const THUMB = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 21h3V9H2v12zm19.6-9.4c0-1.2-1-2.1-2.1-2.1h-5.3l.8-3.9v-.3c0-.5-.2-.9-.5-1.2L13.3 3 7.6 8.7c-.4.4-.6.9-.6 1.4V19c0 1.1.9 2 2 2h8.6c.8 0 1.5-.5 1.8-1.2l2.9-6.6c.1-.3.2-.6.2-.8v-.8z"/></svg>`;

let styleOn = false;
function injectStyle() {
  if (styleOn) return;
  styleOn = true;
  const s = document.createElement('style');
  s.dataset.owner = 'map-share';
  s.textContent = MAP_SHARE_CSS;
  document.head.appendChild(s);
}

function button(parent, text, cls = '') {
  const b = el('button', `ms-btn ${cls}`.trim(), parent, text);
  b.type = 'button';
  return b;
}

const fontsReady = () => Promise.race([
  document.fonts?.load?.('24px Caveat').catch(() => {}) ?? Promise.resolve(),
  new Promise((r) => setTimeout(r, 1500)),
]);

function tripText(m) {
  const parts = [timerText(m.timeMs || 0), milesText((m.km || 0) * 1000)];
  if (m.tows) parts.push(m.tows === 1 ? 'towed once' : m.tows === 2 ? 'towed twice' : `towed ${m.tows} times`);
  return parts.join(' · ');
}

// Keys belong to the open sheet: the game (and the complete screen's Enter)
// never sees them. Escape is passed to onEscape.
function holdKeys(root, onEscape) {
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
    } else if (e.key === 'Tab') {
      // Keep Tab inside the sheet.
      const box = typeof root === 'function' ? root() : root;
      const f = [...box.querySelectorAll('button, input, [tabindex="0"]')].filter((n) => !n.disabled && n.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      } else if (i < 0) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

function sheet(label) {
  injectStyle();
  const back = document.activeElement;
  const shade = el('div', 'ms-shade', document.body);
  shade.setAttribute('role', 'dialog');
  shade.setAttribute('aria-modal', 'true');
  shade.setAttribute('aria-label', label);
  const panel = el('div', 'ms-panel', shade);
  const close = button(panel, '×', 'ms-close');
  close.setAttribute('aria-label', 'Close');
  let onEsc = null;
  let onClosed = null;
  let release = null;
  let trap = () => shade;
  const api = {
    shade,
    panel,
    closed: false,
    onEscape(fn) {
      onEsc = fn;
    },
    onClosed(fn) {
      onClosed = fn;
    },
    // Tab stays inside what this returns (an overlay on the sheet, say).
    trapIn(fn) {
      trap = fn;
    },
    close() {
      if (api.closed) return;
      api.closed = true;
      release();
      shade.remove();
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
      onClosed?.();
    },
  };
  release = holdKeys(() => trap(), () => (onEsc ? onEsc() : api.close()));
  close.addEventListener('click', () => api.close());
  shade.addEventListener('pointerdown', (e) => {
    if (e.target === shade) api.close();
  });
  return api;
}

// ------------------------------------------------------------ win screen strip

export function mountShareStrip(parent, ctx) {
  injectStyle();
  const strip = el('div', 'ms-strip', parent);
  // Enter on these buttons must not also continue to the next mission.
  strip.addEventListener('keydown', (e) => {
    if (e.target !== strip) e.stopPropagation();
  });
  const wait = el('p', null, strip, 'Looking for the map board…');
  available().then((config) => {
    if (!strip.isConnected) return;
    wait.remove();
    if (!config) {
      el('p', 'ms-off', strip, 'Sharing maps isn’t available right now. Your map is still saved in this game.');
      return;
    }
    const done = shared.get(ctx.shareKey);
    if (done) {
      const p = el('p', 'ms-done', strip, 'Shared as ');
      el('b', null, p, done.nickname);
    } else {
      const b = button(strip, 'Share my map', 'ms-main');
      const onShared = (m) => {
        const p = el('p', 'ms-done', null, 'Shared as ');
        el('b', null, p, m.nickname);
        b.replaceWith(p);
      };
      b.addEventListener('click', () => openShareForm({ ...ctx, onShared }, config));
    }
    const see = button(strip, 'See other drivers’ maps');
    see.addEventListener('click', () => openMapWall({
      missionId: ctx.missionId, missionTitle: ctx.missionTitle, pick: true, shareKey: ctx.shareKey,
    }));
  });
  return strip;
}

// ------------------------------------------------------------ share form

export function openShareForm(ctx, config) {
  const s = sheet('Share your map');
  const head = el('div', 'ms-head', s.panel);
  el('h2', null, head, 'Share your map');
  el('span', 'ms-sub', head, ctx.missionTitle);
  const form = el('div', 'ms-form', s.panel);

  const left = el('div', 'ms-sheet', form);
  el('h3', null, left, 'What other drivers will see');
  const pad = el('div', 'ms-pad', left);
  const sketch = ctx.getSketch();
  fontsReady().then(() => pad.appendChild(renderSketchCanvas(sketch, 520, { hint: false })));
  el('div', 'ms-trip', left, tripText({ timeMs: ctx.stats.timeMs, km: ctx.stats.km, tows: ctx.stats.tows }));

  const paper = el('div', 'ms-paper', form);
  el('h3', null, paper, 'Pin it to the board');
  el('p', null, paper, 'Other drivers on this job can see your map, put it beside theirs and give it a thumbs-up. No account, no email.');
  const lab = el('label', null, paper, 'Your name on it (optional)');
  lab.htmlFor = 'ms-nick';
  const nick = el('input', 'ms-input', paper);
  nick.id = 'ms-nick';
  nick.type = 'text';
  nick.maxLength = config.maxNickname || 24;
  nick.placeholder = 'A driver';
  nick.autocomplete = 'nickname';
  nick.spellcheck = false;
  el('small', null, paper, 'Leave it blank to stay "A driver". Keep it friendly.');
  const captcha = el('div', 'ms-captcha', paper);
  const row = el('div', 'ms-row', paper);
  const go = button(row, 'Share', 'ms-main');
  const cancel = button(row, 'Cancel');
  const status = el('div', 'ms-status', paper);
  status.setAttribute('role', 'status');
  cancel.addEventListener('click', () => s.close());

  const empty = sketchIsEmpty(sketch);
  if (empty) {
    go.disabled = true;
    status.textContent = 'Your map is blank. Press M on the complete screen to draw it first.';
  }

  let token = null;
  let widget = null;
  go.disabled = true;
  loadTurnstile().then((ts) => {
    if (s.closed) return;
    widget = ts.render(captcha, {
      sitekey: config.turnstileSiteKey,
      theme: 'light',
      callback: (t) => {
        token = t;
        if (!empty) go.disabled = false;
      },
      'expired-callback': () => {
        token = null;
        go.disabled = true;
      },
      'error-callback': () => {
        token = null;
        go.disabled = true;
        status.textContent = 'The robot check couldn’t load. Try again in a moment.';
        status.className = 'ms-status ms-bad';
      },
    });
  }).catch(() => {
    status.textContent = 'The robot check couldn’t load (a blocker or no connection), so sharing is off for now.';
    status.className = 'ms-status ms-bad';
  });

  go.addEventListener('click', async () => {
    if (!token || go.disabled) return;
    go.disabled = true;
    cancel.disabled = true;
    status.className = 'ms-status';
    status.textContent = 'Pinning it up…';
    try {
      const m = await shareMap({
        mission: ctx.missionId,
        region: ctx.region,
        seed: Number.isSafeInteger(ctx.seed) ? ctx.seed : null,
        timeMs: Math.round(ctx.stats.timeMs || 0),
        km: Math.round((ctx.stats.km || 0) * 100) / 100,
        tows: ctx.stats.tows || 0,
        nickname: nick.value.trim() || null,
        sketch: compactSketch(sketch, Math.min(190000, (config.maxBytes || 200000) - 8000)),
        turnstileToken: token,
      });
      shared.set(ctx.shareKey, m);
      markShared(ctx.missionId, m.id);
      ctx.onShared?.(m);
      paper.textContent = '';
      el('h3', null, paper, 'Shared');
      const p = el('p', null, paper, 'Your map is on the board as ');
      el('b', null, p, m.nickname);
      p.append('. Thanks!');
      const r2 = el('div', 'ms-row', paper);
      const see = button(r2, 'See other drivers’ maps', 'ms-main');
      const done = button(r2, 'Done');
      done.addEventListener('click', () => s.close());
      see.addEventListener('click', () => {
        s.close();
        openMapWall({ missionId: ctx.missionId, missionTitle: ctx.missionTitle, pick: true, shareKey: ctx.shareKey });
      });
      see.focus();
    } catch (e) {
      status.className = 'ms-status ms-bad';
      status.textContent = e.message;
      token = null;
      try {
        if (widget != null) window.turnstile?.reset(widget);
      } catch (_) {
        // fine
      }
      cancel.disabled = false;
      if (e.code === 'nickname') nick.focus();
    }
  });
  nick.focus();
  return s;
}

// ------------------------------------------------------------ the map wall

const WALL_PAGE = 24; // the server's most per page
const WALL_FIRST = 96; // pins loaded at first; "More maps" loads the rest
const REVEAL_MS = 1100; // names and trips show this long after a pick
const judged = new Set(); // win screens (shareKey) whose pick has been offered

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The mission, its region and the real map's definition.
function missionInfo(missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId);
  if (!mission) return null;
  const world = regionWorld(mission.region);
  return { mission, world, def: trueMapDef(mission, world), place: mission.goal.name };
}

// The real map is slow to draw: draw it once per width and copy it.
const realCache = new Map();
function realCanvas(info, cssWidth) {
  const key = `${info.mission.id}:${cssWidth}:${window.devicePixelRatio || 1}`;
  let c = realCache.get(key);
  if (!c) {
    c = renderPrintedMapCanvas(info.def, cssWidth, info.world);
    realCache.set(key, c);
  }
  const out = document.createElement('canvas');
  out.width = c.width;
  out.height = c.height;
  out.getContext('2d').drawImage(c, 0, 0);
  return out;
}

// After a mission, as the player leaves the win screen: the pick, then the
// wall. Not when the player already went in from this win screen's strip.
export async function wallAfterMission({ missionId, missionTitle, shareKey }) {
  if (shareKey && judged.has(shareKey)) return;
  const config = await available();
  if (!config) return;
  await new Promise((resolve) => openMapWall({ missionId, missionTitle, pick: true, shareKey, onClose: resolve }));
}

// Thumbs-up and Report for one map (the big view on the wall).
function mapActions(acts, missionId, m, onChange) {
  const thumb = button(acts, '');
  const note = el('span', 'ms-note', acts);
  note.setAttribute('role', 'status');
  const paintThumb = () => {
    thumb.innerHTML = `${THUMB}<span>${m.voted ? 'Thumbs-up given' : 'Thumbs-up'} (${m.votes})</span>`;
    thumb.classList.toggle('ms-on', !!m.voted);
    thumb.classList.toggle('ms-main', !m.voted && !m.mine);
    thumb.setAttribute('aria-pressed', String(!!m.voted));
  };
  paintThumb();
  if (m.mine) {
    thumb.disabled = true;
    note.textContent = 'This one is yours.';
    return thumb;
  }
  thumb.addEventListener('click', async () => {
    thumb.disabled = true;
    try {
      const r = await vote(missionId, m.id, !m.voted);
      m.voted = r.voted;
      m.votes = r.votes;
      paintThumb();
      note.textContent = '';
      onChange();
    } catch (e) {
      note.textContent = e.message;
    }
    thumb.disabled = false;
  });

  const rep = button(acts, m.reported ? 'Reported' : 'Report', 'ms-quiet');
  rep.disabled = !!m.reported;
  rep.addEventListener('click', () => {
    rep.hidden = true;
    note.textContent = 'Report this map as rude or not a map? ';
    const yes = button(note, 'Report it', 'ms-quiet');
    const no = button(note, 'Cancel', 'ms-quiet');
    no.addEventListener('click', () => {
      note.textContent = '';
      rep.hidden = false;
      rep.focus();
    });
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      no.disabled = true;
      try {
        const r = await report(missionId, m.id);
        m.reported = true;
        if (r.hidden) m.hidden = true;
        note.textContent = 'Thanks. We’ll take a look.';
        rep.textContent = 'Reported';
        rep.disabled = true;
        rep.hidden = false;
        onChange();
      } catch (e) {
        note.textContent = e.message;
      }
    });
    yes.focus();
  });
  return thumb;
}

export function openMapWall({ missionId, missionTitle, pick = false, shareKey = null, onClose = null }) {
  if (shareKey) judged.add(shareKey);
  const info = missionInfo(missionId);
  const place = info ? info.place : missionTitle;
  const s = sheet('The map wall'); // T82-wall-title
  s.panel.classList.add('mw-panel');
  s.onClosed(onClose);
  const head = el('div', 'ms-head', s.panel);
  const body = el('div', 'mw-body', s.panel);
  let maps = [];
  let total = 0;
  let byVotes = 0; // maps loaded from the votes order (for More maps)
  let lastPair = null;
  let overlay = null; // the note or a map seen big: { root, close }
  let highlight = null;
  s.onEscape(() => (overlay ? overlay.close() : s.close()));
  s.trapIn(() => (overlay ? overlay.root : s.shade));

  function drawHead(title, onWall) {
    head.textContent = '';
    el('h2', null, head, title);
    el('span', 'ms-sub', head, missionTitle);
    if (onWall) el('span', 'ms-sub mw-sub', head, 'pinned up by drivers who got there'); // T82-wall-sub
    const help = button(head, '?', 'mw-help');
    help.setAttribute('aria-label', 'The map wall'); // T82-note-title
    help.addEventListener('click', () => showNote(onWall));
    if (onWall && pickPair(maps)) {
      const again = button(head, 'Judge another pair', 'ms-main mw-again'); // T82-wall-again
      again.addEventListener('click', () => showPick());
    }
  }

  function message(text) {
    body.textContent = '';
    el('p', 'ms-msg', body, text);
  }

  async function loadVotes(upTo) {
    while (byVotes < upTo) {
      const r = await listMaps(missionId, { sort: 'votes', offset: byVotes, limit: WALL_PAGE });
      maps = uniqueMaps(maps.concat(r.maps));
      byVotes += r.maps.length;
      total = r.total;
      if (!r.maps.length || byVotes >= total) break;
    }
  }

  async function load() {
    message('Fetching maps…');
    const config = await available();
    if (s.closed) return false;
    if (!config) {
      message('Sharing maps isn’t available right now. Try again later.');
      return false;
    }
    try {
      // The newest too, so new maps get judged before they have votes.
      const [, fresh] = await Promise.all([
        loadVotes(WALL_FIRST),
        listMaps(missionId, { sort: 'new', offset: 0, limit: WALL_PAGE }),
      ]);
      maps = uniqueMaps(maps.concat(fresh.maps));
    } catch (e) {
      message(e.message);
      return false;
    }
    await fontsReady();
    return !s.closed;
  }

  // ---- pick one of two
  function showPick() {
    const pair = pickPair(maps, { last: lastPair });
    if (!pair) {
      showWall();
      return;
    }
    lastPair = pair;
    drawHead('Which map gets you there?', false); // T82-pick-title
    body.textContent = '';
    const wrap = el('div', 'mw-pick', body);
    const q = el('p', 'mw-q', wrap, `You’re lost on the way to ${place}. Which map would you rather have?`); // T82-pick-q
    q.tabIndex = -1; // focus lands here, not on a map (that would look like a hint)
    const row = el('div', 'mw-pair', wrap);
    const cards = pair.map((m) => {
      const c = el('button', 'mw-card', row);
      c.type = 'button';
      c.appendChild(renderSketchCanvas(m.sketch, 560, { hint: false }));
      const n = el('div', 'mw-n', c);
      el('span', null, n, '?');
      return { c, m, n };
    });
    const nav = el('div', 'mw-nav', wrap);
    const skip = button(nav, 'Skip this pair', 'ms-quiet'); // T82-pick-skip
    const toWall = button(nav, 'Just show me the wall', 'ms-quiet'); // T82-pick-wall
    const status = el('p', 'ms-status mw-status', wrap);
    status.setAttribute('role', 'status');
    skip.addEventListener('click', () => showPick());
    toWall.addEventListener('click', () => showWall());
    const all = [...cards.map((k) => k.c), skip, toWall];
    for (const { c, m } of cards) {
      c.addEventListener('click', async () => {
        all.forEach((b) => (b.disabled = true));
        status.textContent = '';
        try {
          const r = await vote(missionId, m.id, true); // a pick is a thumbs-up
          m.voted = r.voted;
          m.votes = r.votes;
        } catch (e) {
          status.textContent = e.message;
          all.forEach((b) => (b.disabled = false));
          return;
        }
        if (s.closed) return;
        for (const k of cards) {
          k.c.classList.add(k.m === m ? 'mw-win' : 'mw-lose');
          k.n.textContent = '';
          el('span', null, k.n, k.m.nickname);
          el('b', null, k.n, `▲ ${k.m.votes} · ${tripText(k.m)}`);
        }
        setTimeout(() => {
          if (!s.closed) showWall({ pick: m.id });
        }, REVEAL_MS);
      });
    }
    q.focus({ preventScroll: true });
    s.panel.scrollTop = 0;
    if (!noteSeen()) showNote(false);
  }

  // ---- the wall
  function showWall({ pick: picked = null, keepScroll = false } = {}) {
    if (picked) highlight = picked;
    const scroll = s.panel.scrollTop;
    drawHead('The map wall', true); // T82-wall-title
    body.textContent = '';
    const cork = el('div', 'mw-cork', body);
    if (info) {
      const real = el('div', 'mw-pin mw-real mw-big', cork);
      real.style.setProperty('--t', '-1.5deg');
      real.appendChild(realCanvas(info, PIN_PX.real - 14));
      const rn = el('div', 'mw-n', real);
      el('span', null, rn, 'The real map'); // T82-wall-real
    }
    const order = wallOrder(maps);
    const newest = order.length > 1 ? newestId(order) : null;
    let lit = null;
    order.forEach((m, k) => {
      const size = pinSize(k);
      const p = el('button', `mw-pin mw-${size}`, cork);
      p.type = 'button';
      p.style.setProperty('--t', `${pinTilt(k)}deg`);
      p.appendChild(renderSketchCanvas(m.sketch, PIN_PX[size] - 14, { hint: false }));
      const n = el('div', 'mw-n', p);
      el('span', null, n, m.mine ? 'Yours' : m.nickname); // T82-wall-yours
      el('b', null, n, `▲ ${m.votes}`);
      if (m.id === highlight) {
        p.classList.add('mw-hl');
        if (picked) p.classList.add('mw-pop');
        el('span', 'mw-sticky', p, 'your pick'); // T82-wall-pick
        lit = p;
      } else if (m.id === newest) {
        el('span', 'mw-sticky', p, 'new!'); // T82-wall-new
      }
      p.addEventListener('click', () => showMap(m));
    });
    if (!order.length) el('p', 'ms-empty', body, 'No one has shared a map for this job yet. Finish it and be the first.');
    if (byVotes < total) {
      const more = el('div', 'ms-more', body);
      const b = button(more, 'More maps');
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await loadVotes(byVotes + WALL_FIRST);
        } catch (e) {
          b.disabled = false;
          return;
        }
        if (!s.closed && !overlay) showWall({ keepScroll: true });
      });
    }
    if (keepScroll) s.panel.scrollTop = scroll;
    else if (lit && picked) {
      requestAnimationFrame(() => lit.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
    } else s.panel.scrollTop = 0;
    if (lit && picked) lit.focus({ preventScroll: true });
    else head.querySelector('.mw-again, .mw-help')?.focus({ preventScroll: true });
  }

  // A map seen big, beside the real map.
  function showMap(m) {
    const back = document.activeElement;
    const l = el('div', 'mw-light', s.shade);
    l.setAttribute('role', 'dialog');
    l.setAttribute('aria-modal', 'true');
    l.setAttribute('aria-label', m.mine ? `${m.nickname} (yours, as shared)` : `${m.nickname}’s map`);
    const box = el('div', 'mw-box', l);
    const x = button(box, '×', 'ms-close');
    x.setAttribute('aria-label', 'Close');
    const theirs = el('div', 'ms-sheet', box);
    const h = el('h3', 'mw-who', theirs);
    el('b', null, h, m.nickname);
    h.append(m.mine ? ' (yours, as shared)' : '’s map');
    const pad = el('div', 'ms-pad', theirs);
    pad.appendChild(renderSketchCanvas(m.sketch, 560, { hint: false }));
    el('div', 'ms-trip', theirs, tripText(m));
    let changed = false;
    const thumb = mapActions(el('div', 'ms-actions', theirs), missionId, m, () => (changed = true));
    if (info) {
      const realBox = el('div', 'ms-sheet', box);
      el('h3', null, realBox, 'The real map'); // T82-wall-real
      el('div', 'ms-pad mw-realpad', realBox).appendChild(realCanvas(info, 560));
    }
    const close = () => {
      l.remove();
      overlay = null;
      if (changed) showWall({ keepScroll: true });
      else if (back && back.isConnected) back.focus({ preventScroll: true });
    };
    overlay = { root: l, close };
    x.addEventListener('click', close);
    l.addEventListener('pointerdown', (e) => {
      if (e.target === l) close();
    });
    (thumb.disabled ? x : thumb).focus({ preventScroll: true });
  }

  // The first-time note, pinned over the pick (and back with "?").
  function showNote(onWall) {
    if (overlay) overlay.close();
    markNoteSeen();
    const back = document.activeElement;
    const t = el('div', 'mw-tut', s.shade);
    t.setAttribute('role', 'dialog');
    t.setAttribute('aria-modal', 'true');
    t.setAttribute('aria-label', 'The map wall'); // T82-note-title
    const n = el('div', 'mw-note', t);
    el('h3', null, n, 'The map wall'); // T82-note-title
    const demo = el('div', 'mw-demo', n);
    demo.setAttribute('aria-hidden', 'true');
    const two = pickPair(maps) || wallOrder(maps).slice(0, 2);
    for (const cls of ['a', 'b']) {
      const m = two[cls === 'a' ? 0 : 1];
      const mini = el('div', 'mw-mini mw-mini-' + cls, demo);
      if (m) mini.appendChild(renderSketchCanvas(m.sketch, 104, { hint: false }));
      else if (info) mini.appendChild(realCanvas(info, 104));
    }
    el('span', 'mw-plus', demo, '▲ +1');
    el('span', 'mw-hand', demo, '👆');
    el('p', null, n, `Every driver who finds ${place} pins up the map they drew on the way.`); // T82-note-1
    el('p', null, n, 'Some have the bridge in the wrong place.'); // T82-note-2
    el('p', null, n, 'We’ll show you two. Pick the one you’d want in your glove box.'); // T82-note-3
    el('p', null, n, 'Each pick moves a map up the wall, so the next lost driver sees the best ones first.'); // T82-note-4
    el('p', null, n, 'Yours is up there too. Other drivers get to judge it.'); // T82-note-5
    const go = button(n, 'Show me two maps', 'ms-main'); // T82-note-go
    const close = () => {
      t.remove();
      overlay = null;
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
    overlay = { root: t, close };
    go.addEventListener('click', () => {
      close();
      if (onWall) showPick();
    });
    t.addEventListener('pointerdown', (e) => {
      if (e.target === t) close();
    });
    go.focus({ preventScroll: true });
  }

  load().then((ok) => {
    if (!ok) return;
    if (pick && pickPair(maps)) showPick();
    else showWall();
  });
  return s;
}
