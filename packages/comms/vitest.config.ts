import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000
  },
  resolve: {
    alias: {
      '@xnetjs/data': path.resolve(__dirname, '../data/src/index.ts'),
      '@xnetjs/crypto': path.resolve(__dirname, '../crypto/src/index.ts')
    }
  }
})
