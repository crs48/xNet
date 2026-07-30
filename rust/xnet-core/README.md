# xnet-core

A **portable Rust implementation of the xNet interop kernel** — the byte-exact
core of the protocol (docs/specs/protocol/): `did:key` identity, the
canonical-JSON change hash, Ed25519 sign/verify, per-property LWW convergence,
and the pure L2/L3 decision functions (version negotiation, authorization
expression evaluation).

This is **Phase 2** of [exploration 0210](../../docs/explorations/0210_%5B_%5D_NATIVE_SWIFT_SDK_AND_PORTABLE_MULTI_LANGUAGE_CORE.md):
one portable core that can back the Swift, Kotlin, and .NET SDKs via UniFFI / a
C ABI, instead of each language re-implementing the kernel.

## Conformance

`cargo test` runs the **shared golden-vector corpus** (`conformance/vectors/`) —
the same vectors the TypeScript reference and the Python/Swift kernels pass:

```
test l0_identity ... ok      # did:key derivation + round-trip
test l1_change ... ok        # canonical JSON, BLAKE3 hash, verify, AND re-sign
test l1_lww ... ok           # per-property LWW convergence
test l2_replication ... ok   # version-handshake negotiation + catch-up filter
test l3_authz ... ok         # authorization expression-AST evaluation
```

**Re-sign, byte-for-byte.** Unlike the Swift/CryptoKit kernel (whose Ed25519 is
randomized), `xnet-core` reproduces a TypeScript-produced signature **exactly** —
Ed25519 here is the deterministic RFC-8032 construction, implemented on
`curve25519-dalek` + `sha2` (so the only crypto dependencies are audited
group-math and hash primitives; base58btc and canonical JSON are inline). This
makes Rust a candidate for regenerating golden vectors, not just verifying them.

```bash
cd rust/xnet-core
cargo test          # 5 conformance suites + 1 FFI round-trip
```

## The binding surface

[`src/ffi.rs`](src/ffi.rs) exposes the kernel with `String` / `Vec<u8>` / `bool`
signatures — the shape a cross-language binding consumes (protocol data crosses
as canonical JSON strings):

```rust
did_from_seed(seed: Vec<u8>) -> String
public_key_for_did(did: String) -> Vec<u8>
canonical(json: String) -> String
change_hash_for(unsigned_json: String) -> String
sign_change_for(unsigned_json: String, seed: Vec<u8>) -> Vec<u8>
verify_change_for(unsigned_json: String, signature: Vec<u8>, public_key: Vec<u8>) -> bool
negotiate(ours: Vec<String>, theirs: Vec<String>) -> String
authorize(expression_json: String, roles: Vec<String>, is_authenticated: bool) -> bool
```

### Generating Swift / Kotlin / .NET bindings (next step)

The binding layer is ready to wrap; the codegen itself is **not committed here**
because the `uniffi` toolchain was unavailable in this (offline) build. To wire it:

1. Add `uniffi = "0.28"` and set `crate-type = ["lib", "staticlib", "cdylib"]`.
2. Annotate the `ffi.rs` functions with `#[uniffi::export]` and add
   `uniffi::setup_scaffolding!()`.
3. `cargo run --features=uniffi/cli --bin uniffi-bindgen generate --language swift …`
   (and `kotlin`); for .NET use `uniffi-bindgen-cs` or the C ABI.
4. Build an `XCFramework` from the `staticlib` and add it to `swift/XNetKit` as a
   binary target, then strangler-fig XNetKit's native kernel calls over to it
   (the conformance vectors keep both honest throughout).

Until then, the native Swift kernel in `swift/XNetKit` and this Rust core are
**independently conformance-verified against the same vectors**, so they already
agree on the wire.

## Layout

- [`src/lib.rs`](src/lib.rs) — the kernel (identity, canonical JSON, change
  hash/sign/verify, LWW, negotiate, authz).
- [`src/ffi.rs`](src/ffi.rs) — the FFI-friendly wrappers.
- [`tests/conformance.rs`](tests/conformance.rs) — the golden-vector suite.
