/**
 * Lifecycle email (exploration 0418).
 *
 * The copy is the feature, so it is asserted like one — and the sharpest test
 * here is that a tenant with no address makes the notifier THROW, because the
 * driver reads a throw as "do not apply this step". Silently skipping the notice
 * would let the funnel delete data unannounced, which is the exact failure this
 * whole module exists to prevent.
 */

import type { TenantRecord } from '../registry'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it, vi } from 'vitest'
import {
  daysBetween,
  emailNotifier,
  formatDeadline,
  LIFECYCLE_MAIL,
  mailSenderFromEnv,
  type MailSender
} from './notify'

const NOW = Date.UTC(2026, 7, 1)
const DASH = 'https://cloud.xnet.fyi/dashboard'

const tenant = (): TenantRecord => ({
  tenantId: 'acme',
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: 'user_1',
  did: 'did:key:z1',
  hubUrl: 'https://acme.example',
  substrateRef: 'run/acme',
  region: 'us-central1',
  targetVersion: '1.0.0',
  createdAt: NOW,
  lastActiveMs: NOW,
  dataTier: 'hot'
})

const spySender = () => {
  const sent: { to: string; subject: string; text: string }[] = []
  const mail: MailSender = {
    send: async (m) => {
      sent.push(m)
    }
  }
  return { sent, mail }
}

describe('formatDeadline / daysBetween', () => {
  it('renders an absolute date, never a relative one', () => {
    expect(formatDeadline(Date.UTC(2026, 8, 15))).toBe('15 September 2026')
  })

  it('floors day counts and never goes negative', () => {
    expect(daysBetween(NOW, NOW + 7 * 86_400_000)).toBe(7)
    expect(daysBetween(NOW, NOW + 7.9 * 86_400_000)).toBe(7)
    expect(daysBetween(NOW, NOW - 5 * 86_400_000)).toBe(0)
  })
})

describe('LIFECYCLE_MAIL copy', () => {
  it('read-only leads with reassurance, not with the failure', () => {
    const m = LIFECYCLE_MAIL.readOnly(DASH)
    expect(m.text.indexOf('Your data is safe')).toBeLessThan(m.text.indexOf('stopped accepting'))
    expect(m.text).toContain(DASH)
  })

  it('read-only promises no silent deletion', () => {
    expect(LIFECYCLE_MAIL.readOnly(DASH).text).toMatch(/nothing will be without us telling/i)
  })

  it('suspended names the exact recovery deadline', () => {
    const m = LIFECYCLE_MAIL.suspended(DASH, Date.UTC(2026, 8, 15))
    expect(m.text).toContain('15 September 2026')
    expect(m.text).not.toMatch(/\bsoon\b|\bshortly\b/i)
  })

  it('the final notice puts the date in the SUBJECT — it may be the only line read', () => {
    const m = LIFECYCLE_MAIL.finalNotice(DASH, Date.UTC(2026, 8, 15), NOW)
    expect(m.subject).toContain('15 September 2026')
  })

  it('the final notice explains how to leave with the data, not just how to pay', () => {
    const m = LIFECYCLE_MAIL.finalNotice(DASH, NOW + 7 * 86_400_000, NOW)
    expect(m.text).toMatch(/export/i)
    expect(m.text).toMatch(/only the cloud replica/i)
  })

  it('the deletion notice is honest that we cannot recover it', () => {
    expect(LIFECYCLE_MAIL.deleted().text).toMatch(/cannot recover/i)
  })

  it('every message repeats that self-hosting is available (Charter §6 BATNA)', () => {
    const all = [
      LIFECYCLE_MAIL.readOnly(DASH),
      LIFECYCLE_MAIL.suspended(DASH, NOW),
      LIFECYCLE_MAIL.finalNotice(DASH, NOW, NOW),
      LIFECYCLE_MAIL.deleted(),
      LIFECYCLE_MAIL.recovered(DASH)
    ]
    for (const m of all) expect(m.text).toMatch(/self-host/i)
  })

  it('uses no countdown urgency or guilt', () => {
    const all = Object.values(LIFECYCLE_MAIL).map((f) =>
      // Heterogeneous factories (0–3 params); extra args are ignored in JS, so a
      // single call shape covers all five and keeps the sweep exhaustive.
      (f as (...a: unknown[]) => { text: string })(DASH, NOW, NOW).text.toLowerCase()
    )
    for (const text of all) {
      expect(text).not.toMatch(/act now|hurry|last chance|we'll miss you|don't lose/i)
    }
  })
})

describe('emailNotifier', () => {
  it('sends to the resolved address', async () => {
    const { sent, mail } = spySender()
    const n = emailNotifier(mail, { dashboardUrl: DASH, emailFor: async () => 'a@b.com' })
    await n.readOnly(tenant())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('a@b.com')
    expect(sent[0]?.subject).toMatch(/read-only/i)
  })

  it('THROWS when a tenant has no address — never degrade an account we cannot warn', async () => {
    const { mail } = spySender()
    const n = emailNotifier(mail, { dashboardUrl: DASH, emailFor: async () => null })
    await expect(n.readOnly(tenant())).rejects.toThrow(/refusing to act unannounced/)
  })

  it('stays silent on grace — Stripe already emailed about the charge', async () => {
    const { sent, mail } = spySender()
    const n = emailNotifier(mail, { dashboardUrl: DASH, emailFor: async () => 'a@b.com' })
    await n.graceOpened(tenant(), NOW)
    expect(sent).toHaveLength(0)
  })

  it('covers every remaining transition', async () => {
    const { sent, mail } = spySender()
    const n = emailNotifier(mail, { dashboardUrl: DASH, emailFor: async () => 'a@b.com' })
    const t = tenant()
    await n.readOnly(t)
    await n.suspended(t, NOW)
    await n.finalNotice(t, NOW)
    await n.deleted(t)
    await n.recovered(t)
    expect(sent).toHaveLength(5)
  })
})

describe('mailSenderFromEnv', () => {
  it('is null without an API key — a missing transport is visible, not defaulted', () => {
    expect(mailSenderFromEnv({})).toBeNull()
  })

  it('builds a sender when configured', () => {
    expect(mailSenderFromEnv({ RESEND_API_KEY: 're_x' })).not.toBeNull()
  })

  it('raises on a rejected send rather than swallowing it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'domain not verified'
    })
    vi.stubGlobal('fetch', fetchMock)
    const sender = mailSenderFromEnv({ RESEND_API_KEY: 're_x' })
    await expect(sender?.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow(
      /422 domain not verified/
    )
    vi.unstubAllGlobals()
  })
})
