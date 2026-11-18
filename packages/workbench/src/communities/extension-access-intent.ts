import type { Module } from '@swc/wasm-web'

export interface ExtensionAccessIntent {
  conversations: boolean
  tasks: boolean
  pages: boolean
  createTasks: boolean
  editTasks: boolean
  removeTasks: boolean
  readDocuments: boolean
  editDocuments: boolean
}
export const emptyAccessIntent = (): ExtensionAccessIntent => ({
  conversations: false,
  tasks: false,
  pages: false,
  createTasks: false,
  editTasks: false,
  removeTasks: false,
  readDocuments: false,
  editDocuments: false
})
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const name = (value: unknown): string => {
  const node = record(value)
  return typeof node.value === 'string' ? node.value : ''
}

/** Suggestions only: neither imports nor source text can grant authority. Brokers still enforce every call. */
export function inspectExtensionAccess(module: Module): ExtensionAccessIntent {
  const intent = emptyAccessIntent()
  const imports = new Set<string>()
  const mutateHooks = new Set<string>()
  const namespaces = new Set<string>()
  for (const item of module.body) {
    if (item.type !== 'ImportDeclaration' || item.typeOnly) continue
    if (
      ![
        '@xnetjs/data',
        '@xnetjs/react',
        '@xnetjs/react/queries',
        '@xnetjs/extensions/react',
        '@xnetjs/extensions/ui'
      ].includes(item.source.value)
    )
      continue
    for (const spec of item.specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier') namespaces.add(spec.local.value)
      if (spec.type !== 'ImportSpecifier' || spec.isTypeOnly) continue
      const imported = spec.imported?.value ?? spec.local.value
      imports.add(imported)
      if (imported === 'useMutate') mutateHooks.add(spec.local.value)
    }
  }
  const nodes: Record<string, unknown>[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = record(value)
    if (typeof node.type === 'string') nodes.push(node)
    Object.values(node).forEach((child) => {
      if (child && typeof child === 'object') visit(child)
    })
  }
  visit(module)
  for (const node of nodes) {
    if (node.type === 'MemberExpression' && namespaces.has(name(node.object)))
      imports.add(name(node.property))
  }
  const mutationObjects = new Set<string>()
  const methods = new Map<string, string>()
  for (const node of nodes) {
    const init = record(node.init),
      callee = record(init.callee),
      pattern = record(node.id)
    if (
      node.type !== 'VariableDeclarator' ||
      init.type !== 'CallExpression' ||
      !(
        mutateHooks.has(name(callee)) ||
        (callee.type === 'MemberExpression' &&
          namespaces.has(name(callee.object)) &&
          name(callee.property) === 'useMutate')
      )
    )
      continue
    if (pattern.type === 'Identifier') mutationObjects.add(name(pattern))
    if (Array.isArray(pattern.properties))
      for (const raw of pattern.properties) {
        const prop = record(raw)
        if (prop.type === 'AssignmentPatternProperty') methods.set(name(prop.key), name(prop.key))
        if (prop.type === 'KeyValuePatternProperty') methods.set(name(prop.value), name(prop.key))
      }
  }
  const used = new Set<string>()
  for (const node of nodes) {
    const callee = record(node.callee)
    if (node.type === 'CallExpression') {
      const method =
        methods.get(name(callee)) ??
        (callee.type === 'MemberExpression' && mutationObjects.has(name(callee.object))
          ? name(callee.property)
          : '')
      if (method) used.add(method)
    }
    if (
      node.type === 'KeyValueProperty' &&
      name(node.key) === 'type' &&
      ['create', 'update', 'delete', 'restore'].includes(name(node.value))
    )
      used.add(name(node.value))
  }
  intent.conversations = imports.has('ChatMessageSchema') || imports.has('ChannelSchema')
  intent.createTasks = imports.has('useMutate') && used.has('create')
  intent.editTasks = imports.has('useMutate') && (used.has('update') || intent.createTasks)
  intent.removeTasks =
    imports.has('useMutate') && ['remove', 'delete', 'restore'].some((method) => used.has(method))
  intent.tasks =
    imports.has('TaskSchema') || intent.createTasks || intent.editTasks || intent.removeTasks
  intent.editDocuments = imports.has('DocumentEditor') || imports.has('saveDocument')
  intent.readDocuments =
    intent.editDocuments || imports.has('useDocument') || imports.has('useDocumentIds')
  intent.pages = imports.has('PageSchema') || intent.readDocuments
  return intent
}
