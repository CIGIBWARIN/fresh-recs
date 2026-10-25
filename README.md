# Fresh Recs for YouTube

Refresh YouTube and get the same videos, just shuffled? Fresh Recs fixes that.

It keeps track of which recommendations you've actually been shown. Once a video has appeared a few times without you clicking it, Fresh Recs hides it, so YouTube fills the space with something you haven't seen.

<img src="icons/icon128.png" width="64" alt="">

## Features

- Hides recommendations after they've been shown a set number of times (default 3)
- Hides videos you've already watched
- ✕ button on every recommendation to hide that video for good, with Undo
- Works on the home feed, the watch-page sidebar, and Shorts in feeds
- Hidden videos can come back after a cooldown you choose (default 7 days), so nothing is blocked forever unless you hide it yourself
- Dim mode to preview what would be hidden
- Never touches search results, subscriptions or channel pages

Everything is stored locally in your browser. No accounts, no tracking, nothing leaves your device. See the [privacy policy](privacy.html).

## Install

### Chrome, Edge, Brave, Opera

1. Download `fresh-recs-chrome.zip` from the [latest release](../../releases/latest) and unzip it somewhere you'll keep it. Chrome loads the extension from that folder, so don't delete it.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right; in Edge it's on the left).
4. Click **Load unpacked** and pick the unzipped folder.

To update, download the new zip, replace the folder's contents, and click the reload icon on the extension's card.

### Firefox

Download the signed `.xpi` from the [latest release](../../releases/latest) and drag it into a Firefox window.

## How it works

- A video counts as "shown" once at least half of it is on screen. Each page load or refresh counts once.
- After it has been shown the set number of times, it's hidden on later loads. It never disappears while you're looking at it.
- **Forget impressions after (days):** if a video hasn't been shown for that long, its count resets and it can come back.
- Watched videos are remembered for 180 days. Videos you hide with ✕ stay hidden until you click **Unhide videos I hid** in the popup.

## Building from source

There's no build step for the code itself. `build.ps1` just zips the files into `dist/`:

```powershell
pwsh ./build.ps1
```

This produces `dist/fresh-recs-chrome.zip` (Manifest V3, from `manifest.chrome.json`) and `dist/fresh-recs-firefox.xpi` (Manifest V2, from `manifest.json`). The Firefox package has to be signed through [addons.mozilla.org](https://addons.mozilla.org/developers/) before regular Firefox will install it.

To try changes without packaging: load this folder unpacked in Firefox via `about:debugging` → **Load Temporary Add-on** → `manifest.json`. For Chrome, unzip the built zip and load that folder, since Chrome needs the file named `manifest.json`.

YouTube changes its page markup often. If something stops being hidden, the element names it looks for are at the top of `content.js`.

---

Not affiliated with or endorsed by YouTube or Google.
