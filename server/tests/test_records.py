import json
import threading

from conftest import FakeVerifier

from mapshare.app import create_app
from mapshare.config import Settings
from mapshare.records import MAX_MS, MIN_MS, RecordStore
from mapshare.storage import MemoryStorage
from fastapi.testclient import TestClient


def finish(client, mission="m1_parcel", ms=300_000, tourist=False, status=200):
    r = client.post("/api/records", json={"mission": mission, "ms": ms, "tourist": tourist})
    assert r.status_code == status, r.text
    return r.json()


def records(client):
    r = client.get("/api/records")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    return r.json()["records"]


def test_empty_records_list_every_mission(client):
    recs = records(client)
    assert set(recs) == set(MIN_MS)
    assert recs["m1_parcel"] == {"best": None, "tourist": None}


def test_keeps_only_the_fastest_and_the_tourist_one_apart(client, storage):
    assert finish(client, ms=400_000)["new"] == ["best"]
    out = finish(client, ms=350_000, tourist=True)
    assert out["new"] == ["best", "tourist"] and out["best"] == 350_000 and out["tourist"] == 350_000
    out = finish(client, ms=300_000)  # faster, but the tourist was not helped
    assert out["new"] == ["best"] and out["tourist"] == 350_000
    assert finish(client, ms=500_000, tourist=True)["new"] == []  # slower: nothing changes
    assert finish(client, ms=320_000, tourist=True)["new"] == ["tourist"]
    client.app.state.records._cached = None
    assert records(client)["m1_parcel"] == {"best": 300_000, "tourist": 320_000}
    assert records(client)["m2_cabin"] == {"best": None, "tourist": None}
    stored = json.loads(storage.read("records/m1_parcel.json")[0])
    assert set(stored) == {"mission", "best", "tourist"}  # times only, nothing about the player
    assert set(stored["best"]) == {"ms", "at"}


def test_a_new_record_shows_on_the_next_read(client):
    records(client)  # fills the cache
    finish(client, ms=250_000)
    assert records(client)["m1_parcel"]["best"] == 250_000


def test_junk_is_refused(client):
    floor = MIN_MS["m1_parcel"]
    for body in (
        {"mission": "m9_nowhere", "ms": 300_000},
        {"mission": "../x", "ms": 300_000},
        {"mission": "m1_parcel", "ms": floor - 1},
        {"mission": "m1_parcel", "ms": 0},
        {"mission": "m1_parcel", "ms": -5},
        {"mission": "m1_parcel", "ms": MAX_MS + 1},
        {"mission": "m1_parcel", "ms": 300_000.5},
        {"mission": "m1_parcel", "ms": "300000"},
        {"mission": "m1_parcel", "ms": True},
        {"mission": "m1_parcel", "ms": 300_000, "tourist": "yes"},
        {"mission": "m1_parcel"},
        [1, 2],
    ):
        r = client.post("/api/records", json=body)
        assert r.status_code == 400, body
    assert client.post("/api/records", content=b"not json").status_code == 400
    assert records(client)["m1_parcel"] == {"best": None, "tourist": None}
    assert finish(client, ms=floor)["best"] == floor


def test_rate_limit_per_ip(dist, storage):
    s = Settings(storage="memory", dist_dir=dist, finishes_per_hour=3)
    c = TestClient(create_app(s, storage, FakeVerifier()))
    for i in range(3):
        finish(c, ms=300_000 + i)
    assert finish(c, ms=200_000, status=429)["error"] == "rate_limited"
    assert c.get("/api/records").status_code == 200  # reading is never limited


def test_records_are_race_safe():
    store = RecordStore(MemoryStorage())
    times = list(range(200_000, 260_000, 1000))

    def go(ms):
        store.submit("m2_cabin", ms, ms % 2000 == 0)

    threads = [threading.Thread(target=go, args=(ms,)) for ms in reversed(times)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert store.all()["m2_cabin"] == {"best": 200_000, "tourist": 200_000}


def test_records_do_not_show_up_as_maps(client):
    finish(client, ms=300_000)
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 0
