/**
 * Returns the client-side overlay script as a string.
 * Injected into index.html in dev mode only.
 *
 * The overlay provides:
 * - Alt tap to toggle inspect mode, or hold Alt + move mouse
 * - Hover to highlight elements with source info
 * - Arrow keys / scroll wheel to navigate the component hierarchy
 * - Click to pin the tooltip (scrollable), click again to copy source info
 * - Escape to dismiss
 *
 * Tailwind CSS classes are resolved to their computed values and displayed
 * for color and layout properties only.
 */
export function getOverlayScript(): string {
  return `
(function() {
  if (window.__sourcePickerActive) return;
  window.__sourcePickerActive = true;

  // ── State ──────────────────────────────────────────────────────────
  let altDown = false;       // Whether inspect mode is active
  let currentTarget = null;  // Currently hovered DOM element
  let hierarchyIndex = 0;    // Selected index in the source hierarchy
  let hierarchy = [];        // Array of ancestor elements with data-source
  let frozen = false;        // Whether tooltip is pinned in place

  // Toggle detection: distinguish quick tap from hold-and-drag
  let altLastDown = 0;
  let altMoved = false;


  // ── DOM: Highlight overlay ─────────────────────────────────────────
  const highlight = document.createElement('div');
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

  // ── DOM: Tooltip ───────────────────────────────────────────────────
  const tooltip = document.createElement('div');
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

  // ── Hierarchy: walk up the DOM collecting elements with data-source ──
  function getSourceHierarchy(el) {
    const items = [];
    let node = el;
    while (node && node !== document.body) {
      const source = node.getAttribute && node.getAttribute('data-source');
      if (source) {
        items.push({
          source,
          tag: node.tagName.toLowerCase(),
          cls: (node.className && typeof node.className === 'string') ? node.className.trim() : '',
          slot: node.getAttribute('data-slot') || '',
          el: node,
        });
      }
      node = node.parentElement;
    }
    return items; // Index 0 = innermost, last = outermost
  }


  // ── Positioning ────────────────────────────────────────────────────

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

  // Place tooltip outside the highlighted element: above → below → right → left
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
      // No room — pin to whichever vertical edge has more space
      if (spaceAbove >= spaceBelow) {
        top = pad;
        left = rect.left;
      } else {
        top = vh - th - pad;
        left = rect.left;
      }
    }

    // Clamp to viewport edges
    if (top + th > vh - pad) top = vh - th - pad;
    if (top < pad) top = pad;
    if (left + tw > vw - pad) left = vw - tw - pad;
    if (left < pad) left = pad;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  // ── CSS property helpers ──────────────────────────────────────────

  // Properties that represent colors (get hex conversion + swatch)
  const COLOR_PROPS = new Set([
    'color', 'background-color', 'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline-color', 'fill', 'stroke',
  ]);


  function rgbToHex(val) {
    const m = val.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return val;
    return '#' + [m[1], m[2], m[3]].map(function(n) {
      return parseInt(n).toString(16).padStart(2, '0');
    }).join('');
  }

  function colorSwatch(val) {
    if (!val || (!val.startsWith('rgb') && !val.startsWith('#') && !val.startsWith('hsl'))) return '';
    return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;'
      + 'border:1px solid rgba(255,255,255,0.2);background:' + val
      + ';flex-shrink:0;margin-top:3px"></span>';
  }

  // ── Tooltip rendering ──────────────────────────────────────────────

  function renderTooltip() {
    if (hierarchy.length === 0) {
      tooltip.style.display = 'none';
      return;
    }

    const item = hierarchy[hierarchyIndex];

    // Short source path: parent-folder/filename.tsx:line
    const parts = item.source.split('/');
    const file = parts.pop();
    const parent = parts.length > 0 ? parts.pop() + '/' : '';

    // Header line: tag name, data-slot, source location, hierarchy position
    let html = '<div>';
    html += '<span style="color:#cdd6f4;font-weight:bold">' + item.tag + '</span>';
    if (item.slot) {
      html += ' <span style="color:#fab387;font-weight:bold">' + item.slot + '</span>';
    }
    html += ' <span style="color:#6c7086">\\u2014</span> ';
    html += '<span style="color:#89b4fa">' + parent + file + '</span>';
    if (hierarchy.length > 1) {
      html += ' <span style="color:#585b70">(' + (hierarchyIndex + 1) + '/' + hierarchy.length + ')</span>';
    }
    html += '</div>';

    // Show CSS details only when pinned (after first click)
    if (frozen) {
      const computed = getComputedStyle(item.el);

      // Properties to show, in display order
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

      // Default values — skip these
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

      // Map longhand sides to shorthand names
      const SIDE_SHORTHANDS = {
        'padding-top': 'padding', 'padding-right': 'padding', 'padding-bottom': 'padding', 'padding-left': 'padding',
        'margin-top': 'margin', 'margin-right': 'margin', 'margin-bottom': 'margin', 'margin-left': 'margin',
        'border-top-width': 'border-width', 'border-right-width': 'border-width', 'border-bottom-width': 'border-width', 'border-left-width': 'border-width',
        'border-top-color': 'border-color', 'border-right-color': 'border-color', 'border-bottom-color': 'border-color', 'border-left-color': 'border-color',
        'border-top-left-radius': 'border-radius', 'border-top-right-radius': 'border-radius', 'border-bottom-right-radius': 'border-radius', 'border-bottom-left-radius': 'border-radius',
        'overflow-x': 'overflow', 'overflow-y': 'overflow',
      };

      // Build a map: CSS property → { raw values from stylesheet, class names }
      // Searches recursively through @layer and @media rules
      const twMap = {};
      function searchRules(rules, cls, escaped) {
        for (const rule of rules) {
          // Recurse into @layer, @media, @supports, etc.
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
        const classes = item.cls.split(/\\s+/);
        for (const cls of classes) {
          const escaped = CSS.escape(cls);
          for (const sheet of document.styleSheets) {
            try { searchRules(sheet.cssRules, cls, escaped); } catch(e) {}
          }
        }
      }

      // Read shorthand computed values by collapsing sides
      function getShorthand(sides) {
        const vals = sides.map(function(s) { return computed.getPropertyValue(s); });
        if (vals.every(function(v) { return v === vals[0]; })) return vals[0];
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

        // For colors: prefer CSS var() from stylesheet over resolved hex
        let displayVal;
        if (isClr && tw) {
          // Get raw value from stylesheet (e.g. "var(--color-blue-500)")
          const rawVals = Object.values(tw.rawValues);
          const varVal = rawVals.find(function(v) { return v.includes('var('); });
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

  // ── Display helpers ────────────────────────────────────────────────

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
    setTimeout(function() {
      highlight.style.background = 'rgba(59, 130, 246, 0.15)';
      highlight.style.borderColor = 'rgba(59, 130, 246, 0.8)';
    }, 300);
  }

  // ── Event handlers ─────────────────────────────────────────────────

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Alt') {
      e.preventDefault();
      if (!altDown) {
        altLastDown = Date.now();
        altMoved = false;
      }
      return;
    }

    // Navigate hierarchy with arrow keys
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

    // Enter: pin selection (same as first click)
    if (e.key === 'Enter' && altDown && hierarchy.length > 0 && !frozen) {
      e.preventDefault();
      frozen = true;
      tooltip.style.pointerEvents = 'auto';
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    }

    // Escape: unpin tooltip, or turn off inspect mode
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
  }, true);

  document.addEventListener('keyup', function(e) {
    if (e.key !== 'Alt') return;
    e.preventDefault();

    const elapsed = Date.now() - altLastDown;

    if (elapsed < 300 && !altMoved) {
      // Quick tap → toggle inspect mode on/off
      altDown = !altDown;
      if (!altDown) hideAll();
    } else if (altMoved) {
      // Was holding Alt + moving mouse → turn off on release
      altDown = false;
      hideAll();
    }
  }, true);

  document.addEventListener('mouseover', function(e) {
    // Detect Alt held via keyboard event flag (covers hold-and-drag)
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
  }, true);

  // Navigate hierarchy with scroll wheel
  document.addEventListener('wheel', function(e) {
    if (!altDown || hierarchy.length === 0) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      hierarchyIndex = Math.min(hierarchyIndex + 1, hierarchy.length - 1);
    } else {
      hierarchyIndex = Math.max(hierarchyIndex - 1, 0);
    }
    updateDisplay();
  }, { passive: false, capture: true });

  // Click: first click pins tooltip with CSS details, second click copies path
  document.addEventListener('click', function(e) {
    if (!altDown || hierarchy.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (frozen) {
      // Copy only the active item's source path to clipboard
      const active = hierarchy[hierarchyIndex];
      navigator.clipboard.writeText(active.source).then(flashGreen);
      unfreeze();
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    } else {
      // Pin tooltip — expand with full CSS details
      frozen = true;
      tooltip.style.pointerEvents = 'auto';
      renderTooltip();
      positionTooltip(hierarchy[hierarchyIndex].el);
    }
  }, true);

  // ── HMR cleanup ────────────────────────────────────────────────────
  if (import.meta.hot) {
    import.meta.hot.dispose(function() {
      highlight.remove();
      tooltip.remove();
      window.__sourcePickerActive = false;
    });
  }
})();
`
}
