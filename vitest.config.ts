import { defineConfig } from 'vitest/config'

// Disable coverage thresholds in CI when running sharded tests
// (each shard only sees partial coverage, so thresholds will always fail)
const skipThresholds = process.env.CI === 'true'

const workspaceAliases = {
  '@xnetjs/canvas': new URL('./packages/canvas/src/index.ts', import.meta.url).pathname,
  '@xnetjs/cli': new URL('./packages/cli/src/index.ts', import.meta.url).pathname,
  '@xnetjs/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
  '@xnetjs/crypto': new URL('./packages/crypto/src/index.ts', import.meta.url).pathname,
  '@xnetjs/data': new URL('./packages/data/src/index.ts', import.meta.url).pathname,
  '@xnetjs/data-bridge': new URL('./packages/data-bridge/src/index.ts', import.meta.url).pathname,
  '@xnetjs/devtools': new URL('./packages/devtools/src/index.ts', import.meta.url).pathname,
  '@xnetjs/editor': new URL('./packages/editor/src/index.ts', import.meta.url).pathname,
  '@xnetjs/formula': new URL('./packages/formula/src/index.ts', import.meta.url).pathname,
  '@xnetjs/history': new URL('./packages/history/src/index.ts', import.meta.url).pathname,
  '@xnetjs/hub': new URL('./packages/hub/src/index.ts', import.meta.url).pathname,
  '@xnetjs/identity': new URL('./packages/identity/src/index.ts', import.meta.url).pathname,
  '@xnetjs/network': new URL('./packages/network/src/index.ts', import.meta.url).pathname,
  '@xnetjs/plugins': new URL('./packages/plugins/src/index.ts', import.meta.url).pathname,
  '@xnetjs/query': new URL('./packages/query/src/index.ts', import.meta.url).pathname,
  '@xnetjs/react': new URL('./packages/react/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sdk': new URL('./packages/sdk/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sqlite': new URL('./packages/sqlite/src/index.ts', import.meta.url).pathname,
  '@xnetjs/storage': new URL('./packages/storage/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sync': new URL('./packages/sync/src/index.ts', import.meta.url).pathname,
  '@xnetjs/telemetry': new URL('./packages/telemetry/src/index.ts', import.meta.url).pathname,
  '@xnetjs/ui': new URL('./packages/ui/src/index.ts', import.meta.url).pathname,
  '@xnetjs/vectors': new URL('./packages/vectors/src/index.ts', import.meta.url).pathname,
  '@xnetjs/views': new URL('./packages/views/src/index.ts', import.meta.url).pathname
}

export default defineConfig({
  resolve: {
    alias: workspaceAliases
  },
  test: {
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/index.ts'],
      thresholds: skipThresholds
        ? undefined
        : {
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
            'packages/{cli,crypto,core,data,formula,history,identity,network,query,sqlite,storage,sync,telemetry,vectors}/src/**/*.test.ts',
            'packages/{cli,crypto,core,data,formula,history,identity,network,query,sqlite,storage,sync,telemetry,vectors}/test/**/*.test.ts'
          ],
          // data-bridge tests run separately - they have Yjs module import order issues
          // when combined with other tests in the same worker thread
          exclude: ['packages/data-bridge/**']
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
        },
        resolve: {
          alias: {
            // Mock mermaid for canvas tests (optional peer dependency)
            mermaid: new URL('./packages/canvas/src/__mocks__/mermaid.ts', import.meta.url).pathname
          }
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
      },
      {
        // Data-bridge package — isolate to avoid Yjs module import conflicts
        extends: true,
        test: {
          name: 'data-bridge',
          environment: 'node',
          pool: 'forks',
          isolate: true,
          include: ['packages/data-bridge/src/**/*.test.ts']
        }
      }
    ]
  }
})
