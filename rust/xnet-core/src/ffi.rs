//! FFI-friendly wrappers over the kernel — the surface a cross-language binding
//! exposes. Every signature uses only `String` / `Vec<u8>` / `bool`, which map
//! cleanly to UniFFI (Swift, Kotlin) and a C ABI (.NET). The pure kernel in
//! `lib.rs` uses `serde_json::Value` and fixed-size arrays; these adapt it to
//! the boundary, passing protocol JSON as a UTF-8 string (the same canonical
//! shape every language already produces).
//!
//! To generate bindings, add the `uniffi` dependency and annotate these with
//! `#[uniffi::export]` (see the crate README) — the toolchain was not available
//! in this offline build, so codegen is documented rather than committed.

use crate::{
    canonical_json, change_hash, did_from_public_key, eval_auth_expr,
    negotiate_protocol_version, public_key_from_did, public_key_from_seed, sign_change,
    verify_change,
};
use serde_json::Value;
use std::collections::HashSet;

fn as_seed(bytes: &[u8]) -> Option<[u8; 32]> {
    bytes.try_into().ok()
}

/// did:key for a 32-byte seed (empty string on a bad seed).
pub fn did_from_seed(seed: Vec<u8>) -> String {
    match as_seed(&seed) {
        Some(s) => did_from_public_key(&public_key_from_seed(&s)),
        None => String::new(),
    }
}

/// Recover the public key bytes from a did:key (empty on failure).
pub fn public_key_for_did(did: String) -> Vec<u8> {
    public_key_from_did(&did).unwrap_or_default()
}

/// Canonical JSON for an arbitrary JSON string.
pub fn canonical(json: String) -> String {
    serde_json::from_str::<Value>(&json).map(|v| canonical_json(&v)).unwrap_or_default()
}

/// `cid:blake3:` change hash for an unsigned-change JSON string.
pub fn change_hash_for(unsigned_json: String) -> String {
    serde_json::from_str::<Value>(&unsigned_json).map(|v| change_hash(&v)).unwrap_or_default()
}

/// Sign an unsigned-change JSON string with a 32-byte seed → 64-byte signature.
pub fn sign_change_for(unsigned_json: String, seed: Vec<u8>) -> Vec<u8> {
    match (serde_json::from_str::<Value>(&unsigned_json), as_seed(&seed)) {
        (Ok(v), Some(s)) => sign_change(&v, &s),
        _ => Vec::new(),
    }
}

/// Verify a change signature against an author public key.
pub fn verify_change_for(unsigned_json: String, signature: Vec<u8>, public_key: Vec<u8>) -> bool {
    serde_json::from_str::<Value>(&unsigned_json)
        .map(|v| verify_change(&v, &signature, &public_key))
        .unwrap_or(false)
}

/// Newest shared umbrella protocol version, or empty string if none.
pub fn negotiate(ours: Vec<String>, theirs: Vec<String>) -> String {
    negotiate_protocol_version(&ours, &theirs).unwrap_or_default()
}

/// Evaluate an authorization expression (JSON) against held roles.
pub fn authorize(expression_json: String, roles: Vec<String>, is_authenticated: bool) -> bool {
    match serde_json::from_str::<Value>(&expression_json) {
        Ok(expr) => {
            let set: HashSet<String> = roles.into_iter().collect();
            eval_auth_expr(&expr, &set, is_authenticated)
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_roundtrip() {
        // The aaaa… seed → the known did:key from the identity vectors.
        let seed = vec![0xaa; 32];
        let did = did_from_seed(seed.clone());
        assert_eq!(did, "did:key:z6Mkv1o2GEgtXjFdEMfLtupcKhGRydM8V7VHzii7Uh4aHoqH");
        assert_eq!(public_key_for_did(did.clone()), public_key_from_seed(&[0xaa; 32]).to_vec());

        let unsigned = r#"{"protocolVersion":3,"id":"c","type":"node-change","payload":{"nodeId":"n","schemaId":"xnet://xnet.fyi/Page@1.0.0","properties":{"title":"Hi"}},"parentHash":null,"authorDID":"did:key:z6Mkv1o2GEgtXjFdEMfLtupcKhGRydM8V7VHzii7Uh4aHoqH","wallTime":1,"lamport":1}"#;
        let sig = sign_change_for(unsigned.to_string(), seed);
        assert_eq!(sig.len(), 64);
        let pk = public_key_for_did(did);
        assert!(verify_change_for(unsigned.to_string(), sig, pk));

        assert_eq!(negotiate(vec!["xnet/1.0".into()], vec!["xnet/1.0".into()]), "xnet/1.0");
        assert!(authorize(r#"{"_tag":"public"}"#.to_string(), vec![], false));
    }
}
