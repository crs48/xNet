import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const modules = ['data', 'react', 'plugins', 'sdk', 'ui']
const entrypoints = modules.flatMap((name) => {
  const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))
  return Object.entries(manifest.exports).map(([subpath, target]) => {
    const specifier = `@xnetjs/${name}${subpath === '.' ? '' : subpath.slice(1)}`
    const path = typeof target === 'string' ? target : target.types
    if (!path) throw new Error(`No inventory source for ${specifier}`)
    const source = resolve(
      `packages/${name}`,
      path.replace('./dist/', './src/').replace(/\.d\.ts$/, '.ts')
    )
    if (!existsSync(source)) throw new Error(`Missing inventory source: ${source}`)
    return { specifier, source, code: /\.(ts|tsx|js)$/.test(source) }
  })
})
const roots = entrypoints.filter((entry) => entry.code).map((entry) => entry.source)
const reactRoot = resolve('packages/react/src/index.ts')
const program = ts.createProgram(roots, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  allowJs: true,
  jsx: ts.JsxEmit.ReactJSX
})
const checker = program.getTypeChecker()
const allowed = {
  '@xnetjs/data': ['ChannelSchema', 'ChatMessageSchema', 'TaskSchema', 'PageSchema'],
  '@xnetjs/react': ['useQuery', 'useMutate'],
  '@xnetjs/ui': ['Badge', 'Button'],
  '@xnetjs/react/queries': ['useQuery', 'useMutate']
}
const ledger = Object.fromEntries(
  entrypoints
    .filter((entry) => entry.code)
    .map(({ specifier, source: path }) => {
      const source = program.getSourceFile(path)
      const symbol = checker.getSymbolAtLocation(source)
      if (!symbol) throw new Error(`Missing module: ${specifier}`)
      const exports = checker
        .getExportsOfModule(symbol)
        .filter((entry) => {
          const target =
            entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry
          return !!(target.flags & ts.SymbolFlags.Value)
        })
        .map((entry) => entry.name)
        .sort()
      return [
        specifier,
        Object.fromEntries(
          exports.map((entry) => [
            entry,
            (allowed[specifier] ?? []).includes(entry)
              ? 'scoped adapter'
              : 'unavailable in untrusted extensions'
          ])
        )
      ]
    })
)
const path = 'docs/reference/extension-api-inventory.json'
const output =
  JSON.stringify(
    {
      version: 1,
      description:
        'Generated public runtime exports. Unlisted/new imports also fail closed; unavailable entries require an explicit scoped implementation before exposure.',
      modules: ledger,
      virtualModules: {
        '@xnetjs/extensions/react': {
          useQuery: 'scoped adapter',
          useMutate: 'scoped adapter',
          useDocument: 'exact-page text projection'
        },
        '@xnetjs/extensions/ui': { DocumentView: 'host-rendered read-only document handle' }
      },
      resources: Object.fromEntries(
        entrypoints
          .filter((entry) => !entry.code)
          .map(({ specifier }) => [specifier, 'unavailable in untrusted extensions'])
      )
    },
    null,
    2
  ) + '\n'
if (process.argv.includes('--selftest')) {
  const options = program.getCompilerOptions()
  const host = ts.createCompilerHost(options)
  const read = host.readFile.bind(host)
  host.readFile = (path) => {
    const source = read(path)
    return path === reactRoot
      ? source + '\nexport const __XNET_INVENTORY_NEGATIVE_CONTROL__ = true'
      : source
  }
  const mutant = ts.createProgram(roots, options, host)
  const symbols = mutant
    .getTypeChecker()
    .getExportsOfModule(
      mutant.getTypeChecker().getSymbolAtLocation(mutant.getSourceFile(reactRoot))
    )
  if (
    !symbols.some((entry) => entry.name === '__XNET_INVENTORY_NEGATIVE_CONTROL__') ||
    Object.hasOwn(ledger['@xnetjs/react'], '__XNET_INVENTORY_NEGATIVE_CONTROL__')
  )
    throw new Error('Inventory negative control did not detect an added export.')
  console.log('In-memory export negative control detected.')
} else if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output)
    throw new Error('Extension API inventory is stale. Run node scripts/extensions/inventory.mjs.')
} else writeFileSync(path, output)
console.log(
  Object.entries(ledger)
    .map(([name, exports]) => `${name}: ${Object.keys(exports).length} classified runtime exports`)
    .join('\n')
)
