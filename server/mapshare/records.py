"""All-player records: the fastest finish of each mission, and the fastest
finish where the player also gave that mission's tourist the right way.

Storage layout (same bucket as the maps, under RECORDS_PREFIX, default
"records/"):

    <prefix><mission id>.json     {"mission", "best", "tourist"}

where best and tourist are each {"ms": int, "at": ISO time} or null. Only
the record times are kept: no player id, hash, name or IP.

A finish rewrites the mission's object only when it beats a record, with a
compare-and-swap like votes on maps (retry on a clash), so two record runs
at the same moment never lose one.

Junk checks (not full cheat-proofing; the client is trusted for the time):
- the mission must be one the game has (MIN_MS below);
- the time must be a whole number of milliseconds, at least that mission's
  floor (a straight line from start to goal at the car's top speed, rounded
  down) and at most MAX_MS;
- per-IP rate limit on finishes (FINISHES_PER_HOUR, in app.py).
"""

from __future__ import annotations

import json
import math
import secrets
import threading
import time
from datetime import datetime, timezone

from .maps import BadRequest, Busy
from .storage import Conflict, Storage

# Missions the game has (src/game/missionList.js) and the fastest finish that
# is physically possible: the straight line from the start to the goal at the
# car's top speed (25 m/s on pavement, src/drive/car.js), rounded down a bit.
# m1 2861 m (114 s), m2 3257 m (130 s), m3 3326 m from the Brandt start
# (133 s, plus the drive over from Fenwick). Add a line when a mission is added.
MIN_MS = {
    "m1_parcel": 100_000,
    "m2_cabin": 120_000,
    "m3_airfield": 120_000,
}
MAX_MS = 6 * 3600 * 1000  # six hours: anything longer is no record anyway

KINDS = ("best", "tourist")


def clean_finish(body) -> tuple[str, int, bool]:
    """(mission, ms, tourist) from a finish body, or BadRequest."""
    if not isinstance(body, dict):
        raise BadRequest("bad_body", "expected a JSON object")
    mission = body.get("mission")
    if not isinstance(mission, str) or mission not in MIN_MS:
        raise BadRequest("bad_id", "unknown mission")
    ms = body.get("ms")
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or not math.isfinite(ms) or ms != int(ms):
        raise BadRequest("bad_time", "ms must be a whole number")
    ms = int(ms)
    if ms < MIN_MS[mission] or ms > MAX_MS:
        raise BadRequest("bad_time", "that time is not possible")
    tourist = body.get("tourist", False)
    if not isinstance(tourist, bool):
        raise BadRequest("bad_body", "tourist must be true or false")
    return mission, ms, tourist


class RecordStore:
    LIST_TTL_S = 10.0

    def __init__(self, storage: Storage, prefix: str = "records/", clock=time.monotonic) -> None:
        self.storage = storage
        self.prefix = prefix
        self._clock = clock
        self._lock = threading.Lock()
        self._cached: tuple[float, dict] | None = None  # (when, all records)

    def _name(self, mission: str) -> str:
        return f"{self.prefix}{mission}.json"

    @staticmethod
    def _public(rec: dict | None) -> dict:
        rec = rec or {}
        return {k: (rec[k]["ms"] if rec.get(k) else None) for k in KINDS}

    def _read(self, mission: str) -> tuple[dict | None, int]:
        got = self.storage.read(self._name(mission))
        if got is None:
            return None, 0
        data, gen = got
        return json.loads(data), gen

    def all(self) -> dict:
        """{mission: {"best": ms | None, "tourist": ms | None}} for every mission.
        Cached for a few seconds, since every start screen asks."""
        with self._lock:
            hit = self._cached
        if hit and self._clock() - hit[0] < self.LIST_TTL_S:
            return hit[1]
        out = {m: self._public(self._read(m)[0]) for m in MIN_MS}
        with self._lock:
            self._cached = (self._clock(), out)
        return out

    def submit(self, mission: str, ms: int, tourist: bool) -> dict:
        """Counts one finish; returns that mission's records afterwards plus
        which of them this finish set ("new": ["best", ...])."""
        name = self._name(mission)
        for _ in range(8):
            rec, gen = self._read(mission)
            rec = rec or {"mission": mission, "best": None, "tourist": None}
            at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            new = []
            for kind in KINDS:
                if kind == "tourist" and not tourist:
                    continue
                cur = rec.get(kind)
                if not cur or ms < cur["ms"]:
                    rec[kind] = {"ms": ms, "at": at}
                    new.append(kind)
            if not new:
                return {**self._public(rec), "new": []}
            try:
                self.storage.write(name, json.dumps(rec, separators=(",", ":")).encode(), if_generation_match=gen)
            except Conflict:
                time.sleep(0.02 + secrets.randbelow(60) / 1000)
                continue
            with self._lock:
                self._cached = None
            return {**self._public(rec), "new": new}
        raise Busy()
