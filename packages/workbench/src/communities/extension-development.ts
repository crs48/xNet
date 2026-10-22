import { TaggedError } from '@xnetjs/core'
import { createExtensionVersion, type SharedExtension } from './extension-versions'
export { createExtensionVersion } from './extension-versions'

export class DevelopmentError extends TaggedError {
  readonly _tag = 'DevelopmentError' as const
}
export interface DevelopmentInput {
  id: string
  author: string
  createdAt: number
  updatedAt: number
  content: string
  digest: string
}
export interface DevelopmentHistory {
  inputs: DevelopmentInput[]
  brief: string
  provider: string
  model: string
  template: 'conversation-v1'
  context: 'explicit'
}
export type DevelopmentRecord =
  | { kind: 'project'; title: string; brief: string; nonce: string }
  | {
      kind: 'host'
      project: string
      epoch: string
      expiresAt: number
      requesters: string[]
      limit: number
    }
  | {
      kind: 'request'
      project: string
      host: string
      epoch: string
      parents: string[]
      contextIds: string[]
      contextDigests?: string[]
    }
  | { kind: 'feedback'; project: string; parents: string[] }
  | { kind: 'withdraw'; project: string; request: string }
  | {
      kind: 'attempt'
      project: string
      request: string
      attempt: string
      status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
      phase: string
      startedAt: number
    }
  | {
      kind: 'version'
      project: string
      parents: string[]
      extension: SharedExtension
      request?: string
      attempt?: string
      history?: DevelopmentHistory
      manual: boolean
    }
  | { kind: 'accept'; project: string; version: string; previous: string[] }

