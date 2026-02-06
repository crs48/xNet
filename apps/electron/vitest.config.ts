import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    server: {
      deps: {
        // better-sqlite3 is a native module that needs to be externalized
        external: ['better-sqlite3', 'electron']
      }
    }
  }
})
