/**
 * Vite plugin to add COOP/COEP headers for OPFS support in development.
 *
 * These headers enable SharedArrayBuffer and full OPFS support in Playwright tests.
 * Only applied in dev mode - production static hosting doesn't need these headers
 * because we use opfs-sahpool VFS which doesn't require them.
 */
import type { Plugin } from 'vite'

export function coopCoepHeaders(): Plugin {
  return {
    name: 'coop-coep-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    }
  }
}
