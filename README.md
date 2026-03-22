# dom-inspect

Point at any element in the browser and instantly get its source file, line number, and CSS properties.

Available as a **Vite plugin** (npm) and a **Chrome extension**.

## Vite Plugin

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

Injects `data-source` attributes on every JSX element at compile time. Zero production impact — everything is stripped in prod builds.

## Chrome Extension

Works on any website. Click the extension icon to enable per-site.

- With the Vite plugin: shows source file + line number + CSS properties
- Without: shows tag, classes, and computed CSS properties

Load from `chrome-extension/` as an unpacked extension.

## How to Use

| Action | What it does |
|---|---|
| **Tap Alt** (Option on Mac) | Toggle inspect mode on/off |
| **Hold Alt + move mouse** | Inspect mode while held |
| **Hover** | Highlights element, shows source info |
| **Arrow Up / Down** or **Scroll wheel** | Navigate the component hierarchy |
| **Click** | Pin tooltip, show CSS details |
| **Click again** | Copy source path to clipboard |
| **Escape** | Unpin or exit inspect mode |

## What the Tooltip Shows

- Element tag, source file location, hierarchy position
- CSS properties: layout, spacing, colors (with Tailwind class resolution)
- Color swatches with hex values

## Why

When working with AI coding assistants, the biggest friction is pointing at *which* element you mean. This tool maps DOM elements back to source locations — hover, copy, paste into your conversation.

> React 19 removed `_debugSource` from fibers, breaking tools like `click-to-react-component`. This uses a Babel transform instead.

## License

MIT
