import json
import threading

from conftest import upload_body

from mapshare.maps import MapStore
from mapshare.storage import MemoryStorage

P1 = "player-aaaaaaaaaaaaaaaa"
P2 = "player-bbbbbbbbbbbbbbbb"
P3 = "player-cccccccccccccccc"
P4 = "player-dddddddddddddddd"
ADMIN = {"Authorization": "Bearer admin-secret-token"}


def share(client, **kw):
    r = client.post("/api/maps", json=upload_body(**kw))
    assert r.status_code == 201, r.text
    return r.json()


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_config_gives_the_site_key(client):
    c = client.get("/api/maps/config").json()
    assert c["enabled"] is True and c["turnstileSiteKey"] and c["maxNickname"] == 24


def test_share_then_list_and_get(client, storage):
    m = share(client)
    assert m["nickname"] == "Dusty" and m["votes"] == 0 and m["mine"] is True
    assert m["sketch"]["strokes"][0]["points"][1] == [300.1, 201]
    names = [n for n, _ in storage.list("turn-left-at-the-cows/maps/m1_parcel/")]
    assert names == [f"turn-left-at-the-cows/maps/m1_parcel/{m['id']}.json"]
    stored = json.loads(storage.read(names[0])[0])
    assert stored["owner"] != P1 and "player" not in stored  # only a hash is kept

    lst = client.get("/api/maps", params={"mission": "m1_parcel", "player": P2}).json()
    assert lst["total"] == 1
    item = lst["maps"][0]
    assert item["id"] == m["id"] and item["mine"] is False and item["voted"] is False
    assert "voters" not in item and "owner" not in item and "sketch" in item
    assert client.get(f"/api/maps/m1_parcel/{m['id']}").json()["id"] == m["id"]
    assert client.get("/api/maps", params={"mission": "m2_cabin"}).json()["total"] == 0


def test_anonymous_by_default_and_nickname_rules(client):
    assert share(client, nickname="")["nickname"] == "A driver"
    assert share(client, nickname=None)["nickname"] == "A driver"
    assert share(client, nickname="  Long   name that goes on and on and on  ")["nickname"] == "Long name that goes on a"
    r = client.post("/api/maps", json=upload_body(nickname="sh1t head"))
    assert r.status_code == 400 and r.json()["error"] == "nickname"
    assert share(client, nickname="Scunthorpe Sal")["nickname"] == "Scunthorpe Sal"


def test_label_profanity_is_masked(client):
    body = upload_body()
    body["sketch"]["labels"].append({"text": "fuck this road", "x": 100, "y": 100})
    m = client.post("/api/maps", json=body).json()
    assert m["sketch"]["labels"][1]["text"] == "**** this road"


def test_captcha_required(client, verifier):
    r = client.post("/api/maps", json=upload_body(turnstileToken="nope"))
    assert r.status_code == 400 and r.json()["error"] == "captcha"
    r = client.post("/api/maps", json={k: v for k, v in upload_body().items() if k != "turnstileToken"})
    assert r.status_code == 400
    assert verifier.calls[0][0] == "nope"


