"""Shared maps: checking an upload, and storing, listing, voting and reporting.

Storage layout (bucket MAPS_BUCKET, default turn-left-at-the-cows-maps, under
MAPS_PREFIX, default "maps/"):

    <prefix><mission id>/<map id>.json     one object per shared map

Each object holds the sketch (the game's own format: strokes, stamps,
labels in 960x640 map-screen coordinates), the trip it came from, and its
votes and reports. Voters and reporters are kept as salted hashes of the
player's anonymous id, never the id itself.

Votes and reports change the map's own object with a compare-and-swap: read
it with its generation, change it, write it back only if the generation is
unchanged, retry on a clash. One object per map means clicks on different
maps never clash, and the voter list in it makes "one vote per player" exact.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from .profanity import is_profane, mask
from .storage import Conflict, Storage

FORMAT_VERSION = 1
DEFAULT_NICKNAME = "A driver"
MAX_NICKNAME = 24
MAX_LABEL = 40

PAPER_W, PAPER_H = 960, 640  # the map screen's logical size
MAX_STROKES = 1500
MAX_POINTS_PER_STROKE = 3000
MAX_POINTS = 60_000
MAX_STAMPS = 300
MAX_LABELS = 300
STAMP_KINDS = {"church", "water_tower", "bridge", "house", "tree", "radio_mast", "mill", "question", "x"}

ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")
MAP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,32}$")
PLAYER_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f​-‏‪-‮⁦-⁩]")

PUBLIC_FIELDS = (
    "id", "mission", "region", "seed", "gameVersion", "timeMs", "km", "tows",
    "nickname", "created", "votes", "reports", "hidden",
)


class BadRequest(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class NotFound(Exception):
    pass


class Busy(Exception):
    pass


# ------------------------------------------------------------------ checks


def _num(v, lo: float, hi: float, what: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise BadRequest("sketch", f"{what} must be a number")
    return min(hi, max(lo, float(v)))


def _color(v) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 0xFFFFFF:
        raise BadRequest("sketch", "bad colour")
    return v


def _clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", _CTRL_RE.sub("", s)).strip()


def clean_nickname(raw) -> str:
    if raw is None:
        return DEFAULT_NICKNAME
    if not isinstance(raw, str):
        raise BadRequest("nickname", "Nickname must be text.")
    name = _clean_text(raw)[:MAX_NICKNAME].strip()
    if not name:
        return DEFAULT_NICKNAME
    if is_profane(name):
        raise BadRequest("nickname", "Please pick a different nickname.")
    return name


def _r1(v: float) -> float:
    r = round(v, 1)
    return int(r) if r == int(r) else r


def clean_sketch(sk) -> dict:
    """A checked, trimmed copy of a sketch, or BadRequest."""
    if not isinstance(sk, dict):
        raise BadRequest("sketch", "sketch must be an object")
    strokes_in = sk.get("strokes") or []
    stamps_in = sk.get("stamps") or []
    labels_in = sk.get("labels") or []
    if not all(isinstance(x, list) for x in (strokes_in, stamps_in, labels_in)):
        raise BadRequest("sketch", "strokes, stamps and labels must be lists")
    if len(strokes_in) > MAX_STROKES or len(stamps_in) > MAX_STAMPS or len(labels_in) > MAX_LABELS:
        raise BadRequest("too_big", "This map has too many lines to share.")

    strokes, total = [], 0
    for s in strokes_in:
        if not isinstance(s, dict) or not isinstance(s.get("points"), list):
            raise BadRequest("sketch", "bad stroke")
        pts_in = s["points"]
        if not pts_in:
            continue
        if len(pts_in) > MAX_POINTS_PER_STROKE:
            raise BadRequest("too_big", "This map has too many lines to share.")
        total += len(pts_in)
        if total > MAX_POINTS:
            raise BadRequest("too_big", "This map has too many lines to share.")
        pts = []
        for p in pts_in:
            if not isinstance(p, list) or len(p) != 2:
                raise BadRequest("sketch", "bad point")
            pts.append([_r1(_num(p[0], 0, PAPER_W, "x")), _r1(_num(p[1], 0, PAPER_H, "y"))])
        out = {"points": pts}
        if s.get("width") is not None:
            out["width"] = _r1(_num(s["width"], 0.5, 12, "width"))
        c = _color(s.get("color"))
        if c is not None:
            out["color"] = c
        if s.get("dash"):
            out["dash"] = True
        strokes.append(out)

    stamps = []
    for st in stamps_in:
        if not isinstance(st, dict) or st.get("kind") not in STAMP_KINDS:
            raise BadRequest("sketch", "bad stamp")
        out = {"kind": st["kind"], "x": _r1(_num(st.get("x"), 0, PAPER_W, "x")), "y": _r1(_num(st.get("y"), 0, PAPER_H, "y"))}
        c = _color(st.get("color"))
        if c is not None:
            out["color"] = c
        stamps.append(out)

    labels = []
    for lb in labels_in:
        if not isinstance(lb, dict) or not isinstance(lb.get("text"), str):
            raise BadRequest("sketch", "bad label")
        text = mask(_clean_text(lb["text"])[:MAX_LABEL])
        if not text:
            continue
        out = {"text": text, "x": _r1(_num(lb.get("x"), 0, PAPER_W, "x")), "y": _r1(_num(lb.get("y"), 0, PAPER_H, "y"))}
        c = _color(lb.get("color"))
        if c is not None:
            out["color"] = c
        labels.append(out)

    if not strokes and not stamps and not labels:
        raise BadRequest("empty", "This map is empty: draw something first.")
    return {"strokes": strokes, "stamps": stamps, "labels": labels}


def check_id(v, what: str, rx=ID_RE) -> str:
    if not isinstance(v, str) or not rx.match(v):
        raise BadRequest("bad_id", f"bad {what}")
    return v


def check_player(v) -> str:
    return check_id(v, "player", PLAYER_RE)


def clean_upload(body) -> dict:
    """The stored fields of an upload body (no id, counts or owner yet)."""
    if not isinstance(body, dict):
        raise BadRequest("bad_body", "expected a JSON object")
    seed = body.get("seed")
    if seed is not None and (isinstance(seed, bool) or not isinstance(seed, int) or abs(seed) > 2**53):
        raise BadRequest("bad_body", "bad seed")
    gv = body.get("gameVersion", "1")
    if not isinstance(gv, str) or not re.match(r"^[A-Za-z0-9._-]{1,20}$", gv):
        raise BadRequest("bad_body", "bad gameVersion")
    return {
        "mission": check_id(body.get("mission"), "mission"),
        "region": check_id(body.get("region"), "region"),
        "seed": seed,
        "gameVersion": gv,
        "timeMs": int(_num(body.get("timeMs", 0), 0, 48 * 3600 * 1000, "timeMs")),
        "km": round(_num(body.get("km", 0), 0, 1000, "km"), 2),
        "tows": int(_num(body.get("tows", 0), 0, 99, "tows")),
        "nickname": clean_nickname(body.get("nickname")),
        "sketch": clean_sketch(body.get("sketch")),
    }


# ------------------------------------------------------------------ store


class MapStore:
    LIST_TTL_S = 3.0

    def __init__(self, storage: Storage, prefix: str, salt: str, hide_after: int = 3) -> None:
        self.storage = storage
        self.prefix = prefix
        self.salt = salt
        self.hide_after = hide_after
        self._cache: dict[str, tuple[int, dict]] = {}  # object name -> (generation, record)
        self._listed: dict[str, tuple[float, list[tuple[str, int]]]] = {}  # mission -> (when, names)
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=8)

    # names and hashes
    def _dir(self, mission: str) -> str:
        return f"{self.prefix}{mission}/"

    def _name(self, mission: str, map_id: str) -> str:
        return f"{self._dir(mission)}{map_id}.json"

    def who(self, player: str) -> str:
        return hashlib.sha256(f"{self.salt}:{player}".encode()).hexdigest()[:24]

    # reading
    def _remember(self, name: str, gen: int, rec: dict) -> None:
        with self._lock:
            self._cache[name] = (gen, rec)

    def _load(self, name: str, gen: int | None = None) -> dict | None:
        with self._lock:
            hit = self._cache.get(name)
        if hit and gen is not None and hit[0] == gen:
            return hit[1]
        got = self.storage.read(name)
        if got is None:
            return None
        data, g = got
        rec = json.loads(data)
        self._remember(name, g, rec)
        return rec

    def get(self, mission: str, map_id: str) -> dict:
        check_id(mission, "mission")
        check_id(map_id, "map id", MAP_ID_RE)
        rec = self._load(self._name(mission, map_id))
        if rec is None:
            raise NotFound()
        return rec

    def _all(self, mission: str) -> list[dict]:
        now = time.monotonic()
        with self._lock:
            hit = self._listed.get(mission)
        if hit and now - hit[0] < self.LIST_TTL_S:
            names = hit[1]
        else:
            names = [(n, g) for n, g in self.storage.list(self._dir(mission)) if n.endswith(".json")]
            with self._lock:
                self._listed[mission] = (now, names)
        recs = list(self._pool.map(lambda ng: self._load(*ng), names))
        return [r for r in recs if r]

    def list(self, mission: str, sort: str = "votes", limit: int = 12, offset: int = 0,
             viewer: str | None = None, include_hidden: bool = False) -> tuple[list[dict], int]:
        check_id(mission, "mission")
        recs = [r for r in self._all(mission) if include_hidden or not r.get("hidden")]
        if sort == "new":
            recs.sort(key=lambda r: r.get("created", ""), reverse=True)
        else:
            recs.sort(key=lambda r: (r.get("votes", 0), r.get("created", "")), reverse=True)
        total = len(recs)
        page = recs[offset: offset + limit]
        return [self.public(r, viewer, with_sketch=True) for r in page], total

    def public(self, rec: dict, viewer: str | None = None, with_sketch: bool = True) -> dict:
        out = {k: rec.get(k) for k in PUBLIC_FIELDS}
        if with_sketch:
            out["sketch"] = rec.get("sketch")
        if viewer:
            out["voted"] = viewer in rec.get("voters", [])
            out["reported"] = viewer in rec.get("reporters", [])
            out["mine"] = viewer == rec.get("owner")
        return out

    # writing
    def create(self, fields: dict, owner: str) -> dict:
        now = datetime.now(timezone.utc)
        for _ in range(5):
            map_id = secrets.token_urlsafe(9)  # 12 characters
            rec = {
                "v": FORMAT_VERSION,
                "id": map_id,
                **{k: v for k, v in fields.items() if k != "sketch"},
                "created": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "votes": 0,
                "reports": 0,
                "hidden": False,
                "reviewed": False,
                "owner": owner,
                "voters": [],
                "reporters": [],
                "sketch": fields["sketch"],
            }
            name = self._name(rec["mission"], map_id)
            try:
                gen = self.storage.write(name, _dumps(rec), if_generation_match=0)
            except Conflict:
                continue
            self._remember(name, gen, rec)
            self._forget_list(rec["mission"])
            return rec
        raise Busy()

    def _forget_list(self, mission: str) -> None:
        with self._lock:
            self._listed.pop(mission, None)

    def _update(self, mission: str, map_id: str, change) -> dict:
        check_id(mission, "mission")
        check_id(map_id, "map id", MAP_ID_RE)
        name = self._name(mission, map_id)
        for _ in range(8):
            got = self.storage.read(name)
            if got is None:
                raise NotFound()
            data, gen = got
            rec = json.loads(data)
            if not change(rec):
                self._remember(name, gen, rec)
                return rec
            try:
                new_gen = self.storage.write(name, _dumps(rec), if_generation_match=gen)
            except Conflict:
                time.sleep(0.02 + secrets.randbelow(60) / 1000)
                continue
            self._remember(name, new_gen, rec)
            return rec
        raise Busy()

    def vote(self, mission: str, map_id: str, voter: str, on: bool = True) -> dict:
        def change(rec):
            if rec.get("hidden"):
                raise NotFound()
            if rec.get("owner") == voter:
                raise BadRequest("own_map", "That's your own map.")
            voters = rec.setdefault("voters", [])
            if on == (voter in voters):
                return False
            if on:
                voters.append(voter)
            else:
                voters.remove(voter)
            rec["votes"] = len(voters)
            return True

        return self._update(mission, map_id, change)

    def report(self, mission: str, map_id: str, reporter: str) -> dict:
        def change(rec):
            if rec.get("owner") == reporter:
                raise BadRequest("own_map", "That's your own map.")
            reporters = rec.setdefault("reporters", [])
            if reporter in reporters:
                return False
            reporters.append(reporter)
            rec["reports"] = len(reporters)
            if len(reporters) >= self.hide_after and not rec.get("reviewed"):
                rec["hidden"] = True
            return True

        rec = self._update(mission, map_id, change)
        if rec.get("hidden"):
            self._forget_list(mission)
        return rec

    def set_hidden(self, mission: str, map_id: str, hidden: bool) -> dict:
        """Admin: hide a map, or unhide it (an unhidden map is marked reviewed
        and is not hidden by reports again)."""

        def change(rec):
            rec["hidden"] = hidden
            rec["reviewed"] = not hidden
            return True

        rec = self._update(mission, map_id, change)
        self._forget_list(mission)
        return rec


def _dumps(rec: dict) -> bytes:
    return json.dumps(rec, separators=(",", ":"), ensure_ascii=False).encode()
