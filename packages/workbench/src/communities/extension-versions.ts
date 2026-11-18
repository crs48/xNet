import type { ChatExtensionProposal } from './agent-extension'
import { readExtensionProposal } from './agent-extension'

export const EXTENSION_SHARE_MIME = 'application/vnd.xnet.chat-extension+json'
export const EXTENSION_SHARE_LIMIT = 1_000_000
export interface ExtensionLineage {
  versionId: string
  author: string
  parent?: string
  changeNote: string
}
export interface ExtensionRevision extends ChatExtensionProposal {
  id: string
  hash: string
  actor: string
  createdAt: number
  base?: string
  lineage?: ExtensionLineage
}
export interface SharedExtension extends ChatExtensionProposal, ExtensionLineage {}
export function versionLineage(value: SharedExtension): ExtensionLineage {
  return {
    versionId: value.versionId,
    author: value.author,
    changeNote: value.changeNote,
    ...(value.parent ? { parent: value.parent } : {})
  }
}
const fields = ['title', 'summary', 'source', 'author', 'parent', 'changeNote', 'versionId']

function versionBody(value: Omit<SharedExtension, 'versionId'>) {
  return {
    title: value.title,
    summary: value.summary,
    source: value.source,
    author: value.author,
    parent: value.parent ?? null,
    changeNote: value.changeNote
  }
}
export async function createExtensionVersion(
  value: Omit<SharedExtension, 'versionId'>
): Promise<SharedExtension> {
  readExtensionProposal(
    JSON.stringify({ title: value.title, summary: value.summary, source: value.source })
  )
  if (
    !/^did:[a-z0-9]+:[^\s]{1,200}$/.test(value.author) ||
    !value.changeNote.trim() ||
    value.changeNote.length > 1000 ||
    (value.parent !== undefined && !/^[a-zA-Z0-9:_-]{1,200}$/.test(value.parent))
  )
    throw new Error('Invalid extension author, parent or change note.')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(versionBody(value)))
  )
  const versionId = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { ...value, versionId }
}
export function encodeSharedExtension(value: SharedExtension): Uint8Array {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ format: 'xnet-chat-extension', version: 1, revision: value })
  )
  if (bytes.length > EXTENSION_SHARE_LIMIT) throw new Error('This extension is too large to share.')
  return bytes
}
export async function readSharedExtension(
  bytes: Uint8Array,
  sender: string
): Promise<SharedExtension> {
  if (bytes.length > EXTENSION_SHARE_LIMIT)
    throw new Error('This extension exceeds the share limit.')
  const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
    throw new Error('Invalid extension attachment.')
  const object = envelope as Record<string, unknown>
  if (
    object.format !== 'xnet-chat-extension' ||
    object.version !== 1 ||
    Object.keys(object).some((key) => !['format', 'version', 'revision'].includes(key)) ||
    !object.revision ||
    typeof object.revision !== 'object' ||
    Array.isArray(object.revision)
  )
    throw new Error('Unsupported extension attachment format.')
  const value = object.revision as Record<string, unknown>
  if (
    Object.keys(value).some((key) => !fields.includes(key)) ||
    value.author !== sender ||
    typeof value.changeNote !== 'string' ||
    (value.parent !== undefined && typeof value.parent !== 'string') ||
    typeof value.versionId !== 'string'
  )
    throw new Error('Extension attribution or metadata does not match this message.')
  const proposal = readExtensionProposal(
    JSON.stringify({ title: value.title, summary: value.summary, source: value.source })
  )
  const verified = await createExtensionVersion({
    ...proposal,
    author: sender,
    changeNote: value.changeNote,
    ...(typeof value.parent === 'string' ? { parent: value.parent } : {})
  })
  if (verified.versionId !== value.versionId)
    throw new Error('Extension content does not match its version fingerprint.')
  return verified
}
export const revisionKey = (entry: ExtensionRevision) => entry.lineage?.versionId ?? entry.id
/** Same source shared by another author is still a separately reviewed version. */
export async function extensionPermissionHash(
  buildHash: string,
  versionId?: string
): Promise<string> {
  if (!versionId) return buildHash
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ buildHash, versionId }))
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function extensionBranches(history: ExtensionRevision[]) {
  const newest = new Map<string, ExtensionRevision>()
  for (const entry of history) {
    const old = newest.get(revisionKey(entry))
    if (!old || entry.createdAt > old.createdAt) newest.set(revisionKey(entry), entry)
  }
  const unique = [...newest.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  )
  const byKey = new Map(unique.map((entry) => [revisionKey(entry), entry]))
  const visited = new Set<string>()
  const rows: { entry: ExtensionRevision; depth: number; missingParent: boolean }[] = []
  const parentOf = (entry: ExtensionRevision) => entry.lineage?.parent ?? entry.base
  const visit = (entry: ExtensionRevision, depth: number) => {
    const key = revisionKey(entry)
    if (visited.has(key)) return
    visited.add(key)
    const parent = parentOf(entry)
    rows.push({ entry, depth, missingParent: !!parent && !byKey.has(parent) })
    unique.filter((child) => parentOf(child) === key).forEach((child) => visit(child, depth + 1))
  }
  unique.filter((entry) => !byKey.has(parentOf(entry) ?? '')).forEach((entry) => visit(entry, 0))
  unique.forEach((entry) => visit(entry, 0))
  return rows
}
export function extensionComparisonBase(
  revision: ExtensionRevision,
  history: readonly ExtensionRevision[]
):
  | { kind: 'initial' }
  | { kind: 'parent'; revision: ExtensionRevision }
  | { kind: 'missing'; key: string } {
  const key = revision.lineage?.parent ?? revision.base
  if (!key) return { kind: 'initial' }
  const parent = history.find((entry) => revisionKey(entry) === key || entry.id === key)
  return parent ? { kind: 'parent', revision: parent } : { kind: 'missing', key }
}
