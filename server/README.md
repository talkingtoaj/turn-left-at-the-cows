# Game server and shared maps

A small FastAPI app that serves the built game (`../dist`, from `npm run build`)
and the shared-maps API under `/api/maps`. It runs on Cloud Run as the service
`turn-left-at-the-cows` (project `lifebalance-nuxt`, region `us-central1`). A push
to `main` builds and deploys it through `../cloudbuild.yaml`.

The game works without this server: with no API (plain `npm run dev`, a static
host, offline) the share buttons are replaced by a one-line note.

## Run it locally

```bash
npm run build                      # from the repo root: makes dist/
cd server
uv run pytest                      # tests use an in-memory store, no cloud
STORAGE=local PORT=8799 uv run --frozen --no-dev python -m mapshare
# open http://localhost:8799/   (maps are saved in server/.localmaps/)
```

Without real Turnstile keys the server uses Cloudflare's always-pass test keys,
so sharing works locally. To work on the game with Vite's hot reload and the
API at the same time, run the server as above and `API_PROXY=http://localhost:8799 npm run dev`.

## Environment

| Variable | Default | What |
|---|---|---|
| `PORT` | 8080 | Port to listen on (Cloud Run sets it) |
| `STORAGE` | `gcs` on Cloud Run, else `local` | `gcs`, `local` (a folder) or `memory` |
| `MAPS_BUCKET` | `turn-left-at-the-cows-maps` | The game's own private GCS bucket |
| `MAPS_PREFIX` | `maps/` | Folder in the bucket for the maps |
| `LOCAL_MAPS_DIR` | `server/.localmaps` | Folder for `STORAGE=local` |
| `DIST_DIR` | `../dist` | The built game |
| `TURNSTILE_SITE_KEY` | Cloudflare test key | Public site key (sent to the browser) |
| `TURNSTILE_SECRET_KEY` | Cloudflare test key | Secret key (Secret Manager in production) |
| `ADMIN_TOKEN` | unset (admin off) | Bearer token for the admin endpoints |
| `VOTER_SALT` | fixed string | Salt for hashing player ids |
| `UPLOADS_PER_HOUR` | 5 | Shares per IP per hour |
| `ACTIONS_PER_HOUR` | 120 | Votes + reports per IP per hour |
| `UPLOADS_PER_HOUR_TOTAL` | 300 | Shares per hour for the whole instance (a cost cap) |
| `HIDE_AFTER_REPORTS` | 3 | Reports from different players that hide a map |
| `RECORDS_PREFIX` | `records/` | Folder in the bucket for the all-player records |
| `FINISHES_PER_HOUR` | 30 | Record submissions per IP per hour |

## API

| Method and path | What |
|---|---|
| `GET /health` | `{"ok": true}` |
| `GET /api/maps/config` | Turnstile site key and limits; the game uses it to see if sharing is up |
| `GET /api/maps?mission=m1_parcel&sort=votes\|new&offset=0&limit=12&player=ID` | A page of maps (with sketches), plus `voted` / `reported` / `mine` for that player |
| `GET /api/maps/{mission}/{id}?player=ID` | One map |
| `POST /api/maps` | Share: `{mission, region, seed, gameVersion, timeMs, km, tows, nickname, sketch, player, turnstileToken}` |
| `POST` / `DELETE /api/maps/{mission}/{id}/vote` | Thumbs-up on / off: `{player}` |
| `POST /api/maps/{mission}/{id}/report` | Report: `{player}` |
| `GET /api/records` | All-player records: `{records: {m1_parcel: {best, tourist}, ...}}`, times in ms or null |
| `POST /api/records` | A finish: `{mission, ms, tourist}`; answers that mission's `{best, tourist, new}` |
| `GET /api/admin/maps?mission=m1_parcel[&hidden_only=false]` | Admin: hidden maps |
| `POST /api/admin/maps/{mission}/{id}/unhide` (or `/hide`) | Admin |
| `POST /api/admin/seed` | Admin: load seed maps `{maps: [...]}` from `tools/seed-maps.mjs`; answers `{added, skipped}` |

Admin calls need `Authorization: Bearer $ADMIN_TOKEN`, for example:

```bash
URL=https://turn-left-at-the-cows-XXXX-uc.a.run.app
TOKEN=$(gcloud secrets versions access latest --secret=turn-left-admin-token --project=lifebalance-nuxt)
curl -s -H "Authorization: Bearer $TOKEN" "$URL/api/admin/maps?mission=m1_parcel"
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$URL/api/admin/maps/m1_parcel/MAP_ID/unhide"
```

An unhidden map is marked reviewed and later reports no longer hide it.

### Seed maps (the map wall, #82)

`tools/seed-maps.mjs` makes a few deliberately poor maps for every mission
(fixed ids `seed-<mission>-<n>`, stored with `"seeded": true` and owner
`seed`), so the map wall isn't empty on day one. Loading the same set twice
adds nothing. Try it on a local server first:

```bash
cd server && ADMIN_TOKEN=local STORAGE=local uv run python -m mapshare   # port 8080
ADMIN_TOKEN=local node tools/seed-maps.mjs --post http://127.0.0.1:8080
```

The tool only posts to localhost unless `--live` is given. Loading the live
server waits for the owner's go-ahead.

## Storage, votes and reports

One JSON object per shared map: `gs://turn-left-at-the-cows-maps/maps/<mission>/<id>.json`
holding the sketch (the game's own format: strokes, stamps, labels in 960x640
map-screen coordinates), mission, region, seed, game version, time, km, tows,
nickname, created time, vote and report counts, hidden flag, and the salted
hashes of the owner, voters and reporters (never the raw player ids).

Votes and reports rewrite the map's own object with a GCS generation
precondition (compare-and-swap; retried on a clash). One object per map means
clicks on different maps never clash, the voter list makes "one thumbs-up per
player" exact, and there is no index to keep in step. Listing a mission lists
its objects (names and generations) and reads only the ones whose generation
changed since this instance last read them; the list is cached 3 s.

## All-player records

`mapshare/records.py`. One small object per mission,
`gs://turn-left-at-the-cows-maps/records/<mission>.json`, holding only the
fastest finish (`best`) and the fastest finish where the player sent the
tourist the right way (`tourist`), each `{ms, at}`. Nothing about the player
is kept. A finish rewrites the object only when it beats a record, with the
same compare-and-swap as votes. Reads are cached 10 s per instance.

Junk checks (the client is still trusted for the time; this is not
cheat-proof): the mission must be one the game has; `ms` must be a whole
number between that mission's floor (a straight line from start to goal at
the car's top speed, see `MIN_MS`) and six hours; `tourist` must be a
boolean; 30 finishes per IP per hour. Add a line to `MIN_MS` when a mission
is added, or its finishes are refused.

## Safety

- Cloudflare Turnstile on every share (checked server side).
- Rate limits per IP: 5 shares an hour, 120 votes and reports an hour, plus 300
  shares an hour per instance in all (in memory, per instance).
- Bodies over 200 KB are refused; sketches are checked field by field (counts of
  strokes, points, stamps and labels capped, coordinates clamped, colours and
  stamp kinds checked) and rounded to 0.1 px.
- Nicknames: optional ("A driver" by default), at most 24 characters, a basic
  profanity filter refuses rude ones; rude words in map labels become stars.
- Report button on every map; 3 reports from different players hide it until
  the owner unhides it with the admin endpoint.
- Player identity is an anonymous random id kept in the browser's localStorage.

## One-time cloud setup (run by hand, once)

Nothing here holds a secret: the Turnstile keys are read from `~/.env` inside
the commands and never printed.