def test_validation(client):
    bad = [
        upload_body(mission="../etc"),
        upload_body(player="short"),
        upload_body(sketch={"strokes": [], "stamps": [], "labels": []}),
        upload_body(sketch={"strokes": [{"points": [[1, "x"]]}]}),
        upload_body(sketch={"stamps": [{"kind": "rocket", "x": 1, "y": 1}]}),
        upload_body(sketch={"strokes": [{"points": [[1, 1]] * 3001}]}),
        upload_body(sketch={"strokes": [{"points": [[1, 1], [2, 2]], "color": "red"}]}),
        upload_body(seed="abc"),
    ]
    for body in bad:
        r = client.post("/api/maps", json=body)
        assert r.status_code in (400, 413), (body, r.text)
    r = client.post("/api/maps", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 400


def test_coordinates_are_clamped(client):
    m = share(client, sketch={"strokes": [{"points": [[-50, 9999], [1e9, 3]]}]})
    assert m["sketch"]["strokes"][0]["points"] == [[0, 640], [960, 3]]


def test_size_limit(client):
    huge = {"strokes": [{"points": [[123.4, 456.7]] * 2900} for _ in range(10)]}
    r = client.post("/api/maps", json=upload_body(sketch=huge))
    assert r.status_code == 413 and r.json()["error"] == "too_big"


def test_upload_rate_limit(client):
    for _ in range(5):
        share(client)
    r = client.post("/api/maps", json=upload_body())
    assert r.status_code == 429


def test_votes_one_per_player(client):
    m = share(client)
    url = f"/api/maps/m1_parcel/{m['id']}/vote"
    assert client.post(url, json={"player": P2}).json() == {"votes": 1, "voted": True}
    assert client.post(url, json={"player": P2}).json()["votes"] == 1  # again: no change
    assert client.post(url, json={"player": P3}).json()["votes"] == 2
    r = client.post(url, json={"player": P1})
    assert r.status_code == 400 and r.json()["error"] == "own_map"
    assert client.request("DELETE", url, json={"player": P3}).json()["votes"] == 1
    item = client.get("/api/maps", params={"mission": "m1_parcel", "player": P2}).json()["maps"][0]
    assert item["votes"] == 1 and item["voted"] is True


def test_sort_by_votes_and_newest(client):
    a = share(client, nickname="First")
    b = share(client, nickname="Second", player=P2)
    client.post(f"/api/maps/m1_parcel/{a['id']}/vote", json={"player": P3})
    by_votes = [m["id"] for m in client.get("/api/maps", params={"mission": "m1_parcel"}).json()["maps"]]
    assert by_votes[0] == a["id"]
    store_order = [m["id"] for m in client.get("/api/maps", params={"mission": "m1_parcel", "sort": "new"}).json()["maps"]]
    assert set(store_order) == {a["id"], b["id"]}


def test_reports_hide_after_three_players_and_admin_unhides(client):
    m = share(client)
    url = f"/api/maps/m1_parcel/{m['id']}/report"
    assert client.post(url, json={"player": P2}).json()["hidden"] is False
    assert client.post(url, json={"player": P2}).json()["hidden"] is False  # same player twice counts once
    assert client.post(url, json={"player": P3}).json()["hidden"] is False
    assert client.post(url, json={"player": P1}).status_code == 400  # own map
    assert client.post(url, json={"player": P4}).json()["hidden"] is True
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 0
    assert client.get(f"/api/maps/m1_parcel/{m['id']}").status_code == 404
    assert client.post(f"/api/maps/m1_parcel/{m['id']}/vote", json={"player": P2}).status_code == 404

    hidden = client.get("/api/admin/maps", params={"mission": "m1_parcel"}, headers=ADMIN).json()["maps"]
    assert [h["id"] for h in hidden] == [m["id"]]
    assert client.post(f"/api/admin/maps/m1_parcel/{m['id']}/unhide").status_code == 401
    assert client.post(f"/api/admin/maps/m1_parcel/{m['id']}/unhide", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post(f"/api/admin/maps/m1_parcel/{m['id']}/unhide", headers=ADMIN).json()["hidden"] is False
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 1
    # Reviewed by the owner: more reports no longer hide it.
    client.post(url, json={"player": "player-eeeeeeeeeeeeeeee"})
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 1


def test_admin_disabled_without_token(dist, storage, verifier):
    from fastapi.testclient import TestClient

    from mapshare.app import create_app
    from mapshare.config import Settings

    c = TestClient(create_app(Settings(storage="memory", dist_dir=dist, admin_token=""), storage, verifier))
    r = c.get("/api/admin/maps", params={"mission": "m1_parcel"}, headers={"Authorization": "Bearer "})
    assert r.status_code == 401


def test_votes_are_race_safe():
    store = MapStore(MemoryStorage(), "p/", "salt")
    from conftest import sketch

    rec = store.create({"mission": "m1_parcel", "region": "fenwick", "seed": 1, "gameVersion": "1",
                        "timeMs": 1, "km": 1, "tows": 0, "nickname": "x", "sketch": sketch()}, "owner")
    voters = [f"v{i}" for i in range(40)]
    threads = [threading.Thread(target=store.vote, args=("m1_parcel", rec["id"], v)) for v in voters]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert store.get("m1_parcel", rec["id"])["votes"] == 40


def test_list_sees_writes_from_another_instance():
    storage = MemoryStorage()
    a = MapStore(storage, "p/", "salt")
    b = MapStore(storage, "p/", "salt")
    from conftest import sketch

    rec = a.create({"mission": "m1_parcel", "region": "fenwick", "seed": 1, "gameVersion": "1",
                    "timeMs": 1, "km": 1, "tows": 0, "nickname": "x", "sketch": sketch()}, "owner")
    b.LIST_TTL_S = 0
    assert b.list("m1_parcel")[1] == 1
    a.vote("m1_parcel", rec["id"], "someone")
    assert b.list("m1_parcel")[0][0]["votes"] == 1
