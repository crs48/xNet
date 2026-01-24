import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Support running multiple instances with different ports
const rendererPort = parseInt(process.env.VITE_PORT || '5177', 10)

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@xnet/sdk',
          '@xnet/core',
          '@xnet/crypto',
          '@xnet/identity',
          '@xnet/storage',
          '@xnet/sync',
          '@xnet/data',
          '@xnet/query',
          '@xnet/telemetry'
        ]
      })
    ],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
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
