# L0 · Cryptographic Primitives

**This document is normative.** Part of [xNet Protocol `xnet/1.0`](00-overview.md).

L0 is mostly a **profile over existing standards**. Implementations SHOULD use
audited libraries (the reference implementation uses the
[`@noble/*`](https://paulmillr.com/noble/) family). This document pins the exact
algorithms, encodings, and parameters so two implementations derive identical
DIDs and verify each other's signatures.

Reference: [`packages/crypto/src/`](../../../packages/crypto/src/),
[`packages/identity/src/did.ts`](../../../packages/identity/src/did.ts).

## 1. Identity: `did:key` over Ed25519

An xNet identity is a [`did:key`](https://w3c-ccg.github.io/did-key-spec/)
encoding an Ed25519 public key. Derivation (MUST):

1. Generate or import a 32‑byte Ed25519 key pair (private seed → public key per
   [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032)).
2. Prepend the multicodec prefix for Ed25519‑pub: the two bytes `0xed 0x01`.
3. [base58btc](https://github.com/multiformats/multibase)‑encode the prefixed
   bytes.
4. The DID is the string `did:key:z` + that encoding. (The `z` is the multibase
   prefix for base58btc; it is part of the DID, not added separately.)

```
DID = "did:key:" + "z" + base58btc( 0xED 0x01 || ed25519_public_key )
```

A DID MUST round‑trip: parsing strips `did:key:z`, base58btc‑decodes, verifies
the `0xed01` prefix, and yields the 32‑byte public key. Implementations MUST
reject DIDs whose multicodec prefix is not `0xed01` (only Ed25519 is defined in
`xnet/1.0`).

Type: `DID = `did:key:${string}`` — [`node.ts`](../../../packages/data/src/schema/node.ts).

## 2. Signatures: Ed25519

- **Algorithm:** Ed25519 (RFC 8032), 32‑byte keys, **64‑byte** signatures.
- **Determinism:** Ed25519 is deterministic — the same key over the same message
  yields a byte‑identical signature. The protocol relies on this (it lets WebCrypto,
  a worker, or a remote signer produce identical bytes; see
  [`createWebCryptoChangeSigner`](../../../packages/sync/src/change.ts)).
- **What is signed:** see [L1 §Hashing](02-data-model.md) — a `Change` is signed
  over the **UTF‑8 bytes of its hash string** (`cid:blake3:<hex>`), *not* over the
  raw digest. This detail is mandatory for cross‑implementation verification.

## 3. Hashing

| Use | Algorithm | Notes |
|---|---|---|
| Content IDs / change hashes | **BLAKE3** (256‑bit) | Default. Encoded as `cid:blake3:<hex>` (lowercase hex). |
| HKDF / key derivation | HKDF‑**SHA‑256** ([RFC 5869](https://www.rfc-editor.org/rfc/rfc5869)) | Domain‑separated `info` strings (§6). |

> ⚠️ **Implementer note:** xNet change hashes are **BLAKE3**, not SHA‑256. The
> `cid:blake3:` prefix is part of the hashed‑then‑signed string, so getting the
> algorithm or the prefix wrong makes every signature fail to verify. The
> [golden vectors](90-conformance.md) pin this exactly.

## 4. Symmetric encryption: XChaCha20‑Poly1305

- **Algorithm:** XChaCha20‑Poly1305 (AEAD).
- **Key:** 32 bytes. **Nonce:** 24 bytes (random per message). **Tag:** 16 bytes,
  appended to ciphertext.
- Wire layout of an encrypted blob: `nonce(24) || ciphertext || tag(16)` (the
  reference packs nonce + ciphertext‑with‑tag as separate fields; see
  [`symmetric.ts`](../../../packages/crypto/src/symmetric.ts)).

## 5. Asymmetric: X25519 + per‑recipient key wrapping

Content keys are wrapped per recipient so that **the ability to decrypt is
itself the access‑control mechanism** (see [L3](04-authorization.md)).

To wrap a 32‑byte content key for a recipient (MUST):

1. Generate an ephemeral X25519 key pair.
2. ECDH: `shared = X25519(ephemeral_priv, recipient_x25519_pub)`
   ([RFC 7748](https://www.rfc-editor.org/rfc/rfc7748)).
3. Derive a wrapping key via HKDF‑SHA‑256 over `shared` (domain‑separated).
4. Encrypt the content key with XChaCha20‑Poly1305 under the wrapping key.
5. Store `{ algorithm: "X25519-XChaCha20", ephemeralPublicKey, wrappedKey, nonce }`.

A node may be addressed to the sentinel **`PUBLIC`** recipient with an
all‑zero content key, so public and private nodes share one code path; the
security boundary is the recipient set + relay policy, not key secrecy.
Reference: [`envelope.ts`](../../../packages/crypto/src/envelope.ts).

The X25519 encryption key and the Ed25519 signing key are distinct; both MAY be
derived deterministically from one seed via HKDF with separate `info` contexts
(§6), enabling seed‑phrase multi‑device recovery.

## 6. Key derivation contexts

When deriving keys from a seed, implementations MUST use HKDF‑SHA‑256 with these
domain‑separation `info` strings to remain interoperable with reference key
bundles:

| Key | HKDF `info` |
|---|---|
| Ed25519 signing | `xnet-ed25519-v1` |
| X25519 encryption | `xnet-x25519-v1` |
| ML‑DSA‑65 (level ≥1) | `xnet-ml-dsa-65-v1` |
| ML‑KEM‑768 (level ≥1) | `xnet-ml-kem-768-v1` |

## 7. Signature levels (crypto agility)

`xnet/1.0` defines three signature **levels**. Level 0 is the default and the
only one REQUIRED for baseline conformance.

| Level | Name | Signing | Key agreement | Signature size |
|---|---|---|---|---|
| **0** | Fast | Ed25519 | X25519 | 64 B |
| 1 | Hybrid | Ed25519 **+** ML‑DSA‑65 | X25519 + ML‑KEM‑768 | ~3.4 KB |
| 2 | Post‑Quantum | ML‑DSA‑65 | ML‑KEM‑768 | ~3.3 KB |

ML‑DSA is [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final); ML‑KEM is
[FIPS 203](https://csrc.nist.gov/pubs/fips/203/final). A peer advertises its
`cryptoLevel` in the [handshake](03-replication.md); receivers MUST accept any
level ≤ their own maximum and MUST be able to *verify* level‑0 signatures.
Reference: [`security-level.ts`](../../../packages/crypto/src/security-level.ts),
[`hybrid-keygen.ts`](../../../packages/crypto/src/hybrid-keygen.ts).

## 8. Capability tokens: UCAN

Delegated authority uses [UCAN](https://github.com/ucan-wg/spec) (JWT/EdDSA with a
proof chain). The full semantics are specified in [L3 §Grants & UCAN](04-authorization.md).
`xnet/1.0` pins the **UCAN 1.0** profile; a future UCAN version is a new umbrella
version via [XPP](xpp/). Reference: [`packages/identity/src/ucan.ts`](../../../packages/identity/src/ucan.ts).

Continue to [L1 · Data Model →](02-data-model.md)
