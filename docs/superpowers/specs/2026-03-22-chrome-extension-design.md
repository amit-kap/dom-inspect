# Source Picker Chrome Extension — Design Spec

## Purpose

A Chrome extension that provides the same DOM inspection overlay UX as the Vite plugin, usable on any website. When `data-source` attributes are present (from the Vite plugin), source file/line info is shown. Otherwise, it acts as a CSS inspector showing tag, classes, and computed styles.

## Scope

- Chrome extension (Manifest V3) in `chrome-extension/` directory of this repo
- Four files: `manifest.json`, `background.js`, `content.js`, `injected.js`
- No build step — plain JS, loaded directly

## Activation model

- Click extension icon to enable/disable per-origin
- Icon state reflects enabled (blue) vs disabled (grey)
- When enabled, Alt-tap toggles inspect mode (same as Vite plugin)
- Per-origin state persisted via `chrome.storage.local`

## Extension structure

```
chrome-extension/
├── manifest.json
├── background.js       (Service worker — toggle logic, icon state)
├── content.js          (Content script — bridge between extension and page)
├── injected.js         (Overlay — runs in MAIN world via script tag)
└── icons/
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## manifest.json

- Manifest V3
- Permissions: `storage`
- `content_scripts`: inject `content.js` on all URLs (`<all_urls>`), `run_at: "document_idle"`
- Background: service worker (`background.js`)
- No popup — icon click handled by `chrome.action.onClicked`
- `web_accessible_resources`: `injected.js` (so content.js can inject it into the page)
- Icons at 16, 32, 48, 128px

## Architecture — execution worlds

Chrome extensions have two execution contexts:
1. **Isolated world** (content script) — can use `chrome.runtime` messaging but limited DOM access
2. **MAIN world** (page context) — full DOM access, `getComputedStyle`, `document.styleSheets`

The overlay needs MAIN world for DOM manipulation, computed styles, and stylesheet traversal. Communication flows:

```
background.js  <──chrome.runtime messages──>  content.js (isolated)  <──custom DOM events──>  injected.js (MAIN)
```

- `content.js` runs in isolated world, listens for messages from background, relays via `CustomEvent` on `document`
- `injected.js` runs in MAIN world (injected via script tag by content.js), contains all overlay logic
- `injected.js` listens for custom events to activate/deactivate

## background.js

Responsibilities:
1. Listen for `chrome.action.onClicked` — toggle enabled state for the tab's origin
2. Send `{ action: "activate" }` or `{ action: "deactivate" }` message to content script
3. Update icon appearance (grey vs blue) based on state
4. On tab activation/update: check stored state and update icon accordingly
5. Persist enabled origins in `chrome.storage.local`

## content.js

Thin bridge script (isolated world):
1. On load: check `chrome.storage.local` for current origin — if enabled, inject `injected.js` and dispatch activate event
2. Listen for `chrome.runtime.onMessage` — relay activate/deactivate as `CustomEvent` on `document`
3. Inject `injected.js` by creating a `<script>` tag with `src` pointing to `chrome.runtime.getURL('injected.js')`
4. Guard against double-injection via a `data-dom-inspect-injected` attribute on `document.documentElement`

## injected.js

The overlay script, adapted from the Vite plugin's `overlay.ts`.

### Kept identical
- Highlight overlay element (fixed position, blue border)
- Tooltip element (dark theme, monospace, scrollable)
- `getSourceHierarchy()` — walk up DOM collecting ancestors with `data-source`
- `positionHighlight()` / `positionTooltip()` — same positioning logic
- CSS property inspection: `DISPLAY_PROPS`, `DEFAULTS`, `SIDE_SHORTHANDS`, Tailwind class resolution, color swatches, hex conversion
- `renderTooltip()` — same HTML generation
- Alt-tap toggle (quick <300ms), Alt-hold-and-drag
- Arrow keys / scroll wheel hierarchy navigation
- Click to pin, click again to copy, Escape to dismiss
- Green flash on copy

### Changed from Vite version
- Not an IIFE embedded in a template string — standalone JS file with `init()` / `destroy()` functions
- No `import.meta.hot` HMR cleanup — listens for `dom-inspect-deactivate` custom event to call `destroy()`
- Listens for `dom-inspect-activate` custom event to call `init()`
- Guard against double-init via `window.__sourcePickerActive`
- `destroy()` removes all DOM elements and all event listeners cleanly (must store references to remove them)
- Template literal escape sequences from `overlay.ts` (e.g., `\\s+`, `\\u2014`) become normal escapes in standalone JS

### Hierarchy behavior without data-source

When inspecting sites without the Vite plugin:
- `getSourceHierarchy()` walks up DOM collecting every element (not just those with `data-source`)
- Each item includes: `tag`, `className`, `id`, and `el` reference
- Tooltip header shows `tag#id.class1.class2` instead of source path
- CSS details section works identically (computed styles, Tailwind resolution, color swatches)
- Click-to-copy generates a CSS selector: `#id` if available, otherwise `tag.class1.class2` (first 3 classes max)

## Icon states

| State | Icon | Badge |
|-------|------|-------|
| Disabled for this origin | Grey icon | None |
| Enabled for this origin | Blue icon | None |

Icons: simple magnifying glass or crosshair shape. Grey version desaturated. Generated as simple SVG-to-PNG conversions.

## Permissions rationale

- `storage`: persist per-origin enabled/disabled state across sessions
- No `activeTab` or `host_permissions` needed — `content_scripts` with `<all_urls>` handles injection, and the script is inert until enabled

## Known limitations

- **Cross-origin stylesheets**: `document.styleSheets` access throws `SecurityError` for cross-origin CSS (e.g., CDN-hosted). The existing `try/catch` handles this gracefully, but Tailwind class resolution will not work for those stylesheets.
- **Strict CSP sites**: Some sites with restrictive Content Security Policies may block the injected script tag or inline style assignments via `element.style`. The overlay will not function on these sites.
- **No auto-reload**: When toggling the extension on, the overlay activates on the current page state. If the page navigates, content.js re-checks stored state and re-injects if needed.

## Out of scope

- Popup UI
- Options page
- Chrome Web Store publishing (initial version is local load)
- Build tooling — plain JS, no bundler
- Shared code abstraction with Vite plugin — overlay is ~200 lines, maintained separately
