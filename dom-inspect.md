# dom-inspect

## What

A DOM inspection toolkit that lets you point at any element in the browser and instantly see its source file, line number, and CSS properties. Available as:

1. **npm package** — Vite plugin for React projects. Install as a devDependency, add one line to your config. Zero production impact.
2. **Chrome extension** — Works on any website. CSS inspector with source file info when `data-source` attributes are present (from the Vite plugin).

Designed for use with AI coding assistants like Claude Code — hover an element, copy its source location, paste into a conversation.

## Why

When working with an AI assistant on UI changes, the biggest friction is communicating *which* element you mean. Complex component trees make this worse — a visual "card" might be 5 levels of nested divs across multiple files.

This tool maps every DOM element back to its source location.

> **Note:** React 19 removed `_debugSource` from fibers, so existing tools like `click-to-react-component` no longer work. The Vite plugin uses a Babel transform instead.

## How to Use

| Action | What it does |
|---|---|
| **Tap Alt** (Option on Mac) | Toggle inspect mode on/off |
| **Hold Alt + move mouse** | Inspect mode while held, turns off on release |
| **Hover** | Highlights the element, shows source file and CSS info |
| **Arrow Up / Down** | Navigate up/down the component hierarchy |
| **Scroll wheel** | Same as arrow keys |
| **Click** | Pin the tooltip (makes it scrollable, shows CSS details) |
| **Click again** | Copy source info to clipboard, unpin |
| **Escape** | Unpin tooltip, or turn off inspect mode |

## What the Tooltip Shows

**Header** — element tag, `data-slot` value (orange), source file location, hierarchy position.

**CSS properties** (when pinned) — Tailwind classes are resolved to their computed CSS values. Only layout and color properties are shown:

- Layout: display, position, width/height, margin, padding, flex, grid, gap, overflow, z-index
- Color: color, background-color, border-color (with hex value and color swatch)
- Spacing shorthands are collapsed (e.g. `py-2` → `padding: 8px 0`)

## Distribution

### 1. Vite Plugin (npm package: `dom-inspect`)

```bash
npm install -D dom-inspect
```

```ts
// vite.config.ts
import { sourcePicker } from 'dom-inspect'

export default defineConfig({
  plugins: [
    react(),
    sourcePicker(),
  ]
})
```

#### How it works

**Compile time (dev only):** A Babel plugin runs on every `.tsx`/`.jsx` file and injects `data-source="path/to/file.tsx:42"` attributes on all JSX elements. Runs with `enforce: 'pre'` so line numbers are accurate.

**Runtime (dev only):** A vanilla JS overlay is injected into the page. No React dependency — reads `data-source` attributes from the DOM directly.

**Production:** Everything is gated behind `isProduction`. No Babel transform, no overlay, no `data-source` attributes. Zero cost.

#### Package structure

```
src/
  index.ts              # Plugin entry: exports sourcePicker()
  babel-transform.ts    # Babel plugin that adds data-source attributes
  overlay.ts            # Client-side overlay script (vanilla JS)
```

### 2. Chrome Extension

Works on any website. Click the extension icon to enable/disable per-site.

- **With Vite plugin running:** Full experience — source file, line number, CSS properties
- **Without Vite plugin:** CSS inspector — tag name, classes, computed styles

#### How it works

- Click extension icon → enables/disables for the current site's origin
- Content script injects the overlay into the page (MAIN world for full DOM access)
- Background service worker manages per-origin state and icon appearance
- Communication: background ↔ content script (chrome messages) ↔ overlay (custom DOM events)

#### Extension structure

```
chrome-extension/
  manifest.json         # MV3 manifest
  background.js         # Service worker — toggle logic, icon state
  content.js            # Bridge — relays messages to overlay
  injected.js           # Overlay — adapted from overlay.ts
  icons/                # 16, 32, 48, 128px
```

#### Differences from Vite version

- No HMR cleanup — message-based activate/deactivate
- Hierarchy fallback: without `data-source`, collects all elements with tag + classes
- Click-to-copy without source info: copies CSS selector (`#id` or `tag.class1.class2`)
- Guard against double-injection via `data-source-picker-injected` attribute

#### Known limitations

- Cross-origin stylesheets: Tailwind class resolution won't work for CSS loaded from CDNs
- Strict CSP sites: overlay may not function on sites with restrictive Content Security Policies

## Technical Notes

### Double Babel pass
The Vite plugin runs Babel independently via the `transform` hook, meaning Babel processes JSX files twice (once by `@vitejs/plugin-react`, once by this plugin). Acceptable for dev-only. The alternative — exposing a Babel plugin for `react({ babel: ... })` — hurts the one-line DX goal.

### Alt key conflicts
Alt is used by browser menus (Windows/Linux) and macOS system shortcuts. The modifier is hardcoded to Alt for now.

### Framework scope
The Babel transform is React-specific (JSX). The overlay is framework-agnostic. The Chrome extension works on any site regardless of framework.

## License

MIT
