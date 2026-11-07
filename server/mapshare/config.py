"""Settings, all from environment variables (see server/README.md)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Cloudflare's documented always-pass test keys. Used when no real keys are set
# (local dev, tests). Never use them in production.
TEST_SITE_KEY = "1x00000000000000000000AA"
TEST_SECRET_KEY = "1x0000000000000000000000000000000AA"

# A shared, private bucket (one folder per app); this game keeps its maps under the prefix.
DEFAULT_BUCKET = "talkingtoaj-public-media"
DEFAULT_PREFIX = "turn-left-at-the-cows/maps/"

SERVER_DIR = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    storage: str = "gcs"  # gcs | local | memory
    bucket: str = DEFAULT_BUCKET
    prefix: str = DEFAULT_PREFIX
    local_dir: Path = SERVER_DIR / ".localmaps"
    dist_dir: Path = SERVER_DIR.parent / "dist"
    turnstile_site_key: str = TEST_SITE_KEY
    turnstile_secret_key: str = TEST_SECRET_KEY
    admin_token: str = ""
    voter_salt: str = "turn-left-at-the-cows"
    uploads_per_hour: int = 5  # per IP
    actions_per_hour: int = 120  # votes + reports, per IP
    uploads_per_hour_total: int = 300  # whole service (per instance): a cost cap
    hide_after_reports: int = 3
    max_body_bytes: int = 200_000

    @property
    def using_test_turnstile(self) -> bool:
        return self.turnstile_secret_key == TEST_SECRET_KEY

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ
        prefix = env.get("MAPS_PREFIX", DEFAULT_PREFIX)
        if prefix and not prefix.endswith("/"):
            prefix += "/"
        # On Cloud Run (K_SERVICE is set) the default is GCS; anywhere else a local folder.
        storage = env.get("STORAGE", "gcs" if env.get("K_SERVICE") else "local").lower()
        return cls(
            storage=storage,
            bucket=env.get("MAPS_BUCKET") or DEFAULT_BUCKET,
            prefix=prefix,
            local_dir=Path(env.get("LOCAL_MAPS_DIR", str(SERVER_DIR / ".localmaps"))),
            dist_dir=Path(env.get("DIST_DIR", str(SERVER_DIR.parent / "dist"))),
            turnstile_site_key=env.get("TURNSTILE_SITE_KEY") or TEST_SITE_KEY,
            turnstile_secret_key=env.get("TURNSTILE_SECRET_KEY") or TEST_SECRET_KEY,
            admin_token=env.get("ADMIN_TOKEN", ""),
            voter_salt=env.get("VOTER_SALT", "turn-left-at-the-cows"),
            uploads_per_hour=_int("UPLOADS_PER_HOUR", 5),
            actions_per_hour=_int("ACTIONS_PER_HOUR", 120),
            uploads_per_hour_total=_int("UPLOADS_PER_HOUR_TOTAL", 300),
            hide_after_reports=_int("HIDE_AFTER_REPORTS", 3),
        )
