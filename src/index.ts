import { transformSync } from '@babel/core'
import { sourcePickerBabelPlugin } from './babel-transform.js'
import { getOverlayScript } from './overlay.js'
import type { Plugin } from 'vite'

/**
 * Vite plugin that maps every JSX element to its source file and line number.
 *
 * In dev mode it does two things:
 * 1. Runs a Babel transform that adds `data-source` attributes to all JSX elements
 * 2. Injects a browser overlay that lets you inspect elements and copy source info
 *
 * Everything is stripped in production builds — zero runtime cost.
 */
export function sourcePicker(): Plugin {
  let projectRoot = ''
  let isProduction = false

  return {
    name: 'vite-plugin-source-picker',
    enforce: 'pre', // Run before other plugins so line numbers are accurate

    configResolved(config) {
      projectRoot = config.root
      isProduction = config.isProduction
    },

    // Add data-source attributes to JSX elements
    transform(code, id) {
      if (isProduction) return
      if (!/\.[jt]sx$/.test(id)) return
      if (id.includes('node_modules')) return

      const result = transformSync(code, {
        filename: id,
        plugins: [() => sourcePickerBabelPlugin(projectRoot)],
        parserOpts: { plugins: ['jsx', 'typescript'] },
        retainLines: true,
        sourceType: 'module',
      })

      if (!result?.code) return
      return { code: result.code, map: result.map }
    },

    // Inject the overlay script into the page
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (isProduction) return html
        const script = getOverlayScript()
        return html.replace('</body>', `<script type="module">${script}</script></body>`)
      },
    },
  }
}

export default sourcePicker
