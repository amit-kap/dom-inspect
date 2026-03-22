import type { PluginObj } from '@babel/core'
import * as t from '@babel/types'

/**
 * Babel plugin that injects `data-source="path/to/file.tsx:42"` on every JSX element.
 *
 * Skips:
 * - Files outside the project root
 * - Files inside node_modules
 * - Fragments (<> and <React.Fragment>)
 * - Elements that already have a data-source attribute
 */
export function sourcePickerBabelPlugin(projectRoot: string): PluginObj {
  const root = projectRoot.endsWith('/') ? projectRoot : projectRoot + '/'

  return {
    name: 'source-picker',
    visitor: {
      JSXOpeningElement(path, state) {
        const filename = (state as any).filename as string | undefined
        if (!filename) return
        if (!filename.startsWith(root)) return

        const relativePath = filename.slice(root.length)
        if (relativePath.includes('node_modules')) return

        const line = path.node.loc?.start.line
        if (line == null) return

        // Don't add duplicate attributes
        const attrs = path.node.attributes
        for (const attr of attrs) {
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'data-source' })) {
            return
          }
        }

        // Skip fragments
        const name = path.node.name
        if (t.isJSXIdentifier(name) && name.name === 'Fragment') return
        if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.property, { name: 'Fragment' })) return

        // Shorten path to parent/file.tsx:line (2 levels max)
        const segments = relativePath.split('/')
        const shortPath = segments.length > 2
          ? segments.slice(-2).join('/')
          : relativePath

        attrs.push(
          t.jsxAttribute(
            t.jsxIdentifier('data-source'),
            t.stringLiteral(`${shortPath}:${line}`),
          ),
        )
      },
    },
  }
}
