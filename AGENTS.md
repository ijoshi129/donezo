# Repository Guidelines

## Project Structure & Module Organization

Donezo is a personal task-manager PWA: a React frontend (in `web/`) served by a
small, dependency-free Node HTTP backend (`server.js`). It is solely a task
app — there is no Apple Reminders sync and no push/notification feature.

- `server.js`: Node backend. Serves the built frontend from `web/dist` (falls
  back to repo root if absent) and the JSON API under `/api` — `tasks`,
  `settings`, `images`, and `tasks/reorder`.
- `web/`: the React app.
  - `web/src/`: components, `api.ts` (typed API client), `lib/` (date, image,
    theme helpers), `types.ts`.
  - `web/public/icons/`: app icons (Graphite + Acid mark).
  - `web/vite.config.ts`: Vite + Tailwind v4 + PWA config; dev-proxies `/api`
    to the backend.
  - `web/dist/`: production build output (generated; what the backend serves).
- `data/tasks.json`, `data/images/`: server-side task store. Mount as
  persistent storage in deployment.
- `Dockerfile`, `compose.yaml`: multi-stage container build (builds `web/`,
  then serves `dist` via `server.js`).

There is no formal test directory yet. Add tests under `web/` (or `tests/`) if
coverage is introduced.

## Tech Stack

Vite + React 19 + TypeScript + Tailwind v4, with TanStack Query (server state,
optimistic updates), Radix Dialog (modals), Motion + @use-gesture/react (swipe),
@dnd-kit (drag-to-reorder), and vite-plugin-pwa (offline + installable).

## Build, Test, and Development Commands

- `node server.js`: run the backend on `http://127.0.0.1:4173/` (serves
  `web/dist` + the API).
- `cd web && npm install`: install frontend dependencies.
- `cd web && npm run dev`: Vite dev server on `:5180`, proxying `/api` to the
  backend (run `node server.js` alongside it).
- `cd web && npm run build`: type-check and build to `web/dist`. After a
  frontend change this is all that's needed — the backend serves `dist` live.
- `cd web && npx tsc --noEmit`: type-check without building.
- `node --check server.js`: syntax-check the backend.
- `docker compose up -d --build`: build and deploy the container.

## Coding Style & Naming Conventions

- Frontend: TypeScript + React function components, two-space indent. Tailwind
  utility classes; reusable design tokens live in `web/src/index.css`
  (`--ink`, `--acid`, `--paper`, …) exposed to Tailwind via `@theme`.
- Backend: plain Node, no dependencies. `const` by default, `let` only when
  reassigned. Descriptive function names; keep comments sparse.
- Design system is "Graphite + Acid": warm ink monochrome + one citron accent,
  Bricolage Grotesque (display) + Geist Mono (labels/dates).

## Testing Guidelines

No automated test framework is configured. At minimum, run:

```bash
cd web && npm run build      # type-check + build
node --check server.js
```

For behavior changes, manually verify add, complete, uncomplete, delete, edit,
swipe-to-complete/delete, drag-to-reorder, search, image attach + lightbox,
settings, and API persistence through `/api/tasks`.

## Commit & Pull Request Guidelines

Use concise, imperative commit messages (e.g. `Add drag-to-reorder`, `Remove
Apple Reminders sync`). Pull requests should include a short summary, manual
test steps, and screenshots or recordings for UI changes, plus notes about
deployment or data-persistence changes.

## Security & Configuration Tips

`data/tasks.json` is shared server state — do not commit real user data. In
Docker, persist `/app/data` with a named volume. The backend has no
authentication; deploy behind trusted network controls (e.g. the current
Tailscale-only setup) unless user accounts are added.
