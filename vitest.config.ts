import { defineConfig } from 'vitest/config'

// Disable coverage thresholds in CI when running sharded tests
// (each shard only sees partial coverage, so thresholds will always fail)
const skipThresholds = process.env.CI === 'true'

const workspaceAliases = {
  '@xnetjs/abuse': new URL('./packages/abuse/src/index.ts', import.meta.url).pathname,
  '@xnetjs/billing': new URL('./packages/billing/src/index.ts', import.meta.url).pathname,
  '@xnetjs/brain': new URL('./packages/brain/src/index.ts', import.meta.url).pathname,
  '@xnetjs/canvas': new URL('./packages/canvas/src/index.ts', import.meta.url).pathname,
  '@xnetjs/canvas-core': new URL('./packages/canvas-core/src/index.ts', import.meta.url).pathname,
  '@xnetjs/cli': new URL('./packages/cli/src/index.ts', import.meta.url).pathname,
  '@xnetjs/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
  '@xnetjs/crm': new URL('./packages/crm/src/index.ts', import.meta.url).pathname,
  '@xnetjs/crypto': new URL('./packages/crypto/src/index.ts', import.meta.url).pathname,
  '@xnetjs/charts': new URL('./packages/charts/src/index.ts', import.meta.url).pathname,
  '@xnetjs/entitlements': new URL('./packages/entitlements/src/index.ts', import.meta.url).pathname,
  // Subpath aliases MUST precede the bare '@xnetjs/cloud' (Vite uses first match).
  '@xnetjs/cloud/provisioner': new URL('./packages/cloud/src/provisioner/index.ts', import.meta.url)
    .pathname,
  '@xnetjs/cloud/identity': new URL('./packages/cloud/src/identity/index.ts', import.meta.url)
    .pathname,
  '@xnetjs/cloud/billing': new URL('./packages/cloud/src/billing/index.ts', import.meta.url)
    .pathname,
  '@xnetjs/cloud/ai': new URL('./packages/cloud/src/ai/index.ts', import.meta.url).pathname,
  '@xnetjs/cloud/storage': new URL('./packages/cloud/src/storage/index.ts', import.meta.url)
    .pathname,
  '@xnetjs/cloud/litestream': new URL('./packages/cloud/src/litestream/index.ts', import.meta.url)
    .pathname,
  '@xnetjs/cloud/cost': new URL('./packages/cloud/src/cost/index.ts', import.meta.url).pathname,
  '@xnetjs/cloud': new URL('./packages/cloud/src/index.ts', import.meta.url).pathname,
  '@xnetjs/dashboard': new URL('./packages/dashboard/src/index.ts', import.meta.url).pathname,
  '@xnetjs/data': new URL('./packages/data/src/index.ts', import.meta.url).pathname,
  '@xnetjs/data-bridge': new URL('./packages/data-bridge/src/index.ts', import.meta.url).pathname,
  '@xnetjs/devkit': new URL('./packages/devkit/src/index.ts', import.meta.url).pathname,
  '@xnetjs/devtools': new URL('./packages/devtools/src/index.ts', import.meta.url).pathname,
  '@xnetjs/dictation': new URL('./packages/dictation/src/index.ts', import.meta.url).pathname,
  '@xnetjs/experiments': new URL('./packages/experiments/src/index.ts', import.meta.url).pathname,
  '@xnetjs/editor/react': new URL('./packages/editor/src/react.ts', import.meta.url).pathname,
  '@xnetjs/editor/extensions': new URL('./packages/editor/src/extensions.ts', import.meta.url)
    .pathname,
  '@xnetjs/editor': new URL('./packages/editor/src/index.ts', import.meta.url).pathname,
  '@xnetjs/formula': new URL('./packages/formula/src/index.ts', import.meta.url).pathname,
  '@xnetjs/history': new URL('./packages/history/src/index.ts', import.meta.url).pathname,
  '@xnetjs/hub': new URL('./packages/hub/src/index.ts', import.meta.url).pathname,
  '@xnetjs/identity': new URL('./packages/identity/src/index.ts', import.meta.url).pathname,
  '@xnetjs/labs': new URL('./packages/labs/src/index.ts', import.meta.url).pathname,
  '@xnetjs/ledger': new URL('./packages/ledger/src/index.ts', import.meta.url).pathname,
  '@xnetjs/licenses': new URL('./packages/licenses/src/index.ts', import.meta.url).pathname,
  '@xnetjs/maps': new URL('./packages/maps/src/index.ts', import.meta.url).pathname,
  '@xnetjs/meetings': new URL('./packages/meetings/src/index.ts', import.meta.url).pathname,
  '@xnetjs/network': new URL('./packages/network/src/index.ts', import.meta.url).pathname,
  '@xnetjs/plugins/node': new URL('./packages/plugins/src/services/node.ts', import.meta.url)
    .pathname,
  '@xnetjs/plugins': new URL('./packages/plugins/src/index.ts', import.meta.url).pathname,
  '@xnetjs/query': new URL('./packages/query/src/index.ts', import.meta.url).pathname,
  '@xnetjs/react/internal': new URL('./packages/react/src/internal.ts', import.meta.url).pathname,
  '@xnetjs/react': new URL('./packages/react/src/index.ts', import.meta.url).pathname,
  '@xnetjs/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sdk': new URL('./packages/sdk/src/index.ts', import.meta.url).pathname,
  '@xnetjs/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname,
  '@xnetjs/slack-compat': new URL('./packages/slack-compat/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sqlite/memory': new URL('./packages/sqlite/src/adapters/memory.ts', import.meta.url)
    .pathname,
  '@xnetjs/sqlite/electron': new URL('./packages/sqlite/src/adapters/electron.ts', import.meta.url)
    .pathname,
  '@xnetjs/sqlite/web': new URL('./packages/sqlite/src/adapters/web.ts', import.meta.url).pathname,
  '@xnetjs/sqlite': new URL('./packages/sqlite/src/index.ts', import.meta.url).pathname,
  '@xnetjs/storage': new URL('./packages/storage/src/index.ts', import.meta.url).pathname,
  '@xnetjs/sync': new URL('./packages/sync/src/index.ts', import.meta.url).pathname,
  '@xnetjs/telemetry': new URL('./packages/telemetry/src/index.ts', import.meta.url).pathname,
  '@xnetjs/trust': new URL('./packages/trust/src/index.ts', import.meta.url).pathname,
  '@xnetjs/ui': new URL('./packages/ui/src/index.ts', import.meta.url).pathname,
  '@xnetjs/unreal': new URL('./packages/unreal/src/index.ts', import.meta.url).pathname,
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
            'packages/{abuse,billing,brain,canvas-core,cli,cloud,crm,dictation,meetings,entitlements,comms,crypto,core,data,experiments,formula,history,identity,ledger,licenses,network,query,slack-compat,sqlite,storage,sync,telemetry,trust,vectors}/src/**/*.test.ts',
            'packages/{abuse,billing,brain,canvas-core,cli,cloud,crm,dictation,meetings,entitlements,comms,crypto,core,data,experiments,formula,history,identity,ledger,licenses,network,query,slack-compat,sqlite,storage,sync,telemetry,trust,vectors}/test/**/*.test.ts',
            // Control-plane app logic (xNet Cloud — managed-hosting explorations 0174/0175)
            'apps/cloud/src/**/*.test.ts',
            // Social matching layer — pure connect modules only; the
            // social importer/view tests need package subpath resolution that
            // this shared pool doesn't provide, so they stay on the package config.
            'packages/social/src/connect/**/*.test.ts',
            // Feed-definition tests are pure (relative imports + @xnetjs/data
            // only), so they run safely in the shared pool (Charter §Calm, 0234).
            'packages/social/src/feeds/**/*.test.ts'
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
            'packages/{canvas,react,views,devtools,ui,dashboard,charts,maps}/src/**/*.test.{ts,tsx}',
            'packages/{canvas,react,views,devtools,ui,dashboard,charts,maps}/test/**/*.test.{ts,tsx}',
            // App-level logic tests (workbench shell, 0166)
            'apps/web/src/**/*.test.{ts,tsx}'
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
            'packages/{hub,plugins,sdk,devkit,unreal,server}/src/**/*.test.ts',
            'packages/{hub,plugins,sdk,devkit,unreal,server}/test/**/*.test.ts',
            // Native-messaging bridge spike (0289 Option C): plain-ESM host +
            // relay, tested as .mjs (a native host must run without a build).
            // Process/IO heavy (spawns the host, dials the daemon) → forks pool.
            'packages/native-bridge-extension/test/**/*.test.mjs'
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
      },
      {
        // Runtime package (framework-agnostic client + relocated sync) — uses
        // Yjs heavily, so process-isolate like data-bridge; jsdom mirrors the
        // environment these sync tests had while living in @xnetjs/react.
        extends: true,
        test: {
          name: 'runtime',
          environment: 'jsdom',
          pool: 'forks',
          isolate: true,
          include: ['packages/runtime/src/**/*.test.ts']
        }
      },
      {
        // Labs package (0180) — SES lockdown() freezes realm intrinsics and
        // QuickJS loads a WASM module, so each file must be process-isolated.
        extends: true,
        test: {
          name: 'labs',
          environment: 'node',
          pool: 'forks',
          isolate: true,
          include: ['packages/labs/src/**/*.test.ts']
        }
      },
      {
        // Reliability lane (0272) — durability/fault-injection/scale tests.
        // Deterministic simulation (seeded PRNG), child-process crash
        // harnesses, and scale-tier regression suites. Forks + isolation
        // because tests spawn subprocesses and open real on-disk SQLite
        // files. Depth is env-knobbed (XNET_SIM_*, XNET_CRASH_*,
        // XNET_SCALE_*): PR tier stays fast, the soak workflow escalates.
        extends: true,
        test: {
          name: 'reliability',
          environment: 'node',
          pool: 'forks',
          isolate: true,
          testTimeout: 60000,
          hookTimeout: 30000,
          include: ['tests/reliability/**/*.test.ts'],
          server: {
            deps: {
              external: ['better-sqlite3', 'ws']
            }
          }
        }
      },
      {
        // Electron desktop app (0238) — main / renderer / data-process unit tests.
        // Runs under the root aliases above (which resolve every @xnetjs/* to its
        // src entry), so it needs no package build — unlike apps/electron's own
        // config, whose partial alias set fails to resolve @xnetjs/sync|crypto in
        // an unbuilt worktree. The .test.tsx renderer tests opt into jsdom via a
        // per-file `@vitest-environment` docblock. The native better-sqlite3 batch
        // test stays on the app-local config (apps/electron/vitest.config.ts)
        // because it needs an Electron-ABI rebuild that this Node-ABI runner lacks.
        extends: true,
        test: {
          name: 'electron',
          environment: 'node',
          pool: 'forks',
          isolate: true,
          include: ['apps/electron/src/**/*.test.{ts,tsx}'],
          exclude: ['apps/electron/src/__tests__/sqlite-batch.test.ts'],
          server: {
            deps: {
              external: ['better-sqlite3', 'electron']
            }
          }
        },
        resolve: {
          alias: {
            // Match the dom project: stub mermaid (heavy optional peer) for canvas
            // surfaces the renderer component tests pull in.
            mermaid: new URL('./packages/canvas/src/__mocks__/mermaid.ts', import.meta.url).pathname
          }
        }
      }
    ]
  }
})
