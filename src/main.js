/**
 * main.js — Electron shell
 *
 * Responsibilities:
 *   • Window lifecycle
 *   • System tray (icon, tooltip ticker, context menu)
 *   • Idle detection  (powerMonitor)
 *   • Long-run alert  (2 h)
 *   • Auto-start      (Windows registry via loginItemSettings)
 *   • Native notifications  (budget alerts)
 *   • CSV export dialog
 *
 * All data (customers, projects, entries, tasks, settings) now lives in
 * Firebase Firestore.  The renderer manages Firestore directly.
 * main.js only keeps a lightweight mirror of the active timer and tray
 * state, pushed to it by the renderer via IPC.
 */

const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, dialog, powerMonitor, Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec }        = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── Auto-updater ─────────────────────────────────────────────────────────────
// Fetch latest.yml from GitHub Pages (CDN, no rate limits, no auth).
// The installer download URL inside latest.yml points to GitHub Releases,
// so the .exe comes from there. Do NOT remove setFeedURL — without it,
// electron-updater hits the GitHub API which rate-limits and 404s.
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://waterhousea-programming.github.io/timetracker/updates',
});
autoUpdater.autoDownload         = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(msg) {
  if (mainWindow) mainWindow.webContents.send('update-status', msg);
}

// Strips HTML tags and trims an error message to something readable
function cleanErr(e) {
  const raw = (e && e.message) ? e.message : String(e);
  const code = raw.match(/\b([45]\d{2})\b/)?.[1];
  const clean = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (code === '502' || code === '503' || code === '504')
    return `GitHub is temporarily unavailable (${code}) — try again in a moment.`;
  if (code === '404') return 'Update file not found on GitHub (404).';
  if (code === '401' || code === '403') return 'GitHub access denied — check your network/proxy.';
  return clean || 'Unknown error';
}

function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateStatus('Update checks only run in the installed app, not during development.');
    return;
  }
  autoUpdater.checkForUpdates().catch(e => sendUpdateStatus('Could not reach update server: ' + cleanErr(e)));
}

autoUpdater.on('checking-for-update',  () => sendUpdateStatus('Checking for updates…'));
autoUpdater.on('update-not-available', () => sendUpdateStatus('You\'re on the latest version.'));
autoUpdater.on('update-available',     () => sendUpdateStatus('Update found — downloading…'));
autoUpdater.on('download-progress',   p  => sendUpdateStatus(`Downloading… ${Math.round(p.percent)}%`));
autoUpdater.on('error',               e  => sendUpdateStatus(`Update error: ${cleanErr(e)}`));

autoUpdater.on('update-downloaded', () => {
  sendUpdateStatus('Update ready to install.');
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: 'A new version of TimeTracker has been downloaded.',
    detail: 'It will be installed the next time you quit the app.',
    buttons: ['Install now', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall(false, true); }
  });
});

ipcMain.handle('check-for-updates', () => { checkForUpdates(); });

// ─── Local-only state (active timers mirror + tray cache) ─────────────────────
// Written by renderer via 'timer-state-update' IPC whenever timers change.
let activeTimers = [];    // [{ key, customerName, projectName, category, startTime, ... }]
let trayCacheCustomers = []; // [{ name, projects: [{id,name}] }] for Switch menu

// ─── Settings (auto-start is the only OS-level setting) ───────────────────────
const SETTINGS_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'TimeTracker', 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

// ─── Migration helper — read old data.json if it exists ──────────────────────
const LEGACY_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'TimeTracker', 'data.json');
function getLegacyData() {
  try {
    if (!fs.existsSync(LEGACY_FILE)) return null;
    return JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
  } catch { return null; }
}
function markLegacyMigrated() {
  try {
    fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.migrated');
  } catch {}
}

// ─── Tray icons ───────────────────────────────────────────────────────────────
const TRAY_ICON_PATH = path.join(__dirname, 'tray-icon.ico');

function makeTrayIcon(active) {
  const img = nativeImage.createFromPath(TRAY_ICON_PATH).resize({ width: 16, height: 16 });
  // Tint the icon green when a timer is active using a small canvas overlay
  if (active) img.setTemplateImage(false);
  return img;
}

