/**
 * Algorithm size constants for cryptographic operations.
 *
 * These constants define the expected sizes for keys and signatures
 * across all supported algorithms.
 */

// ─── Ed25519 Sizes ───────────────────────────────────────────────

export const ED25519_PUBLIC_KEY_SIZE = 32
export const ED25519_PRIVATE_KEY_SIZE = 32
export const ED25519_SIGNATURE_SIZE = 64

// ─── ML-DSA-65 (Dilithium3) Sizes ────────────────────────────────
// Sizes from @noble/post-quantum v0.5.4

export const ML_DSA_65_PUBLIC_KEY_SIZE = 1952
export const ML_DSA_65_PRIVATE_KEY_SIZE = 4032
export const ML_DSA_65_SIGNATURE_SIZE = 3309

// ML-DSA signature size can vary slightly, allow some tolerance
export const ML_DSA_65_SIGNATURE_SIZE_MIN = 3200
export const ML_DSA_65_SIGNATURE_SIZE_MAX = 3400

// ─── ML-KEM-768 (Kyber768) Sizes ─────────────────────────────────

export const ML_KEM_768_PUBLIC_KEY_SIZE = 1184
export const ML_KEM_768_PRIVATE_KEY_SIZE = 2400
export const ML_KEM_768_CIPHERTEXT_SIZE = 1088
export const ML_KEM_768_SHARED_SECRET_SIZE = 32

// ─── X25519 Sizes ────────────────────────────────────────────────

export const X25519_PUBLIC_KEY_SIZE = 32
export const X25519_PRIVATE_KEY_SIZE = 32
export const X25519_SHARED_SECRET_SIZE = 32

// ─── Hybrid Signature Sizes ──────────────────────────────────────

/** Level 0: Ed25519 only (64 bytes) */
export const HYBRID_SIGNATURE_SIZE_LEVEL_0 = ED25519_SIGNATURE_SIZE

/** Level 1: Ed25519 + ML-DSA-65 (~3,373 bytes) */
export const HYBRID_SIGNATURE_SIZE_LEVEL_1 = ED25519_SIGNATURE_SIZE + ML_DSA_65_SIGNATURE_SIZE

/** Level 2: ML-DSA-65 only (~3,309 bytes) */
export const HYBRID_SIGNATURE_SIZE_LEVEL_2 = ML_DSA_65_SIGNATURE_SIZE

// ─── Hybrid Key Sizes ────────────────────────────────────────────

/** Hybrid public key: Ed25519 + ML-DSA-65 public keys */
export const HYBRID_PUBLIC_KEY_SIZE = ED25519_PUBLIC_KEY_SIZE + ML_DSA_65_PUBLIC_KEY_SIZE

/** Hybrid private key: Ed25519 + ML-DSA-65 private keys */
export const HYBRID_PRIVATE_KEY_SIZE = ED25519_PRIVATE_KEY_SIZE + ML_DSA_65_PRIVATE_KEY_SIZE
