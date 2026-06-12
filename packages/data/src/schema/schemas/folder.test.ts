import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  FOLDER_SCHEMA_IRI,
  FolderSchema,
  buildFolderTree,
  flattenFolderTree,
  folderAncestorIds,
  folderPathIds,
  wouldCreateFolderCycle,
  type FolderLike
} from './folder'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

function byId(folders: FolderLike[]): Map<string, FolderLike> {
  return new Map(folders.map((folder) => [folder.id, folder]))
}

describe('FolderSchema', () => {
  it('has the expected schema identity', () => {
    expect(FolderSchema.schema['@id']).toBe(FOLDER_SCHEMA_IRI)
    expect(FolderSchema.schema.name).toBe('Folder')
    expect(FolderSchema.schema.version).toBe('1.0.0')
    expect(FolderSchema.schema.document).toBeUndefined()
  })

  it('creates a folder with name, parent, and sortKey', () => {
    const folder = FolderSchema.create(
      { name: 'Design', icon: '🎨', parent: 'root-folder', sortKey: 'a0' },
      { createdBy: testDID }
    )
    expect(folder.name).toBe('Design')
    expect(folder.parent).toBe('root-folder')
    expect(folder.sortKey).toBe('a0')
    expect(FolderSchema.validate(folder).valid).toBe(true)
  })

  it('requires a name', () => {
    const folder = FolderSchema.create({} as never, { createdBy: testDID })
    expect(FolderSchema.validate(folder).valid).toBe(false)
  })

  it('declares parent as a typed self-relation', () => {
    const parent = FolderSchema.schema.properties.find((prop) => prop.name === 'parent')
    expect(parent?.type).toBe('relation')
    expect(parent?.config).toMatchObject({ target: FOLDER_SCHEMA_IRI, multiple: false })
  })
})

describe('buildFolderTree', () => {
  it('nests children under parents, ordered by sortKey', () => {
    const tree = buildFolderTree([
      { id: 'b', name: 'B', sortKey: 'a1' },
      { id: 'a', name: 'A', sortKey: 'a0' },
      { id: 'a1', name: 'A1', parent: 'a', sortKey: 'a0' },
      { id: 'a2', name: 'A2', parent: 'a', sortKey: 'a0V' }
    ])
    expect(tree.map((node) => node.folder.id)).toEqual(['a', 'b'])
    expect(tree[0].children.map((node) => node.folder.id)).toEqual(['a1', 'a2'])
    expect(tree[0].children[0].depth).toBe(1)
  })

  it('compares sortKeys by code units, not locale', () => {
    // 'Z' (0x5A) sorts before 'a' (0x61) by code units; localeCompare would flip it
    const tree = buildFolderTree([
      { id: 'lower', name: 'lower', sortKey: 'a' },
      { id: 'upper', name: 'upper', sortKey: 'Z' }
    ])
    expect(tree.map((node) => node.folder.id)).toEqual(['upper', 'lower'])
  })

  it('treats folders with missing parents as roots', () => {
    const tree = buildFolderTree([{ id: 'orphan', name: 'Orphan', parent: 'gone' }])
    expect(tree.map((node) => node.folder.id)).toEqual(['orphan'])
  })

  it('lifts cycle members to the root level instead of dropping them', () => {
    const tree = buildFolderTree([
      { id: 'a', name: 'A', parent: 'b' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'root', name: 'Root' }
    ])
    const ids = tree.map((node) => node.folder.id)
    expect(ids).toContain('root')
    expect(ids).toContain('a')
    // Every folder appears exactly once
    const flat = flattenFolderTree(tree)
    expect(flat.map((node) => node.folder.id).sort()).toEqual(['a', 'b', 'root'])
  })
})

describe('flattenFolderTree', () => {
  const folders: FolderLike[] = [
    { id: 'a', name: 'A', sortKey: 'a0' },
    { id: 'a1', name: 'A1', parent: 'a' },
    { id: 'a1x', name: 'A1x', parent: 'a1' },
    { id: 'b', name: 'B', sortKey: 'a1' }
  ]

  it('emits depth-first rows when everything is expanded', () => {
    const rows = flattenFolderTree(buildFolderTree(folders))
    expect(rows.map((row) => row.folder.id)).toEqual(['a', 'a1', 'a1x', 'b'])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 0])
  })

  it('skips children of collapsed folders', () => {
    const rows = flattenFolderTree(buildFolderTree(folders), (id) => id !== 'a1')
    expect(rows.map((row) => row.folder.id)).toEqual(['a', 'a1', 'b'])
  })
})

describe('cycle prevention', () => {
  const folders: FolderLike[] = [
    { id: 'root', name: 'Root' },
    { id: 'mid', name: 'Mid', parent: 'root' },
    { id: 'leaf', name: 'Leaf', parent: 'mid' }
  ]

  it('folderAncestorIds walks nearest-first and stops at the root', () => {
    expect(folderAncestorIds('leaf', byId(folders))).toEqual(['mid', 'root'])
    expect(folderAncestorIds('root', byId(folders))).toEqual([])
  })

  it('folderAncestorIds is cycle-safe', () => {
    const cyclic: FolderLike[] = [
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' }
    ]
    expect(folderAncestorIds('a', byId(cyclic))).toEqual(['b'])
  })

  it('rejects re-parenting a folder into itself', () => {
    expect(wouldCreateFolderCycle('root', 'root', byId(folders))).toBe(true)
  })

  it('rejects re-parenting a folder into its own descendant', () => {
    expect(wouldCreateFolderCycle('root', 'leaf', byId(folders))).toBe(true)
    expect(wouldCreateFolderCycle('mid', 'leaf', byId(folders))).toBe(true)
  })

  it('allows legal moves', () => {
    expect(wouldCreateFolderCycle('leaf', 'root', byId(folders))).toBe(false)
    expect(wouldCreateFolderCycle('leaf', null, byId(folders))).toBe(false)
    expect(wouldCreateFolderCycle('mid', undefined, byId(folders))).toBe(false)
  })

  it('folderPathIds returns the root-first breadcrumb path', () => {
    expect(folderPathIds('leaf', byId(folders))).toEqual(['root', 'mid', 'leaf'])
    expect(folderPathIds('root', byId(folders))).toEqual(['root'])
  })
})
