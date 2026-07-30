//! Portable Rust implementation of the xNet interop kernel.
//!
//! This is the byte-exact core of the xNet protocol (docs/specs/protocol/):
//! `did:key` identity, the canonical-JSON change hash, Ed25519 sign/verify,
//! per-property LWW convergence, and the pure L2/L3 decision functions. It
//! reproduces the conformance golden vectors in `conformance/vectors/` exactly,
//! and — because `ed25519-dalek` is deterministic (RFC 8032) — it also re-signs
//! changes byte-for-byte (which the Swift/CryptoKit kernel cannot).
//!
//! The intent is a single portable core that backs the Swift, Kotlin, and .NET
//! SDKs via UniFFI (see `uniffi.rs` and the crate README).

use std::collections::HashSet;

pub mod ffi;

use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::{EdwardsPoint, Scalar};
use sha2::{Digest, Sha512};
use serde_json::{Map, Value};

/// Ed25519 public-key multicodec prefix (varint 0xed 0x01).
const ED25519_MULTICODEC: [u8; 2] = [0xed, 0x01];

// ─────────────────────── Ed25519 (RFC 8032, deterministic) ──────────────────

fn sha512(parts: &[&[u8]]) -> [u8; 64] {
    let mut h = Sha512::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

/// The clamped secret scalar from the SHA-512 of the seed (RFC 8032 §5.1.5).
fn secret_scalar(seed: &[u8; 32]) -> (Scalar, [u8; 32]) {
    let h = sha512(&[seed]);
    let mut lower = [0u8; 32];
    lower.copy_from_slice(&h[0..32]);
    lower[0] &= 248;
    lower[31] &= 127;
    lower[31] |= 64;
    let mut prefix = [0u8; 32];
    prefix.copy_from_slice(&h[32..64]);
    // [a]B == [a mod L]B, so reducing the clamped scalar is sound here.
    (Scalar::from_bytes_mod_order(lower), prefix)
}

// ───────────────────────────── L0 · identity ────────────────────────────────

/// Derive the 32-byte Ed25519 public key from a 32-byte seed.
pub fn public_key_from_seed(seed: &[u8; 32]) -> [u8; 32] {
    let (a, _) = secret_scalar(seed);
    EdwardsPoint::mul_base(&a).compress().to_bytes()
}

/// Ed25519 signature over `msg` (deterministic per RFC 8032 — re-signs identically).
pub fn sign(seed: &[u8; 32], msg: &[u8]) -> [u8; 64] {
    let (a, prefix) = secret_scalar(seed);
    let a_pub = EdwardsPoint::mul_base(&a).compress().to_bytes();
    let r = Scalar::from_bytes_mod_order_wide(&sha512(&[&prefix, msg]));
    let r_pub = EdwardsPoint::mul_base(&r).compress().to_bytes();
    let k = Scalar::from_bytes_mod_order_wide(&sha512(&[&r_pub, &a_pub, msg]));
    let s = r + k * a;
    let mut sig = [0u8; 64];
    sig[0..32].copy_from_slice(&r_pub);
    sig[32..64].copy_from_slice(s.as_bytes());
    sig
}

/// Verify an Ed25519 signature: `[S]B == R + [k]A` (cofactorless, matching
/// `ed25519-dalek::verify`, not `verify_strict`). Rejects non-canonical `S`
/// (malleability) via `from_canonical_bytes` and non-canonical point encodings
/// via `decompress`.
pub fn verify(public_key: &[u8], msg: &[u8], signature: &[u8]) -> bool {
    let pk: [u8; 32] = match public_key.try_into() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let sig: [u8; 64] = match signature.try_into() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let a = match CompressedEdwardsY(pk).decompress() {
        Some(p) => p,
        None => return false,
    };
    let mut r_bytes = [0u8; 32];
    r_bytes.copy_from_slice(&sig[0..32]);
    let mut s_bytes = [0u8; 32];
    s_bytes.copy_from_slice(&sig[32..64]);
    let s = match Option::<Scalar>::from(Scalar::from_canonical_bytes(s_bytes)) {
        Some(s) => s,
        None => return false,
    };
    let r_point = match CompressedEdwardsY(r_bytes).decompress() {
        Some(p) => p,
        None => return false,
    };
    let k = Scalar::from_bytes_mod_order_wide(&sha512(&[&r_bytes, &pk, msg]));
    EdwardsPoint::mul_base(&s) - a * k == r_point
}

// ─────────────────────────────── base58btc ──────────────────────────────────

const BASE58_ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

fn base58_encode(bytes: &[u8]) -> String {
    let zeros = bytes.iter().take_while(|&&b| b == 0).count();
    let mut input = bytes.to_vec();
    let mut digits: Vec<u8> = Vec::new();
    let mut start = zeros;
    while start < input.len() {
        let mut rem: u32 = 0;
        for byte in input.iter_mut().skip(start) {
            let acc = rem * 256 + *byte as u32;
            *byte = (acc / 58) as u8;
            rem = acc % 58;
        }
        digits.push(rem as u8);
        if input[start] == 0 {
            start += 1;
        }
    }
    let mut out = String::new();
    for _ in 0..zeros {
        out.push('1');
    }
    for d in digits.iter().rev() {
        out.push(BASE58_ALPHABET[*d as usize] as char);
    }
    out
}

fn base58_decode(s: &str) -> Option<Vec<u8>> {
    let zeros = s.chars().take_while(|&c| c == '1').count();
    let mut input: Vec<i32> = Vec::with_capacity(s.len());
    for c in s.chars() {
        let pos = BASE58_ALPHABET.iter().position(|&x| x as char == c)?;
        input.push(pos as i32);
    }
    let mut bytes: Vec<u8> = Vec::new();
    let mut start = zeros;
    while start < input.len() {
        let mut rem: i32 = 0;
        for v in input.iter_mut().skip(start) {
            let acc = rem * 58 + *v;
            *v = acc / 256;
            rem = acc % 256;
        }
        bytes.push(rem as u8);
        if input[start] == 0 {
            start += 1;
        }
    }
    let mut out = vec![0u8; zeros];
    out.extend(bytes.iter().rev().skip_while(|&&b| b == 0));
    Some(out)
}

/// `did:key` = `"did:key:z" + base58btc(0xed01 || public_key)`.
pub fn did_from_public_key(public_key: &[u8]) -> String {
    let mut prefixed = ED25519_MULTICODEC.to_vec();
    prefixed.extend_from_slice(public_key);
    format!("did:key:z{}", base58_encode(&prefixed))
}

/// Inverse of [`did_from_public_key`]; `None` for a non-Ed25519 `did:key`.
pub fn public_key_from_did(did: &str) -> Option<Vec<u8>> {
    let rest = did.strip_prefix("did:key:z")?;
    let decoded = base58_decode(rest)?;
    if decoded.len() != 34 || decoded[0..2] != ED25519_MULTICODEC {
        return None;
    }
    Some(decoded[2..].to_vec())
}

// ─────────────────────────── L1 · canonical JSON ────────────────────────────

/// Canonical JSON per [L1 §6]: object keys sorted by **UTF-16 code unit** (JS
/// `Array.prototype.sort` / `String <`), no insignificant whitespace, arrays in
/// order, integers without a decimal point, UTF-8 output.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => encode_json_string(s),
        Value::Array(items) => {
            let body: Vec<String> = items.iter().map(canonical_json).collect();
            format!("[{}]", body.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let body: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", encode_json_string(k), canonical_json(&map[*k])))
                .collect();
            format!("{{{}}}", body.join(","))
        }
    }
}

