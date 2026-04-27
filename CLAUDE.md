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

**Claude handles this entirely — the user never touches it.**

Steps (run in order, no user action needed):
1. Find the current version with `gh release list --limit 1` to get the latest tag
2. Increment the patch number (e.g. `1.0.31` → `1.0.32`) and update `"version"` in `package.json`
3. Commit the bump: `git commit -m "chore: bump version to X.X.XX"`
4. Push: `git push origin master`
5. Build: `npm run dist` (produces files in `dist/`)
6. Publish: `gh release create vX.X.XX "dist/TimeTracker Setup X.X.XX.exe" "dist/TimeTracker-X.X.XX-portable.exe" dist/latest.yml "dist/TimeTracker Setup X.X.XX.exe.blockmap" --title "X.X.XX" --latest`
7. Confirm assets on the release include `latest.yml` + `.exe` + `.blockmap`

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
