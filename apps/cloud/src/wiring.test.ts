import { describe, expect, it } from 'vitest'
import { pricingFromEnv } from './ai/pricing'
import { aiChatDepsFromEnv, aiKeysFromEnv } from './ai/wiring'
import { cloudRunProvisionerFromEnv } from './provisioner/google-cloud-run-client'
import { firestoreStoresFromEnv } from './stores/firestore'
import { usageLedgerFromEnv } from './stores/usage-ledger'
import { buildControlPlane, resolveBillingGateway, stripeGatewayFromEnv } from './index'

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

  it('mounts managed AI only when LITELLM_BASE_URL is set', () => {
    const { controlPlane } = buildControlPlane({ env: env({}) })
    const ledger = usageLedgerFromEnv(env({}))
    expect(aiChatDepsFromEnv(controlPlane, ledger, env({}))).toBeNull()
    const deps = aiChatDepsFromEnv(controlPlane, ledger, env({ LITELLM_BASE_URL: 'http://litellm:4000' }))
    expect(deps?.gateway).toBeDefined()
    expect(deps?.pricingFor('claude-sonnet-4-6').markup).toBe(1.25)
  })

  it('selects the LiteLLM key manager only when base URL + master key are set', () => {
    expect(aiKeysFromEnv(env({}))).toBeUndefined()
    expect(aiKeysFromEnv(env({ LITELLM_BASE_URL: 'http://litellm:4000' }))).toBeUndefined() // needs master key
    expect(
      aiKeysFromEnv(env({ LITELLM_BASE_URL: 'http://litellm:4000', LITELLM_MASTER_KEY: 'sk-master' }))
    ).toBeDefined()
  })

  it('prices known models from the table and unknown models from the default, with the env markup', () => {
    const priceDefault = pricingFromEnv(env({}))
    expect(priceDefault('claude-sonnet-4-6')).toMatchObject({
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
      markup: 1.25
    })
    expect(priceDefault('some-unknown-model').inputUsdPerMillion).toBe(3) // DEFAULT_RATE
    expect(pricingFromEnv(env({ AI_MARKUP: '1.4' }))('gpt-4o').markup).toBe(1.4)
    expect(pricingFromEnv(env({ AI_MARKUP: '0.5' }))('gpt-4o').markup).toBe(1.25) // clamped >= 1
  })
})
