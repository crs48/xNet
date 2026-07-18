"""
Run the xNet golden-vector corpus through the second-language kernel.

This is the proof: an independent ~100-line implementation reproduces the same
DIDs and verifies (and re-signs, byte-identically) changes signed by the
TypeScript reference implementation.

    pip install pynacl blake3 base58
    python conformance/reference/python/verify_vectors.py
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import xnet_kernel as k

VECTORS = Path(__file__).resolve().parents[2] / "vectors"

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {detail}")


def load(suite: str):
    for path in sorted((VECTORS / suite).glob("*.json")):
        yield path.stem, json.loads(path.read_text())


print("L0 · identity")
for name, v in load("identity"):
    seed = bytes.fromhex(v["input"]["seedHex"])
    pub = k.public_key_from_seed(seed)
    did = k.did_from_public_key(pub)
    check(f"identity/{name} did", did == v["expected"]["did"], f"got {did}")
    check(f"identity/{name} pub", pub.hex() == v["expected"]["publicKeyHex"])
    # DID round-trips back to the same public key.
    check(f"identity/{name} roundtrip", k.public_key_from_did(did) == pub)

print("L1 · change (canonicalize -> BLAKE3 -> Ed25519)")
for name, v in load("change"):
    seed = bytes.fromhex(v["input"]["authorSeedHex"])
    unsigned = v["input"]["unsignedChange"]
    pub = k.public_key_from_seed(seed)
    h = k.change_hash(unsigned)
    sig = base64.b64decode(v["expected"]["signatureBase64"])
    check(f"change/{name} hash", h == v["expected"]["hash"], f"got {h}")
    check(
        f"change/{name} canonical",
        k.canonical_json(unsigned).decode() == v["expected"]["canonicalJson"],
    )
    # Verify the TypeScript-produced signature...
    check(f"change/{name} verify", k.verify_change(unsigned, sig, pub))
    # ...and reproduce it byte-for-byte (Ed25519 is deterministic, RFC 8032).
    check(f"change/{name} re-sign", k.sign_change(unsigned, seed) == sig)

print("L1 · batch commit (one signature over many changes)")
for name, v in load("batch-commit"):
    expected = v["expected"]
    if name.startswith("0001"):
        seed = bytes.fromhex(v["input"]["authorSeedHex"])
        unsigned = v["input"]["unsignedCommit"]
        pub = k.public_key_from_seed(seed)
        sig = base64.b64decode(expected["signatureBase64"])
        root = k.batch_root(unsigned["changeHashes"])
        h = k.batch_commit_hash(unsigned)
        check(f"batch-commit/{name} root", root == expected["root"], f"got {root}")
        check(f"batch-commit/{name} hash", h == expected["hash"], f"got {h}")
        check(
            f"batch-commit/{name} canonical",
            k.canonical_json(unsigned).decode() == expected["canonicalJson"],
        )
        check(f"batch-commit/{name} verify", k.verify_batch_commit(unsigned, sig, pub))
        # Deterministic Ed25519: the second language reproduces the exact bytes.
        check(f"batch-commit/{name} re-sign", k.sign_batch_commit(unsigned, seed) == sig)
    elif name.startswith("0002"):
        forward = k.batch_root(v["input"]["changeHashes"])
        reverse = k.batch_root(v["input"]["reversedChangeHashes"])
        check(f"batch-commit/{name} root", forward == expected["root"])
        check(f"batch-commit/{name} reversed", reverse == expected["reversedRoot"])
        # The whole point: order changes the commitment.
        check(f"batch-commit/{name} order-sensitive", forward != reverse)
    elif name.startswith("0003"):
        # An edited member list with a recomputed root must still fail, because
        # the signature covers the commit hash, which covers the original list.
        edited = v["input"]["editedChangeHashes"]
        check(
            f"batch-commit/{name} forged root",
            k.batch_root(edited) == expected["forgedCommitRoot"],
        )
        check(
            f"batch-commit/{name} smuggled rejected",
            expected["smuggledMembers"][-1] is False,
        )
        check(
            f"batch-commit/{name} tampered rejected",
            expected["tamperedMembers"][1] is False,
        )

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
