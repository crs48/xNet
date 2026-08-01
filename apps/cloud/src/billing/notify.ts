/**
 * xNet Cloud — lifecycle email for the non-payment funnel (exploration 0418).
 *
 * Stripe emails about the *money* — the card that failed, the retry that is
 * coming. Only we can say what happened to the customer's *hub*: that it went
 * read-only, that it went cold, that its cloud replica has a deletion date. Until
 * this module existed there was no mail transport in the repo at all, which meant
 * the lifecycle could reach `delete` having never once told the person whose data
 * it was.
 *
 * Copy rules, because these land in a bad moment:
 *
 *  - **Lead with what is still true.** "Your data is safe" comes before
 *    "writes are paused". A billing email that reads like a data-loss email
 *    causes a panic the situation does not warrant.
 *  - **Name the exact date**, never "soon" or "shortly".
 *  - **One action, one link.** Every message ends at the billing portal, except
 *    the final notice, which also says how to get the data out.
 *  - **No dark patterns.** No countdown urgency, no guilt, no "we'll miss you".
 *    This one is no longer kept by memory: the `manufactured urgency` rule in
 *    `scripts/check-humane-patterns.mjs` fails the build on scarcity and
 *    act-now identifiers, and the `calm-no-manufactured-urgency` claim in
 *    `packages/telemetry/test/charter-claims-ledger.test.ts` pins the rule so it
 *    cannot be quietly narrowed (exploration 0429). Dunning is where urgency
 *    converts best, which is exactly why the gate has to reach this file.
 */

import type { BillingNotifier } from '../reconcile/billing-driver'
import type { TenantRecord } from '../registry'

/** The transport. One method, so any provider (or a test spy) satisfies it. */
export interface MailSender {
  send(msg: { to: string; subject: string; text: string }): Promise<void>
}

export interface EmailNotifierConfig {
  /** Where "manage billing" points — the control plane's dashboard. */
  dashboardUrl: string
  /** Reads a tenant's email; the tenant record holds a billing user id, not an address. */
  emailFor(tenant: TenantRecord): Promise<string | null>
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Format a deadline the way a human reads one: an absolute, unambiguous date. */
export function formatDeadline(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/** Whole days from `fromMs` to `toMs`, floored at 0 — for "you have N days". */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS))
}

const sign = (body: string): string =>
  `${body}\n\n— xNet\n\nYour data is local-first: a copy lives on your own devices, and you can\nself-host a hub at any time. https://xnet.fyi/docs/guides/hub\n`

/**
 * Build the five lifecycle messages. Exported separately from the notifier so
 * the copy is testable without a transport — the wording is the feature here.
 */
export const LIFECYCLE_MAIL = {
  readOnly: (dashboardUrl: string) => ({
    subject: 'Your xNet hub is read-only — a payment did not go through',
    text: sign(
      `Your data is safe. Every note, file and record on your hub is still there and\n` +
        `still readable, and the copy on your own devices is untouched.\n\n` +
        `What changed: your hub has stopped accepting new writes because we could not\n` +
        `take payment. Nothing has been deleted, and nothing will be without us telling\n` +
        `you first.\n\n` +
        `Updating your card restores writes within the hour:\n${dashboardUrl}`
    )
  }),

  suspended: (dashboardUrl: string, deleteAfterMs: number) => ({
    subject: 'Your xNet hub has been paused',
    text: sign(
      `Your hub is no longer running, and your data is kept in encrypted cloud storage.\n\n` +
        `Everything is recoverable until ${formatDeadline(deleteAfterMs)}. Re-subscribing\n` +
        `before then brings your hub back with all of it intact — there is no separate\n` +
        `restore step and nothing for you to do beyond paying.\n\n` +
        `${dashboardUrl}`
    )
  }),

  finalNotice: (dashboardUrl: string, deletesAtMs: number, nowMs: number) => ({
    subject: `Your xNet cloud data will be deleted on ${formatDeadline(deletesAtMs)}`,
    text: sign(
      `This is the last message we will send before deleting the cloud copy of your\n` +
        `data on ${formatDeadline(deletesAtMs)} — ${daysBetween(nowMs, deletesAtMs)} days from now.\n\n` +
        `To keep it, re-subscribe: ${dashboardUrl}\n\n` +
        `To take it with you instead, open xNet on a device you have used before and\n` +
        `export a portable copy from Settings. The copy on your devices is yours and is\n` +
        `not affected by this deletion — only the cloud replica is.`
    )
  }),

  deleted: () => ({
    subject: 'Your xNet cloud data has been deleted',
    text: sign(
      `The cloud copy of your data has been deleted, as scheduled. We cannot recover\n` +
        `it — it was encrypted with your key, not ours.\n\n` +
        `If you still have xNet on a device you used before, your data is on that\n` +
        `device. You can keep using it offline, self-host a hub, or subscribe again to\n` +
        `sync it to a new one.`
    )
  }),

  recovered: (dashboardUrl: string) => ({
    subject: 'Your xNet hub is back to normal',
    text: sign(
      `Your payment went through and your hub is fully active again — writes restored,\n` +
        `sync running, nothing lost.\n\nThanks for sticking with us.\n\n${dashboardUrl}`
    )
  })
} as const

