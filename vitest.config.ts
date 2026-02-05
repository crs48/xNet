import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/index.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      }
    },
    projects: [
      {
        // Pure TS packages — no DOM, no native modules, no real I/O
        // Safe to share state between test files for maximum speed
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          pool: 'threads',
          isolate: false,
          include: [
            'packages/{crypto,core,data,formula,history,identity,network,query,storage,sync,telemetry,vectors}/src/**/*.test.ts',
            'packages/{crypto,core,data,formula,history,identity,network,query,storage,sync,telemetry,vectors}/test/**/*.test.ts'
          ]
        }
      },
      {
        // DOM packages — need jsdom environment, keep isolation for clean DOM state
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          pool: 'threads',
          isolate: true,
          include: [
            'packages/{canvas,react,views,devtools,ui}/src/**/*.test.{ts,tsx}',
            'packages/{canvas,react,views,devtools,ui}/test/**/*.test.{ts,tsx}'
          ]
        }
      },
      {
        // Integration packages — real WebSocket servers, real I/O
        // Must keep isolation to prevent port conflicts and shared state
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          pool: 'forks',
          isolate: true,
          testTimeout: 15000,
          include: [
            'packages/{hub,plugins,sdk}/src/**/*.test.ts',
            'packages/{hub,plugins,sdk}/test/**/*.test.ts'
          ],
          server: {
            deps: {
              external: ['better-sqlite3', 'ws', '@hono/node-server']
            }
          }
        }
      },
      {
        // Editor package — jsdom + custom setup file
        extends: true,
        test: {
          name: 'editor',
          environment: 'jsdom',
          pool: 'threads',
          isolate: true,
          setupFiles: ['./packages/editor/src/test/setup.ts'],
          include: ['packages/editor/src/**/*.test.{ts,tsx}']
        }
      }
    ]
  }
})