```bash
PROJECT=lifebalance-nuxt
REGION=us-central1
BUCKET=turn-left-at-the-cows-maps
SERVICE=turn-left-at-the-cows
RUN_SA=turn-left-at-the-cows-run@$PROJECT.iam.gserviceaccount.com
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
BUILD_SA=$PROJECT_NUMBER@cloudbuild.gserviceaccount.com   # or the SA your triggers run as

# 1. APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com --project=$PROJECT

# 2. The game's own bucket: check, then create it if missing. Private: NO allUsers grant.
#    The server reads and writes it with its own service account; nothing is public.
gcloud storage buckets describe gs://$BUCKET --project=$PROJECT \
  || gcloud storage buckets create gs://$BUCKET --project=$PROJECT \
       --location=us-central1 --uniform-bucket-level-access --public-access-prevention

# 2b. Our own art and sound (assets.txt): a second private bucket, not in git.
#     The build reads it (cloudbuild.yaml step 'assets'); the owner uploads with
#     `npm run assets:push`. Separate from the maps bucket, which holds player data.
ASSETS=turn-left-at-the-cows-assets
gcloud storage buckets describe gs://$ASSETS --project=$PROJECT \
  || gcloud storage buckets create gs://$ASSETS --project=$PROJECT \
       --location=us-central1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://$ASSETS \
  --member=serviceAccount:$BUILD_SA --role=roles/storage.objectViewer

# 3. Artifact Registry repo for the images
gcloud artifacts repositories create turn-left-at-the-cows --repository-format=docker \
  --location=$REGION --project=$PROJECT

# 4. Secrets (values read from ~/.env / generated, never echoed)
grep '^TURNSTILE_SECRET_KEY=' ~/.env | cut -d= -f2- | tr -d '"\n' \
  | gcloud secrets create turn-left-turnstile-secret --data-file=- --project=$PROJECT
openssl rand -hex 32 | tr -d '\n' \
  | gcloud secrets create turn-left-admin-token --data-file=- --project=$PROJECT

# 5. Runtime service account for Cloud Run
gcloud iam service-accounts create turn-left-at-the-cows-run --project=$PROJECT \
  --display-name="Turn Left at the Cows (Cloud Run)"
#    Read and write the maps: objectAdmin on this bucket only.
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:$RUN_SA --role=roles/storage.objectAdmin
for S in turn-left-turnstile-secret turn-left-admin-token; do
  gcloud secrets add-iam-policy-binding $S --project=$PROJECT \
    --member=serviceAccount:$RUN_SA --role=roles/secretmanager.secretAccessor
done

# 6. Let Cloud Build deploy the service as that account
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$BUILD_SA --role=roles/run.admin
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$BUILD_SA --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding $RUN_SA --project=$PROJECT \
  --member=serviceAccount:$BUILD_SA --role=roles/iam.serviceAccountUser

# 7. Push-to-main deploys run from GitHub Actions (.github/workflows/deploy.yml),
#    signed in with Workload Identity Federation; one-time setup in
#    'GitHub Actions deploy' below. The Cloud Build trigger here is the
#    alternative if the repo is ever connected to the Cloud Build GitHub app.
#    The site key is public; it is passed as a substitution.
gcloud builds triggers create github --project=$PROJECT \
  --name="turn-left-at-the-cows-deploy" \
  --repo-name="turn-left-at-the-cows" --repo-owner="talkingtoaj" \
  --branch-pattern="^main$" --build-config="cloudbuild.yaml" \
  --substitutions=_TURNSTILE_SITE_KEY="$(grep '^TURNSTILE_SITE_KEY=' ~/.env | cut -d= -f2- | tr -d '"')"
#    (Add --service-account=projects/$PROJECT/serviceAccounts/$BUILD_SA if your
#    project's triggers need an explicit build account.)

# 8. Later: the custom domain (then add the domain to the Turnstile widget's
#    hostnames in the Cloudflare dashboard, and set _SITE_URL on the trigger).
gcloud beta run domain-mappings create --service=$SERVICE --domain=YOUR.DOMAIN \
  --region=$REGION --project=$PROJECT
```

Also add the Cloud Run URL (and later the domain) to the Turnstile widget's
hostnames in the Cloudflare dashboard, or the widget will refuse to run there.

Cost: a few KB per map; storage and egress stay inside Google's free tier at
this size. Cloud Run scales to zero.


## GitHub Actions deploy (what is used)

`.github/workflows/deploy.yml` runs `cloudbuild.yaml` with `gcloud builds submit` on
every push to main. It signs in as `turn-left-at-the-cows-deploy@lifebalance-nuxt`
through the Workload Identity pool `github-pool` (provider `github`), limited to the
repo `talkingtoaj/turn-left-at-the-cows` (moved from `talkingtoaj/orienteering-game` on 15 Nov 2026); no keys are stored. The public Turnstile site
key is the repo variable `TURNSTILE_SITE_KEY`. One-time setup: create that service
account (Cloud Build editor, Service Usage consumer, object admin on
`gs://lifebalance-nuxt_cloudbuild`), the pool and provider, and give the repo
`roles/iam.workloadIdentityUser` on the account.
