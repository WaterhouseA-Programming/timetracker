# ⏱ TimeTracker

A lightweight Windows desktop app for tracking time against customers and projects.

---

## Features

- **Two-level hierarchy**: Customers → Projects
- **System tray icon** with right-click menu (Start/Stop, Switch Project, Today's Totals, Open Window)
- **Live elapsed timer** in the main window
- **Time log** with filtering by customer and date range
- **Summary stats**: total time, today's time, entry count
- **CSV export**
- Data stored as JSON in `%APPDATA%\TimeTracker\data.json`

---

## Quick Start (Run from source)

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Run the app
npm start
```

The app will open and a system tray icon will appear in your taskbar.

---

## Build a portable Windows EXE

```bash
npm run dist
```

The built `.exe` will be in the `dist/` folder. No installer needed — just double-click to run.

---

## Usage

### First time
1. Go to **Manage** tab → click **+ Customer** to add a customer
2. Click **+ Project** next to a customer to add projects
3. Go to **Timer** tab → click **▶ Start** next to any project

### System Tray
- **Right-click** the tray icon to:
  - Start/Stop the current timer
  - Switch to a different project
  - See today's totals
  - Open the main window
- **Double-click** to open the main window

### Time Log
- View all entries in the **Time Log** tab
- Filter by customer or date range
- Export to CSV for invoicing

---

## Data location

`C:\Users\<YourName>\AppData\Roaming\TimeTracker\data.json`
