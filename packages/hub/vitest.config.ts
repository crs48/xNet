import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    server: {
      deps: {
        external: ['better-sqlite3', 'ws', '@hono/node-server']
      }
    }
  }
})