/// JSON string encoding matching JS `JSON.stringify` (escape `"`, `\\`, control
/// chars; pass non-ASCII through as UTF-8 — no `\u` escapes).
fn encode_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// ─────────────────────── L1 · change hash / sign / verify ───────────────────

/// `"cid:blake3:" + hex(BLAKE3(canonical(unsigned)))`. `protocolVersion` is
/// dropped before hashing when it is `0`/absent (legacy), kept for `xnet/1.0`.
pub fn change_hash(unsigned: &Value) -> String {
    let mut v = unsigned.clone();
    if let Value::Object(map) = &mut v {
        let drop = match map.get("protocolVersion") {
            None => true,
            Some(pv) => pv.as_i64() == Some(0),
        };
        if drop {
            map.remove("protocolVersion");
        }
    }
    let digest = blake3::hash(canonical_json(&v).as_bytes());
    format!("cid:blake3:{}", digest.to_hex())
}

/// Ed25519 signature over the UTF-8 bytes of the hash *string* (deterministic).
pub fn sign_change(unsigned: &Value, seed: &[u8; 32]) -> Vec<u8> {
    sign(seed, change_hash(unsigned).as_bytes()).to_vec()
}

/// Verify a change's Ed25519 signature against an author public key.
pub fn verify_change(unsigned: &Value, signature: &[u8], public_key: &[u8]) -> bool {
    verify(public_key, change_hash(unsigned).as_bytes(), signature)
}

