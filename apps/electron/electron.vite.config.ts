import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Support running multiple instances with different ports
const rendererPort = parseInt(process.env.VITE_PORT || '5173', 10)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      conditions: ['development']
    },
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
