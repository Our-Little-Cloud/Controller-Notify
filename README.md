# 🎮 Controller Notify — YouTube Live Companion

A cute, high-performance desktop companion app for Windows that quietly monitors your favorite YouTube live streamers in the background with zero Google Cloud API quota required. Pops up smooth, animated corner notifications only when a watched streamer actually goes **LIVE**.

---

## 🌟 Key Features

### 👥 Multi-Channel Watchlist & Instant Setup
- **Zero API Setup Required**: Free canonical `/live` HTML probe engine monitors as many channels as you want out of the box without needing a Google Cloud API key.
- **Google Takeout One-Click Import**: Drag & drop your YouTube `subscriptions.csv` export to import all your subscribed channels in seconds.
- **Instant Handle Addition**: Add streamers directly by `@handle` (e.g. `@VanTung` or `@tarik`), channel URL, or channel ID.

### 📋 Channels Sub-Tabs, Search & Filtering
- **Monitored Channels Sub-Tab**:
  - **`🔄 Refresh Status` Button**: Instantly sweep all watched channels for live broadcasts on demand.
  - **Instant Real-Time Search**: Search by channel title, `@handle`, channel ID, or URL.
  - **Status Filter Pills**: Quick toggle filters for `All`, `🔴 Live`, `💤 Offline`, `🔔 Enabled`, and `🔕 Muted`.
  - **One-Click Browser Launch**: Click any channel card or `🔗` link button to open the creator's YouTube page directly in your default web browser.
  - **Per-Channel Notification Muting**: Toggle `🔔` / `🔕` to enable or mute alerts per streamer.
- **Add & Import Sub-Tab**:
  - Add individual channels or bulk import subscriptions CSVs. Automatically redirects to your monitored watchlist upon import.

### ⚡ Ultra-Low RAM & Zero-GPU Performance
- **Tiny Memory Footprint**: Runs silently in the system tray using only **~35MB–45MB RAM**.
- **Lazy Window Lifecycle**: Closing the Settings window releases Chromium V8 renderer memory (`settingsWindow = null`), dropping background RAM by **~100MB+**. Recreates settings instantly (~50ms) on tray click.
- **0% Background GPU Usage**: Configured with `disable-gpu` Chromium flags for zero background GPU usage and zero laptop battery drain.
- **Persistent Connection Pooling**: Shared `keepAlive` TCP socket pool for fast, low-overhead multi-channel polling.

### 🎨 Customizable Corner Popups
- **4 Corner Positions**: Choose `bottom-right`, `bottom-left`, `top-right`, or `top-left`.
- **Smooth Physics Animations**: Eased sliding bounce-in and bounce-out animations.
- **Auto-Hide Timer**: Configurable display duration (5s – 60s).
- **Flexible Playback**: Choose to watch streams in your default web browser or in the built-in mini app player.

### 📜 Notification History Log
- Tracks the **50 most recent live streams** across all watched channels with live thumbnails, timestamps, and clicked indicator.

---

## 🖥 System Tray Quick Controls

Right-clicking the system tray icon provides instant shortcuts:
- 🔄 **Check Now**: Perform an instant live check.
- 🔔 **Show Notifications**: Global toggle for popup alerts.
- ⚙️ **Settings**: Open the spacious settings window (`580×620px`).
- ❌ **Quit**: Cleanly exit the app.

---

## 🧰 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron 28 |
| **Storage & State** | `electron-store` |
| **HTTP Client** | `axios` with persistent `http.Agent` / `https.Agent` connection pool |
| **UI Design System** | HTML5, Vanilla CSS, Segoe UI System Fonts |
| **Testing** | Node.js native test runner (`node --test`) |
| **Installer & Packaging** | `electron-builder` |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed on Windows.

### Installation & Execution

1. **Clone & Install Dependencies**:
   ```bash
   git clone https://github.com/your-repo/controller-notify.git
   cd controller-notify
   npm install
   ```

2. **Run Dev Mode**:
   ```bash
   npm start
   ```

3. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

4. **Build Production Windows Installer**:
   ```bash
   npm run build
   ```

---

## 📂 Project Structure

```
ControllerCutie/
├── assets/                  # Tray icons & gamepad mascot assets
├── docs/                    # Architecture plans, specs & walkthroughs
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main entry point & IPC handlers
│   │   ├── windowManager.js # BrowserWindow physics & lazy window lifecycle
│   │   ├── liveMonitor.js   # Multi-channel polling loop & deduplication
│   │   ├── channelManager.js# Watchlist CRUD & CSV importer
│   │   ├── youtube.js       # 0-quota free HTML engine & API v3 client
│   │   └── preload.js       # Context isolation IPC bridge
│   └── renderer/
│       ├── settings/        # Settings window UI (HTML, CSS, JS)
│       └── popup/           # Animated corner notification popup
└── tests/                   # Automated unit test suite (52 tests)
```

---

## 📄 Documentation

For deep technical architecture documents and design plans, see the [`docs/`](./docs) directory:
- [docs/performance_and_ram_optimization_plan.md](./docs/performance_and_ram_optimization_plan.md) — Low RAM & 0% GPU Optimization plan
- [docs/channels_redesign_plan.md](./docs/channels_redesign_plan.md) — Channels sub-tabs & search/filter design
- [docs/walkthrough.md](./docs/walkthrough.md) — Complete feature & performance walkthrough

---

## 📜 License

MIT License. Designed with 🎮 for YouTube streaming enthusiasts.