# Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that provides the same DOM inspection overlay as the Vite plugin, usable on any website.

**Architecture:** MV3 extension with three layers — background service worker (toggle per-origin), content script (isolated world bridge), injected script (MAIN world overlay). Content script relays chrome.runtime messages to the overlay via CustomEvents. Overlay is adapted from the existing `src/overlay.ts`.

**Tech Stack:** Plain JavaScript (no build step), Chrome Extension Manifest V3, chrome.storage API

**Spec:** `docs/superpowers/specs/2026-03-22-chrome-extension-design.md`

**Reference:** `src/overlay.ts` — the existing Vite plugin overlay to adapt from

---

### Task 1: Create manifest.json

**Files:**
- Create: `chrome-extension/manifest.json`

- [ ] **Step 1: Create the manifest**

```json
{
  "manifest_version": 3,
  "name": "DOM Inspect",
  "version": "0.1.0",
  "description": "Inspect any DOM element — see CSS properties, and source file location when available",
  "permissions": ["storage"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "action": {
    "default_title": "DOM Inspect"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/manifest.json
git commit -m "feat: add chrome extension manifest"
```

---

### Task 2: Create extension icons

**Files:**
- Create: `chrome-extension/icons/icon-16.png`
- Create: `chrome-extension/icons/icon-32.png`
- Create: `chrome-extension/icons/icon-48.png`
- Create: `chrome-extension/icons/icon-128.png`
- Create: `chrome-extension/icons/icon-16-active.png`
- Create: `chrome-extension/icons/icon-32-active.png`
- Create: `chrome-extension/icons/icon-48-active.png`
- Create: `chrome-extension/icons/icon-128-active.png`

- [ ] **Step 1: Create icon generation script**

Create `generate-icons.js` at repo root. Uses the `canvas` npm package. Design: crosshair circle. Grey `#9ca3af` for inactive, blue `#3b82f6` for active.

```js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];
const variants = [
  { suffix: '', color: '#9ca3af' },       // grey (inactive)
  { suffix: '-active', color: '#3b82f6' }, // blue (active)
];

const dir = path.join(__dirname, 'chrome-extension', 'icons');
fs.mkdirSync(dir, { recursive: true });

for (const size of sizes) {
  for (const { suffix, color } of variants) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.35;
    const cross = size * 0.15;

    // Circle
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size / 16);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(cx, cy - r - cross);
    ctx.lineTo(cx, cy + r + cross);
    ctx.moveTo(cx - r - cross, cy);
    ctx.lineTo(cx + r + cross, cy);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, size / 16), 0, Math.PI * 2);
    ctx.fill();

    const out = path.join(dir, `icon-${size}${suffix}.png`);
    fs.writeFileSync(out, canvas.toBuffer('image/png'));
    console.log('Created', out);
  }
}
```

- [ ] **Step 2: Install canvas and run**

```bash
npm install canvas --no-save
node generate-icons.js
```

Expected: 8 PNG files in `chrome-extension/icons/`.

- [ ] **Step 3: Clean up and commit**

```bash
rm generate-icons.js
git add chrome-extension/icons/
git commit -m "feat: add extension icons"
```

---

### Task 3: Create background.js

**Files:**
- Create: `chrome-extension/background.js`

- [ ] **Step 1: Write background.js**

```js
// Manage per-origin enabled state and icon appearance.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  const origin = new URL(tab.url).origin;
  const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
  const isEnabled = !enabledOrigins[origin];

  if (isEnabled) {
    enabledOrigins[origin] = true;
  } else {
    delete enabledOrigins[origin];
  }
  await chrome.storage.local.set({ enabledOrigins });

  updateIcon(tab.id, isEnabled);

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: isEnabled ? 'activate' : 'deactivate'
    });
  } catch (e) {
    // Content script not yet loaded — it will check storage on init
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    const origin = new URL(tab.url).origin;
    const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
    updateIcon(tabId, !!enabledOrigins[origin]);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || tab.url.startsWith('chrome://')) return;
  const origin = new URL(tab.url).origin;
  const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
  updateIcon(tabId, !!enabledOrigins[origin]);
});

function updateIcon(tabId, isEnabled) {
  const suffix = isEnabled ? '-active' : '';
  chrome.action.setIcon({
    tabId,
    path: {
      16: `icons/icon-16${suffix}.png`,
      32: `icons/icon-32${suffix}.png`,
      48: `icons/icon-48${suffix}.png`,
      128: `icons/icon-128${suffix}.png`,
    }
  });
  chrome.action.setTitle({
    tabId,
    title: isEnabled ? 'DOM Inspect (active)' : 'DOM Inspect'
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/background.js
git commit -m "feat: add background service worker"
```

