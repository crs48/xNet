/**
 * First-party plugin catalog — the app-side install + configure surface for
 * every registry entry that ships code in this repo but does NOT auto-install
 * (`autoInstalled: false` in `registry/first-party.json`).
 *
 * The registry listing carries the display fields (name, version, description,
 * author); this catalog carries what the listing can't: the capability grant
 * the install consent gate shows (mirroring the real `defineConnector` /
 * `defineAction` / hub-feature declarations), and a declarative config spec the
 * generic settings form renders. `firstPartyManifest` merges the two into an
 * installable, pure-data `XNetExtension` — safe to persist and reload via
 * `PluginRegistry.loadFromStore`.
 *
 * Drift guard: `first-party-catalog.test.ts` asserts every non-auto-installed
 * registry entry has a catalog record and that every secret config field is
 * covered by the declared `capabilities.secrets`.
 */

import {
  CHANNEL_SCHEMA,
  CHAT_MESSAGE_SCHEMA,
  EXTERNAL_ITEM_SCHEMA,
  FEED_ITEM_SCHEMA,
  type ModuleCapabilities,
  type XNetExtension
} from '@xnetjs/plugins'
import type { MarketplaceListing } from '../components/marketplace-listing'

/** One field in a plugin's configuration form. */
export interface PluginConfigField {
  /** Storage key (secret fields use the exact broker env-key name). */
  key: string
  /** Field label shown in the form. */
  label: string
  /** `secret` renders as a password input; `text` as a plain input. */
  kind: 'secret' | 'text'
  /** Required before the plugin counts as configured. */
  required?: boolean
  placeholder?: string
  /** One-line hint under the field (where to get the value, format, …). */
  help?: string
}

/** App-side record for one first-party plugin: consent grant + config form. */
export interface FirstPartyPlugin {
  /** Capability grant shown at install (mirrors the real module definition). */
  capabilities: ModuleCapabilities
  /** Configuration fields; absent = nothing to configure. */
  config?: PluginConfigField[]
  /** One-line setup note shown above the config form. */
  configNote?: string
}

const GAME_EVENT_SCHEMA = 'xnet://xnet.fyi/GameEvent@1.0.0'

/**
 * Registry id → catalog record. Ids are the `fyi.xnet.*` ids used by
 * `registry/first-party.json` (which the site publishes as `registry.json`).
 */
