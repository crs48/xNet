import fs from 'node:fs'
import path from 'path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { coopCoepHeaders } from './vite-plugins/coop-coep-headers'

// Base path for deployment (default: '/', set VITE_BASE_PATH for custom paths like '/app/')
const basePath = process.env.VITE_BASE_PATH || '/'
const workspacePackagesDir = path.resolve(__dirname, '../../packages')

type PackageJsonExports =
  | string
  | {
      import?: string
      default?: string
      development?: string
      require?: string
      types?: string
    }

function resolveSourceExportPath(packageDir: string, exportTarget: string): string | null {
  const normalizedTarget = exportTarget.replace(/\\/g, '/')
  const candidates = [
    normalizedTarget,
    normalizedTarget.replace(/^\.\/dist\//, './src/'),
    normalizedTarget.replace(/^\.\/dist\//, './src/').replace(/\.d\.ts$/, '.ts'),
    normalizedTarget.replace(/^\.\/dist\//, './src/').replace(/\.(?:mjs|cjs|js)$/, '.ts'),
    normalizedTarget.replace(/^\.\/dist\//, './src/').replace(/\.(?:mjs|cjs|js)$/, '.tsx')
  ]

  for (const candidate of candidates) {
    const resolved = path.resolve(packageDir, candidate)
    if (fs.existsSync(resolved)) {
      return resolved
    }
  }

  return null
}

function getImportTarget(entry: PackageJsonExports): string | null {
  if (typeof entry === 'string') {
    return entry
  }

  return entry.import ?? entry.development ?? entry.default ?? entry.require ?? entry.types ?? null
}

function buildWorkspaceSourceAliases(): { find: string; replacement: string }[] {
  const packageDirs = fs
    .readdirSync(workspacePackagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(workspacePackagesDir, entry.name))

  const aliases = packageDirs.flatMap((packageDir) => {
    const packageJsonPath = path.resolve(packageDir, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return []
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      name?: string
      exports?: Record<string, PackageJsonExports>
    }

    if (!packageJson.name?.startsWith('@xnetjs/') || !packageJson.exports) {
      return []
    }

    return Object.entries(packageJson.exports)
      .map(([exportKey, exportValue]) => {
        const target = getImportTarget(exportValue)
        if (!target) {
          return null
        }

        const resolvedSourcePath = resolveSourceExportPath(packageDir, target)
        if (!resolvedSourcePath) {
          return null
        }

        const find =
          exportKey === '.'
            ? packageJson.name
            : `${packageJson.name}/${exportKey.replace(/^\.\//, '')}`

        return {
          find,
          replacement: resolvedSourcePath
        }
      })
      .filter((entry): entry is { find: string; replacement: string } => entry !== null)
  })

  return aliases.sort((left, right) => right.find.length - left.find.length)
}

const workspaceSourceAliases = buildWorkspaceSourceAliases()

export default defineConfig({
  base: basePath,
  build: {
    // Target modern browsers for SQLite WASM + OPFS support
    // Safari 16.4+ is required for OPFS
    target: ['es2022', 'safari16.4', 'chrome102', 'firefox111'],
    rollupOptions: {
      external: [
        'mermaid', // Optional peer dependency - dynamically imported in @xnetjs/canvas
        'web-worker' // Optional peer dependency of elkjs
      ]
    }
  },
  resolve: {
    alias: workspaceSourceAliases
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
      includeAssets: ['favicon.ico', 'icons/*.png', '**/*.wasm'],
      manifest: {
        name: 'xNet',
        short_name: 'xNet',
        description: 'Local-first data platform',
        theme_color: '#ffffff',
        background_color: '#ffffff',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        // Increase limit for large bundles (elk.js, canvas, etc.)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
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
