# World Time & Overlap — Google Workspace Add-on

A lightweight, zero-extension Google Workspace Add-on that lives directly in the right-hand sidebar of **Google Calendar**, **Gmail**, and **Google Drive** across all browsers (Chrome, Safari on Mac/iPad) and mobile apps.

---

## Features
- **Scrub & Shift Time**:
  - Quick **`-1h`**, **`Now`**, and **`+1h`** shift buttons.
  - Native **Date & Time Picker** to jump to any date and time (automatically DST-accurate across all regions).
- **Chronological Offset Ordering**:
  - Automatically sorts all timezones relative to your local base time — from most behind (e.g. Vancouver `-3h`), through local time, to most ahead (e.g. Sydney `+15h`, Auckland `+17h`).
- **Clean 2-Line Layout**:
  - **`Vancouver (PT)  11:51 AM PDT`** (Bold, readable title)
  - `🟢 Mon, Oct 26 (-3h)` (Day/night indicator, formatted date, relative offset, and `+1 day • Tomorrow` rollover alert).
- **Automatic Calendar Event Sync**:
  - Clicking any meeting in Google Calendar automatically jumps all clocks to that event's start time.
- **Customizable Locations**:
  - Built-in settings card to add any city or custom IANA timezone, remove locations, or restore defaults.
- **Zero Extension Footprint**:
  - Runs in Google Apps Script — no browser extensions, zero background RAM consumption.

---

## File Structure
- [`Code.gs`](./Code.gs): Core Google Apps Script application logic and `CardService` UI builder.
- [`appsscript.json`](./appsscript.json): Workspace Add-on manifest with OAuth scopes and triggers for Calendar, Gmail, and Drive.

---

## Setup & Deployment

### Option A: Using the Google Apps Script Web Editor (2 mins)
1. Go to **[script.google.com](https://script.google.com)** and create a **New project**.
2. Click **Project Settings** (⚙️ gear icon on the left) and check **"Show 'appsscript.json' manifest file in editor"**.
3. In the editor:
   - Paste [`Code.gs`](./Code.gs) into `Code.gs`.
   - Paste [`appsscript.json`](./appsscript.json) into `appsscript.json`.
4. Press `Cmd + S` to save.
5. Click **Deploy** → **Test deployments** → click **Install** under *Workspace Add-on*.
6. Refresh Google Calendar, Gmail, or Drive to see the clock icon in your right sidebar.

### Option B: Using Google Clasp (CLI)
If you prefer syncing directly from your local terminal with Google's official CLI:
```bash
npm install -g @google/clasp
clasp login
clasp create --title "World Time & Overlap" --type standalone
clasp push
```

---

## License
MIT
