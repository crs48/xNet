import path from 'path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/app/',
  build: {
    // Target modern browsers for SQLite WASM + OPFS support
    // Safari 16.4+ is required for OPFS
    target: ['es2022', 'safari16.4', 'chrome102', 'firefox111'],
    rollupOptions: {
      external: [
        'mermaid' // Optional peer dependency - dynamically imported in @xnet/canvas
      ]
    }
  },
  resolve: {
    alias: {
      // Use source files directly for hot reload during development
      '@xnet/react': path.resolve(__dirname, '../../packages/react/src')
    }
  },
  optimizeDeps: {
    // Exclude sqlite-wasm from pre-bundling as it needs special handling
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  worker: {
    format: 'es'
  },
  plugins: [
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
        start_url: '/app/',
        scope: '/app/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
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
