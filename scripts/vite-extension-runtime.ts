import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const entry = `${root}packages/workbench/src/communities/extension-runtime.worker.tsx`

/** One self-contained program: the opaque worker cannot fetch modules from the host. */
export function extensionRuntimePlugin() {
  return {
    name: 'xnet-extension-runtime',
    resolveId(id: string) {
      if (id === 'virtual:xnet-extension-runtime?raw') return '\0xnet-extension-runtime'
    },
    async load(this: { addWatchFile(file: string): void }, id: string) {
      if (id !== '\0xnet-extension-runtime') return
      const result = await build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        metafile: true,
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: {
          '@xnetjs/react/queries': `${root}packages/react/src/queries.ts`,
          '@xnetjs/data-bridge': `${root}packages/data-bridge/src/query-descriptor.ts`,
          '@xnetjs/ui': `${root}packages/ui/src/primitives/Badge.tsx`
        }
      })
      for (const file of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(root, file))
      return `export default ${JSON.stringify(result.outputFiles[0].text)}`
    }
  }
}
