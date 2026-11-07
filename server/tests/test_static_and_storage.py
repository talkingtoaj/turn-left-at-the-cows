import pytest

from mapshare.profanity import is_profane, mask
from mapshare.ratelimit import RateLimiter
from mapshare.storage import Conflict, LocalStorage, MemoryStorage


def test_pages_are_not_cached(client):
    for path in ("/", "/index.html", "/three.html", "/sounds.html"):
        r = client.get(path)
        assert r.status_code == 200 and r.headers["cache-control"] == "no-cache", path
    assert "three" in client.get("/three.html").text


def test_hashed_assets_cache_for_a_year(client):
    r = client.get("/assets/main-abc123.js")
    assert r.status_code == 200
    assert "immutable" in r.headers["cache-control"]
    assert r.headers["content-type"].startswith("text/javascript")
    r = client.get("/assets/main-abc123.js", headers={"accept-encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"


def test_other_files_and_fallbacks(client):
    assert client.get("/og.jpg").headers["cache-control"] == "public, max-age=86400"
    assert client.get("/some/page").text.startswith("<!doctype html><title>game")
    assert client.get("/missing.png").status_code == 404
    assert client.get("/api/nothing").status_code == 404
    assert client.get("/../server/pyproject.toml").status_code in (404, 200)
    assert "pyproject" not in client.get("/%2e%2e/pyproject.toml").text
    assert client.head("/").status_code == 200


def test_security_headers(client):
    assert client.get("/").headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("make", [lambda tmp: MemoryStorage(), lambda tmp: LocalStorage(tmp / "maps")])
def test_storage_compare_and_swap(tmp_path, make):
    s = make(tmp_path)
    g1 = s.write("p/a.json", b"1", if_generation_match=0)
    with pytest.raises(Conflict):
        s.write("p/a.json", b"x", if_generation_match=0)
    g2 = s.write("p/a.json", b"2", if_generation_match=g1)
    assert g2 != g1
    with pytest.raises(Conflict):
        s.write("p/a.json", b"3", if_generation_match=g1)
    assert s.read("p/a.json") == (b"2", g2)
    assert s.read("p/missing.json") is None
    assert [n for n, _ in s.list("p/")] == ["p/a.json"]
    assert s.list("q/") == []


def test_local_storage_refuses_escapes(tmp_path):
    s = LocalStorage(tmp_path / "maps")
    with pytest.raises(ValueError):
        s.write("../evil.json", b"x")


def test_profanity():
    assert is_profane("F.U.C.K") and is_profane("b1tch") and is_profane("ass")
    for ok in ("Scunthorpe", "class act", "Essex", "Grassy Knoll", "the therapist", "spicy road", "A driver"):
        assert not is_profane(ok), ok
    assert mask("turn at the shit bridge") == "turn at the **** bridge"
    assert mask("Old Mill") == "Old Mill"


def test_rate_limiter_window():
    now = [0.0]
    rl = RateLimiter(2, 10, clock=lambda: now[0])
    assert rl.allow("a") and rl.allow("a") and not rl.allow("a")
    assert rl.allow("b")
    now[0] = 11
    assert rl.allow("a")
