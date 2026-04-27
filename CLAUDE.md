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

**Always use GitHub Releases for auto-updates. Never use any other provider.**

The auto-updater uses `provider: 'github'` from `package.json` — do NOT add or restore a `autoUpdater.setFeedURL()` call in `src/main.js`. The GitHub Releases assets (`.exe`, `latest.yml`, `.blockmap`) are the sole source of truth for updates.

### How to ship a new desktop release

1. Bump `"version"` in `package.json` (e.g. `1.0.29` → `1.0.30`)
2. Commit and push the version bump
3. Build the installer: `npm run dist`
4. Publish to GitHub Releases: `gh release create v<version> dist/TimeTracker-Setup-<version>.exe dist/TimeTracker-<version>-portable.exe dist/latest.yml dist/*.blockmap --title "<version>" --latest`
5. Verify the release assets include `latest.yml` and the `.exe` — the auto-updater needs both.

The PWA deploys automatically on push; only the desktop needs a manual build + release step.

## Firestore collections

- `customers` — name
- `projects` — name, customerId
- `tasks` — title, status, customerId, customerName, projectId, projectName, createdAt, inProgressAt
- `entries` — time log entries (desktop only)
- `ideas` — title, notes, status, createdAt
- `proposals` — title, customerId, customerName, value, notes, status, createdAt
- `settings/app` — billing settings (desktop only)
- `invoices` — (desktop only)
