// Shared maps: share your hand-drawn map after a mission, look through other
// drivers' maps for the same mission, put one beside yours, thumbs-up it or
// report it. Talks to the server through src/net/mapsApi.js; when there is
// no server (local dev, offline) the strip says so in one line and the game
// carries on as before.
//
//   mountShareStrip(parent, ctx)   the row on the mission-complete screen
//     ctx: { missionId, missionTitle, region, seed, shareKey,
//            getSketch(), stats: { timeMs, km, tows } }
//   openMapsBrowser({ missionId, missionTitle, mySketch }) the maps page (also
//     opened from the start screen's notepad)
//
// Plain DOM, no game code: the start screen loads it on demand.

import { el } from './style.js';
import { MAP_SHARE_CSS } from './mapShareStyle.js';
import { renderSketchCanvas } from '../../src3/map/sketchPaper.js';
import { timerText } from '../hud/format.js';
import { milesText } from '../units.js';
import {
  available, listMaps, shareMap, vote, report, compactSketch, sketchIsEmpty, loadTurnstile,
} from '../net/mapsApi.js';
import { markShared } from '../game/myMaps.js';

const PAGE = 12;
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
      const f = [...root.querySelectorAll('button, input, [tabindex="0"]')].filter((n) => !n.disabled && n.offsetParent);
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
  let release = null;
  const api = {
    shade,
    panel,
    closed: false,
    onEscape(fn) {
      onEsc = fn;
    },
    close() {
      if (api.closed) return;
      api.closed = true;
      release();
      shade.remove();
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
    },
  };
  release = holdKeys(shade, () => (onEsc ? onEsc() : api.close()));
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
    see.addEventListener('click', () => openMapsBrowser({
      missionId: ctx.missionId, missionTitle: ctx.missionTitle, mySketch: ctx.getSketch(),
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
        openMapsBrowser({ missionId: ctx.missionId, missionTitle: ctx.missionTitle, mySketch: sketch });
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

// ------------------------------------------------------------ the maps page

export function openMapsBrowser({ missionId, missionTitle, mySketch = null }) {
  const s = sheet('Other drivers’ maps');
  let sort = 'votes';
  let view = 'grid';
  const head = el('div', 'ms-head', s.panel);
  el('h2', null, head, 'Other drivers’ maps');
  el('span', 'ms-sub', head, missionTitle);
  const sorts = el('div', 'ms-sorts', head);
  sorts.setAttribute('role', 'group');
  sorts.setAttribute('aria-label', 'Sort');
  const byVotes = button(sorts, 'Most votes');
  const byNew = button(sorts, 'Newest');
  const body = el('div', null, s.panel);
  let maps = [];
  let total = 0;
  let gridScroll = 0;

  const markSort = () => {
    byVotes.classList.toggle('ms-on', sort === 'votes');
    byNew.classList.toggle('ms-on', sort === 'new');
    byVotes.setAttribute('aria-pressed', String(sort === 'votes'));
    byNew.setAttribute('aria-pressed', String(sort === 'new'));
  };
  byVotes.addEventListener('click', () => setSort('votes'));
  byNew.addEventListener('click', () => setSort('new'));
  function setSort(v) {
    sort = v;
    markSort();
    load(true);
  }
  s.onEscape(() => (view === 'compare' ? showGrid() : s.close()));

  async function load(fresh) {
    if (fresh) {
      maps = [];
      body.textContent = '';
      el('p', 'ms-msg', body, 'Fetching maps…');
    }
    const config = await available();
    if (s.closed) return;
    if (!config) {
      body.textContent = '';
      el('p', 'ms-msg', body, 'Sharing maps isn’t available right now. Try again later.');
      return;
    }
    try {
      const r = await listMaps(missionId, { sort, offset: maps.length, limit: PAGE });
      maps = maps.concat(r.maps);
      total = r.total;
    } catch (e) {
      body.textContent = '';
      el('p', 'ms-msg', body, e.message);
      return;
    }
    await fontsReady();
    if (!s.closed) showGrid();
  }

  function showGrid() {
    view = 'grid';
    sorts.hidden = false;
    body.textContent = '';
    if (!maps.length) {
      el('p', 'ms-empty', body, 'No one has shared a map for this job yet. Finish it and be the first.');
      return;
    }
    const grid = el('div', 'ms-grid', body);
    maps.forEach((m, i) => card(grid, m, i));
    if (maps.length < total) {
      const more = el('div', 'ms-more', body);
      const b = button(more, 'More maps');
      b.addEventListener('click', () => {
        b.disabled = true;
        load(false);
      });
    }
    s.panel.scrollTop = gridScroll;
  }

  function card(grid, m, i) {
    const c = el('button', 'ms-card', grid);
    c.type = 'button';
    c.style.setProperty('--tilt', `${((i * 37) % 7 - 3) * 0.35}deg`);
    c.setAttribute('aria-label', `${m.nickname}'s map, ${m.votes} thumbs-up. Open to compare with yours.`);
    c.appendChild(renderSketchCanvas(m.sketch, 230, { hint: false }));
    const name = el('span', 'ms-name', c, m.nickname);
    if (m.mine) el('span', 'ms-badge', name, 'Yours');
    el('span', 'ms-votes', name, `▲ ${m.votes}`);
    el('span', 'ms-trip', c, tripText(m));
    c.addEventListener('click', () => {
      gridScroll = s.panel.scrollTop;
      showCompare(m);
    });
  }

  function showCompare(m) {
    view = 'compare';
    sorts.hidden = true;
    body.textContent = '';
    const backBtn = button(body, '← All maps', 'ms-back');
    backBtn.addEventListener('click', showGrid);
    const cmp = el('div', 'ms-compare', body);

    const mine = el('div', 'ms-sheet', cmp);
    el('h3', null, mine, 'Your map');
    const pad1 = el('div', 'ms-pad', mine);
    if (mySketch && !sketchIsEmpty(mySketch)) pad1.appendChild(renderSketchCanvas(mySketch, 520, { hint: false }));
    else el('div', 'ms-none', pad1, 'Finish this job (and draw your map) to see yours here.');

    const theirs = el('div', 'ms-sheet', cmp);
    const h2 = el('h3', null, theirs);
    el('b', null, h2, m.nickname);
    h2.append(m.mine ? ' (yours, as shared)' : '’s map');
    const pad2 = el('div', 'ms-pad', theirs);
    pad2.appendChild(renderSketchCanvas(m.sketch, 520, { hint: false }));
    el('div', 'ms-trip', theirs, tripText(m));

    const acts = el('div', 'ms-actions', theirs);
    const thumb = button(acts, '');
    const note = el('span', 'ms-note', acts);
    note.setAttribute('role', 'status');
    const paintThumb = () => {
      thumb.innerHTML = `${THUMB}<span>${m.voted ? 'Thumbs-up given' : 'Thumbs-up'} (${m.votes})</span>`;
      thumb.classList.toggle('ms-on', !!m.voted);
      thumb.setAttribute('aria-pressed', String(!!m.voted));
    };
    paintThumb();
    if (m.mine) {
      thumb.disabled = true;
      note.textContent = 'This one is yours.';
    }
    thumb.addEventListener('click', async () => {
      thumb.disabled = true;
      try {
        const r = await vote(missionId, m.id, !m.voted);
        m.voted = r.voted;
        m.votes = r.votes;
        paintThumb();
        note.textContent = '';
      } catch (e) {
        note.textContent = e.message;
      }
      thumb.disabled = false;
    });

    if (!m.mine) {
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
            note.textContent = 'Thanks. We’ll take a look.';
            if (r.hidden) {
              maps = maps.filter((x) => x.id !== m.id);
              total = Math.max(0, total - 1);
            }
            rep.textContent = 'Reported';
            rep.disabled = true;
            rep.hidden = false;
          } catch (e) {
            note.textContent = e.message;
          }
        });
        yes.focus();
      });
    }
    backBtn.focus({ preventScroll: true });
    s.panel.scrollTop = 0;
  }

  markSort();
  byVotes.focus({ preventScroll: true });
  load(true);
  return s;
}
