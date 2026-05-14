# Repository Guidelines

## Project Structure & Module Organization

Donezo is a small dependency-free PWA with a Node HTTP backend.

- `index.html`, `styles.css`, `app.js`: frontend shell, styling, and browser interaction logic.
- `server.js`: Node backend serving static files and `/api/tasks`.
- `sw.js`, `manifest.webmanifest`: PWA service worker and install metadata.
- `icons/`: SVG and PNG app icons.
- `data/tasks.json`: local server-side task store. Keep this mounted as persistent storage in deployment.
- `Dockerfile`, `compose.yaml`: container build and deployment definitions.

There is no formal test directory yet. Add tests under `tests/` if coverage is introduced.

## Build, Test, and Development Commands

- `node server.js`: run the app locally on `http://127.0.0.1:4173/`.
- `node --check app.js`: syntax-check frontend JavaScript.
- `node --check server.js`: syntax-check backend JavaScript.
- `docker build -t donezo:local .`: build a local container image.
- `docker compose config`: validate Compose configuration.
- `docker compose up -d`: deploy using `compose.yaml`.

The Compose file currently pulls `192.168.1.83:5000/donezo:latest`.

## Coding Style & Naming Conventions

Use plain JavaScript, HTML, and CSS. No bundler or package manager is required.

- Indent with two spaces.
- Use `const` by default and `let` only for reassigned values.
- Prefer descriptive function names such as `hydrateTasks`, `apiRequest`, and `wireSwipe`.
- Keep CSS class names lowercase and hyphenated, for example `.task-card` and `.is-complete`.
- Keep comments sparse and only where they clarify non-obvious behavior.

## Testing Guidelines

No automated test framework is configured. At minimum, run:

```bash
node --check app.js
node --check server.js
docker compose config
```

For behavior changes, manually verify add, complete, uncomplete, delete, swipe gestures, mobile overscroll, and API persistence through `/api/tasks`.

## Commit & Pull Request Guidelines

This workspace has no Git history, so use concise imperative commit messages:

- `Add Docker deployment config`
- `Smooth task swipe animations`
- `Persist tasks through backend API`

Pull requests should include a short summary, manual test steps, screenshots or screen recordings for UI changes, and notes about deployment or data persistence changes.

## Security & Configuration Tips

`data/tasks.json` is shared server state. Do not commit real user data. In Docker, persist `/app/data` with a named volume. The current backend has no authentication; deploy behind trusted network controls unless user accounts are added.
