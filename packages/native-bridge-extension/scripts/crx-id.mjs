/**
 * Compute a Chromium extension ID from its packed public key (0289, Option C).
 *
 * Chrome derives an extension's ID deterministically from the `key` field in
 * `manifest.json` (the base64 DER-encoded SubjectPublicKeyInfo). The ID is the
 * first 128 bits of `sha256(DER)`, hex-encoded, with each nibble `0–9a–f`
 * remapped to `a–p` ("mpdecimal"). Because it's derived from the key rather than
 * the install path, baking a fixed `key` into the manifest gives the *same* ID on
 * every machine — which is what lets the native-messaging host manifest pin
 * `allowed_origins: ["chrome-extension://<ID>/"]` and have the OS enforce that
 * only THIS extension may launch the host.
 */

import { createHash } from 'node:crypto'

/** @param {string} base64Spki  The manifest `key` value (base64 DER SPKI). */
export function crxIdFromKey(base64Spki) {
  const der = Buffer.from(base64Spki, 'base64')
  const digest = createHash('sha256').update(der).digest('hex').slice(0, 32)
  let id = ''
  for (const ch of digest) {
    id += String.fromCharCode('a'.charCodeAt(0) + parseInt(ch, 16))
  }
  return id
}

/** `chrome-extension://<id>/` — the exact string a native-host manifest allowlists. */
export function crxOriginFromKey(base64Spki) {
  return `chrome-extension://${crxIdFromKey(base64Spki)}/`
}
