import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/electron': 'src/adapters/electron.ts',
    'adapters/web': 'src/adapters/web.ts',
    'adapters/web-worker': 'src/adapters/web-worker.ts',
    'adapters/web-proxy': 'src/adapters/web-proxy.ts',
    'adapters/expo': 'src/adapters/expo.ts',
    'adapters/memory': 'src/adapters/memory.ts',
    'browser-support': 'src/browser-support.ts'
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['better-sqlite3', '@sqlite.org/sqlite-wasm', 'expo-sqlite', 'sql.js']
})
