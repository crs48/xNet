import { resolve } from 'node:path'
import { build } from 'esbuild'

/** Sandboxed preloads cannot require sibling chunks. Inline local imports per entry. */
export function standaloneSandboxPreloads(entries: string[]) {
  return {
    name: 'xnet-standalone-sandbox-preloads',
    enforce: 'pre' as const,
    async load(this: { addWatchFile(file: string): void }, id: string) {
      if (!entries.includes(id)) return
      const result = await build({
        entryPoints: [id],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        external: ['electron'],
        metafile: true
      })
      for (const file of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(file))
      return result.outputFiles[0].text
    }
  }
}