/**
 * A {@link BillingNotifier} backed by a mail transport.
 *
 * A tenant with no resolvable email address is a **hard failure**, not a silent
 * skip: the driver treats a failed notice as "do not apply this step", which is
 * exactly right — we should not degrade or delete an account we have no way to
 * warn. An address we cannot find is the same problem as a mail server that is
 * down, and it must fail the same way.
 */
export function emailNotifier(mail: MailSender, config: EmailNotifierConfig): BillingNotifier {
  const to = async (tenant: TenantRecord): Promise<string> => {
    const address = await config.emailFor(tenant)
    if (!address) {
      throw new Error(
        `No email address for tenant ${tenant.tenantId} — refusing to act unannounced`
      )
    }
    return address
  }
  const send = async (tenant: TenantRecord, msg: { subject: string; text: string }) => {
    await mail.send({ to: await to(tenant), ...msg })
  }

  return {
    // Stripe already emails on the failed charge itself; a second message saying
    // the same thing in the same hour trains people to ignore both. Grace is the
    // one transition we deliberately stay quiet for.
    graceOpened: async () => undefined,
    readOnly: (t) => send(t, LIFECYCLE_MAIL.readOnly(config.dashboardUrl)),
    suspended: (t, deleteAfterMs) =>
      send(t, LIFECYCLE_MAIL.suspended(config.dashboardUrl, deleteAfterMs)),
    finalNotice: (t, deletesAtMs) =>
      send(t, LIFECYCLE_MAIL.finalNotice(config.dashboardUrl, deletesAtMs, Date.now())),
    deleted: (t) => send(t, LIFECYCLE_MAIL.deleted()),
    recovered: (t) => send(t, LIFECYCLE_MAIL.recovered(config.dashboardUrl))
  }
}

/**
 * Resend transport. Chosen for volume, not preference: lifecycle mail at this
 * scale is a few messages a week, and their free tier covers it with one
 * dependency-free HTTP call.
 */
export function resendSender(apiKey: string, from: string): MailSender {
  return {
    async send({ to, subject, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ from, to, subject, text })
      })
      if (!res.ok) {
        // Loud, typed-enough failure: the driver turns this into "step not
        // applied", which is the behavior we want over a swallowed error.
        throw new Error(`Resend rejected the message: ${res.status} ${await res.text()}`)
      }
    }
  }
}

/**
 * Build the notifier from the environment, or `null` when no transport is
 * configured. A `null` notifier is a deliberate, visible choice at the call site
 * (dev and self-hosted control planes have no mail) — never a silent default.
 */
export function mailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): MailSender | null {
  if (!env.RESEND_API_KEY) return null
  return resendSender(env.RESEND_API_KEY, env.XNET_CLOUD_MAIL_FROM ?? 'xNet <billing@xnet.fyi>')
}
