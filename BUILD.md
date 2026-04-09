# Building the TimeTracker Desktop Installer

## Prerequisites

- **Node.js** v18 or later — https://nodejs.org
- **Windows** (or Windows VM) for the final `.exe` build
  - You *can* cross-compile from macOS/Linux but Windows gives the cleanest result

---

## First-time setup

```bash
# From the timetracker/ folder:
npm install
```

This installs Electron and electron-builder (~500MB, takes a minute or two).

---

## Build commands

### Installer + Portable (recommended)
```bash
npm run dist:win
```
Produces two files in `dist/`:
- `TimeTracker Setup 1.0.0.exe` — NSIS installer with Start Menu shortcut, uninstaller, optional install directory
- `TimeTracker-1.0.0-portable.exe` — single `.exe`, no installation needed, runs from anywhere

### Portable only (faster)
```bash
npm run dist:portable
```

### Run in dev mode (no build)
```bash
npm start
```

---

## Output files

After `npm run dist:win`, the `dist/` folder contains:

```
dist/
├── TimeTracker Setup 1.0.0.exe      ← Send this to users
├── TimeTracker-1.0.0-portable.exe   ← USB stick / no-install version
└── win-unpacked/                    ← Unpacked app (for testing)
```

---

## Before distributing

### 1. Update your name
In `package.json`, change:
```json
"author": { "name": "Your Name", "email": "you@example.com" },
"copyright": "Copyright © 2025 Your Name"
```

### 2. Replace the icon
The `build/icon.ico` is a generated placeholder. For a production icon:
- Create a 256×256 PNG of your logo
- Convert to `.ico` using https://convertio.co/png-ico/ or https://www.icoconverter.com
  (include sizes: 16, 24, 32, 48, 64, 128, 256)
- Replace `build/icon.ico`

### 3. Bump the version
```json
"version": "1.0.1"
```
The installer filename updates automatically.

---

## Code signing (optional but recommended)

Unsigned installers show a Windows SmartScreen warning ("Windows protected your PC").
To remove this warning you need a code signing certificate:

- **Cheap option:** Certum (~$50/yr) — https://shop.certum.eu
- **Standard option:** DigiCert, Sectigo (~$200–400/yr)

Once you have a `.pfx` certificate, add to `package.json`:
```json
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "YOUR_PASSWORD"
}
```

For now, users can click "More info → Run anyway" on the SmartScreen dialog.

---

## Auto-update (future)

When you're ready to add auto-update:

1. Add `electron-updater` to dependencies:
   ```bash
   npm install electron-updater
   ```

2. Add a publish target (e.g. GitHub Releases) to `package.json`:
   ```json
   "publish": {
     "provider": "github",
     "owner": "your-github-username",
     "repo":  "timetracker"
   }
   ```

3. In `main.js`, add:
   ```js
   const { autoUpdater } = require('electron-updater');
   app.whenReady().then(() => {
     autoUpdater.checkForUpdatesAndNotify();
   });
   ```

4. Tag a release on GitHub and upload the `.exe` + `latest.yml` from `dist/`.
   Users get a native "Update available" notification automatically.
