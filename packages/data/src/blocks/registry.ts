/**
 * Block type registry for document content
 */
import * as Y from 'yjs'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'todo'
  | 'code'
  | 'quote'
  | 'divider'
  | 'image'
  | 'embed'
  | 'table'
  | 'callout'
  | 'toggle'

export type Block = {
  id: string
  type: BlockType
  parent: string
  content: Y.XmlFragment | Y.Map<unknown>
  children: string[]
  properties: Record<string, unknown>
}

/**
 * Block definition for registering new block types
 */
export interface BlockDefinition {
  type: BlockType
  create: (id: string, parent: string) => Block
  validate: (block: Block) => boolean
}

const registry = new Map<BlockType, BlockDefinition>()

/**
 * Register a new block type
 */
export function registerBlockType(definition: BlockDefinition): void {
  registry.set(definition.type, definition)
}

/**
 * Create a block of a specific type
 */
export function createBlock(type: BlockType, id: string, parent: string): Block {
  const definition = registry.get(type)
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`)
  }
  return definition.create(id, parent)
}

/**
 * Validate a block
 */
export function validateBlock(block: Block): boolean {
  const definition = registry.get(block.type)
  if (!definition) return false
  return definition.validate(block)
}

/**
 * Get all registered block types
 */
export function getRegisteredBlockTypes(): BlockType[] {
  return Array.from(registry.keys())
}

// Register default block types
registerBlockType({
  type: 'paragraph',
  create: (id, parent) => ({
    id,
    type: 'paragraph',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: {}
  }),
  validate: () => true
})

registerBlockType({
  type: 'heading',
  create: (id, parent) => ({
    id,
    type: 'heading',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { level: 1 }
  }),
  validate: (block) => {
    const level = block.properties.level as number
    return typeof level === 'number' && level >= 1 && level <= 6
  }
})

registerBlockType({
  type: 'todo',
  create: (id, parent) => ({
    id,
    type: 'todo',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { checked: false }
  }),
  validate: (block) => typeof block.properties.checked === 'boolean'
})

registerBlockType({
  type: 'list',
  create: (id, parent) => ({
    id,
    type: 'list',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { listType: 'bullet' }
  }),
  validate: (block) => {
    const listType = block.properties.listType as string
    return listType === 'bullet' || listType === 'numbered'
  }
})

registerBlockType({
  type: 'code',
  create: (id, parent) => ({
    id,
    type: 'code',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { language: 'plaintext' }
  }),
  validate: () => true
})

registerBlockType({
  type: 'quote',
  create: (id, parent) => ({
    id,
    type: 'quote',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: {}
  }),
  validate: () => true
})

registerBlockType({
  type: 'divider',
  create: (id, parent) => ({
    id,
    type: 'divider',
    parent,
    content: new Y.Map(),
    children: [],
    properties: {}
  }),
  validate: () => true
})

registerBlockType({
  type: 'image',
  create: (id, parent) => ({
    id,
    type: 'image',
    parent,
    content: new Y.Map(),
    children: [],
    properties: { url: '', alt: '' }
  }),
  validate: (block) => typeof block.properties.url === 'string'
})

registerBlockType({
  type: 'embed',
  create: (id, parent) => ({
    id,
    type: 'embed',
    parent,
    content: new Y.Map(),
    children: [],
    properties: { url: '' }
  }),
  validate: (block) => typeof block.properties.url === 'string'
})

registerBlockType({
  type: 'table',
  create: (id, parent) => ({
    id,
    type: 'table',
    parent,
    content: new Y.Map(),
    children: [],
    properties: { rows: 2, cols: 2 }
  }),
  validate: (block) => {
    const { rows, cols } = block.properties as { rows: number; cols: number }
    return typeof rows === 'number' && typeof cols === 'number' && rows > 0 && cols > 0
  }
})

registerBlockType({
  type: 'callout',
  create: (id, parent) => ({
    id,
    type: 'callout',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { icon: '💡' }
  }),
  validate: () => true
})

registerBlockType({
  type: 'toggle',
  create: (id, parent) => ({
    id,
    type: 'toggle',
    parent,
    content: new Y.XmlFragment(),
    children: [],
    properties: { open: false }
  }),
  validate: (block) => typeof block.properties.open === 'boolean'
})
