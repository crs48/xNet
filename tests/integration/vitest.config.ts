import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@xnet/data': path.resolve(__dirname, '../../packages/data/src'),
      '@xnet/crypto': path.resolve(__dirname, '../../packages/crypto/src'),
      '@xnet/identity': path.resolve(__dirname, '../../packages/identity/src'),
      '@xnet/react': path.resolve(__dirname, '../../packages/react/src'),
      '@xnet/core': path.resolve(__dirname, '../../packages/core/src'),
      '@xnet/storage': path.resolve(__dirname, '../../packages/storage/src'),
      '@xnet/sync': path.resolve(__dirname, '../../packages/sync/src')
    }
  },
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    include: ['src/**/*.test.{ts,tsx}']
  }
})
