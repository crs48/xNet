import { describe, expect, it } from 'vitest'
import { cloudRunProvisionerFromEnv } from './provisioner/google-cloud-run-client'
import { firestoreStoresFromEnv } from './stores/firestore'
import { resolveBillingGateway, stripeGatewayFromEnv } from './index'

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv

const GCP_R2 = env({
  GCP_PROJECT_PREFIX: 'xnet-cloud',
  GCP_REGION: 'us-central1',
  GCP_ARTIFACT_REGISTRY: 'us-docker.pkg.dev/xnet-cloud-0/hub',
  R2_BUCKET: 'b',
  R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's'
})

describe('env-driven wiring', () => {
  it('selects the Stripe gateway only when fully configured', () => {
    expect(resolveBillingGateway(env({})).id).toBe('fake')
    expect(stripeGatewayFromEnv(env({}))).toBeNull()
    expect(stripeGatewayFromEnv(env({ STRIPE_SECRET_KEY: 'sk_test_x' }))).toBeNull() // needs webhook secret too
    expect(
      resolveBillingGateway(
        env({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })
      ).id
    ).toBe('stripe')
  })

  it('selects the Cloud Run provisioner only when GCP + R2 are configured', () => {
    expect(cloudRunProvisionerFromEnv(env({}))).toBeNull()
    expect(cloudRunProvisionerFromEnv(env({ GCP_PROJECT_PREFIX: 'xnet-cloud' }))).toBeNull() // partial
    expect(cloudRunProvisionerFromEnv(GCP_R2)?.substrate).toBe('cloud-run-litestream')
  })

  it('selects Firestore stores only when configured', () => {
    expect(firestoreStoresFromEnv(env({}))).toBeNull()
    const stores = firestoreStoresFromEnv(
      env({ GCP_PROJECT_PREFIX: 'xnet-cloud', GCP_FIRESTORE_DATABASE: '(default)' })
    )
    expect(stores?.tenants).toBeDefined()
    expect(stores?.bindings).toBeDefined()
  })
})
