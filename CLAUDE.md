# Timetracker — Project Notes

## Architecture

- **Desktop app**: `src/index.html` (Electron)
- **PWA**: `tasks-web/index.html` — deployed to GitHub Pages via `.github/workflows/deploy-web.yml` (triggers on changes to `tasks-web/`)
- **Shared Firestore backend**: both apps read/write the same Firebase project

## Feature parity rule

**All features must be implemented in both `src/index.html` AND `tasks-web/index.html`.**  
The only exception is **time tracking**, which is desktop-only.

When adding a new feature, always update both files and push — the deploy workflow handles the PWA automatically.

## PWA cache

The service worker cache version in `tasks-web/sw.js` must be bumped (e.g. `tt-tasks-v7` → `tt-tasks-v8`) whenever `tasks-web/index.html` changes, so users receive the update.

## Desktop builds & releases

**Releases are fully automatic — never build or publish manually.**

`.github/workflows/release.yml` fires on every push to `master` and:
1. Reads `major.minor` from `package.json` and appends the GitHub Actions run number as the patch (e.g. `1.0.47`) — **never manually bump the patch version**
2. Runs `npm run dist -- --publish always` to build and push assets to GitHub Releases
3. Rewrites `dist/latest.yml` with absolute GitHub Releases download URLs and commits it to `tasks-web/updates/` so the Pages CDN also has it

**Never run `npm run dist` or `gh release create` locally** — the CI will race you and one of you will 404.

The auto-updater uses `provider: 'github'` from `package.json`. Do NOT add `autoUpdater.setFeedURL()` back to `src/main.js`.

Just push to master. The CI does the rest.

## Firestore collections

- `customers` — name
- `projects` — name, customerId
- `tasks` — title, status, customerId, customerName, projectId, projectName, createdAt, inProgressAt
- `entries` — time log entries (desktop only)
- `ideas` — title, notes, status, createdAt
- `proposals` — title, customerId, customerName, value, notes, status, createdAt
- `settings/app` — billing settings (desktop only)
- `invoices` — (desktop only)
