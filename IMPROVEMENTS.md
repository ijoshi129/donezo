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
