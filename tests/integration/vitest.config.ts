import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@xnetjs/data': path.resolve(__dirname, '../../packages/data/src'),
      '@xnetjs/crypto': path.resolve(__dirname, '../../packages/crypto/src'),
      '@xnetjs/identity': path.resolve(__dirname, '../../packages/identity/src'),
      '@xnetjs/react': path.resolve(__dirname, '../../packages/react/src'),
      '@xnetjs/core': path.resolve(__dirname, '../../packages/core/src'),
      '@xnetjs/storage': path.resolve(__dirname, '../../packages/storage/src'),
      '@xnetjs/sync': path.resolve(__dirname, '../../packages/sync/src')
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
