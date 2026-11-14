# Turn Left at the Cows

A browser driving game (three.js) about finding your way with out-of-date maps, your own sketch and directions from locals. Decisions live in `SPEC.md` (section 9o is the current plan), terms in `GLOSSARY.md`, hard-to-undo choices in `docs/adr/`.

## Words in the game

Every new line of dialogue or story (locals, radio scripts, tow lines, win-screen lines, notebook lines, intro, taglines) first gets a pass with the remove-ai-style skill, then goes to the owner for review in an artifact. Only approved lines ship. See SPEC 9o.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `talkingtoaj/orienteering-game`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