// ────────────────────────── L1 · LWW convergence ────────────────────────────

/// Protocol version at which the grinding-resistant tiebreak key activates.
///
/// Mirrors `LWW_TIEBREAK_KEY_VERSION` in `packages/core/src/lww.ts`. Drift
/// between the two is caught by
/// `packages/sync/src/protocol-version-parity.test.ts` — update both together.
const LWW_TIEBREAK_KEY_VERSION: i64 = 4;

/// Grinding-resistant LWW final tiebreak key (exploration 0305 / spec §7.1):
/// `blake3_hex( authorDID ‖ 0x1f ‖ propertyKey ‖ 0x1f ‖ canonicalJSON(value) )`.
/// A deletion (`value` = `null`) canonicalises as `null`. Portable — mirrors
/// `computeLwwTiebreakKey` in `@xnetjs/core`.
fn lww_tiebreak_key(author: &str, property: &str, value: &Value) -> String {
    let canonical = canonical_json(value);
    let input = format!("{author}\u{1f}{property}\u{1f}{canonical}");
    blake3::hash(input.as_bytes()).to_hex().to_string()
}

struct LwwTs {
    lamport: i64,
    wall_time: i64,
    author: String,
    /// Present only for protocol v4+ writes (grinding-resistant tiebreak).
    tiebreak_key: Option<String>,
}

impl LwwTs {
    /// `self` wins over `other`: higher lamport, then wallTime, then — for v4+
    /// changes carrying a key — the larger tiebreak key, else the authorDID.
    /// All string comparisons are by Unicode code point (`>`), matching the
    /// spec (§7) and the golden vectors — a deterministic order (never locale
    /// collation).
    fn wins(&self, other: &LwwTs) -> bool {
        if self.lamport != other.lamport {
            return self.lamport > other.lamport;
        }
        if self.wall_time != other.wall_time {
            return self.wall_time > other.wall_time;
        }
        if let (Some(a), Some(b)) = (&self.tiebreak_key, &other.tiebreak_key) {
            if a != b {
                return a > b;
            }
        }
        self.author > other.author
    }
}

