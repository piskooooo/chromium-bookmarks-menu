# Firefox-style Bookmarks Menu (quick extension)

This is a quick-and-dirty Chromium/Helium extension that gives you:

- A toolbar button with popup bookmark tree
- Normal left click for open behavior
- `Ctrl/Cmd + click` or middle click on bookmark -> open in background tab
- `Ctrl/Cmd + click` on folder -> open all bookmarks in folder in background tabs
- middle click on folder -> open all bookmarks in folder in background tabs
- `Shift + left click` on folder -> open all bookmarks in folder in a new window
- simple search over bookmark title + URL

## Install

1. Open **chrome://extensions**
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Choose this folder: `~/helium-bookmarks-menu`

## Files

- `manifest.json` – MV3 manifest
- `menu.html`, `menu.css`, `menu.js` – popup UI and behavior
- `lib/intent.js` – click semantics
- `lib/tree.js` – bookmark tree helpers
- `test/` – Node test suite (25 tests)
- `scripts/make_icons.py` – local icon generator

## Notes

- `Manage bookmarks` button tries to open `chrome://bookmarks/`.
  Chrome blocks extensions from opening that URL in some contexts.
- Folder opening currently uses `collectOpenable()` and skips non-openable URLs like:
  `javascript:` and `chrome://`.

## Run tests

```bash
cd ~/helium-bookmarks-menu
npm test
```

## Current state

- Unit tests: **pass** (25/25)
- Icons generated in `icons/`
