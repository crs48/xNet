import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { coopCoepHeaders } from './vite-plugins/coop-coep-headers'

// Base path for deployment (default: '/', set VITE_BASE_PATH for custom paths like '/app/')
const basePath = process.env.VITE_BASE_PATH || '/'

// App version, injected at build time so the About page and the in-app
// "What's New" surface (exploration 0195) can show the running version.
//
// major.minor is the human-set base in package.json; the patch is derived from
// git — the number of first-parent commits on the current history that touched
// the web app or its workspace packages — so every merge to main that changes
// the app ships with a new version, with no manual bookkeeping. Shallow clones
// (PR CI) and git-less builds fall back to the package.json version verbatim;
// the production deploy checks out with fetch-depth: 0, so it always gets the
// full count.
function resolveAppVersion(): string {
  const base = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
    .version as string
  try {
    const git = (args: string) =>
      execSync(`git ${args}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    if (git('rev-parse --is-shallow-repository') === 'true') return base
    const patch = git('rev-list --count --first-parent HEAD -- ":(top)apps/web" ":(top)packages"')
    const [major, minor] = base.split('.')
    return `${major}.${minor}.${patch}`
  } catch {
    return base
  }
}
const appVersion = resolveAppVersion()

export default defineConfig({
  base: basePath,
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
  },
  build: {
    // Target modern browsers for SQLite WASM + OPFS support
    // Safari 16.4+ is required for OPFS
    target: ['es2022', 'safari16.4', 'chrome102', 'firefox111'],
    rollupOptions: {
      external: [
        'mermaid', // Optional peer dependency - dynamically imported in @xnetjs/canvas
        'web-worker', // Optional peer dependency of elkjs
        // Native Node HNSW addon (imports node:fs / node-gyp-build) — not bundleable
        // for the browser. @xnetjs/vectors dynamically imports it and falls back to a
        // pure-JS LinearVectorIndex when it's absent, which is what runs in the browser.
        'usearch'
      ],
      output: {
        // KaTeX and the emoji catalog (0297/0312) are large leaf libraries
        // pulled in via @xnetjs/editor; split them out so the main chunk
        // stays under the workbox 6 MB precache cap.
        manualChunks(id: string) {
          if (id.includes('node_modules') && id.includes('/katex/')) return 'katex'
          // BlockNote + Mantine + ProseMirror (0312): keep the editor vendor
          // out of the main chunk so no precached file exceeds the workbox
          // 6 MB ceiling.
          if (
            id.includes('@blocknote/') ||
            id.includes('@mantine/') ||
            id.includes('/prosemirror-') ||
            id.includes('/y-prosemirror/')
          ) {
            return 'editor-vendor'
          }
          if (
            id.includes('emojibase-data') ||
            id.includes('emoji-mart') ||
            id.includes('emoji-regex') ||
            id.includes('is-emoji-supported')
          ) {
            return 'emoji'
          }
          return undefined
        }
      }
    }
  },
  resolve: {
    alias: {
      // Use source files directly for hot reload during development
      '@xnetjs/react': path.resolve(__dirname, '../../packages/react/src'),
      '@xnetjs/maps': path.resolve(__dirname, '../../packages/maps/src')
    }
  },
  optimizeDeps: {
    // Exclude sqlite-wasm from pre-bundling as it needs special handling
    // Exclude elkjs as it has optional web-worker dependency
    exclude: ['@sqlite.org/sqlite-wasm', 'elkjs']
  },
  worker: {
    format: 'es'
  },
  plugins: [
    coopCoepHeaders(),
    TanStackRouterVite(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
        'icons/*.png',
        '**/*.wasm'
      ],
      manifest: {
        name: 'xNet',
        short_name: 'xNet',
        description: 'Local-first data platform',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: `${basePath}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: `${basePath}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // WASM is excluded from precache: the Lab runtimes (@swc/wasm-web ~15MB,
        // quickjs-emscripten ~6.6MB) are lazy, on-demand assets — precaching tens
        // of MB at install is wrong; they are fetched the first time a Lab runs.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Increase limit for large bundles (elk.js, canvas, database tooling, etc.)
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          }
        ]
      }
    })
  ]
})
