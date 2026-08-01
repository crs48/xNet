/**
 * Minimal NIP-19 `npub` decoding (exploration 0416).
 *
 * Buzz identifies agents by Nostr public key, which travels as a bech32-encoded
 * `npub1…` string. We need exactly one direction of exactly one entity type —
 * `npub` → 32-byte x-only public key — so this implements bech32 directly
 * rather than adding a dependency for forty lines of well-specified codec.
 *
 * Deliberately strict: every failure mode returns `null` rather than a
 * best-effort guess, because a mis-decoded key would enroll the wrong agent.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

/** Length of a Nostr x-only public key. */
export const NOSTR_PUBKEY_BYTES = 32

function polymod(values: number[]): number {
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GENERATOR[i]
    }
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const high: number[] = []
  const low: number[] = []
  for (const char of hrp) {
    const code = char.charCodeAt(0)
    high.push(code >> 5)
    low.push(code & 31)
  }
  return [...high, 0, ...low]
}

/** Convert 5-bit groups to 8-bit bytes, rejecting invalid padding. */
function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0
  let bits = 0
  const result: number[] = []
  const maxValue = (1 << to) - 1

  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      result.push((acc >> bits) & maxValue)
    }
  }
  // Decoding must not leave a full group behind, and padding must be zero.
  if (bits >= from || ((acc << (to - bits)) & maxValue) !== 0) return null
  return result
}

/**
 * Decode a bech32 string into its human-readable part and data bytes.
 * Returns `null` for anything that is not a well-formed, checksum-valid
 * bech32 string.
 */
export function decodeBech32(value: string): { hrp: string; bytes: Uint8Array } | null {
  // Mixed case is explicitly invalid in bech32.
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) return null
  const lower = value.toLowerCase()

  const separator = lower.lastIndexOf('1')
  if (separator < 1 || separator + 7 > lower.length) return null

  const hrp = lower.slice(0, separator)
  const dataPart = lower.slice(separator + 1)

  const data: number[] = []
  for (const char of dataPart) {
    const index = CHARSET.indexOf(char)
    if (index === -1) return null
    data.push(index)
  }

  if (polymod([...hrpExpand(hrp), ...data]) !== 1) return null

  const payload = convertBits(data.slice(0, -6), 5, 8)
  if (!payload) return null

  return { hrp, bytes: Uint8Array.from(payload) }
}

/**
 * Decode an `npub1…` into its 32-byte x-only public key.
 *
 * @returns The key, or `null` if the string is not a valid `npub`.
 */
export function decodeNpub(npub: string): Uint8Array | null {
  const decoded = decodeBech32(npub.trim())
  if (!decoded || decoded.hrp !== 'npub') return null
  if (decoded.bytes.length !== NOSTR_PUBKEY_BYTES) return null
  return decoded.bytes
}

/** Lowercase hex for a byte array. */
export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Bytes for a lowercase hex string, or `null` if it is not valid hex.
 * `@noble/curves` v2 takes bytes, while Nostr's wire format is hex.
 */
export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
