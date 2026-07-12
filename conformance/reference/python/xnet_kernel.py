"""
A minimal, second-language implementation of the XNet L0 + L1 interop kernel.

This file exists to prove the protocol boundary is real: that the written spec
in docs/specs/protocol/ — not the TypeScript source — is sufficient to derive
the same DIDs and verify (and reproduce) TypeScript-signed changes.

It deliberately uses only small, standard primitives:
  - PyNaCl   (Ed25519 signing/verification)   pip install pynacl
  - blake3   (BLAKE3 hashing)                  pip install blake3
  - base58   (base58btc for did:key)           pip install base58

Spec references are noted inline as [L0 §n] / [L1 §n].
"""

from __future__ import annotations

import json

import base58
from blake3 import blake3
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError

# Multicodec prefix for an Ed25519 public key (varint 0xed 0x01). [L0 §1]
ED25519_MULTICODEC = b"\xed\x01"


def did_from_public_key(public_key: bytes) -> str:
    """did:key = 'did:key:z' + base58btc(0xed01 || ed25519_public_key). [L0 §1]"""
    return "did:key:z" + base58.b58encode(ED25519_MULTICODEC + public_key).decode()


def public_key_from_did(did: str) -> bytes:
    """Inverse of did_from_public_key; raises on a non-Ed25519 did:key. [L0 §1]"""
    assert did.startswith("did:key:z"), f"not a did:key: {did}"
    decoded = base58.b58decode(did[len("did:key:z") :])
    assert decoded[:2] == ED25519_MULTICODEC, "unsupported multicodec (only Ed25519)"
    return decoded[2:]


def public_key_from_seed(seed: bytes) -> bytes:
    """Derive the 32-byte Ed25519 public key from a 32-byte seed."""
    return bytes(SigningKey(seed).verify_key)


def canonical_json(value) -> bytes:
    """
    Canonical JSON per [L1 §6]: keys sorted recursively, no insignificant
    whitespace, arrays in order, UTF-8 bytes. `json.dumps(sort_keys=True)`
    sorts recursively; `separators` removes whitespace; `ensure_ascii=False`
    keeps the UTF-8 bytes JS's JSON.stringify emits.
    """
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def change_hash(unsigned_change: dict) -> str:
    """
    The content id of an unsigned change: 'cid:blake3:' + hex(BLAKE3(canonical)).
    Legacy changes (protocolVersion 0/undefined) drop the field before hashing;
    versioned changes (protocolVersion >= 1; current is 4) keep it. [L1 §6]
    """
    to_hash = dict(unsigned_change)
    if to_hash.get("protocolVersion", 0) in (0, None):
        to_hash.pop("protocolVersion", None)
    return "cid:blake3:" + blake3(canonical_json(to_hash)).hexdigest()


def sign_change(unsigned_change: dict, seed: bytes) -> bytes:
    """Ed25519 signature over the UTF-8 bytes of the hash STRING. [L1 §6, L0 §2]"""
    h = change_hash(unsigned_change)
    return SigningKey(seed).sign(h.encode("utf-8")).signature


def verify_change(unsigned_change: dict, signature: bytes, public_key: bytes) -> bool:
    """Verify a change's Ed25519 signature against an author public key. [L1 §6]"""
    h = change_hash(unsigned_change)
    try:
        VerifyKey(public_key).verify(h.encode("utf-8"), signature)
        return True
    except BadSignatureError:
        return False