export interface DevelopmentNode {
  id: string
  createdBy: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
  schemaId?: string
  properties: Record<string, unknown>
}
export interface DevelopmentEntry {
  id: string
  author: string
  createdAt: number
  channel: string
  content: string
  record: DevelopmentRecord
}
const fail = (message: string): never => {
  throw new DevelopmentError(message)
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('Invalid development record.')
  return value as Record<string, unknown>
}
const string = (value: unknown, max = 200): string => {
  if (typeof value !== 'string' || value.length > max) return fail('Invalid development text.')
  return value
}
const id = (value: unknown): string => {
  const result = string(value)
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(result)) return fail('Invalid development reference.')
  return result
}
const strings = (value: unknown, max: number) => {
  if (!Array.isArray(value) || value.length > max) return fail('Too many development references.')
  const values = value.map(id)
  if (new Set(values).size !== values.length) return fail('Duplicate development references.')
  return values
}
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return fail('Invalid development number.')
  return value
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail('Unsupported development fields.')
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
export async function developmentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function captureDevelopmentInput(node: DevelopmentNode): Promise<DevelopmentInput> {
  const value = {
    id: node.id,
    author: node.createdBy,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    content: string(node.properties.content, 10000)
  }
  return { ...value, digest: await developmentDigest(value) }
}
export async function decodeDevelopmentRecord(raw: unknown): Promise<DevelopmentRecord> {
  const v = object(raw)
  if (new TextEncoder().encode(JSON.stringify(v)).length > 160000)
    return fail('Development record exceeds 160 KB.')
  const kind = string(v.kind, 24)
  if (kind === 'project') {
    keys(v, ['kind', 'title', 'brief', 'nonce'])
    return { kind, title: string(v.title, 120), brief: string(v.brief, 4000), nonce: id(v.nonce) }
  }
  const project = id(v.project)
  if (kind === 'host') {
    keys(v, ['kind', 'project', 'epoch', 'expiresAt', 'requesters', 'limit'])
    const limit = number(v.limit)
    if (limit < 1 || limit > 60) return fail('Allow between 1 and 60 requests.')
    return {
      kind,
      project,
      epoch: id(v.epoch),
      expiresAt: number(v.expiresAt),
      requesters: strings(v.requesters, 50),
      limit
    }
  }
  if (kind === 'request') {
    keys(v, ['kind', 'project', 'host', 'epoch', 'parents', 'contextIds', 'contextDigests'])
    const contextIds = strings(v.contextIds, 30)
    const contextDigests = v.contextDigests === undefined ? undefined : v.contextDigests
    if (
      contextDigests !== undefined &&
      (!Array.isArray(contextDigests) ||
        contextDigests.length !== contextIds.length ||
        contextDigests.some(
          (digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
        ))
    )
      return fail('Invalid context revision fingerprints.')
    return {
      kind,
      project,
      host: id(v.host),
      epoch: id(v.epoch),
      parents: strings(v.parents, 4),
      contextIds,
      ...(contextDigests ? { contextDigests: contextDigests as string[] } : {})
    }
  }
  if (kind === 'feedback') {
    keys(v, ['kind', 'project', 'parents'])
    return { kind, project, parents: strings(v.parents, 4) }
  }
  if (kind === 'withdraw') {
    keys(v, ['kind', 'project', 'request'])
    return { kind, project, request: id(v.request) }
  }
  if (kind === 'attempt') {
    keys(v, ['kind', 'project', 'request', 'attempt', 'status', 'phase', 'startedAt'])
    if (
      !['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(
        String(v.status)
      )
    )
      return fail('Invalid attempt state.')
    return {
      kind,
      project,
      request: id(v.request),
      attempt: id(v.attempt),
      status: v.status as Extract<DevelopmentRecord, { kind: 'attempt' }>['status'],
      phase: string(v.phase, 200),
      startedAt: number(v.startedAt)
    }
  }
  if (kind === 'accept') {
    keys(v, ['kind', 'project', 'version', 'previous'])
    return { kind, project, version: id(v.version), previous: strings(v.previous, 50) }
  }
  if (kind !== 'version') return fail('Unknown development record.')
  keys(v, ['kind', 'project', 'parents', 'extension', 'request', 'attempt', 'history', 'manual'])
  const source = object(v.extension)
  keys(source, ['title', 'summary', 'source', 'author', 'parent', 'changeNote', 'versionId'])
  const extension = await createExtensionVersion({
    title: string(source.title, 120),
    summary: string(source.summary, 2000),
    source: string(source.source, 24000),
    author: id(source.author),
    changeNote: string(source.changeNote, 1000),
    ...(source.parent !== undefined ? { parent: id(source.parent) } : {})
  })
  if (extension.versionId !== source.versionId) return fail('Version source fingerprint mismatch.')
  if (typeof v.manual !== 'boolean') return fail('Missing version provenance.')
  let history: DevelopmentHistory | undefined
  if (v.history !== undefined) {
    const h = object(v.history)
    keys(h, ['inputs', 'brief', 'provider', 'model', 'template', 'context'])
    if (
      !Array.isArray(h.inputs) ||
      h.inputs.length > 31 ||
      h.template !== 'conversation-v1' ||
      h.context !== 'explicit'
    )
      return fail('Invalid run context.')
    const inputs = await Promise.all(
      h.inputs.map(async (rawInput) => {
        const input = object(rawInput)
        keys(input, ['id', 'author', 'createdAt', 'updatedAt', 'content', 'digest'])
        const snapshot = {
          id: id(input.id),
          author: id(input.author),
          createdAt: number(input.createdAt),
          updatedAt: number(input.updatedAt),
          content: string(input.content, 10000)
        }
        const digest = await developmentDigest(snapshot)
        if (digest !== input.digest) return fail('Message revision fingerprint mismatch.')
        return { ...snapshot, digest }
      })
    )
    if (JSON.stringify(inputs).length > 45000) return fail('History exceeds its context budget.')
    history = {
      inputs,
      brief: string(h.brief, 4000),
      provider: string(h.provider, 100),
      model: string(h.model, 200),
      template: 'conversation-v1',
      context: 'explicit'
    }
  }
  if (!v.manual && (!history || !v.request || !v.attempt))
    return fail('Agent version needs an attributed run.')
  return {
    kind,
    project,
    parents: strings(v.parents, 4),
    extension,
    manual: v.manual,
    ...(v.request ? { request: id(v.request) } : {}),
    ...(v.attempt ? { attempt: id(v.attempt) } : {}),
    ...(history ? { history } : {})
  }
}
export async function developmentMessage(
  author: string,
  channel: string,
  content: string,
  raw: DevelopmentRecord
) {
  const record = await decodeDevelopmentRecord(raw)
  string(content, 10000)
  const nodeId =
    'dev-' + (await developmentDigest({ protocol: 1, author, channel, content, record }))
  const project = record.kind === 'project' ? nodeId : record.project
  return {
    id: nodeId,
    properties: {
      channel,
      content,
      developmentKind: record.kind,
      developmentProject: project,
      development: { version: 1, record: JSON.parse(JSON.stringify(record)) } as Record<
        string,
        unknown
      >,
      ...(record.kind === 'project' ? {} : { inReplyTo: project })
    }
  }
}
export async function readDevelopmentEntry(
  node: DevelopmentNode
): Promise<DevelopmentEntry | null> {
  if (node.deleted || node.properties.redacted || !node.properties.development) return null
  if (node.schemaId && node.schemaId !== 'xnet://xnet.fyi/ChatMessage@1.0.0')
    return fail('Development records must be chat messages.')
  const channel = id(node.properties.channel)
  const content = string(node.properties.content, 10000)
  const envelope = object(node.properties.development)
  keys(envelope, ['version', 'record'])
  if (envelope.version !== 1) return fail('Unsupported development protocol.')
  const record = await decodeDevelopmentRecord(envelope.record)
  const message = await developmentMessage(node.createdBy, channel, content, record)
  if (
    message.id !== node.id ||
    message.properties.developmentKind !== node.properties.developmentKind ||
    message.properties.developmentProject !== node.properties.developmentProject
  )
    return fail('Development record was changed or its attribution is invalid.')
  if (record.kind !== 'project' && node.properties.inReplyTo !== record.project)
    return fail('Development thread does not match its project.')
  if (record.kind === 'version' && record.extension.author !== node.createdBy)
    return fail('Version publisher does not match its author.')
  return {
    id: node.id,
    author: node.createdBy,
    createdAt: node.createdAt,
    channel,
    content,
    record
  }
}
export function acceptedDevelopmentHeads(project: DevelopmentEntry, entries: DevelopmentEntry[]) {
  const candidates = entries.filter(
    (entry) =>
      entry.author === project.author &&
      entry.record.kind === 'accept' &&
      entry.record.project === project.id
  )
  const byId = new Map(candidates.map((entry) => [entry.id, entry]))
  const nodes = new Map(entries.map((entry) => [entry.id, entry]))
  const checked = new Map<string, boolean>()
  const active = new Set<string>()
  const visit = (id: string): boolean => {
    if (active.has(id)) return false
    if (checked.has(id)) return checked.get(id)!
    const entry = byId.get(id)
    if (!entry || entry.record.kind !== 'accept') return false
    const target = nodes.get(entry.record.version)
    if (
      !target ||
      target.record.kind !== 'version' ||
      target.record.project !== project.id ||
      target.channel !== project.channel ||
      entry.channel !== project.channel
    )
      return false
    active.add(id)
    const valid = entry.record.previous.every(visit)
    active.delete(id)
    checked.set(id, valid)
    return valid
  }
  const valid = candidates.filter((entry) => visit(entry.id))
  const superseded = new Set(
    valid.flatMap((entry) => (entry.record.kind === 'accept' ? entry.record.previous : []))
  )
  return {
    heads: valid.filter((entry) => !superseded.has(entry.id)),
    unresolved: candidates.length - valid.length
  }
}
export function developmentAncestry(selected: string, entries: DevelopmentEntry[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const visited = new Set<string>(),
    active = new Set<string>(),
    missing = new Set<string>()
  const versions: DevelopmentEntry[] = []
  const depth = new Map<string, number>()
  const root = byId.get(selected)
  const project = root?.record.kind === 'version' ? root.record.project : undefined
  const visit = (id: string) => {
    if (active.has(id)) {
      missing.add(id)
      return
    }
    if (visited.has(id)) return
    const entry = byId.get(id)
    if (
      !entry ||
      entry.record.kind !== 'version' ||
      entry.record.project !== project ||
      entry.channel !== root?.channel
    ) {
      missing.add(id)
      return
    }
    active.add(id)
    entry.record.parents.forEach(visit)
    active.delete(id)
    visited.add(id)
    depth.set(
      id,
      entry.record.parents.length
        ? 1 + Math.max(...entry.record.parents.map((parent) => depth.get(parent) ?? 0))
        : 0
    )
    versions.push(entry)
  }
  visit(selected)
  // Parents stay before children; independent roots start with their earliest recorded iteration.
  versions.sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.createdAt - b.createdAt)
  return { versions, missing: [...missing] }
}
export function developmentRelationIssue(
  entry: DevelopmentEntry,
  entries: DevelopmentEntry[]
): string | undefined {
  const record = entry.record
  if (record.kind !== 'attempt' && (record.kind !== 'version' || record.manual)) return
  const request = entries.find((candidate) => candidate.id === record.request)
  if (!request || request.record.kind !== 'request')
    return 'The originating request is unavailable.'
  if (
    request.channel !== entry.channel ||
    request.record.project !== record.project ||
    request.record.host !== entry.author
  )
    return 'This result was not published by the requested agent host.'
  if (record.kind === 'version' && canonical(record.parents) !== canonical(request.record.parents))
    return 'The result does not match the requested base versions.'
}
