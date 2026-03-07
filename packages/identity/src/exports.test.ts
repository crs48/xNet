import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import * as did from './did'
import * as keyBundle from './key-bundle-entry'
import * as legacy from './legacy'
import * as ucan from './ucan'

describe('@xnetjs/identity package exports', () => {
  it('declares explicit stable and deprecated subpaths', () => {
    const exportsMap = packageJson.exports as Record<string, unknown>
    expect(exportsMap).toHaveProperty('./did')
    expect(exportsMap).toHaveProperty('./ucan')
    expect(exportsMap).toHaveProperty('./key-bundle')
    expect(exportsMap).toHaveProperty('./passkey')
    expect(exportsMap).toHaveProperty('./legacy')
  })

  it('exposes stable DID and UCAN helpers', () => {
    expect(did.createDID).toBeTypeOf('function')
    expect(did.parseDID).toBeTypeOf('function')
    expect(ucan.createUCAN).toBeTypeOf('function')
    expect(ucan.verifyUCAN).toBeTypeOf('function')
  })

  it('exposes key-bundle helpers and keeps legacy compatibility exports', () => {
    expect(keyBundle.createKeyBundle).toBeTypeOf('function')
    expect(keyBundle.serializeHybridKeyBundle).toBeTypeOf('function')
    expect(legacy.generateKeyBundle).toBeTypeOf('function')
    expect(legacy.MemoryPasskeyStorage).toBeTypeOf('function')
  })
})
