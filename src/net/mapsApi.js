// Talks to the shared-maps API (server/, same origin: /api/maps). The game
// works fully without it: available() resolves false when there is no
// server (local dev, a static host, offline) and the UI hides sharing.
//
// API:
//   available()                     -> Promise<config | null> (asked once per page)
//   playerId()                      anonymous random id (localStorage, or this page only)
//   listMaps(mission, { sort, offset, limit }) -> { maps, total }
//   getMap(mission, id)
//   shareMap({ mission, region, seed, timeMs, km, tows, nickname, sketch, turnstileToken })
//   vote(mission, id, on = true) / report(mission, id)
//   compactSketch(sketch, maxBytes)  a rounded copy that fits the size limit
//   loadTurnstile()                 -> Promise<window.turnstile>
// Failed calls throw an Error with .code and a short .message for players.

import { playerMarks } from '../game/startSketch.js';

const BASE = '/api/maps';
const PLAYER_KEY = 'askalocal.player.v1';
export const GAME_VERSION = '1';

let configP = null;
let memoryPlayer = null;

export function available() {
  if (!configP) {
    configP = (async () => {
      if (!/^https?:$/.test(location.protocol)) return null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      try {
        const r = await fetch(`${BASE}/config`, { signal: ctl.signal, cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return null;
        const c = await r.json();
        return c && c.enabled ? c : null;
      } catch (e) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return configP;
}

function randomId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function playerId() {
  try {
    const s = globalThis.localStorage;
    let id = s && s.getItem(PLAYER_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = memoryPlayer || randomId();
      s && s.setItem(PLAYER_KEY, id);
    }
    memoryPlayer = id;
    return id;
  } catch (e) {
    memoryPlayer ||= randomId();
    return memoryPlayer;
  }
}

async function call(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) {
    const err = new Error('Can’t reach the map board right now.');
    err.code = 'offline';
    throw err;
  }
  let data = null;
  try {
    data = await r.json();
  } catch (e) {
    data = null;
  }
  if (!r.ok) {
    const err = new Error((data && data.message) || 'Something went wrong. Try again.');
    err.code = (data && data.error) || `http_${r.status}`;
    err.status = r.status;
    throw err;
  }
  return data;
}

export function listMaps(mission, { sort = 'votes', offset = 0, limit = 12 } = {}) {
  const q = new URLSearchParams({ mission, sort, offset: String(offset), limit: String(limit), player: playerId() });
  return call(`?${q}`);
}

export function getMap(mission, id) {
  return call(`/${encodeURIComponent(mission)}/${encodeURIComponent(id)}?player=${playerId()}`);
}

export function shareMap(fields) {
  return call('', { method: 'POST', body: { ...fields, gameVersion: GAME_VERSION, player: playerId() } });
}

export function vote(mission, id, on = true) {
  return call(`/${encodeURIComponent(mission)}/${encodeURIComponent(id)}/vote`, {
    method: on ? 'POST' : 'DELETE', body: { player: playerId() },
  });
}

export function report(mission, id) {
  return call(`/${encodeURIComponent(mission)}/${encodeURIComponent(id)}/report`, {
    method: 'POST', body: { player: playerId() },
  });
}

// A copy of the sketch with coordinates rounded to 0.1 px. If it is still
// over maxBytes, long strokes lose every other point until it fits (the
// pencil look hides it).
export function compactSketch(sketch, maxBytes = 190000) {
  const r = (v) => Math.round(v * 10) / 10;
  let out = {
    strokes: (sketch.strokes || []).filter((s) => s.points && s.points.length).map((s) => {
      const o = { points: s.points.map(([x, y]) => [r(x), r(y)]) };
      if (s.width != null) o.width = s.width;
      if (s.color != null) o.color = s.color;
      if (s.dash) o.dash = true;
      return o;
    }),
    stamps: (sketch.stamps || []).map((s) => ({ kind: s.kind, x: r(s.x), y: r(s.y), ...(s.color != null ? { color: s.color } : {}) })),
    labels: (sketch.labels || []).map((l) => ({ text: l.text, x: r(l.x), y: r(l.y), ...(l.color != null ? { color: l.color } : {}) })),
  };
  for (let i = 0; i < 6 && JSON.stringify(out).length > maxBytes; i++) {
    out = {
      ...out,
      strokes: out.strokes.map((s) => (s.points.length > 4
        ? { ...s, points: s.points.filter((_, k) => k % 2 === 0 || k === s.points.length - 1) }
        : s)),
    };
  }
  return out;
}

// Mission 1's pre-drawn marks (#87, pre: true) don't count: nothing of yours to share.
export function sketchIsEmpty(sketch) {
  return playerMarks(sketch) === 0;
}

// Cloudflare Turnstile, loaded only when the share form opens.
let turnstileP = null;
export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileP) {
    turnstileP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile')));
      s.onerror = () => {
        turnstileP = null;
        s.remove();
        reject(new Error('turnstile blocked'));
      };
      document.head.appendChild(s);
    });
  }
  return turnstileP;
}
