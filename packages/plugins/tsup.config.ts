import { defineConfig } from 'tsup'

export default defineConfig([
  // Browser-compatible bundle (main entry)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    outDir: 'dist',
    splitting: false
  },
  // Node.js-only bundle (server-side code)
  {
    entry: ['src/services/node.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/services',
    splitting: false,
    // Mark Node.js built-ins as external
    external: ['http', 'child_process', 'net', 'readline', 'url']
  }
])
