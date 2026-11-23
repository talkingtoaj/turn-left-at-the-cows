"""Seed maps: the admin loader behind tools/seed-maps.mjs."""

from conftest import sketch, upload_body

ADMIN = {"Authorization": "Bearer admin-secret-token"}
P1 = "player-aaaaaaaaaaaaaaaa"


def seed(key="m1_parcel-00", **kw):
    item = {
        "key": key, "mission": key.split("-")[0], "region": "fenwick", "seed": None,
        "timeMs": 900000, "km": 12.3, "tows": 1, "nickname": "Gravel Gus", "votes": 2,
        "created": "2026-11-20T10:00:00Z", "sketch": sketch(),
    }
    item.update(kw)
    return item


def test_seed_needs_the_admin_token(client):
    assert client.post("/api/admin/seed", json={"maps": [seed()]}).status_code == 401
    r = client.post("/api/admin/seed", json={"maps": [seed()]}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 0


def test_seed_loads_once_and_shows_on_the_wall(client):
    body = {"maps": [seed("m1_parcel-00"), seed("m1_parcel-01", nickname="Tilly", votes=0), seed("m2_cabin-00")]}
    r = client.post("/api/admin/seed", json=body, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert sorted(r.json()["added"]) == ["seed-m1_parcel-00", "seed-m1_parcel-01", "seed-m2_cabin-00"]
    again = client.post("/api/admin/seed", json=body, headers=ADMIN).json()
    assert again["added"] == [] and len(again["skipped"]) == 3

    listed = client.get("/api/maps", params={"mission": "m1_parcel", "player": P1}).json()
    assert listed["total"] == 2
    top = listed["maps"][0]
    assert top["id"] == "seed-m1_parcel-00" and top["votes"] == 2 and top["nickname"] == "Gravel Gus"
    assert top["mine"] is False and top["voted"] is False
    assert top["created"] == "2026-11-20T10:00:00Z"
    assert "owner" not in top and "voters" not in top and "seeded" not in top


def test_votes_on_seed_maps_count_one_per_player(client):
    client.post("/api/admin/seed", json={"maps": [seed(votes=3)]}, headers=ADMIN)
    path = "/api/maps/m1_parcel/seed-m1_parcel-00/vote"
    assert client.post(path, json={"player": P1}).json() == {"votes": 4, "voted": True}
    assert client.post(path, json={"player": P1}).json()["votes"] == 4
    assert client.request("DELETE", path, json={"player": P1}).json()["votes"] == 3


def test_seed_is_checked_like_an_upload(client):
    bad = [
        seed(key="Bad Key"),
        seed(key="m2_cabin-00", mission="m1_parcel"),  # key from another mission
        seed(votes=999),
        seed(votes=True),
        seed(nickname="fuck"),
        seed(sketch={"strokes": [], "stamps": [], "labels": []}),
        seed(mission="../etc"),
    ]
    for item in bad:
        r = client.post("/api/admin/seed", json={"maps": [seed("m1_parcel-05"), item]}, headers=ADMIN)
        assert r.status_code in (400, 413), (item, r.text)
    # Nothing from a rejected batch is stored.
    assert client.get("/api/maps", params={"mission": "m1_parcel"}).json()["total"] == 0
    assert client.post("/api/admin/seed", json={"maps": []}, headers=ADMIN).status_code == 400
    assert client.post("/api/admin/seed", json={"maps": [seed()] * 301}, headers=ADMIN).status_code == 400


def test_bad_created_falls_back_to_now(client):
    client.post("/api/admin/seed", json={"maps": [seed(created="yesterday")]}, headers=ADMIN)
    m = client.get("/api/maps", params={"mission": "m1_parcel"}).json()["maps"][0]
    assert m["created"].startswith("20") and m["created"].endswith("Z")


def test_player_maps_and_seed_maps_side_by_side(client):
    client.post("/api/admin/seed", json={"maps": [seed()]}, headers=ADMIN)
    r = client.post("/api/maps", json=upload_body(player=P1))
    assert r.status_code == 201
    maps = client.get("/api/maps", params={"mission": "m1_parcel", "player": P1}).json()["maps"]
    assert [m["mine"] for m in sorted(maps, key=lambda m: m["id"].startswith("seed"))] == [True, False]