---

### Task 4: Create content.js

**Files:**
- Create: `chrome-extension/content.js`

- [ ] **Step 1: Write content.js**

```js
// Bridge between background service worker and injected overlay.
// Runs in isolated world. Relays messages via CustomEvents on document.

function injectOverlay(callback) {
  if (document.documentElement.hasAttribute('data-dom-inspect-injected')) {
    if (callback) callback();
    return;
  }
  document.documentElement.setAttribute('data-dom-inspect-injected', 'true');
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => {
    script.remove();
    if (callback) callback();
  };
  document.documentElement.appendChild(script);
}

function sendToOverlay(action) {
  document.dispatchEvent(new CustomEvent('dom-inspect-' + action));
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'activate') {
    injectOverlay(() => sendToOverlay('activate'));
  } else if (msg.action === 'deactivate') {
    sendToOverlay('deactivate');
  }
});

// On page load, check if this origin is enabled
chrome.storage.local.get('enabledOrigins', ({ enabledOrigins = {} }) => {
  if (enabledOrigins[location.origin]) {
    injectOverlay(() => sendToOverlay('activate'));
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add content script bridge"
```

---

### Task 5: Create injected.js

**Files:**
- Create: `chrome-extension/injected.js`

This is the overlay, adapted from `src/overlay.ts`. Key changes from the Vite version:
- Standalone JS file, not a template string (no double-escaping)
- `init()` / `destroy()` lifecycle instead of IIFE + HMR
- All event listeners stored as named functions for cleanup
- `getSourceHierarchy()` fallback: collects all elements, not just those with `data-source`
- Click-to-copy: CSS selector when no `data-source`
- CustomEvent listeners for activate/deactivate

- [ ] **Step 1: Write the complete injected.js**