// ─── App globals ──────────────────────────────────────────────────────────────
let mainWindow        = null;
let tray              = null;
let idleDialogOpen    = false;
let longRunDialogOpen = false;
let isQuitting        = false; // set true before any intentional quit so the close handler doesn't block it

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    width: 960, height: 680,
    minWidth: 720, minHeight: 520,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    checkForUpdates();
    // Show the window unless this is a boot launch via auto-start (login item)
    if (!app.getLoginItemSettings().wasOpenedAtLogin) mainWindow.show();
  });
  mainWindow.on('close', e => { if (isQuitting) return; e.preventDefault(); mainWindow.hide(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const hasTimers = activeTimers.length > 0;
  const switchItems = buildSwitchItems();
  const items = [];

  if (hasTimers) {
    // Individual stop items for each running timer
    for (const t of activeTimers) {
      const key = t.key;
      items.push({
        label: `⏹  Stop  (${t.customerName} › ${t.projectName})`,
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-stop-timer', key);
          else { activeTimers = activeTimers.filter(x => x.key !== key); updateTrayTicker(); }
        },
      });
    }
    if (activeTimers.length > 1) {
      items.push({
        label: '⏹  Stop All Timers',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('tray-stop-all-timers');
          else { activeTimers = []; updateTrayTicker(); }
        },
      });
    }
  } else {
    items.push({
      label: '▶  Start Timer',
      click: () => createWindow(),
    });
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'Switch Project',
    submenu: switchItems.length
      ? switchItems
      : [{ label: 'No projects yet', enabled: false }],
  });
  items.push({ type: 'separator' });
  items.push({ label: getTodayLabel(), enabled: false });
  items.push({ type: 'separator' });
  items.push({ label: 'Open Window', click: () => createWindow() });
  items.push({ type: 'separator' });
  items.push({
    label: 'Quit',
    click: () => {
      if (hasTimers && mainWindow) mainWindow.webContents.send('tray-stop-all-timers');
      setTimeout(() => app.exit(0), 400);
    },
  });

  return Menu.buildFromTemplate(items);
}

function buildSwitchItems() {
  const items = [];
  for (const c of trayCacheCustomers) {
    for (const p of (c.projects || [])) {
      const key = `${c.id}:${p.id}`;
      const existing = activeTimers.find(t => t.key === key);
      const isActive = !!existing;
      items.push({
        label: `${c.name} › ${p.name}${isActive ? ' ✓' : ''}`,
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('tray-start-timer', {
              customerId: c.id, customerName: c.name,
              projectId: p.id,  projectName:  p.name,
              category: existing?.category || activeTimers[0]?.category || 'Coding',
            });
          } else {
            createWindow();
          }
        },
      });
    }
  }
  return items;
}

function getTodayLabel() {
  if (!activeTimers.length) return '📊  Today: no active timer';
  if (activeTimers.length === 1) {
    const t = activeTimers[0];
    const secs = Math.floor((Date.now() - t.startTime) / 1000);
    return `📊  ${t.customerName} › ${t.projectName} — ${fmtDur(secs)}`;
  }
  // Multiple timers: show total elapsed
  const totalSecs = activeTimers.reduce((sum, t) => sum + Math.floor((Date.now() - t.startTime) / 1000), 0);
  return `📊  ${activeTimers.length} timers running — ${fmtDur(totalSecs)} total`;
}

function updateTrayTicker() {
  if (!tray) return;
  if (activeTimers.length > 0) {
    if (activeTimers.length === 1) {
      const t = activeTimers[0];
      const secs = Math.floor((Date.now() - t.startTime) / 1000);
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
      tray.setToolTip(`⏱ ${h > 0 ? `${h}h ${m}m` : `${m}m`} — ${t.customerName} › ${t.projectName}`);
    } else {
      const totalSecs = activeTimers.reduce((sum, t) => sum + Math.floor((Date.now() - t.startTime) / 1000), 0);
      tray.setToolTip(`⏱ ${activeTimers.length} timers — ${fmtDur(totalSecs)} total`);
    }
    tray.setImage(makeTrayIcon(true));
  } else {
    tray.setToolTip('TimeTracker — idle');
    tray.setImage(makeTrayIcon(false));
  }
  // Menu is built on-demand in the right-click handler — not here — to avoid
  // blocking the UI thread every minute with Menu.buildFromTemplate.
}

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ─── Claude activity detection ───────────────────────────────────────────────
// Checks once per minute whether claude.exe is running.  After 5 consecutive
// minutes with Claude open and no timer running, shows a capture prompt.
let _claudeMins         = 0;
let _claudeSnoozedUntil = 0;
let _lastTimerStopTime  = 0; // set in timer-state-update handler below

function checkClaudeActivity() {
  // Don't prompt if a timer is already running
  if (activeTimers.length > 0) { _claudeMins = 0; return; }
  // Don't prompt within 30 minutes of a timer stopping (user just finished work)
  if (Date.now() - _lastTimerStopTime < 30 * 60_000) { _claudeMins = 0; return; }

  exec('tasklist /FI "IMAGENAME eq claude.exe" /NH /FO CSV 2>nul', (err, out) => {
    // Re-check both conditions after the async exec gap
    if (activeTimers.length > 0) { _claudeMins = 0; return; }
    if (Date.now() - _lastTimerStopTime < 30 * 60_000) { _claudeMins = 0; return; }
    if (err || !out.toLowerCase().includes('claude.exe')) { _claudeMins = 0; return; }
    _claudeMins++;
    if (_claudeMins >= 5 && Date.now() > _claudeSnoozedUntil) {
      if (activeTimers.length > 0) { _claudeMins = 0; return; } // one final guard
      _claudeMins         = 0;
      _claudeSnoozedUntil = Date.now() + 30 * 60_000; // snooze 30 min
      promptClaudeTime();
    }
  });
}

function promptClaudeTime() {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: 'Logging Claude time?',
    body:  'Claude has been open for 5+ minutes — click to log it.',
    silent: false,
  });
  n.on('click', () => {
    createWindow();
    // Give the window 600 ms to finish loading before sending the IPC message
    setTimeout(() => mainWindow?.webContents.send('prompt-time-capture', { app: 'Claude' }), 600);
  });
  n.show();
}

