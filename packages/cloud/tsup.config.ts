import { defineConfig } from 'tsup'

// One package, many seams. Each module is its own entry point so consumers can
// import a crisp subpath (`@xnetjs/cloud/provisioner`, `/billing`, …) and tree-
// shake the rest — the ports-and-adapters boundaries from before consolidation,
// kept as modules instead of separate packages (exploration 0181).
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/provisioner/index.ts',
    'src/identity/index.ts',
    'src/billing/index.ts',
    'src/ai/index.ts',
    'src/storage/index.ts',
    'src/litestream/index.ts',
    'src/cost/index.ts'
  ],
  format: ['esm'],
  dts: true,
  clean: true
})
