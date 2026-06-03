/**
 * System schema pack for node-native federation control-plane metadata.
 */

import type { DID, SchemaIRI } from '../node'
import type { InferNode, Schema, ValidationError, ValidationResult } from '../types'
import { base64ToBytes, hashHex, verify } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import { defineSchema } from '../define'
import { checkbox, number, person, select, text } from '../properties'

const SCHEMA_STATUS_OPTIONS = [
  { id: 'draft', name: 'Draft', color: 'gray' },
  { id: 'published', name: 'Published', color: 'green' },
  { id: 'deprecated', name: 'Deprecated', color: 'yellow' },
  { id: 'revoked', name: 'Revoked', color: 'red' }
] as const

const COMPATIBILITY_MODE_OPTIONS = [
  { id: 'compatible', name: 'Compatible', color: 'green' },
  { id: 'requires-lens', name: 'Requires Lens', color: 'yellow' },
  { id: 'breaking', name: 'Breaking', color: 'red' }
] as const

const POLICY_STATUS_OPTIONS = [
  { id: 'active', name: 'Active', color: 'green' },
  { id: 'superseded', name: 'Superseded', color: 'yellow' },
  { id: 'revoked', name: 'Revoked', color: 'red' }
] as const

const PRESENCE_VISIBILITY_OPTIONS = [
  { id: 'private', name: 'Private', color: 'gray' },
  { id: 'trusted-app', name: 'Trusted App', color: 'blue' },
  { id: 'public-metadata', name: 'Public Metadata', color: 'green' }
] as const

const PRESENCE_COUNT_BUCKET_OPTIONS = [
  { id: '0', name: '0', color: 'gray' },
  { id: '1', name: '1', color: 'gray' },
  { id: '2-5', name: '2-5', color: 'blue' },
  { id: '6-20', name: '6-20', color: 'blue' },
  { id: '21-100', name: '21-100', color: 'green' },
  { id: '100+', name: '100+', color: 'green' }
] as const

const SCHEMA_IRI_PATTERN = /^xnet:\/\/[^/]+\/.+/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const CONTENT_HASH_PATTERN = /^cid:blake3:[0-9a-f]{64}$/

export const SYSTEM_NAMESPACE_KINDS = ['schema', 'compat', 'policy', 'presence', 'authz'] as const

export type SystemNamespaceKind = (typeof SYSTEM_NAMESPACE_KINDS)[number]

export type SchemaDefinitionStatus = (typeof SCHEMA_STATUS_OPTIONS)[number]['id']
export type SchemaCompatibilityMode = (typeof COMPATIBILITY_MODE_OPTIONS)[number]['id']
export type SyncPolicyStatus = (typeof POLICY_STATUS_OPTIONS)[number]['id']
export type PresenceVisibility = (typeof PRESENCE_VISIBILITY_OPTIONS)[number]['id']
export type PresenceCountBucket = (typeof PRESENCE_COUNT_BUCKET_OPTIONS)[number]['id']

export type SystemFederationErrorCode =
  | 'missing_scope'
  | 'policy_denied'
  | 'invalid_signature'
  | 'invalid_hash'
  | 'invalid_schema_definition'
  | 'invalid_authority'
  | 'replay_rejected'

export type ParsedSystemNamespaceResource = {
  subjectDid: DID
  kind: SystemNamespaceKind
  namespace: string
  localId: string
}

export type SchemaAuthorityResolutionKind = 'did' | 'domain' | 'invalid'

export type SchemaAuthorityResolution = ValidationResult & {
  kind: SchemaAuthorityResolutionKind
  authority: string
}

export type SchemaAuthorityResolutionOptions = {
  schemaIri: string
  authority?: string
  publisherDid?: DID
  allowDomainAuthority?: boolean
  domainLinkageProof?: string
}

export type SchemaDefinitionSigningInput = {
  schemaIri: string
  version: string
  authority: string
  contentHash: string
  publishedAt: number
  status: SchemaDefinitionStatus
}

export type ValidateSchemaDefinitionNodeOptions = {
  publisherDid?: DID
  allowDomainAuthority?: boolean
  domainLinkageProof?: string
  authorityPublicKey?: Uint8Array
}

