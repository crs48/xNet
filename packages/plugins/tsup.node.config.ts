import { defineConfig } from 'tsup'

// Node.js-only bundle (server-side code), published as `@xnetjs/plugins/node`.
//
// Built by its own tsup invocation AFTER `tsup.config.ts`, never alongside it —
// see the comment there for why concurrency here silently truncated the output.
// `clean` is scoped to this outDir, so it can only ever remove what this config
// produces.
export default defineConfig({
  entry: ['src/services/node.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist/services',
  splitting: false,
  // Mark Node.js built-ins as external
  external: ['http', 'child_process', 'net', 'readline', 'url', 'crypto', 'fs/promises', 'path']
})
