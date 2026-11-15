# Turn Left at the Cows

A browser driving game (three.js) about finding your way with out-of-date maps, your own sketch and directions from locals. Decisions live in `SPEC.md` (section 9o is the current plan), terms in `GLOSSARY.md`, hard-to-undo choices in `docs/adr/`.

## Words in the game

Every new line of dialogue or story (locals, radio scripts, tow lines, win-screen lines, notebook lines, intro, taglines) first gets a pass with the remove-ai-style skill, then goes to the owner for review in an artifact. Only approved lines ship. See SPEC 9o.

The review page is https://claude.ai/artifact/ESMREZbJDS4Zv4DWrZ6XoF. Its database collection `lines` holds one doc per line, id `T<ticket>-<line id>`, with `ticket` (GitHub issue number), `ticketTitle`, `speaker`, `where`, `old`, `new`, `note`, `order` and `status`. To submit lines, write those fields with `status: "pending"` (ArtifactData batch). The owner sets `status` to `approved`, `edited` (their text is in `final`) or `rejected` (their reason is in `ownerNote`). To read back, query the collection: ship `final` when it is set, else `new`, and only for `approved` or `edited` lines. Keep a line's id in a code comment beside the line so edits can be applied later.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `talkingtoaj/turn-left-at-the-cows` (moved from the old private repo `orienteering-game` on 2026-11-15, same numbers), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
