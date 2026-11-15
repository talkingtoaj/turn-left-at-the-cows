// All-player records (server/mapshare/records.py, same origin: /api/records):
// per mission, the fastest finish by anyone ("best") and the fastest where
// the player also sent the tourist the right way ("tourist"). Times in ms,
// null when nobody has set one yet.
//
// The game works fully without the server: both calls resolve null when
// there is no API (plain `npm run dev`, a static host, offline), and the
// screens then show nothing.
//
// API:
//   getRecords()                         -> Promise<{ [missionId]: { best, tourist } } | null>
//   submitFinish({ mission, ms, tourist }) -> Promise<{ best, tourist, new } | null>
//                                           (that mission's records after this finish)

const BASE = '/api/records';

async function call(method, body) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(BASE, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: ctl.signal,
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRecords() {
  const data = await call('GET');
  return data && data.records && typeof data.records === 'object' ? data.records : null;
}

export async function submitFinish({ mission, ms, tourist }) {
  const data = await call('POST', { mission, ms: Math.round(ms), tourist: !!tourist });
  return data && 'best' in data ? data : null;
}

// The two record lines for a mission's records, as [label, ms] pairs, only
// those that are set. `withTourist` false leaves out the tourist one (a
// mission with no tourist).
export function recordRows(rec, withTourist = true) {
  if (!rec) return [];
  const rows = [];
  // The two labels are the owner's own words (records brief, Nov 2026).
  if (rec.best > 0) rows.push(['Best player time to beat', rec.best]);
  if (withTourist && rec.tourist > 0) rows.push(['Best time including helping the tourist', rec.tourist]);
  return rows;
}