```js
// DOM Inspect overlay — runs in MAIN world.
// Adapted from src/overlay.ts (Vite plugin version).

(function () {
  // ── State ──────────────────────────────────────────────────────────
  let altDown = false;
  let currentTarget = null;
  let hierarchyIndex = 0;
  let hierarchy = [];
  let frozen = false;
  let altLastDown = 0;
  let altMoved = false;
  let highlight = null;
  let tooltip = null;

  // ── Init / Destroy ─────────────────────────────────────────────────

  function init() {
    if (window.__sourcePickerActive) return;
    window.__sourcePickerActive = true;

    highlight = document.createElement('div');
    highlight.id = '__source-picker-highlight';
    Object.assign(highlight.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      background: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid rgba(59, 130, 246, 0.8)',
      borderRadius: '3px',
      display: 'none',
      transition: 'top 0.05s, left 0.05s, width 0.05s, height 0.05s',
    });
    document.body.appendChild(highlight);

    tooltip = document.createElement('div');
    tooltip.id = '__source-picker-tooltip';
    Object.assign(tooltip.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      background: '#1e1e2e',
      color: '#cdd6f4',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '12px',
      lineHeight: '1.5',
      padding: '8px 12px',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      maxWidth: '460px',
      maxHeight: '360px',
      overflowY: 'auto',
      display: 'none',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    });
    document.body.appendChild(tooltip);

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    document.addEventListener('click', onClick, true);
  }

  function destroy() {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('wheel', onWheel, { capture: true });
    document.removeEventListener('click', onClick, true);

    if (highlight) { highlight.remove(); highlight = null; }
    if (tooltip) { tooltip.remove(); tooltip = null; }
    document.documentElement.removeAttribute('data-dom-inspect-injected');

    altDown = false;
    currentTarget = null;
    hierarchy = [];
    hierarchyIndex = 0;
    frozen = false;
    window.__sourcePickerActive = false;
  }

  // ── Hierarchy ────────────────────────────────────────────────────────

  function getSourceHierarchy(el) {
    const items = [];
    let node = el;
    while (node && node !== document.body) {
      const source = node.getAttribute && node.getAttribute('data-source');
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      const cls = (node.className && typeof node.className === 'string') ? node.className.trim() : '';
      const id = node.id || '';
      const slot = (node.getAttribute && node.getAttribute('data-slot')) || '';

      if (source) {
        // Has data-source (Vite plugin present)
        items.push({ source, tag, cls, id, slot, el: node });
      } else if (tag) {
        // Fallback: collect element without source info
        items.push({ source: '', tag, cls, id, slot, el: node });
      }
      node = node.parentElement;
    }
    return items;
  }

  // ── Positioning ──────────────────────────────────────────────────────

  function positionHighlight(el) {
    const rect = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      display: 'block',
    });
  }

  function positionTooltip(el) {
    const rect = el.getBoundingClientRect();
    tooltip.style.display = 'block';

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const pad = 6;

    let top, left;
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const spaceRight = vw - rect.right;
    const spaceLeft = rect.left;

    if (spaceAbove >= th + gap) {
      top = rect.top - th - gap;
      left = rect.left;
    } else if (spaceBelow >= th + gap) {
      top = rect.bottom + gap;
      left = rect.left;
    } else if (spaceRight >= tw + gap) {
      top = rect.top;
      left = rect.right + gap;
    } else if (spaceLeft >= tw + gap) {
      top = rect.top;
      left = rect.left - tw - gap;
    } else {
      if (spaceAbove >= spaceBelow) {
        top = pad;
        left = rect.left;
      } else {
        top = vh - th - pad;
        left = rect.left;
      }
    }

    if (top + th > vh - pad) top = vh - th - pad;
    if (top < pad) top = pad;
    if (left + tw > vw - pad) left = vw - tw - pad;
    if (left < pad) left = pad;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  // ── CSS Helpers ──────────────────────────────────────────────────────

  const COLOR_PROPS = new Set([
    'color', 'background-color', 'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline-color', 'fill', 'stroke',
  ]);

  function rgbToHex(val) {
    const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return val;
    return '#' + [m[1], m[2], m[3]].map(function (n) {
      return parseInt(n).toString(16).padStart(2, '0');
    }).join('');
  }

  function colorSwatch(val) {
    if (!val || (!val.startsWith('rgb') && !val.startsWith('#') && !val.startsWith('hsl'))) return '';
    return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;'
      + 'border:1px solid rgba(255,255,255,0.2);background:' + val
      + ';flex-shrink:0;margin-top:3px"></span>';
  }

  // ── CSS Selector for Copy ────────────────────────────────────────────

  function buildSelector(item) {
    if (item.source) return item.source;
    if (item.id) return '#' + item.id;
    let sel = item.tag;
    if (item.cls) {
      const classes = item.cls.split(/\s+/).slice(0, 3);
      sel += '.' + classes.join('.');
    }
    return sel;
  }

  // ── Tooltip Rendering ────────────────────────────────────────────────

  function renderTooltip() {
    if (hierarchy.length === 0) {
      tooltip.style.display = 'none';
      return;
    }

    const item = hierarchy[hierarchyIndex];
    let html = '<div>';

    // Tag name
    html += '<span style="color:#cdd6f4;font-weight:bold">' + item.tag + '</span>';

    // data-slot
    if (item.slot) {
      html += ' <span style="color:#fab387;font-weight:bold">' + item.slot + '</span>';
    }

    html += ' <span style="color:#6c7086">\u2014</span> ';

    if (item.source) {
      // Has source info — show file path
      const parts = item.source.split('/');
      const file = parts.pop();
      const parent = parts.length > 0 ? parts.pop() + '/' : '';
      html += '<span style="color:#89b4fa">' + parent + file + '</span>';
    } else {
      // No source — show #id.class1.class2
      let label = '';
      if (item.id) label += '<span style="color:#a6e3a1">#' + item.id + '</span>';
      if (item.cls) {
        const classes = item.cls.split(/\s+/).slice(0, 3);
        label += '<span style="color:#89b4fa">.' + classes.join('.') + '</span>';
        const total = item.cls.split(/\s+/).length;
        if (total > 3) label += '<span style="color:#585b70"> +' + (total - 3) + '</span>';
      }
      if (!label) label = '<span style="color:#585b70">(no class)</span>';
      html += label;
    }

    // Hierarchy position
    if (hierarchy.length > 1) {
      html += ' <span style="color:#585b70">(' + (hierarchyIndex + 1) + '/' + hierarchy.length + ')</span>';
    }
    html += '</div>';

    // CSS details when pinned
    if (frozen) {
      const computed = getComputedStyle(item.el);

      const DISPLAY_PROPS = [
        'display', 'position', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-self',
        'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'padding', 'margin',
        'gap', 'row-gap', 'column-gap',
        'top', 'right', 'bottom', 'left', 'inset', 'z-index',
        'overflow',
        'border-width', 'border-radius', 'border-color',
        'color', 'background-color', 'opacity',
      ];

      const DEFAULTS = {
        'display': 'block', 'position': 'static',
        'flex-direction': 'row', 'flex-wrap': 'nowrap',
        'align-items': 'normal', 'justify-content': 'normal', 'align-self': 'auto',
        'grid-template-columns': 'none', 'grid-template-rows': 'none',
        'grid-column': 'auto / auto', 'grid-row': 'auto / auto',
        'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none',
        'gap': 'normal', 'row-gap': 'normal', 'column-gap': 'normal',
        'top': 'auto', 'right': 'auto', 'bottom': 'auto', 'left': 'auto',
        'inset': 'auto', 'z-index': 'auto',
        'overflow': 'visible',
        'opacity': '1',
      };

      const SIDE_SHORTHANDS = {
        'padding-top': 'padding', 'padding-right': 'padding', 'padding-bottom': 'padding', 'padding-left': 'padding',
        'margin-top': 'margin', 'margin-right': 'margin', 'margin-bottom': 'margin', 'margin-left': 'margin',
        'border-top-width': 'border-width', 'border-right-width': 'border-width', 'border-bottom-width': 'border-width', 'border-left-width': 'border-width',
        'border-top-color': 'border-color', 'border-right-color': 'border-color', 'border-bottom-color': 'border-color', 'border-left-color': 'border-color',
        'border-top-left-radius': 'border-radius', 'border-top-right-radius': 'border-radius', 'border-bottom-right-radius': 'border-radius', 'border-bottom-left-radius': 'border-radius',
        'overflow-x': 'overflow', 'overflow-y': 'overflow',
      };

      // Tailwind class resolution
      const twMap = {};
      function searchRules(rules, cls, escaped) {
        for (const rule of rules) {
          if (rule.cssRules) searchRules(rule.cssRules, cls, escaped);
          if (!rule.selectorText) continue;
          if (!rule.selectorText.includes('.' + escaped)) continue;
          for (let i = 0; i < rule.style.length; i++) {
            const rawProp = rule.style[i];
            const rawVal = rule.style.getPropertyValue(rawProp);
            const mapped = SIDE_SHORTHANDS[rawProp] || rawProp;
            if (!twMap[mapped]) twMap[mapped] = { rawValues: {}, classes: new Set() };
            twMap[mapped].rawValues[rawProp] = rawVal;
            twMap[mapped].classes.add(cls);
          }
        }
      }
      if (item.cls) {
        const classes = item.cls.split(/\s+/);
        for (const cls of classes) {
          const escaped = CSS.escape(cls);
          for (const sheet of document.styleSheets) {
            try { searchRules(sheet.cssRules, cls, escaped); } catch (e) {}
          }
        }
      }

      function getShorthand(sides) {
        const vals = sides.map(function (s) { return computed.getPropertyValue(s); });
        if (vals.every(function (v) { return v === vals[0]; })) return vals[0];
        if (vals.length === 4 && vals[0] === vals[2] && vals[1] === vals[3]) return vals[0] + ' ' + vals[1];
        return vals.join(' ');
      }

      function getComputedVal(prop) {
        if (prop === 'padding') return getShorthand(['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
        if (prop === 'margin') return getShorthand(['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
        if (prop === 'border-width') return getShorthand(['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']);
        if (prop === 'border-color') return getShorthand(['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']);
        if (prop === 'border-radius') return getShorthand(['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']);
        if (prop === 'overflow') {
          const x = computed.getPropertyValue('overflow-x');
          const y = computed.getPropertyValue('overflow-y');
          return x === y ? x : x + ' ' + y;
        }
        return computed.getPropertyValue(prop);
      }

      const rows = [];
      for (const prop of DISPLAY_PROPS) {
        const val = getComputedVal(prop);
        const isDefault = !val || val === DEFAULTS[prop] || val === '0px' || val === '0px 0px' || val === '0px 0px 0px 0px';
        if (isDefault) continue;

        const isClr = COLOR_PROPS.has(prop) || prop === 'border-color';
        const tw = twMap[prop];

        let displayVal;
        if (isClr && tw) {
          const rawVals = Object.values(tw.rawValues);
          const varVal = rawVals.find(function (v) { return v.includes('var('); });
          displayVal = varVal || rgbToHex(val);
        } else {
          displayVal = isClr ? rgbToHex(val) : val;
        }

        const swatch = isClr ? colorSwatch(val) : '';
        const twClasses = tw ? ' <span style="color:#fab387">(' + Array.from(tw.classes).join(' ') + ')</span>' : '';

        rows.push(
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">'
          + '<span style="color:#a6adc8;white-space:nowrap;min-width:140px">' + prop + ':</span>'
          + swatch
          + '<span style="color:#cdd6f4">' + displayVal + '</span>'
          + twClasses
          + '</div>'
        );
      }

      html += '<div style="border-top:1px solid #313244;margin-top:4px;padding-top:4px">';
      html += rows.join('');
      html += '</div>';

      html += '<div style="border-top:1px solid #313244;margin-top:4px;padding-top:4px;color:#585b70">'
        + 'Click to copy, Esc to dismiss</div>';
    }

    tooltip.innerHTML = html;
  }

  // ── Display Helpers ──────────────────────────────────────────────────

  function updateDisplay() {
    if (hierarchy.length === 0) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      return;
    }
    const active = hierarchy[hierarchyIndex];
    positionHighlight(active.el);
    renderTooltip();
    positionTooltip(active.el);
  }

  function hideAll() {
    highlight.style.display = 'none';
    tooltip.style.display = 'none';
    tooltip.style.pointerEvents = 'none';
    currentTarget = null;
    hierarchy = [];
    hierarchyIndex = 0;
    frozen = false;
  }

  function unfreeze() {
    frozen = false;
    tooltip.style.pointerEvents = 'none';
  }

  function flashGreen() {
    highlight.style.background = 'rgba(34, 197, 94, 0.25)';
    highlight.style.borderColor = 'rgba(34, 197, 94, 0.8)';
    setTimeout(function () {
      highlight.style.background = 'rgba(59, 130, 246, 0.15)';
      highlight.style.borderColor = 'rgba(59, 130, 246, 0.8)';
    }, 300);
  }

  // ── Event Handlers (named for removeEventListener) ───────────────────

  function onKeyDown(e) {
    if (e.key === 'Alt') {
      e.preventDefault();
      if (!altDown) {
        altLastDown = Date.now();
        altMoved = false;
      }
      return;
    }

    if (altDown && hierarchy.length > 0 && !frozen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        hierarchyIndex = Math.min(hierarchyIndex + 1, hierarchy.length - 1);
        updateDisplay();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        hierarchyIndex = Math.max(hierarchyIndex - 1, 0);
        updateDisplay();
      }
    }

    if (e.key === 'Enter' && altDown && hierarchy.length > 0 && !frozen) {
      e.preventDefault();
      frozen = true;
      tooltip.style.pointerEvents = 'auto';
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    }

    if (e.key === 'Escape' && altDown) {
      if (frozen) {
        unfreeze();
        renderTooltip();
        positionTooltip(hierarchy[hierarchyIndex].el);
      } else {
        altDown = false;
        hideAll();
      }
    }
  }

  function onKeyUp(e) {
    if (e.key !== 'Alt') return;
    e.preventDefault();

    const elapsed = Date.now() - altLastDown;

    if (elapsed < 300 && !altMoved) {
      altDown = !altDown;
      if (!altDown) hideAll();
    } else if (altMoved) {
      altDown = false;
      hideAll();
    }
  }

  function onMouseOver(e) {
    if (!altDown && e.altKey) {
      altDown = true;
      altMoved = true;
    }
    if (!altDown || frozen) return;
    altMoved = true;

    const target = e.target;
    if (target === highlight || target === tooltip) return;
    if (target === currentTarget) return;

    currentTarget = target;
    hierarchy = getSourceHierarchy(target);
    hierarchyIndex = 0;
    updateDisplay();
  }

  function onWheel(e) {
    if (!altDown || hierarchy.length === 0) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      hierarchyIndex = Math.min(hierarchyIndex + 1, hierarchy.length - 1);
    } else {
      hierarchyIndex = Math.max(hierarchyIndex - 1, 0);
    }
    updateDisplay();
  }

  function onClick(e) {
    if (!altDown || hierarchy.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (frozen) {
      const active = hierarchy[hierarchyIndex];
      const copyText = buildSelector(active);
      navigator.clipboard.writeText(copyText).then(flashGreen);
      unfreeze();
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    } else {
      frozen = true;
      tooltip.style.pointerEvents = 'auto';
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    }
  }

  // ── CustomEvent listeners for activate/deactivate ────────────────────

  document.addEventListener('dom-inspect-activate', function () {
    if (!window.__sourcePickerActive) init();
  });

  document.addEventListener('dom-inspect-deactivate', function () {
    if (window.__sourcePickerActive) destroy();
  });
})();
```

