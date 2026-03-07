import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import * as core from './core'
import * as database from './database'
import * as experimental from './experimental'

describe('@xnetjs/react package exports', () => {
  it('declares the lifecycle subpaths', () => {
    const exportsMap = packageJson.exports as Record<string, unknown>
    expect(exportsMap).toHaveProperty('./core')
    expect(exportsMap).toHaveProperty('./database')
    expect(exportsMap).toHaveProperty('./experimental')
    expect(exportsMap).toHaveProperty('./internal')
  })

  it('exposes the stable core contract from ./core', () => {
    expect(core.XNetProvider).toBeTypeOf('function')
    expect(core.useQuery).toBeTypeOf('function')
    expect(core.useMutate).toBeTypeOf('function')
    expect(core.useNode).toBeTypeOf('function')
    expect(core.useIdentity).toBeTypeOf('function')
  })

  it('exposes database hooks from ./database', () => {
    expect(database.useDatabase).toBeTypeOf('function')
    expect(database.useDatabaseDoc).toBeTypeOf('function')
    expect(database.useDatabaseRow).toBeTypeOf('function')
    expect(database.useCell).toBeTypeOf('function')
  })

  it('exposes experimental surfaces from ./experimental', () => {
    expect(experimental.useComments).toBeTypeOf('function')
    expect(experimental.useHistory).toBeTypeOf('function')
    expect(experimental.OnboardingProvider).toBeTypeOf('function')
    expect(experimental.createSyncManager).toBeTypeOf('function')
  })
})
