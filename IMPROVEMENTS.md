# Donezo — Improvements Log

A running log of changes made on top of the original app by
[KiranTheRam/donezo](https://github.com/KiranTheRam/donezo). Fork lives at
[ijoshi129/donezo](https://github.com/ijoshi129/donezo), branch `improvements`.

Everything here respects the original philosophy: **zero external dependencies**,
vanilla JS/HTML/CSS frontend, native-Node backend, mobile-first.

## Goals (chosen scope)

1. **Safety & polish** — guard against accidental data loss, soften surprising behavior.
2. **Performance / storage** — stop shipping megabytes of base64 images on every fetch.
3. **True offline PWA** — make add/complete/delete work offline and sync when back.
4. **New features** — due dates, tags, reordering, recurring tasks.

## Design principles kept

- No npm packages, no build step. Still `node server.js` to run.
- Backwards compatible data: existing `tasks.json` keeps working (fields are additive).
- Optimistic UI with rollback, the pattern the original already used.

---

## Changelog

<!-- newest first; each entry: what changed, why, files touched -->

### Image attachments stored as files, not base64 in JSON (Performance/storage)

**What:** Attached images are now written to `data/images/<uuid>.<ext>` and the task only
stores a small reference URL (`/api/images/<uuid>.<ext>`), served by a new `GET /api/images/:file`
route with long-lived immutable caching. Previously every image lived as a base64 blob inside
`tasks.json`.

**Why:** Base64 images were embedded in `tasks.json` and re-sent **in full on every
`GET /api/tasks`** — which fires on tab focus and at noon. A few photos meant shipping
megabytes per poll and bloating the single JSON file (and holding it all in memory). Now each
task list response carries tiny URLs; the browser caches the actual images and only fetches
each once.

**Details:**
- Upload contract unchanged for the client: it still POSTs/PATCHes a resized `data:` URL.
  The server decodes it, writes the file, and returns the reference URL. The frontend needed
  **zero changes** — a URL works as an `<img src>` just like a data URL did.
- Replacing an image swaps the file and deletes the old one; clearing an image or deleting a
  task removes the file; the noon cleanup removes images of cleared tasks. No orphan files.
- **Automatic migration:** on startup any old inline base64 images are converted to files and
  the field rewritten — so your friend's existing `tasks.json` upgrades itself with no data loss.
- Path-traversal guarded (`path.basename` + prefix check) on the image route.

**Files:** `server.js` (image persistence, serving, migration, cleanup hooks).

### Settings panel + opt-out for the noon auto-clear (Polish)

**What:** Added a gear icon in the top bar that opens a **Settings** dialog. First setting:
a switch for **"Clear completed at noon"** (on by default — same behavior as before).
Turn it off and completed tasks stick around.

**Why:** The original silently deleted *all* completed tasks at 12:00 every day with no UI
hinting it would happen and no way to stop it. That's a surprising, unrecoverable behavior.
This keeps the friend's intended default but makes it discoverable and reversible. The gear
also gives us a home for future options.

**Details:**
- New backend `store.settings` with `GET`/`PATCH /api/settings`. The noon cleanup (both the
  scheduled job and the on-request check) now no-ops when `autoClearNoon` is false.
- Backward compatible: old `tasks.json` files get defaults merged in on load; the key is
  written on next save.
- Optimistic toggle with rollback if the request fails.
- Custom CSS switch styled to match the glassmorphic theme.

**Files:** `server.js` (settings store + endpoint + cleanup gate), `app.js` (load/update +
modal wiring), `index.html` (gear button + settings dialog), `styles.css` (switch + row),
`sw.js` (cache bump v5 → v6).

### Undo for deletes (Safety)

**What:** Deleting a task (swipe-left or the trash button) no longer hits the server
immediately. The task slides out and a toast appears at the bottom — `Deleted "…"`
with an **Undo** button and a 5-second countdown bar. Undo restores the task instantly;
let the timer run and the delete is committed to the backend.

**Why:** Swipe-left was the only destructive action in the app and had *no* safety net —
one stray gesture permanently lost a task. This is the single highest-value safety fix.

**Details / edge cases handled:**
- If you delete a second task while one undo is pending, the first is committed first
  (no lost deletes, no stacked ambiguity).
- A server refresh (tab focus, noon) can't resurrect a task that's mid-undo —
  pending-deleted ids are filtered out of hydration.
- Backgrounding or closing the tab commits the pending delete (`visibilitychange` +
  `pagehide`) so nothing is left dangling.
- If the eventual DELETE request fails, the task is restored rather than silently lost.
- Unsaved (`pending-`) tasks are dropped locally without a server call.
- Honors `prefers-reduced-motion`.

**Files:** `app.js` (deferred delete + toast system), `styles.css` (toast UI),
`index.html` (toast region), `sw.js` (cache bump v4 → v5).
