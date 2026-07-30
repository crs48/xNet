# Second‑language reference kernel

A tiny, dependency‑light implementation of the xNet **L0 + L1 interop kernel** in
a language other than the reference TypeScript — here, Python. Its only job is to
**prove the protocol boundary is real**: that the written
[spec](../../docs/specs/protocol/) plus the [golden vectors](../) are sufficient
to interoperate, without reading the TypeScript source.

## What it proves

Running [`python/verify_vectors.py`](python/verify_vectors.py) against the
TypeScript‑generated vectors confirms, in ~100 lines of Python, that an
independent implementation:

- derives the **same `did:key`** from a seed ([L0 §1](../../docs/specs/protocol/01-primitives.md));
- computes the **same `cid:blake3:` change hash** from the same canonical bytes
  ([L1 §6](../../docs/specs/protocol/02-data-model.md));
- **verifies** a change signed by TypeScript; and
- **re‑signs it byte‑for‑byte** (Ed25519 is deterministic, RFC 8032).

If Python and TypeScript agree on these bytes, any two conforming
implementations will too. That is the whole thesis of
[exploration 0200](../../docs/explorations/0200_%5B_%5D_PORTABLE_XNET_PROTOCOL_BOUNDARIES_AND_STANDARD.md):
the CRDT/Yjs layer is opaque, so the kernel — not Yjs — is what must be portable.

## Run it

```bash
pip install pynacl blake3 base58
python python/verify_vectors.py
```

Expected output ends with `18 passed, 0 failed`.

## Files

- [`python/xnet_kernel.py`](python/xnet_kernel.py) — the kernel: did:key,
  canonicalization, hashing, signing, verification.
- [`python/verify_vectors.py`](python/verify_vectors.py) — loads the corpus and
  checks the kernel against it.

This kernel is **not run in CI** (no Python job); it is reference material kept in
sync by hand. The authoritative drift guard is the TypeScript
[`conformance.test.ts`](../../packages/runtime/src/conformance.test.ts).