export const SchemaDefinitionSchema = defineSchema({
  name: 'SchemaDefinition',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    schemaIri: text({ required: true, pattern: SCHEMA_IRI_PATTERN }),
    version: text({ required: true, pattern: SEMVER_PATTERN }),
    authority: text({ required: true }),
    definitionBytes: text({ required: true, minLength: 2 }),
    contentHash: text({ required: true, pattern: CONTENT_HASH_PATTERN }),
    publishedAt: number({ required: true, integer: true, min: 0 }),
    status: select({ options: SCHEMA_STATUS_OPTIONS, required: true, default: 'draft' }),
    signature: text({ required: true, minLength: 80 }),
    signingKeyId: text({ required: true }),
    policyDefaults: text({}),
    authorityProof: text({})
  }
})

export const SchemaCompatibilitySchema = defineSchema({
  name: 'SchemaCompatibility',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    fromSchema: text({ required: true, pattern: SCHEMA_IRI_PATTERN }),
    toSchema: text({ required: true, pattern: SCHEMA_IRI_PATTERN }),
    mode: select({ options: COMPATIBILITY_MODE_OPTIONS, required: true }),
    lossless: checkbox({ default: false }),
    lensRef: text({}),
    validatedAt: number({ required: true, integer: true, min: 0 }),
    validatedBy: person({})
  }
})

export const SyncPolicySchema = defineSchema({
  name: 'SyncPolicy',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    subjectDid: person({ required: true }),
    matchRules: text({ required: true, minLength: 2 }),
    destinations: text({ required: true, minLength: 2 }),
    priority: number({ required: true, integer: true, min: 0 }),
    revision: number({ required: true, integer: true, min: 1 }),
    effectiveFrom: number({ required: true, integer: true, min: 0 }),
    expiresAt: number({ integer: true, min: 0 }),
    status: select({ options: POLICY_STATUS_OPTIONS, required: true, default: 'active' })
  }
})

export const PresenceSummarySchema = defineSchema({
  name: 'PresenceSummary',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    subjectDid: person({ required: true }),
    schemaIri: text({ required: true, pattern: SCHEMA_IRI_PATTERN }),
    namespace: text({ required: true }),
    countBucket: select({ options: PRESENCE_COUNT_BUCKET_OPTIONS, required: true }),
    visibility: select({ options: PRESENCE_VISIBILITY_OPTIONS, required: true }),
    lastUpdatedAt: number({ required: true, integer: true, min: 0 }),
    sourcePolicy: text({}),
    noise: text({})
  }
})

export type SchemaDefinition = InferNode<(typeof SchemaDefinitionSchema)['_properties']>
export type SchemaCompatibility = InferNode<(typeof SchemaCompatibilitySchema)['_properties']>
export type SyncPolicy = InferNode<(typeof SyncPolicySchema)['_properties']>
export type PresenceSummary = InferNode<(typeof PresenceSummarySchema)['_properties']>

export const SYSTEM_SCHEMA_IRIS = {
  SchemaDefinition: SchemaDefinitionSchema.schema['@id'],
  SchemaCompatibility: SchemaCompatibilitySchema.schema['@id'],
  SyncPolicy: SyncPolicySchema.schema['@id'],
  PresenceSummary: PresenceSummarySchema.schema['@id']
} as const satisfies Record<string, SchemaIRI>

export const SYSTEM_SCHEMA_BASE_IRIS = {
  SchemaDefinition: 'xnet://xnet.fyi/SchemaDefinition',
  SchemaCompatibility: 'xnet://xnet.fyi/SchemaCompatibility',
  SyncPolicy: 'xnet://xnet.fyi/SyncPolicy',
  PresenceSummary: 'xnet://xnet.fyi/PresenceSummary',
  Grant: 'xnet://xnet.fyi/Grant'
} as const

export function isSystemSchemaIri(schemaIri: string): schemaIri is SchemaIRI {
  return (
    Object.values(SYSTEM_SCHEMA_IRIS).some((iri) => schemaIri === iri) ||
    Object.values(SYSTEM_SCHEMA_BASE_IRIS).some((iri) => schemaIri === iri)
  )
}

