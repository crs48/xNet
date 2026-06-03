/**
 * Node-derived indexes for system schema federation.
 */

import type { SchemaIRI } from './node'
import type { Schema, ValidationError, ValidationResult } from './types'
import type { NodeChangeEvent, NodeState } from '../store/types'
import { getBaseSchemaIRI, normalizeSchemaIRI, parseSchemaIRI } from './node'
import {
  SchemaDefinitionSchema,
  validateSchemaDefinitionNode,
  type SchemaDefinitionStatus,
  type ValidateSchemaDefinitionNodeOptions
} from './schemas/system'

export type SystemSchemaIndexStore = {
  list(options?: { includeDeleted?: boolean }): Promise<NodeState[]>
  subscribe(listener: (event: NodeChangeEvent) => void): () => void
}

export type SystemSchemaDefinitionRecord = {
  nodeId: string
  schemaIri: SchemaIRI
  baseIri: SchemaIRI
  version: string
  authority: string
  status: SchemaDefinitionStatus
  publishedAt: number
  definition: Schema
  diagnostics: ValidationError[]
}

export type SystemSchemaIndexOptions = ValidateSchemaDefinitionNodeOptions & {
  includeDrafts?: boolean
}

export type SystemSchemaIndexDiagnostic = {
  nodeId: string
  result: ValidationResult
}

export class SystemSchemaIndex {
  private recordsByNodeId = new Map<string, SystemSchemaDefinitionRecord>()
  private recordsByIri = new Map<SchemaIRI, SystemSchemaDefinitionRecord>()
  private recordsByBaseIri = new Map<SchemaIRI, SystemSchemaDefinitionRecord[]>()
  private diagnosticsByNodeId = new Map<string, SystemSchemaIndexDiagnostic>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly store: SystemSchemaIndexStore,
    private readonly options: SystemSchemaIndexOptions = {}
  ) {}

  async initialize(): Promise<void> {
    await this.rebuild()
    this.unsubscribe = this.store.subscribe((event) => {
      this.applyChangeEvent(event)
    })
  }

  async rebuild(): Promise<void> {
    this.recordsByNodeId.clear()
    this.recordsByIri.clear()
    this.recordsByBaseIri.clear()
    this.diagnosticsByNodeId.clear()

    const nodes = await this.store.list({ includeDeleted: false })
    for (const node of nodes) {
      this.indexNode(node)
    }
  }

  resolve(iri: SchemaIRI): Schema | null {
    const normalized = normalizeSchemaIRI(iri)
    const exact = this.recordsByIri.get(normalized) ?? this.recordsByIri.get(iri)
    if (exact) {
      return exact.definition
    }

    const candidates = this.recordsByBaseIri.get(getBaseSchemaIRI(iri)) ?? []
    return candidates.at(-1)?.definition ?? null
  }

  listDefinitions(): SystemSchemaDefinitionRecord[] {
    return [...this.recordsByNodeId.values()].sort((left, right) =>
      left.schemaIri.localeCompare(right.schemaIri)
    )
  }

  getDiagnostics(): SystemSchemaIndexDiagnostic[] {
    return [...this.diagnosticsByNodeId.values()]
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.recordsByNodeId.clear()
    this.recordsByIri.clear()
    this.recordsByBaseIri.clear()
    this.diagnosticsByNodeId.clear()
  }

  private applyChangeEvent(event: NodeChangeEvent): void {
    if (event.previousNode && isSchemaDefinitionNode(event.previousNode)) {
      this.removeNode(event.previousNode.id)
    }

    if (event.node && !event.node.deleted && isSchemaDefinitionNode(event.node)) {
      this.indexNode(event.node)
    }
  }

  private indexNode(node: NodeState): void {
    if (!isSchemaDefinitionNode(node)) {
      return
    }

    const validation = validateSchemaDefinitionNode(node, this.options)
    if (!validation.valid) {
      this.diagnosticsByNodeId.set(node.id, { nodeId: node.id, result: validation })
      return
    }

    const record = toSystemSchemaDefinitionRecord(node)
    if (!record) {
      return
    }

    if (!this.options.includeDrafts && record.status !== 'published') {
      return
    }

    this.recordsByNodeId.set(node.id, record)
    this.recordsByIri.set(record.schemaIri, record)
    this.recordsByIri.set(normalizeSchemaIRI(record.schemaIri), record)

    const records = this.recordsByBaseIri.get(record.baseIri) ?? []
    records.push(record)
    records.sort((left, right) => compareVersions(left.version, right.version))
    this.recordsByBaseIri.set(record.baseIri, records)
  }

  private removeNode(nodeId: string): void {
    const existing = this.recordsByNodeId.get(nodeId)
    this.recordsByNodeId.delete(nodeId)
    this.diagnosticsByNodeId.delete(nodeId)
    if (!existing) {
      return
    }

    this.recordsByIri.delete(existing.schemaIri)
    this.recordsByIri.delete(normalizeSchemaIRI(existing.schemaIri))
    const remaining = (this.recordsByBaseIri.get(existing.baseIri) ?? []).filter(
      (record) => record.nodeId !== nodeId
    )
    if (remaining.length === 0) {
      this.recordsByBaseIri.delete(existing.baseIri)
    } else {
      this.recordsByBaseIri.set(existing.baseIri, remaining)
    }
  }
}

