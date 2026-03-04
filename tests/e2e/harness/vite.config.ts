import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = resolve(__dirname, '../../..')

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  server: {
    port: parseInt(process.env.HARNESS_PORT || '15200', 10),
    strictPort: true
  },
  resolve: {
    alias: {
      '@xnetjs/views': resolve(rootDir, 'packages/views/src'),
      '@xnetjs/data': resolve(rootDir, 'packages/data/src'),
      '@xnetjs/ui': resolve(rootDir, 'packages/ui/src'),
      '@xnetjs/react': resolve(rootDir, 'packages/react/src'),
      '@xnetjs/core': resolve(rootDir, 'packages/core/src'),
      '@xnetjs/sync': resolve(rootDir, 'packages/sync/src'),
      '@xnetjs/identity': resolve(rootDir, 'packages/identity/src'),
      '@xnetjs/storage': resolve(rootDir, 'packages/storage/src'),
      '@xnetjs/crypto': resolve(rootDir, 'packages/crypto/src')
    }
  },
  optimizeDeps: {
    exclude: ['elkjs']
  }
})