- [ ] **Step 2: Verify — check for common porting bugs**

Read through the file and confirm:
- No double-escaped regex (should be `\d+` not `\\d+`, `\s+` not `\\s+`)
- Unicode literal `\u2014` not `\\u2014`
- All 5 event listeners use named functions (`onKeyDown`, `onKeyUp`, `onMouseOver`, `onWheel`, `onClick`)
- `destroy()` removes all 5 listeners with matching options (`true` for capture, `{ capture: true }` for wheel)
- `getSourceHierarchy()` collects elements both with and without `data-source`
- `buildSelector()` returns source path when available, CSS selector otherwise
- `renderTooltip()` header shows `#id.classes` when no source, file path when source exists

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/injected.js
git commit -m "feat: add overlay script for chrome extension"
```

---

### Task 6: Manual testing

- [ ] **Step 1: Load unpacked extension**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `chrome-extension/` directory
4. Verify: extension appears with grey icon, no errors in service worker console

- [ ] **Step 2: Test on a regular website**

1. Navigate to any website (e.g., github.com)
2. Click extension icon → should turn blue
3. Alt-tap → inspect mode activates
4. Hover elements → highlight + tooltip showing `tag#id.classes`
5. Click → pin tooltip, show CSS details
6. Click again → copies CSS selector to clipboard
7. Escape → dismiss
8. Click icon again → turns grey, overlay removed

- [ ] **Step 3: Test with Vite plugin**

1. Start a Vite project with `dom-inspect` plugin running on localhost
2. Enable extension on localhost
3. Hover elements → tooltip shows source file + line number
4. Click to copy → copies source path (not CSS selector)

- [ ] **Step 4: Test edge cases**

- Navigate away and back on enabled origin → overlay should auto-activate
- Click icon on `chrome://extensions/` → should do nothing (no crash)
- Try on a site with CDN stylesheets → CSS section should still show computed values (Tailwind resolution may be partial)

- [ ] **Step 5: Fix any issues, commit**

```bash
git add chrome-extension/
git commit -m "fix: address issues from manual testing"
```

---

### Task 7: Verify npm package excludes extension

**Files:**
- Verify: `package.json` — `"files": ["dist"]` ensures chrome-extension/ is excluded

- [ ] **Step 1: Build and dry-run**

```bash
pnpm run build && npm pack --dry-run
```

Expected output should list only: `dist/index.js`, `dist/index.d.ts`, `package.json`, `README.md`. No `chrome-extension/` files.

- [ ] **Step 2: Commit if any changes needed**

```bash
git add package.json
git commit -m "chore: verify npm package excludes chrome extension"
```
