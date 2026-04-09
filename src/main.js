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
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── Auto-updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload         = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(msg) {
  if (mainWindow) mainWindow.webContents.send('update-status', msg);
}

function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateStatus('Update checks only run in the installed app, not during development.');
    return;
  }
  autoUpdater.checkForUpdates().catch(e => sendUpdateStatus('Could not reach update server: ' + e.message));
}

autoUpdater.on('checking-for-update',  () => sendUpdateStatus('Checking for updates…'));
autoUpdater.on('update-not-available', () => sendUpdateStatus('You\'re on the latest version.'));
autoUpdater.on('update-available',     () => sendUpdateStatus('Update found — downloading…'));
autoUpdater.on('download-progress',   p  => sendUpdateStatus(`Downloading… ${Math.round(p.percent)}%`));
autoUpdater.on('error',               e  => sendUpdateStatus(`Update error: ${e.message}`));

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
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

ipcMain.handle('check-for-updates', () => { checkForUpdates(); });

// ─── Local-only state (active timer mirror + tray cache) ──────────────────────
// Written by renderer via 'timer-state-update' IPC whenever timer starts/stops.
let activeTimer = null;   // { customerName, projectName, category, startTime }
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
  mainWindow.once('ready-to-show', () => { checkForUpdates(); }); // stays in tray until opened
  mainWindow.on('close', e => { e.preventDefault(); mainWindow.hide(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const timerLabel = activeTimer
    ? `⏹  Stop  (${activeTimer.customerName} › ${activeTimer.projectName})`
    : '▶  Start Timer';

  const switchItems = buildSwitchItems();

  return Menu.buildFromTemplate([
    {
      label: timerLabel,
      click: () => {
        if (activeTimer) {
          if (mainWindow) mainWindow.webContents.send('tray-stop-timer');
          else { activeTimer = null; updateTrayTicker(); }
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Switch Project',
      submenu: switchItems.length
        ? switchItems
        : [{ label: 'No projects yet', enabled: false }],
    },
    { type: 'separator' },
    { label: getTodayLabel(), enabled: false },
    { type: 'separator' },
    { label: 'Open Window', click: () => createWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (activeTimer && mainWindow) mainWindow.webContents.send('tray-stop-timer');
        setTimeout(() => app.exit(0), 400);
      },
    },
  ]);
}

function buildSwitchItems() {
  const items = [];
  for (const c of trayCacheCustomers) {
    for (const p of (c.projects || [])) {
      const isActive = activeTimer &&
        activeTimer.customerId === c.id &&
        activeTimer.projectId  === p.id;
      items.push({
        label: `${c.name} › ${p.name}${isActive ? ' ✓' : ''}`,
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('tray-start-timer', {
              customerId: c.id, customerName: c.name,
              projectId: p.id,  projectName:  p.name,
              category: activeTimer?.category || 'Coding',
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
  if (!activeTimer) return '📊  Today: no active timer';
  const secs = Math.floor((Date.now() - activeTimer.startTime) / 1000);
  return `📊  ${activeTimer.customerName} › ${activeTimer.projectName} — ${fmtDur(secs)}`;
}

function updateTrayTicker() {
  if (!tray) return;
  if (activeTimer) {
    const secs = Math.floor((Date.now() - activeTimer.startTime) / 1000);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    tray.setToolTip(`⏱ ${h > 0 ? `${h}h ${m}m` : `${m}m`} — ${activeTimer.customerName} › ${activeTimer.projectName}`);
    tray.setImage(makeTrayIcon(true));
  } else {
    tray.setToolTip('TimeTracker — idle');
    tray.setImage(makeTrayIcon(false));
  }
  tray.setContextMenu(buildTrayMenu());
}

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ─── Idle detection ───────────────────────────────────────────────────────────
const IDLE_THRESHOLD = 10 * 60;

function checkIdle() {
  if (!activeTimer || idleDialogOpen || !mainWindow) return;
  let idleSecs;
  try { idleSecs = powerMonitor.getSystemIdleTime(); } catch { return; }
  if (idleSecs < IDLE_THRESHOLD) return;

  idleDialogOpen = true;
  const mins = Math.floor(idleSecs / 60);
  dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: "You've been idle",
    message: `Away for ${mins} minutes`,
    detail: `Still tracking "${activeTimer.customerName} › ${activeTimer.projectName}"?`,
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
  if (!activeTimer || longRunDialogOpen || !mainWindow) return;
  if (activeTimer._longRunAlerted) return;
  if (Date.now() - activeTimer.startTime < LONG_RUN_MS) return;

  activeTimer._longRunAlerted = true;
  longRunDialogOpen = true;
  const hrs = ((Date.now() - activeTimer.startTime) / 3_600_000).toFixed(1);

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Still going?',
    message: `Timer running for ${hrs} hours`,
    detail: `"${activeTimer.customerName} › ${activeTimer.projectName}" — still working?`,
    buttons: ['Yes, keep running', 'Stop & save', 'Stop & discard'],
    defaultId: 0, cancelId: 0,
  }).then(({ response }) => {
    longRunDialogOpen = false;
    if (response === 0) return;
    const payload = response === 1 ? { action: 'stop' } : { action: 'discard' };
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
ipcMain.on('timer-state-update', (_, state) => {
  activeTimer = state; // null when stopped
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
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => createWindow());

  setInterval(updateTrayTicker, 60_000);
  setInterval(checkIdle,        30_000);
  setInterval(checkLongRunning, 5 * 60_000);

  createWindow();
});

app.on('window-all-closed', e => e.preventDefault());
