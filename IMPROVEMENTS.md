# Donezo — Improvements Log

A running log of changes made on top of the original app by
[KiranTheRam/donezo](https://github.com/KiranTheRam/donezo). Fork lives at
[ijoshi129/donezo](https://github.com/ijoshi129/donezo), branch `improvements`.

Everything here respects the original philosophy: **zero external dependencies**,
vanilla JS/HTML/CSS frontend, native-Node backend, mobile-first.

## Goals (chosen scope) — all delivered ✅

1. ✅ **Safety & polish** — undo-delete, opt-out for the noon auto-clear.
2. ✅ **Performance / storage** — images stored as files, not base64 in `tasks.json`.
3. ✅ **True offline PWA** — add/complete/edit/delete/reorder offline, auto-sync on reconnect.
4. ✅ **New features** — due dates, tags, manual reordering, recurring tasks.

| Commit | Improvement |
| --- | --- |
| `Add undo for task deletes` | 5s undo toast before deletes commit |
| `Add settings panel…` | gear menu + opt-out for the noon auto-clear |
| `Store image attachments as files…` | images on disk + URL, auto-migration |
| `Add optional due dates…` | due dates with overdue/today/soon chips |
| `Add tags with chip editor…` | tags + tap-to-filter |
| `Add manual reordering…` | long-press drag to reorder |
| `Add recurring tasks…` | daily/weekly/monthly auto-respawn |
| `Add true offline support…` | offline reads + write outbox with replay |

Every change keeps the zero-dependency, vanilla-JS philosophy. Run with `node server.js`.

## Design principles kept

- No npm packages, no build step. Still `node server.js` to run.
- Backwards compatible data: existing `tasks.json` keeps working (fields are additive).
- Optimistic UI with rollback, the pattern the original already used.

---

## Changelog

<!-- newest first; each entry: what changed, why, files touched -->

### UI revamp — "Daily Ledger" risograph aesthetic

**What:** A full visual redesign away from the dark glassmorphic look toward a warm, printed
**risograph / letterpress editorial** system — like a daily task ledger printed on cream stock.

**The look:**
- **Warm paper** background (`#ecdfc6`) with a real grain texture (SVG fractal-noise overlay,
  multiply blend) and a soft vignette. Light theme.
- **Ink borders + hard offset shadows** (no blur) on every card/button/chip/modal — a stamped,
  printed-sticker feel instead of glass.
- **Fluorescent vermilion** (`#df3f29`) as the hero accent (FAB, primary buttons, the "left"
  count, the progress ruler, overdue stamps, focus rings), with **riso blue** for tags, **riso
  green** for done/today, and **amber** for soon.
- **Type:** an italic **Fraunces** serif wordmark + modal titles, **Hanken Grotesk** for body,
  and **DM Mono** for all the "stamped" labels (counts, dates, tags, divider, hints).
- Signature details: the progress bar is a **printed ruler** with tick marks; due dates/repeat
  render as mono **ticket-stub stamps**; the checkbox is a square **stamp** that fills green
  with a hand-stamped ✓; the wordmark sits over a vermilion rule.
- A one-time staggered **load-in** (wordmark → summary → list) and tactile press states (buttons
  shift into their shadow). Honors `prefers-reduced-motion`.

**Why:** The brief was to get away from the generic dark-glass "AI dashboard" aesthetic and make
it distinctive. A printed-ledger direction fits a personal, tactile, swipe-first task app and is
memorable.

**Engineering:** This is a pure presentation change — every JS hook (ids, state classes like
`show-complete`/`is-lifting`/`is-removing`, the swipe-surface transform contract, `--swipe-commit-ms`)
is preserved, so all gestures/animations still work. Verified the swipe reveals, completed state,
composer, edit/settings modals, and that there are **no JS errors** and the date-picker fix still
holds. Fonts load from Google Fonts (cached by the service worker after first load; falls back to
Georgia/system if offline before caching).

**Files:** `styles.css` (complete rewrite), `index.html` (font links + theme color),
`manifest.webmanifest` (PWA colors), `sw.js` (cache bump v14 → v15).

### Bug fix: date picker not dismissing on selection

**What:** Picking a date in the composer left the native date-picker calendar hanging around
instead of closing.

**Why:** The composer's date input was visually hidden as a `1px` clipped box and the picker was
summoned with `showPicker()`. A native picker anchored to a degenerate/clipped element dismisses
unreliably across platforms.

**Fix:** Replaced it with the standard robust pattern — a **full-size, transparent** `<input
type="date">` overlaid on the calendar icon, with its `::-webkit-calendar-picker-indicator`
stretched to fill it. A tap anywhere on the icon opens the native picker *anchored to a real
48×48 box*, so selecting a date closes it natively. No more `showPicker()` hack. Verified the
overlay covers the icon, taps land on it, and selection still produces the date chip.

**Files:** `index.html` (overlay markup), `styles.css` (`.due-field`/`.due-date-overlay`,
removed dead `.visually-hidden-date`), `app.js` (dropped the `showPicker` handler), `sw.js`
(cache bump v13 → v14).

### Bug fixes: panel dismissal

**What:** The add-task composer now closes when you click outside it or press Escape, and its
draft (title / image / due date) resets on dismiss. The FAB toggles the composer open/closed.
The search bar now also closes on Escape.

**Why (the reported bug):** opening the composer (e.g. via the new calendar button) left it — and
the due-date chip — stuck on screen; clicking away did nothing. Neither the composer nor the
search bar had any outside-click/Escape dismissal.

**Note on the search bar:** it deliberately does *not* close on every outside click. It's a filter
bar — tapping a task in the results to act on it shouldn't wipe your filter and hide the box. So
search dismisses via its toggle button (which clears the filter) or Escape. Verified that
tag-tap filtering still opens search correctly and isn't immediately dismissed by the new handler.

**Files:** `app.js` (outside-click + Escape handlers, `closeComposer`/`closeSearch`, FAB toggle),
`sw.js` (cache bump v11 → v12).

**Second bug found while auditing — stuck scroll lock:** during a long-press reorder the body
gets `is-swiping` (which sets `touch-action: none` to stop the page scrolling under the drag).
If an async `render()` fired mid-drag (from the online event, tab-focus refresh, the noon
refresh, or an outbox sync resolving), it rebuilt the list and destroyed the lifted card — so
that card's `pointerup`/`pointercancel` cleanup never ran and `is-swiping` stayed on the body,
**locking page scroll until reload.** Fixed by clearing the lock inside `render()` at the point
it tears the list down (a normally-finishing gesture already cleared it before its own render,
and a mid-gesture render kills the node anyway). Verified the lock now releases and normal
reorder is unaffected. (`sw.js` cache bump v12 → v13.)

### True offline support (PWA)

**What:** The app now works with no connection. You can open it offline and see your tasks, and
**add / complete / edit / delete / reorder offline** — those changes apply instantly and are
queued, then replayed automatically the moment you're back online.

**Why:** It was already installable as a PWA, but the service worker explicitly skipped every
`/api/` call — so offline you got a blank/error screen and every change silently failed and
rolled back. That's the opposite of what a PWA promises. Now it's genuinely offline-first.

**How it works:**
- **Offline reads:** the service worker is network-first for `GET /api/tasks` (caching the last
  good response) and cache-first for `/api/images/*`. The app also mirrors the task list to
  `localStorage` on every render, so a cold start with no connection paints instantly.
- **Offline writes — an outbox:** mutations are optimistic already; when a request fails because
  you're offline, the operation is appended to a persisted `localStorage` outbox instead of
  rolling back. On `online` (and on tab focus / launch) the queue replays in order.
- **Temp-id reconciliation:** a task created offline has a temporary id. When its create finally
  syncs and the server assigns a real id, every still-queued op that referenced the temp id is
  rewritten — so an offline *create → complete → reorder* chain all lands on the right task.
  Deleting an unsynced task also drops its queued create so it never resurrects.
- While the outbox is non-empty, a background refresh won't overwrite your unsynced local state.

**Verified** with Chrome's offline emulation: went offline, added + completed tasks (server
untouched, outbox = `[create, patch]`), reconnected → the new task got a real server id, the
completion persisted, and the queue drained to empty. Cold-loading offline still rendered the
full list with no error.

**Files:** `sw.js` (network-first tasks, cache-first images, cache bump v10 → v11),
`app.js` (outbox, persistence, sync/replay, offline-aware error handling across every mutation).

### Recurring tasks (New feature)

**What:** A task can repeat **Daily / Weekly / Monthly** (set via a "Repeat" dropdown in the edit
modal). When you complete a recurring task, its next occurrence is created automatically — same
title, tags, and recurrence, with the due date advanced by one interval. Cards show a `↻ Daily`
style chip.

**Why:** Chores and routines (standups, rent, water the plants) come back on a schedule.
Auto-recreating them on completion means you never have to retype them.

**Details:**
- Spawn happens **server-side on the complete transition** (`PATCH completed:true`), so it's
  reliable regardless of client, and it's idempotent — re-PATCHing an already-complete task
  doesn't duplicate. The new occurrence is returned in the response (`{ task, spawned }`) so it
  appears instantly without waiting for a refresh.
- Due date advances from the prior due date (`06-05` daily → `06-06`); a recurring task with no
  due date just respawns fresh with no date.
- The attached image is **copied to a new file** for the new occurrence, so deleting one
  instance never removes another's image.
- Invalid recurrence values normalize to `none`; existing tasks default to non-recurring.

**Files:** `server.js` (recurrence validation, spawn-on-complete, `advanceDueDate`,
`copyImageFile`), `app.js` (modal select, card chip, spawned-task insertion on complete),
`index.html` (Repeat row + card chip), `styles.css` (styling), `sw.js` (cache bump v9 → v10).

### Manual reordering via long-press drag (New feature)

**What:** Press and hold an open task for ~0.36s to "pick it up" (it lifts with a shadow), then
drag vertically to reposition and release to drop. The new order persists.

**Why:** Newest-first is a fine default but you often want your own priority order. Reordering
is the natural way to say "this matters most."

**Why long-press instead of a drag handle:** the app is swipe-first — every card already
listens to horizontal swipes (complete/delete) and vertical drags (scroll). Adding a visible
grip would crowd the card and a plain vertical drag would fight scrolling. A short hold is an
unambiguous "pick up" signal that doesn't collide with either gesture, and it adds no new
chrome. Implemented inside the existing pointer handler so the three gestures share one stream:
- move within 6px before the hold completes → it's a swipe/scroll, reorder is cancelled;
- hold still for 360ms → reorder engages and scrolling locks;
- the existing horizontal-lock logic is untouched.

**Details:**
- New `order` field; open tasks sort by it once reordered, else fall back to newest-first
  (so brand-new tasks still appear on top even after you've reordered). Completed tasks keep
  their newest-first ordering.
- New `POST /api/tasks/reorder` assigns sequential order indices; client updates optimistically
  and re-syncs from the server response. Drop position is computed from where you release.
- Reuses the existing FLIP animation so the card glides into its new slot.

**Files:** `server.js` (`order` field, order-aware `sortTasks`, `/api/tasks/reorder`),
`app.js` (long-press detection, drag, drop-target math, persistence, matching sort),
`styles.css` (lift styling), `sw.js` (cache bump v8 → v9).

### Tags / categories (New feature)

**What:** Tasks can carry up to 8 tags. Add/remove them in the edit modal (type a tag, press
Enter or comma to turn it into a chip; backspace on the empty field removes the last; each chip
has an ✕). Tags show as `#chips` on the card, and **tapping a tag filters the list to it**
(opens search pre-filled). Search now matches tag text as well as titles.

**Why:** Once you have more than a handful of tasks, grouping by context (#work, #home,
#errands) is how you find things. Reuses the existing search bar for filtering so there's no
new navigation to learn.

**Details:**
- Server normalizes tags: lowercased, `#` stripped, trimmed, de-duplicated, max 24 chars each,
  max 8 per task. Non-array input becomes `[]`.
- Backward compatible: tasks without a `tags` field are treated as untagged.
- A tag still being typed when you hit Save is committed automatically.

**Files:** `server.js` (`normalizeTags` + POST/PATCH), `app.js` (tag editor, card chips,
tap-to-filter, search-by-tag), `index.html` (modal tag editor + card container),
`styles.css` (tag chip/editor/card styling), `sw.js` (cache bump v7 → v8).

### Due dates (New feature)

**What:** Tasks can now have an optional due date. Set it from a calendar button in the
composer (with a removable chip showing the picked date) or from a new "Due date" field in the
edit modal. Each task card shows a due chip with a smart relative label and color:

| When | Label | Color |
| --- | --- | --- |
| Past | `2d overdue` / `Yesterday` | red |
| Today | `Today` | green |
| Tomorrow / this week | `Tomorrow` / `Fri` | cyan |
| Later | `Jun 12` (+ year if not this year) | muted |

**Why:** A task manager without due dates can't tell you what's actually urgent. This is the
single most-requested capability for a todo app and makes the list scannable at a glance.

**Design notes:**
- Stored as a timezone-safe `"YYYY-MM-DD"` string (date-only, validated server-side incl.
  rejecting impossible dates like `2026-13-40`). No time-of-day to keep it simple.
- Completed tasks keep the chip but drop the urgent coloring (it's done — no longer "overdue").
- **Sort is intentionally left unchanged for now** so it composes with the upcoming manual
  reordering feature: due dates inform via color/label rather than reshuffling the list.
- Composer date button uses `showPicker()` with a focus fallback.

**Files:** `server.js` (`dueDate` validation on POST/PATCH), `app.js` (state, picker wiring,
chip rendering, relative-label helpers), `index.html` (composer button + chip, card chip,
modal field), `styles.css` (chip/field styling), `sw.js` (cache bump v6 → v7).

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
