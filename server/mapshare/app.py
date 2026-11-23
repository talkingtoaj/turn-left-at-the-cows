"""The web app: the shared-maps API under /api/maps, plus the built game."""

from __future__ import annotations

import hmac
import json
import logging
import os

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .maps import MAX_NICKNAME, MAX_SEEDS, BadRequest, Busy, MapStore, NotFound, check_player, clean_seed, clean_upload
from .ratelimit import RateLimiter
from .records import RecordStore, clean_finish
from .static import make_static_handler
from .storage import Storage, make_storage
from .turnstile import TurnstileVerifier

log = logging.getLogger("mapshare")


def _err(status: int, code: str, message: str | None = None) -> JSONResponse:
    return JSONResponse({"error": code, "message": message or code}, status_code=status,
                        headers={"Cache-Control": "no-store"})


def _ok(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status, headers={"Cache-Control": "no-store"})


def client_ip(request: Request, trust_proxy: bool) -> str:
    """The caller's IP. Behind Cloud Run the last X-Forwarded-For entry is the
    one Google added (earlier entries are whatever the caller sent)."""
    if trust_proxy:
        xff = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"


def create_app(settings: Settings | None = None, storage: Storage | None = None, verifier=None) -> FastAPI:
    settings = settings or Settings.from_env()
    storage = storage or make_storage(settings)
    verifier = verifier or TurnstileVerifier(settings.turnstile_secret_key)
    store = MapStore(storage, settings.prefix, settings.voter_salt, settings.hide_after_reports)
    trust_proxy = bool(os.environ.get("K_SERVICE")) or os.environ.get("TRUST_PROXY") == "1"
    upload_ip = RateLimiter(settings.uploads_per_hour)
    upload_all = RateLimiter(settings.uploads_per_hour_total)
    action_ip = RateLimiter(settings.actions_per_hour)
    records = RecordStore(storage, settings.records_prefix)
    finish_ip = RateLimiter(settings.finishes_per_hour)

    if settings.using_test_turnstile and os.environ.get("K_SERVICE"):
        log.warning("TURNSTILE_SECRET_KEY is not set: using Cloudflare's always-pass test key")

    app = FastAPI(title="Turn Left at the Cows", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.state.settings = settings
    app.state.store = store
    app.state.records = records

    @app.middleware("http")
    async def headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return resp

    async def read_json(request: Request):
        size = request.headers.get("content-length")
        if size and size.isdigit() and int(size) > settings.max_body_bytes:
            raise BadRequest("too_big", "This map is too big to share.")
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > settings.max_body_bytes:
                raise BadRequest("too_big", "This map is too big to share.")
        try:
            return json.loads(body or b"{}")
        except ValueError as e:
            raise BadRequest("bad_json", "expected JSON") from e

    @app.exception_handler(BadRequest)
    async def bad_request(_req, e: BadRequest):
        status = 413 if e.code == "too_big" else 400
        return _err(status, e.code, e.message)

    @app.exception_handler(NotFound)
    async def not_found(_req, _e):
        return _err(404, "not_found", "That map is gone.")

    @app.exception_handler(Busy)
    async def busy(_req, _e):
        return _err(503, "busy", "Busy right now, try again.")

    @app.get("/health")
    def health():
        return _ok({"ok": True})

    @app.get("/api/maps/config")
    def config():
        return _ok({
            "enabled": True,
            "turnstileSiteKey": settings.turnstile_site_key,
            "maxNickname": MAX_NICKNAME,
            "maxBytes": settings.max_body_bytes,
            "hideAfterReports": settings.hide_after_reports,
        })

    @app.get("/api/maps")
    def list_maps(mission: str, sort: str = "votes", limit: int = 12, offset: int = 0, player: str | None = None):
        viewer = store.who(check_player(player)) if player else None
        limit = max(1, min(24, limit))
        offset = max(0, min(100_000, offset))
        maps, total = store.list(mission, "new" if sort == "new" else "votes", limit, offset, viewer)
        return _ok({"maps": maps, "total": total, "offset": offset, "limit": limit})

    @app.get("/api/maps/{mission}/{map_id}")
    def get_map(mission: str, map_id: str, player: str | None = None):
        rec = store.get(mission, map_id)
        if rec.get("hidden"):
            raise NotFound()
        viewer = store.who(check_player(player)) if player else None
        return _ok(store.public(rec, viewer))

    @app.post("/api/maps")
    async def upload(request: Request):
        body = await read_json(request)
        fields = clean_upload(body)
        player = check_player(body.get("player"))
        ip = client_ip(request, trust_proxy)
        token = body.get("turnstileToken")
        if not isinstance(token, str) or not await run_in_threadpool(verifier, token, ip):
            return _err(400, "captcha", "The robot check didn't pass. Try again.")
        if not upload_ip.allow(ip):
            return _err(429, "rate_limited", "That's a lot of maps! Try again in an hour.")
        if not upload_all.allow("all"):
            return _err(429, "rate_limited", "Lots of maps coming in right now. Try again later.")
        rec = await run_in_threadpool(store.create, fields, store.who(player))
        log.info("map shared mission=%s id=%s", rec["mission"], rec["id"])
        return _ok(store.public(rec, store.who(player)), status=201)

    async def action(request: Request, mission: str, map_id: str, kind: str):
        body = await read_json(request)
        player = check_player(body.get("player") if isinstance(body, dict) else None)
        if not action_ip.allow(client_ip(request, trust_proxy)):
            return _err(429, "rate_limited", "Slow down a little.")
        who = store.who(player)
        if kind == "report":
            rec = await run_in_threadpool(store.report, mission, map_id, who)
            log.info("map reported mission=%s id=%s reports=%s hidden=%s", mission, map_id, rec["reports"], rec["hidden"])
            return _ok({"reported": True, "hidden": bool(rec.get("hidden"))})
        on = kind == "vote"
        rec = await run_in_threadpool(store.vote, mission, map_id, who, on)
        return _ok({"votes": rec["votes"], "voted": on})

    @app.post("/api/maps/{mission}/{map_id}/vote")
    async def vote(request: Request, mission: str, map_id: str):
        return await action(request, mission, map_id, "vote")

    @app.delete("/api/maps/{mission}/{map_id}/vote")
    async def unvote(request: Request, mission: str, map_id: str):
        return await action(request, mission, map_id, "unvote")

    @app.post("/api/maps/{mission}/{map_id}/report")
    async def report(request: Request, mission: str, map_id: str):
        return await action(request, mission, map_id, "report")

    # All-player records (records.py): the fastest finish per mission, and the
    # fastest where the player also sent the tourist the right way.
    @app.get("/api/records")
    def get_records():
        return _ok({"records": records.all()})

    @app.post("/api/records")
    async def post_finish(request: Request):
        mission, ms, tourist = clean_finish(await read_json(request))
        if not finish_ip.allow(client_ip(request, trust_proxy)):
            return _err(429, "rate_limited", "Slow down a little.")
        out = await run_in_threadpool(records.submit, mission, ms, tourist)
        if out["new"]:
            log.info("record mission=%s ms=%s new=%s", mission, ms, ",".join(out["new"]))
        return _ok(out)

    # Admin: needs ADMIN_TOKEN (header "Authorization: Bearer <token>").
    def admin_ok(request: Request) -> bool:
        if not settings.admin_token:
            return False
        auth = request.headers.get("authorization", "")
        given = auth[7:] if auth.lower().startswith("bearer ") else ""
        return hmac.compare_digest(given.encode(), settings.admin_token.encode())

    @app.get("/api/admin/maps")
    def admin_list(request: Request, mission: str, hidden_only: bool = True):
        if not admin_ok(request):
            return _err(401, "unauthorized")
        maps, total = store.list(mission, "new", 500, 0, None, include_hidden=True)
        if hidden_only:
            maps = [m for m in maps if m["hidden"]]
        for m in maps:
            m.pop("sketch", None)
        return _ok({"maps": maps, "total": total})

    @app.post("/api/admin/maps/{mission}/{map_id}/{what}")
    def admin_hide(request: Request, mission: str, map_id: str, what: str):
        if not admin_ok(request):
            return _err(401, "unauthorized")
        if what not in ("hide", "unhide"):
            return _err(404, "not_found")
        rec = store.set_hidden(mission, map_id, what == "hide")
        log.info("admin %s mission=%s id=%s", what, mission, map_id)
        return _ok({"id": rec["id"], "hidden": rec["hidden"]})

    # Seed maps (tools/seed-maps.mjs): the poor maps the wall starts with.
    # Each has a fixed id, so loading the same file again adds nothing.
    @app.post("/api/admin/seed")
    async def admin_seed(request: Request):
        if not admin_ok(request):
            return _err(401, "unauthorized")
        body = await read_json(request)
        items = body.get("maps") if isinstance(body, dict) else None
        if not isinstance(items, list) or not items or len(items) > MAX_SEEDS:
            return _err(400, "bad_body", f"expected 1 to {MAX_SEEDS} maps")
        seeds = [clean_seed(it) for it in items]  # all checked before any is stored
        added, skipped = [], []
        for map_id, fields, votes, created in seeds:
            rec = await run_in_threadpool(store.create_seed, fields, map_id, votes, created)
            (added if rec else skipped).append(map_id)
        log.info("admin seed added=%s skipped=%s", len(added), len(skipped))
        return _ok({"added": added, "skipped": skipped})

    static = make_static_handler(settings.dist_dir)
    app.add_api_route("/", static, methods=["GET", "HEAD"], include_in_schema=False)
    app.add_api_route("/{path:path}", static, methods=["GET", "HEAD"], include_in_schema=False)
    return app
