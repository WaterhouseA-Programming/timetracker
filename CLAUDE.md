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

## Firestore collections

- `customers` — name
- `projects` — name, customerId
- `tasks` — title, status, customerId, customerName, projectId, projectName, createdAt, inProgressAt
- `entries` — time log entries (desktop only)
- `ideas` — title, notes, status, createdAt
- `proposals` — title, customerId, customerName, value, notes, status, createdAt
- `settings/app` — billing settings (desktop only)
- `invoices` — (desktop only)
