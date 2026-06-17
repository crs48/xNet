# @xnetjs/licenses

Ed25519-signed, **DID-bound** plugin license tokens — the offline-verifiable
entitlement spine for the paid plugin marketplace ([exploration
0196](../../docs/explorations/0196_[_]_PAID_PLUGIN_MARKETPLACE_MONETIZATION_AND_LICENSING.md)).

A paid plugin is unlocked by a compact token bound to the **buyer's DID** (not a
device). The hub holds the platform **private** key and mints a token on
purchase; the plugin runtime embeds the **public** key and verifies it **fully
offline**. Asymmetric on purpose — the verifying client must not hold a secret
it could use to forge a license (that is why this is not the HMAC
`@xnetjs/entitlements` shape).

```ts
import {
  generateLicenseKeypair,
  mintPluginLicense,
  checkLicenseFor,
  publicKeyFromHex,
  privateKeyFromHex
} from '@xnetjs/licenses'

// Once, on the platform — store privateKeyHex as a hub secret, ship publicKeyHex.
const { publicKeyHex, privateKeyHex } = generateLicenseKeypair()

// Hub, on a successful Stripe webhook:
const token = mintPluginLicense(
  { pluginId: 'com.acme.kanban', buyerDid, mode: 'one-time', now: Date.now() },
  privateKeyFromHex(privateKeyHex)
)

// Client, at install/activate time (offline):
const decision = checkLicenseFor(token, {
  pluginId: 'com.acme.kanban',
  buyerDid,
  publicKey: publicKeyFromHex(publicKeyHex),
  now: Date.now()
})
if (!decision.ok) {
  // surface "Buy" / "Restore purchase" depending on decision.reason
}
```

Token format: `base64url(JSON claims) + "." + base64url(Ed25519 signature)`.
One dependency: `@xnetjs/crypto`.
