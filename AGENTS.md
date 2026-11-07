# Turn Left at the Cows

Deploy stage: 1 (MVP Online)

`cloudbuild.yaml` builds, smoke-tests the image, pushes, deploys and smoke-tests the live URL (`scripts/smoke.sh`). The push-to-main trigger described in `server/README.md` (step 7) is not created yet. It sets `COMMIT_SHA` for the image tag, so a hand-run `gcloud builds submit` needs a `_TAG` first.

Rollback: `gcloud run revisions list --service turn-left-at-the-cows --region us-central1`, then `gcloud run services update-traffic turn-left-at-the-cows --region us-central1 --to-revisions REV=100`.