// ─── Idle detection ───────────────────────────────────────────────────────────
const IDLE_THRESHOLD = 10 * 60;

function checkIdle() {
  if (!activeTimers.length || idleDialogOpen || !mainWindow) return;
  let idleSecs;
  try { idleSecs = powerMonitor.getSystemIdleTime(); } catch { return; }
  if (idleSecs < IDLE_THRESHOLD) return;

  idleDialogOpen = true;
  const mins = Math.floor(idleSecs / 60);
  const timerDesc = activeTimers.length === 1
    ? `"${activeTimers[0].customerName} › ${activeTimers[0].projectName}"`
    : `${activeTimers.length} running timers`;

  dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: "You've been idle",
    message: `Away for ${mins} minutes`,
    detail: `Still tracking ${timerDesc}?`,
    buttons: ['Keep all time', `Trim idle (−${mins}m)`, 'Stop & discard'],
    defaultId: 1, cancelId: 0,
  }).then(({ response }) => {
    idleDialogOpen = false;
    if (response === 0) return;
    const payload = response === 1 ? { action: 'trim', trimSeconds: idleSecs } : { action: 'discard' };
    if (mainWindow) mainWindow.webContents.send('idle-action', payload);
  });
}

// ─── Long-run check ───────────────────────────────────────────────────────────
const LONG_RUN_MS = 2 * 60 * 60 * 1000;

function checkLongRunning() {
  if (!activeTimers.length || longRunDialogOpen || !mainWindow) return;

  // Find the first timer that has been running long and hasn't been alerted yet
  const t = activeTimers.find(t => !t._longRunAlerted && Date.now() - t.startTime >= LONG_RUN_MS);
  if (!t) return;

  t._longRunAlerted = true;
  longRunDialogOpen = true;
  const hrs = ((Date.now() - t.startTime) / 3_600_000).toFixed(1);

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Still going?',
    message: `Timer running for ${hrs} hours`,
    detail: `"${t.customerName} › ${t.projectName}" — still working?`,
    buttons: ['Yes, keep running', 'Stop & save', 'Stop & discard'],
    defaultId: 0, cancelId: 0,
  }).then(({ response }) => {
    longRunDialogOpen = false;
    if (response === 0) return;
    const payload = response === 1 ? { action: 'stop', key: t.key } : { action: 'discard', key: t.key };
    if (mainWindow) mainWindow.webContents.send('idle-action', payload);
  });
}

// ─── Auto-start ───────────────────────────────────────────────────────────────
function getAutoStart() { return app.getLoginItemSettings().openAtLogin; }
function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on });
  const s = loadSettings(); s.autoStart = on; saveSettings(s);
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

// Renderer pushes timer state here whenever it changes
// state is an array of active timer objects (empty array = no timers)
ipcMain.on('timer-state-update', (_, state) => {
  const wasRunning = activeTimers.length > 0;
  activeTimers = state || [];
  if (wasRunning && activeTimers.length === 0) _lastTimerStopTime = Date.now();
  updateTrayTicker();
});

// Renderer pushes customer/project list for the Switch submenu
ipcMain.on('tray-cache-update', (_, customers) => {
  trayCacheCustomers = customers || [];
  updateTrayTicker();
});

// Renderer asks for legacy data to migrate
ipcMain.handle('get-legacy-data', () => getLegacyData());
ipcMain.handle('mark-legacy-migrated', () => { markLegacyMigrated(); return true; });

// Auto-start
ipcMain.handle('get-auto-start', () => getAutoStart());
ipcMain.handle('set-auto-start', (_, on) => { setAutoStart(on); return getAutoStart(); });

// Firebase config — persisted in AppData so it survives reinstalls
ipcMain.handle('get-fb-config', () => { const s = loadSettings(); return s.fbConfig || null; });
ipcMain.handle('save-fb-config', (_, cfg) => { const s = loadSettings(); s.fbConfig = cfg; saveSettings(s); });

// Native budget notification (fired by renderer after Firestore write)
ipcMain.on('send-notification', (_, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

// CSV export (needs native dialog + fs access)
ipcMain.handle('export-csv', async (_, rows) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export time log',
    defaultPath: `timetracker-export-${new Date().toISOString().slice(0,10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, rows.join('\n'));
  return true;
});

// Window controls
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-close',    () => mainWindow?.hide());

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId('com.timetracker.app');

  tray = new Tray(makeTrayIcon(false));
  tray.on('click',       () => createWindow());
  tray.on('double-click',() => createWindow());
  // Build the menu only when the user actually right-clicks — avoids the
  // UI-thread stutter that happened when rebuilding on a 60s timer.
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));

  setInterval(updateTrayTicker,    60_000);
  setInterval(checkIdle,           30_000);
  setInterval(checkLongRunning,  5 * 60_000);
  setInterval(checkClaudeActivity, 60_000);

  createWindow();
});

app.on('window-all-closed', e => e.preventDefault());