export function createNodeGraphSchemaResolver(
  index: SystemSchemaIndex
): (iri: SchemaIRI) => Promise<Schema | null> {
  return async (iri) => index.resolve(iri)
}

export function isSchemaDefinitionNode(node: Pick<NodeState, 'schemaId'>): boolean {
  return (
    node.schemaId === SchemaDefinitionSchema.schema['@id'] ||
    node.schemaId === 'xnet://xnet.fyi/SchemaDefinition'
  )
}

function toSystemSchemaDefinitionRecord(node: NodeState): SystemSchemaDefinitionRecord | null {
  const schemaIri = asSchemaIri(node.properties.schemaIri)
  const version = asString(node.properties.version)
  const authority = asString(node.properties.authority)
  const status = asSchemaDefinitionStatus(node.properties.status)
  const publishedAt = asNumber(node.properties.publishedAt)
  const definitionBytes = asString(node.properties.definitionBytes)
  if (!schemaIri || !version || !authority || !status || publishedAt === null || !definitionBytes) {
    return null
  }

  const definition = parseSchemaDefinition(definitionBytes)
  if (!definition) {
    return null
  }

  return {
    nodeId: node.id,
    schemaIri,
    baseIri: getBaseSchemaIRI(schemaIri),
    version,
    authority,
    status,
    publishedAt,
    definition,
    diagnostics: []
  }
}

function parseSchemaDefinition(definitionBytes: string): Schema | null {
  try {
    const parsed = JSON.parse(definitionBytes) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed['@id'] !== 'string') return null
    if (typeof parsed['@type'] !== 'string') return null
    if (typeof parsed.name !== 'string') return null
    if (typeof parsed.namespace !== 'string') return null
    if (typeof parsed.version !== 'string') return null
    if (!Array.isArray(parsed.properties)) return null
    return parsed as unknown as Schema
  } catch {
    return null
  }
}

function compareVersions(left: string, right: string): number {
  const leftParsed = parseSemver(left)
  const rightParsed = parseSemver(right)

  for (let index = 0; index < leftParsed.length; index++) {
    const diff = leftParsed[index] - rightParsed[index]
    if (diff !== 0) {
      return diff
    }
  }

  return left.localeCompare(right)
}

function parseSemver(version: string): [number, number, number] {
  const parsed = version.split(/[+-]/)[0].split('.').map(Number)
  return [
    Number.isFinite(parsed[0]) ? parsed[0] : 0,
    Number.isFinite(parsed[1]) ? parsed[1] : 0,
    Number.isFinite(parsed[2]) ? parsed[2] : 0
  ]
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asSchemaIri(value: unknown): SchemaIRI | null {
  if (typeof value !== 'string' || !value.startsWith('xnet://')) {
    return null
  }
  const parsed = parseSchemaIRI(value as SchemaIRI)
  return parsed.iri
}

function asSchemaDefinitionStatus(value: unknown): SchemaDefinitionStatus | null {
  return value === 'draft' || value === 'published' || value === 'deprecated' || value === 'revoked'
    ? value
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}
