import { describe, expect, it } from 'vitest'
import { JSX_IMPORT_SOURCE, sourceStampPlugin } from './source-stamp'

describe('sourceStampPlugin', () => {
  function aliasesOf(shimPath: string) {
    const plugin = sourceStampPlugin({ shimPath })
    const config = plugin.config as () => {
      resolve: { alias: Array<{ find: RegExp; replacement: string }> }
    }
    return config().resolve.alias
  }

  it('runs before other plugins so the alias is in place for esbuild', () => {
    expect(sourceStampPlugin({ shimPath: '/shim.ts' }).enforce).toBe('pre')
  })

  it('routes only the dev runtime to the shim', () => {
    const alias = aliasesOf('/shim.ts')
    const dev = alias.find((entry) => entry.find.test(`${JSX_IMPORT_SOURCE}/jsx-dev-runtime`))
    expect(dev?.replacement).toBe('/shim.ts')
    const prod = alias.find((entry) => entry.find.test(`${JSX_IMPORT_SOURCE}/jsx-runtime`))
    expect(prod?.replacement).toBe('react/jsx-runtime')
  })

  it('matches the specifier exactly — a prefix alias would make the shim import itself', () => {
    const alias = aliasesOf('/shim.ts')
    const dev = alias.find((entry) => entry.replacement === '/shim.ts')
    expect(dev?.find.test('react/jsx-dev-runtime')).toBe(false)
    expect(dev?.find.test(`${JSX_IMPORT_SOURCE}/jsx-dev-runtime/extra`)).toBe(false)
  })
})
