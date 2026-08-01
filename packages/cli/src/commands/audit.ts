/**
 * `xnet audit verify <bundle>` — check an agent audit receipt offline
 * (exploration 0416).
 *
 * The point of this command is that it needs nothing: no hub, no store, no
 * account, no network. Hand someone a bundle and they can establish, on their
 * own machine, that the agent's changes are signed and unbroken and that every
 * high-risk action carries the operator's own signature. That is the claim the
 * whole accountability lane rests on, so this command must be free to run and
 * must exit non-zero the moment anything fails to verify.
 */

import { readFile } from 'node:fs/promises'
import { parseAgentAuditBundle, verifyAgentAudit, type AuditVerifyReport } from '@xnetjs/data'
import { Command } from 'commander'

export type AuditVerifyOptions = {
  json: boolean
}

/** Read and verify a bundle from disk. */
export async function runAuditVerify(path: string): Promise<AuditVerifyReport> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read bundle at ${path}: ${(err as Error).message}`)
  }
  // A bundle that will not parse is unreadable, not empty — let it throw.
  return verifyAgentAudit(parseAgentAuditBundle(raw))
}

function printReport(path: string, report: AuditVerifyReport): void {
  const { actions, changes, approvals, gatedActions } = report.checked

  if (report.ok) {
    console.log(`✓ ${path} verifies`)
    console.log(
      `  ${actions} action(s), ${changes} signed change(s), ${approvals} approval(s), ` +
        `${gatedActions} requiring an operator signature`
    )
    return
  }

  console.error(`✗ ${path} FAILED verification — ${report.problems.length} problem(s)`)
  for (const problem of report.problems) {
    console.error(`  [${problem.code}] ${problem.message}`)
  }
  console.error(`\n  checked: ${actions} action(s), ${changes} change(s), ${approvals} approval(s)`)
}

export function registerAuditCommand(program: Command): void {
  const audit = program
    .command('audit')
    .description('Verify exported agent audit bundles (exploration 0416)')

  audit
    .command('verify <bundle>')
    .description('Verify an agent audit bundle offline — signatures, chain, and approvals')
    .option('--json', 'Emit the full report as JSON', false)
    .action(async (bundlePath: string, options: AuditVerifyOptions) => {
      const report = await runAuditVerify(bundlePath)

      if (options.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        printReport(bundlePath, report)
      }

      if (!report.ok) {
        process.exitCode = 1
      }
    })
}
