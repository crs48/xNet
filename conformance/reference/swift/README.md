# Swift reference kernel

A small implementation of the xNet **L0 + L1 interop kernel** in Swift — the
Apple-platform sibling of [`../python`](../python). Its only job is to **prove
the protocol boundary is real on Apple platforms**: that the written
[spec](../../../docs/specs/protocol/) plus the [golden vectors](../../vectors)
are sufficient to interoperate, without reading the TypeScript source.

This is the concrete, runnable down-payment on
[exploration 0210](../../../docs/explorations/0210_%5B_%5D_NATIVE_SWIFT_SDK_AND_PORTABLE_MULTI_LANGUAGE_CORE.md)
(native Swift SDK / portable core), Phase 0 — "pin the seam."

## What it proves

Running `swift run VerifyVectors` against the TypeScript-generated vectors
confirms that an independent Swift implementation:

- derives the **same `did:key`** from a seed, and round-trips it back to the
  same public key ([L0 §1](../../../docs/specs/protocol/01-primitives.md));
- computes the **same canonical bytes** and the **same `cid:blake3:` change
  hash** ([L1 §6](../../../docs/specs/protocol/02-data-model.md)); and
- **verifies** a change signed by TypeScript.

If Swift and TypeScript agree on these bytes, any two conforming
implementations will too.

## The one Apple-platform caveat (a real finding)

Unlike the Python kernel (which **re-signs** TypeScript changes byte-for-byte
with PyNaCl), this kernel does **not** assert byte-identical re-signing. Apple's
**CryptoKit `Curve25519.Signing` uses randomized nonces**, so its Ed25519
signatures *verify* correctly but are **not** the deterministic RFC-8032
signature that `@noble`/PyNaCl produce. That is fine for interop — you verify
others' signatures and emit your own valid ones — but it means:

- a native Swift port can fully participate (sign/verify/converge); yet
- it **cannot reproduce a specific signature** from a key + message.

If byte-for-byte deterministic signing is ever required (e.g. regenerating a
golden vector from Swift), use a deterministic Ed25519 (a vendored RFC-8032
implementation or a Rust core via FFI) rather than CryptoKit. This concretely
validates the "crypto gaps on Apple" risk called out in exploration 0210.

## Dependencies

- **CryptoKit** — Ed25519 signing/verification (system framework; no fetch).
- [`nixberg/blake3-swift`](https://github.com/nixberg/blake3-swift) — BLAKE3
  (CryptoKit has none). The Swift analogue of the Python kernel's
  `pip install blake3`.
- base58btc and canonical JSON are implemented inline (no dependency).

## Run it

```bash
cd conformance/reference/swift
swift run VerifyVectors
```

Expected output ends with `18 passed, 0 failed` (verified with Swift 6.3 on
macOS). `Package.resolved` pins the exact dependency versions.

## Files

- [`Sources/XNetKernel/XNetKernel.swift`](Sources/XNetKernel/XNetKernel.swift)
  — the kernel: did:key, base58btc, canonical JSON, BLAKE3 hashing, Ed25519
  signing/verification.
- [`Sources/VerifyVectors/main.swift`](Sources/VerifyVectors/main.swift) — loads
  the corpus and checks the kernel against it.

Like the [Python kernel](../python), this is **not run in CI** (there is no
macOS/Swift job); it is reference material kept in sync by hand. The
authoritative drift guard is the TypeScript
[`conformance.test.ts`](../../../packages/runtime/src/conformance.test.ts).
