import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import { createDataBridge } from './create-bridge'
import { createNativeBridge } from './native-bridge'

describe('@xnetjs/data-bridge package exports', () => {
  it('declares explicit worker, native, and type subpaths', () => {
    const exportsMap = packageJson.exports as Record<string, unknown>
    expect(exportsMap).toHaveProperty('./worker')
    expect(exportsMap).toHaveProperty('./native')
    expect(exportsMap).toHaveProperty('./types')
  })

  it('keeps the root and native bridge factories available', () => {
    expect(createDataBridge).toBeTypeOf('function')
    expect(createNativeBridge).toBeTypeOf('function')
  })
})
