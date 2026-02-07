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
      '@xnet/views': resolve(rootDir, 'packages/views/src'),
      '@xnet/data': resolve(rootDir, 'packages/data/src'),
      '@xnet/ui': resolve(rootDir, 'packages/ui/src'),
      '@xnet/react': resolve(rootDir, 'packages/react/src'),
      '@xnet/core': resolve(rootDir, 'packages/core/src'),
      '@xnet/sync': resolve(rootDir, 'packages/sync/src'),
      '@xnet/identity': resolve(rootDir, 'packages/identity/src'),
      '@xnet/storage': resolve(rootDir, 'packages/storage/src'),
      '@xnet/crypto': resolve(rootDir, 'packages/crypto/src')
    }
  },
  optimizeDeps: {
    exclude: ['elkjs']
  }
})