/// Fold change contributions (each `{ authorDID, lamport, wallTime, properties,
/// protocolVersion? }`) into converged `(properties, timestamps)`.
/// Order-independent.
pub fn lww_fold(changes: &[Value]) -> (Map<String, Value>, Map<String, Value>) {
    let mut properties: Map<String, Value> = Map::new();
    let mut tss: std::collections::HashMap<String, LwwTs> = std::collections::HashMap::new();
    for c in changes {
        let lamport = c["lamport"].as_i64().unwrap_or(0);
        let wall_time = c["wallTime"].as_i64().unwrap_or(0);
        let author = c["authorDID"].as_str().unwrap_or("").to_string();
        let has_key = c["protocolVersion"].as_i64().unwrap_or(0) >= LWW_TIEBREAK_KEY_VERSION;
        if let Some(props) = c["properties"].as_object() {
            for (key, val) in props {
                let ts = LwwTs {
                    lamport,
                    wall_time,
                    author: author.clone(),
                    tiebreak_key: if has_key {
                        Some(lww_tiebreak_key(&author, key, val))
                    } else {
                        None
                    },
                };
                let replace = match tss.get(key) {
                    None => true,
                    Some(cur) => ts.wins(cur),
                };
                if replace {
                    properties.insert(key.clone(), val.clone());
                    tss.insert(key.clone(), ts);
                }
            }
        }
    }
    let mut timestamps: Map<String, Value> = Map::new();
    for (key, ts) in &tss {
        let mut obj = serde_json::Map::new();
        obj.insert("lamport".into(), serde_json::json!(ts.lamport));
        obj.insert("wallTime".into(), serde_json::json!(ts.wall_time));
        obj.insert("author".into(), serde_json::json!(ts.author));
        if let Some(k) = &ts.tiebreak_key {
            obj.insert("tiebreakKey".into(), serde_json::json!(k));
        }
        timestamps.insert(key.clone(), Value::Object(obj));
    }
    (properties, timestamps)
}

// ─────────────────── L2 · version negotiation (handshake) ───────────────────

/// Newest umbrella version shared by both peers (the first of `ours` present in
/// `theirs`), or `None` when their advertised sets do not intersect.
pub fn negotiate_protocol_version(ours: &[String], theirs: &[String]) -> Option<String> {
    let offered: HashSet<&String> = theirs.iter().collect();
    ours.iter().find(|v| offered.contains(*v)).cloned()
}

// ─────────────────── L3 · authorization expression eval ─────────────────────

/// Evaluate an authorization expression AST against the subject's held roles
/// (docs/specs/protocol §L3.4). Mirrors `evaluateExpression` in the reference:
/// `deny(r)` is a role-membership predicate; deny-wins is composed via
/// `and(allow(..), not(deny(..)))`.
pub fn eval_auth_expr(expr: &Value, roles: &HashSet<String>, is_authenticated: bool) -> bool {
    match expr["_tag"].as_str() {
        Some("allow") | Some("deny") => expr["roles"]
            .as_array()
            .map(|rs| rs.iter().any(|r| r.as_str().map_or(false, |s| roles.contains(s))))
            .unwrap_or(false),
        Some("and") => expr["exprs"]
            .as_array()
            .map(|es| es.iter().all(|e| eval_auth_expr(e, roles, is_authenticated)))
            .unwrap_or(true),
        Some("or") => expr["exprs"]
            .as_array()
            .map(|es| es.iter().any(|e| eval_auth_expr(e, roles, is_authenticated)))
            .unwrap_or(false),
        Some("not") => !eval_auth_expr(&expr["expr"], roles, is_authenticated),
        Some("roleRef") => expr["role"].as_str().map_or(false, |s| roles.contains(s)),
        Some("public") => true,
        Some("authenticated") => is_authenticated,
        _ => false,
    }
}

/// Expression lookup order for a checked action (docs/specs/protocol §L3.1,
/// exploration 0304): `create` falls back to `write`; `update` and legacy
/// `write` checks share the `update` ?? `write` lookup; every other action
/// resolves only its own name. Mirrors `actionExpressionOrder` in the
/// TypeScript reference (`@xnetjs/core`).
pub fn action_expression_order(action: &str) -> Vec<&str> {
    match action {
        "create" => vec!["create", "write"],
        "update" | "write" => vec!["update", "write"],
        other => vec![other],
    }
}

/// Evaluate a checked action against a schema's `actions` map with the 0304
/// write fallback. A missing expression (after fallback) denies.
pub fn eval_auth_action(
    actions: &Value,
    action: &str,
    roles: &HashSet<String>,
    is_authenticated: bool,
) -> bool {
    for candidate in action_expression_order(action) {
        let expr = &actions[candidate];
        if !expr.is_null() {
            return eval_auth_expr(expr, roles, is_authenticated);
        }
    }
    false
}
