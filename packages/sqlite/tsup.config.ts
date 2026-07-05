import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/electron': 'src/adapters/electron.ts',
    'adapters/reader-thread': 'src/adapters/reader-thread.ts',
    'adapters/web': 'src/adapters/web.ts',
    'adapters/web-worker': 'src/adapters/web-worker.ts',
    'adapters/web-proxy': 'src/adapters/web-proxy.ts',
    // The multi-tab SharedWorker router (0263) — loaded via
    // `new SharedWorker(new URL('./web-router-worker.js', import.meta.url))`
    // from web-proxy, so it must land as a sibling file in dist/adapters.
    'adapters/web-router-worker': 'src/adapters/web-router-worker.ts',
    'adapters/expo': 'src/adapters/expo.ts',
    'adapters/memory': 'src/adapters/memory.ts',
    'browser-support': 'src/browser-support.ts'
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['better-sqlite3', '@sqlite.org/sqlite-wasm', 'expo-sqlite', 'sql.js']
})
