import { fileURLToPath } from 'node:url'

export const workspaceAliases = {
  '@xnetjs/canvas': fileURLToPath(new URL('../packages/canvas/src/index.ts', import.meta.url)),
  '@xnetjs/cli': fileURLToPath(new URL('../packages/cli/src/index.ts', import.meta.url)),
  '@xnetjs/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
  '@xnetjs/crypto': fileURLToPath(new URL('../packages/crypto/src/index.ts', import.meta.url)),
  '@xnetjs/data': fileURLToPath(new URL('../packages/data/src/index.ts', import.meta.url)),
  '@xnetjs/data-bridge': fileURLToPath(
    new URL('../packages/data-bridge/src/index.ts', import.meta.url)
  ),
  '@xnetjs/devtools': fileURLToPath(new URL('../packages/devtools/src/index.ts', import.meta.url)),
  '@xnetjs/editor': fileURLToPath(new URL('../packages/editor/src/index.ts', import.meta.url)),
  '@xnetjs/formula': fileURLToPath(new URL('../packages/formula/src/index.ts', import.meta.url)),
  '@xnetjs/history': fileURLToPath(new URL('../packages/history/src/index.ts', import.meta.url)),
  '@xnetjs/hub': fileURLToPath(new URL('../packages/hub/src/index.ts', import.meta.url)),
  '@xnetjs/identity': fileURLToPath(new URL('../packages/identity/src/index.ts', import.meta.url)),
  '@xnetjs/network': fileURLToPath(new URL('../packages/network/src/index.ts', import.meta.url)),
  '@xnetjs/plugins': fileURLToPath(new URL('../packages/plugins/src/index.ts', import.meta.url)),
  '@xnetjs/query': fileURLToPath(new URL('../packages/query/src/index.ts', import.meta.url)),
  '@xnetjs/react/internal': fileURLToPath(
    new URL('../packages/react/src/internal.ts', import.meta.url)
  ),
  '@xnetjs/react': fileURLToPath(new URL('../packages/react/src/index.ts', import.meta.url)),
  '@xnetjs/sdk': fileURLToPath(new URL('../packages/sdk/src/index.ts', import.meta.url)),
  '@xnetjs/sqlite/memory': fileURLToPath(
    new URL('../packages/sqlite/src/adapters/memory.ts', import.meta.url)
  ),
  '@xnetjs/sqlite': fileURLToPath(new URL('../packages/sqlite/src/index.ts', import.meta.url)),
  '@xnetjs/storage': fileURLToPath(new URL('../packages/storage/src/index.ts', import.meta.url)),
  '@xnetjs/sync': fileURLToPath(new URL('../packages/sync/src/index.ts', import.meta.url)),
  '@xnetjs/telemetry': fileURLToPath(
    new URL('../packages/telemetry/src/index.ts', import.meta.url)
  ),
  '@xnetjs/ui': fileURLToPath(new URL('../packages/ui/src/index.ts', import.meta.url)),
  '@xnetjs/vectors': fileURLToPath(new URL('../packages/vectors/src/index.ts', import.meta.url)),
  '@xnetjs/views': fileURLToPath(new URL('../packages/views/src/index.ts', import.meta.url))
}
