/**
 * Vite plugin to add COOP/COEP headers for OPFS support in development.
 *
 * These headers enable SharedArrayBuffer and full OPFS support in Playwright tests.
 * Only applied in dev mode - production static hosting doesn't need these headers
 * because we use opfs-sahpool VFS which doesn't require them.
 */
import type { Plugin } from 'vite'

export function coopCoepHeaders(): Plugin {
  const applyHeaders = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void }
  ) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.url?.includes('/share')) {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    }
  }

  return {
    name: 'coop-coep-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req, res)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req, res)
        next()
      })
    }
  }
}
