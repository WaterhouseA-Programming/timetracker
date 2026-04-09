const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Timer state mirror (renderer → main, for tray) ──────────────────────
  timerStateUpdate: (state)    => ipcRenderer.send('timer-state-update', state),
  trayCacheUpdate:  (customers)=> ipcRenderer.send('tray-cache-update', customers),

  // ── Migration ────────────────────────────────────────────────────────────
  getLegacyData:       ()      => ipcRenderer.invoke('get-legacy-data'),
  markLegacyMigrated:  ()      => ipcRenderer.invoke('mark-legacy-migrated'),

  // ── System ───────────────────────────────────────────────────────────────
  getAutoStart:  ()            => ipcRenderer.invoke('get-auto-start'),
  setAutoStart:  (on)          => ipcRenderer.invoke('set-auto-start', on),

  // ── Notifications ─────────────────────────────────────────────────────────
  sendNotification: (payload)  => ipcRenderer.send('send-notification', payload),

  // ── CSV export ────────────────────────────────────────────────────────────
  exportCsv: (rows)            => ipcRenderer.invoke('export-csv', rows),

  // ── Window controls ───────────────────────────────────────────────────────
  minimize: ()                 => ipcRenderer.invoke('window-minimize'),
  close:    ()                 => ipcRenderer.invoke('window-close'),

  // ── Firebase config persistence (survives reinstalls) ────────────────────
  getFbConfig:  ()             => ipcRenderer.invoke('get-fb-config'),
  saveFbConfig: (cfg)          => ipcRenderer.invoke('save-fb-config', cfg),

  // ── Updates ───────────────────────────────────────────────────────────────
  checkForUpdates: ()          => ipcRenderer.invoke('check-for-updates'),

  // ── Main → renderer events ────────────────────────────────────────────────
  onTrayStopTimer:    (cb) => ipcRenderer.on('tray-stop-timer',    ()      => cb()),
  onTrayStartTimer:   (cb) => ipcRenderer.on('tray-start-timer',   (_, p)  => cb(p)),
  onIdleAction:       (cb) => ipcRenderer.on('idle-action',        (_, p)  => cb(p)),
  onUpdateStatus:     (cb) => ipcRenderer.on('update-status',      (_, msg)=> cb(msg)),
});
