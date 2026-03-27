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
      direction: 'ltr',
      textAlign: 'left',
    });
    document.body.appendChild(tooltip);

    // Prevent scroll from leaking out of tooltip to the page
    tooltip.addEventListener('wheel', function(e) {
      var atTop = tooltip.scrollTop === 0;
      var atBottom = tooltip.scrollTop + tooltip.clientHeight >= tooltip.scrollHeight;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        e.preventDefault();
      }
    }, { passive: false });

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
        items.push({ source, tag, cls, id, slot, el: node });
      } else if (tag) {
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

    html += '<span style="color:#cdd6f4;font-weight:bold">' + item.tag + '</span>';

    if (item.slot) {
      html += ' <span style="color:#fab387;font-weight:bold">' + item.slot + '</span>';
    }

    html += ' <span style="color:#6c7086">\u2014</span> ';

    if (item.source) {
      const parts = item.source.split('/');
      const file = parts.pop();
      const parent = parts.length > 0 ? parts.pop() + '/' : '';
      html += '<span style="color:#89b4fa">' + parent + file + '</span>';
    } else {
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

    if (hierarchy.length > 1) {
      html += ' <span style="color:#585b70">(' + (hierarchyIndex + 1) + '/' + hierarchy.length + ')</span>';
    }
    html += '</div>';

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
        'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
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
      const hasBorder = getComputedVal('border-width') !== '0px' && getComputedVal('border-width') !== '0px 0px 0px 0px';
      for (const prop of DISPLAY_PROPS) {
        const val = getComputedVal(prop);
        const isDefault = !val || val === DEFAULTS[prop] || val === '0px' || val === '0px 0px' || val === '0px 0px 0px 0px';
        if (isDefault) continue;

        // Skip border-color when there's no visible border
        if (prop === 'border-color' && !hasBorder) continue;
        // Skip background-color when transparent (inherited/not set)
        if (prop === 'background-color' && (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')) continue;

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

      // Layout summary line
      var summary = [];
      var disp = computed.getPropertyValue('display');
      var pos = computed.getPropertyValue('position');
      if (pos !== 'static') summary.push(pos);
      if (disp === 'flex' || disp === 'inline-flex') {
        var dir = computed.getPropertyValue('flex-direction');
        summary.push(disp === 'inline-flex' ? 'inline-flex' : 'flex');
        if (dir === 'column' || dir === 'column-reverse') summary.push(dir);
        var jc = computed.getPropertyValue('justify-content');
        var ai = computed.getPropertyValue('align-items');
        if (jc !== 'normal' && jc !== 'flex-start') summary.push('justify: ' + jc);
        if (ai !== 'normal' && ai !== 'stretch') summary.push('align: ' + ai);
      } else if (disp === 'grid' || disp === 'inline-grid') {
        summary.push(disp);
      } else if (disp !== 'block') {
        summary.push(disp);
      }
      var w = computed.getPropertyValue('width');
      var h = computed.getPropertyValue('height');
      if (w && h) summary.push(parseInt(w) + ' \u00d7 ' + parseInt(h));
      var pt = parseInt(computed.getPropertyValue('padding-top')) || 0;
      var pr = parseInt(computed.getPropertyValue('padding-right')) || 0;
      var pb = parseInt(computed.getPropertyValue('padding-bottom')) || 0;
      var pl = parseInt(computed.getPropertyValue('padding-left')) || 0;
      if (pt || pr || pb || pl) {
        if (pt === pb && pl === pr && pt === pl) summary.push('p: ' + pt);
        else if (pt === pb && pl === pr) summary.push('py: ' + pt + ' px: ' + pl);
        else summary.push('p: ' + pt + ' ' + pr + ' ' + pb + ' ' + pl);
      }
      var gapVal = computed.getPropertyValue('gap');
      if (gapVal && gapVal !== 'normal' && gapVal !== '0px') summary.push('gap: ' + parseInt(gapVal));

      if (summary.length > 0) {
        html += '<div style="border-top:1px solid #313244;margin-top:4px;padding-top:4px;color:#89b4fa;font-size:11px">'
          + summary.join(' \u00b7 ') + '</div>';
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
    tooltip.innerHTML = '<div style="color:#22c55e;font-weight:600">\u2713 Copied</div>';
    tooltip.style.display = 'block';
    setTimeout(function () {
      highlight.style.background = 'rgba(59, 130, 246, 0.15)';
      highlight.style.borderColor = 'rgba(59, 130, 246, 0.8)';
    }, 600);
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
    if (frozen) {
      if (!tooltip.contains(e.target)) e.preventDefault();
      return;
    }
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
