/**
 * @xnetjs/plugins — supply-chain provenance verification (exploration 0192).
 *
 * The 2025–26 marketplace-malware wave (GlassWorm, OctoRAT, typosquats) taught
 * the field one thing: "Verified Publisher" badges verify domain ownership, not
 * code safety. The answer the JS ecosystem converged on is Sigstore-style
 * **provenance** — a keyless attestation that a package was built from a known
 * source by a known builder, logged in a transparency ledger (Rekor).
 *
 * This module defines the verification *contract* and a **fail-closed** default.
 * The actual Sigstore bundle verification (cosign/rekor) is a pluggable
 * `ProvenanceVerifier` — wired in where the crypto deps are acceptable
 * (publishing CI / desktop). The substrate is safe by default: with no verifier,
 * everything is reported `unverified`, and the install UI decides what to do
 * with that (warn / block) — it never silently treats unsigned code as trusted.
 */

/** A provenance attestation attached to a marketplace package. */
export interface Provenance {
  /** The Sigstore bundle (or a URL to it). */
  sigstoreBundle?: string
  /** Rekor transparency-log index, if logged. */
  rekorLogIndex?: number
  /** DID/identity of the builder (CI workflow identity). */
  builderDID?: string
  /** Source repository the artifact was built from. */
  sourceRepo?: string
  /** Source commit SHA. */
  sourceCommit?: string
  /** SHA-256 digest of the manifest/artifact being attested. */
  artifactDigest?: string
}

/** The outcome of verifying provenance for an artifact. */
export interface ProvenanceResult {
  /** True only when a verifier cryptographically confirmed the attestation. */
  verified: boolean
  /** Why verification failed or what could not be confirmed. */
  reason?: string
  /** Source repo, when confirmed. */
  sourceRepo?: string
  /** Builder identity, when confirmed. */
  builderDID?: string
}

/** The input to a verification: the attestation plus the artifact it covers. */
export interface VerifyProvenanceInput {
  provenance?: Provenance
  /** SHA-256 digest computed locally over the fetched manifest/artifact. */
  artifactDigest: string
}

/** A pluggable verifier (cosign/rekor under the hood). */
export interface ProvenanceVerifier {
  verify(input: VerifyProvenanceInput): Promise<ProvenanceResult>
}

/**
 * The default verifier: **fails closed**. Absent a real cryptographic verifier,
 * nothing is "verified" — unsigned/unattested packages are reported as such so
 * the UI surfaces an explicit "unverified build" state rather than a false green.
 */
export const failClosedVerifier: ProvenanceVerifier = {
  async verify(input) {
    if (!input.provenance) {
      return { verified: false, reason: 'No provenance attestation present' }
    }
    return {
      verified: false,
      reason: 'No provenance verifier configured (install is treated as unverified)'
    }
  }
}

/**
 * Verify provenance, defaulting to the fail-closed verifier. A convenience
 * wrapper so callers always get a `ProvenanceResult` (never an exception) and
 * unverified is the safe default.
 */
export async function verifyProvenance(
  input: VerifyProvenanceInput,
  verifier: ProvenanceVerifier = failClosedVerifier
): Promise<ProvenanceResult> {
  try {
    return await verifier.verify(input)
  } catch (err) {
    return { verified: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** A one-line human summary of a provenance result, for the consent dialog. */
export function summarizeProvenance(result: ProvenanceResult): string {
  if (result.verified) {
    const from = result.sourceRepo ? ` from ${result.sourceRepo}` : ''
    return `Verified build${from}`
  }
  return `Unverified${result.reason ? `: ${result.reason}` : ''}`
}
