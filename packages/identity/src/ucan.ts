/**
 * UCAN (User Controlled Authorization Networks) token implementation
 */
import type { UCANCapability, UCANToken } from './types'
import { sign, verify } from '@xnet/crypto'
import { parseDID } from './did'

/**
 * Options for creating a UCAN token
 */
export type CreateUCANOptions = {
  issuer: string // Issuer DID
  issuerKey: Uint8Array // Issuer private key
  audience: string // Audience DID
  capabilities: UCANCapability[]
  expiration?: number // Unix timestamp (default: 1 hour from now)
  proofs?: string[] // Parent UCAN tokens
}

/**
 * Result of verifying a UCAN token
 */
export type VerifyResult = {
  valid: boolean
  payload?: UCANToken
  error?: string
}

type UCANHeader = {
  alg: 'EdDSA'
  typ: 'JWT'
}

type UCANPayload = Omit<UCANToken, 'sig'>

type ParsedToken = {
  header: UCANHeader
  payload: UCANPayload
  signature: Uint8Array
  signingInput: string
}

const createHeader = (): UCANHeader => ({ alg: 'EdDSA', typ: 'JWT' })

const createPayload = (
  issuer: string,
  audience: string,
  expiration: number,
  capabilities: UCANCapability[],
  proofs: string[]
): UCANPayload => ({
  iss: issuer,
  aud: audience,
  exp: expiration,
  att: capabilities,
  prf: proofs
})

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value)

const isCapability = (value: unknown): value is UCANCapability => {
  if (!value || typeof value !== 'object') return false
  const cap = value as Record<string, unknown>
  return typeof cap.with === 'string' && typeof cap.can === 'string'
}

const parsePayload = (payload: unknown): UCANPayload | null => {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.iss !== 'string') return null
  if (typeof record.aud !== 'string') return null
  if (typeof record.exp !== 'number' || !Number.isFinite(record.exp)) return null
  if (!Array.isArray(record.att) || !record.att.every(isCapability)) return null
  if (!Array.isArray(record.prf) || !record.prf.every((entry) => typeof entry === 'string'))
    return null

  return {
    iss: record.iss,
    aud: record.aud,
    exp: record.exp,
    att: record.att,
    prf: record.prf
  }
}

const createSigningInput = (header: string, body: string): string => `${header}.${body}`

const actionAllows = (granted: string, requested: string): boolean =>
  granted === '*' || granted === requested

const resourceAllows = (granted: string, requested: string): boolean => {
  if (granted === '*') return true
  if (granted === requested) return true
  if (granted.endsWith('/*')) {
    const prefix = granted.slice(0, -2)
    return requested.startsWith(prefix)
  }
  return false
}

const capabilityAllows = (granted: UCANCapability, requested: UCANCapability): boolean =>
  actionAllows(granted.can, requested.can) && resourceAllows(granted.with, requested.with)

const validateProofChain = (
  payload: UCANPayload,
  proofs: UCANToken[]
): { valid: boolean; error?: string } => {
  if (payload.prf.length === 0) return { valid: true }

  for (const proof of proofs) {
    if (proof.aud !== payload.iss) {
      return { valid: false, error: 'Invalid proof audience' }
    }
  }

  const maxAllowedExp = Math.min(...proofs.map((proof) => proof.exp))
  if (payload.exp > maxAllowedExp) {
    return { valid: false, error: 'Token expiry exceeds proof' }
  }

  const parentCaps = proofs.flatMap((proof) => proof.att)
  const attenuated = payload.att.every((cap) =>
    parentCaps.some((parentCap) => capabilityAllows(parentCap, cap))
  )

  if (!attenuated) {
    return { valid: false, error: 'Capability not delegated' }
  }

  return { valid: true }
}

/**
 * Create a UCAN token
 */
export function createUCAN(options: CreateUCANOptions): string {
  const {
    issuer,
    issuerKey,
    audience,
    capabilities,
    expiration = Math.floor(Date.now() / 1000) + 3600, // 1 hour default
    proofs = []
  } = options

  const header = toBase64Url(JSON.stringify(createHeader()))
  const payload = createPayload(issuer, audience, expiration, capabilities, proofs)
  const body = toBase64Url(JSON.stringify(payload))
  const signingInput = createSigningInput(header, body)

  const signature = sign(encodeUtf8(signingInput), issuerKey)
  const sig = toBase64UrlBytes(signature)

  return `${header}.${body}.${sig}`
}

/**
 * Verify a UCAN token
 */
export function verifyUCAN(token: string): VerifyResult {
  return verifyUCANInternal(token, new Set())
}

function verifyUCANInternal(token: string, stack: Set<string>): VerifyResult {
  if (stack.has(token)) {
    return { valid: false, error: 'Proof cycle detected' }
  }
  stack.add(token)

  const parsed = parseUCAN(token)
  if (!parsed) {
    stack.delete(token)
    return { valid: false, error: 'Invalid token format' }
  }

  const { payload, signature, signingInput } = parsed

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    stack.delete(token)
    return { valid: false, error: 'Token expired' }
  }

  let publicKey: Uint8Array
  try {
    publicKey = parseDID(payload.iss)
  } catch (err) {
    stack.delete(token)
    return { valid: false, error: `Invalid issuer DID: ${err}` }
  }

  if (!verify(encodeUtf8(signingInput), signature, publicKey)) {
    stack.delete(token)
    return { valid: false, error: 'Invalid signature' }
  }

  const proofResults = payload.prf.map((proof) => verifyUCANInternal(proof, stack))
  const invalidProof = proofResults.find((result) => !result.valid)
  if (invalidProof) {
    stack.delete(token)
    return { valid: false, error: invalidProof.error ?? 'Invalid proof' }
  }

  const proofPayloads = proofResults
    .map((result) => result.payload)
    .filter((proof): proof is UCANToken => Boolean(proof))

  const chainResult = validateProofChain(payload, proofPayloads)
  if (!chainResult.valid) {
    stack.delete(token)
    return { valid: false, error: chainResult.error }
  }

  stack.delete(token)
  return {
    valid: true,
    payload: {
      ...payload,
      sig: signature
    }
  }
}

/**
 * Check if a UCAN token has a specific capability
 */
export function hasCapability(token: UCANToken, resource: string, action: string): boolean {
  const requested: UCANCapability = { with: resource, can: action }
  return token.att.some((cap) => capabilityAllows(cap, requested))
}

/**
 * Get all capabilities from a UCAN token
 */
export function getCapabilities(token: UCANToken): UCANCapability[] {
  return token.att
}

/**
 * Check if a UCAN token is expired
 */
export function isExpired(token: UCANToken): boolean {
  return token.exp < Math.floor(Date.now() / 1000)
}

// ─── Unicode-safe base64url helpers ──────────────────────────

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function fromBase64UrlBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function parseUCAN(token: string): ParsedToken | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerPart, bodyPart, sigPart] = parts
    const header = JSON.parse(fromBase64Url(headerPart)) as UCANHeader

    // Validate header algorithm and type
    if (header.alg !== 'EdDSA') return null
    if (header.typ !== 'JWT') return null

    const payloadRaw = JSON.parse(fromBase64Url(bodyPart))
    const payload = parsePayload(payloadRaw)
    if (!payload) return null
    const signature = fromBase64UrlBytes(sigPart)

    return {
      header,
      payload,
      signature,
      signingInput: createSigningInput(headerPart, bodyPart)
    }
  } catch {
    return null
  }
}
