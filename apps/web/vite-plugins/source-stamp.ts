/**
 * Vite plugin that routes the dev JSX runtime through the stamping shim
 * (exploration 0399).
 *
 * The pure logic and the reasoning behind this design live in
 * `src/dev/source-stamp.ts`; this file is only the wiring.
 */
import type { Plugin } from 'vite'

/**
 * The fake package the JSX import source points at in dev.
 *
 * esbuild emits `import { jsxDEV } from "<jsxImportSource>/jsx-dev-runtime"`, so
 * naming a package we then alias to the shim keeps the shim's own
 * `react/jsx-dev-runtime` import from resolving back to itself.
 *
 * Declared here rather than beside the pure logic in `src/dev/source-stamp.ts`:
 * `vite-plugins/` is a separate composite project, and importing across that
 * boundary makes one project require built declarations of the other.
 */
export const JSX_IMPORT_SOURCE = 'xnet-jsx'

/**
 * Vite plugin: route the dev JSX runtime through the stamping shim.
 *
 * Only ever registered for `command === 'serve'` — see `vite.config.ts`.
 */
export function sourceStampPlugin(options: { shimPath: string }): Plugin {
  return {
    name: 'xnet-source-stamp',
    enforce: 'pre',
    config() {
      return {
        resolve: {
          alias: [
            // Exact match: the shim itself imports `react/jsx-dev-runtime`, and
            // a prefix alias on that specifier would send it back to the shim.
            {
              find: new RegExp(`^${JSX_IMPORT_SOURCE}/jsx-dev-runtime$`),
              replacement: options.shimPath
            },
            // The production-shaped runtime is never stamped, but esbuild can
            // still emit it; point it at the real thing.
            {
              find: new RegExp(`^${JSX_IMPORT_SOURCE}/jsx-runtime$`),
              replacement: 'react/jsx-runtime'
            }
          ]
        }
      }
    }
  }
}
