import { defineConfig } from 'tsup'

// Browser-compatible bundle (main entry).
//
// The Node-only bundle lives in `tsup.node.config.ts` and is built as a
// SEPARATE, SEQUENTIAL tsup invocation (see the `build` script) rather than as a
// second element of an exported array. tsup runs array configs CONCURRENTLY,
// and this config's `clean` covers the whole of `dist/` — a strict superset of
// the Node bundle's `dist/services/` output. tsup cleans twice: `**/*` before
// the ESM phase, then `**/*.d.{ts,mts,cts}` RECURSIVELY before the DTS phase.
// Whichever of those landed after the Node bundle had written a file silently
// deleted it, and the build still exited 0 — so a green build could ship
// `dist/services/node.js` with no `node.d.ts` beside it. Consumers then
// resolved `@xnetjs/plugins/node` to bare JS and degraded it to `any`
// (TS7016), which surfaced downstream as a pile of unrelated-looking TS7006
// "implicitly has an 'any' type" errors on every callback parameter in
// `@xnetjs/cli`. Turbo cached the truncated dist as a success on top of that.
//
// Keep these two builds in separate files and sequential: the clean and the
// write must never be able to interleave.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  // Mark workspace packages as external - they're bundled by the consumer
  external: ['@xnetjs/core', '@xnetjs/data']
})
