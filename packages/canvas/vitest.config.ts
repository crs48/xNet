import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 30000
  },
  resolve: {
    alias: {
      // Mock mermaid for tests (optional peer dependency)
      mermaid: path.resolve(__dirname, 'src/__mocks__/mermaid.ts')
    }
  }
})
