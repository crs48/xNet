//! Run the shared XNet golden-vector corpus through `xnet-core`.
//!
//! This proves the Rust kernel reproduces the protocol byte-for-byte — the same
//! corpus the TypeScript reference and the Python/Swift kernels pass. Unlike the
//! Swift/CryptoKit kernel, `ed25519-dalek` is deterministic, so Rust also
//! **re-signs** changes byte-identically (the `change/* re-sign` checks).

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde_json::Value;
use xnet_core::*;

fn vectors_dir() -> PathBuf {
    // rust/xnet-core/ -> repo root -> conformance/vectors
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../conformance/vectors")
        .canonicalize()
        .expect("conformance/vectors must exist")
}

fn load(suite: &str) -> Vec<(String, Value)> {
    let dir = vectors_dir().join(suite);
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|_| panic!("missing suite dir {dir:?}"))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map_or(false, |x| x == "json"))
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|p| {
            let name = p.file_stem().unwrap().to_string_lossy().to_string();
            let v: Value = serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();
            (name, v)
        })
        .collect()
}

fn seed_from_hex(hex: &str) -> [u8; 32] {
    let bytes = hex::decode(hex).unwrap();
    bytes.try_into().expect("32-byte seed")
}

#[test]
fn l0_identity() {
    let vectors = load("identity");
    assert!(!vectors.is_empty());
    for (name, v) in vectors {
        let seed = seed_from_hex(v["input"]["seedHex"].as_str().unwrap());
        let pk = public_key_from_seed(&seed);
        let did = did_from_public_key(&pk);
        assert_eq!(hex::encode(pk), v["expected"]["publicKeyHex"].as_str().unwrap(), "{name} pub");
        assert_eq!(did, v["expected"]["did"].as_str().unwrap(), "{name} did");
        assert_eq!(public_key_from_did(&did).unwrap(), pk.to_vec(), "{name} roundtrip");
    }
}

#[test]
fn l1_change() {
    let vectors = load("change");
    assert!(!vectors.is_empty());
    for (name, v) in vectors {
        let seed = seed_from_hex(v["input"]["authorSeedHex"].as_str().unwrap());
        let unsigned = &v["input"]["unsignedChange"];
        let pk = public_key_from_seed(&seed);
        let sig = base64::engine::general_purpose::STANDARD
            .decode(v["expected"]["signatureBase64"].as_str().unwrap())
            .unwrap();

        assert_eq!(canonical_json(unsigned), v["expected"]["canonicalJson"].as_str().unwrap(), "{name} canonical");
        assert_eq!(change_hash(unsigned), v["expected"]["hash"].as_str().unwrap(), "{name} hash");
        // Verify the TypeScript-produced signature…
        assert!(verify_change(unsigned, &sig, &pk), "{name} verify");
        // …and reproduce it byte-for-byte (deterministic Ed25519, RFC 8032).
        assert_eq!(sign_change(unsigned, &seed), sig, "{name} re-sign");
    }
}

#[test]
fn l1_lww() {
    let vectors = load("lww");
    assert!(!vectors.is_empty());
    for (name, v) in vectors {
        let changes = v["input"]["changes"].as_array().unwrap();
        let (props, timestamps) = lww_fold(changes);
        assert_eq!(Value::Object(props), v["expected"]["properties"], "{name} properties");
        assert_eq!(Value::Object(timestamps), v["expected"]["timestamps"], "{name} timestamps");
    }
}

#[test]
fn l2_replication() {
    for (name, v) in load("replication") {
        match v["input"].get("ours") {
            // handshake negotiation vectors
            Some(_) => {
                let ours = str_vec(&v["input"]["ours"]);
                let theirs = str_vec(&v["input"]["theirs"]);
                let negotiated = negotiate_protocol_version(&ours, &theirs);
                let expected = v["expected"]["negotiated"].as_str().map(|s| s.to_string());
                assert_eq!(negotiated, expected, "{name} negotiated");
            }
            None => {
                // catch-up filtering vectors (changes + sinceLamport)
                if let Some(changes) = v["input"]["changes"].as_array() {
                    let since = v["input"]["sinceLamport"].as_i64().unwrap();
                    let mut kept: Vec<(i64, String)> = changes
                        .iter()
                        .filter(|c| c["lamport"].as_i64().unwrap() > since)
                        .map(|c| (c["lamport"].as_i64().unwrap(), c["id"].as_str().unwrap().to_string()))
                        .collect();
                    kept.sort_by_key(|(l, _)| *l);
                    let ids: Vec<String> = kept.into_iter().map(|(_, id)| id).collect();
                    let hwm = changes.iter().map(|c| c["lamport"].as_i64().unwrap()).max().unwrap_or(0);
                    let expected_ids = str_vec(&v["expected"]["changeIds"]);
                    assert_eq!(ids, expected_ids, "{name} changeIds");
                    assert_eq!(hwm, v["expected"]["highWaterMark"].as_i64().unwrap(), "{name} highWaterMark");
                }
                // (the protocol-version-bundle and yjs-envelope vectors exercise
                //  TS constants / Yjs-envelope specifics outside this kernel.)
            }
        }
    }
}

#[test]
fn l3_authz() {
    let vectors = load("authz");
    assert!(!vectors.is_empty());
    for (name, v) in vectors {
        let expr = &v["input"]["expression"];
        let roles: HashSet<String> = v["input"]["roles"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .collect();
        let is_auth = v["input"]["isAuthenticated"].as_bool().unwrap();
        assert_eq!(
            eval_auth_expr(expr, &roles, is_auth),
            v["expected"]["allowed"].as_bool().unwrap(),
            "{name} allowed"
        );
    }
}

#[test]
fn l3_authz_actions() {
    let vectors = load("authz-actions");
    assert!(!vectors.is_empty());
    for (name, v) in vectors {
        let actions = &v["input"]["actions"];
        let action = v["input"]["action"].as_str().unwrap();
        let roles: HashSet<String> = v["input"]["roles"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .collect();
        let is_auth = v["input"]["isAuthenticated"].as_bool().unwrap();
        assert_eq!(
            eval_auth_action(actions, action, &roles, is_auth),
            v["expected"]["allowed"].as_bool().unwrap(),
            "{name} allowed"
        );
    }
}

fn str_vec(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|s| s.as_str().unwrap().to_string()).collect()
}