export const FIRST_PARTY_CATALOG: Record<string, FirstPartyPlugin> = {
  'fyi.xnet.github': {
    capabilities: {
      secrets: ['GITHUB_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.github.com']
    },
    config: [
      {
        key: 'GITHUB_TOKEN',
        label: 'GitHub token',
        kind: 'secret',
        required: true,
        placeholder: 'ghp_…',
        help: 'A fine-grained personal access token with read access to issues and pull requests.'
      },
      {
        key: 'owner',
        label: 'Repository owner',
        kind: 'text',
        required: true,
        placeholder: 'acme'
      },
      {
        key: 'repo',
        label: 'Repository name',
        kind: 'text',
        required: true,
        placeholder: 'widgets'
      }
    ]
  },
  'fyi.xnet.notion': {
    capabilities: {
      secrets: ['NOTION_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.notion.com']
    },
    config: [
      {
        key: 'NOTION_TOKEN',
        label: 'Notion integration token',
        kind: 'secret',
        required: true,
        placeholder: 'ntn_…',
        help: 'Create an internal integration at notion.so/my-integrations and share pages with it.'
      }
    ]
  },
  'fyi.xnet.airtable': {
    capabilities: {
      secrets: ['AIRTABLE_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.airtable.com']
    },
    config: [
      {
        key: 'AIRTABLE_TOKEN',
        label: 'Airtable personal access token',
        kind: 'secret',
        required: true,
        placeholder: 'pat…'
      },
      {
        key: 'baseId',
        label: 'Base id',
        kind: 'text',
        required: true,
        placeholder: 'app…'
      },
      {
        key: 'tableId',
        label: 'Table id or name',
        kind: 'text',
        required: true,
        placeholder: 'tbl… or "Tasks"'
      }
    ]
  },
  'fyi.xnet.linear': {
    capabilities: {
      secrets: ['LINEAR_API_KEY'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.linear.app']
    },
    config: [
      {
        key: 'LINEAR_API_KEY',
        label: 'Linear API key',
        kind: 'secret',
        required: true,
        placeholder: 'lin_api_…',
        help: 'A personal API key from Linear → Settings → API.'
      }
    ]
  },
  'fyi.xnet.slack-connector': {
    capabilities: {
      secrets: ['SLACK_USER_TOKEN'],
      schemaWrite: [CHANNEL_SCHEMA, CHAT_MESSAGE_SCHEMA],
      network: ['slack.com']
    },
    config: [
      {
        key: 'SLACK_USER_TOKEN',
        label: 'Slack user token',
        kind: 'secret',
        required: true,
        placeholder: 'xoxp-…',
        help: 'A user token with channels:history and channels:read scopes.'
      }
    ]
  },
  'fyi.xnet.rss': {
    capabilities: {
      schemaWrite: [FEED_ITEM_SCHEMA]
    },
    configNote: 'The feed host is granted network access when the sync runs.',
    config: [
      {
        key: 'feedUrl',
        label: 'Feed URL',
        kind: 'text',
        required: true,
        placeholder: 'https://example.com/feed.xml'
      }
    ]
  },
  'fyi.xnet.webhook-inbox': {
    capabilities: {},
    configNote:
      'Incoming webhooks are received by your hub at /hooks/<token>; tokens are issued per workspace.'
  },
  'fyi.xnet.webhook-out': {
    capabilities: {},
    configNote: 'The target host is granted network access when events dispatch.',
    config: [
      {
        key: 'url',
        label: 'Webhook URL',
        kind: 'text',
        required: true,
        placeholder: 'https://hooks.example.com/…',
        help: 'Events POST here as JSON — bridges Zapier, Make, n8n, and IFTTT.'
      }
    ]
  },
  'fyi.xnet.discord': {
    capabilities: {
      secrets: ['DISCORD_WEBHOOK_URL'],
      network: ['discord.com']
    },
    config: [
      {
        key: 'DISCORD_WEBHOOK_URL',
        label: 'Discord webhook URL',
        kind: 'secret',
        required: true,
        placeholder: 'https://discord.com/api/webhooks/…',
        help: 'Channel settings → Integrations → Webhooks → New webhook.'
      }
    ]
  },
  'fyi.xnet.telegram': {
    capabilities: {
      secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
      network: ['api.telegram.org']
    },
    config: [
      {
        key: 'TELEGRAM_BOT_TOKEN',
        label: 'Bot token',
        kind: 'secret',
        required: true,
        placeholder: '123456:ABC-…',
        help: 'From @BotFather.'
      },
      {
        key: 'TELEGRAM_CHAT_ID',
        label: 'Chat id',
        kind: 'secret',
        required: true,
        placeholder: '-100…'
      }
    ]
  },
  'fyi.xnet.email': {
    capabilities: {
      secrets: ['RESEND_API_KEY'],
      network: ['api.resend.com']
    },
    config: [
      {
        key: 'RESEND_API_KEY',
        label: 'Resend API key',
        kind: 'secret',
        required: true,
        placeholder: 're_…'
      }
    ]
  },
  'fyi.xnet.stripe': {
    capabilities: {
      secrets: ['STRIPE_WEBHOOK_SECRET']
    },
    configNote: 'Your hub verifies Stripe-Signature on /integrations/stripe/webhook.',
    config: [
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Stripe webhook signing secret',
        kind: 'secret',
        required: true,
        placeholder: 'whsec_…',
        help: 'From the webhook endpoint in the Stripe dashboard.'
      }
    ]
  },
  'fyi.xnet.sentry': {
    capabilities: {
      secrets: ['SENTRY_WEBHOOK_SECRET']
    },
    configNote: 'Your hub verifies sentry-hook-signature on /integrations/sentry/webhook.',
    config: [
      {
        key: 'SENTRY_WEBHOOK_SECRET',
        label: 'Sentry client secret',
        kind: 'secret',
        required: true,
        help: 'From the internal integration in Sentry → Settings → Developer Settings.'
      }
    ]
  },
  'fyi.xnet.pagerduty': {
    capabilities: {
      secrets: ['PAGERDUTY_WEBHOOK_SECRET']
    },
    configNote: 'Your hub verifies x-pagerduty-signature on /integrations/pagerduty/webhook.',
    config: [
      {
        key: 'PAGERDUTY_WEBHOOK_SECRET',
        label: 'PagerDuty webhook secret',
        kind: 'secret',
        required: true
      }
    ]
  },
  'fyi.xnet.unreal': {
    capabilities: {
      secrets: ['UNREAL_*', 'EPIC_*'],
      schemaWrite: [GAME_EVENT_SCHEMA]
    },
    configNote: "The events API host is granted network access when the title's sync runs.",
    config: [
      {
        key: 'apiBaseUrl',
        label: 'Events API base URL',
        kind: 'text',
        required: true,
        placeholder: 'https://events.mygame.example',
        help: "Base URL of your title's events API."
      }
    ]
  }
}

/** The catalog record for a listing, when the app can install it. */
export function firstPartyRecord(id: string): FirstPartyPlugin | undefined {
  return FIRST_PARTY_CATALOG[id]
}

/**
 * Build an installable manifest for a first-party listing: display fields from
 * the registry entry, capability grant from the catalog. Pure data — no
 * activate/deactivate — so it round-trips through the registry's node store.
 */
export function firstPartyManifest(listing: MarketplaceListing): XNetExtension | null {
  const record = FIRST_PARTY_CATALOG[listing.id]
  if (!record) return null
  return {
    id: listing.id,
    name: listing.name,
    version: listing.version,
    ...(listing.description ? { description: listing.description } : {}),
    ...(listing.author ? { author: listing.author } : {}),
    ...(listing.license ? { license: listing.license } : {}),
    ...(listing.platforms ? { platforms: listing.platforms } : {}),
    capabilities: record.capabilities
  } as XNetExtension
}
