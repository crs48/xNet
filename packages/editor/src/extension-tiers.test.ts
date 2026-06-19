import { describe, expect, it } from 'vitest'
import {
  REQUIRED_SCHEMA_NODES,
  extensionName,
  isSchemaExtension,
  partitionExtensions,
  schemaSkewRisks,
  type ExtensionLike
} from './extension-tiers'

const node = (name: string): ExtensionLike => ({ type: 'node', name })
const mark = (name: string): ExtensionLike => ({ type: 'mark', name })
const behavior = (name: string): ExtensionLike => ({ type: 'extension', name })

describe('extension-tiers', () => {
  it('classifies nodes and marks as schema, others as behavior', () => {
    expect(isSchemaExtension(node('heading'))).toBe(true)
    expect(isSchemaExtension(mark('bold'))).toBe(true)
    expect(isSchemaExtension(behavior('slashCommand'))).toBe(false)
    expect(isSchemaExtension({})).toBe(false)
  })

  it('reads the extension name with a fallback', () => {
    expect(extensionName(node('callout'))).toBe('callout')
    expect(extensionName({})).toBe('unknown')
  })

  it('partitions a mixed list into schema vs behavior', () => {
    const exts = [node('doc'), behavior('dragHandle'), mark('link'), behavior('keymap')]
    const { schema, behavior: beh } = partitionExtensions(exts)
    expect(schema.map(extensionName)).toEqual(['doc', 'link'])
    expect(beh.map(extensionName)).toEqual(['dragHandle', 'keymap'])
  })

  it('flags schema-defining extensions as skew risks', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exts = [node('customBlock'), behavior('toolbar'), mark('highlight')] as any
    expect(schemaSkewRisks(exts)).toEqual(['customBlock', 'highlight'])
  })

  it('treats a behavior-only contribution set as skew-safe', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exts = [behavior('a'), behavior('b')] as any
    expect(schemaSkewRisks(exts)).toEqual([])
  })

  it('lists the minimum required schema nodes', () => {
    expect(REQUIRED_SCHEMA_NODES).toContain('doc')
    expect(REQUIRED_SCHEMA_NODES).toContain('paragraph')
    expect(REQUIRED_SCHEMA_NODES).toContain('text')
  })
})