export function buildSystemNamespace(subjectDid: DID, kind: SystemNamespaceKind): string {
  return `xnet://${subjectDid}/sys/${kind}/`
}

export function buildSystemNodeId(
  subjectDid: DID,
  kind: SystemNamespaceKind,
  localId: string
): string {
  return `${buildSystemNamespace(subjectDid, kind)}${localId.replace(/^\/+/, '')}`
}

export function parseSystemNamespaceResource(
  resource: string
): ParsedSystemNamespaceResource | null {
  const kinds = SYSTEM_NAMESPACE_KINDS.join('|')
  const match = new RegExp(`^xnet://(did:key:[^/]+)/sys/(${kinds})(?:/(.*))?$`).exec(resource)
  if (!match) {
    return null
  }

  const [, subjectDid, kind, localId = ''] = match
  return {
    subjectDid: subjectDid as DID,
    kind: kind as SystemNamespaceKind,
    namespace: buildSystemNamespace(subjectDid as DID, kind as SystemNamespaceKind),
    localId
  }
}

export function isSystemNamespaceResource(resource: string): boolean {
  return parseSystemNamespaceResource(resource) !== null
}

export function resolveSchemaAuthority(
  options: SchemaAuthorityResolutionOptions
): SchemaAuthorityResolution {
  const authority = extractSchemaIriAuthority(options.schemaIri)
  const declaredAuthority = options.authority ?? authority ?? ''
  const errors: ValidationError[] = []

  if (!authority) {
    errors.push({
      path: 'schemaIri',
      message: 'schemaIri must use xnet://<authority>/<name> format',
      value: options.schemaIri
    })
    return { valid: false, errors, kind: 'invalid', authority: declaredAuthority }
  }

  if (declaredAuthority !== authority) {
    errors.push({
      path: 'authority',
      message: 'authority must match schema IRI authority',
      value: declaredAuthority
    })
  }

  if (authority.startsWith('did:key:')) {
    if (options.publisherDid && options.publisherDid !== authority) {
      errors.push({
        path: 'publisherDid',
        message: 'DID authority schemas must be published by the authority DID',
        value: options.publisherDid
      })
    }

    return { valid: errors.length === 0, errors, kind: 'did', authority }
  }

  if (!options.allowDomainAuthority) {
    errors.push({
      path: 'schemaIri',
      message: 'domain authority schemas require explicit domain linkage policy',
      value: options.schemaIri
    })
  }

  if (options.allowDomainAuthority && !options.domainLinkageProof) {
    errors.push({
      path: 'domainLinkageProof',
      message: 'domain authority schemas require a domain linkage proof'
    })
  }

  return { valid: errors.length === 0, errors, kind: 'domain', authority }
}

export function computeSchemaDefinitionContentHash(definitionBytes: string): string {
  return `cid:blake3:${hashHex(new TextEncoder().encode(definitionBytes))}`
}

export function createSchemaDefinitionSigningPayload(
  input: SchemaDefinitionSigningInput
): Uint8Array {
  return new TextEncoder().encode(canonicalJson(input))
}

