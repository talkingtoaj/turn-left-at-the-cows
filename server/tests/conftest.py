import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mapshare.app import create_app  # noqa: E402
from mapshare.config import Settings  # noqa: E402
from mapshare.storage import MemoryStorage  # noqa: E402


class FakeVerifier:
    """Turnstile stand-in: the token "pass" passes, anything else fails."""

    def __init__(self):
        self.calls = []

    def __call__(self, token, ip):
        self.calls.append((token, ip))
        return token == "pass"


def sketch(n=2):
    return {
        "strokes": [{"points": [[120 + i * 10, 100], [300.123, 200.987], [400, 260]], "width": 2.4, "color": 0x555555} for i in range(n)],
        "stamps": [{"kind": "church", "x": 300, "y": 200, "color": 0x555555}],
        "labels": [{"text": "Hartley Farm", "x": 310, "y": 190}],
    }


def upload_body(player="player-aaaaaaaaaaaaaaaa", **kw):
    body = {
        "mission": "m1_parcel", "region": "fenwick", "seed": 1234, "gameVersion": "1",
        "timeMs": 754000, "km": 7.42, "tows": 1, "nickname": "Dusty", "sketch": sketch(),
        "player": player, "turnstileToken": "pass",
    }
    body.update(kw)
    return body


@pytest.fixture
def dist(tmp_path):
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>game</title>")
    (d / "three.html").write_text("<!doctype html><title>three</title>")
    (d / "sounds.html").write_text("<!doctype html><title>sounds</title>")
    (d / "assets" / "main-abc123.js").write_text("console.log(1);" * 100)
    (d / "og.jpg").write_bytes(b"\xff\xd8jpeg")
    return d


@pytest.fixture
def settings(dist):
    return Settings(storage="memory", dist_dir=dist, admin_token="admin-secret-token", uploads_per_hour=5)


@pytest.fixture
def storage():
    return MemoryStorage()


@pytest.fixture
def verifier():
    return FakeVerifier()


@pytest.fixture
def client(settings, storage, verifier):
    return TestClient(create_app(settings, storage, verifier))
