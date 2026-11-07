"""Serving the built game (Vite's dist/ folder).

- /assets/* have content hashes in their names: cached for a year, immutable.
- HTML pages are never cached, so a deploy shows up on the next load.
- Everything else (sounds, textures, icons): cached for a day.
- /, /three.html and /sounds.html are the pages; an unknown path with no file
  extension falls back to the game's index.html.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

PAGES = {"": "index.html", "index.html": "index.html", "three.html": "three.html", "sounds.html": "sounds.html"}
LONG = "public, max-age=31536000, immutable"
HTML = "no-cache"
DAY = "public, max-age=86400"

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("audio/ogg", ".ogg")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")


def _cache_for(rel: str) -> str:
    if rel.endswith(".html"):
        return HTML
    if rel.startswith("assets/"):
        return LONG
    return DAY


def make_static_handler(dist_dir: Path):
    root = Path(dist_dir).resolve()

    def file(rel: str) -> FileResponse:
        return FileResponse(root / rel, headers={"Cache-Control": _cache_for(rel)})

    async def handler(request: Request, path: str = ""):
        rel = path.lstrip("/")
        if rel.startswith("api/") or rel == "api":
            return JSONResponse({"error": "not_found"}, status_code=404)
        if not (root / "index.html").exists():
            return PlainTextResponse("The game is not built (run npm run build).", status_code=503)
        if rel in PAGES:
            return file(PAGES[rel])
        target = (root / rel).resolve()
        if root in target.parents and target.is_file():
            return file(target.relative_to(root).as_posix())
        if "." not in rel.rsplit("/", 1)[-1]:
            return file("index.html")
        return PlainTextResponse("Not found", status_code=404, headers={"Cache-Control": "no-cache"})

    return handler