export function validateSchemaDefinitionNode(
  node: unknown,
  options: ValidateSchemaDefinitionNodeOptions = {}
): ValidationResult {
  const flattened = flattenNodeProperties(node)
  const schemaResult = SchemaDefinitionSchema.validate(flattened)
  const errors = [...schemaResult.errors]

  const schemaIri = asString(flattened.schemaIri)
  const version = asString(flattened.version)
  const authority = asString(flattened.authority)
  const definitionBytes = asString(flattened.definitionBytes)
  const contentHash = asString(flattened.contentHash)
  const signature = asString(flattened.signature)
  const publishedAt = asNumber(flattened.publishedAt)
  const status = asSchemaDefinitionStatus(flattened.status)
  const authorityProof = asString(flattened.authorityProof)

  if (schemaIri && authority) {
    const authorityResult = resolveSchemaAuthority({
      schemaIri,
      authority,
      publisherDid: options.publisherDid ?? asDid(flattened.createdBy),
      allowDomainAuthority: options.allowDomainAuthority,
      domainLinkageProof: options.domainLinkageProof ?? authorityProof ?? undefined
    })
    errors.push(...authorityResult.errors)
  }

  if (definitionBytes && contentHash) {
    const expectedHash = computeSchemaDefinitionContentHash(definitionBytes)
    if (contentHash !== expectedHash) {
      errors.push({
        path: 'contentHash',
        message: 'contentHash must match definitionBytes',
        value: contentHash
      })
    }

    const parsedDefinition = parseSchemaJson(definitionBytes)
    if (!parsedDefinition) {
      errors.push({
        path: 'definitionBytes',
        message: 'definitionBytes must contain a valid JSON schema definition'
      })
    } else {
      if (parsedDefinition['@id'] !== schemaIri) {
        errors.push({
          path: 'definitionBytes.@id',
          message: 'embedded schema @id must match schemaIri',
          value: parsedDefinition['@id']
        })
      }
      if (parsedDefinition.version !== version) {
        errors.push({
          path: 'definitionBytes.version',
          message: 'embedded schema version must match version',
          value: parsedDefinition.version
        })
      }
    }
  }

  if (
    schemaIri &&
    version &&
    authority &&
    contentHash &&
    publishedAt !== null &&
    status &&
    signature
  ) {
    const signatureResult = validateSchemaDefinitionSignature({
      signature,
      authority,
      authorityPublicKey: options.authorityPublicKey,
      payload: createSchemaDefinitionSigningPayload({
        schemaIri,
        version,
        authority,
        contentHash,
        publishedAt,
        status
      })
    })
    errors.push(...signatureResult.errors)
  }

  return { valid: errors.length === 0, errors }
}

function validateSchemaDefinitionSignature(input: {
  signature: string
  authority: string
  authorityPublicKey?: Uint8Array
  payload: Uint8Array
}): ValidationResult {
  const errors: ValidationError[] = []
  let signatureBytes: Uint8Array

  try {
    signatureBytes = base64ToBytes(input.signature)
  } catch {
    return {
      valid: false,
      errors: [{ path: 'signature', message: 'signature must be base64 encoded' }]
    }
  }

  if (signatureBytes.length !== 64) {
    errors.push({
      path: 'signature',
      message: 'signature must be an Ed25519 signature'
    })
  }

  const publicKey = input.authorityPublicKey ?? getAuthorityPublicKey(input.authority)
  if (publicKey && !verify(input.payload, signatureBytes, publicKey)) {
    errors.push({
      path: 'signature',
      message: 'signature must verify against schema authority'
    })
  }

  return { valid: errors.length === 0, errors }
}

function getAuthorityPublicKey(authority: string): Uint8Array | null {
  if (!authority.startsWith('did:key:')) {
    return null
  }

  try {
    return parseDID(authority)
  } catch {
    return null
  }
}

function extractSchemaIriAuthority(schemaIri: string): string | null {
  const match = /^xnet:\/\/([^/]+)\/.+/.exec(schemaIri)
  return match?.[1] ?? null
}

function flattenNodeProperties(node: unknown): Record<string, unknown> {
  if (!isRecord(node)) {
    return {}
  }

  if (isRecord(node.properties)) {
    return {
      id: node.id,
      schemaId: node.schemaId,
      createdAt: node.createdAt,
      createdBy: node.createdBy,
      ...node.properties
    }
  }

  return node
}

function parseSchemaJson(definitionBytes: string): Schema | null {
  try {
    const parsed = JSON.parse(definitionBytes) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed['@id'] !== 'string') return null
    if (typeof parsed.version !== 'string') return null
    if (!Array.isArray(parsed.properties)) return null
    return parsed as unknown as Schema
  } catch {
    return null
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeys(entry)])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asDid(value: unknown): DID | undefined {
  return typeof value === 'string' && value.startsWith('did:key:') ? (value as DID) : undefined
}

function asSchemaDefinitionStatus(value: unknown): SchemaDefinitionStatus | null {
  return SCHEMA_STATUS_OPTIONS.some((option) => option.id === value)
    ? (value as SchemaDefinitionStatus)
    : null
}
