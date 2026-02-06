import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Support running multiple instances with different ports
const rendererPort = parseInt(process.env.VITE_PORT || '5177', 10)

// Common xNet packages to bundle (not externalize)
const xnetPackages = [
  '@xnet/sdk',
  '@xnet/core',
  '@xnet/crypto',
  '@xnet/identity',
  '@xnet/storage',
  '@xnet/sync',
  '@xnet/data',
  '@xnet/query',
  '@xnet/telemetry',
  '@xnet/plugins'
]

// Path to rebuilt native modules in local node_modules
// We use absolute paths so Electron loads the correctly rebuilt native modules
const localNodeModules = resolve(__dirname, 'node_modules')
const betterSqlite3Path = resolve(localNodeModules, 'better-sqlite3')

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: xnetPackages
      })
    ],
    build: {
      rollupOptions: {
        // Main process entry points: main index + data utility process
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'data-process/index': resolve(__dirname, 'src/data-process/index.ts')
        },
        external: [
          // Use absolute path for better-sqlite3 so it loads from apps/electron/node_modules
          // which has the correctly rebuilt native binding for Electron
          betterSqlite3Path,
          'acorn',
          'ws'
        ],
        output: {
          // Rewrite imports of the absolute path back to the bare specifier
          // so the bundled code still imports "better-sqlite3" but Node resolves it correctly
          paths: {
            [betterSqlite3Path]: 'better-sqlite3'
          }
        }
      }
    },
    resolve: {
      alias: {
        // Resolve better-sqlite3 to local rebuilt version during bundling
        'better-sqlite3': betterSqlite3Path
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // Must be CJS for sandboxed preload scripts
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    server: {
      port: rendererPort
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
        external: ['web-worker']
      }
    },
    optimizeDeps: {
      exclude: ['elkjs']
    },
    plugins: [react()]
  }
})
